/**
 * Consent Service
 * Core business logic for mutual consent mechanism
 * - expressInterest: Express interest, check if both parties agree, create Conversation if mutual
 * - skipMatch: Skip match, close the other party's Match
 * - 72-hour response window check
 * - No revocation logic in waiting state
 */
import prisma from '../lib/prisma.js';
import { AppError } from '../middlewares/errorHandler.js';
import { generateIntroduction, generateIcebreakers } from './aiContentService.js';
import { emitMatchSuccess } from '../websocket/index.js';

/**
 * Determine user's role in Match (userA or userB)
 * @param {object} match - Match record
 * @param {string} userId - User ID
 * @returns {{ side: 'A' | 'B', choiceField: string, respondedAtField: string, otherChoiceField: string, otherRespondedAtField: string }}
 */
function getUserSide(match, userId) {
  if (match.userAId === userId) {
    return {
      side: 'A',
      choiceField: 'userAChoice',
      respondedAtField: 'userARespondedAt',
      otherChoiceField: 'userBChoice',
      otherRespondedAtField: 'userBRespondedAt',
    };
  }
  if (match.userBId === userId) {
    return {
      side: 'B',
      choiceField: 'userBChoice',
      respondedAtField: 'userBRespondedAt',
      otherChoiceField: 'userAChoice',
      otherRespondedAtField: 'userARespondedAt',
    };
  }
  return null;
}

/**
 * AI content generation timeout (5 seconds)
 */
const AI_CONTENT_TIMEOUT_MS = 5000;

/**
 * Promise wrapper with timeout
 * @param {Promise} promise - Original Promise
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {string} label - Label (for logging)
 * @returns {Promise}
 */
function withTimeout(promise, timeoutMs, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out (${timeoutMs}ms)`)), timeoutMs)
    ),
  ]);
}

/**
 * Generate AI content after Conversation creation (introduction and icebreakers)
 * Uses Promise.allSettled for parallel calls with timeout protection
 * AI failure fallback logic is built into aiContentService
 *
 * @param {object} conversation - Created Conversation record
 * @param {object} userA - User A (with profile)
 * @param {object} userB - User B (with profile)
 * @param {object} db - Prisma client instance
 * @param {object} [aiDeps] - AI service dependency injection (for testing)
 * @returns {Promise<{ introduction: string, icebreakers: string[] }>}
 */
export async function generateAIContentForConversation(conversation, userA, userB, db, aiDeps = {}) {
  const generateIntroFn = aiDeps.generateIntroductionFn || generateIntroduction;
  const generateIcebreakersFn = aiDeps.generateIcebreakersFn || generateIcebreakers;

  // Parallel AI calls for introduction and icebreakers with 5s timeout
  const [introResult, icebreakersResult] = await Promise.allSettled([
    withTimeout(
      generateIntroFn(userA, userB, aiDeps.introductionDeps || {}),
      AI_CONTENT_TIMEOUT_MS,
      'generateIntroduction'
    ),
    withTimeout(
      generateIcebreakersFn(userA, userB, aiDeps.icebreakersDeps || {}),
      AI_CONTENT_TIMEOUT_MS,
      'generateIcebreakers'
    ),
  ]);

  // Extract results (fallback logic is handled internally in aiContentService, here we handle timeout)
  let introduction;
  if (introResult.status === 'fulfilled') {
    introduction = introResult.value;
  } else {
    // Timeout fallback: use generic template
    console.error('[AI Content] Introduction generation timed out or failed:', introResult.reason?.message);
    const { buildFallbackIntroduction } = await import('./aiContentService.js');
    introduction = buildFallbackIntroduction(userA, userB);
  }

  let icebreakers;
  if (icebreakersResult.status === 'fulfilled') {
    icebreakers = icebreakersResult.value;
  } else {
    // Timeout fallback: use generic icebreakers
    console.error('[AI Content] Icebreakers generation timed out or failed:', icebreakersResult.reason?.message);
    icebreakers = [
      'Any interesting stories to share recently?',
      'What do you like to do to relax?',
      'If you had a day off, where would you most like to go?',
    ];
  }

  // Update Conversation record with introduction and icebreakers
  await db.conversation.update({
    where: { id: conversation.id },
    data: {
      introduction,
      icebreakers,
    },
  });

  // Create system message with introduction and icebreakers as the first message
  const systemMessageContent = JSON.stringify({
    introduction,
    icebreakers,
  });

  const systemMessage = await db.message.create({
    data: {
      conversationId: conversation.id,
      senderId: userA.id, // System message uses userA as sender (type: system identifies it as system message)
      content: systemMessageContent,
      type: 'system',
    },
  });

  // Push system message to both users via WebSocket
  const { emitToUser: emitFn } = await import('../websocket/index.js');
  const messagePayload = { message: systemMessage };
  emitFn(userA.id, 'message:new', messagePayload);
  emitFn(userB.id, 'message:new', messagePayload);

  return { introduction, icebreakers };
}

/**
 * Express interest
 * 1. Find Match, verify user is a participant
 * 2. Check Match not expired (expiresAt > now)
 * 3. Check user has not responded (choice is null) → reject if already responded (no revocation)
 * 4. Set user's choice to 'interested' and respondedAt
 * 5. Check if both parties chose 'interested' → if yes, create Conversation, update Match status to 'matched'
 * 6. Call AI to generate introduction and icebreakers, store in Conversation and system message
 * 7. Return result
 *
 * @param {string} userId - User ID
 * @param {string} matchId - Match ID
 * @param {object} [deps] - Dependency injection (for testing)
 * @param {object} [deps.prismaClient] - Prisma client instance
 * @param {Function} [deps.getNow] - Function to get current time (for testing)
 * @param {object} [deps.aiDeps] - AI service dependency injection
 * @param {Function} [deps.aiDeps.generateIntroductionFn] - Introduction generation function
 * @param {Function} [deps.aiDeps.generateIcebreakersFn] - Icebreakers generation function
 * @returns {Promise<{ status: string, conversationId?: string }>}
 */
export async function expressInterest(userId, matchId, deps = {}) {
  const db = deps.prismaClient || prisma;
  const getNow = deps.getNow || (() => new Date());

  // 1. Find Match
  const match = await db.match.findUnique({
    where: { id: matchId },
  });

  if (!match) {
    throw new AppError(404, 'MATCH_NOT_FOUND', 'Match not found');
  }

  // 2. Verify user is a participant
  const userSide = getUserSide(match, userId);
  if (!userSide) {
    throw new AppError(403, 'NOT_PARTICIPANT', 'You are not a participant of this match');
  }

  // 3. Check Match status is pending
  if (match.status !== 'pending') {
    throw new AppError(400, 'MATCH_NOT_PENDING', 'Match is no longer in pending state');
  }

  // 4. Check Match not expired
  const now = getNow();
  if (now >= match.expiresAt) {
    throw new AppError(400, 'MATCH_EXPIRED', 'Match expired');
  }

  // 5. Check user has not responded (no revocation)
  if (match[userSide.choiceField] !== null) {
    throw new AppError(400, 'ALREADY_RESPONDED', 'You have already made a choice. Cannot revoke or modify in waiting state.');
  }

  // 6. Update user's choice (use transaction for atomicity)
  const updateData = {
    [userSide.choiceField]: 'interested',
    [userSide.respondedAtField]: now,
  };

  // Use transaction to prevent race condition on mutual interest
  const txResult = await db.$transaction(async (tx) => {
    // Re-read match state inside transaction to get fresh otherChoice
    const freshMatch = await tx.match.findUnique({ where: { id: matchId } });
    if (!freshMatch || freshMatch.status !== 'pending') {
      throw new AppError(400, 'MATCH_NOT_PENDING', 'Match is no longer in pending state');
    }
    if (freshMatch[userSide.choiceField] !== null) {
      throw new AppError(400, 'ALREADY_RESPONDED', 'You have already made a choice. Cannot revoke or modify in waiting state.');
    }

    // Determine bothInterested from fresh data inside transaction
    const freshOtherChoice = freshMatch[userSide.otherChoiceField];
    const bothInterested = freshOtherChoice === 'interested';

    if (bothInterested) {
      updateData.status = 'matched';
    }

    const updatedMatch = await tx.match.update({
      where: { id: matchId },
      data: updateData,
    });

    if (bothInterested) {
      const conversation = await tx.conversation.create({
        data: {
          matchId: matchId,
          userAId: match.userAId,
          userBId: match.userBId,
          status: 'active',
        },
      });
      return { updatedMatch, conversation, bothInterested };
    }

    return { updatedMatch, conversation: null, bothInterested };
  });

  // 8. If mutual interest, generate AI content and notify
  if (txResult.bothInterested && txResult.conversation) {
    // Get both users' info (with profile) for AI content generation
    const [userA, userB] = await Promise.all([
      db.user.findUnique({
        where: { id: match.userAId },
        include: { profile: true },
      }),
      db.user.findUnique({
        where: { id: match.userBId },
        include: { profile: true },
      }),
    ]);

    // Async AI content generation (fire-and-forget)
    generateAIContentForConversation(
      txResult.conversation,
      userA,
      userB,
      db,
      deps.aiDeps || {}
    ).catch((error) => {
      console.error('[AI Content] AI content generation error:', error.message);
    });

    // Notify both parties of match success via WebSocket
    const emitMatchSuccessFn = deps.emitMatchSuccessFn || emitMatchSuccess;
    try {
      emitMatchSuccessFn(match.userAId, match.userBId, txResult.conversation.id, matchId);
    } catch (error) {
      console.error('[WebSocket] Failed to push match success notification:', error.message);
    }

    return {
      status: 'matched',
      conversationId: txResult.conversation.id,
      matchStatus: txResult.updatedMatch.status,
    };
  }

  // Only one party interested, keep waiting
  return {
    status: 'waiting',
    matchStatus: txResult.updatedMatch.status,
  };
}

/**
 * Synchronous version of AI content generation (for scenarios that need to wait for results)
 * Called after Conversation creation, waits for AI content generation to complete
 *
 * @param {string} userId - User ID
 * @param {string} matchId - Match ID
 * @param {object} [deps] - Dependency injection (for testing)
 * @returns {Promise<{ status: string, conversationId?: string, aiContent?: object }>}
 */
export async function expressInterestWithAIContent(userId, matchId, deps = {}) {
  const db = deps.prismaClient || prisma;
  const getNow = deps.getNow || (() => new Date());

  // 1. Find Match
  const match = await db.match.findUnique({
    where: { id: matchId },
  });

  if (!match) {
    throw new AppError(404, 'MATCH_NOT_FOUND', 'Match not found');
  }

  // 2. Verify user is a participant
  const userSide = getUserSide(match, userId);
  if (!userSide) {
    throw new AppError(403, 'NOT_PARTICIPANT', 'You are not a participant of this match');
  }

  // 3. Check Match status is pending
  if (match.status !== 'pending') {
    throw new AppError(400, 'MATCH_NOT_PENDING', 'Match is no longer in pending state');
  }

  // 4. Check Match not expired
  const now = getNow();
  if (now >= match.expiresAt) {
    throw new AppError(400, 'MATCH_EXPIRED', 'Match expired');
  }

  // 5. Check user has not responded (no revocation)
  if (match[userSide.choiceField] !== null) {
    throw new AppError(400, 'ALREADY_RESPONDED', 'You have already made a choice. Cannot revoke or modify in waiting state.');
  }

  // 6. Update user's choice
  const updateData = {
    [userSide.choiceField]: 'interested',
    [userSide.respondedAtField]: now,
  };

  // 7. Check if the other party also chose 'interested'
  const otherChoice = match[userSide.otherChoiceField];
  const bothInterested = otherChoice === 'interested';

  if (bothInterested) {
    updateData.status = 'matched';
  }

  // Update Match
  const updatedMatch = await db.match.update({
    where: { id: matchId },
    data: updateData,
  });

  // 8. If mutual interest, create Conversation and wait for AI content generation
  if (bothInterested) {
    const conversation = await db.conversation.create({
      data: {
        matchId: matchId,
        userAId: match.userAId,
        userBId: match.userBId,
        status: 'active',
      },
    });

    // Get both users' info (with profile)
    const [userA, userB] = await Promise.all([
      db.user.findUnique({
        where: { id: match.userAId },
        include: { profile: true },
      }),
      db.user.findUnique({
        where: { id: match.userBId },
        include: { profile: true },
      }),
    ]);

    // Wait for AI content generation to complete
    const aiContent = await generateAIContentForConversation(
      conversation,
      userA,
      userB,
      db,
      deps.aiDeps || {}
    );

    // Notify both parties of match success via WebSocket
    const emitMatchSuccessFn = deps.emitMatchSuccessFn || emitMatchSuccess;
    try {
      emitMatchSuccessFn(match.userAId, match.userBId, conversation.id);
    } catch (error) {
      console.error('[WebSocket] Failed to push match success notification:', error.message);
    }

    return {
      status: 'matched',
      conversationId: conversation.id,
      matchStatus: updatedMatch.status,
      aiContent,
    };
  }

  return {
    status: 'waiting',
    matchStatus: updatedMatch.status,
  };
}

/**
 * Skip match
 * 1. Find Match, verify user is a participant
 * 2. Check Match not expired
 * 3. Check user has not responded
 * 4. Set user's choice to 'skipped' and respondedAt
 * 5. Update Match status to 'skipped'
 * 6. If other party has not responded, close the Match (status = 'closed')
 *
 * @param {string} userId - User ID
 * @param {string} matchId - Match ID
 * @param {object} [deps] - Dependency injection (for testing)
 * @param {object} [deps.prismaClient] - Prisma client instance
 * @param {Function} [deps.getNow] - Function to get current time (for testing)
 * @returns {Promise<{ status: string }>}
 */
export async function skipMatch(userId, matchId, deps = {}) {
  const db = deps.prismaClient || prisma;
  const getNow = deps.getNow || (() => new Date());

  // 1. Find Match
  const match = await db.match.findUnique({
    where: { id: matchId },
  });

  if (!match) {
    throw new AppError(404, 'MATCH_NOT_FOUND', 'Match not found');
  }

  // 2. Verify user is a participant
  const userSide = getUserSide(match, userId);
  if (!userSide) {
    throw new AppError(403, 'NOT_PARTICIPANT', 'You are not a participant of this match');
  }

  // 3. Check Match status is pending
  if (match.status !== 'pending') {
    throw new AppError(400, 'MATCH_NOT_PENDING', 'Match is no longer in pending state');
  }

  // 4. Check Match not expired
  const now = getNow();
  if (now >= match.expiresAt) {
    throw new AppError(400, 'MATCH_EXPIRED', 'Match expired');
  }

  // 5. Check user has not responded (no revocation)
  if (match[userSide.choiceField] !== null) {
    throw new AppError(400, 'ALREADY_RESPONDED', 'You have already made a choice. Cannot revoke or modify in waiting state.');
  }

  // 6. Update user's choice and close the Match
  // Skip always closes the match regardless of other party's response
  const updateData = {
    [userSide.choiceField]: 'skipped',
    [userSide.respondedAtField]: now,
    status: 'closed',
  };

  await db.match.update({
    where: { id: matchId },
    data: updateData,
  });

  return {
    status: 'closed',
  };
}

/**
 * Check if Match has expired (72-hour response window)
 * @param {object} match - Match record
 * @param {object} [deps] - Dependency injection
 * @param {Function} [deps.getNow] - Function to get current time
 * @returns {boolean} Whether expired
 */
export function isMatchExpired(match, deps = {}) {
  const getNow = deps.getNow || (() => new Date());
  const now = getNow();
  return now >= match.expiresAt;
}

/**
 * Batch process expired Matches
 * Mark Matches that exceeded 72-hour response window as expired
 * @param {object} [deps] - Dependency injection
 * @param {object} [deps.prismaClient] - Prisma client instance
 * @param {Function} [deps.getNow] - Function to get current time
 * @returns {Promise<{ expiredCount: number }>}
 */
export async function processExpiredMatches(deps = {}) {
  const db = deps.prismaClient || prisma;
  const getNow = deps.getNow || (() => new Date());
  const now = getNow();

  // Find all expired Matches still in pending status
  const result = await db.match.updateMany({
    where: {
      status: 'pending',
      expiresAt: {
        lte: now,
      },
    },
    data: {
      status: 'expired',
    },
  });

  return { expiredCount: result.count };
}
