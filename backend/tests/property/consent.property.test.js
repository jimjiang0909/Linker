/**
 * 双向同意模块属性测试
 * 使用 fast-check 验证双向同意机制和频率限制的正确性属性
 *
 * **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.7, 6.1, 9.1, 9.4**
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import fc from 'fast-check';
import { uuidArb } from '../helpers/index.js';
import { createMockPrismaClient } from '../helpers/mockFactory.js';
import { expressInterest, skipMatch } from '../../src/services/consentService.js';
import { checkRateLimit } from '../../src/services/rateLimitService.js';

// ============================================================
// 辅助生成器
// ============================================================

/**
 * 生成一个有效的 pending Match 对象（双方均未响应）
 */
const pendingMatchArb = fc
  .tuple(uuidArb, uuidArb, uuidArb)
  .filter(([id, userAId, userBId]) => userAId !== userBId)
  .map(([id, userAId, userBId]) => ({
    id,
    userAId,
    userBId,
    status: 'pending',
    score: 75,
    reason: '匹配理由',
    userAChoice: null,
    userARespondedAt: null,
    userBChoice: null,
    userBRespondedAt: null,
    expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
    createdAt: new Date(),
  }));

/**
 * 生成一方已选择"感兴趣"的 Match（等待状态）
 */
const waitingMatchArb = fc
  .tuple(uuidArb, uuidArb, uuidArb, fc.constantFrom('A', 'B'))
  .filter(([id, userAId, userBId]) => userAId !== userBId)
  .map(([id, userAId, userBId, respondedSide]) => {
    const match = {
      id,
      userAId,
      userBId,
      status: 'pending',
      score: 75,
      reason: '匹配理由',
      userAChoice: null,
      userARespondedAt: null,
      userBChoice: null,
      userBRespondedAt: null,
      expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
      createdAt: new Date(),
    };
    if (respondedSide === 'A') {
      match.userAChoice = 'interested';
      match.userARespondedAt = new Date();
    } else {
      match.userBChoice = 'interested';
      match.userBRespondedAt = new Date();
    }
    return { match, respondedSide };
  });

/**
 * 生成4个不同的UUID（用于访问隔离测试）
 */
const fourDistinctUuidsArb = fc
  .tuple(uuidArb, uuidArb, uuidArb, uuidArb)
  .filter(([a, b, c, d]) => a !== b && a !== c && a !== d && b !== c && b !== d && c !== d);

// ============================================================
// 属性 8: 匹配状态机的正确性
// ============================================================

describe('Feature: linker-mvp, Property 8: 匹配状态机的正确性', () => {
  /**
   * **Validates: Requirements 5.1, 5.2, 5.3, 5.4**
   *
   * 对于任意 Match，当双方均选择"感兴趣"时应建立 Conversation；
   * 当一方选择"跳过"时该 Match 应被关闭；
   * 当仅一方选择"感兴趣"时应保持等待状态且不向任何一方透露对方选择。
   */

  it('双方均选择"感兴趣"时应建立 Conversation（状态变为 matched）', async () => {
    await fc.assert(
      fc.asyncProperty(
        waitingMatchArb,
        async ({ match, respondedSide }) => {
          const mockPrisma = createMockPrismaClient();
          const now = new Date();

          // 确定未响应方的用户ID
          const respondingUserId = respondedSide === 'A' ? match.userBId : match.userAId;

          // Mock findUnique 返回已有一方感兴趣的 Match
          mockPrisma.match.findUnique.mockResolvedValue(match);
          mockPrisma.match.update.mockResolvedValue({
            ...match,
            status: 'matched',
            ...(respondedSide === 'A'
              ? { userBChoice: 'interested', userBRespondedAt: now }
              : { userAChoice: 'interested', userARespondedAt: now }),
          });
          mockPrisma.conversation.create.mockResolvedValue({
            id: 'conv-id',
            matchId: match.id,
            userAId: match.userAId,
            userBId: match.userBId,
            status: 'active',
          });

          const result = await expressInterest(respondingUserId, match.id, {
            prismaClient: mockPrisma,
            getNow: () => now,
          });

          // 双方都感兴趣 → 应建立 Conversation
          expect(result.status).toBe('matched');
          expect(result.conversationId).toBeDefined();
          expect(result.matchStatus).toBe('matched');
          // 验证 Conversation 被创建
          expect(mockPrisma.conversation.create).toHaveBeenCalledWith(
            expect.objectContaining({
              data: expect.objectContaining({
                matchId: match.id,
                userAId: match.userAId,
                userBId: match.userBId,
                status: 'active',
              }),
            })
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  it('一方选择"跳过"时 Match 应被关闭', async () => {
    await fc.assert(
      fc.asyncProperty(
        pendingMatchArb,
        fc.constantFrom('A', 'B'),
        async (match, skippingSide) => {
          const mockPrisma = createMockPrismaClient();
          const now = new Date();

          const skippingUserId = skippingSide === 'A' ? match.userAId : match.userBId;

          mockPrisma.match.findUnique.mockResolvedValue(match);
          mockPrisma.match.update.mockResolvedValue({
            ...match,
            status: 'closed',
            ...(skippingSide === 'A'
              ? { userAChoice: 'skipped', userARespondedAt: now }
              : { userBChoice: 'skipped', userBRespondedAt: now }),
          });

          const result = await skipMatch(skippingUserId, match.id, {
            prismaClient: mockPrisma,
            getNow: () => now,
          });

          // 一方跳过且对方未响应 → Match 应被关闭
          expect(result.status).toBe('closed');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('仅一方选择"感兴趣"时应保持等待状态', async () => {
    await fc.assert(
      fc.asyncProperty(
        pendingMatchArb,
        fc.constantFrom('A', 'B'),
        async (match, interestedSide) => {
          const mockPrisma = createMockPrismaClient();
          const now = new Date();

          const interestedUserId = interestedSide === 'A' ? match.userAId : match.userBId;

          mockPrisma.match.findUnique.mockResolvedValue(match);
          mockPrisma.match.update.mockResolvedValue({
            ...match,
            ...(interestedSide === 'A'
              ? { userAChoice: 'interested', userARespondedAt: now }
              : { userBChoice: 'interested', userBRespondedAt: now }),
          });

          const result = await expressInterest(interestedUserId, match.id, {
            prismaClient: mockPrisma,
            getNow: () => now,
          });

          // 仅一方感兴趣 → 保持等待状态
          expect(result.status).toBe('waiting');
          expect(result.conversationId).toBeUndefined();
          // 不应创建 Conversation
          expect(mockPrisma.conversation.create).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================
// 属性 9: 等待状态下选择不可撤回
// ============================================================

describe('Feature: linker-mvp, Property 9: 等待状态下选择不可撤回', () => {
  /**
   * **Validates: Requirements 5.7**
   *
   * 对于任意处于等待状态（一方已选择"感兴趣"且在72小时窗口期内）的 Match，
   * 已选择方尝试撤回或修改选择应被拒绝。
   */

  it('已选择"感兴趣"的用户尝试再次操作应被拒绝', async () => {
    await fc.assert(
      fc.asyncProperty(
        waitingMatchArb,
        async ({ match, respondedSide }) => {
          const mockPrisma = createMockPrismaClient();
          const now = new Date();

          // 已响应方的用户ID
          const respondedUserId = respondedSide === 'A' ? match.userAId : match.userBId;

          mockPrisma.match.findUnique.mockResolvedValue(match);

          // 已选择方尝试再次表示感兴趣 → 应被拒绝
          await expect(
            expressInterest(respondedUserId, match.id, {
              prismaClient: mockPrisma,
              getNow: () => now,
            })
          ).rejects.toMatchObject({
            statusCode: 400,
            code: 'ALREADY_RESPONDED',
          });
        }
      ),
      { numRuns: 100 }
    );
  });

  it('已选择"感兴趣"的用户尝试改为"跳过"应被拒绝', async () => {
    await fc.assert(
      fc.asyncProperty(
        waitingMatchArb,
        async ({ match, respondedSide }) => {
          const mockPrisma = createMockPrismaClient();
          const now = new Date();

          // 已响应方的用户ID
          const respondedUserId = respondedSide === 'A' ? match.userAId : match.userBId;

          mockPrisma.match.findUnique.mockResolvedValue(match);

          // 已选择方尝试跳过 → 应被拒绝
          await expect(
            skipMatch(respondedUserId, match.id, {
              prismaClient: mockPrisma,
              getNow: () => now,
            })
          ).rejects.toMatchObject({
            statusCode: 400,
            code: 'ALREADY_RESPONDED',
          });
        }
      ),
      { numRuns: 100 }
    );
  });

  it('未选择方仍可正常操作', async () => {
    await fc.assert(
      fc.asyncProperty(
        waitingMatchArb,
        async ({ match, respondedSide }) => {
          const mockPrisma = createMockPrismaClient();
          const now = new Date();

          // 未响应方的用户ID
          const unrespondedUserId = respondedSide === 'A' ? match.userBId : match.userAId;

          mockPrisma.match.findUnique.mockResolvedValue(match);
          mockPrisma.match.update.mockResolvedValue({
            ...match,
            status: 'matched',
            ...(respondedSide === 'A'
              ? { userBChoice: 'interested', userBRespondedAt: now }
              : { userAChoice: 'interested', userARespondedAt: now }),
          });
          mockPrisma.conversation.create.mockResolvedValue({
            id: 'conv-id',
            matchId: match.id,
            userAId: match.userAId,
            userBId: match.userBId,
            status: 'active',
          });

          // 未选择方应可以正常操作（不抛出异常）
          const result = await expressInterest(unrespondedUserId, match.id, {
            prismaClient: mockPrisma,
            getNow: () => now,
          });

          expect(result.status).toBe('matched');
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================
// 属性 10: Conversation 访问隔离
// ============================================================

describe('Feature: linker-mvp, Property 10: Conversation 访问隔离', () => {
  /**
   * **Validates: Requirements 6.1, 5.8**
   *
   * 对于任意 Conversation 和任意非参与方用户，该用户尝试访问 Conversation 内容应被拒绝。
   */

  it('非参与方用户尝试对 Match 操作应被拒绝', async () => {
    await fc.assert(
      fc.asyncProperty(
        fourDistinctUuidsArb,
        async ([matchId, userAId, userBId, nonParticipantId]) => {
          const match = {
            id: matchId,
            userAId,
            userBId,
            status: 'pending',
            score: 75,
            reason: '匹配理由',
            userAChoice: null,
            userARespondedAt: null,
            userBChoice: null,
            userBRespondedAt: null,
            expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
            createdAt: new Date(),
          };

          const mockPrisma = createMockPrismaClient();
          const now = new Date();

          mockPrisma.match.findUnique.mockResolvedValue(match);

          // 非参与方尝试表示感兴趣 → 应被拒绝
          await expect(
            expressInterest(nonParticipantId, match.id, {
              prismaClient: mockPrisma,
              getNow: () => now,
            })
          ).rejects.toMatchObject({
            statusCode: 403,
            code: 'NOT_PARTICIPANT',
          });
        }
      ),
      { numRuns: 100 }
    );
  });

  it('非参与方用户尝试跳过 Match 应被拒绝', async () => {
    await fc.assert(
      fc.asyncProperty(
        fourDistinctUuidsArb,
        async ([matchId, userAId, userBId, nonParticipantId]) => {
          const match = {
            id: matchId,
            userAId,
            userBId,
            status: 'pending',
            score: 75,
            reason: '匹配理由',
            userAChoice: null,
            userARespondedAt: null,
            userBChoice: null,
            userBRespondedAt: null,
            expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
            createdAt: new Date(),
          };

          const mockPrisma = createMockPrismaClient();
          const now = new Date();

          mockPrisma.match.findUnique.mockResolvedValue(match);

          // 非参与方尝试跳过 → 应被拒绝
          await expect(
            skipMatch(nonParticipantId, match.id, {
              prismaClient: mockPrisma,
              getNow: () => now,
            })
          ).rejects.toMatchObject({
            statusCode: 403,
            code: 'NOT_PARTICIPANT',
          });
        }
      ),
      { numRuns: 100 }
    );
  });

  it('参与方用户可以正常操作', async () => {
    await fc.assert(
      fc.asyncProperty(
        pendingMatchArb,
        fc.constantFrom('A', 'B'),
        async (match, side) => {
          const mockPrisma = createMockPrismaClient();
          const now = new Date();

          const participantId = side === 'A' ? match.userAId : match.userBId;

          mockPrisma.match.findUnique.mockResolvedValue(match);
          mockPrisma.match.update.mockResolvedValue({
            ...match,
            ...(side === 'A'
              ? { userAChoice: 'interested', userARespondedAt: now }
              : { userBChoice: 'interested', userBRespondedAt: now }),
          });

          // 参与方应可以正常操作（不抛出 NOT_PARTICIPANT 异常）
          const result = await expressInterest(participantId, match.id, {
            prismaClient: mockPrisma,
            getNow: () => now,
          });

          expect(result.status).toBe('waiting');
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================
// 属性 15: 性别差异化频率限制
// ============================================================

describe('Feature: linker-mvp, Property 15: 性别差异化频率限制', () => {
  /**
   * **Validates: Requirements 9.1, 9.4**
   *
   * 对于任意用户在同一自然日（CST）内，若用户性别为男性，则"感兴趣"操作次数
   * 不应超过3次（第4次及以后应被拒绝）；若用户性别为女性，则不应有次数限制。
   */

  it('男性用户每日"感兴趣"不超过3次，第4次应被拒绝', async () => {
    await fc.assert(
      fc.asyncProperty(
        uuidArb,
        fc.integer({ min: 0, max: 10 }),
        async (userId, currentCount) => {
          const mockPrisma = createMockPrismaClient();

          // Mock 用户为男性
          mockPrisma.profile.findUnique.mockResolvedValue({
            userId,
            gender: 'male',
          });

          // Mock 当日已使用次数
          if (currentCount > 0) {
            mockPrisma.rateLimit.findUnique.mockResolvedValue({
              userId,
              date: new Date(),
              interestedCount: currentCount,
            });
          } else {
            mockPrisma.rateLimit.findUnique.mockResolvedValue(null);
          }

          const result = await checkRateLimit(userId, { prismaClient: mockPrisma });

          if (currentCount >= 3) {
            // 已达上限 → 应被拒绝
            expect(result.allowed).toBe(false);
            expect(result.remaining).toBe(0);
          } else {
            // 未达上限 → 应允许
            expect(result.allowed).toBe(true);
            expect(result.remaining).toBe(3 - currentCount);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('女性用户不受"感兴趣"次数限制', async () => {
    await fc.assert(
      fc.asyncProperty(
        uuidArb,
        async (userId) => {
          const mockPrisma = createMockPrismaClient();

          // Mock 用户为女性
          mockPrisma.profile.findUnique.mockResolvedValue({
            userId,
            gender: 'female',
          });

          const result = await checkRateLimit(userId, { prismaClient: mockPrisma });

          // 女性用户始终允许
          expect(result.allowed).toBe(true);
          expect(result.remaining).toBe(Infinity);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('男性用户恰好在第3次时仍允许操作', async () => {
    await fc.assert(
      fc.asyncProperty(
        uuidArb,
        async (userId) => {
          const mockPrisma = createMockPrismaClient();

          // Mock 用户为男性，已使用2次
          mockPrisma.profile.findUnique.mockResolvedValue({
            userId,
            gender: 'male',
          });
          mockPrisma.rateLimit.findUnique.mockResolvedValue({
            userId,
            date: new Date(),
            interestedCount: 2,
          });

          const result = await checkRateLimit(userId, { prismaClient: mockPrisma });

          // 第3次（当前已用2次）→ 仍允许
          expect(result.allowed).toBe(true);
          expect(result.remaining).toBe(1);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('性别差异化：相同操作次数下男性被限制而女性不被限制', async () => {
    await fc.assert(
      fc.asyncProperty(
        uuidArb,
        uuidArb,
        fc.integer({ min: 3, max: 10 }),
        async (maleUserId, femaleUserId, count) => {
          const mockPrismaMale = createMockPrismaClient();
          const mockPrismaFemale = createMockPrismaClient();

          // 男性用户
          mockPrismaMale.profile.findUnique.mockResolvedValue({
            userId: maleUserId,
            gender: 'male',
          });
          mockPrismaMale.rateLimit.findUnique.mockResolvedValue({
            userId: maleUserId,
            date: new Date(),
            interestedCount: count,
          });

          // 女性用户
          mockPrismaFemale.profile.findUnique.mockResolvedValue({
            userId: femaleUserId,
            gender: 'female',
          });

          const maleResult = await checkRateLimit(maleUserId, { prismaClient: mockPrismaMale });
          const femaleResult = await checkRateLimit(femaleUserId, { prismaClient: mockPrismaFemale });

          // 男性达到上限 → 被拒绝
          expect(maleResult.allowed).toBe(false);
          // 女性不受限制 → 允许
          expect(femaleResult.allowed).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});
