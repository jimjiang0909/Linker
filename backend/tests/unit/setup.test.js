/**
 * 测试框架配置验证 - 冒烟测试
 * 确保 Jest 和 fast-check 正确配置并可运行
 */
import { describe, it, expect } from '@jest/globals';
import fc from 'fast-check';

describe('测试框架配置验证', () => {
  it('Jest 基本断言可用', () => {
    expect(1 + 1).toBe(2);
    expect('hello').toContain('ell');
    expect([1, 2, 3]).toHaveLength(3);
  });

  it('Jest async 测试可用', async () => {
    const result = await Promise.resolve(42);
    expect(result).toBe(42);
  });

  it('fast-check 属性测试可用', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (a, b) => {
        // 加法交换律
        expect(a + b).toBe(b + a);
      }),
      { numRuns: 100 }
    );
  });

  it('fast-check 字符串属性测试可用', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        // 字符串长度非负
        expect(s.length).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: 100 }
    );
  });
});
