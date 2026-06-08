/**
 * Report Service
 * Handles user reports with deduplication and auto-suspension
 * - createReport: Create a report with dedup check
 * - checkAndSuspendUser: Auto-suspend user if reported by 3+ different users
 */
import prisma from '../lib/prisma.js';
import { AppError } from '../middlewares/errorHandler.js';
import { invalidateUserStatusCache } from '../middlewares/auth.js';

// Number of unique reporters needed to trigger auto-suspension
const SUSPENSION_THRESHOLD = 3;

/**
 * Create a report
 * 1. Verify conversation exists and user is participant
 * 2. Verify message exists in conversation
 * 3. Check deduplication (same reporter + same message)
 * 4. Create report record
 * 5. Check if reported user should be auto-suspended
 *
 * @param {string} reporterId - Reporter user ID
 * @param {string} conversationId - Conversation ID
 * @param {string} messageId - Reported message ID
 * @param {string} reason - Report reason
 * @param {object} [deps] - Dependency injection
 * @param {object} [deps.prismaClient] - Prisma client instance
 * @returns {Promise<object>} Report record
 */
export async function createReport(reporterId, conversationId, messageId, reason, deps = {}) {
  const db = deps.prismaClient || prisma;

  // 1. Verify conversation exists
  const conversation = await db.conversation.findUnique({
    where: { id: conversationId },
  });

  if (!conversation) {
    throw new AppError(404, 'CONVERSATION_NOT_FOUND', 'Conversation not found');
  }

  // 2. Verify reporter is a participant
  if (conversation.userAId !== reporterId && conversation.userBId !== reporterId) {
    throw new AppError(403, 'NOT_PARTICIPANT', 'You are not a participant of this conversation');
  }

  // 3. Verify message exists and belongs to this conversation
  const message = await db.message.findUnique({
    where: { id: messageId },
  });

  if (!message || message.conversationId !== conversationId) {
    throw new AppError(404, 'MESSAGE_NOT_FOUND', 'Reported message not found');
  }

  // 4. Cannot report your own message
  if (message.senderId === reporterId) {
    throw new AppError(400, 'CANNOT_REPORT_SELF', 'You cannot report your own message');
  }

  const reportedUserId = message.senderId;

  // 5. Deduplication check
  const existingReport = await db.report.findUnique({
    where: {
      reporterId_messageId: {
        reporterId,
        messageId,
      },
    },
  });

  if (existingReport) {
    throw new AppError(409, 'ALREADY_REPORTED', 'You have already reported this message');
  }

  // 6. Create report
  const report = await db.report.create({
    data: {
      reporterId,
      reportedUserId,
      conversationId,
      messageId,
      reason,
    },
  });

  // 7. Check if reported user should be auto-suspended
  await checkAndSuspendUser(reportedUserId, db);

  return {
    id: report.id,
    reporterId,
    reportedUserId,
    messageId,
    reason,
    status: report.status,
    createdAt: report.createdAt,
  };
}

/**
 * Check if a user should be auto-suspended based on report count
 * Suspends if reported by >= SUSPENSION_THRESHOLD different users
 *
 * @param {string} userId - User ID to check
 * @param {object} db - Prisma client
 */
async function checkAndSuspendUser(userId, db) {
  // Count unique reporters for this user
  const uniqueReporters = await db.report.findMany({
    where: {
      reportedUserId: userId,
      status: 'pending', // Only count unresolved reports
    },
    select: { reporterId: true },
    distinct: ['reporterId'],
  });

  if (uniqueReporters.length >= SUSPENSION_THRESHOLD) {
    // Auto-suspend the user
    await db.user.update({
      where: { id: userId },
      data: { status: 'suspended' },
    });

    // Invalidate status cache immediately
    invalidateUserStatusCache(userId);

    // Close all active matches for suspended user
    await db.match.updateMany({
      where: {
        status: 'pending',
        OR: [{ userAId: userId }, { userBId: userId }],
      },
      data: { status: 'closed' },
    });

    // End all active conversations for suspended user
    await db.conversation.updateMany({
      where: {
        status: 'active',
        OR: [{ userAId: userId }, { userBId: userId }],
      },
      data: {
        status: 'ended',
        endedAt: new Date(),
      },
    });

    console.log(`[Report] User ${userId} auto-suspended: reported by ${uniqueReporters.length} users`);
  }
}

export { SUSPENSION_THRESHOLD };
