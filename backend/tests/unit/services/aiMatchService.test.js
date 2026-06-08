/**
 * aiMatchService 单元测试
 * 测试 AI 匹配服务的核心逻辑
 */
import { jest } from '@jest/globals';
import {
  calculateMatchScore,
  generateDailyRecommendations,
  buildMatchPrompt,
  parseMatchResponse,
} from '../../../src/services/aiMatchService.js';
import { createMockPrismaClient } from '../../helpers/mockFactory.js';

describe('aiMatchService', () => {
  let mockPrisma;
  let mockChatCompletion;

  // 测试用户数据
  const userA = {
    id: 'user-a-id',
    status: 'preference_set',
    profile: {
      name: '张三',
      birthYear: 1995,
      gender: 'male',
      occupation: '软件工程师',
      city: '北京',
      bio: '热爱编程和旅行',
    },
    preference: {
      ageMin: 22,
      ageMax: 32,
      occupationTypes: ['设计师', '产品经理'],
      personalityTraits: ['外向', '幽默'],
      datingIntent: 'serious_dating',
    },
  };

  const userB = {
    id: 'user-b-id',
    status: 'preference_set',
    profile: {
      name: '李四',
      birthYear: 1997,
      gender: 'female',
      occupation: '产品经理',
      city: '北京',
      bio: '喜欢阅读和美食',
    },
    preference: {
      ageMin: 25,
      ageMax: 35,
      occupationTypes: ['工程师', '软件工程师'],
      personalityTraits: ['稳重', '有责任心'],
      datingIntent: 'serious_dating',
    },
  };

  beforeEach(() => {
    mockPrisma = createMockPrismaClient();
    mockPrisma.$transaction = jest.fn((operations) => Promise.all(operations));
    mockChatCompletion = jest.fn();
  });

  describe('buildMatchPrompt', () => {
    it('应生成包含系统消息和用户消息的提示词数组', () => {
      const messages = buildMatchPrompt(userA, userB);

      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe('system');
      expect(messages[1].role).toBe('user');
    });

    it('系统消息应包含四个匹配维度说明', () => {
      const messages = buildMatchPrompt(userA, userB);
      const systemContent = messages[0].content;

      expect(systemContent).toContain('年龄匹配度');
      expect(systemContent).toContain('职业兼容性');
      expect(systemContent).toContain('性格互补性');
      expect(systemContent).toContain('意图一致性');
    });

    it('用户消息应包含双方的资料和偏好信息', () => {
      const messages = buildMatchPrompt(userA, userB);
      const userContent = messages[1].content;

      expect(userContent).toContain('张三');
      expect(userContent).toContain('李四');
      expect(userContent).toContain('软件工程师');
      expect(userContent).toContain('产品经理');
      expect(userContent).toContain('北京');
    });

    it('应正确处理空的职业类型和性格特征', () => {
      const userWithEmpty = {
        ...userA,
        preference: {
          ...userA.preference,
          occupationTypes: [],
          personalityTraits: [],
        },
      };

      const messages = buildMatchPrompt(userWithEmpty, userB);
      const userContent = messages[1].content;

      expect(userContent).toContain('不限');
    });
  });

  describe('parseMatchResponse', () => {
    it('应正确解析合法的 JSON 响应', () => {
      const response = '{"score": 75, "reason": "你们在职业兼容性方面高度匹配，都对技术行业有深入了解"}';
      const result = parseMatchResponse(response);

      expect(result.score).toBe(75);
      expect(result.reason).toContain('职业');
    });

    it('应处理带有 markdown 代码块的响应', () => {
      const response = '```json\n{"score": 80, "reason": "你们的年龄匹配度很高，交友意图也完全一致"}\n```';
      const result = parseMatchResponse(response);

      expect(result.score).toBe(80);
      expect(result.reason).toContain('年龄');
    });

    it('应将超出范围的分数限制为 0', () => {
      const response = '{"score": 150, "reason": "你们在性格互补性方面表现优秀，值得深入了解"}';
      const result = parseMatchResponse(response);

      expect(result.score).toBe(0);
    });

    it('应将负分限制为 0', () => {
      const response = '{"score": -10, "reason": "你们在意图一致性方面有一定差异"}';
      const result = parseMatchResponse(response);

      expect(result.score).toBe(0);
    });

    it('应在 reason 过短时补充默认内容', () => {
      const response = '{"score": 70, "reason": "不错"}';
      const result = parseMatchResponse(response);

      expect(result.reason.length).toBeGreaterThanOrEqual(10);
    });

    it('应在 reason 过长时截断到100字符', () => {
      const longReason = '你们在职业兼容性方面' + '非常匹配'.repeat(30);
      const response = JSON.stringify({ score: 70, reason: longReason });
      const result = parseMatchResponse(response);

      expect(result.reason.length).toBeLessThanOrEqual(100);
    });

    it('应在 reason 不包含匹配维度关键词时补充', () => {
      const response = '{"score": 70, "reason": "你们两个人非常适合在一起，有很多共同点值得探索"}';
      const result = parseMatchResponse(response);

      const hasKeyword = ['年龄', '职业', '性格', '意图'].some((kw) =>
        result.reason.includes(kw)
      );
      expect(hasKeyword).toBe(true);
    });

    it('应在 JSON 解析失败时返回默认值', () => {
      const response = '这不是一个有效的 JSON';
      const result = parseMatchResponse(response);

      expect(result.score).toBe(0);
      expect(result.reason).toBeTruthy();
    });

    it('应对分数进行四舍五入', () => {
      const response = '{"score": 72.6, "reason": "你们在年龄匹配度和职业兼容性方面都表现不错"}';
      const result = parseMatchResponse(response);

      expect(result.score).toBe(73);
      expect(Number.isInteger(result.score)).toBe(true);
    });
  });

  describe('calculateMatchScore', () => {
    it('应调用 AI 并返回匹配分数和理由', async () => {
      mockChatCompletion.mockResolvedValue(
        '{"score": 78, "reason": "你们在职业兼容性和意图一致性方面高度匹配"}'
      );

      const result = await calculateMatchScore(userA, userB, {
        chatCompletionFn: mockChatCompletion,
      });

      expect(result.score).toBe(78);
      expect(result.reason).toContain('职业');
      expect(mockChatCompletion).toHaveBeenCalledTimes(1);
    });

    it('应在 AI 调用失败时返回 0 分（降级策略）', async () => {
      mockChatCompletion.mockRejectedValue(new Error('AI 服务不可用'));

      const result = await calculateMatchScore(userA, userB, {
        chatCompletionFn: mockChatCompletion,
      });

      expect(result.score).toBe(0);
      expect(result.reason).toBe('');
    });

    it('应使用正确的 AI 参数调用', async () => {
      mockChatCompletion.mockResolvedValue(
        '{"score": 65, "reason": "你们在年龄匹配度方面比较合适"}'
      );

      await calculateMatchScore(userA, userB, {
        chatCompletionFn: mockChatCompletion,
      });

      const [messages, options] = mockChatCompletion.mock.calls[0];
      expect(messages).toHaveLength(2);
      expect(options.temperature).toBe(0.3);
      expect(options.max_tokens).toBe(300);
      expect(options.response_format).toEqual({ type: 'json_object' });
    });
  });

  describe('generateDailyRecommendations', () => {
    beforeEach(() => {
      // 默认 mock：当前用户
      mockPrisma.user.findUnique.mockResolvedValue(userA);

      // 默认 mock：候选人列表
      mockPrisma.user.findMany.mockResolvedValue([userB]);

      // 默认 mock：无排除对象
      mockPrisma.match.findMany.mockResolvedValue([]);

      // 默认 mock：创建 Match
      mockPrisma.match.create.mockResolvedValue({ id: 'match-id-1' });

      // 默认 mock：创建 DailyRecommendation
      mockPrisma.dailyRecommendation.create.mockResolvedValue({
        id: 'rec-id',
        userId: 'user-a-id',
        matchIds: ['match-id-1'],
        status: 'pending',
      });

      // 默认 mock：AI 返回高分
      mockChatCompletion.mockResolvedValue(
        '{"score": 78, "reason": "你们在职业兼容性和意图一致性方面高度匹配"}'
      );
    });

    it('应成功生成每日推荐', async () => {
      const result = await generateDailyRecommendations('user-a-id', {
        prismaClient: mockPrisma,
        chatCompletionFn: mockChatCompletion,
      });

      expect(result).not.toBeNull();
      expect(result.matchIds).toContain('match-id-1');
      expect(mockPrisma.match.create).toHaveBeenCalled();
      expect(mockPrisma.dailyRecommendation.create).toHaveBeenCalled();
    });

    it('应在用户资料未完成时抛出错误', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-a-id',
        profile: null,
        preference: null,
      });

      await expect(
        generateDailyRecommendations('user-a-id', {
          prismaClient: mockPrisma,
          chatCompletionFn: mockChatCompletion,
        })
      ).rejects.toMatchObject({
        code: 'USER_NOT_READY',
      });
    });

    it('应在无候选人时返回 null', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);

      const result = await generateDailyRecommendations('user-a-id', {
        prismaClient: mockPrisma,
        chatCompletionFn: mockChatCompletion,
      });

      expect(result).toBeNull();
    });

    it('应排除已匹配的对象', async () => {
      // 模拟 userB 已经与 userA 匹配
      mockPrisma.match.findMany.mockImplementation(({ where }) => {
        if (where.status === 'matched') {
          return Promise.resolve([{ userAId: 'user-a-id', userBId: 'user-b-id' }]);
        }
        return Promise.resolve([]);
      });

      const result = await generateDailyRecommendations('user-a-id', {
        prismaClient: mockPrisma,
        chatCompletionFn: mockChatCompletion,
      });

      expect(result).toBeNull();
    });

    it('应排除30天内跳过的对象', async () => {
      // 第一次调用返回空（已匹配），第二次调用返回跳过记录
      let callCount = 0;
      mockPrisma.match.findMany.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve([]);
        }
        return Promise.resolve([{ userAId: 'user-a-id', userBId: 'user-b-id' }]);
      });

      const result = await generateDailyRecommendations('user-a-id', {
        prismaClient: mockPrisma,
        chatCompletionFn: mockChatCompletion,
      });

      expect(result).toBeNull();
    });

    it('应过滤掉分数低于60的候选人', async () => {
      mockChatCompletion.mockResolvedValue(
        '{"score": 45, "reason": "你们在意图一致性方面有一定差异"}'
      );

      const result = await generateDailyRecommendations('user-a-id', {
        prismaClient: mockPrisma,
        chatCompletionFn: mockChatCompletion,
      });

      expect(result).toBeNull();
      expect(mockPrisma.match.create).not.toHaveBeenCalled();
    });

    it('应最多推荐3个候选人', async () => {
      // 4个候选人
      const candidates = [
        { ...userB, id: 'user-b-1' },
        { ...userB, id: 'user-b-2' },
        { ...userB, id: 'user-b-3' },
        { ...userB, id: 'user-b-4' },
      ];
      mockPrisma.user.findMany.mockResolvedValue(candidates);

      let matchCount = 0;
      mockPrisma.match.create.mockImplementation(() => {
        matchCount++;
        return Promise.resolve({ id: `match-id-${matchCount}` });
      });

      mockPrisma.dailyRecommendation.create.mockImplementation(({ data }) => {
        return Promise.resolve({
          id: 'rec-id',
          userId: data.userId,
          matchIds: data.matchIds,
          status: 'pending',
        });
      });

      mockChatCompletion.mockResolvedValue(
        '{"score": 80, "reason": "你们在职业兼容性方面高度匹配"}'
      );

      const result = await generateDailyRecommendations('user-a-id', {
        prismaClient: mockPrisma,
        chatCompletionFn: mockChatCompletion,
      });

      expect(result).not.toBeNull();
      expect(mockPrisma.match.create).toHaveBeenCalledTimes(3);
    });

    it('应按分数降序排列推荐结果', async () => {
      const candidates = [
        { ...userB, id: 'user-b-1' },
        { ...userB, id: 'user-b-2' },
        { ...userB, id: 'user-b-3' },
      ];
      mockPrisma.user.findMany.mockResolvedValue(candidates);

      let callIdx = 0;
      const scores = [65, 90, 75];
      mockChatCompletion.mockImplementation(() => {
        const score = scores[callIdx++];
        return Promise.resolve(
          `{"score": ${score}, "reason": "你们在年龄匹配度方面表现良好，分数${score}"}`
        );
      });

      let createdMatches = [];
      mockPrisma.match.create.mockImplementation(({ data }) => {
        const match = { id: `match-${data.score}`, ...data };
        createdMatches.push(match);
        return Promise.resolve(match);
      });

      mockPrisma.dailyRecommendation.create.mockImplementation(({ data }) => {
        return Promise.resolve({ id: 'rec-id', ...data });
      });

      await generateDailyRecommendations('user-a-id', {
        prismaClient: mockPrisma,
        chatCompletionFn: mockChatCompletion,
      });

      // 验证创建的 Match 按分数降序
      expect(createdMatches[0].score).toBe(90);
      expect(createdMatches[1].score).toBe(75);
      expect(createdMatches[2].score).toBe(65);
    });

    it('应为 Match 设置72小时过期时间', async () => {
      mockPrisma.match.create.mockImplementation(({ data }) => {
        return Promise.resolve({ id: 'match-id', ...data });
      });

      await generateDailyRecommendations('user-a-id', {
        prismaClient: mockPrisma,
        chatCompletionFn: mockChatCompletion,
      });

      const createCall = mockPrisma.match.create.mock.calls[0][0];
      const expiresAt = new Date(createCall.data.expiresAt);
      const now = new Date();
      const diffHours = (expiresAt - now) / (1000 * 60 * 60);

      // 应该大约是72小时（允许几秒误差）
      expect(diffHours).toBeGreaterThan(71.9);
      expect(diffHours).toBeLessThanOrEqual(72);
    });

    it('应在 AI 调用全部失败时返回 null', async () => {
      mockChatCompletion.mockRejectedValue(new Error('AI 服务不可用'));

      const result = await generateDailyRecommendations('user-a-id', {
        prismaClient: mockPrisma,
        chatCompletionFn: mockChatCompletion,
      });

      // AI 失败返回 score 0，低于60分阈值，所以结果为 null
      expect(result).toBeNull();
    });

    it('应排除没有 profile 或 preference 的候选人', async () => {
      const candidateWithoutProfile = {
        id: 'user-no-profile',
        status: 'preference_set',
        profile: null,
        preference: userB.preference,
      };

      mockPrisma.user.findMany.mockResolvedValue([candidateWithoutProfile]);

      const result = await generateDailyRecommendations('user-a-id', {
        prismaClient: mockPrisma,
        chatCompletionFn: mockChatCompletion,
      });

      expect(result).toBeNull();
      expect(mockChatCompletion).not.toHaveBeenCalled();
    });

    it('应同时排除已匹配和30天内跳过的不同对象', async () => {
      // 3个候选人
      const candidates = [
        { ...userB, id: 'user-matched' },
        { ...userB, id: 'user-skipped' },
        { ...userB, id: 'user-valid' },
      ];
      mockPrisma.user.findMany.mockResolvedValue(candidates);

      // 第一次调用返回已匹配记录，第二次调用返回跳过记录
      let callCount = 0;
      mockPrisma.match.findMany.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // 已匹配的对象
          return Promise.resolve([{ userAId: 'user-a-id', userBId: 'user-matched' }]);
        }
        // 30天内跳过的对象
        return Promise.resolve([{ userAId: 'user-a-id', userBId: 'user-skipped' }]);
      });

      mockChatCompletion.mockResolvedValue(
        '{"score": 80, "reason": "你们在职业兼容性方面高度匹配"}'
      );

      mockPrisma.match.create.mockResolvedValue({ id: 'match-valid' });
      mockPrisma.dailyRecommendation.create.mockResolvedValue({
        id: 'rec-id',
        userId: 'user-a-id',
        matchIds: ['match-valid'],
        status: 'pending',
      });

      const result = await generateDailyRecommendations('user-a-id', {
        prismaClient: mockPrisma,
        chatCompletionFn: mockChatCompletion,
      });

      // 只有 user-valid 应该被评估
      expect(mockChatCompletion).toHaveBeenCalledTimes(1);
      expect(result).not.toBeNull();
    });

    it('无候选对象时应返回 null 并建议调整偏好（需求 4.7）', async () => {
      // 所有候选人都被排除
      mockPrisma.user.findMany.mockResolvedValue([userB]);

      // userB 已被匹配
      let callCount = 0;
      mockPrisma.match.findMany.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve([{ userAId: 'user-a-id', userBId: 'user-b-id' }]);
        }
        return Promise.resolve([]);
      });

      const result = await generateDailyRecommendations('user-a-id', {
        prismaClient: mockPrisma,
        chatCompletionFn: mockChatCompletion,
      });

      // 返回 null 表示暂无推荐
      expect(result).toBeNull();
      // AI 不应被调用（候选人已被过滤）
      expect(mockChatCompletion).not.toHaveBeenCalled();
    });
  });
});
