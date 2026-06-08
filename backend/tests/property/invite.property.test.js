/**
 * 邀请码模块属性测试
 * 验证邀请码生命周期和注册后邀请码生成的正确性属性
 *
 * **Validates: Requirements 8.1, 8.3, 8.4**
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import fc from 'fast-check';
import {
  invitationCodeArb,
  invalidInvitationCodeArb,
  uuidArb,
} from '../helpers/index.js';

// Mock Prisma
const mockPrisma = {
  invitationCode: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  user: {
    update: jest.fn(),
  },
  $transaction: jest.fn((fn) => fn(mockPrisma)),
};

jest.unstable_mockModule('../../src/lib/prisma.js', () => ({
  default: mockPrisma,
}));

const { validateInvitationCode, generateInvitationCodes, useInvitationCode } =
  await import('../../src/services/inviteService.js');

describe('Feature: linker-mvp, Property 13: 邀请码生命周期的正确性', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('格式为8位字母数字组合、未被使用、未过期的邀请码应被视为有效', async () => {
    await fc.assert(
      fc.asyncProperty(invitationCodeArb, uuidArb, async (code, ownerId) => {
        // 模拟数据库中存在该邀请码，未使用且未过期
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + 15); // 15天后过期

        mockPrisma.invitationCode.findUnique.mockResolvedValue({
          id: 'mock-id',
          code,
          ownerId,
          usedById: null,
          usedAt: null,
          expiresAt: futureDate,
          createdAt: new Date(),
        });

        const result = await validateInvitationCode(code);

        expect(result.valid).toBe(true);
        expect(result.invitationCode).toBeDefined();
        expect(result.invitationCode.code).toBe(code);
      }),
      { numRuns: 100 }
    );
  });

  it('格式不为8位字母数字组合的邀请码应被拒绝', async () => {
    await fc.assert(
      fc.asyncProperty(invalidInvitationCodeArb, async (code) => {
        const result = await validateInvitationCode(code);

        expect(result.valid).toBe(false);
        expect(result.reason).toBe('INVALID_FORMAT');
      }),
      { numRuns: 100 }
    );
  });

  it('已被使用的邀请码应被拒绝', async () => {
    await fc.assert(
      fc.asyncProperty(invitationCodeArb, uuidArb, uuidArb, async (code, ownerId, usedById) => {
        // 模拟数据库中该邀请码已被使用
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + 15);

        mockPrisma.invitationCode.findUnique.mockResolvedValue({
          id: 'mock-id',
          code,
          ownerId,
          usedById, // 已被使用
          usedAt: new Date(),
          expiresAt: futureDate,
          createdAt: new Date(),
        });

        const result = await validateInvitationCode(code);

        expect(result.valid).toBe(false);
        expect(result.reason).toBe('ALREADY_USED');
      }),
      { numRuns: 100 }
    );
  });

  it('超过30天有效期的邀请码应被拒绝', async () => {
    await fc.assert(
      fc.asyncProperty(invitationCodeArb, uuidArb, async (code, ownerId) => {
        // 模拟数据库中该邀请码已过期
        const pastDate = new Date();
        pastDate.setDate(pastDate.getDate() - 1); // 昨天已过期

        mockPrisma.invitationCode.findUnique.mockResolvedValue({
          id: 'mock-id',
          code,
          ownerId,
          usedById: null,
          usedAt: null,
          expiresAt: pastDate, // 已过期
          createdAt: new Date(pastDate.getTime() - 30 * 24 * 60 * 60 * 1000),
        });

        const result = await validateInvitationCode(code);

        expect(result.valid).toBe(false);
        expect(result.reason).toBe('EXPIRED');
      }),
      { numRuns: 100 }
    );
  });

  it('邀请码使用一次后应立即标记为已使用，后续使用应被拒绝', async () => {
    await fc.assert(
      fc.asyncProperty(invitationCodeArb, uuidArb, uuidArb, uuidArb, async (code, ownerId, firstUserId, secondUserId) => {
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + 15);

        // 第一次使用：邀请码有效
        mockPrisma.invitationCode.findUnique.mockResolvedValueOnce({
          id: 'mock-id',
          code,
          ownerId,
          usedById: null,
          usedAt: null,
          expiresAt: futureDate,
          createdAt: new Date(),
        });

        mockPrisma.invitationCode.update.mockResolvedValueOnce({
          id: 'mock-id',
          code,
          ownerId,
          usedById: firstUserId,
          usedAt: new Date(),
          expiresAt: futureDate,
        });

        mockPrisma.user.update.mockResolvedValueOnce({});

        // 使用邀请码
        const useResult = await useInvitationCode(code, firstUserId);
        expect(useResult.usedById).toBe(firstUserId);

        // 第二次使用：邀请码已被使用，应被拒绝
        mockPrisma.invitationCode.findUnique.mockResolvedValueOnce({
          id: 'mock-id',
          code,
          ownerId,
          usedById: firstUserId, // 已被第一个用户使用
          usedAt: new Date(),
          expiresAt: futureDate,
          createdAt: new Date(),
        });

        const secondValidation = await validateInvitationCode(code);
        expect(secondValidation.valid).toBe(false);
        expect(secondValidation.reason).toBe('ALREADY_USED');
      }),
      { numRuns: 100 }
    );
  });
});

describe('Feature: linker-mvp, Property 14: 注册后邀请码生成', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('成功注册的用户应生成恰好3个邀请码', async () => {
    await fc.assert(
      fc.asyncProperty(uuidArb, async (userId) => {
        let createCallCount = 0;

        // 模拟生成唯一邀请码（不存在重复）
        mockPrisma.invitationCode.findUnique.mockResolvedValue(null);

        // 模拟创建邀请码
        mockPrisma.invitationCode.create.mockImplementation(async ({ data }) => {
          createCallCount++;
          return {
            id: `code-${createCallCount}`,
            code: data.code,
            ownerId: data.ownerId,
            source: data.source,
            expiresAt: data.expiresAt,
            usedById: null,
            usedAt: null,
            createdAt: new Date(),
          };
        });

        const codes = await generateInvitationCodes(userId, 3);

        // 应生成恰好3个邀请码
        expect(codes).toHaveLength(3);
      }),
      { numRuns: 100 }
    );
  });

  it('生成的每个邀请码应为8位字母数字组合', async () => {
    await fc.assert(
      fc.asyncProperty(uuidArb, async (userId) => {
        mockPrisma.invitationCode.findUnique.mockResolvedValue(null);

        mockPrisma.invitationCode.create.mockImplementation(async ({ data }) => ({
          id: 'mock-id',
          code: data.code,
          ownerId: data.ownerId,
          source: data.source,
          expiresAt: data.expiresAt,
          usedById: null,
          usedAt: null,
          createdAt: new Date(),
        }));

        const codes = await generateInvitationCodes(userId, 3);

        for (const codeRecord of codes) {
          // 每个邀请码应为8位字母数字组合
          expect(codeRecord.code).toMatch(/^[A-Za-z0-9]{8}$/);
          expect(codeRecord.code).toHaveLength(8);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('生成的每个邀请码有效期应为30天', async () => {
    await fc.assert(
      fc.asyncProperty(uuidArb, async (userId) => {
        mockPrisma.invitationCode.findUnique.mockResolvedValue(null);

        mockPrisma.invitationCode.create.mockImplementation(async ({ data }) => ({
          id: 'mock-id',
          code: data.code,
          ownerId: data.ownerId,
          source: data.source,
          expiresAt: data.expiresAt,
          usedById: null,
          usedAt: null,
          createdAt: new Date(),
        }));

        const now = new Date();
        const codes = await generateInvitationCodes(userId, 3);

        for (const codeRecord of codes) {
          // 有效期应约为30天（允许几秒误差）
          const diffMs = codeRecord.expiresAt.getTime() - now.getTime();
          const diffDays = diffMs / (1000 * 60 * 60 * 24);
          expect(diffDays).toBeGreaterThanOrEqual(29.9);
          expect(diffDays).toBeLessThanOrEqual(30.1);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('生成的每个邀请码初始状态应为未使用', async () => {
    await fc.assert(
      fc.asyncProperty(uuidArb, async (userId) => {
        mockPrisma.invitationCode.findUnique.mockResolvedValue(null);

        mockPrisma.invitationCode.create.mockImplementation(async ({ data }) => ({
          id: 'mock-id',
          code: data.code,
          ownerId: data.ownerId,
          source: data.source,
          expiresAt: data.expiresAt,
          usedById: null,
          usedAt: null,
          createdAt: new Date(),
        }));

        const codes = await generateInvitationCodes(userId, 3);

        for (const codeRecord of codes) {
          // 初始状态应为未使用
          expect(codeRecord.usedById).toBeNull();
          expect(codeRecord.usedAt).toBeNull();
        }
      }),
      { numRuns: 100 }
    );
  });
});
