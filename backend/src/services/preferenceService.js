/**
 * Preference Service - User matching preference management
 * Handles preference data validation, creation, and update
 */
import prisma from '../lib/prisma.js';
import { AppError } from '../middlewares/errorHandler.js';

/**
 * Valid dating intent options and their mapping
 * Chinese → database enum value
 */
const DATING_INTENT_MAP = {
  '\u8ba4\u771f\u7ea6\u4f1a': 'serious_dating',
  '\u8f7b\u793e\u4ea4': 'casual_social',
  '\u4ea4\u670b\u53cb': 'make_friends',
};

/**
 * Valid dating intent options list (Chinese)
 */
const VALID_DATING_INTENTS = Object.keys(DATING_INTENT_MAP);

/**
 * Valid dating intent enum values list (database values)
 */
const VALID_DATING_INTENT_ENUMS = Object.values(DATING_INTENT_MAP);

/**
 * Validate preference data
 * Collects all errors and returns them at once
 *
 * @param {object} data - Preference data
 * @param {number} [data.ageMin] - Preferred minimum age
 * @param {number} [data.ageMax] - Preferred maximum age
 * @param {string} [data.datingIntent] - Dating intent (Chinese or enum value)
 * @param {string[]} [data.occupationTypes] - Preferred occupation types
 * @param {string[]} [data.personalityTraits] - Preferred personality traits
 * @returns {string[]} Error message list, empty array means validation passed
 */
export function validatePreference(data) {
  const errors = [];

  // 1. Required field check: age range
  if (data.ageMin === null || data.ageMin === undefined || data.ageMin === '') {
    errors.push('Minimum age is required');
  }
  if (data.ageMax === null || data.ageMax === undefined || data.ageMax === '') {
    errors.push('Maximum age is required');
  }

  // 2. Required field check: dating intent
  if (!data.datingIntent) {
    errors.push('Dating intent is required');
  }

  // 3. Age range validation (only when values are present)
  if (data.ageMin !== null && data.ageMin !== undefined && data.ageMin !== '') {
    const ageMin = Number(data.ageMin);
    if (!Number.isInteger(ageMin) || ageMin < 18 || ageMin > 60) {
      errors.push('Minimum age must be between 18 and 60');
    }
  }
  if (data.ageMax !== null && data.ageMax !== undefined && data.ageMax !== '') {
    const ageMax = Number(data.ageMax);
    if (!Number.isInteger(ageMax) || ageMax < 18 || ageMax > 60) {
      errors.push('Maximum age must be between 18 and 60');
    }
  }

  // 4. Age range logic validation: min ≤ max and span ≥ 1
  if (
    data.ageMin !== null && data.ageMin !== undefined &&
    data.ageMin !== '' &&
    data.ageMax !== null && data.ageMax !== undefined &&
    data.ageMax !== ''
  ) {
    const ageMin = Number(data.ageMin);
    const ageMax = Number(data.ageMax);
    if (Number.isInteger(ageMin) && Number.isInteger(ageMax)) {
      if (ageMin > ageMax) {
        errors.push('Invalid age range: minimum cannot be greater than maximum');
      } else if (ageMax - ageMin < 1) {
        errors.push('Age range span must be at least 1 year');
      }
    }
  }

  // 5. Dating intent validity check
  if (data.datingIntent) {
    const isValidChinese = VALID_DATING_INTENTS.includes(data.datingIntent);
    const isValidEnum = VALID_DATING_INTENT_ENUMS.includes(data.datingIntent);
    if (!isValidChinese && !isValidEnum) {
      errors.push(
        `Invalid dating intent. Must be one of: ${VALID_DATING_INTENT_ENUMS.join(', ')}`
      );
    }
  }

  // 6. Occupation types count validation (optional, max 5)
  if (data.occupationTypes !== null && data.occupationTypes !== undefined) {
    if (!Array.isArray(data.occupationTypes)) {
      errors.push('Occupation types must be an array');
    } else if (data.occupationTypes.length > 5) {
      errors.push('Occupation types cannot exceed 5 items');
    }
  }

  // 7. Personality traits count validation (optional, max 5)
  if (data.personalityTraits !== null && data.personalityTraits !== undefined) {
    if (!Array.isArray(data.personalityTraits)) {
      errors.push('Personality traits must be an array');
    } else if (data.personalityTraits.length > 5) {
      errors.push('Personality traits cannot exceed 5 items');
    }
  }

  return errors;
}

/**
 * Convert dating intent to database enum value
 * Supports both Chinese input and direct enum value
 *
 * @param {string} intent - Dating intent (Chinese or enum value)
 * @returns {string} Database enum value
 */
export function normalizeDatingIntent(intent) {
  if (VALID_DATING_INTENT_ENUMS.includes(intent)) {
    return intent;
  }
  return DATING_INTENT_MAP[intent] || intent;
}

/**
 * Create or update user preferences
 * After validation, upsert preference and update user status to preference_set
 *
 * @param {string} userId - User ID
 * @param {object} data - Preference data
 * @param {number} data.ageMin - Preferred minimum age
 * @param {number} data.ageMax - Preferred maximum age
 * @param {string} data.datingIntent - Dating intent
 * @param {string[]} [data.occupationTypes] - Preferred occupation types
 * @param {string[]} [data.personalityTraits] - Preferred personality traits
 * @param {object} [deps] - Injectable dependencies (for testing)
 * @param {object} [deps.prismaClient] - Prisma client instance
 * @returns {Promise<object>} Saved preference
 */
export async function createOrUpdatePreference(userId, data, deps = {}) {
  const db = deps.prismaClient || prisma;

  // 1. Validate input data
  const errors = validatePreference(data);
  if (errors.length > 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Preference validation failed', { errors });
  }

  // 1.5 Check user has completed profile before allowing preference setting
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { status: true },
  });
  if (!user) {
    throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
  }
  if (user.status === 'registered') {
    throw new AppError(400, 'PROFILE_NOT_COMPLETED', 'Please complete your profile and upload at least one photo before setting preferences');
  }

  // 2. Convert dating intent to enum value
  const datingIntent = normalizeDatingIntent(data.datingIntent);

  // 3. Prepare save data
  const preferenceData = {
    ageMin: Number(data.ageMin),
    ageMax: Number(data.ageMax),
    datingIntent,
    occupationTypes: data.occupationTypes || [],
    personalityTraits: data.personalityTraits || [],
  };

  // 4. Use transaction: upsert preference + conditionally update user status
  const updateStatusNeeded = user.status === 'profile_completed';

  const txOps = [
    db.preference.upsert({
      where: { userId },
      create: {
        userId,
        ...preferenceData,
      },
      update: preferenceData,
    }),
  ];

  if (updateStatusNeeded) {
    txOps.push(
      db.user.update({
        where: { id: userId },
        data: { status: 'preference_set' },
      })
    );
  }

  const [preference] = await db.$transaction(txOps);

  return preference;
}
