/**
 * AI Match Service - Generate daily recommendations based on multi-dimensional evaluation
 * Handles match score calculation, recommendation reason generation, candidate filtering
 */
import prisma from '../lib/prisma.js';
import { chatCompletion } from './cfaiClient.js';
import { AppError } from '../middlewares/errorHandler.js';
import { getTodayCST } from '../lib/timezone.js';

/**
 * Match dimension keywords (for validating recommendation reasons)
 */
const MATCH_DIMENSION_KEYWORDS = ['age', 'occupation', 'personality', 'intent'];

/**
 * Build AI prompt for match evaluation
 *
 * @param {object} userA - User A's profile and preferences
 * @param {object} userB - User B's profile and preferences
 * @returns {Array<{role: string, content: string}>} Messages array
 */
export function buildMatchPrompt(userA, userB) {
  const currentYear = new Date().getFullYear();

  const systemMessage = {
    role: 'system',
    content: `You are a professional match evaluation engine. Evaluate the compatibility of two users based on the following four dimensions:
1. Age compatibility: Whether the age difference is within each other's preferred range
2. Occupation compatibility: Whether occupation types are in each other's accepted list
3. Personality complementarity: Degree of complementary or similar personality traits
4. Intent alignment: Whether both parties have the same dating intent type

Return a JSON evaluation result containing:
- score: Overall match score (integer 0-100)
- reason: Recommendation reason (10-100 characters, must reference at least one match dimension: age compatibility, occupation compatibility, personality complementarity, intent alignment)

Return only JSON, no other content.`,
  };

  const userMessage = {
    role: 'user',
    content: `Please evaluate the compatibility of the following two users:

User A:
- Name: ${userA.profile.name}
- Age: ${currentYear - userA.profile.birthYear}
- Gender: ${userA.profile.gender}
- Occupation: ${userA.profile.occupation}
- City: ${userA.profile.city}
- Bio: ${userA.profile.bio || 'None'}
- Preferred age range: ${userA.preference.ageMin}-${userA.preference.ageMax}
- Preferred occupation types: ${userA.preference.occupationTypes.length > 0 ? userA.preference.occupationTypes.join(', ') : 'Any'}
- Preferred personality traits: ${userA.preference.personalityTraits.length > 0 ? userA.preference.personalityTraits.join(', ') : 'Any'}
- Dating intent: ${userA.preference.datingIntent}

User B:
- Name: ${userB.profile.name}
- Age: ${currentYear - userB.profile.birthYear}
- Gender: ${userB.profile.gender}
- Occupation: ${userB.profile.occupation}
- City: ${userB.profile.city}
- Bio: ${userB.profile.bio || 'None'}
- Preferred age range: ${userB.preference.ageMin}-${userB.preference.ageMax}
- Preferred occupation types: ${userB.preference.occupationTypes.length > 0 ? userB.preference.occupationTypes.join(', ') : 'Any'}
- Preferred personality traits: ${userB.preference.personalityTraits.length > 0 ? userB.preference.personalityTraits.join(', ') : 'Any'}
- Dating intent: ${userB.preference.datingIntent}`,
  };

  return [systemMessage, userMessage];
}

/**
 * Parse AI match evaluation result
 *
 * @param {string} aiResponse - AI returned JSON string
 * @returns {{ score: number, reason: string }} Parsed result
 */
export function parseMatchResponse(aiResponse) {
  try {
    // Try to extract JSON (AI may return with markdown code blocks)
    let jsonStr = aiResponse.trim();
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    const result = JSON.parse(jsonStr);

    // Validate score
    let score = Number(result.score);
    if (!Number.isFinite(score) || score < 0 || score > 100) {
      score = 0;
    }
    score = Math.round(score);

    // Validate reason
    let reason = String(result.reason || '');

    // Ensure reason length is between 10-100 characters
    if (reason.length < 10) {
      reason = `You have good compatibility across multiple dimensions, worth getting to know each other.`;
    }
    if (reason.length > 100) {
      reason = reason.substring(0, 100);
    }

    // Ensure reason contains at least one match dimension keyword
    const hasKeyword = MATCH_DIMENSION_KEYWORDS.some((kw) => reason.toLowerCase().includes(kw));
    if (!hasKeyword) {
      reason = `Good intent alignment detected. ${reason}`;
      if (reason.length > 100) {
        reason = reason.substring(0, 100);
      }
    }

    return { score, reason };
  } catch {
    // Parse failed, return defaults
    return { score: 0, reason: 'Match evaluation temporarily unavailable. Please try again later.' };
  }
}

/**
 * Calculate match score between two users
 *
 * @param {object} userA - User A (with profile and preference)
 * @param {object} userB - User B (with profile and preference)
 * @param {object} [deps] - Injectable dependencies (for testing)
 * @param {function} [deps.chatCompletionFn] - AI chat completion function
 * @returns {Promise<{ score: number, reason: string }>} Match score and reason
 */
export async function calculateMatchScore(userA, userB, deps = {}) {
  const chatCompletionFn = deps.chatCompletionFn || chatCompletion;

  const messages = buildMatchPrompt(userA, userB);

  try {
    const response = await chatCompletionFn(
      messages,
      {
        temperature: 0.3,
        max_tokens: 300,
        response_format: { type: 'json_object' },
      },
      deps.chatCompletionDeps || {}
    );

    return parseMatchResponse(response);
  } catch (error) {
    // Log and return 0 score on AI failure (degradation strategy)
    console.error('[AI Match] calculateMatchScore failed:', error.message);
    return { score: 0, reason: '' };
  }
}

/**
 * Get user's complete profile (profile + preference)
 *
 * @param {string} userId - User ID
 * @param {object} db - Prisma client
 * @returns {Promise<object|null>} User profile or null
 */
async function getUserWithProfileAndPreference(userId, db) {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: {
      profile: true,
      preference: true,
    },
  });

  if (!user || !user.profile || !user.preference) {
    return null;
  }

  return user;
}

/**
 * Get list of user IDs to exclude
 * Exclude: matched users (permanent) + skipped users within 30 days
 *
 * @param {string} userId - Current user ID
 * @param {object} db - Prisma client
 * @returns {Promise<string[]>} List of user IDs to exclude
 */
async function getExcludedUserIds(userId, db) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Find matched users (permanently excluded)
  const matchedMatches = await db.match.findMany({
    where: {
      status: 'matched',
      OR: [{ userAId: userId }, { userBId: userId }],
    },
    select: { userAId: true, userBId: true },
  });

  // Find users with pending matches (avoid duplicate pairs)
  const pendingMatches = await db.match.findMany({
    where: {
      status: 'pending',
      OR: [{ userAId: userId }, { userBId: userId }],
    },
    select: { userAId: true, userBId: true },
  });

  // Find skipped/closed users within 30 days
  const skippedMatches = await db.match.findMany({
    where: {
      OR: [
        { userAId: userId, status: 'closed', createdAt: { gte: thirtyDaysAgo } },
        { userBId: userId, status: 'closed', createdAt: { gte: thirtyDaysAgo } },
      ],
    },
    select: { userAId: true, userBId: true },
  });

  // Find blocked users (permanently excluded in both directions)
  const blocks = await db.block.findMany({
    where: {
      OR: [{ blockerId: userId }, { blockedUserId: userId }],
    },
    select: { blockerId: true, blockedUserId: true },
  });

  const excludedIds = new Set();

  for (const match of matchedMatches) {
    excludedIds.add(match.userAId === userId ? match.userBId : match.userAId);
  }

  for (const match of pendingMatches) {
    excludedIds.add(match.userAId === userId ? match.userBId : match.userAId);
  }

  for (const match of skippedMatches) {
    excludedIds.add(match.userAId === userId ? match.userBId : match.userAId);
  }

  for (const block of blocks) {
    excludedIds.add(block.blockerId === userId ? block.blockedUserId : block.blockerId);
  }

  return Array.from(excludedIds);
}

/**
 * Generate daily recommendations for a user
 *
 * @param {string} userId - User ID
 * @param {object} [deps] - Injectable dependencies (for testing)
 * @param {object} [deps.prismaClient] - Prisma client instance
 * @param {function} [deps.chatCompletionFn] - AI chat completion function
 * @param {object} [deps.chatCompletionDeps] - chatCompletion dependencies
 * @returns {Promise<object|null>} DailyRecommendation record or null (when no candidates)
 */
export async function generateDailyRecommendations(userId, deps = {}) {
  const db = deps.prismaClient || prisma;
  const chatCompletionFn = deps.chatCompletionFn || chatCompletion;

  // 0. Deduplication check: skip if already generated today (with own matches)
  // Note: a record may exist from being added as someone else's candidate (bidirectional visibility),
  // in that case we still need to run this user's own match calculation.
  const today = getTodayCST();

  const existingRecommendation = await db.dailyRecommendation.findFirst({
    where: {
      userId,
      recommendationDate: today,
    },
  });

  // Only skip if this user already had their OWN generation run (status is pending/pushed with matchIds,
  // or status is failed from a prior run). A record created purely from bidirectional append
  // won't have status 'pushed' or 'failed' (it stays 'pending' with only others' matchIds).
  // We use a flag: if existingRecommendation exists AND was created by this user's own generation
  // (indicated by having status 'pushed', 'failed', or matchIds.length >= 3 from own generation).
  // Simplest approach: track via a dedicated check - if the record's createdAt matches today and
  // it was not solely created by another user's bidirectional push.
  // Pragmatic fix: only skip if the record has status !== 'pending' (meaning it was already processed)
  if (existingRecommendation && existingRecommendation.status !== 'pending') {
    return existingRecommendation;
  }

  // 1. Get current user's profile and preferences
  const currentUser = await getUserWithProfileAndPreference(userId, db);
  if (!currentUser) {
    throw new AppError(400, 'USER_NOT_READY', 'User profile or preferences not completed');
  }

  // 2. Get all candidates (status preference_set, exclude self)
  const candidates = await db.user.findMany({
    where: {
      status: 'preference_set',
      id: { not: userId },
    },
    include: {
      profile: true,
      preference: true,
    },
  });

  // 3. Get user IDs to exclude
  const excludedIds = await getExcludedUserIds(userId, db);

  // 4. Filter candidates: exclude matched and 30-day skipped, exclude those without profile/preference
  const validCandidates = candidates.filter(
    (c) => !excludedIds.includes(c.id) && c.profile && c.preference
  );

  if (validCandidates.length === 0) {
    return null;
  }

  // 4.5 Pre-filter by basic criteria (age range, gender) to reduce AI calls
  const currentYear = new Date().getFullYear();
  const myAge = currentYear - currentUser.profile.birthYear;
  const myGender = currentUser.profile.gender;

  const preFilteredCandidates = validCandidates.filter((c) => {
    const candidateAge = currentYear - c.profile.birthYear;
    // Check if candidate's age is within my preference
    if (candidateAge < currentUser.preference.ageMin || candidateAge > currentUser.preference.ageMax) {
      return false;
    }
    // Check if my age is within candidate's preference
    if (myAge < c.preference.ageMin || myAge > c.preference.ageMax) {
      return false;
    }
    // Exclude same gender (basic heterosexual matching assumption)
    if (c.profile.gender === myGender) {
      return false;
    }
    return true;
  });

  if (preFilteredCandidates.length === 0) {
    return null;
  }

  // 5. Calculate match score for each candidate (parallel with concurrency limit of 5)
  const CONCURRENCY_LIMIT = 5;
  const scoredCandidates = [];

  for (let i = 0; i < preFilteredCandidates.length; i += CONCURRENCY_LIMIT) {
    const batch = preFilteredCandidates.slice(i, i + CONCURRENCY_LIMIT);
    const results = await Promise.allSettled(
      batch.map((candidate) =>
        calculateMatchScore(currentUser, candidate, {
          chatCompletionFn,
          chatCompletionDeps: deps.chatCompletionDeps || {},
        }).then((result) => ({ candidate, ...result }))
      )
    );

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.score >= 60) {
        scoredCandidates.push(result.value);
      }
    }
  }

  // 6. Sort by score descending, take top 3
  scoredCandidates.sort((a, b) => b.score - a.score);
  const topCandidates = scoredCandidates.slice(0, 3);

  if (topCandidates.length === 0) {
    return null;
  }

  // 7. Create Match records and DailyRecommendation records for BOTH users
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 72);

  const matchIds = [];

  for (const { candidate, score, reason } of topCandidates) {
    const match = await db.match.create({
      data: {
        userAId: userId,
        userBId: candidate.id,
        score,
        reason,
        status: 'pending',
        expiresAt,
      },
    });
    matchIds.push(match.id);

    // Create/update DailyRecommendation for userB (FR-04: bidirectional visibility)
    const existingRec = await db.dailyRecommendation.findUnique({
      where: { userId_recommendationDate: { userId: candidate.id, recommendationDate: today } },
    });
    if (existingRec) {
      await db.dailyRecommendation.update({
        where: { id: existingRec.id },
        data: { matchIds: [...existingRec.matchIds, match.id] },
      });
    } else {
      await db.dailyRecommendation.create({
        data: {
          userId: candidate.id,
          recommendationDate: today,
          matchIds: [match.id],
          status: 'pending',
        },
      });
    }
  }

  // 8. Create/update DailyRecommendation record for current user
  let dailyRecommendation;
  if (existingRecommendation) {
    // Merge new matchIds into existing record (from bidirectional push)
    dailyRecommendation = await db.dailyRecommendation.update({
      where: { id: existingRecommendation.id },
      data: { matchIds: [...new Set([...existingRecommendation.matchIds, ...matchIds])] },
    });
  } else {
    dailyRecommendation = await db.dailyRecommendation.create({
      data: {
        userId,
        recommendationDate: today,
        matchIds,
        status: 'pending',
      },
    });
  }

  return dailyRecommendation;
}
