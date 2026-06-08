/**
 * 同意服务单元测试
 */
import { jest } from '@jest/globals';
import {
  expressInterest,
  expressInterestWithAIContent,
  skipMatch,
  isMatchExpired,
  processExpiredMatches,
  generateAIContentForConversation,
} from '../../../src/services/consentService.js';

// 创建 mock Prisma 客户端
function createMockPrisma() {
  return {
    match: {
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    conversation: {
      create: jest.fn(),
      update: jest.fn(),
    },
    message: {
      create: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  };
}

// 创建基础用户数据（包含 profile）
function createUserWithProfile(id, name, overrides = {}) {
  return {
    id,
    email: `${id}@test.com`,
    profile: {
      name: name || `用户${id}`,
      birthYear: 1995,
      gender: 'male',
      occupation: '工程师',
      city: '北京',
      bio: '热爱生活',
      ...overrides,
    },
  };
}

// 创建基础 Match 数据
function createPendingMatch(overrides = {}) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 72 * 60 * 60 * 1000); // 72小时后过期
  return {
    id: 'match-1',
    userAId: 'user-a',
    userBId: 'user-b',
    score: 80,
    reason: '匹配理由',
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

describe('consentService', () => {
  let mockPrisma;
  const fixedNow = new Date('2024-06-15T12:00:00.000Z');
  const getNow = () => fixedNow;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
  });

  describe('expressInterest', () => {
    it('Match 不存在时应抛出 404 错误', async () => {
      mockPrisma.match.findUnique.mockResolvedValue(null);

      await expect(
        expressInterest('user-a', 'match-1', { prismaClient: mockPrisma, getNow })
      ).rejects.toThrow('Match 不存在');
    });

    it('用户不是参与方时应抛出 403 错误', async () => {
      const match = createPendingMatch();
      mockPrisma.match.findUnique.mockResolvedValue(match);

      await expect(
        expressInterest('user-c', 'match-1', { prismaClient: mockPrisma, getNow })
      ).rejects.toThrow('您不是该 Match 的参与方');
    });

    it('Match 状态不是 pending 时应抛出错误', async () => {
      const match = createPendingMatch({ status: 'matched' });
      mockPrisma.match.findUnique.mockResolvedValue(match);

      await expect(
        expressInterest('user-a', 'match-1', { prismaClient: mockPrisma, getNow })
      ).rejects.toThrow('Match 已不在等待状态');
    });

    it('Match 已过期时应抛出错误', async () => {
      const expiredMatch = createPendingMatch({
        expiresAt: new Date('2024-06-14T00:00:00.000Z'), // 已过期
      });
      mockPrisma.match.findUnique.mockResolvedValue(expiredMatch);

      await expect(
        expressInterest('user-a', 'match-1', { prismaClient: mockPrisma, getNow })
      ).rejects.toThrow('Match 已过期');
    });

    it('用户已响应时应抛出不可撤回错误', async () => {
      const match = createPendingMatch({ userAChoice: 'interested' });
      mockPrisma.match.findUnique.mockResolvedValue(match);

      await expect(
        expressInterest('user-a', 'match-1', { prismaClient: mockPrisma, getNow })
      ).rejects.toThrow('您已做出选择，等待状态下不可撤回或修改');
    });

    it('仅一方感兴趣时应返回 waiting 状态', async () => {
      const match = createPendingMatch(); // 双方都未响应
      mockPrisma.match.findUnique.mockResolvedValue(match);
      mockPrisma.match.update.mockResolvedValue({ ...match, userAChoice: 'interested', status: 'pending' });

      const result = await expressInterest('user-a', 'match-1', { prismaClient: mockPrisma, getNow });

      expect(result.status).toBe('waiting');
      expect(result.conversationId).toBeUndefined();
      expect(mockPrisma.match.update).toHaveBeenCalledWith({
        where: { id: 'match-1' },
        data: expect.objectContaining({
          userAChoice: 'interested',
          userARespondedAt: fixedNow,
        }),
      });
      // 不应创建 Conversation
      expect(mockPrisma.conversation.create).not.toHaveBeenCalled();
    });

    it('双方都感兴趣时应创建 Conversation 并返回 matched 状态', async () => {
      // 对方已选择感兴趣
      const match = createPendingMatch({ userBChoice: 'interested' });
      mockPrisma.match.findUnique.mockResolvedValue(match);
      mockPrisma.match.update.mockResolvedValue({ ...match, userAChoice: 'interested', status: 'matched' });
      mockPrisma.conversation.create.mockResolvedValue({
        id: 'conv-1',
        matchId: 'match-1',
        userAId: 'user-a',
        userBId: 'user-b',
        status: 'active',
      });
      // Mock user lookup for AI content generation
      const userA = createUserWithProfile('user-a', '小明');
      const userB = createUserWithProfile('user-b', '小红');
      mockPrisma.user.findUnique.mockImplementation(({ where }) => {
        if (where.id === 'user-a') return Promise.resolve(userA);
        if (where.id === 'user-b') return Promise.resolve(userB);
        return Promise.resolve(null);
      });
      mockPrisma.conversation.update.mockResolvedValue({});
      mockPrisma.message.create.mockResolvedValue({ id: 'msg-1' });

      const result = await expressInterest('user-a', 'match-1', {
        prismaClient: mockPrisma,
        getNow,
        aiDeps: {
          generateIntroductionFn: async () => '小明和小红，你们都是工程师，一定有很多共同话题！',
          generateIcebreakersFn: async () => ['你平时用什么编程语言？', '最近在做什么项目？'],
        },
      });

      expect(result.status).toBe('matched');
      expect(result.conversationId).toBe('conv-1');
      // 应更新 Match 状态为 matched
      expect(mockPrisma.match.update).toHaveBeenCalledWith({
        where: { id: 'match-1' },
        data: expect.objectContaining({
          userAChoice: 'interested',
          userARespondedAt: fixedNow,
          status: 'matched',
        }),
      });
      // 应创建 Conversation
      expect(mockPrisma.conversation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          matchId: 'match-1',
          userAId: 'user-a',
          userBId: 'user-b',
          status: 'active',
        }),
      });
    });

    it('userB 表示感兴趣且 userA 已感兴趣时应创建 Conversation', async () => {
      const match = createPendingMatch({ userAChoice: 'interested' });
      mockPrisma.match.findUnique.mockResolvedValue(match);
      mockPrisma.match.update.mockResolvedValue({ ...match, userBChoice: 'interested', status: 'matched' });
      mockPrisma.conversation.create.mockResolvedValue({
        id: 'conv-2',
        matchId: 'match-1',
        userAId: 'user-a',
        userBId: 'user-b',
        status: 'active',
      });
      // Mock user lookup for AI content generation
      const userA = createUserWithProfile('user-a', '小明');
      const userB = createUserWithProfile('user-b', '小红');
      mockPrisma.user.findUnique.mockImplementation(({ where }) => {
        if (where.id === 'user-a') return Promise.resolve(userA);
        if (where.id === 'user-b') return Promise.resolve(userB);
        return Promise.resolve(null);
      });
      mockPrisma.conversation.update.mockResolvedValue({});
      mockPrisma.message.create.mockResolvedValue({ id: 'msg-1' });

      const result = await expressInterest('user-b', 'match-1', {
        prismaClient: mockPrisma,
        getNow,
        aiDeps: {
          generateIntroductionFn: async () => '小明和小红匹配成功！',
          generateIcebreakersFn: async () => ['话题1', '话题2'],
        },
      });

      expect(result.status).toBe('matched');
      expect(result.conversationId).toBe('conv-2');
      expect(mockPrisma.match.update).toHaveBeenCalledWith({
        where: { id: 'match-1' },
        data: expect.objectContaining({
          userBChoice: 'interested',
          userBRespondedAt: fixedNow,
          status: 'matched',
        }),
      });
    });

    it('对方已跳过但 Match 仍为 pending 时，用户感兴趣应返回 waiting', async () => {
      // 这种情况理论上不会发生（对方跳过后 Match 状态会变为 skipped/closed）
      // 但如果 Match 仍为 pending 且对方选择了 skipped，则不应创建 Conversation
      const match = createPendingMatch({ userBChoice: 'skipped' });
      mockPrisma.match.findUnique.mockResolvedValue(match);
      mockPrisma.match.update.mockResolvedValue({ ...match, userAChoice: 'interested', status: 'pending' });

      const result = await expressInterest('user-a', 'match-1', { prismaClient: mockPrisma, getNow });

      expect(result.status).toBe('waiting');
      expect(mockPrisma.conversation.create).not.toHaveBeenCalled();
    });
  });

  describe('skipMatch', () => {
    it('Match 不存在时应抛出 404 错误', async () => {
      mockPrisma.match.findUnique.mockResolvedValue(null);

      await expect(
        skipMatch('user-a', 'match-1', { prismaClient: mockPrisma, getNow })
      ).rejects.toThrow('Match 不存在');
    });

    it('用户不是参与方时应抛出 403 错误', async () => {
      const match = createPendingMatch();
      mockPrisma.match.findUnique.mockResolvedValue(match);

      await expect(
        skipMatch('user-c', 'match-1', { prismaClient: mockPrisma, getNow })
      ).rejects.toThrow('您不是该 Match 的参与方');
    });

    it('Match 状态不是 pending 时应抛出错误', async () => {
      const match = createPendingMatch({ status: 'expired' });
      mockPrisma.match.findUnique.mockResolvedValue(match);

      await expect(
        skipMatch('user-a', 'match-1', { prismaClient: mockPrisma, getNow })
      ).rejects.toThrow('Match 已不在等待状态');
    });

    it('Match 已过期时应抛出错误', async () => {
      const expiredMatch = createPendingMatch({
        expiresAt: new Date('2024-06-14T00:00:00.000Z'),
      });
      mockPrisma.match.findUnique.mockResolvedValue(expiredMatch);

      await expect(
        skipMatch('user-a', 'match-1', { prismaClient: mockPrisma, getNow })
      ).rejects.toThrow('Match 已过期');
    });

    it('用户已响应时应抛出不可撤回错误', async () => {
      const match = createPendingMatch({ userAChoice: 'interested' });
      mockPrisma.match.findUnique.mockResolvedValue(match);

      await expect(
        skipMatch('user-a', 'match-1', { prismaClient: mockPrisma, getNow })
      ).rejects.toThrow('您已做出选择，等待状态下不可撤回或修改');
    });

    it('对方尚未响应时应将 Match 状态设为 closed', async () => {
      const match = createPendingMatch(); // 双方都未响应
      mockPrisma.match.findUnique.mockResolvedValue(match);
      mockPrisma.match.update.mockResolvedValue({ ...match, userAChoice: 'skipped', status: 'closed' });

      const result = await skipMatch('user-a', 'match-1', { prismaClient: mockPrisma, getNow });

      expect(result.status).toBe('closed');
      expect(mockPrisma.match.update).toHaveBeenCalledWith({
        where: { id: 'match-1' },
        data: expect.objectContaining({
          userAChoice: 'skipped',
          userARespondedAt: fixedNow,
          status: 'closed',
        }),
      });
    });

    it('对方已响应（感兴趣）时应将 Match 状态设为 skipped', async () => {
      const match = createPendingMatch({ userBChoice: 'interested' });
      mockPrisma.match.findUnique.mockResolvedValue(match);
      mockPrisma.match.update.mockResolvedValue({ ...match, userAChoice: 'skipped', status: 'skipped' });

      const result = await skipMatch('user-a', 'match-1', { prismaClient: mockPrisma, getNow });

      expect(result.status).toBe('skipped');
      expect(mockPrisma.match.update).toHaveBeenCalledWith({
        where: { id: 'match-1' },
        data: expect.objectContaining({
          userAChoice: 'skipped',
          userARespondedAt: fixedNow,
          status: 'skipped',
        }),
      });
    });

    it('userB 跳过且 userA 尚未响应时应将 Match 状态设为 closed', async () => {
      const match = createPendingMatch();
      mockPrisma.match.findUnique.mockResolvedValue(match);
      mockPrisma.match.update.mockResolvedValue({ ...match, userBChoice: 'skipped', status: 'closed' });

      const result = await skipMatch('user-b', 'match-1', { prismaClient: mockPrisma, getNow });

      expect(result.status).toBe('closed');
      expect(mockPrisma.match.update).toHaveBeenCalledWith({
        where: { id: 'match-1' },
        data: expect.objectContaining({
          userBChoice: 'skipped',
          userBRespondedAt: fixedNow,
          status: 'closed',
        }),
      });
    });
  });

  describe('等待状态下撤回被拒绝 - 边界场景', () => {
    it('用户已选择"感兴趣"后尝试跳过应被拒绝（不可撤回）', async () => {
      // 需求 5.7: 等待状态下不允许已选择方撤回或修改其选择
      const match = createPendingMatch({ userAChoice: 'interested' });
      mockPrisma.match.findUnique.mockResolvedValue(match);

      await expect(
        skipMatch('user-a', 'match-1', { prismaClient: mockPrisma, getNow })
      ).rejects.toThrow('您已做出选择，等待状态下不可撤回或修改');

      // 不应更新 Match
      expect(mockPrisma.match.update).not.toHaveBeenCalled();
    });

    it('用户已选择"跳过"后尝试表示感兴趣应被拒绝（不可撤回）', async () => {
      // 需求 5.7: 等待状态下不允许已选择方撤回或修改其选择
      const match = createPendingMatch({ userBChoice: 'skipped' });
      mockPrisma.match.findUnique.mockResolvedValue(match);

      await expect(
        expressInterest('user-b', 'match-1', { prismaClient: mockPrisma, getNow })
      ).rejects.toThrow('您已做出选择，等待状态下不可撤回或修改');

      // 不应更新 Match
      expect(mockPrisma.match.update).not.toHaveBeenCalled();
    });

    it('一方感兴趣后另一方仍可正常操作', async () => {
      // 需求 5.4: 仅一方选择"感兴趣"时保持等待状态
      const match = createPendingMatch({ userAChoice: 'interested' });
      mockPrisma.match.findUnique.mockResolvedValue(match);
      mockPrisma.match.update.mockResolvedValue({ ...match, userBChoice: 'skipped', status: 'skipped' });

      // userB 仍可以跳过
      const result = await skipMatch('user-b', 'match-1', { prismaClient: mockPrisma, getNow });
      expect(result.status).toBe('skipped');
    });
  });

  describe('isMatchExpired', () => {
    it('未过期的 Match 应返回 false', () => {
      const match = createPendingMatch({
        expiresAt: new Date('2024-06-16T00:00:00.000Z'),
      });

      const result = isMatchExpired(match, { getNow });
      expect(result).toBe(false);
    });

    it('已过期的 Match 应返回 true', () => {
      const match = createPendingMatch({
        expiresAt: new Date('2024-06-14T00:00:00.000Z'),
      });

      const result = isMatchExpired(match, { getNow });
      expect(result).toBe(true);
    });

    it('恰好到期时间时应返回 true', () => {
      const match = createPendingMatch({
        expiresAt: fixedNow, // 恰好等于当前时间
      });

      const result = isMatchExpired(match, { getNow });
      expect(result).toBe(true);
    });
  });

  describe('processExpiredMatches', () => {
    it('应将所有过期的 pending Match 标记为 expired', async () => {
      mockPrisma.match.updateMany.mockResolvedValue({ count: 5 });

      const result = await processExpiredMatches({ prismaClient: mockPrisma, getNow });

      expect(result.expiredCount).toBe(5);
      expect(mockPrisma.match.updateMany).toHaveBeenCalledWith({
        where: {
          status: 'pending',
          expiresAt: {
            lte: fixedNow,
          },
        },
        data: {
          status: 'expired',
        },
      });
    });

    it('无过期 Match 时应返回 expiredCount 为 0', async () => {
      mockPrisma.match.updateMany.mockResolvedValue({ count: 0 });

      const result = await processExpiredMatches({ prismaClient: mockPrisma, getNow });

      expect(result.expiredCount).toBe(0);
    });
  });

  describe('generateAIContentForConversation', () => {
    it('应并行调用 AI 生成介绍语和破冰话题并存储到 Conversation 和系统消息', async () => {
      const conversation = { id: 'conv-1' };
      const userA = createUserWithProfile('user-a', '小明');
      const userB = createUserWithProfile('user-b', '小红');

      mockPrisma.conversation.update.mockResolvedValue({});
      mockPrisma.message.create.mockResolvedValue({ id: 'msg-1' });

      const mockIntro = '小明和小红，你们都在北京工作，一定有很多共同话题！';
      const mockIcebreakers = ['你平时用什么编程语言？', '最近在做什么项目？'];

      const result = await generateAIContentForConversation(
        conversation,
        userA,
        userB,
        mockPrisma,
        {
          generateIntroductionFn: async () => mockIntro,
          generateIcebreakersFn: async () => mockIcebreakers,
        }
      );

      expect(result.introduction).toBe(mockIntro);
      expect(result.icebreakers).toEqual(mockIcebreakers);

      // 应更新 Conversation 记录
      expect(mockPrisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 'conv-1' },
        data: {
          introduction: mockIntro,
          icebreakers: mockIcebreakers,
        },
      });

      // 应创建系统消息
      expect(mockPrisma.message.create).toHaveBeenCalledWith({
        data: {
          conversationId: 'conv-1',
          senderId: 'user-a',
          content: JSON.stringify({ introduction: mockIntro, icebreakers: mockIcebreakers }),
          type: 'system',
        },
      });
    });

    it('介绍语生成超时时应使用降级模板', async () => {
      const conversation = { id: 'conv-1' };
      const userA = createUserWithProfile('user-a', '小明');
      const userB = createUserWithProfile('user-b', '小红');

      mockPrisma.conversation.update.mockResolvedValue({});
      mockPrisma.message.create.mockResolvedValue({ id: 'msg-1' });

      const mockIcebreakers = ['话题1', '话题2'];

      const result = await generateAIContentForConversation(
        conversation,
        userA,
        userB,
        mockPrisma,
        {
          // 模拟超时：返回一个永远不会 resolve 的 Promise
          generateIntroductionFn: () => new Promise(() => {}),
          generateIcebreakersFn: async () => mockIcebreakers,
        }
      );

      // 应使用降级模板（包含双方昵称）
      expect(result.introduction).toContain('小明');
      expect(result.introduction).toContain('小红');
      expect(result.icebreakers).toEqual(mockIcebreakers);
    }, 10000);

    it('破冰话题生成超时时应使用默认破冰话题', async () => {
      const conversation = { id: 'conv-1' };
      const userA = createUserWithProfile('user-a', '小明');
      const userB = createUserWithProfile('user-b', '小红');

      mockPrisma.conversation.update.mockResolvedValue({});
      mockPrisma.message.create.mockResolvedValue({ id: 'msg-1' });

      const mockIntro = '小明和小红匹配成功！';

      const result = await generateAIContentForConversation(
        conversation,
        userA,
        userB,
        mockPrisma,
        {
          generateIntroductionFn: async () => mockIntro,
          // 模拟超时
          generateIcebreakersFn: () => new Promise(() => {}),
        }
      );

      expect(result.introduction).toBe(mockIntro);
      // 应使用默认破冰话题
      expect(result.icebreakers).toHaveLength(3);
      expect(result.icebreakers[0]).toBe('最近有什么有趣的事情想分享吗？');
    }, 10000);

    it('AI 生成函数抛出错误时应使用降级方案', async () => {
      const conversation = { id: 'conv-1' };
      const userA = createUserWithProfile('user-a', '小明');
      const userB = createUserWithProfile('user-b', '小红');

      mockPrisma.conversation.update.mockResolvedValue({});
      mockPrisma.message.create.mockResolvedValue({ id: 'msg-1' });

      const result = await generateAIContentForConversation(
        conversation,
        userA,
        userB,
        mockPrisma,
        {
          generateIntroductionFn: async () => { throw new Error('AI 服务不可用'); },
          generateIcebreakersFn: async () => { throw new Error('AI 服务不可用'); },
        }
      );

      // 应使用降级模板
      expect(result.introduction).toContain('小明');
      expect(result.introduction).toContain('小红');
      expect(result.icebreakers).toHaveLength(3);
    });
  });

  describe('expressInterestWithAIContent', () => {
    it('双方都感兴趣时应等待 AI 内容生成完成并返回 aiContent', async () => {
      const match = createPendingMatch({ userBChoice: 'interested' });
      mockPrisma.match.findUnique.mockResolvedValue(match);
      mockPrisma.match.update.mockResolvedValue({ ...match, userAChoice: 'interested', status: 'matched' });
      mockPrisma.conversation.create.mockResolvedValue({
        id: 'conv-1',
        matchId: 'match-1',
        userAId: 'user-a',
        userBId: 'user-b',
        status: 'active',
      });

      const userA = createUserWithProfile('user-a', '小明');
      const userB = createUserWithProfile('user-b', '小红');
      mockPrisma.user.findUnique.mockImplementation(({ where }) => {
        if (where.id === 'user-a') return Promise.resolve(userA);
        if (where.id === 'user-b') return Promise.resolve(userB);
        return Promise.resolve(null);
      });
      mockPrisma.conversation.update.mockResolvedValue({});
      mockPrisma.message.create.mockResolvedValue({ id: 'msg-1' });

      const mockIntro = '小明和小红，你们都是工程师！';
      const mockIcebreakers = ['话题1', '话题2'];

      const result = await expressInterestWithAIContent('user-a', 'match-1', {
        prismaClient: mockPrisma,
        getNow,
        aiDeps: {
          generateIntroductionFn: async () => mockIntro,
          generateIcebreakersFn: async () => mockIcebreakers,
        },
      });

      expect(result.status).toBe('matched');
      expect(result.conversationId).toBe('conv-1');
      expect(result.aiContent).toEqual({
        introduction: mockIntro,
        icebreakers: mockIcebreakers,
      });

      // 应更新 Conversation 记录
      expect(mockPrisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 'conv-1' },
        data: {
          introduction: mockIntro,
          icebreakers: mockIcebreakers,
        },
      });

      // 应创建系统消息
      expect(mockPrisma.message.create).toHaveBeenCalledWith({
        data: {
          conversationId: 'conv-1',
          senderId: 'user-a',
          content: JSON.stringify({ introduction: mockIntro, icebreakers: mockIcebreakers }),
          type: 'system',
        },
      });
    });

    it('仅一方感兴趣时不应生成 AI 内容', async () => {
      const match = createPendingMatch();
      mockPrisma.match.findUnique.mockResolvedValue(match);
      mockPrisma.match.update.mockResolvedValue({ ...match, userAChoice: 'interested', status: 'pending' });

      const result = await expressInterestWithAIContent('user-a', 'match-1', {
        prismaClient: mockPrisma,
        getNow,
      });

      expect(result.status).toBe('waiting');
      expect(result.aiContent).toBeUndefined();
      expect(mockPrisma.conversation.create).not.toHaveBeenCalled();
    });
  });
});
