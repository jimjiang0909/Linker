/**
 * Chat Service
 * Core business logic for basic chat functionality
 * - sendMessage: Send message (validate non-empty, length ≤1000, Conversation status active, user is participant)
 * - getMessages: Paginated message history
 * - endConversation: End conversation
 */
import prisma from '../lib/prisma.js';
import { AppError } from '../middlewares/errorHandler.js';

/**
 * Verify if user is a participant of the Conversation
 * @param {object} conversation - Conversation record
 * @param {string} userId - User ID
 * @returns {boolean}
 */
function isParticipant(conversation, userId) {
  return conversation.userAId === userId || conversation.userBId === userId;
}

/**
 * Send message
 * 1. Validate message content is non-empty and not all whitespace
 * 2. Validate message length ≤1000 characters
 * 3. Find Conversation, verify it exists
 * 4. Verify user is a participant
 * 5. Verify Conversation status is active
 * 6. Create Message record
 *
 * @param {string} userId - Sender user ID
 * @param {string} conversationId - Conversation ID
 * @param {string} content - Message content
 * @param {object} [deps] - Dependency injection (for testing)
 * @param {object} [deps.prismaClient] - Prisma client instance
 * @returns {Promise<object>} Created message record
 */
export async function sendMessage(userId, conversationId, content, deps = {}) {
  const db = deps.prismaClient || prisma;

  // 1. Validate message content is non-empty and not all whitespace
  if (!content || content.trim().length === 0) {
    throw new AppError(400, 'EMPTY_MESSAGE', 'Message cannot be empty');
  }

  // 2. Validate message length ≤1000 characters
  if (content.length > 1000) {
    throw new AppError(400, 'MESSAGE_TOO_LONG', 'Message exceeds 1000 character limit', {
      maxLength: 1000,
      currentLength: content.length,
    });
  }

  // 3. Find Conversation
  const conversation = await db.conversation.findUnique({
    where: { id: conversationId },
  });

  if (!conversation) {
    throw new AppError(404, 'CONVERSATION_NOT_FOUND', 'Conversation not found');
  }

  // 4. Verify user is a participant
  if (!isParticipant(conversation, userId)) {
    throw new AppError(403, 'NOT_PARTICIPANT', 'You are not a participant of this conversation');
  }

  // 5. Verify Conversation status is active
  if (conversation.status !== 'active') {
    throw new AppError(400, 'CONVERSATION_ENDED', 'Conversation has ended. Cannot send messages.');
  }

  // 6. Create Message record
  const message = await db.message.create({
    data: {
      conversationId,
      senderId: userId,
      content,
      type: 'text',
    },
  });

  return message;
}

/**
 * Get paginated message history
 * 1. Find Conversation, verify it exists
 * 2. Verify user is a participant
 * 3. Paginated query messages (ordered by createdAt desc)
 *
 * @param {string} userId - User ID
 * @param {string} conversationId - Conversation ID
 * @param {object} [pagination] - Pagination params
 * @param {number} [pagination.page=1] - Page number (starting from 1)
 * @param {number} [pagination.pageSize=20] - Items per page
 * @param {object} [deps] - Dependency injection (for testing)
 * @param {object} [deps.prismaClient] - Prisma client instance
 * @returns {Promise<{ messages: object[], total: number, page: number, pageSize: number }>}
 */
export async function getMessages(userId, conversationId, pagination = {}, deps = {}) {
  const db = deps.prismaClient || prisma;
  const page = pagination.page || 1;
  const pageSize = pagination.pageSize || 20;
  const before = pagination.before; // cursor: message ID to fetch messages before

  // 1. Find Conversation
  const conversation = await db.conversation.findUnique({
    where: { id: conversationId },
  });

  if (!conversation) {
    throw new AppError(404, 'CONVERSATION_NOT_FOUND', 'Conversation not found');
  }

  // 2. Verify user is a participant
  if (!isParticipant(conversation, userId)) {
    throw new AppError(403, 'NOT_PARTICIPANT', 'You are not a participant of this conversation');
  }

  // 3. Paginated query messages (cursor-based if before is provided)
  const whereClause = { conversationId };

  if (before) {
    // Cursor-based: get messages created before the cursor message
    const cursorMessage = await db.message.findUnique({
      where: { id: before },
      select: { createdAt: true },
    });
    if (cursorMessage) {
      whereClause.createdAt = { lt: cursorMessage.createdAt };
    }
  }

  const [messages, total] = await Promise.all([
    db.message.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      take: pageSize,
    }),
    db.message.count({
      where: { conversationId },
    }),
  ]);

  return {
    messages,
    total,
    page,
    pageSize,
  };
}

/**
 * End conversation
 * 1. Find Conversation, verify it exists
 * 2. Verify user is a participant
 * 3. Verify Conversation status is active
 * 4. Update Conversation status to ended, set endedAt
 *
 * @param {string} userId - User ID
 * @param {string} conversationId - Conversation ID
 * @param {object} [deps] - Dependency injection (for testing)
 * @param {object} [deps.prismaClient] - Prisma client instance
 * @param {Function} [deps.getNow] - Function to get current time (for testing)
 * @returns {Promise<object>} Updated Conversation record
 */
export async function endConversation(userId, conversationId, deps = {}) {
  const db = deps.prismaClient || prisma;
  const getNow = deps.getNow || (() => new Date());

  // 1. Find Conversation
  const conversation = await db.conversation.findUnique({
    where: { id: conversationId },
  });

  if (!conversation) {
    throw new AppError(404, 'CONVERSATION_NOT_FOUND', 'Conversation not found');
  }

  // 2. Verify user is a participant
  if (!isParticipant(conversation, userId)) {
    throw new AppError(403, 'NOT_PARTICIPANT', 'You are not a participant of this conversation');
  }

  // 3. Verify Conversation status is active
  if (conversation.status !== 'active') {
    throw new AppError(400, 'CONVERSATION_ALREADY_ENDED', 'Conversation has already ended');
  }

  // 4. Update status to ended and sync Match status
  const updatedConversation = await db.conversation.update({
    where: { id: conversationId },
    data: {
      status: 'ended',
      endedAt: getNow(),
    },
  });

  // 5. Update associated Match status to closed (if not already)
  if (conversation.matchId) {
    await db.match.updateMany({
      where: { id: conversation.matchId, status: { not: 'closed' } },
      data: { status: 'closed' },
    });
  }

  return updatedConversation;
}
