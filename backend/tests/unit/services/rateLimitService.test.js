/**
 * 频率限制服务单元测试
 */
import { jest } from '@jest/globals';
import {
  checkRateLimit,
  incrementInterestCount,
  resetDailyCounts,
  getRemainingInterests,
  getTodayCST,
  getNextResetTimeCST,
} from '../../../src/services/rateLimitService.js';

// 创建 mock Prisma 客户端
function createMockPrisma() {
  return {
    profile: {
      findUnique: jest.fn(),
    },
    rateLimit: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
  };
}

describe('rateLimitService', () => {
  let mockPrisma;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
  });

  describe('getTodayCST', () => {
    it('应返回有效的 Date 对象', () => {
      const today = getTodayCST();
      expect(today).toBeInstanceOf(Date);
      expect(today.getUTCHours()).toBe(0);
      expect(today.getUTCMinutes()).toBe(0);
      expect(today.getUTCSeconds()).toBe(0);
    });
  });

  describe('getNextResetTimeCST', () => {
    it('应返回次日的 Date 对象', () => {
      const today = getTodayCST();
      const nextReset = getNextResetTimeCST();
      const diffMs = nextReset.getTime() - today.getTime();
      // 差值应为 24 小时
      expect(diffMs).toBe(24 * 60 * 60 * 1000);
    });
  });

  describe('checkRateLimit', () => {
    it('女性用户应始终允许操作', async () => {
      mockPrisma.profile.findUnique.mockResolvedValue({ gender: 'female' });

      const result = await checkRateLimit('user-1', { prismaClient: mockPrisma });

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(Infinity);
      // 不应查询 rateLimit 表
      expect(mockPrisma.rateLimit.findUnique).not.toHaveBeenCalled();
    });

    it('其他性别用户应不受限制', async () => {
      mockPrisma.profile.findUnique.mockResolvedValue({ gender: 'other' });

      const result = await checkRateLimit('user-1', { prismaClient: mockPrisma });

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(Infinity);
    });

    it('男性用户未使用过时应允许操作，剩余3次', async () => {
      mockPrisma.profile.findUnique.mockResolvedValue({ gender: 'male' });
      mockPrisma.rateLimit.findUnique.mockResolvedValue(null);

      const result = await checkRateLimit('user-1', { prismaClient: mockPrisma });

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(3);
    });

    it('男性用户已使用2次时应允许操作，剩余1次', async () => {
      mockPrisma.profile.findUnique.mockResolvedValue({ gender: 'male' });
      mockPrisma.rateLimit.findUnique.mockResolvedValue({ interestedCount: 2 });

      const result = await checkRateLimit('user-1', { prismaClient: mockPrisma });

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(1);
    });

    it('男性用户已使用3次时应禁止操作', async () => {
      mockPrisma.profile.findUnique.mockResolvedValue({ gender: 'male' });
      mockPrisma.rateLimit.findUnique.mockResolvedValue({ interestedCount: 3 });

      const result = await checkRateLimit('user-1', { prismaClient: mockPrisma });

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.message).toContain('已达上限');
      expect(result.nextResetAt).toBeInstanceOf(Date);
    });

    it('男性用户已使用超过3次时应禁止操作', async () => {
      mockPrisma.profile.findUnique.mockResolvedValue({ gender: 'male' });
      mockPrisma.rateLimit.findUnique.mockResolvedValue({ interestedCount: 5 });

      const result = await checkRateLimit('user-1', { prismaClient: mockPrisma });

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('用户资料不存在时应抛出错误', async () => {
      mockPrisma.profile.findUnique.mockResolvedValue(null);

      await expect(checkRateLimit('user-1', { prismaClient: mockPrisma }))
        .rejects.toThrow('用户资料不存在');
    });
  });

  describe('incrementInterestCount', () => {
    it('应使用 upsert 递增计数', async () => {
      mockPrisma.rateLimit.upsert.mockResolvedValue({ interestedCount: 1 });

      const result = await incrementInterestCount('user-1', { prismaClient: mockPrisma });

      expect(result.count).toBe(1);
      expect(result.remaining).toBe(2);
      expect(mockPrisma.rateLimit.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId_date: expect.objectContaining({
              userId: 'user-1',
            }),
          }),
          update: { interestedCount: { increment: 1 } },
          create: expect.objectContaining({
            userId: 'user-1',
            interestedCount: 1,
          }),
        })
      );
    });

    it('计数达到上限时 remaining 应为0', async () => {
      mockPrisma.rateLimit.upsert.mockResolvedValue({ interestedCount: 3 });

      const result = await incrementInterestCount('user-1', { prismaClient: mockPrisma });

      expect(result.count).toBe(3);
      expect(result.remaining).toBe(0);
    });
  });

  describe('resetDailyCounts', () => {
    it('应删除今日之前的所有记录', async () => {
      mockPrisma.rateLimit.deleteMany.mockResolvedValue({ count: 10 });

      const result = await resetDailyCounts({ prismaClient: mockPrisma });

      expect(result.deletedCount).toBe(10);
      expect(mockPrisma.rateLimit.deleteMany).toHaveBeenCalledWith({
        where: {
          date: {
            lt: expect.any(Date),
          },
        },
      });
    });

    it('无记录时应返回 deletedCount 为 0', async () => {
      mockPrisma.rateLimit.deleteMany.mockResolvedValue({ count: 0 });

      const result = await resetDailyCounts({ prismaClient: mockPrisma });

      expect(result.deletedCount).toBe(0);
    });
  });

  describe('每日 CST 00:00 重置后恢复操作', () => {
    it('重置后男性用户应恢复3次操作额度', async () => {
      // 需求 9.3: 每日 CST 00:00 将所有男性用户的当日"感兴趣"已用计数重置为0
      // 模拟重置操作（删除旧记录）
      mockPrisma.rateLimit.deleteMany.mockResolvedValue({ count: 5 });
      const resetResult = await resetDailyCounts({ prismaClient: mockPrisma });
      expect(resetResult.deletedCount).toBe(5);

      // 重置后查询，应无今日记录（返回 null）
      mockPrisma.profile.findUnique.mockResolvedValue({ gender: 'male' });
      mockPrisma.rateLimit.findUnique.mockResolvedValue(null);

      const result = await checkRateLimit('user-1', { prismaClient: mockPrisma });
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(3);
    });

    it('男性用户第4次感兴趣应被拒绝并提示次日可操作', async () => {
      // 需求 9.2: 达到上限后禁止操作，显示下次可操作时间
      mockPrisma.profile.findUnique.mockResolvedValue({ gender: 'male' });
      mockPrisma.rateLimit.findUnique.mockResolvedValue({ interestedCount: 3 });

      const result = await checkRateLimit('user-1', { prismaClient: mockPrisma });

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.message).toContain('已达上限');
      expect(result.message).toContain('次日 CST 00:00');
      expect(result.nextResetAt).toBeInstanceOf(Date);
      // nextResetAt 应大于当前时间
      expect(result.nextResetAt.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('getRemainingInterests', () => {
    it('女性用户应返回无限制', async () => {
      mockPrisma.profile.findUnique.mockResolvedValue({ gender: 'female' });

      const result = await getRemainingInterests('user-1', { prismaClient: mockPrisma });

      expect(result.remaining).toBe(Infinity);
      expect(result.limit).toBe(Infinity);
      expect(result.used).toBe(0);
    });

    it('男性用户未使用时应返回剩余3次', async () => {
      mockPrisma.profile.findUnique.mockResolvedValue({ gender: 'male' });
      mockPrisma.rateLimit.findUnique.mockResolvedValue(null);

      const result = await getRemainingInterests('user-1', { prismaClient: mockPrisma });

      expect(result.remaining).toBe(3);
      expect(result.limit).toBe(3);
      expect(result.used).toBe(0);
    });

    it('男性用户已使用2次时应返回剩余1次', async () => {
      mockPrisma.profile.findUnique.mockResolvedValue({ gender: 'male' });
      mockPrisma.rateLimit.findUnique.mockResolvedValue({ interestedCount: 2 });

      const result = await getRemainingInterests('user-1', { prismaClient: mockPrisma });

      expect(result.remaining).toBe(1);
      expect(result.limit).toBe(3);
      expect(result.used).toBe(2);
    });

    it('用户资料不存在时应抛出错误', async () => {
      mockPrisma.profile.findUnique.mockResolvedValue(null);

      await expect(getRemainingInterests('user-1', { prismaClient: mockPrisma }))
        .rejects.toThrow('用户资料不存在');
    });
  });
});
