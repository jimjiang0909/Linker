/**
 * Mock 工厂 - 提供 Prisma Client 和其他外部依赖的 Mock 实现
 */
import { jest } from '@jest/globals';

/**
 * 创建 Prisma Client Mock
 * 包含所有模型的 CRUD 操作 mock
 */
export function createMockPrismaClient() {
  const mockMethods = () => ({
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    count: jest.fn(),
    upsert: jest.fn(),
  });

  return {
    user: mockMethods(),
    profile: mockMethods(),
    photo: mockMethods(),
    preference: mockMethods(),
    match: mockMethods(),
    conversation: mockMethods(),
    message: mockMethods(),
    invitationCode: mockMethods(),
    verificationCode: mockMethods(),
    dailyRecommendation: mockMethods(),
    rateLimit: mockMethods(),
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    $transaction: jest.fn((fn) => fn()),
  };
}

/**
 * 创建 Resend 邮件服务 Mock
 */
export function createMockResendClient() {
  return {
    emails: {
      send: jest.fn().mockResolvedValue({ data: { id: 'mock-email-id' }, error: null }),
    },
  };
}

/**
 * 创建 OpenAI (CloudFlare AI Gateway) Mock
 */
export function createMockOpenAIClient() {
  return {
    chat: {
      completions: {
        create: jest.fn().mockResolvedValue({
          choices: [
            {
              message: {
                content: '{"score": 75, "reason": "你们在职业兴趣和交友意图上高度一致"}',
              },
            },
          ],
        }),
      },
    },
  };
}

/**
 * 创建 Express Request Mock
 */
export function createMockRequest(overrides = {}) {
  return {
    body: {},
    params: {},
    query: {},
    headers: {},
    user: null,
    file: null,
    files: null,
    ...overrides,
  };
}

/**
 * 创建 Express Response Mock
 */
export function createMockResponse() {
  const res = {
    statusCode: 200,
    _json: null,
    _sent: false,
  };

  res.status = jest.fn((code) => {
    res.statusCode = code;
    return res;
  });

  res.json = jest.fn((data) => {
    res._json = data;
    res._sent = true;
    return res;
  });

  res.send = jest.fn((data) => {
    res._sent = true;
    return res;
  });

  res.end = jest.fn(() => {
    res._sent = true;
    return res;
  });

  return res;
}

/**
 * 创建 Express Next 函数 Mock
 */
export function createMockNext() {
  return jest.fn();
}
