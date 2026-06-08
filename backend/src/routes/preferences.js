/**
 * Preferences Routes
 * GET /api/preferences - Get current user preferences
 * PUT /api/preferences - Create or update preferences
 */
import { Router } from 'express';
import { authenticate } from '../middlewares/auth.js';
import prisma from '../lib/prisma.js';
import { createOrUpdatePreference } from '../services/preferenceService.js';
import { generateDailyRecommendations } from '../services/aiMatchService.js';
import { emitToUser } from '../websocket/index.js';

const router = Router();

/**
 * GET /api/preferences
 * Get current user's preferences
 * Requires authentication
 */
router.get('/', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.userId;

    const preference = await prisma.preference.findUnique({
      where: { userId },
    });

    res.json({
      code: 'SUCCESS',
      message: 'Preferences retrieved successfully',
      data: preference || {},
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/preferences
 * Create or update current user's preferences
 * Requires authentication
 * Body: { ageMin, ageMax, datingIntent, occupationTypes?, personalityTraits? }
 */
router.put('/', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.userId;

    const preference = await createOrUpdatePreference(userId, req.body);

    // 异步触发首次推荐生成（不阻塞响应）
    generateDailyRecommendations(userId).then((result) => {
      if (result && result.matchIds && result.matchIds.length > 0) {
        emitToUser(userId, 'recommendation:new', { count: result.matchIds.length });
      }
    }).catch((err) => {
      console.error('[Preferences] Auto-recommendation failed:', err.message);
    });

    res.json({
      code: 'SUCCESS',
      message: 'Preferences saved successfully',
      data: preference,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
