/**
 * CloudFlare AI Gateway 客户端单元测试
 */
import { jest } from '@jest/globals';
import { chatCompletion, createClient, isRetryableError, delay } from '../../../src/services/cfaiClient.js';
import { AppError } from '../../../src/middlewares/errorHandler.js';

describe('cfaiClient', () => {
  describe('createClient', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('应在未配置 OPENAI_API_KEY 时抛出 AppError', () => {
      delete process.env.OPENAI_API_KEY;
      expect(() => createClient()).toThrow(AppError);
      expect(() => createClient()).toThrow('OPENAI_API_KEY 未配置');
    });

    it('应使用环境变量创建客户端', () => {
      process.env.OPENAI_API_KEY = 'test-key';
      process.env.CF_AIG_BASE_URL = 'https://custom-gateway.example.com';
      process.env.CF_AIG_TOKEN = 'cf-token';

      const client = createClient();
      expect(client).toBeDefined();
    });

    it('应使用传入的 options 覆盖环境变量', () => {
      process.env.OPENAI_API_KEY = 'env-key';

      const client = createClient({
        apiKey: 'custom-key',
        baseURL: 'https://custom.example.com',
        cfAigToken: 'custom-token',
      });
      expect(client).toBeDefined();
    });

    it('应在未配置 CF_AIG_TOKEN 时不添加 cf-aig-authorization 头', () => {
      process.env.OPENAI_API_KEY = 'test-key';
      delete process.env.CF_AIG_TOKEN;

      const client = createClient();
      expect(client).toBeDefined();
    });
  });

  describe('isRetryableError', () => {
    it('应对 429 状态码返回 true', () => {
      expect(isRetryableError({ status: 429 })).toBe(true);
    });

    it('应对 500 状态码返回 true', () => {
      expect(isRetryableError({ status: 500 })).toBe(true);
    });

    it('应对 502 状态码返回 true', () => {
      expect(isRetryableError({ status: 502 })).toBe(true);
    });

    it('应对 503 状态码返回 true', () => {
      expect(isRetryableError({ status: 503 })).toBe(true);
    });

    it('应对 ECONNRESET 错误返回 true', () => {
      expect(isRetryableError({ code: 'ECONNRESET' })).toBe(true);
    });

    it('应对 ETIMEDOUT 错误返回 true', () => {
      expect(isRetryableError({ code: 'ETIMEDOUT' })).toBe(true);
    });

    it('应对 ENOTFOUND 错误返回 true', () => {
      expect(isRetryableError({ code: 'ENOTFOUND' })).toBe(true);
    });

    it('应对 ECONNREFUSED 错误返回 true', () => {
      expect(isRetryableError({ code: 'ECONNREFUSED' })).toBe(true);
    });

    it('应对 400 状态码返回 false', () => {
      expect(isRetryableError({ status: 400 })).toBe(false);
    });

    it('应对 401 状态码返回 false', () => {
      expect(isRetryableError({ status: 401 })).toBe(false);
    });

    it('应对 null 返回 false', () => {
      expect(isRetryableError(null)).toBe(false);
    });
  });

  describe('chatCompletion', () => {
    const mockMessages = [
      { role: 'system', content: '你是一个助手' },
      { role: 'user', content: '你好' },
    ];

    function createMockClient(response) {
      return {
        chat: {
          completions: {
            create: jest.fn().mockResolvedValue(response),
          },
        },
      };
    }

    function createFailingClient(error) {
      return {
        chat: {
          completions: {
            create: jest.fn().mockRejectedValue(error),
          },
        },
      };
    }

    const noopDelay = () => Promise.resolve();

    it('应成功返回 AI 响应内容', async () => {
      const mockClient = createMockClient({
        choices: [{ message: { content: '你好！有什么可以帮助你的？' } }],
      });

      const result = await chatCompletion(mockMessages, {}, { client: mockClient });
      expect(result).toBe('你好！有什么可以帮助你的？');
    });

    it('应使用默认模型 gpt-4o-mini', async () => {
      const mockClient = createMockClient({
        choices: [{ message: { content: '响应' } }],
      });

      await chatCompletion(mockMessages, {}, { client: mockClient });
      expect(mockClient.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'gpt-4o-mini' })
      );
    });

    it('应支持自定义模型和参数', async () => {
      const mockClient = createMockClient({
        choices: [{ message: { content: '响应' } }],
      });

      await chatCompletion(
        mockMessages,
        { model: 'gpt-4o', temperature: 0.7, max_tokens: 500 },
        { client: mockClient }
      );

      expect(mockClient.chat.completions.create).toHaveBeenCalledWith({
        model: 'gpt-4o',
        messages: mockMessages,
        temperature: 0.7,
        max_tokens: 500,
      });
    });

    it('应支持 response_format 参数', async () => {
      const mockClient = createMockClient({
        choices: [{ message: { content: '{"key": "value"}' } }],
      });

      await chatCompletion(
        mockMessages,
        { response_format: { type: 'json_object' } },
        { client: mockClient }
      );

      expect(mockClient.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({ response_format: { type: 'json_object' } })
      );
    });

    it('应在 AI 返回空响应时抛出 AppError', async () => {
      const mockClient = createMockClient({
        choices: [{ message: { content: null } }],
      });

      await expect(chatCompletion(mockMessages, {}, { client: mockClient })).rejects.toThrow(
        AppError
      );
      await expect(chatCompletion(mockMessages, {}, { client: mockClient })).rejects.toMatchObject({
        code: 'AI_EMPTY_RESPONSE',
      });
    });

    it('应在 choices 为空时抛出 AppError', async () => {
      const mockClient = createMockClient({ choices: [] });

      await expect(chatCompletion(mockMessages, {}, { client: mockClient })).rejects.toThrow(
        AppError
      );
    });

    it('应对可重试错误进行重试', async () => {
      const error = new Error('Service unavailable');
      error.status = 503;

      const mockClient = {
        chat: {
          completions: {
            create: jest
              .fn()
              .mockRejectedValueOnce(error)
              .mockRejectedValueOnce(error)
              .mockResolvedValueOnce({
                choices: [{ message: { content: '重试成功' } }],
              }),
          },
        },
      };

      const result = await chatCompletion(
        mockMessages,
        {},
        { client: mockClient, delayFn: noopDelay }
      );

      expect(result).toBe('重试成功');
      expect(mockClient.chat.completions.create).toHaveBeenCalledTimes(3);
    });

    it('应使用指数退避延迟重试', async () => {
      const error = new Error('Rate limited');
      error.status = 429;

      const mockClient = createFailingClient(error);
      const delayFn = jest.fn().mockResolvedValue(undefined);

      await expect(
        chatCompletion(mockMessages, {}, { client: mockClient, delayFn, maxRetries: 3 })
      ).rejects.toThrow();

      // 验证延迟调用：1000ms, 2000ms, 4000ms
      expect(delayFn).toHaveBeenCalledTimes(3);
      expect(delayFn).toHaveBeenNthCalledWith(1, 1000);
      expect(delayFn).toHaveBeenNthCalledWith(2, 2000);
      expect(delayFn).toHaveBeenNthCalledWith(3, 4000);
    });

    it('应在达到最大重试次数后抛出 AppError', async () => {
      const error = new Error('Service unavailable');
      error.status = 500;

      const mockClient = createFailingClient(error);

      await expect(
        chatCompletion(mockMessages, {}, { client: mockClient, delayFn: noopDelay, maxRetries: 3 })
      ).rejects.toMatchObject({
        code: 'AI_SERVICE_ERROR',
        statusCode: 500,
      });

      // 初始调用 + 3次重试 = 4次
      expect(mockClient.chat.completions.create).toHaveBeenCalledTimes(4);
    });

    it('应对不可重试错误立即抛出不重试', async () => {
      const error = new Error('Invalid API key');
      error.status = 401;

      const mockClient = createFailingClient(error);

      await expect(
        chatCompletion(mockMessages, {}, { client: mockClient, delayFn: noopDelay })
      ).rejects.toMatchObject({
        code: 'AI_AUTH_ERROR',
        statusCode: 401,
      });

      // 不可重试，只调用一次
      expect(mockClient.chat.completions.create).toHaveBeenCalledTimes(1);
    });

    it('应正确映射 400 错误为 AI_BAD_REQUEST', async () => {
      const error = new Error('Bad request');
      error.status = 400;

      const mockClient = createFailingClient(error);

      await expect(
        chatCompletion(mockMessages, {}, { client: mockClient, delayFn: noopDelay })
      ).rejects.toMatchObject({
        code: 'AI_BAD_REQUEST',
        statusCode: 400,
      });
    });

    it('应正确映射网络错误', async () => {
      const error = new Error('Connection refused');
      error.code = 'ECONNREFUSED';

      const mockClient = createFailingClient(error);

      await expect(
        chatCompletion(mockMessages, {}, { client: mockClient, delayFn: noopDelay, maxRetries: 0 })
      ).rejects.toMatchObject({
        code: 'AI_NETWORK_ERROR',
      });
    });

    it('应支持自定义 baseDelay', async () => {
      const error = new Error('Rate limited');
      error.status = 429;

      const mockClient = createFailingClient(error);
      const delayFn = jest.fn().mockResolvedValue(undefined);

      await expect(
        chatCompletion(
          mockMessages,
          {},
          { client: mockClient, delayFn, maxRetries: 2, baseDelay: 500 }
        )
      ).rejects.toThrow();

      // 验证延迟：500ms, 1000ms
      expect(delayFn).toHaveBeenNthCalledWith(1, 500);
      expect(delayFn).toHaveBeenNthCalledWith(2, 1000);
    });
  });

  describe('delay', () => {
    it('应在指定时间后 resolve', async () => {
      const start = Date.now();
      await delay(50);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(40);
    });
  });
});
