/**
 * Match Recommendation Routes
 * GET /api/matches/daily - Get daily recommendations
 * POST /api/matches/:id/interested - Express interest
 * POST /api/matches/:id/skip - Skip
 */
import { Router } from 'express';
import { authenticate } from '../middlewares/auth.js';
import prisma from '../lib/prisma.js';
import { AppError } from '../middlewares/errorHandler.js';
import { checkRateLimit, incrementInterestCount } from '../services/rateLimitService.js';
import { expressInterest, skipMatch } from '../services/consentService.js';
import { getTodayCST } from '../lib/timezone.js';

const router = Router();

/**
 * GET /api/matches/daily
 * Get current user's daily match recommendations
 * Requires authentication
 *
 * Returns today's DailyRecommendation associated Match records,
 * including recommended user's basic profile (name, age, occupation, city, photos)
 */
router.get('/daily', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.userId;

    // Get today's date using unified timezone utility
    const today = getTodayCST();

    // Query today's DailyRecommendation
    const dailyRecommendation = await prisma.dailyRecommendation.findFirst({
      where: {
        userId,
        recommendationDate: today,
      },
    });

    // If no recommendations today, return empty array
    if (!dailyRecommendation || dailyRecommendation.matchIds.length === 0) {
      return res.json({
        code: 'SUCCESS',
        message: 'Daily recommendations retrieved successfully',
        data: [],
      });
    }

    // Query associated Match records with recommended user's profile
    // Support bidirectional: user can be either userA or userB
    const matches = await prisma.match.findMany({
      where: {
        id: { in: dailyRecommendation.matchIds },
      },
      include: {
        userA: {
          include: {
            profile: true,
            photos: {
              orderBy: { sortOrder: 'asc' },
            },
          },
        },
        userB: {
          include: {
            profile: true,
            photos: {
              orderBy: { sortOrder: 'asc' },
            },
          },
        },
      },
    });

    // Format response data - show the OTHER user's info regardless of which side current user is on
    // Filter out expired/closed matches from the response
    const currentYear = new Date().getFullYear();
    const recommendations = matches
      .filter((match) => match.status === 'pending' || match.status === 'matched')
      .map((match) => {
      const isUserA = match.userAId === userId;
      const recommendedUser = isUserA ? match.userB : match.userA;
      const profile = recommendedUser.profile;
      const myChoice = isUserA ? match.userAChoice : match.userBChoice;

      return {
        matchId: match.id,
        score: match.score,
        reason: match.reason,
        status: match.status,
        expiresAt: match.expiresAt,
        myChoice,
        recommendedUser: profile
          ? {
              id: recommendedUser.id,
              name: profile.name,
              age: currentYear - profile.birthYear,
              occupation: profile.occupation,
              city: profile.city,
              photos: recommendedUser.photos.map((p) => ({
                id: p.id,
                url: p.url,
              })),
            }
          : null,
      };
    });

    res.json({
      code: 'SUCCESS',
      message: 'Daily recommendations retrieved successfully',
      data: recommendations,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/matches/:id/interested
 * Express interest in a match
 * Requires authentication, integrates rate limit check (male users max 3 per day)
 */
router.post('/:id/interested', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const matchId = req.params.id;

    // 1. Check rate limit (male users max 3 per day)
    const rateLimitResult = await checkRateLimit(userId);
    if (!rateLimitResult.allowed) {
      throw new AppError(429, 'RATE_LIMIT_EXCEEDED', rateLimitResult.message, {
        nextResetAt: rateLimitResult.nextResetAt,
        remaining: 0,
      });
    }

    // 2. Call consentService to express interest
    const result = await expressInterest(userId, matchId);

    // 3. On success, increment today's interest count
    const countResult = await incrementInterestCount(userId);

    res.json({
      code: 'SUCCESS',
      message: result.status === 'matched' ? 'Match successful! A conversation has been created.' : 'Interest expressed. Waiting for the other party to respond.',
      data: {
        status: result.status,
        conversationId: result.conversationId || null,
        remaining: countResult.remaining,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/matches/:id/skip
 * Skip a match
 * Requires authentication
 */
router.post('/:id/skip', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const matchId = req.params.id;

    // Call consentService to skip match
    const result = await skipMatch(userId, matchId);

    res.json({
      code: 'SUCCESS',
      message: 'Match skipped',
      data: {
        status: result.status,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
