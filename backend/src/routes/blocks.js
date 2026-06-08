/**
 * Block Routes
 * POST /api/profile/block - Block a user
 * DELETE /api/profile/block/:userId - Unblock a user
 * GET /api/profile/blocked - Get blocked users list
 */
import { Router } from 'express';
import { authenticate } from '../middlewares/auth.js';
import prisma from '../lib/prisma.js';
import { AppError } from '../middlewares/errorHandler.js';

const router = Router();

/**
 * POST /api/profile/block
 * Block a user
 * Requires authentication
 * Body: { userId: string }
 */
router.post('/block', authenticate, async (req, res, next) => {
  try {
    const blockerId = req.user.userId;
    const { userId: blockedUserId } = req.body;

    if (!blockedUserId) {
      throw new AppError(400, 'MISSING_USER_ID', 'Please specify the user to block');
    }

    if (blockerId === blockedUserId) {
      throw new AppError(400, 'CANNOT_BLOCK_SELF', 'You cannot block yourself');
    }

    // Check target user exists
    const targetUser = await prisma.user.findUnique({
      where: { id: blockedUserId },
      select: { id: true },
    });

    if (!targetUser) {
      throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
    }

    // Check if already blocked
    const existingBlock = await prisma.block.findUnique({
      where: {
        blockerId_blockedUserId: {
          blockerId,
          blockedUserId,
        },
      },
    });

    if (existingBlock) {
      throw new AppError(409, 'ALREADY_BLOCKED', 'You have already blocked this user');
    }

    // Create block record
    const block = await prisma.block.create({
      data: {
        blockerId,
        blockedUserId,
      },
    });

    // Close any pending matches between these users
    await prisma.match.updateMany({
      where: {
        status: 'pending',
        OR: [
          { userAId: blockerId, userBId: blockedUserId },
          { userAId: blockedUserId, userBId: blockerId },
        ],
      },
      data: { status: 'closed' },
    });

    // End any active conversations between these users
    await prisma.conversation.updateMany({
      where: {
        status: 'active',
        OR: [
          { userAId: blockerId, userBId: blockedUserId },
          { userAId: blockedUserId, userBId: blockerId },
        ],
      },
      data: { status: 'ended', endedAt: new Date() },
    });

    res.status(201).json({
      code: 'SUCCESS',
      message: 'User blocked successfully',
      data: {
        id: block.id,
        blockedUserId,
        createdAt: block.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/profile/block/:userId
 * Unblock a user
 * Requires authentication
 */
router.delete('/block/:userId', authenticate, async (req, res, next) => {
  try {
    const blockerId = req.user.userId;
    const blockedUserId = req.params.userId;

    const block = await prisma.block.findUnique({
      where: {
        blockerId_blockedUserId: {
          blockerId,
          blockedUserId,
        },
      },
    });

    if (!block) {
      throw new AppError(404, 'BLOCK_NOT_FOUND', 'Block record not found');
    }

    await prisma.block.delete({
      where: { id: block.id },
    });

    res.json({
      code: 'SUCCESS',
      message: 'User unblocked successfully',
      data: {},
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/profile/blocked
 * Get list of blocked users
 * Requires authentication
 */
router.get('/blocked', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.userId;

    const blocks = await prisma.block.findMany({
      where: { blockerId: userId },
      include: {
        blockedUser: {
          include: {
            profile: {
              select: { name: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const blockedList = blocks.map((block) => ({
      id: block.blockedUserId,
      name: block.blockedUser.profile?.name || null,
      blockedAt: block.createdAt,
    }));

    res.json({
      code: 'SUCCESS',
      message: 'Blocked users retrieved successfully',
      data: blockedList,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
