/**
 * 匹配推荐路由单元测试
 */
import { jest } from '@jest/globals';
import {
  createMockRequest,
  createMockResponse,
  createMockNext,
} from '../../helpers/mockFactory.js';

// Mock prisma
const mockPrisma = {
  dailyRecommendation: {
    findFirst: jest.fn(),
  },
  match: {
    findMany: jest.fn(),
  },
};

// Mock auth middleware
const mockAuthenticate = jest.fn((req, _res, next) => next());

// Mock rateLimitService
const mockCheckRateLimit = jest.fn();
const mockIncrementInterestCount = jest.fn();

// Mock consentService
const mockExpressInterest = jest.fn();
const mockSkipMatch = jest.fn();

jest.unstable_mockModule('../../../src/lib/prisma.js', () => ({
  default: mockPrisma,
}));

jest.unstable_mockModule('../../../src/middlewares/auth.js', () => ({
  authenticate: mockAuthenticate,
}));

jest.unstable_mockModule('../../../src/middlewares/errorHandler.js', () => ({
  AppError: class AppError extends Error {
    constructor(statusCode, code, message, details = {}) {
      super(message);
      this.statusCode = statusCode;
      this.code = code;
      this.details = details;
      this.name = 'AppError';
    }
  },
}));

jest.unstable_mockModule('../../../src/services/rateLimitService.js', () => ({
  checkRateLimit: mockCheckRateLimit,
  incrementInterestCount: mockIncrementInterestCount,
}));

jest.unstable_mockModule('../../../src/services/consentService.js', () => ({
  expressInterest: mockExpressInterest,
  skipMatch: mockSkipMatch,
}));

// Dynamic import after mocks
const { default: matchesRouter } = await import(
  '../../../src/routes/matches.js'
);

describe('GET /api/matches/daily', () => {
  let routeHandler;

  beforeAll(() => {
    // 找到 /daily GET 路由的处理函数（跳过 authenticate 中间件）
    const layer = matchesRouter.stack.find(
      (l) =>
        l.route && l.route.path === '/daily' && l.route.methods.get
    );
    // route.stack[0] 是 authenticate, route.stack[1] 是实际处理函数
    routeHandler = layer.route.stack[1].handle;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('应返回空数组当今日没有推荐', async () => {
    mockPrisma.dailyRecommendation.findFirst.mockResolvedValue(null);

    const req = createMockRequest({
      user: { userId: 'user-1' },
    });
    const res = createMockResponse();
    const next = createMockNext();

    await routeHandler(req, res, next);

    expect(mockPrisma.dailyRecommendation.findFirst).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        recommendationDate: expect.any(Date),
      },
    });

    expect(res.json).toHaveBeenCalledWith({
      code: 'SUCCESS',
      message: '获取每日推荐成功',
      data: [],
    });
  });

  it('应返回空数组当推荐的 matchIds 为空', async () => {
    mockPrisma.dailyRecommendation.findFirst.mockResolvedValue({
      id: 'rec-1',
      userId: 'user-1',
      matchIds: [],
      status: 'pushed',
    });

    const req = createMockRequest({
      user: { userId: 'user-1' },
    });
    const res = createMockResponse();
    const next = createMockNext();

    await routeHandler(req, res, next);

    expect(res.json).toHaveBeenCalledWith({
      code: 'SUCCESS',
      message: '获取每日推荐成功',
      data: [],
    });
  });

  it('应返回格式化的推荐数据', async () => {
    const currentYear = new Date().getFullYear();

    mockPrisma.dailyRecommendation.findFirst.mockResolvedValue({
      id: 'rec-1',
      userId: 'user-1',
      matchIds: ['match-1', 'match-2'],
      status: 'pushed',
    });

    const expiresAt = new Date('2024-06-15T10:00:00Z');

    mockPrisma.match.findMany.mockResolvedValue([
      {
        id: 'match-1',
        userAId: 'user-1',
        userBId: 'user-2',
        score: 85,
        reason: '你们在职业兼容性方面非常匹配，都从事技术相关工作',
        status: 'pending',
        expiresAt,
        userAChoice: null,
        userB: {
          id: 'user-2',
          profile: {
            name: '小红',
            birthYear: 1995,
            occupation: '设计师',
            city: '北京',
          },
          photos: [
            { id: 'photo-1', url: '/uploads/photo1.jpg', sortOrder: 0 },
            { id: 'photo-2', url: '/uploads/photo2.jpg', sortOrder: 1 },
          ],
        },
      },
      {
        id: 'match-2',
        userAId: 'user-1',
        userBId: 'user-3',
        score: 72,
        reason: '你们的交友意图一致性很高，都希望认真约会',
        status: 'pending',
        expiresAt,
        userAChoice: null,
        userB: {
          id: 'user-3',
          profile: {
            name: '小蓝',
            birthYear: 1998,
            occupation: '产品经理',
            city: '上海',
          },
          photos: [
            { id: 'photo-3', url: '/uploads/photo3.jpg', sortOrder: 0 },
          ],
        },
      },
    ]);

    const req = createMockRequest({
      user: { userId: 'user-1' },
    });
    const res = createMockResponse();
    const next = createMockNext();

    await routeHandler(req, res, next);

    expect(mockPrisma.match.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['match-1', 'match-2'] },
      },
      include: {
        userB: {
          include: {
            profile: true,
            photos: {
              orderBy: { sortOrder: 'asc' },
            },
          },
        },
      },
    });

    const responseData = res.json.mock.calls[0][0];
    expect(responseData.code).toBe('SUCCESS');
    expect(responseData.data).toHaveLength(2);

    // 验证第一个推荐
    expect(responseData.data[0]).toEqual({
      matchId: 'match-1',
      score: 85,
      reason: '你们在职业兼容性方面非常匹配，都从事技术相关工作',
      status: 'pending',
      expiresAt,
      userAChoice: null,
      recommendedUser: {
        id: 'user-2',
        name: '小红',
        age: currentYear - 1995,
        occupation: '设计师',
        city: '北京',
        photos: [
          { id: 'photo-1', url: '/uploads/photo1.jpg' },
          { id: 'photo-2', url: '/uploads/photo2.jpg' },
        ],
      },
    });

    // 验证第二个推荐
    expect(responseData.data[1]).toEqual({
      matchId: 'match-2',
      score: 72,
      reason: '你们的交友意图一致性很高，都希望认真约会',
      status: 'pending',
      expiresAt,
      userAChoice: null,
      recommendedUser: {
        id: 'user-3',
        name: '小蓝',
        age: currentYear - 1998,
        occupation: '产品经理',
        city: '上海',
        photos: [{ id: 'photo-3', url: '/uploads/photo3.jpg' }],
      },
    });
  });

  it('应处理推荐对象无 profile 的情况', async () => {
    mockPrisma.dailyRecommendation.findFirst.mockResolvedValue({
      id: 'rec-1',
      userId: 'user-1',
      matchIds: ['match-1'],
      status: 'pushed',
    });

    mockPrisma.match.findMany.mockResolvedValue([
      {
        id: 'match-1',
        userAId: 'user-1',
        userBId: 'user-2',
        score: 75,
        reason: '你们在性格互补性方面有很好的匹配',
        status: 'pending',
        expiresAt: new Date('2024-06-15T10:00:00Z'),
        userAChoice: null,
        userB: {
          id: 'user-2',
          profile: null,
          photos: [],
        },
      },
    ]);

    const req = createMockRequest({
      user: { userId: 'user-1' },
    });
    const res = createMockResponse();
    const next = createMockNext();

    await routeHandler(req, res, next);

    const responseData = res.json.mock.calls[0][0];
    expect(responseData.data[0].recommendedUser).toBeNull();
  });

  it('应将异常传递给 next 错误处理', async () => {
    const error = new Error('数据库连接失败');
    mockPrisma.dailyRecommendation.findFirst.mockRejectedValue(error);

    const req = createMockRequest({
      user: { userId: 'user-1' },
    });
    const res = createMockResponse();
    const next = createMockNext();

    await routeHandler(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
  });
});

describe('POST /api/matches/:id/interested', () => {
  let routeHandler;

  beforeAll(() => {
    const layer = matchesRouter.stack.find(
      (l) =>
        l.route && l.route.path === '/:id/interested' && l.route.methods.post
    );
    routeHandler = layer.route.stack[1].handle;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('应成功表示感兴趣（等待对方响应）', async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 2 });
    mockExpressInterest.mockResolvedValue({ status: 'waiting', matchStatus: 'pending' });
    mockIncrementInterestCount.mockResolvedValue({ count: 1, remaining: 2 });

    const req = createMockRequest({
      user: { userId: 'user-1' },
      params: { id: 'match-1' },
    });
    const res = createMockResponse();
    const next = createMockNext();

    await routeHandler(req, res, next);

    expect(mockCheckRateLimit).toHaveBeenCalledWith('user-1');
    expect(mockExpressInterest).toHaveBeenCalledWith('user-1', 'match-1');
    expect(mockIncrementInterestCount).toHaveBeenCalledWith('user-1');
    expect(res.json).toHaveBeenCalledWith({
      code: 'SUCCESS',
      message: '已表示感兴趣，等待对方响应',
      data: {
        status: 'waiting',
        conversationId: null,
        remaining: 2,
      },
    });
  });

  it('应成功匹配并返回 conversationId', async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 1 });
    mockExpressInterest.mockResolvedValue({
      status: 'matched',
      conversationId: 'conv-1',
      matchStatus: 'matched',
    });
    mockIncrementInterestCount.mockResolvedValue({ count: 2, remaining: 1 });

    const req = createMockRequest({
      user: { userId: 'user-1' },
      params: { id: 'match-1' },
    });
    const res = createMockResponse();
    const next = createMockNext();

    await routeHandler(req, res, next);

    expect(res.json).toHaveBeenCalledWith({
      code: 'SUCCESS',
      message: '匹配成功！双方已建立对话',
      data: {
        status: 'matched',
        conversationId: 'conv-1',
        remaining: 1,
      },
    });
  });

  it('应在频率限制超出时返回 429 错误', async () => {
    const nextResetAt = new Date('2024-06-16T00:00:00.000Z');
    mockCheckRateLimit.mockResolvedValue({
      allowed: false,
      remaining: 0,
      message: '今日"感兴趣"次数已达上限（3次），下次可操作时间：次日 CST 00:00',
      nextResetAt,
    });

    const req = createMockRequest({
      user: { userId: 'user-1' },
      params: { id: 'match-1' },
    });
    const res = createMockResponse();
    const next = createMockNext();

    await routeHandler(req, res, next);

    expect(next).toHaveBeenCalled();
    const error = next.mock.calls[0][0];
    expect(error.statusCode).toBe(429);
    expect(error.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(mockExpressInterest).not.toHaveBeenCalled();
    expect(mockIncrementInterestCount).not.toHaveBeenCalled();
  });

  it('应在 Match 不存在时传递 consentService 的错误', async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 3 });
    const error = new Error('Match 不存在');
    error.statusCode = 404;
    error.code = 'MATCH_NOT_FOUND';
    mockExpressInterest.mockRejectedValue(error);

    const req = createMockRequest({
      user: { userId: 'user-1' },
      params: { id: 'nonexistent-match' },
    });
    const res = createMockResponse();
    const next = createMockNext();

    await routeHandler(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
    expect(mockIncrementInterestCount).not.toHaveBeenCalled();
  });

  it('应在 Match 已过期时传递错误', async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 2 });
    const error = new Error('Match 已过期，无法操作');
    error.statusCode = 400;
    error.code = 'MATCH_EXPIRED';
    mockExpressInterest.mockRejectedValue(error);

    const req = createMockRequest({
      user: { userId: 'user-1' },
      params: { id: 'match-expired' },
    });
    const res = createMockResponse();
    const next = createMockNext();

    await routeHandler(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
    expect(mockIncrementInterestCount).not.toHaveBeenCalled();
  });

  it('应在用户已响应时传递错误', async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 2 });
    const error = new Error('您已做出选择，等待状态下不可撤回或修改');
    error.statusCode = 400;
    error.code = 'ALREADY_RESPONDED';
    mockExpressInterest.mockRejectedValue(error);

    const req = createMockRequest({
      user: { userId: 'user-1' },
      params: { id: 'match-1' },
    });
    const res = createMockResponse();
    const next = createMockNext();

    await routeHandler(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
    expect(mockIncrementInterestCount).not.toHaveBeenCalled();
  });

  it('应在用户不是参与方时传递错误', async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 2 });
    const error = new Error('您不是该 Match 的参与方');
    error.statusCode = 403;
    error.code = 'NOT_PARTICIPANT';
    mockExpressInterest.mockRejectedValue(error);

    const req = createMockRequest({
      user: { userId: 'user-1' },
      params: { id: 'match-other' },
    });
    const res = createMockResponse();
    const next = createMockNext();

    await routeHandler(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
  });
});

describe('POST /api/matches/:id/skip', () => {
  let routeHandler;

  beforeAll(() => {
    const layer = matchesRouter.stack.find(
      (l) =>
        l.route && l.route.path === '/:id/skip' && l.route.methods.post
    );
    routeHandler = layer.route.stack[1].handle;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('应成功跳过匹配（对方未响应，关闭）', async () => {
    mockSkipMatch.mockResolvedValue({ status: 'closed' });

    const req = createMockRequest({
      user: { userId: 'user-1' },
      params: { id: 'match-1' },
    });
    const res = createMockResponse();
    const next = createMockNext();

    await routeHandler(req, res, next);

    expect(mockSkipMatch).toHaveBeenCalledWith('user-1', 'match-1');
    expect(res.json).toHaveBeenCalledWith({
      code: 'SUCCESS',
      message: '已跳过该匹配',
      data: {
        status: 'closed',
      },
    });
  });

  it('应成功跳过匹配（对方已响应，标记为 skipped）', async () => {
    mockSkipMatch.mockResolvedValue({ status: 'skipped' });

    const req = createMockRequest({
      user: { userId: 'user-1' },
      params: { id: 'match-1' },
    });
    const res = createMockResponse();
    const next = createMockNext();

    await routeHandler(req, res, next);

    expect(res.json).toHaveBeenCalledWith({
      code: 'SUCCESS',
      message: '已跳过该匹配',
      data: {
        status: 'skipped',
      },
    });
  });

  it('应在 Match 不存在时传递错误', async () => {
    const error = new Error('Match 不存在');
    error.statusCode = 404;
    error.code = 'MATCH_NOT_FOUND';
    mockSkipMatch.mockRejectedValue(error);

    const req = createMockRequest({
      user: { userId: 'user-1' },
      params: { id: 'nonexistent-match' },
    });
    const res = createMockResponse();
    const next = createMockNext();

    await routeHandler(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
  });

  it('应在 Match 已过期时传递错误', async () => {
    const error = new Error('Match 已过期，无法操作');
    error.statusCode = 400;
    error.code = 'MATCH_EXPIRED';
    mockSkipMatch.mockRejectedValue(error);

    const req = createMockRequest({
      user: { userId: 'user-1' },
      params: { id: 'match-expired' },
    });
    const res = createMockResponse();
    const next = createMockNext();

    await routeHandler(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
  });

  it('应在用户已响应时传递错误', async () => {
    const error = new Error('您已做出选择，等待状态下不可撤回或修改');
    error.statusCode = 400;
    error.code = 'ALREADY_RESPONDED';
    mockSkipMatch.mockRejectedValue(error);

    const req = createMockRequest({
      user: { userId: 'user-1' },
      params: { id: 'match-1' },
    });
    const res = createMockResponse();
    const next = createMockNext();

    await routeHandler(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
  });

  it('应在用户不是参与方时传递错误', async () => {
    const error = new Error('您不是该 Match 的参与方');
    error.statusCode = 403;
    error.code = 'NOT_PARTICIPANT';
    mockSkipMatch.mockRejectedValue(error);

    const req = createMockRequest({
      user: { userId: 'user-1' },
      params: { id: 'match-other' },
    });
    const res = createMockResponse();
    const next = createMockNext();

    await routeHandler(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
  });
});
