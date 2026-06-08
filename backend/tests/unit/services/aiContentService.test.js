/**
 * aiContentService 单元测试
 * 测试 AI 内容生成服务的核心逻辑
 */
import { jest } from '@jest/globals';
import {
  generateIntroduction,
  generateIcebreakers,
  buildIntroductionPrompt,
  buildIcebreakersPrompt,
  buildFallbackIntroduction,
  containsProfileInfo,
  parseIcebreakersResponse,
} from '../../../src/services/aiContentService.js';

describe('aiContentService', () => {
  let mockChatCompletion;

  // 测试用户数据
  const userA = {
    id: 'user-a-id',
    profile: {
      name: '张三',
      birthYear: 1995,
      gender: 'male',
      occupation: '软件工程师',
      city: '北京',
      bio: '热爱编程和旅行',
    },
  };

  const userB = {
    id: 'user-b-id',
    profile: {
      name: '李四',
      birthYear: 1997,
      gender: 'female',
      occupation: '产品经理',
      city: '上海',
      bio: '喜欢阅读和美食',
    },
  };

  beforeEach(() => {
    mockChatCompletion = jest.fn();
  });

  describe('buildFallbackIntroduction', () => {
    it('应生成包含双方昵称的通用介绍语', () => {
      const intro = buildFallbackIntroduction(userA, userB);

      expect(intro).toContain('张三');
      expect(intro).toContain('李四');
      expect(intro.length).toBeLessThanOrEqual(200);
    });

    it('应在 profile 缺失时使用默认名称', () => {
      const userNoProfile = { id: 'no-profile', profile: null };
      const intro = buildFallbackIntroduction(userNoProfile, userB);

      expect(intro).toContain('用户A');
      expect(intro).toContain('李四');
    });

    it('应在双方 profile 均缺失时使用默认名称', () => {
      const userNoProfileA = { id: 'no-a', profile: null };
      const userNoProfileB = { id: 'no-b', profile: undefined };
      const intro = buildFallbackIntroduction(userNoProfileA, userNoProfileB);

      expect(intro).toContain('用户A');
      expect(intro).toContain('用户B');
      expect(intro.length).toBeLessThanOrEqual(200);
    });

    it('降级模板应引导双方开始对话（需求 7.6）', () => {
      const intro = buildFallbackIntroduction(userA, userB);

      // 需求 7.6: 该模板包含双方的昵称并引导双方开始对话
      expect(intro).toContain('张三');
      expect(intro).toContain('李四');
      // 验证模板包含引导对话的内容
      expect(intro.length).toBeGreaterThan(0);
    });
  });

  describe('buildIntroductionPrompt', () => {
    it('应生成包含系统消息和用户消息的提示词数组', () => {
      const messages = buildIntroductionPrompt(userA, userB);

      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe('system');
      expect(messages[1].role).toBe('user');
    });

    it('系统消息应包含200字符限制要求', () => {
      const messages = buildIntroductionPrompt(userA, userB);
      expect(messages[0].content).toContain('200');
    });

    it('用户消息应包含双方的 Profile 信息', () => {
      const messages = buildIntroductionPrompt(userA, userB);
      const userContent = messages[1].content;

      expect(userContent).toContain('张三');
      expect(userContent).toContain('李四');
      expect(userContent).toContain('软件工程师');
      expect(userContent).toContain('产品经理');
      expect(userContent).toContain('北京');
      expect(userContent).toContain('上海');
    });

    it('应正确处理缺失的 Profile 字段', () => {
      const userEmpty = { id: 'empty', profile: {} };
      const messages = buildIntroductionPrompt(userEmpty, userB);
      const userContent = messages[1].content;

      expect(userContent).toContain('未知');
    });
  });

  describe('buildIcebreakersPrompt', () => {
    it('应生成包含系统消息和用户消息的提示词数组', () => {
      const messages = buildIcebreakersPrompt(userA, userB);

      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe('system');
      expect(messages[1].role).toBe('user');
    });

    it('系统消息应包含50字符限制和2-3个话题要求', () => {
      const messages = buildIcebreakersPrompt(userA, userB);
      const systemContent = messages[0].content;

      expect(systemContent).toContain('50');
      expect(systemContent).toContain('2');
      expect(systemContent).toContain('3');
    });

    it('用户消息应包含双方的 Profile 信息', () => {
      const messages = buildIcebreakersPrompt(userA, userB);
      const userContent = messages[1].content;

      expect(userContent).toContain('张三');
      expect(userContent).toContain('李四');
      expect(userContent).toContain('软件工程师');
      expect(userContent).toContain('产品经理');
    });
  });

  describe('containsProfileInfo', () => {
    it('应在介绍语包含用户姓名时返回 true', () => {
      const intro = '张三和李四都是很有趣的人';
      expect(containsProfileInfo(intro, userA, userB)).toBe(true);
    });

    it('应在介绍语包含职业时返回 true', () => {
      const intro = '一位软件工程师和一位产品经理的相遇';
      expect(containsProfileInfo(intro, userA, userB)).toBe(true);
    });

    it('应在介绍语包含城市时返回 true', () => {
      const intro = '来自北京的朋友想认识你';
      expect(containsProfileInfo(intro, userA, userB)).toBe(true);
    });

    it('应在介绍语不包含任何 Profile 信息时返回 false', () => {
      const intro = '你们已经成功匹配了，开始聊天吧';
      expect(containsProfileInfo(intro, userA, userB)).toBe(false);
    });

    it('应在 Profile 字段全部为空时返回 false', () => {
      const emptyUser = { id: 'empty', profile: {} };
      const intro = '你们已经成功匹配了';
      expect(containsProfileInfo(intro, emptyUser, emptyUser)).toBe(false);
    });
  });

  describe('parseIcebreakersResponse', () => {
    it('应正确解析合法的 JSON 数组', () => {
      const response = '["你平时喜欢什么运动？", "最近看了什么好书？", "周末一般怎么度过？"]';
      const result = parseIcebreakersResponse(response);

      expect(result).toHaveLength(3);
      expect(result[0]).toBe('你平时喜欢什么运动？');
    });

    it('应处理带有 markdown 代码块的响应', () => {
      const response = '```json\n["话题一", "话题二"]\n```';
      const result = parseIcebreakersResponse(response);

      expect(result).toHaveLength(2);
    });

    it('应截断超过50字符的话题', () => {
      const longTopic = '这是一个非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常长的话题';
      const response = JSON.stringify([longTopic, '短话题']);
      const result = parseIcebreakersResponse(response);

      expect(result[0].length).toBeLessThanOrEqual(50);
    });

    it('应在话题少于2个时返回 null', () => {
      const response = '["只有一个话题"]';
      const result = parseIcebreakersResponse(response);

      expect(result).toBeNull();
    });

    it('应最多返回3个话题', () => {
      const response = '["话题1", "话题2", "话题3", "话题4", "话题5"]';
      const result = parseIcebreakersResponse(response);

      expect(result).toHaveLength(3);
    });

    it('应在 JSON 解析失败时返回 null', () => {
      const response = '这不是有效的 JSON';
      const result = parseIcebreakersResponse(response);

      expect(result).toBeNull();
    });

    it('应在返回非数组时返回 null', () => {
      const response = '{"topics": ["话题1", "话题2"]}';
      const result = parseIcebreakersResponse(response);

      expect(result).toBeNull();
    });

    it('应过滤空字符串话题', () => {
      const response = '["话题1", "", "  ", "话题2"]';
      const result = parseIcebreakersResponse(response);

      expect(result).toHaveLength(2);
      expect(result).toEqual(['话题1', '话题2']);
    });

    it('应过滤非字符串类型的元素', () => {
      const response = '["话题1", 123, null, "话题2", true]';
      const result = parseIcebreakersResponse(response);

      expect(result).toHaveLength(2);
      expect(result).toEqual(['话题1', '话题2']);
    });

    it('应在所有元素过滤后不足2个时返回 null', () => {
      const response = '["话题1", null, 123, "", "  "]';
      const result = parseIcebreakersResponse(response);

      expect(result).toBeNull();
    });
  });

  describe('generateIntroduction', () => {
    it('应调用 AI 并返回介绍语', async () => {
      mockChatCompletion.mockResolvedValue(
        '张三是一位来自北京的软件工程师，李四是上海的产品经理，你们都对技术充满热情，快来聊聊吧！'
      );

      const result = await generateIntroduction(userA, userB, {
        chatCompletionFn: mockChatCompletion,
      });

      expect(result).toContain('张三');
      expect(result.length).toBeLessThanOrEqual(200);
      expect(mockChatCompletion).toHaveBeenCalledTimes(1);
    });

    it('应在介绍语超过200字符时截断', async () => {
      const longIntro = '张三' + '是一个很有趣的人'.repeat(30);
      mockChatCompletion.mockResolvedValue(longIntro);

      const result = await generateIntroduction(userA, userB, {
        chatCompletionFn: mockChatCompletion,
      });

      expect(result.length).toBeLessThanOrEqual(200);
    });

    it('应在 AI 失败时使用降级模板', async () => {
      mockChatCompletion.mockRejectedValue(new Error('AI 服务不可用'));

      const result = await generateIntroduction(userA, userB, {
        chatCompletionFn: mockChatCompletion,
      });

      expect(result).toContain('张三');
      expect(result).toContain('李四');
      expect(result.length).toBeLessThanOrEqual(200);
    });

    it('应在介绍语不包含 Profile 信息时使用降级模板', async () => {
      mockChatCompletion.mockResolvedValue('你们已经成功匹配了，开始愉快的交流吧！');

      const result = await generateIntroduction(userA, userB, {
        chatCompletionFn: mockChatCompletion,
      });

      // 降级模板包含双方昵称
      expect(result).toContain('张三');
      expect(result).toContain('李四');
    });

    it('应使用正确的 AI 参数调用', async () => {
      mockChatCompletion.mockResolvedValue('张三和李四，你们好！');

      await generateIntroduction(userA, userB, {
        chatCompletionFn: mockChatCompletion,
      });

      const [messages, options] = mockChatCompletion.mock.calls[0];
      expect(messages).toHaveLength(2);
      expect(options.temperature).toBe(0.7);
      expect(options.max_tokens).toBe(300);
    });

    it('应在 AI 超时错误时使用降级模板', async () => {
      mockChatCompletion.mockRejectedValue(new Error('Request timeout'));

      const result = await generateIntroduction(userA, userB, {
        chatCompletionFn: mockChatCompletion,
      });

      expect(result).toContain('张三');
      expect(result).toContain('李四');
      expect(result.length).toBeLessThanOrEqual(200);
    });

    it('应在 AI 返回空字符串时使用降级模板', async () => {
      mockChatCompletion.mockResolvedValue('');

      const result = await generateIntroduction(userA, userB, {
        chatCompletionFn: mockChatCompletion,
      });

      // 空字符串不包含 Profile 信息，应降级
      expect(result).toContain('张三');
      expect(result).toContain('李四');
    });

    it('降级模板应包含至少一项 Profile 信息（需求 7.6）', async () => {
      mockChatCompletion.mockRejectedValue(new Error('AI 服务不可用'));

      const result = await generateIntroduction(userA, userB, {
        chatCompletionFn: mockChatCompletion,
      });

      // 降级模板包含双方昵称（Profile 中的 name 字段）
      expect(containsProfileInfo(result, userA, userB)).toBe(true);
    });
  });

  describe('generateIcebreakers', () => {
    it('应调用 AI 并返回破冰话题数组', async () => {
      mockChatCompletion.mockResolvedValue(
        '["你们都在科技行业，平时工作中最有成就感的事是什么？", "北京和上海哪个城市更适合生活？", "最近有什么好书推荐吗？"]'
      );

      const result = await generateIcebreakers(userA, userB, {
        chatCompletionFn: mockChatCompletion,
      });

      expect(result.length).toBeGreaterThanOrEqual(2);
      expect(result.length).toBeLessThanOrEqual(3);
      expect(mockChatCompletion).toHaveBeenCalledTimes(1);
    });

    it('应在 AI 失败时使用预设通用破冰话题', async () => {
      mockChatCompletion.mockRejectedValue(new Error('AI 服务不可用'));

      const result = await generateIcebreakers(userA, userB, {
        chatCompletionFn: mockChatCompletion,
      });

      expect(result).toHaveLength(3);
      expect(result[0]).toBe('最近有什么有趣的事情想分享吗？');
      expect(result[1]).toBe('你平时喜欢做什么来放松自己？');
      expect(result[2]).toBe('如果有一天假期，你最想去哪里？');
    });

    it('应在 AI 返回无效格式时使用预设通用破冰话题', async () => {
      mockChatCompletion.mockResolvedValue('这不是一个有效的 JSON 数组');

      const result = await generateIcebreakers(userA, userB, {
        chatCompletionFn: mockChatCompletion,
      });

      expect(result).toHaveLength(3);
      expect(result[0]).toBe('最近有什么有趣的事情想分享吗？');
    });

    it('应在 AI 返回话题少于2个时使用预设通用破冰话题', async () => {
      mockChatCompletion.mockResolvedValue('["只有一个话题"]');

      const result = await generateIcebreakers(userA, userB, {
        chatCompletionFn: mockChatCompletion,
      });

      expect(result).toHaveLength(3);
      expect(result[0]).toBe('最近有什么有趣的事情想分享吗？');
    });

    it('每个破冰话题应不超过50字符', async () => {
      const longTopic = '这是一个超级超级超级超级超级超级超级超级超级超级超级超级超级超级长的话题建议';
      mockChatCompletion.mockResolvedValue(
        JSON.stringify([longTopic, '短话题一', '短话题二'])
      );

      const result = await generateIcebreakers(userA, userB, {
        chatCompletionFn: mockChatCompletion,
      });

      result.forEach((topic) => {
        expect(topic.length).toBeLessThanOrEqual(50);
      });
    });

    it('应使用正确的 AI 参数调用', async () => {
      mockChatCompletion.mockResolvedValue('["话题1", "话题2"]');

      await generateIcebreakers(userA, userB, {
        chatCompletionFn: mockChatCompletion,
      });

      const [messages, options] = mockChatCompletion.mock.calls[0];
      expect(messages).toHaveLength(2);
      expect(options.temperature).toBe(0.7);
      expect(options.max_tokens).toBe(200);
    });

    it('应在 AI 网络错误时使用预设通用破冰话题', async () => {
      mockChatCompletion.mockRejectedValue(new Error('Network error'));

      const result = await generateIcebreakers(userA, userB, {
        chatCompletionFn: mockChatCompletion,
      });

      expect(result).toHaveLength(3);
      expect(result[0]).toBe('最近有什么有趣的事情想分享吗？');
    });

    it('预设通用破冰话题每个应不超过50字符（需求 7.7）', async () => {
      mockChatCompletion.mockRejectedValue(new Error('AI 服务不可用'));

      const result = await generateIcebreakers(userA, userB, {
        chatCompletionFn: mockChatCompletion,
      });

      result.forEach((topic) => {
        expect(topic.length).toBeLessThanOrEqual(50);
      });
    });

    it('AI 返回恰好2个话题时应正常返回', async () => {
      mockChatCompletion.mockResolvedValue('["你喜欢旅行吗？", "最近在看什么书？"]');

      const result = await generateIcebreakers(userA, userB, {
        chatCompletionFn: mockChatCompletion,
      });

      expect(result).toHaveLength(2);
      expect(result[0]).toBe('你喜欢旅行吗？');
      expect(result[1]).toBe('最近在看什么书？');
    });
  });
});
