/**
 * CloudFlare AI Gateway Client
 * Wraps OpenAI SDK, calls ChatGPT through CloudFlare AI Gateway
 * Supports error handling and exponential backoff retry logic
 */
import OpenAI from 'openai';
import { AppError } from '../middlewares/errorHandler.js';

const DEFAULT_BASE_URL =
  'https://gateway.ai.cloudflare.com/v1/4140c0dc09d603923bdce539c8c83714/jim/openai';
const DEFAULT_MODEL = 'gpt-4o-mini';
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

/**
 * Create OpenAI client instance
 * @param {object} [options] - Optional configuration
 * @param {string} [options.apiKey] - OpenAI API Key
 * @param {string} [options.baseURL] - CloudFlare AI Gateway baseURL
 * @param {string} [options.cfAigToken] - CloudFlare AI Gateway Token
 * @returns {OpenAI} OpenAI client instance
 */
export function createClient(options = {}) {
  const cfAigToken = options.cfAigToken || process.env.CF_AIG_TOKEN;
  const apiKey = options.apiKey || cfAigToken || process.env.OPENAI_API_KEY;
  const baseURL = options.baseURL || process.env.CF_AIG_BASE_URL || DEFAULT_BASE_URL;

  if (!apiKey) {
    throw new AppError(500, 'AI_CONFIG_ERROR', 'OPENAI_API_KEY not configured');
  }

  return new OpenAI({ apiKey, baseURL });
}

/**
 * Delay for specified milliseconds
 * @param {number} ms - Delay in milliseconds
 * @returns {Promise<void>}
 */
export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Determine if error is retryable
 * @param {Error} error - Error object
 * @returns {boolean} Whether retryable
 */
export function isRetryableError(error) {
  // Network errors, timeouts, server errors (5xx), rate limits (429) are retryable
  if (error?.status === 429) return true;
  if (error?.status >= 500) return true;
  if (error?.code === 'ECONNRESET' || error?.code === 'ETIMEDOUT') return true;
  if (error?.code === 'ENOTFOUND' || error?.code === 'ECONNREFUSED') return true;
  return false;
}

/**
 * Call ChatGPT completion (with retry logic)
 *
 * @param {Array<{role: string, content: string}>} messages - Conversation messages array
 * @param {object} [options] - Optional parameters
 * @param {string} [options.model] - Model name, default gpt-4o-mini
 * @param {number} [options.temperature] - Temperature parameter
 * @param {number} [options.max_tokens] - Max tokens
 * @param {object} [options.response_format] - Response format
 * @param {object} [deps] - Injectable dependencies (for testing)
 * @param {OpenAI} [deps.client] - OpenAI client instance
 * @param {number} [deps.maxRetries] - Max retry count
 * @param {number} [deps.baseDelay] - Base delay in milliseconds
 * @param {function} [deps.delayFn] - Delay function (for skipping wait in tests)
 * @returns {Promise<string>} AI response content
 */
export async function chatCompletion(messages, options = {}, deps = {}) {
  const client = deps.client || createClient();
  const maxRetries = deps.maxRetries ?? MAX_RETRIES;
  const baseDelay = deps.baseDelay ?? BASE_DELAY_MS;
  const delayFn = deps.delayFn || delay;

  const { model = DEFAULT_MODEL, temperature, max_tokens, response_format } = options;

  const requestParams = {
    model,
    messages,
  };

  if (temperature !== undefined) requestParams.temperature = temperature;
  if (max_tokens !== undefined) requestParams.max_tokens = max_tokens;
  if (response_format !== undefined) requestParams.response_format = response_format;

  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await client.chat.completions.create(requestParams);

      const content = response.choices?.[0]?.message?.content;
      if (!content) {
        throw new AppError(500, 'AI_EMPTY_RESPONSE', 'AI returned an empty response');
      }

      return content;
    } catch (error) {
      lastError = error;

      // If already an AppError (e.g., empty response), throw directly without retry
      if (error instanceof AppError) {
        throw error;
      }

      // Determine if retryable
      if (attempt < maxRetries && isRetryableError(error)) {
        const delayMs = baseDelay * Math.pow(2, attempt);
        await delayFn(delayMs);
        continue;
      }

      // Not retryable or max retries reached, throw error
      break;
    }
  }

  // Wrap OpenAI error as AppError
  const statusCode = lastError?.status || 500;
  const errorCode = mapErrorCode(lastError);
  const errorMessage = lastError?.message || 'AI service call failed';

  throw new AppError(
    statusCode >= 400 && statusCode < 600 ? statusCode : 500,
    errorCode,
    errorMessage,
    { originalError: lastError?.code || lastError?.type || 'unknown' }
  );
}

/**
 * Map OpenAI SDK error to application error code
 * @param {Error} error - Error object
 * @returns {string} Application error code
 */
function mapErrorCode(error) {
  if (!error) return 'AI_UNKNOWN_ERROR';

  const status = error.status;
  if (status === 401) return 'AI_AUTH_ERROR';
  if (status === 429) return 'AI_RATE_LIMIT';
  if (status === 400) return 'AI_BAD_REQUEST';
  if (status === 404) return 'AI_MODEL_NOT_FOUND';
  if (status >= 500) return 'AI_SERVICE_ERROR';

  if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') return 'AI_TIMEOUT';
  if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') return 'AI_NETWORK_ERROR';

  return 'AI_UNKNOWN_ERROR';
}
