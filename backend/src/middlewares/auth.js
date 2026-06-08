import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma.js';

/**
 * In-memory cache for user status checks
 * Reduces database queries for high-frequency authenticated requests
 * TTL: 60 seconds
 */
const statusCache = new Map();
const CACHE_TTL_MS = 60 * 1000; // 60 seconds

/**
 * Get user status with caching
 * @param {string} userId - User ID
 * @returns {Promise<string|null>} User status or null if not found
 */
async function getUserStatus(userId) {
  const cached = statusCache.get(userId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.status;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { status: true },
  });

  if (user) {
    statusCache.set(userId, { status: user.status, timestamp: Date.now() });
    return user.status;
  }

  return null;
}

/**
 * Invalidate cache for a specific user (call when user status changes)
 * @param {string} userId - User ID
 */
export function invalidateUserStatusCache(userId) {
  statusCache.delete(userId);
}

/**
 * Clear entire status cache (for testing)
 */
export function clearStatusCache() {
  statusCache.clear();
}

/**
 * JWT authentication middleware
 * Extracts Bearer Token from Authorization header and verifies it
 * Also checks if user account is suspended (with caching)
 */
export function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      code: 'UNAUTHORIZED',
      message: 'Missing authentication token',
      details: {},
    });
  }

  const token = authHeader.slice(7);

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;

    // Check if user is suspended (with cache)
    getUserStatus(decoded.userId)
      .then((status) => {
        if (status === null) {
          return res.status(401).json({
            code: 'USER_NOT_FOUND',
            message: 'User account not found',
            details: {},
          });
        }

        if (status === 'suspended') {
          return res.status(403).json({
            code: 'ACCOUNT_SUSPENDED',
            message: 'Your account has been suspended due to policy violations',
            details: {},
          });
        }

        next();
      })
      .catch((err) => {
        next(err);
      });
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        code: 'TOKEN_EXPIRED',
        message: 'Authentication token has expired',
        details: {},
      });
    }

    return res.status(401).json({
      code: 'INVALID_TOKEN',
      message: 'Invalid authentication token',
      details: {},
    });
  }
}
