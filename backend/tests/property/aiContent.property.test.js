/**
 * AI 内容生成模块属性测试
 * 使用 fast-check 验证 AI 生成内容格式约束的正确性属性
 *
 * **Validates: Requirements 7.1, 7.2, 7.5**
 */
import { describe, it, expect } from '@jest/globals';
import fc from 'fast-check';
import {
  parseIcebreakersResponse,
  containsProfileInfo,
} from '../../src/services/aiContentService.js';
import { validProfileArb } from '../helpers/index.js';

// ============================================================
// 辅助生成器
// ============================================================

/**
 * 生成有效的破冰话题 JSON 响应（2-3个话题，每个≤50字符）
 */
const validIcebreakersResponseArb = fc
  .tuple(
    fc.integer({ min: 2, max: 3 }),
    fc.array(
      fc.stringOf(
        fc.constantFrom(...'你好吗最近怎么样喜欢什么运动平时做什么工作有趣的事情分享周末去哪里玩'.split('')),
        { minLength: 1, maxLength: 50 }
      ),
      { minLength: 3, maxLength: 5 }
    )
  )
  .map(([count, topics]) => {
    const validTopics = topics.slice(0, count);
    return JSON.stringify(validTopics);
  });

/**
 * 生成带有 markdown 代码块包裹的破冰话题 JSON 响应
 */
const markdownWrappedIcebreakersArb = validIcebreakersResponseArb.map(
  (json) => `\`\`\`json\n${json}\n\`\`\``
);

/**
 * 生成无效的破冰话题响应（非 JSON、非数组、话题不足等）
 */
const invalidIcebreakersResponseArb = fc.oneof(
  // 非 JSON 字符串
  fc.stringOf(fc.constantFrom(...'这不是有效的JSON格式内容随机文本'.split('')), {
    minLength: 5,
    maxLength: 50,
  }),
  // JSON 对象而非数组
  fc.constant('{"topics": ["话题1", "话题2"]}'),
  // 空数组
  fc.constant('[]'),
  // 只有一个话题（少于2个）
  fc.stringOf(
    fc.constantFrom(...'话题内容测试数据生成'.split('')),
    { minLength: 1, maxLength: 30 }
  ).map((t) => JSON.stringify([t])),
  // 数组中全是空字符串
  fc.constant('["", "", ""]'),
  // 数组中全是空白字符串
  fc.constant('["   ", "  "]')
);

/**
 * 生成包含超长话题的响应（部分话题>50字符）
 */
const longTopicIcebreakersArb = fc
  .tuple(
    fc.stringOf(
      fc.constantFrom(...'这是一个非常长的话题内容需要被截断处理确保不超过五十个字符的限制'.split('')),
      { minLength: 51, maxLength: 80 }
    ),
    fc.stringOf(
      fc.constantFrom(...'短话题内容正常长度'.split('')),
      { minLength: 1, maxLength: 30 }
    )
  )
  .map(([longTopic, shortTopic]) => JSON.stringify([longTopic, shortTopic, '普通话题']));

/**
 * 生成包含 Profile 信息的介绍语
 */
const introWithProfileInfoArb = fc.tuple(validProfileArb, validProfileArb).map(
  ([profileA, profileB]) => {
    const fields = [profileA.name, profileA.occupation, profileA.city, profileB.name, profileB.occupation, profileB.city].filter(Boolean);
    const field = fields[0];
    return {
      introduction: `你好！${field}是一位很有趣的人，快来聊聊吧`,
      userA: { profile: profileA },
      userB: { profile: profileB },
    };
  }
);

/**
 * 生成不包含任何 Profile 信息的介绍语
 */
const introWithoutProfileInfoArb = fc.tuple(validProfileArb, validProfileArb).map(
  ([profileA, profileB]) => ({
    introduction: '你们已经成功匹配了，开始愉快的交流吧！祝你们聊天愉快！',
    userA: { profile: profileA },
    userB: { profile: profileB },
  })
);

// ============================================================
// 属性 12: AI生成内容的格式约束
// ============================================================

describe('Feature: linker-mvp, Property 12: AI生成内容的格式约束', () => {
  /**
   * **Validates: Requirements 7.1, 7.2, 7.5**
   *
   * 对于任意生成的介绍语和破冰话题：
   * - 介绍语长度应≤200字符且包含至少一项来自双方 Profile 的具体信息
   * - 破冰话题数量应为2-3个且每个长度≤50字符
   */

  describe('parseIcebreakersResponse - 破冰话题格式约束', () => {
    it('有效 JSON 数组响应（2-3个话题）应返回2-3个话题且每个≤50字符', () => {
      fc.assert(
        fc.property(validIcebreakersResponseArb, (response) => {
          const result = parseIcebreakersResponse(response);

          // 应成功解析
          expect(result).not.toBeNull();

          // 数量应为2-3个
          expect(result.length).toBeGreaterThanOrEqual(2);
          expect(result.length).toBeLessThanOrEqual(3);

          // 每个话题应≤50字符
          result.forEach((topic) => {
            expect(topic.length).toBeLessThanOrEqual(50);
            expect(topic.length).toBeGreaterThan(0);
          });
        }),
        { numRuns: 100 }
      );
    });

    it('带 markdown 代码块包裹的有效响应应正确解析', () => {
      fc.assert(
        fc.property(markdownWrappedIcebreakersArb, (response) => {
          const result = parseIcebreakersResponse(response);

          // 应成功解析
          expect(result).not.toBeNull();

          // 数量应为2-3个
          expect(result.length).toBeGreaterThanOrEqual(2);
          expect(result.length).toBeLessThanOrEqual(3);

          // 每个话题应≤50字符
          result.forEach((topic) => {
            expect(topic.length).toBeLessThanOrEqual(50);
          });
        }),
        { numRuns: 100 }
      );
    });

    it('无效响应应返回 null', () => {
      fc.assert(
        fc.property(invalidIcebreakersResponseArb, (response) => {
          const result = parseIcebreakersResponse(response);

          // 无效响应应返回 null
          expect(result).toBeNull();
        }),
        { numRuns: 100 }
      );
    });

    it('包含超长话题的响应应被截断至≤50字符', () => {
      fc.assert(
        fc.property(longTopicIcebreakersArb, (response) => {
          const result = parseIcebreakersResponse(response);

          // 应成功解析（因为有至少2个有效话题）
          expect(result).not.toBeNull();

          // 每个话题应≤50字符（超长的被截断）
          result.forEach((topic) => {
            expect(topic.length).toBeLessThanOrEqual(50);
          });
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('containsProfileInfo - 介绍语包含 Profile 信息验证', () => {
    it('包含至少一项 Profile 信息的介绍语应返回 true', () => {
      fc.assert(
        fc.property(introWithProfileInfoArb, ({ introduction, userA, userB }) => {
          const result = containsProfileInfo(introduction, userA, userB);
          expect(result).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('不包含任何 Profile 信息的介绍语应返回 false', () => {
      fc.assert(
        fc.property(introWithoutProfileInfoArb, ({ introduction, userA, userB }) => {
          const result = containsProfileInfo(introduction, userA, userB);
          expect(result).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it('Profile 字段出现在介绍语中的任意位置都应被检测到', () => {
      fc.assert(
        fc.property(
          validProfileArb,
          validProfileArb,
          fc.constantFrom('name', 'occupation', 'city'),
          fc.constantFrom('A', 'B'),
          (profileA, profileB, field, side) => {
            const userA = { profile: profileA };
            const userB = { profile: profileB };
            const targetProfile = side === 'A' ? profileA : profileB;
            const fieldValue = targetProfile[field];

            if (fieldValue) {
              const introduction = `前缀文本${fieldValue}后缀文本`;
              const result = containsProfileInfo(introduction, userA, userB);
              expect(result).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
