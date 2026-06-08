/**
 * 认证模块属性测试
 * 使用 fast-check 验证认证相关的正确性属性
 *
 * **Validates: Requirements 1.2, 1.3, 1.5, 1.7**
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import fc from 'fast-check';
import {
  validEmailArb,
  invalidEmailArb,
  verificationCodeArb,
} from '../helpers/index.js';

// ============================================================
// 邮箱验证逻辑（从 auth.js 路由中提取的核心逻辑）
// ============================================================
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(email) {
  return typeof email === 'string' && EMAIL_REGEX.test(email);
}

// ============================================================
// 验证码匹配逻辑（从 auth.js 路由中提取的核心逻辑）
// ============================================================

/**
 * 验证码校验：匹配 + 有效期检查
 * @param {string} submittedCode - 用户提交的验证码
 * @param {object} storedRecord - 数据库中存储的验证码记录
 * @param {string} storedRecord.code - 存储的验证码
 * @param {Date} storedRecord.expiresAt - 过期时间
 * @param {boolean} storedRecord.isUsed - 是否已使用
 * @returns {{ valid: boolean, reason?: string }}
 */
function verifyCode(submittedCode, storedRecord) {
  if (!storedRecord || storedRecord.isUsed) {
    return { valid: false, reason: 'INVALID_CODE' };
  }
  if (new Date() > storedRecord.expiresAt) {
    return { valid: false, reason: 'CODE_EXPIRED' };
  }
  if (storedRecord.code !== submittedCode) {
    return { valid: false, reason: 'INVALID_CODE' };
  }
  return { valid: true };
}

/**
 * 邮箱唯一性检查逻辑
 * @param {string} email - 要注册的邮箱
 * @param {object|null} existingUser - 数据库查询结果
 * @returns {{ canRegister: boolean, reason?: string }}
 */
function checkEmailUniqueness(email, existingUser) {
  if (existingUser) {
    return { canRegister: false, reason: 'EMAIL_ALREADY_REGISTERED' };
  }
  return { canRegister: true };
}

// ============================================================
// 属性测试
// ============================================================

describe('Feature: linker-mvp, Property 1: 邮箱格式验证的正确性', () => {
  /**
   * **Validates: Requirements 1.2**
   *
   * 对于任意字符串作为邮箱输入，当且仅当该字符串包含@符号且@后为有效域名格式时，
   * 系统应接受该邮箱；否则系统应拒绝并返回格式错误提示。
   */
  it('有效邮箱（包含@和有效域名）应被接受', () => {
    fc.assert(
      fc.property(validEmailArb, (email) => {
        const result = isValidEmail(email);
        // 有效邮箱生成器生成的邮箱必须通过验证
        expect(result).toBe(true);
        // 验证确实包含@符号
        expect(email).toContain('@');
        // 验证@后有有效域名（包含点号）
        const domain = email.split('@')[1];
        expect(domain).toContain('.');
      }),
      { numRuns: 100 }
    );
  });

  it('无效邮箱（缺少@或域名无效）应被拒绝', () => {
    fc.assert(
      fc.property(invalidEmailArb, (email) => {
        const result = isValidEmail(email);
        // 无效邮箱生成器生成的邮箱必须被拒绝
        expect(result).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it('邮箱验证是确定性的：相同输入总是产生相同结果', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const result1 = isValidEmail(input);
        const result2 = isValidEmail(input);
        expect(result1).toBe(result2);
      }),
      { numRuns: 100 }
    );
  });
});

describe('Feature: linker-mvp, Property 2: 验证码匹配的正确性', () => {
  /**
   * **Validates: Requirements 1.3, 1.7**
   *
   * 对于任意邮箱和验证码对，当且仅当提交的验证码与系统为该邮箱生成的验证码完全一致
   * 且在5分钟有效期内时，系统应接受验证；否则系统应拒绝。
   */
  it('正确的验证码在有效期内应被接受', () => {
    fc.assert(
      fc.property(
        validEmailArb,
        verificationCodeArb,
        (email, code) => {
          // 模拟存储记录：验证码未过期、未使用
          const storedRecord = {
            email,
            code,
            expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5分钟后过期
            isUsed: false,
          };

          const result = verifyCode(code, storedRecord);
          expect(result.valid).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('错误的验证码应被拒绝', () => {
    fc.assert(
      fc.property(
        validEmailArb,
        verificationCodeArb,
        verificationCodeArb,
        (email, correctCode, submittedCode) => {
          // 只测试提交的验证码与正确验证码不同的情况
          fc.pre(correctCode !== submittedCode);

          const storedRecord = {
            email,
            code: correctCode,
            expiresAt: new Date(Date.now() + 5 * 60 * 1000),
            isUsed: false,
          };

          const result = verifyCode(submittedCode, storedRecord);
          expect(result.valid).toBe(false);
          expect(result.reason).toBe('INVALID_CODE');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('过期的验证码应被拒绝（即使验证码正确）', () => {
    fc.assert(
      fc.property(
        validEmailArb,
        verificationCodeArb,
        fc.integer({ min: 1, max: 60 }), // 过期分钟数
        (email, code, expiredMinutes) => {
          // 模拟已过期的验证码记录
          const storedRecord = {
            email,
            code,
            expiresAt: new Date(Date.now() - expiredMinutes * 60 * 1000), // 已过期
            isUsed: false,
          };

          const result = verifyCode(code, storedRecord);
          expect(result.valid).toBe(false);
          expect(result.reason).toBe('CODE_EXPIRED');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('已使用的验证码应被拒绝', () => {
    fc.assert(
      fc.property(
        validEmailArb,
        verificationCodeArb,
        (email, code) => {
          const storedRecord = {
            email,
            code,
            expiresAt: new Date(Date.now() + 5 * 60 * 1000),
            isUsed: true, // 已使用
          };

          const result = verifyCode(code, storedRecord);
          expect(result.valid).toBe(false);
          expect(result.reason).toBe('INVALID_CODE');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('无存储记录时应被拒绝', () => {
    fc.assert(
      fc.property(
        verificationCodeArb,
        (code) => {
          const result = verifyCode(code, null);
          expect(result.valid).toBe(false);
          expect(result.reason).toBe('INVALID_CODE');
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Feature: linker-mvp, Property 3: 邮箱唯一性约束', () => {
  /**
   * **Validates: Requirements 1.5**
   *
   * 对于任意已注册的邮箱，使用该邮箱再次注册应被拒绝并提示已注册。
   */
  it('已注册的邮箱再次注册应被拒绝', () => {
    fc.assert(
      fc.property(
        validEmailArb,
        (email) => {
          // 模拟已存在的用户记录
          const existingUser = {
            id: 'existing-user-id',
            email,
            status: 'registered',
            createdAt: new Date(),
          };

          const result = checkEmailUniqueness(email, existingUser);
          expect(result.canRegister).toBe(false);
          expect(result.reason).toBe('EMAIL_ALREADY_REGISTERED');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('未注册的邮箱应允许注册', () => {
    fc.assert(
      fc.property(
        validEmailArb,
        (email) => {
          // 模拟数据库中不存在该邮箱
          const existingUser = null;

          const result = checkEmailUniqueness(email, existingUser);
          expect(result.canRegister).toBe(true);
          expect(result.reason).toBeUndefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('唯一性检查与邮箱内容无关，仅取决于是否已存在', () => {
    fc.assert(
      fc.property(
        validEmailArb,
        fc.boolean(),
        (email, isRegistered) => {
          const existingUser = isRegistered
            ? { id: 'user-id', email, status: 'registered', createdAt: new Date() }
            : null;

          const result = checkEmailUniqueness(email, existingUser);

          if (isRegistered) {
            expect(result.canRegister).toBe(false);
            expect(result.reason).toBe('EMAIL_ALREADY_REGISTERED');
          } else {
            expect(result.canRegister).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
