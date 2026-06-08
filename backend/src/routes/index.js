import { Router } from 'express';
import authRoutes from './auth.js';
import invitationsRoutes from './invitations.js';
import profileRoutes from './profile.js';
import blockRoutes from './blocks.js';
import preferencesRoutes from './preferences.js';
import matchesRoutes from './matches.js';
import conversationsRoutes from './conversations.js';

const router = Router();

// Auth module
router.use('/auth', authRoutes);

// Invitation code module
router.use('/invitations', invitationsRoutes);

// User profile module
router.use('/profile', profileRoutes);

// Block module (under profile)
router.use('/profile', blockRoutes);

// Preferences module
router.use('/preferences', preferencesRoutes);

// Match recommendation module
router.use('/matches', matchesRoutes);

// Chat module
router.use('/conversations', conversationsRoutes);

export default router;
