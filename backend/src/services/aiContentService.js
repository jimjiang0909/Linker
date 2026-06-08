/**
 * AI Content Generation Service - Generate personalized introductions and icebreakers
 * When Mutual_Consent is reached, generate conversation opening content for both parties
 * Supports fallback logic: use preset generic templates when AI fails
 */
import { chatCompletion } from './cfaiClient.js';

/**
 * Preset generic icebreakers (fallback when AI fails)
 */
const DEFAULT_ICEBREAKERS = [
  'Any interesting stories to share recently?',
  'What do you like to do to relax?',
  'If you had a day off, where would you most like to go?',
];

/**
 * Generate fallback introduction template (includes both parties' names)
 *
 * @param {object} userA - User A (with profile)
 * @param {object} userB - User B (with profile)
 * @returns {string} Generic introduction
 */
export function buildFallbackIntroduction(userA, userB) {
  const nameA = userA.profile?.name || 'User A';
  const nameB = userB.profile?.name || 'User B';
  return `Hello! ${nameA} and ${nameB}, you have been successfully matched. Hope you enjoy chatting and find common topics!`;
}

/**
 * Build AI prompt for introduction generation
 *
 * @param {object} userA - User A (with profile)
 * @param {object} userB - User B (with profile)
 * @returns {Array<{role: string, content: string}>} Messages array
 */
export function buildIntroductionPrompt(userA, userB) {
  const currentYear = new Date().getFullYear();
  const profileA = userA.profile || {};
  const profileB = userB.profile || {};

  const systemMessage = {
    role: 'system',
    content: `You are an introduction generator for a social platform. Generate a personalized introduction for two newly matched users.

Requirements:
1. Total length must not exceed 200 characters
2. Must include at least one specific piece of information from both profiles (e.g., occupation, city, interests)
3. Tone should be friendly and natural, guiding both parties to start a conversation
4. Return only the introduction text without any extra formatting or markers`,
  };

  const userMessage = {
    role: 'user',
    content: `Please generate an introduction for the following two users:

User A:
- Name: ${profileA.name || 'Unknown'}
- Age: ${profileA.birthYear ? currentYear - profileA.birthYear : 'Unknown'}
- Occupation: ${profileA.occupation || 'Unknown'}
- City: ${profileA.city || 'Unknown'}
- Bio: ${profileA.bio || 'None'}

User B:
- Name: ${profileB.name || 'Unknown'}
- Age: ${profileB.birthYear ? currentYear - profileB.birthYear : 'Unknown'}
- Occupation: ${profileB.occupation || 'Unknown'}
- City: ${profileB.city || 'Unknown'}
- Bio: ${profileB.bio || 'None'}`,
  };

  return [systemMessage, userMessage];
}

/**
 * Build AI prompt for icebreaker generation
 *
 * @param {object} userA - User A (with profile)
 * @param {object} userB - User B (with profile)
 * @returns {Array<{role: string, content: string}>} Messages array
 */
export function buildIcebreakersPrompt(userA, userB) {
  const profileA = userA.profile || {};
  const profileB = userB.profile || {};

  const systemMessage = {
    role: 'system',
    content: `You are an icebreaker topic generator for a social platform. Generate icebreaker suggestions for two newly matched users.

Requirements:
1. Generate 2 to 3 icebreaker topics
2. Each topic must not exceed 50 characters
3. Topics should be based on both profiles and potential common interests
4. Return in JSON array format, e.g.: ["Topic 1", "Topic 2", "Topic 3"]
5. Return only the JSON array without any other content`,
  };

  const userMessage = {
    role: 'user',
    content: `Please generate icebreaker topics for the following two users:

User A:
- Name: ${profileA.name || 'Unknown'}
- Occupation: ${profileA.occupation || 'Unknown'}
- City: ${profileA.city || 'Unknown'}
- Bio: ${profileA.bio || 'None'}

User B:
- Name: ${profileB.name || 'Unknown'}
- Occupation: ${profileB.occupation || 'Unknown'}
- City: ${profileB.city || 'Unknown'}
- Bio: ${profileB.bio || 'None'}`,
  };

  return [systemMessage, userMessage];
}

/**
 * Validate if introduction contains at least one piece of Profile info
 *
 * @param {string} introduction - Introduction text
 * @param {object} userA - User A (with profile)
 * @param {object} userB - User B (with profile)
 * @returns {boolean} Whether it contains Profile info
 */
export function containsProfileInfo(introduction, userA, userB) {
  const profileA = userA.profile || {};
  const profileB = userB.profile || {};

  const profileFields = [
    profileA.name,
    profileA.occupation,
    profileA.city,
    profileB.name,
    profileB.occupation,
    profileB.city,
  ].filter(Boolean);

  return profileFields.some((field) => introduction.includes(field));
}

/**
 * Parse icebreakers AI response
 *
 * @param {string} aiResponse - AI returned JSON string
 * @returns {string[]} Icebreakers array
 */
export function parseIcebreakersResponse(aiResponse) {
  try {
    let jsonStr = aiResponse.trim();

    // Try to extract JSON (AI may return with markdown code blocks)
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    const result = JSON.parse(jsonStr);

    if (!Array.isArray(result)) {
      return null;
    }

    // Filter and truncate topics
    const icebreakers = result
      .filter((item) => typeof item === 'string' && item.trim().length > 0)
      .map((item) => (item.length > 50 ? item.substring(0, 50) : item));

    // Ensure count is between 2-3
    if (icebreakers.length < 2) {
      return null;
    }

    return icebreakers.slice(0, 3);
  } catch {
    return null;
  }
}

/**
 * Generate personalized introduction
 * Falls back to preset generic template when AI fails
 *
 * @param {object} userA - User A (with profile)
 * @param {object} userB - User B (with profile)
 * @param {object} [deps] - Injectable dependencies (for testing)
 * @param {function} [deps.chatCompletionFn] - AI chat completion function
 * @param {object} [deps.chatCompletionDeps] - chatCompletion dependencies
 * @returns {Promise<string>} Introduction text
 */
export async function generateIntroduction(userA, userB, deps = {}) {
  const chatCompletionFn = deps.chatCompletionFn || chatCompletion;

  try {
    const messages = buildIntroductionPrompt(userA, userB);

    const response = await chatCompletionFn(
      messages,
      {
        temperature: 0.7,
        max_tokens: 300,
      },
      deps.chatCompletionDeps || {}
    );

    let introduction = response.trim();

    // Ensure length does not exceed 200 characters
    if (introduction.length > 200) {
      introduction = introduction.substring(0, 200);
    }

    // Validate if it contains Profile info, use fallback template if not
    if (!containsProfileInfo(introduction, userA, userB)) {
      return buildFallbackIntroduction(userA, userB);
    }

    return introduction;
  } catch (error) {
    // AI call failed, use fallback template
    console.error('[AI Content] generateIntroduction failed:', error.message);
    return buildFallbackIntroduction(userA, userB);
  }
}

/**
 * Generate icebreaker suggestions
 * Falls back to preset generic icebreakers when AI fails
 *
 * @param {object} userA - User A (with profile)
 * @param {object} userB - User B (with profile)
 * @param {object} [deps] - Injectable dependencies (for testing)
 * @param {function} [deps.chatCompletionFn] - AI chat completion function
 * @param {object} [deps.chatCompletionDeps] - chatCompletion dependencies
 * @returns {Promise<string[]>} Icebreakers array (2-3 items)
 */
export async function generateIcebreakers(userA, userB, deps = {}) {
  const chatCompletionFn = deps.chatCompletionFn || chatCompletion;

  try {
    const messages = buildIcebreakersPrompt(userA, userB);

    const response = await chatCompletionFn(
      messages,
      {
        temperature: 0.7,
        max_tokens: 200,
      },
      deps.chatCompletionDeps || {}
    );

    const icebreakers = parseIcebreakersResponse(response);

    // Use fallback if parsing fails
    if (!icebreakers) {
      return [...DEFAULT_ICEBREAKERS];
    }

    return icebreakers;
  } catch (error) {
    // AI call failed, use fallback template
    console.error('[AI Content] generateIcebreakers failed:', error.message);
    return [...DEFAULT_ICEBREAKERS];
  }
}
