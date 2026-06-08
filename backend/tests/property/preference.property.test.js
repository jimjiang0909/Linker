/**
 * 偏好设置模块属性测试
 * 使用 fast-check 验证偏好设置相关的正确性属性
 *
 * **Validates: Requirements 3.1, 3.3, 3.4, 3.5, 3.6**
 */
import { describe, it, expect } from '@jest/globals';
import fc from 'fast-check';
import {
  validAgeRangeArb,
  invalidAgeRangeArb,
  datingIntentArb,
  occupationTypesArb,
  personalityTraitsArb,
  validPreferenceArb,
} from '../helpers/index.js';
import { validatePreference } from '../../src/services/preferenceService.js';

// ============================================================
// 辅助生成器
// ============================================================

/**
 * 无效交友意图生成器（不在合法选项中）
 */
const invalidDatingIntentArb = fc
  .stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')), {
    minLength: 1,
    maxLength: 10,
  })
  .filter(
    (s) =>
      !['认真约会', '轻社交', '交朋友', 'serious_dating', 'casual_social', 'make_friends'].includes(s)
  );

/**
 * 超过5项的职业类型生成器
 */
const tooManyOccupationTypesArb = fc.array(
  fc.constantFrom('技术', '金融', '教育', '医疗', '法律', '设计', '市场', '管理'),
  { minLength: 6, maxLength: 10 }
);

/**
 * 超过5项的性格特征生成器
 */
const tooManyPersonalityTraitsArb = fc.array(
  fc.constantFrom('外向', '内向', '理性', '感性', '幽默', '稳重', '冒险', '温柔'),
  { minLength: 6, maxLength: 10 }
);

/**
 * 年龄范围超出18-60边界的生成器
 */
const outOfBoundsAgeRangeArb = fc.oneof(
  // ageMin < 18
  fc.tuple(fc.integer({ min: 1, max: 17 }), fc.integer({ min: 18, max: 60 })).map(
    ([ageMin, ageMax]) => ({ ageMin, ageMax })
  ),
  // ageMax > 60
  fc.tuple(fc.integer({ min: 18, max: 60 }), fc.integer({ min: 61, max: 100 })).map(
    ([ageMin, ageMax]) => ({ ageMin, ageMax })
  )
);

/**
 * 年龄范围跨度不足1的生成器（ageMin == ageMax）
 */
const zeroSpanAgeRangeArb = fc.integer({ min: 18, max: 60 }).map((age) => ({
  ageMin: age,
  ageMax: age,
}));

// ============================================================
// 属性测试
// ============================================================

describe('Feature: linker-mvp, Property 6: 偏好设置验证的正确性', () => {
  /**
   * **Validates: Requirements 3.1, 3.3, 3.4, 3.5, 3.6**
   *
   * 对于任意 Preference 数据，当且仅当期望年龄范围在18-60之间且下限≤上限且跨度≥1、
   * 交友意图为三个合法选项之一（认真约会、轻社交、交朋友）、职业类型≤5项、性格特征≤5项时，
   * 系统应保存成功；否则应拒绝并返回具体错误信息。
   */

  it('完全有效的偏好设置数据应通过校验', () => {
    fc.assert(
      fc.property(validPreferenceArb, (preference) => {
        const errors = validatePreference(preference);
        expect(errors).toEqual([]);
      }),
      { numRuns: 100 }
    );
  });

  it('有效年龄范围（18-60，下限≤上限，跨度≥1）应通过校验', () => {
    fc.assert(
      fc.property(
        validAgeRangeArb,
        datingIntentArb,
        (ageRange, datingIntent) => {
          const preference = {
            ...ageRange,
            datingIntent,
            occupationTypes: [],
            personalityTraits: [],
          };
          const errors = validatePreference(preference);
          expect(errors).toEqual([]);
          // 验证年龄范围确实在合法区间内
          expect(ageRange.ageMin).toBeGreaterThanOrEqual(18);
          expect(ageRange.ageMax).toBeLessThanOrEqual(60);
          expect(ageRange.ageMin).toBeLessThanOrEqual(ageRange.ageMax);
          expect(ageRange.ageMax - ageRange.ageMin).toBeGreaterThanOrEqual(1);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('年龄范围下限大于上限应被拒绝', () => {
    fc.assert(
      fc.property(
        invalidAgeRangeArb,
        datingIntentArb,
        (ageRange, datingIntent) => {
          const preference = {
            ...ageRange,
            datingIntent,
            occupationTypes: [],
            personalityTraits: [],
          };
          const errors = validatePreference(preference);
          expect(errors.length).toBeGreaterThan(0);
          // 应包含年龄范围无效的错误信息
          const hasAgeError = errors.some(
            (e) => e.includes('年龄范围无效') || e.includes('下限不能大于上限')
          );
          expect(hasAgeError).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('年龄范围跨度不足1应被拒绝', () => {
    fc.assert(
      fc.property(
        zeroSpanAgeRangeArb,
        datingIntentArb,
        (ageRange, datingIntent) => {
          const preference = {
            ...ageRange,
            datingIntent,
            occupationTypes: [],
            personalityTraits: [],
          };
          const errors = validatePreference(preference);
          expect(errors.length).toBeGreaterThan(0);
          const hasSpanError = errors.some((e) => e.includes('跨度最小为1岁'));
          expect(hasSpanError).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('年龄范围超出18-60边界应被拒绝', () => {
    fc.assert(
      fc.property(
        outOfBoundsAgeRangeArb,
        datingIntentArb,
        (ageRange, datingIntent) => {
          const preference = {
            ...ageRange,
            datingIntent,
            occupationTypes: [],
            personalityTraits: [],
          };
          const errors = validatePreference(preference);
          expect(errors.length).toBeGreaterThan(0);
          const hasRangeError = errors.some(
            (e) => e.includes('18-60') || e.includes('必须在18')
          );
          expect(hasRangeError).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('交友意图为合法选项（认真约会、轻社交、交朋友）应通过校验', () => {
    fc.assert(
      fc.property(
        validAgeRangeArb,
        datingIntentArb,
        (ageRange, datingIntent) => {
          const preference = {
            ...ageRange,
            datingIntent,
            occupationTypes: [],
            personalityTraits: [],
          };
          const errors = validatePreference(preference);
          expect(errors).toEqual([]);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('交友意图为非法选项应被拒绝', () => {
    fc.assert(
      fc.property(
        validAgeRangeArb,
        invalidDatingIntentArb,
        (ageRange, datingIntent) => {
          const preference = {
            ...ageRange,
            datingIntent,
            occupationTypes: [],
            personalityTraits: [],
          };
          const errors = validatePreference(preference);
          expect(errors.length).toBeGreaterThan(0);
          const hasIntentError = errors.some((e) => e.includes('交友意图无效'));
          expect(hasIntentError).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('交友意图为空应被拒绝', () => {
    fc.assert(
      fc.property(
        validAgeRangeArb,
        fc.constantFrom(null, undefined, ''),
        (ageRange, datingIntent) => {
          const preference = {
            ...ageRange,
            datingIntent,
            occupationTypes: [],
            personalityTraits: [],
          };
          const errors = validatePreference(preference);
          expect(errors.length).toBeGreaterThan(0);
          const hasMissingError = errors.some((e) => e.includes('交友意图为必填项'));
          expect(hasMissingError).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('职业类型≤5项应通过校验', () => {
    fc.assert(
      fc.property(
        validAgeRangeArb,
        datingIntentArb,
        occupationTypesArb,
        (ageRange, datingIntent, occupationTypes) => {
          const preference = {
            ...ageRange,
            datingIntent,
            occupationTypes,
            personalityTraits: [],
          };
          const errors = validatePreference(preference);
          expect(errors).toEqual([]);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('职业类型超过5项应被拒绝', () => {
    fc.assert(
      fc.property(
        validAgeRangeArb,
        datingIntentArb,
        tooManyOccupationTypesArb,
        (ageRange, datingIntent, occupationTypes) => {
          const preference = {
            ...ageRange,
            datingIntent,
            occupationTypes,
            personalityTraits: [],
          };
          const errors = validatePreference(preference);
          expect(errors.length).toBeGreaterThan(0);
          const hasOccupationError = errors.some(
            (e) => e.includes('职业类型最多可选择5项')
          );
          expect(hasOccupationError).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('性格特征≤5项应通过校验', () => {
    fc.assert(
      fc.property(
        validAgeRangeArb,
        datingIntentArb,
        personalityTraitsArb,
        (ageRange, datingIntent, personalityTraits) => {
          const preference = {
            ...ageRange,
            datingIntent,
            occupationTypes: [],
            personalityTraits,
          };
          const errors = validatePreference(preference);
          expect(errors).toEqual([]);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('性格特征超过5项应被拒绝', () => {
    fc.assert(
      fc.property(
        validAgeRangeArb,
        datingIntentArb,
        tooManyPersonalityTraitsArb,
        (ageRange, datingIntent, personalityTraits) => {
          const preference = {
            ...ageRange,
            datingIntent,
            occupationTypes: [],
            personalityTraits,
          };
          const errors = validatePreference(preference);
          expect(errors.length).toBeGreaterThan(0);
          const hasTraitsError = errors.some(
            (e) => e.includes('性格特征最多可选择5项')
          );
          expect(hasTraitsError).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('年龄范围必填项为空应被拒绝', () => {
    fc.assert(
      fc.property(
        datingIntentArb,
        fc.constantFrom(
          { ageMin: null, ageMax: 30 },
          { ageMin: 20, ageMax: null },
          { ageMin: null, ageMax: null },
          { ageMin: '', ageMax: 30 },
          { ageMin: 20, ageMax: '' }
        ),
        (datingIntent, ageRange) => {
          const preference = {
            ...ageRange,
            datingIntent,
            occupationTypes: [],
            personalityTraits: [],
          };
          const errors = validatePreference(preference);
          expect(errors.length).toBeGreaterThan(0);
          const hasMissingError = errors.some(
            (e) => e.includes('必填项') || e.includes('年龄')
          );
          expect(hasMissingError).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});
