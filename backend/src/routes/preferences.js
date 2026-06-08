/**
 * Preferences Routes
 * GET /api/preferences - Get current user preferences
 * PUT /api/preferences - Create or update preferences
 */
import { Router } from 'express';
import { authenticate } from '../middlewares/auth.js';
import prisma from '../lib/prisma.js';
import { createOrUpdatePreference } from '../services/preferenceService.js';

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
