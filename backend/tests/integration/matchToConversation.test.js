/**
 * 集成测试：完整匹配到对话流程
 * 串联：每日推荐生成 → 推送 → 用户操作（感兴趣/跳过）→ 双向同意 → 创建 Conversation → AI 生成介绍语 → WebSocket 通知
 *
 * 验证:
 * - 频率限制正确集成（需求 9.1）
 * - Match 过期定时任务正确运行（需求 5.5, 5.6）
 * - 双向同意后创建 Conversation 并发送 WebSocket 通知（需求 5.2）
 * - AI 生成介绍语集成到 Conversation 创建流程（需求 7.1）
 * - 每日推荐生成和推送流程（需求 4.1）
 */
import { jest } from '@jest/globals';
import { expressInterest, expressInterestWithAIContent, skipMatch, processExpiredMatches } from '../../src/services/consentService.js';
import { checkRateLimit, incrementInterestCount } from '../../src/services/rateLimitService.js';
import { runDailyMatchCalculation, runDailyPush, pushRecommendation } from '../../src/cron/dailyRecommendation.js';
import { runMatchExpiryCheck } from '../../src/cron/matchExpiry.js';

// ============================================================
// Mock 工厂
// ============================================================

function createMockPrisma() {
  return {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    profile: {
      findUnique: jest.fn(),
    },
    match: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
    },
    conversation: {
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
    },
    message: {
      create: jest.fn(),
    },
    dailyRecommendation: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    rateLimit: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  };
}

function createUserWithProfile(id, name, gender = 'male') {
  return {
    id,
    email: `${id}@test.com`,
    status: 'preference_set',
    profile: {
      name,
      birthYear: 1995,
      gender,
      occupation: '工程师',
      city: '北京',
      bio: '热爱生活',
      userId: id,
    },
  };
}

function createPendingMatch(overrides = {}) {
  const now = new Date('2024-06-15T12:00:00.000Z');
  const expiresAt = new Date(now.getTime() + 72 * 60 * 60 * 1000);
  return {
    id: 'match-1',
    userAId: 'user-a',
    userBId: 'user-b',
    score: 85,
    reason: '你们在职业和兴趣上高度匹配',
    status: 'pending',
    userAChoice: null,
    userBChoice: null,
    userARespondedAt: null,
    userBRespondedAt: null,
    expiresAt,
    createdAt: now,
    ...overrides,
  };
}

// ============================================================
// 测试
// ============================================================

describe('完整匹配到对话流程集成测试', () => {
  const fixedNow = new Date('2024-06-15T12:00:00.000Z');
  const getNow = () => fixedNow;
  let mockPrisma;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
  });

  describe('流程1: 每日推荐生成 → 推送 → WebSocket 通知', () => {
    it('应生成推荐并通过 WebSocket 推送给用户', async () => {
      // 模拟有一个符合条件的用户
      mockPrisma.user.findMany.mockResolvedValue([{ id: 'user-a' }]);

      // 模拟 AI 推荐生成函数
      const mockGenerateFn = jest.fn().mockResolvedValue({
        id: 'rec-1',
        matchIds: ['match-1'],
      });

      const result = await runDailyMatchCalculation({
        prismaClient: mockPrisma,
        generateRecommendationsFn: mockGenerateFn,
      });

      expect(result.processed).toBe(1);
      expect(result.generated).toBe(1);
      expect(mockGenerateFn).toHaveBeenCalledWith('user-a', expect.any(Object));
    });

    it('推送推荐时应调用 WebSocket emitFn', async () => {
      const recommendation = {
        id: 'rec-1',
        userId: 'user-a',
        matchIds: ['match-1'],
        recommendationDate: new Date('2024-06-15'),
        status: 'pending',
        retryCount: 0,
      };

      mockPrisma.dailyRecommendation.update.mockResolvedValue({
        ...recommendation,
        status: 'pushed',
      });

      const mockEmitFn = jest.fn();

      const success = await pushRecommendation(recommendation, {
        prismaClient: mockPrisma,
        emitFn: mockEmitFn,
      });

      expect(success).toBe(true);
      expect(mockEmitFn).toHaveBeenCalledWith('user-a', 'recommendation:new', {
        matchIds: ['match-1'],
        date: recommendation.recommendationDate,
      });
      expect(mockPrisma.dailyRecommendation.update).toHaveBeenCalledWith({
        where: { id: 'rec-1' },
        data: expect.objectContaining({ status: 'pushed' }),
      });
    });
  });

  describe('流程2: 用户操作 → 双向同意 → 创建 Conversation → AI 介绍语 → WebSocket 通知', () => {
    it('双方都感兴趣时应创建 Conversation、生成 AI 内容并发送 WebSocket 通知', async () => {
      // userB 已经表示感兴趣
      const match = createPendingMatch({ userBChoice: 'interested' });
      mockPrisma.match.findUnique.mockResolvedValue(match);
      mockPrisma.match.update.mockResolvedValue({
        ...match,
        userAChoice: 'interested',
        status: 'matched',
      });
      mockPrisma.conversation.create.mockResolvedValue({
        id: 'conv-1',
        matchId: 'match-1',
        userAId: 'user-a',
        userBId: 'user-b',
        status: 'active',
      });

      const userA = createUserWithProfile('user-a', '小明');
      const userB = createUserWithProfile('user-b', '小红', 'female');
      mockPrisma.user.findUnique.mockImplementation(({ where }) => {
        if (where.id === 'user-a') return Promise.resolve(userA);
        if (where.id === 'user-b') return Promise.resolve(userB);
        return Promise.resolve(null);
      });
      mockPrisma.conversation.update.mockResolvedValue({});
      mockPrisma.message.create.mockResolvedValue({ id: 'msg-1' });

      // Mock WebSocket emitMatchSuccess
      const mockEmitMatchSuccess = jest.fn();

      const result = await expressInterestWithAIContent('user-a', 'match-1', {
        prismaClient: mockPrisma,
        getNow,
        emitMatchSuccessFn: mockEmitMatchSuccess,
        aiDeps: {
          generateIntroductionFn: async () => '小明和小红，你们都在北京工作，一定有很多共同话题！',
          generateIcebreakersFn: async () => ['你平时用什么编程语言？', '最近在做什么项目？'],
        },
      });

      // 验证结果
      expect(result.status).toBe('matched');
      expect(result.conversationId).toBe('conv-1');
      expect(result.aiContent).toBeDefined();
      expect(result.aiContent.introduction).toContain('小明');
      expect(result.aiContent.introduction).toContain('小红');
      expect(result.aiContent.icebreakers).toHaveLength(2);

      // 验证 WebSocket 通知被调用
      expect(mockEmitMatchSuccess).toHaveBeenCalledWith('user-a', 'user-b', 'conv-1');

      // 验证 Conversation 创建
      expect(mockPrisma.conversation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          matchId: 'match-1',
          userAId: 'user-a',
          userBId: 'user-b',
          status: 'active',
        }),
      });

      // 验证 AI 内容存储到 Conversation
      expect(mockPrisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 'conv-1' },
        data: expect.objectContaining({
          introduction: expect.stringContaining('小明'),
          icebreakers: expect.any(Array),
        }),
      });

      // 验证系统消息创建
      expect(mockPrisma.message.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          conversationId: 'conv-1',
          type: 'system',
        }),
      });
    });

    it('expressInterest（fire-and-forget 模式）也应发送 WebSocket 通知', async () => {
      const match = createPendingMatch({ userBChoice: 'interested' });
      mockPrisma.match.findUnique.mockResolvedValue(match);
      mockPrisma.match.update.mockResolvedValue({
        ...match,
        userAChoice: 'interested',
        status: 'matched',
      });
      mockPrisma.conversation.create.mockResolvedValue({
        id: 'conv-2',
        matchId: 'match-1',
        userAId: 'user-a',
        userBId: 'user-b',
        status: 'active',
      });

      const userA = createUserWithProfile('user-a', '小明');
      const userB = createUserWithProfile('user-b', '小红', 'female');
      mockPrisma.user.findUnique.mockImplementation(({ where }) => {
        if (where.id === 'user-a') return Promise.resolve(userA);
        if (where.id === 'user-b') return Promise.resolve(userB);
        return Promise.resolve(null);
      });
      mockPrisma.conversation.update.mockResolvedValue({});
      mockPrisma.message.create.mockResolvedValue({ id: 'msg-1' });

      const mockEmitMatchSuccess = jest.fn();

      const result = await expressInterest('user-a', 'match-1', {
        prismaClient: mockPrisma,
        getNow,
        emitMatchSuccessFn: mockEmitMatchSuccess,
        aiDeps: {
          generateIntroductionFn: async () => '介绍语',
          generateIcebreakersFn: async () => ['话题1', '话题2'],
        },
      });

      expect(result.status).toBe('matched');
      expect(result.conversationId).toBe('conv-2');

      // WebSocket 通知应被调用
      expect(mockEmitMatchSuccess).toHaveBeenCalledWith('user-a', 'user-b', 'conv-2');
    });

    it('仅一方感兴趣时不应创建 Conversation 或发送 WebSocket 通知', async () => {
      const match = createPendingMatch(); // 双方都未响应
      mockPrisma.match.findUnique.mockResolvedValue(match);
      mockPrisma.match.update.mockResolvedValue({
        ...match,
        userAChoice: 'interested',
        status: 'pending',
      });

      const mockEmitMatchSuccess = jest.fn();

      const result = await expressInterest('user-a', 'match-1', {
        prismaClient: mockPrisma,
        getNow,
        emitMatchSuccessFn: mockEmitMatchSuccess,
      });

      expect(result.status).toBe('waiting');
      expect(mockEmitMatchSuccess).not.toHaveBeenCalled();
      expect(mockPrisma.conversation.create).not.toHaveBeenCalled();
    });

    it('跳过操作应关闭 Match 且不发送 WebSocket 通知', async () => {
      const match = createPendingMatch();
      mockPrisma.match.findUnique.mockResolvedValue(match);
      mockPrisma.match.update.mockResolvedValue({
        ...match,
        userAChoice: 'skipped',
        status: 'closed',
      });

      const result = await skipMatch('user-a', 'match-1', {
        prismaClient: mockPrisma,
        getNow,
      });

      expect(result.status).toBe('closed');
      expect(mockPrisma.conversation.create).not.toHaveBeenCalled();
    });
  });

  describe('流程3: 频率限制集成', () => {
    it('男性用户达到每日上限后应被拒绝', async () => {
      // 模拟男性用户已使用3次
      mockPrisma.profile.findUnique.mockResolvedValue({ gender: 'male' });
      mockPrisma.rateLimit.findUnique.mockResolvedValue({
        userId: 'user-a',
        date: new Date('2024-06-15'),
        interestedCount: 3,
      });

      const result = await checkRateLimit('user-a', { prismaClient: mockPrisma });

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.message).toContain('上限');
    });

    it('女性用户不受频率限制', async () => {
      mockPrisma.profile.findUnique.mockResolvedValue({ gender: 'female' });

      const result = await checkRateLimit('user-b', { prismaClient: mockPrisma });

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(Infinity);
    });

    it('男性用户未达上限时应允许操作', async () => {
      mockPrisma.profile.findUnique.mockResolvedValue({ gender: 'male' });
      mockPrisma.rateLimit.findUnique.mockResolvedValue({
        userId: 'user-a',
        date: new Date('2024-06-15'),
        interestedCount: 2,
      });

      const result = await checkRateLimit('user-a', { prismaClient: mockPrisma });

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(1);
    });

    it('incrementInterestCount 应正确递增计数', async () => {
      mockPrisma.rateLimit.upsert.mockResolvedValue({
        userId: 'user-a',
        interestedCount: 2,
      });

      const result = await incrementInterestCount('user-a', { prismaClient: mockPrisma });

      expect(result.count).toBe(2);
      expect(result.remaining).toBe(1);
    });
  });

  describe('流程4: Match 过期定时任务', () => {
    it('应将超过72小时的 pending Match 标记为 expired', async () => {
      mockPrisma.match.updateMany.mockResolvedValue({ count: 3 });

      const result = await runMatchExpiryCheck({
        prismaClient: mockPrisma,
        getNow,
      });

      expect(result.expiredCount).toBe(3);
      expect(mockPrisma.match.updateMany).toHaveBeenCalledWith({
        where: {
          status: 'pending',
          expiresAt: { lte: fixedNow },
        },
        data: { status: 'expired' },
      });
    });

    it('无过期 Match 时应返回 0', async () => {
      mockPrisma.match.updateMany.mockResolvedValue({ count: 0 });

      const result = await runMatchExpiryCheck({
        prismaClient: mockPrisma,
        getNow,
      });

      expect(result.expiredCount).toBe(0);
    });

    it('已过期的 Match 不应允许用户操作', async () => {
      const expiredMatch = createPendingMatch({
        expiresAt: new Date('2024-06-14T00:00:00.000Z'), // 已过期
      });
      mockPrisma.match.findUnique.mockResolvedValue(expiredMatch);

      await expect(
        expressInterest('user-a', 'match-1', { prismaClient: mockPrisma, getNow })
      ).rejects.toThrow('Match 已过期');
    });
  });

  describe('流程5: 端到端完整流程模拟', () => {
    it('完整流程: 推荐生成 → userA 感兴趣 → userB 感兴趣 → 创建对话 → WebSocket 通知', async () => {
      // Step 1: 每日推荐生成
      mockPrisma.user.findMany.mockResolvedValue([{ id: 'user-a' }]);
      const mockGenerateFn = jest.fn().mockResolvedValue({ id: 'rec-1', matchIds: ['match-1'] });

      const calcResult = await runDailyMatchCalculation({
        prismaClient: mockPrisma,
        generateRecommendationsFn: mockGenerateFn,
      });
      expect(calcResult.generated).toBe(1);

      // Step 2: userA 表示感兴趣（第一个操作）
      const matchAfterUserAInterest = createPendingMatch();
      mockPrisma.match.findUnique.mockResolvedValue(matchAfterUserAInterest);
      mockPrisma.match.update.mockResolvedValue({
        ...matchAfterUserAInterest,
        userAChoice: 'interested',
        status: 'pending',
      });

      // 频率限制检查（男性用户）
      mockPrisma.profile.findUnique.mockResolvedValue({ gender: 'male' });
      mockPrisma.rateLimit.findUnique.mockResolvedValue(null); // 今日首次

      const rateLimitCheck = await checkRateLimit('user-a', { prismaClient: mockPrisma });
      expect(rateLimitCheck.allowed).toBe(true);

      const resultA = await expressInterest('user-a', 'match-1', {
        prismaClient: mockPrisma,
        getNow,
      });
      expect(resultA.status).toBe('waiting');

      // Step 3: userB 表示感兴趣（触发匹配成功）
      const matchAfterUserBInterest = createPendingMatch({ userAChoice: 'interested' });
      mockPrisma.match.findUnique.mockResolvedValue(matchAfterUserBInterest);
      mockPrisma.match.update.mockResolvedValue({
        ...matchAfterUserBInterest,
        userBChoice: 'interested',
        status: 'matched',
      });
      mockPrisma.conversation.create.mockResolvedValue({
        id: 'conv-final',
        matchId: 'match-1',
        userAId: 'user-a',
        userBId: 'user-b',
        status: 'active',
      });

      const userA = createUserWithProfile('user-a', '小明');
      const userB = createUserWithProfile('user-b', '小红', 'female');
      mockPrisma.user.findUnique.mockImplementation(({ where }) => {
        if (where.id === 'user-a') return Promise.resolve(userA);
        if (where.id === 'user-b') return Promise.resolve(userB);
        return Promise.resolve(null);
      });
      mockPrisma.conversation.update.mockResolvedValue({});
      mockPrisma.message.create.mockResolvedValue({ id: 'msg-1' });

      const mockEmitMatchSuccess = jest.fn();

      const resultB = await expressInterestWithAIContent('user-b', 'match-1', {
        prismaClient: mockPrisma,
        getNow,
        emitMatchSuccessFn: mockEmitMatchSuccess,
        aiDeps: {
          generateIntroductionFn: async () => '小明和小红，你们都在北京工作！',
          generateIcebreakersFn: async () => ['你平时喜欢做什么？', '最近有什么有趣的事？'],
        },
      });

      // 验证最终结果
      expect(resultB.status).toBe('matched');
      expect(resultB.conversationId).toBe('conv-final');
      expect(resultB.aiContent.introduction).toContain('小明');
      expect(resultB.aiContent.icebreakers).toHaveLength(2);

      // 验证 WebSocket 通知
      expect(mockEmitMatchSuccess).toHaveBeenCalledWith('user-a', 'user-b', 'conv-final');
    });

    it('完整流程: 推荐生成 → userA 感兴趣 → userB 跳过 → Match 关闭', async () => {
      // Step 1: userA 感兴趣
      const match = createPendingMatch();
      mockPrisma.match.findUnique.mockResolvedValue(match);
      mockPrisma.match.update.mockResolvedValue({
        ...match,
        userAChoice: 'interested',
        status: 'pending',
      });

      const resultA = await expressInterest('user-a', 'match-1', {
        prismaClient: mockPrisma,
        getNow,
      });
      expect(resultA.status).toBe('waiting');

      // Step 2: userB 跳过
      const matchAfterA = createPendingMatch({ userAChoice: 'interested' });
      mockPrisma.match.findUnique.mockResolvedValue(matchAfterA);
      mockPrisma.match.update.mockResolvedValue({
        ...matchAfterA,
        userBChoice: 'skipped',
        status: 'skipped',
      });

      const resultB = await skipMatch('user-b', 'match-1', {
        prismaClient: mockPrisma,
        getNow,
      });

      expect(resultB.status).toBe('skipped');
      expect(mockPrisma.conversation.create).not.toHaveBeenCalled();
    });

    it('完整流程: 推荐生成 → 72小时无响应 → Match 过期', async () => {
      // 模拟72小时后执行过期检查
      const laterNow = new Date('2024-06-18T13:00:00.000Z'); // 超过72小时
      mockPrisma.match.updateMany.mockResolvedValue({ count: 1 });

      const result = await runMatchExpiryCheck({
        prismaClient: mockPrisma,
        getNow: () => laterNow,
      });

      expect(result.expiredCount).toBe(1);

      // 过期后用户尝试操作应被拒绝
      const expiredMatch = createPendingMatch({
        expiresAt: new Date('2024-06-18T12:00:00.000Z'),
      });
      mockPrisma.match.findUnique.mockResolvedValue(expiredMatch);

      await expect(
        expressInterest('user-a', 'match-1', {
          prismaClient: mockPrisma,
          getNow: () => laterNow,
        })
      ).rejects.toThrow('Match 已过期');
    });
  });

  describe('流程6: WebSocket 通知失败不影响核心流程', () => {
    it('emitMatchSuccess 抛出异常时不应影响 Conversation 创建', async () => {
      const match = createPendingMatch({ userBChoice: 'interested' });
      mockPrisma.match.findUnique.mockResolvedValue(match);
      mockPrisma.match.update.mockResolvedValue({
        ...match,
        userAChoice: 'interested',
        status: 'matched',
      });
      mockPrisma.conversation.create.mockResolvedValue({
        id: 'conv-3',
        matchId: 'match-1',
        userAId: 'user-a',
        userBId: 'user-b',
        status: 'active',
      });

      const userA = createUserWithProfile('user-a', '小明');
      const userB = createUserWithProfile('user-b', '小红', 'female');
      mockPrisma.user.findUnique.mockImplementation(({ where }) => {
        if (where.id === 'user-a') return Promise.resolve(userA);
        if (where.id === 'user-b') return Promise.resolve(userB);
        return Promise.resolve(null);
      });
      mockPrisma.conversation.update.mockResolvedValue({});
      mockPrisma.message.create.mockResolvedValue({ id: 'msg-1' });

      // WebSocket 通知抛出异常
      const mockEmitMatchSuccess = jest.fn(() => {
        throw new Error('WebSocket 连接断开');
      });

      // 不应抛出异常，流程应正常完成
      const result = await expressInterestWithAIContent('user-a', 'match-1', {
        prismaClient: mockPrisma,
        getNow,
        emitMatchSuccessFn: mockEmitMatchSuccess,
        aiDeps: {
          generateIntroductionFn: async () => '介绍语',
          generateIcebreakersFn: async () => ['话题1', '话题2'],
        },
      });

      expect(result.status).toBe('matched');
      expect(result.conversationId).toBe('conv-3');
      // WebSocket 被调用了（虽然失败了）
      expect(mockEmitMatchSuccess).toHaveBeenCalled();
    });
  });
});
