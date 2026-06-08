/**
 * Match 过期定时任务 - 单元测试
 * 测试过期检查逻辑、定时任务启动/停止
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { createMockPrismaClient } from '../../helpers/mockFactory.js';
import {
  runMatchExpiryCheck,
  startMatchExpiryCron,
  stopMatchExpiryCron,
} from '../../../src/cron/matchExpiry.js';

describe('Match 过期定时任务', () => {
  let mockPrisma;

  beforeEach(() => {
    mockPrisma = createMockPrismaClient();
  });

  afterEach(() => {
    stopMatchExpiryCron();
  });

  describe('runMatchExpiryCheck', () => {
    it('应将过期的 pending Match 标记为 expired', async () => {
      mockPrisma.match.updateMany.mockResolvedValue({ count: 3 });

      const result = await runMatchExpiryCheck({ prismaClient: mockPrisma });

      expect(result.expiredCount).toBe(3);
      expect(mockPrisma.match.updateMany).toHaveBeenCalledWith({
        where: {
          status: 'pending',
          expiresAt: {
            lte: expect.any(Date),
          },
        },
        data: {
          status: 'expired',
        },
      });
    });

    it('无过期 Match 时应返回 expiredCount 为 0', async () => {
      mockPrisma.match.updateMany.mockResolvedValue({ count: 0 });

      const result = await runMatchExpiryCheck({ prismaClient: mockPrisma });

      expect(result.expiredCount).toBe(0);
    });

    it('应使用注入的 getNow 函数获取当前时间', async () => {
      const fixedTime = new Date('2024-06-15T12:00:00Z');
      const getNow = () => fixedTime;
      mockPrisma.match.updateMany.mockResolvedValue({ count: 1 });

      await runMatchExpiryCheck({ prismaClient: mockPrisma, getNow });

      expect(mockPrisma.match.updateMany).toHaveBeenCalledWith({
        where: {
          status: 'pending',
          expiresAt: {
            lte: fixedTime,
          },
        },
        data: {
          status: 'expired',
        },
      });
    });

    it('数据库异常时应抛出错误', async () => {
      mockPrisma.match.updateMany.mockRejectedValue(new Error('数据库连接失败'));

      await expect(runMatchExpiryCheck({ prismaClient: mockPrisma })).rejects.toThrow(
        '数据库连接失败'
      );
    });
  });

  describe('startMatchExpiryCron / stopMatchExpiryCron', () => {
    it('应成功启动和停止定时任务', () => {
      expect(() => startMatchExpiryCron({})).not.toThrow();
      expect(() => stopMatchExpiryCron()).not.toThrow();
    });

    it('多次调用 stopMatchExpiryCron 不应抛出异常', () => {
      startMatchExpiryCron({});
      expect(() => stopMatchExpiryCron()).not.toThrow();
      expect(() => stopMatchExpiryCron()).not.toThrow();
    });

    it('未启动时调用 stopMatchExpiryCron 不应抛出异常', () => {
      expect(() => stopMatchExpiryCron()).not.toThrow();
    });
  });
});
