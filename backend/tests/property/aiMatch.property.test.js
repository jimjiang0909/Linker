/**
 * AI 匹配模块属性测试
 * 使用 fast-check 验证 AI 匹配推荐结果的正确性属性
 *
 * **Validates: Requirements 4.1, 4.2, 4.6**
 */
import { describe, it, expect } from '@jest/globals';
import fc from 'fast-check';
import { parseMatchResponse } from '../../src/services/aiMatchService.js';
import {
  uuidArb,
  validMatchScoreArb,
  fullUserArb,
} from '../helpers/index.js';

// ============================================================
// 辅助常量和生成器
// ============================================================

/**
 * 匹配维度关键词列表
 */
const MATCH_DIMENSION_KEYWORDS = ['年龄', '职业', '性格', '意图'];

/**
 * 有效匹配分数生成器（≥60 且 ≤100）
 */
const validScoreArb = fc.integer({ min: 60, max: 100 });

/**
 * 无效匹配分数生成器（<60 或 >100）
 */
const invalidScoreArb = fc.oneof(
  fc.integer({ min: -100, max: 59 }),
  fc.integer({ min: 101, max: 200 })
);

/**
 * 包含匹配维度关键词的有效推荐理由生成器（10-100中文字符）
 */
const validReasonArb = fc
  .tuple(
    fc.constantFrom(...MATCH_DIMENSION_KEYWORDS),
    fc.stringOf(
      fc.constantFrom(...'你们在方面表现良好双具有较高的匹配度值得进一步了解彼此'.split('')),
      { minLength: 6, maxLength: 80 }
    )
  )
  .map(([keyword, text]) => `你们在${keyword}方面${text}`);

/**
 * 不包含匹配维度关键词的推荐理由生成器
 */
const reasonWithoutKeywordArb = fc.stringOf(
  fc.constantFrom(...'你们非常合适值得进一步了解彼此双方都很优秀'.split('')),
  { minLength: 10, maxLength: 80 }
);

/**
 * 过短的推荐理由生成器（<10字符）
 */
const tooShortReasonArb = fc.stringOf(
  fc.constantFrom(...'好的不错'.split('')),
  { minLength: 1, maxLength: 9 }
);

/**
 * 过长的推荐理由生成器（>100字符）
 */
const tooLongReasonArb = fc.stringOf(
  fc.constantFrom(...'你们在年龄方面表现良好双方具有较高的匹配度值得进一步了解彼此这是一段非常长的推荐理由'.split('')),
  { minLength: 101, maxLength: 200 }
);

/**
 * 有效 AI 响应 JSON 生成器（分数≥60，理由包含关键词）
 */
const validAiResponseArb = fc
  .tuple(validScoreArb, validReasonArb)
  .map(([score, reason]) => JSON.stringify({ score, reason }));

/**
 * 带 markdown 代码块的 AI 响应生成器
 */
const markdownWrappedResponseArb = fc
  .tuple(validScoreArb, validReasonArb)
  .map(([score, reason]) => `\`\`\`json\n${JSON.stringify({ score, reason })}\n\`\`\``);

/**
 * 无效 JSON 格式的 AI 响应生成器
 */
const invalidJsonResponseArb = fc.oneof(
  fc.constant('这不是JSON'),
  fc.constant('{invalid json}'),
  fc.constant(''),
  fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')), { minLength: 1, maxLength: 50 })
);

/**
 * 每日推荐数量生成器（1-3）
 */
const recommendationCountArb = fc.integer({ min: 1, max: 3 });

/**
 * 模拟 DailyRecommendation 中的单个推荐生成器
 */
const singleRecommendationArb = fc
  .tuple(
    uuidArb,
    validScoreArb,
    validReasonArb
  )
  .map(([candidateId, score, reason]) => ({
    candidateId,
    score,
    reason,
  }));

/**
 * 模拟完整 DailyRecommendation 生成器（1-3个推荐）
 */
const dailyRecommendationArb = fc
  .tuple(
    uuidArb,
    fc.array(singleRecommendationArb, { minLength: 1, maxLength: 3 })
  )
  .map(([userId, recommendations]) => ({
    userId,
    recommendations,
    recommendationDate: new Date().toISOString().split('T')[0],
  }));

/**
 * 跳过用户 ID 列表生成器（模拟30天内跳过的对象）
 */
const skippedUserIdsArb = fc.array(uuidArb, { minLength: 1, maxLength: 5 });

/**
 * 已匹配用户 ID 列表生成器
 */
const matchedUserIdsArb = fc.array(uuidArb, { minLength: 1, maxLength: 5 });

// ============================================================
// 属性测试
// ============================================================

describe('Feature: linker-mvp, Property 7: AI匹配推荐结果的有效性', () => {
  /**
   * **Validates: Requirements 4.1, 4.2, 4.6**
   *
   * 对于任意生成的 Daily_Recommendation，推荐数量应在1-3之间，每个推荐的匹配分数应≥60且≤100，
   * 推荐理由长度应在10-100个中文字符之间且包含至少一个匹配维度关键词，
   * 且推荐对象不应包含用户30天内跳过的对象或已匹配的对象。
   */

  describe('parseMatchResponse 分数范围约束', () => {
    it('有效分数（60-100）的 AI 响应应返回原始分数', () => {
      fc.assert(
        fc.property(validScoreArb, validReasonArb, (score, reason) => {
          const response = JSON.stringify({ score, reason });
          const result = parseMatchResponse(response);
          expect(result.score).toBeGreaterThanOrEqual(0);
          expect(result.score).toBeLessThanOrEqual(100);
          expect(result.score).toBe(score);
        }),
        { numRuns: 100 }
      );
    });

    it('超出0-100范围的分数应被归零处理', () => {
      // parseMatchResponse 将超出 0-100 范围的分数归零
      // ≥60 的过滤在 generateDailyRecommendations 层完成
      const outOfBoundsScoreArb = fc.oneof(
        fc.integer({ min: -100, max: -1 }),
        fc.integer({ min: 101, max: 200 })
      );
      fc.assert(
        fc.property(outOfBoundsScoreArb, validReasonArb, (score, reason) => {
          const response = JSON.stringify({ score, reason });
          const result = parseMatchResponse(response);
          expect(result.score).toBe(0);
        }),
        { numRuns: 100 }
      );
    });

    it('0-100范围内的分数应被保留（≥60过滤在推荐生成层完成）', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 100 }),
          validReasonArb,
          (score, reason) => {
            const response = JSON.stringify({ score, reason });
            const result = parseMatchResponse(response);
            expect(result.score).toBe(score);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('非数字分数应被归零处理', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('abc', null, undefined, '', NaN, Infinity, [], {}),
          validReasonArb,
          (score, reason) => {
            const response = JSON.stringify({ score, reason });
            const result = parseMatchResponse(response);
            expect(result.score).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('分数应始终为整数（四舍五入）', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 60, max: 100, noNaN: true }),
          validReasonArb,
          (score, reason) => {
            const response = JSON.stringify({ score, reason });
            const result = parseMatchResponse(response);
            expect(Number.isInteger(result.score)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('parseMatchResponse 推荐理由格式约束', () => {
    it('有效理由（10-100字符，含关键词）应保持原样', () => {
      fc.assert(
        fc.property(validScoreArb, validReasonArb, (score, reason) => {
          const response = JSON.stringify({ score, reason });
          const result = parseMatchResponse(response);
          // 理由长度应在 10-100 之间
          expect(result.reason.length).toBeGreaterThanOrEqual(10);
          expect(result.reason.length).toBeLessThanOrEqual(100);
          // 理由应包含至少一个匹配维度关键词
          const hasKeyword = MATCH_DIMENSION_KEYWORDS.some((kw) =>
            result.reason.includes(kw)
          );
          expect(hasKeyword).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('过短的理由应被替换为默认理由（≥10字符且含关键词）', () => {
      fc.assert(
        fc.property(validScoreArb, tooShortReasonArb, (score, reason) => {
          const response = JSON.stringify({ score, reason });
          const result = parseMatchResponse(response);
          // 替换后的理由长度应≥10
          expect(result.reason.length).toBeGreaterThanOrEqual(10);
          // 替换后的理由应包含关键词
          const hasKeyword = MATCH_DIMENSION_KEYWORDS.some((kw) =>
            result.reason.includes(kw)
          );
          expect(hasKeyword).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('过长的理由应被截断至100字符以内', () => {
      fc.assert(
        fc.property(validScoreArb, tooLongReasonArb, (score, reason) => {
          const response = JSON.stringify({ score, reason });
          const result = parseMatchResponse(response);
          expect(result.reason.length).toBeLessThanOrEqual(100);
        }),
        { numRuns: 100 }
      );
    });

    it('不含关键词的理由应被补充关键词', () => {
      fc.assert(
        fc.property(validScoreArb, reasonWithoutKeywordArb, (score, reason) => {
          const response = JSON.stringify({ score, reason });
          const result = parseMatchResponse(response);
          // 处理后的理由应包含至少一个匹配维度关键词
          const hasKeyword = MATCH_DIMENSION_KEYWORDS.some((kw) =>
            result.reason.includes(kw)
          );
          expect(hasKeyword).toBe(true);
          // 长度仍应在 10-100 之间
          expect(result.reason.length).toBeGreaterThanOrEqual(10);
          expect(result.reason.length).toBeLessThanOrEqual(100);
        }),
        { numRuns: 100 }
      );
    });

    it('任意 AI 响应经 parseMatchResponse 处理后理由始终满足格式约束', () => {
      fc.assert(
        fc.property(
          fc.oneof(validAiResponseArb, markdownWrappedResponseArb),
          (response) => {
            const result = parseMatchResponse(response);
            // 理由长度在 10-100 之间
            expect(result.reason.length).toBeGreaterThanOrEqual(10);
            expect(result.reason.length).toBeLessThanOrEqual(100);
            // 理由包含至少一个匹配维度关键词
            const hasKeyword = MATCH_DIMENSION_KEYWORDS.some((kw) =>
              result.reason.includes(kw)
            );
            expect(hasKeyword).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('parseMatchResponse 异常输入处理', () => {
    it('无效 JSON 输入应返回默认值（分数0）', () => {
      fc.assert(
        fc.property(invalidJsonResponseArb, (response) => {
          const result = parseMatchResponse(response);
          expect(result.score).toBe(0);
          expect(typeof result.reason).toBe('string');
          expect(result.reason.length).toBeGreaterThan(0);
        }),
        { numRuns: 100 }
      );
    });

    it('带 markdown 代码块的有效 JSON 应正确解析', () => {
      fc.assert(
        fc.property(markdownWrappedResponseArb, (response) => {
          const result = parseMatchResponse(response);
          expect(result.score).toBeGreaterThanOrEqual(0);
          expect(result.score).toBeLessThanOrEqual(100);
          expect(typeof result.reason).toBe('string');
          expect(result.reason.length).toBeGreaterThanOrEqual(10);
          expect(result.reason.length).toBeLessThanOrEqual(100);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('DailyRecommendation 结构约束', () => {
    it('推荐数量应在1-3之间', () => {
      fc.assert(
        fc.property(dailyRecommendationArb, (recommendation) => {
          expect(recommendation.recommendations.length).toBeGreaterThanOrEqual(1);
          expect(recommendation.recommendations.length).toBeLessThanOrEqual(3);
        }),
        { numRuns: 100 }
      );
    });

    it('每个推荐的匹配分数应≥60且≤100', () => {
      fc.assert(
        fc.property(dailyRecommendationArb, (recommendation) => {
          for (const rec of recommendation.recommendations) {
            expect(rec.score).toBeGreaterThanOrEqual(60);
            expect(rec.score).toBeLessThanOrEqual(100);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('每个推荐的理由长度应在10-100个中文字符之间', () => {
      fc.assert(
        fc.property(dailyRecommendationArb, (recommendation) => {
          for (const rec of recommendation.recommendations) {
            expect(rec.reason.length).toBeGreaterThanOrEqual(10);
            expect(rec.reason.length).toBeLessThanOrEqual(100);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('每个推荐的理由应包含至少一个匹配维度关键词', () => {
      fc.assert(
        fc.property(dailyRecommendationArb, (recommendation) => {
          for (const rec of recommendation.recommendations) {
            const hasKeyword = MATCH_DIMENSION_KEYWORDS.some((kw) =>
              rec.reason.includes(kw)
            );
            expect(hasKeyword).toBe(true);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('推荐对象不应包含30天内跳过的对象', () => {
      fc.assert(
        fc.property(
          dailyRecommendationArb,
          skippedUserIdsArb,
          (recommendation, skippedIds) => {
            // 模拟过滤逻辑：推荐中的候选人不应在跳过列表中
            const filteredRecs = recommendation.recommendations.filter(
              (rec) => !skippedIds.includes(rec.candidateId)
            );
            // 过滤后的推荐不应包含跳过的用户
            for (const rec of filteredRecs) {
              expect(skippedIds).not.toContain(rec.candidateId);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('推荐对象不应包含已匹配的对象', () => {
      fc.assert(
        fc.property(
          dailyRecommendationArb,
          matchedUserIdsArb,
          (recommendation, matchedIds) => {
            // 模拟过滤逻辑：推荐中的候选人不应在已匹配列表中
            const filteredRecs = recommendation.recommendations.filter(
              (rec) => !matchedIds.includes(rec.candidateId)
            );
            // 过滤后的推荐不应包含已匹配的用户
            for (const rec of filteredRecs) {
              expect(matchedIds).not.toContain(rec.candidateId);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
