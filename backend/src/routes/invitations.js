/**
 * Invitation Code Routes
 * GET /api/invitations - Get my invitation codes
 * GET /api/invitations/invitees - Get invited users list
 * POST /api/invitations/validate - Validate invitation code
 */
import { Router } from 'express';
import { authenticate } from '../middlewares/auth.js';
import prisma from '../lib/prisma.js';
import { validateInvitationCode, generateUniqueCodeInTx } from '../services/inviteService.js';

const router = Router();

/**
 * GET /api/invitations
 * Get current user's invitation codes
 * Requires authentication
 */
router.get('/', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.userId;

    // Auto-replenish: ensure user always has 3 available (unused & unexpired) codes
    const availableCount = await prisma.invitationCode.count({
      where: {
        ownerId: userId,
        usedById: null,
        expiresAt: { gt: new Date() },
      },
    });

    if (availableCount < 3) {
      const toGenerate = 3 - availableCount;
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      await prisma.$transaction(async (tx) => {
        for (let i = 0; i < toGenerate; i++) {
          const code = await generateUniqueCodeInTx(tx);
          await tx.invitationCode.create({
            data: {
              code,
              ownerId: userId,
              source: 'user',
              expiresAt,
            },
          });
        }
      });
    }

    const invitationCodes = await prisma.invitationCode.findMany({
      where: { ownerId: userId },
      select: {
        id: true,
        code: true,
        source: true,
        expiresAt: true,
        usedAt: true,
        usedById: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Add status info for each invitation code
    const codesWithStatus = invitationCodes.map((item) => {
      let status = 'available';
      if (item.usedById) {
        status = 'used';
      } else if (new Date() > item.expiresAt) {
        status = 'expired';
      }
      return {
        id: item.id,
        code: item.code,
        source: item.source,
        status,
        expiresAt: item.expiresAt,
        usedAt: item.usedAt,
        createdAt: item.createdAt,
      };
    });

    res.json({
      code: 'SUCCESS',
      message: 'Invitation codes retrieved successfully',
      data: codesWithStatus,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/invitations/invitees
 * Get current user's invited users list (with name and registration time)
 * Requires authentication
 */
router.get('/invitees', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.userId;

    const invitees = await prisma.user.findMany({
      where: { invitedBy: userId },
      select: {
        id: true,
        createdAt: true,
        profile: {
          select: {
            name: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const inviteeList = invitees.map((invitee) => ({
      id: invitee.id,
      name: invitee.profile?.name || null,
      registeredAt: invitee.createdAt,
    }));

    res.json({
      code: 'SUCCESS',
      message: 'Invitees retrieved successfully',
      data: inviteeList,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/invitations/validate
 * Validate invitation code (no authentication required)
 * Body: { code: string }
 */
router.post('/validate', async (req, res, next) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({
        code: 'MISSING_CODE',
        message: 'Please provide an invitation code',
        details: {},
      });
    }

    const result = await validateInvitationCode(code);

    if (!result.valid) {
      return res.status(400).json({
        code: `INVITATION_${result.reason}`,
        message: result.message,
        details: { reason: result.reason },
      });
    }

    res.json({
      code: 'SUCCESS',
      message: 'Invitation code is valid',
      data: { valid: true },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
