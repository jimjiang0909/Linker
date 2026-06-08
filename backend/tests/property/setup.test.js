/**
 * 属性测试框架验证 - 确保 fast-check 生成器和测试辅助工具正常工作
 */
import { describe, it, expect } from '@jest/globals';
import fc from 'fast-check';
import {
  validEmailArb,
  invalidEmailArb,
  uuidArb,
  verificationCodeArb,
  invitationCodeArb,
  validProfileArb,
  validPreferenceArb,
  validMessageContentArb,
} from '../helpers/index.js';

describe('测试数据生成器验证', () => {
  it('validEmailArb 生成包含@和域名的邮箱', () => {
    fc.assert(
      fc.property(validEmailArb, (email) => {
        expect(email).toContain('@');
        expect(email.split('@')[1]).toContain('.');
      }),
      { numRuns: 100 }
    );
  });

  it('uuidArb 生成有效 UUID 格式', () => {
    fc.assert(
      fc.property(uuidArb, (uuid) => {
        expect(uuid).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        );
      }),
      { numRuns: 100 }
    );
  });

  it('verificationCodeArb 生成6位数字验证码', () => {
    fc.assert(
      fc.property(verificationCodeArb, (code) => {
        expect(code).toMatch(/^\d{6}$/);
      }),
      { numRuns: 100 }
    );
  });

  it('invitationCodeArb 生成8位字母数字邀请码', () => {
    fc.assert(
      fc.property(invitationCodeArb, (code) => {
        expect(code).toMatch(/^[A-Za-z0-9]{8}$/);
        expect(code).toHaveLength(8);
      }),
      { numRuns: 100 }
    );
  });

  it('validProfileArb 生成有效 Profile 数据', () => {
    fc.assert(
      fc.property(validProfileArb, (profile) => {
        expect(profile.name.length).toBeGreaterThanOrEqual(1);
        expect(profile.name.length).toBeLessThanOrEqual(20);
        expect(['男', '女', '其他']).toContain(profile.gender);
        expect(profile.birthYear).toBeGreaterThanOrEqual(new Date().getFullYear() - 60);
        expect(profile.birthYear).toBeLessThanOrEqual(new Date().getFullYear() - 18);
      }),
      { numRuns: 100 }
    );
  });

  it('validPreferenceArb 生成有效 Preference 数据', () => {
    fc.assert(
      fc.property(validPreferenceArb, (pref) => {
        expect(pref.ageMin).toBeGreaterThanOrEqual(18);
        expect(pref.ageMax).toBeLessThanOrEqual(60);
        expect(pref.ageMin).toBeLessThanOrEqual(pref.ageMax);
        expect(['认真约会', '轻社交', '交朋友']).toContain(pref.datingIntent);
        expect(pref.occupationTypes.length).toBeLessThanOrEqual(5);
        expect(pref.personalityTraits.length).toBeLessThanOrEqual(5);
      }),
      { numRuns: 100 }
    );
  });

  it('validMessageContentArb 生成非空且≤1000字符的消息', () => {
    fc.assert(
      fc.property(validMessageContentArb, (content) => {
        expect(content.length).toBeGreaterThanOrEqual(1);
        expect(content.length).toBeLessThanOrEqual(1000);
        expect(content.trim().length).toBeGreaterThanOrEqual(1);
      }),
      { numRuns: 100 }
    );
  });
});
