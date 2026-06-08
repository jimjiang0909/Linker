/**
 * Chat Module Routes
 * GET /api/conversations - Get conversation list
 * GET /api/conversations/:id/messages - Get message history (paginated)
 * POST /api/conversations/:id/messages - Send message (HTTP fallback)
 * POST /api/conversations/:id/end - End conversation
 * POST /api/conversations/:id/report - Report
 */
import { Router } from 'express';
import { authenticate } from '../middlewares/auth.js';
import prisma from '../lib/prisma.js';
import { sendMessage, getMessages, endConversation } from '../services/chatService.js';
import { createReport } from '../services/reportService.js';
import { emitToUser } from '../websocket/index.js';

const router = Router();

/**
 * GET /api/conversations
 * Get current user's conversation list (paginated)
 * Requires authentication
 *
 * Query params:
 * - page: page number (starting from 1, default 1)
 * - pageSize: items per page (default 20, max 50)
 *
 * Returns all Conversations the user participates in, including other party's basic info and last message
 */
router.get('/', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize) || 20));
    const skip = (page - 1) * pageSize;

    // Get total count
    const total = await prisma.conversation.count({
      where: {
        OR: [{ userAId: userId }, { userBId: userId }],
      },
    });

    // Query conversations with pagination
    const conversations = await prisma.conversation.findMany({
      where: {
        OR: [{ userAId: userId }, { userBId: userId }],
      },
      include: {
        userA: {
          include: {
            profile: true,
          },
        },
        userB: {
          include: {
            profile: true,
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    });

    // Also count unread messages for each conversation
    const data = await Promise.all(conversations.map(async (conv) => {
      const isUserA = conv.userAId === userId;
      const otherUser = isUserA ? conv.userB : conv.userA;
      const otherProfile = otherUser.profile;
      const lastMessage = conv.messages[0] || null;

      // Count unread messages from the other user
      const unreadCount = await prisma.message.count({
        where: {
          conversationId: conv.id,
          senderId: { not: userId },
          isRead: false,
        },
      });

      return {
        id: conv.id,
        status: conv.status,
        createdAt: conv.createdAt,
        endedAt: conv.endedAt,
        unreadCount,
        otherUser: otherProfile
          ? {
              id: otherUser.id,
              name: otherProfile.name,
              occupation: otherProfile.occupation,
              city: otherProfile.city,
            }
          : null,
        lastMessage: lastMessage
          ? {
              id: lastMessage.id,
              content: lastMessage.type === 'system' ? '[System message]' : lastMessage.content,
              type: lastMessage.type,
              senderId: lastMessage.senderId,
              createdAt: lastMessage.createdAt,
              isRead: lastMessage.isRead,
            }
          : null,
      };
    }));

    // 计算全局未读总数（不受分页影响）
    const totalUnreadCount = await prisma.message.count({
      where: {
        conversation: {
          OR: [{ userAId: userId }, { userBId: userId }],
          status: 'active',
        },
        senderId: { not: userId },
        isRead: false,
      },
    });

    res.json({
      code: 'SUCCESS',
      message: 'Conversations retrieved successfully',
      data: {
        conversations: data,
        total,
        page,
        pageSize,
        totalUnreadCount,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/conversations/:id/messages
 * Get message history (paginated)
 * Requires authentication, only participants can access
 *
 * Query params:
 * - page: page number (starting from 1, default 1)
 * - pageSize: items per page (default 20, max 50)
 */
router.get('/:id/messages', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const conversationId = req.params.id;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize) || 20));
    const before = req.query.before || undefined;

    const result = await getMessages(userId, conversationId, { page, pageSize, before });

    res.json({
      code: 'SUCCESS',
      message: 'Messages retrieved successfully',
      data: {
        messages: result.messages,
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/conversations/:id/messages
 * Send message (HTTP fallback)
 * Requires authentication, only participants can send
 *
 * Body:
 * - content: message content (required, non-empty, ≤1000 chars)
 */
router.post('/:id/messages', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const conversationId = req.params.id;
    const { content } = req.body;

    const message = await sendMessage(userId, conversationId, content);

    // Push to the other participant via WebSocket
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { userAId: true, userBId: true },
    });
    if (conversation) {
      const recipientId = conversation.userAId === userId
        ? conversation.userBId
        : conversation.userAId;
      emitToUser(recipientId, 'message:new', { message });
    }

    res.status(201).json({
      code: 'SUCCESS',
      message: 'Message sent successfully',
      data: message,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/conversations/:id/read
 * Mark messages as read
 * Requires authentication, only participants can operate
 *
 * Body (optional):
 * - lastReadMessageId: mark all messages up to this ID as read
 *   If not provided, marks all messages from the other user as read
 */
router.post('/:id/read', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const conversationId = req.params.id;
    const { lastReadMessageId } = req.body || {};

    // Verify conversation exists and user is participant
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) {
      return res.status(404).json({
        code: 'CONVERSATION_NOT_FOUND',
        message: 'Conversation not found',
        details: {},
      });
    }

    if (conversation.userAId !== userId && conversation.userBId !== userId) {
      return res.status(403).json({
        code: 'NOT_PARTICIPANT',
        message: 'You are not a participant of this conversation',
        details: {},
      });
    }

    // Build where clause: mark messages from the OTHER user as read
    const whereClause = {
      conversationId,
      senderId: { not: userId },
      isRead: false,
    };

    // If lastReadMessageId provided, only mark messages up to that point
    if (lastReadMessageId) {
      const targetMessage = await prisma.message.findUnique({
        where: { id: lastReadMessageId },
        select: { createdAt: true },
      });

      if (targetMessage) {
        whereClause.createdAt = { lte: targetMessage.createdAt };
      }
    }

    const result = await prisma.message.updateMany({
      where: whereClause,
      data: { isRead: true },
    });

    res.json({
      code: 'SUCCESS',
      message: 'Messages marked as read',
      data: { markedCount: result.count },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/conversations/:id/end
 * End conversation
 * Requires authentication, only participants can operate
 */
router.post('/:id/end', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const conversationId = req.params.id;

    const conversation = await endConversation(userId, conversationId);

    res.json({
      code: 'SUCCESS',
      message: 'Conversation has ended',
      data: {
        id: conversation.id,
        status: conversation.status,
        endedAt: conversation.endedAt,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/conversations/:id/report
 * Report a message in conversation
 * Requires authentication, only participants can operate
 * Uses new Report system with deduplication and auto-suspension
 *
 * Body:
 * - messageId: reported message ID (required)
 * - reason: report reason (required, max 500 chars)
 */
router.post('/:id/report', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const conversationId = req.params.id;
    const { messageId, reason } = req.body;

    if (!messageId) {
      return res.status(400).json({
        code: 'MISSING_MESSAGE_ID',
        message: 'Please specify the reported message',
        details: {},
      });
    }

    if (!reason || reason.trim().length === 0) {
      return res.status(400).json({
        code: 'MISSING_REASON',
        message: 'Please provide a report reason',
        details: {},
      });
    }

    if (reason.length > 500) {
      return res.status(400).json({
        code: 'REASON_TOO_LONG',
        message: 'Report reason must not exceed 500 characters',
        details: {},
      });
    }

    const report = await createReport(userId, conversationId, messageId, reason.trim());

    res.status(201).json({
      code: 'SUCCESS',
      message: 'Report submitted. We will review it within 24 hours.',
      data: report,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
