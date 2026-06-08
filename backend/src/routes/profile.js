/**
 * User Profile Routes
 * GET /api/profile - Get current user profile
 * PUT /api/profile - Update user profile
 * POST /api/profile/photos - Upload photo
 * DELETE /api/profile/photos/:id - Delete photo
 */
import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middlewares/auth.js';
import prisma from '../lib/prisma.js';
import { createOrUpdateProfile } from '../services/profileService.js';
import { uploadPhoto, deletePhoto } from '../services/photoService.js';
import { disconnectUser } from '../websocket/index.js';

const router = Router();

// Configure multer: memory storage, file size limit 5MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
});

/**
 * GET /api/profile
 * Get current user's profile and photos
 * Requires authentication
 */
router.get('/', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.userId;

    // Query user profile
    const profile = await prisma.profile.findUnique({
      where: { userId },
    });

    // Query user photos
    const photos = await prisma.photo.findMany({
      where: { userId },
      orderBy: { sortOrder: 'asc' },
    });

    res.json({
      code: 'SUCCESS',
      message: 'Profile retrieved successfully',
      data: {
        profile: profile || null,
        photos,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/profile
 * Update user profile
 * Requires authentication
 * Body: { name, birthYear, gender, occupation, city, bio }
 */
router.put('/', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const data = req.body;

    // Call profileService to create or update profile
    const profile = await createOrUpdateProfile(userId, data);

    // Advance status if conditions met, but never downgrade from preference_set
    const photoCount = await prisma.photo.count({ where: { userId } });
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { status: true } });

    if (user.status === 'registered' && photoCount >= 1) {
      await prisma.user.update({
        where: { id: userId },
        data: { status: 'profile_completed' },
      });
    }

    res.json({
      code: 'SUCCESS',
      message: 'Profile updated successfully',
      data: { profile },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/profile/photos
 * Upload photo (single file, field name 'photo')
 * Requires authentication
 * After upload, check if profile is complete to advance user status
 */
router.post('/photos', authenticate, upload.single('photo'), async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const file = req.file;

    if (!file) {
      return res.status(400).json({
        code: 'MISSING_FILE',
        message: 'Please upload a photo file',
        details: {},
      });
    }

    const photo = await uploadPhoto(userId, file);

    // After successful upload, check if we should advance user status
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { status: true } });
    if (user.status === 'registered') {
      // Check if profile exists
      const profile = await prisma.profile.findUnique({ where: { userId } });
      if (profile) {
        // Profile exists + now has photo → advance to profile_completed
        await prisma.user.update({
          where: { id: userId },
          data: { status: 'profile_completed' },
        });
      }
    }

    res.status(201).json({
      code: 'SUCCESS',
      message: 'Photo uploaded successfully',
      data: { photo },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/profile/photos/:id
 * Delete photo
 * Requires authentication
 */
router.delete('/photos/:id', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const photoId = req.params.id;

    await deletePhoto(userId, photoId);

    // After deletion, check if user still has photos; if not, downgrade status
    const remainingPhotos = await prisma.photo.count({ where: { userId } });
    if (remainingPhotos === 0) {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { status: true } });
      if (user.status === 'profile_completed' || user.status === 'preference_set') {
        await prisma.user.update({
          where: { id: userId },
          data: { status: 'registered' },
        });
      }
    }

    res.json({
      code: 'SUCCESS',
      message: 'Photo deleted successfully',
      data: {},
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/profile/account
 * Delete user account and all associated data
 * Requires authentication
 * This is irreversible - cascading delete of all user data
 */
router.delete('/account', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.userId;

    // Use transaction to delete all user data
    await prisma.$transaction(async (tx) => {
      // Delete offline messages
      await tx.offlineMessage.deleteMany({ where: { userId } });

      // Delete blocks (made by or against user)
      await tx.block.deleteMany({ where: { OR: [{ blockerId: userId }, { blockedUserId: userId }] } });

      // Delete reports made by user
      await tx.report.deleteMany({ where: { reporterId: userId } });

      // Delete reports against user
      await tx.report.deleteMany({ where: { reportedUserId: userId } });

      // Delete messages sent by user
      await tx.message.deleteMany({ where: { senderId: userId } });

      // Delete conversations (as userA or userB)
      const conversations = await tx.conversation.findMany({
        where: { OR: [{ userAId: userId }, { userBId: userId }] },
        select: { id: true },
      });
      for (const conv of conversations) {
        await tx.message.deleteMany({ where: { conversationId: conv.id } });
      }
      await tx.conversation.deleteMany({
        where: { OR: [{ userAId: userId }, { userBId: userId }] },
      });

      // Delete matches
      await tx.match.deleteMany({
        where: { OR: [{ userAId: userId }, { userBId: userId }] },
      });

      // Delete daily recommendations
      await tx.dailyRecommendation.deleteMany({ where: { userId } });

      // Delete rate limits
      await tx.rateLimit.deleteMany({ where: { userId } });

      // Delete invitation codes (owned by this user)
      await tx.invitationCode.deleteMany({ where: { ownerId: userId } });

      // For codes this user consumed: keep them marked as used (don't clear usedById
      // to prevent code reuse). The FK constraint is not CASCADE so we null out the
      // reference but preserve usedAt to indicate the code was consumed.
      await tx.invitationCode.updateMany({
        where: { usedById: userId },
        data: { usedById: null },
      });

      // Clear invitedBy references on users invited by this user
      await tx.user.updateMany({
        where: { invitedBy: userId },
        data: { invitedBy: null },
      });

      // Delete photos, preference, profile (cascade should handle, but explicit)
      await tx.photo.deleteMany({ where: { userId } });
      await tx.preference.deleteMany({ where: { userId } });
      await tx.profile.deleteMany({ where: { userId } });

      // Finally delete the user
      await tx.user.delete({ where: { id: userId } });
    });

    // Disconnect any active WebSocket connections for this user
    disconnectUser(userId);

    res.json({
      code: 'SUCCESS',
      message: 'Account deleted successfully. All your data has been removed.',
      data: {},
    });
  } catch (err) {
    next(err);
  }
});

export default router;
