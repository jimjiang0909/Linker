/**
 * WebSocket Real-time Communication Module
 * Based on Socket.IO, provides:
 * - JWT authentication handshake
 * - message:send event handling (receive, store, forward)
 * - message:new event push (delivered within 3 seconds)
 * - match:success event push (match success notification)
 * - recommendation:new event push (daily recommendation notification)
 * - Offline message cache (max 500, delivered in chronological order on reconnect)
 */
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { sendMessage } from '../services/chatService.js';
import prisma from '../lib/prisma.js';

// Max offline message count per user
const MAX_OFFLINE_MESSAGES = 500;

// WebSocket message rate limit: max messages per window
const WS_RATE_LIMIT_MAX = 30;
const WS_RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute

// Per-socket rate limit tracking
const socketRateLimits = new Map();

// Online users map: userId -> Set<socketId>
const onlineUsers = new Map();

// Socket.IO server instance
let io = null;

/**
 * Initialize WebSocket server
 * @param {import('http').Server} httpServer - HTTP server instance
 * @param {object} [options] - Configuration options
 * @param {object} [options.deps] - Dependency injection (for testing)
 * @param {function} [options.deps.verifyToken] - JWT verification function
 * @param {function} [options.deps.sendMessageFn] - Send message function
 * @returns {import('socket.io').Server} Socket.IO server instance
 */
export function initWebSocket(httpServer, options = {}) {
  const deps = options.deps || {};
  const verifyToken = deps.verifyToken || defaultVerifyToken;
  const sendMessageFn = deps.sendMessageFn || sendMessage;

  io = new Server(httpServer, {
    cors: {
      origin: process.env.WS_CORS_ORIGIN || '*',
      methods: ['GET', 'POST'],
    },
    transports: ['websocket', 'polling'],
    pingInterval: 30000, // FR-14: Heartbeat every 30 seconds
    pingTimeout: 10000,  // FR-14: 10 second timeout
  });

  // JWT authentication middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');

    if (!token) {
      return next(new Error('UNAUTHORIZED: Missing authentication token'));
    }

    try {
      const decoded = verifyToken(token);
      socket.userId = decoded.userId || decoded.id || decoded.sub;
      if (!socket.userId) {
        return next(new Error('INVALID_TOKEN: Token missing user identifier'));
      }
      next();
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return next(new Error('TOKEN_EXPIRED: Authentication token has expired'));
      }
      return next(new Error('INVALID_TOKEN: Invalid authentication token'));
    }
  });

  // Connection event handling
  io.on('connection', (socket) => {
    const userId = socket.userId;

    // Register online user
    registerOnlineUser(userId, socket.id);

    // Deliver offline messages from database
    deliverOfflineMessages(userId, socket);

    // Handle message:send event
    socket.on('message:send', async (data, ack) => {
      try {
        const { conversationId, content } = data || {};

        if (!conversationId || !content) {
          const error = { code: 'INVALID_PARAMS', message: 'Missing conversationId or content' };
          if (typeof ack === 'function') ack({ error });
          return;
        }

        // Rate limit check per socket
        const now = Date.now();
        let rl = socketRateLimits.get(socket.id);
        if (!rl || now - rl.windowStart > WS_RATE_LIMIT_WINDOW_MS) {
          rl = { windowStart: now, count: 0 };
          socketRateLimits.set(socket.id, rl);
        }
        rl.count++;
        if (rl.count > WS_RATE_LIMIT_MAX) {
          const error = { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many messages. Please slow down.' };
          if (typeof ack === 'function') ack({ error });
          return;
        }

        // Check if user is suspended before allowing message send
        const db = deps.prismaClient || prisma;
        const user = await db.user.findUnique({
          where: { id: userId },
          select: { status: true },
        });

        if (user && user.status === 'suspended') {
          const error = { code: 'ACCOUNT_SUSPENDED', message: 'Your account has been suspended' };
          if (typeof ack === 'function') ack({ error });
          socket.disconnect(true);
          return;
        }

        // Call chatService to store message
        const message = await sendMessageFn(userId, conversationId, content);

        // Acknowledge successful send
        if (typeof ack === 'function') {
          ack({ success: true, message });
        }

        // Query conversation to get the other user's ID
        const conversation = await db.conversation.findUnique({
          where: { id: conversationId },
          select: { userAId: true, userBId: true },
        });

        if (conversation) {
          const recipientId = conversation.userAId === userId
            ? conversation.userBId
            : conversation.userAId;

          // Forward message to recipient (message:new event)
          emitToUser(recipientId, 'message:new', { message });
        }
      } catch (err) {
        const error = {
          code: err.code || 'SEND_FAILED',
          message: err.message || 'Failed to send message',
        };
        if (typeof ack === 'function') ack({ error });
      }
    });

    // Handle typing indicators
    socket.on('typing:start', (data) => {
      const { conversationId } = data || {};
      if (!conversationId) return;

      const db = deps.prismaClient || prisma;
      db.conversation.findUnique({
        where: { id: conversationId },
        select: { userAId: true, userBId: true },
      }).then((conversation) => {
        if (conversation && (conversation.userAId === userId || conversation.userBId === userId)) {
          const recipientId = conversation.userAId === userId
            ? conversation.userBId
            : conversation.userAId;
          emitToUser(recipientId, 'typing:start', { conversationId, userId });
        }
      }).catch(() => {});
    });

    socket.on('typing:stop', (data) => {
      const { conversationId } = data || {};
      if (!conversationId) return;

      const db = deps.prismaClient || prisma;
      db.conversation.findUnique({
        where: { id: conversationId },
        select: { userAId: true, userBId: true },
      }).then((conversation) => {
        if (conversation && (conversation.userAId === userId || conversation.userBId === userId)) {
          const recipientId = conversation.userAId === userId
            ? conversation.userBId
            : conversation.userAId;
          emitToUser(recipientId, 'typing:stop', { conversationId, userId });
        }
      }).catch(() => {});
    });

    // Disconnect
    socket.on('disconnect', () => {
      unregisterOnlineUser(userId, socket.id);
      socketRateLimits.delete(socket.id);
    });
  });

  return io;
}

/**
 * Default JWT verification function
 * @param {string} token - JWT token
 * @returns {object} Decoded payload
 */
function defaultVerifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

/**
 * Register online user
 * @param {string} userId - User ID
 * @param {string} socketId - Socket ID
 */
export function registerOnlineUser(userId, socketId) {
  if (!onlineUsers.has(userId)) {
    onlineUsers.set(userId, new Set());
  }
  onlineUsers.get(userId).add(socketId);
}

/**
 * Unregister online user
 * @param {string} userId - User ID
 * @param {string} socketId - Socket ID
 */
export function unregisterOnlineUser(userId, socketId) {
  const sockets = onlineUsers.get(userId);
  if (sockets) {
    sockets.delete(socketId);
    if (sockets.size === 0) {
      onlineUsers.delete(userId);
    }
  }
}

/**
 * Check if user is online
 * @param {string} userId - User ID
 * @returns {boolean}
 */
export function isUserOnline(userId) {
  const sockets = onlineUsers.get(userId);
  return sockets !== undefined && sockets.size > 0;
}

/**
 * Emit event to specified user
 * If user is online, push directly; if offline, persist to database
 * @param {string} userId - Target user ID
 * @param {string} event - Event name
 * @param {object} data - Event data
 */
export function emitToUser(userId, event, data) {
  if (!userId) return;

  if (isUserOnline(userId)) {
    // User online, push directly
    const sockets = onlineUsers.get(userId);
    if (io && sockets) {
      for (const socketId of sockets) {
        io.to(socketId).emit(event, data);
      }
    }
  } else {
    // User offline, persist to database
    cacheOfflineMessage(userId, event, data);
  }
}

/**
 * Cache offline message to PostgreSQL
 * Keep max 500 messages per user, delete oldest when exceeded
 * @param {string} userId - User ID
 * @param {string} event - Event name
 * @param {object} data - Event data
 */
export async function cacheOfflineMessage(userId, event, data) {
  try {
    // Insert new offline message
    await prisma.offlineMessage.create({
      data: {
        userId,
        event,
        data,
      },
    });

    // Check count and trim if exceeding limit
    const count = await prisma.offlineMessage.count({ where: { userId } });
    if (count > MAX_OFFLINE_MESSAGES) {
      const excess = count - MAX_OFFLINE_MESSAGES;
      const oldMessages = await prisma.offlineMessage.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        take: excess,
        select: { id: true },
      });
      await prisma.offlineMessage.deleteMany({
        where: { id: { in: oldMessages.map((m) => m.id) } },
      });
    }
  } catch (error) {
    console.error('[WebSocket] Failed to cache offline message:', error.message);
  }
}

/**
 * Deliver offline messages from database to user (push in chronological order after reconnect)
 * Uses acknowledgement: only deletes messages after client confirms receipt
 * @param {string} userId - User ID
 * @param {import('socket.io').Socket} socket - Socket instance
 */
export async function deliverOfflineMessages(userId, socket) {
  try {
    const messages = await prisma.offlineMessage.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });

    if (messages.length === 0) return;

    // Send all offline messages as a batch with ack
    socket.emit('offline:batch', { messages: messages.map(m => ({ id: m.id, event: m.event, data: m.data })) }, async (ack) => {
      if (ack && ack.received) {
        // Client confirmed receipt, delete delivered messages
        await prisma.offlineMessage.deleteMany({
          where: { id: { in: messages.map(m => m.id) } },
        });
      }
    });
  } catch (error) {
    console.error('[WebSocket] Failed to deliver offline messages:', error.message);
  }
}

/**
 * Push match success notification to both parties
 * @param {string} userAId - User A ID
 * @param {string} userBId - User B ID
 * @param {string} conversationId - Conversation ID
 * @param {string} [matchId] - Match ID
 */
export function emitMatchSuccess(userAId, userBId, conversationId, matchId) {
  emitToUser(userAId, 'match:success', {
    matchId: matchId || null,
    conversationId,
    partnerId: userBId,
  });
  emitToUser(userBId, 'match:success', {
    matchId: matchId || null,
    conversationId,
    partnerId: userAId,
  });
}

/**
 * Push daily recommendation notification
 * @param {string} userId - User ID
 * @param {object} data - Recommendation data
 */
export function emitRecommendation(userId, data) {
  emitToUser(userId, 'recommendation:new', data);
}

/**
 * Push new message notification
 * @param {string} userId - Target user ID
 * @param {object} message - Message object
 */
export function emitNewMessage(userId, message) {
  emitToUser(userId, 'message:new', { message });
}

/**
 * Get Socket.IO server instance
 * @returns {import('socket.io').Server|null}
 */
export function getIO() {
  return io;
}

/**
 * Disconnect all sockets for a specific user
 * @param {string} userId - User ID
 */
export function disconnectUser(userId) {
  const sockets = onlineUsers.get(userId);
  if (io && sockets) {
    for (const socketId of sockets) {
      const socket = io.sockets.sockets.get(socketId);
      if (socket) {
        socket.disconnect(true);
      }
    }
  }
  onlineUsers.delete(userId);
}

/**
 * Get online user count
 * @returns {number}
 */
export function getOnlineUserCount() {
  return onlineUsers.size;
}

/**
 * Get offline message count for specified user
 * @param {string} userId - User ID
 * @returns {Promise<number>}
 */
export async function getOfflineMessageCount(userId) {
  return prisma.offlineMessage.count({ where: { userId } });
}

/**
 * Clear all state (for testing)
 */
export function resetState() {
  onlineUsers.clear();
  io = null;
}

export { MAX_OFFLINE_MESSAGES };
