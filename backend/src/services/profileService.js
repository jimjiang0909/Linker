/**
 * Profile Management Service - Profile creation and update
 * Handles user profile validation, saving, and status updates
 */
import prisma from '../lib/prisma.js';
import { AppError } from '../middlewares/errorHandler.js';

/**
 * Gender mapping: supports both Chinese and English input
 */
const GENDER_MAP = {
  '\u7537': 'male',
  '\u5973': 'female',
  '\u5176\u4ed6': 'other',
  male: 'male',
  female: 'female',
  other: 'other',
};

/**
 * Valid gender values set
 */
const VALID_GENDERS = Object.keys(GENDER_MAP);

/**
 * Valid occupation values (aligned with frontend ProfileOptions and Preference occupationTypes)
 */
const VALID_OCCUPATIONS = [
  'Tech', 'Finance', 'Education', 'Healthcare', 'Design',
  'Legal', 'Media', 'Sales', 'Management', 'Other',
];

/**
 * Validate Profile fields
 * Returns all validation errors (not just the first one)
 *
 * @param {object} data - Profile data
 * @returns {object[]} Validation error list, empty array means validation passed
 */
export function validateProfileFields(data) {
  const errors = [];
  const currentYear = new Date().getFullYear();

  // Check required fields
  const requiredFields = ['name', 'birthYear', 'gender', 'occupation', 'city'];
  const missingFields = requiredFields.filter(
    (field) => data[field] === undefined || data[field] === null || data[field] === ''
  );

  if (missingFields.length > 0) {
    for (const field of missingFields) {
      errors.push({ field, message: `${field} is required` });
    }
  }

  // Name validation: 1-20 characters
  if (data.name !== undefined && data.name !== null && data.name !== '') {
    const name = String(data.name);
    if (name.length < 1 || name.length > 20) {
      errors.push({ field: 'name', message: 'Name must be between 1 and 20 characters' });
    }
  }

  // Birth year validation: age between 18-60
  if (data.birthYear !== undefined && data.birthYear !== null && data.birthYear !== '') {
    const birthYear = Number(data.birthYear);
    if (!Number.isInteger(birthYear)) {
      errors.push({ field: 'birthYear', message: 'Birth year must be an integer' });
    } else {
      const minBirthYear = currentYear - 60;
      const maxBirthYear = currentYear - 18;
      if (birthYear < minBirthYear || birthYear > maxBirthYear) {
        errors.push({
          field: 'birthYear',
          message: `Birth year must be between ${minBirthYear} and ${maxBirthYear} (age 18-60)`,
        });
      }
    }
  }

  // Gender validation: predefined options
  if (data.gender !== undefined && data.gender !== null && data.gender !== '') {
    if (!VALID_GENDERS.includes(data.gender)) {
      errors.push({
        field: 'gender',
        message: 'Gender must be a predefined option (male, female, or other)',
      });
    }
  }

  // Occupation validation: must be a predefined option
  if (data.occupation !== undefined && data.occupation !== null && data.occupation !== '') {
    if (!VALID_OCCUPATIONS.includes(data.occupation)) {
      errors.push({
        field: 'occupation',
        message: `Occupation must be one of: ${VALID_OCCUPATIONS.join(', ')}`,
      });
    }
  }

  // City validation: 1-100 characters
  if (data.city !== undefined && data.city !== null && data.city !== '') {
    const city = String(data.city);
    if (city.length < 1 || city.length > 100) {
      errors.push({ field: 'city', message: 'City must be between 1 and 100 characters' });
    }
  }

  // Bio validation: ≤500 characters (optional)
  if (data.bio !== undefined && data.bio !== null && data.bio !== '') {
    const bio = String(data.bio);
    if (bio.length > 500) {
      errors.push({ field: 'bio', message: 'Bio must not exceed 500 characters' });
    }
  }

  return errors;
}

/**
 * Create or update user Profile
 * After validation, upsert Profile and update user status to profile_completed
 *
 * @param {string} userId - User ID
 * @param {object} data - Profile data
 * @param {object} [deps] - Injectable dependencies (for testing)
 * @param {object} [deps.prismaClient] - Prisma client instance
 * @returns {Promise<object>} Saved Profile object
 */
export async function createOrUpdateProfile(userId, data, deps = {}) {
  const db = deps.prismaClient || prisma;

  // 1. Field validation
  const errors = validateProfileFields(data);
  if (errors.length > 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Profile validation failed', { errors });
  }

  // 2. Convert gender value to English enum
  const genderEnum = GENDER_MAP[data.gender];

  // 3. Build Profile data
  const profileData = {
    name: String(data.name),
    birthYear: Number(data.birthYear),
    gender: genderEnum,
    occupation: String(data.occupation),
    city: String(data.city),
    bio: data.bio ? String(data.bio) : null,
  };

  // 4. Upsert Profile (status management is handled by the route layer)
  const result = await db.profile.upsert({
    where: { userId },
    create: {
      userId,
      ...profileData,
    },
    update: profileData,
  });

  return result;
}
