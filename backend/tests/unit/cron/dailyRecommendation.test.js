/**
 * 每日推荐定时任务调度 - 单元测试
 * 测试匹配计算、推送、重试逻辑和无候选对象通知
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { createMockPrismaClient } from '../../helpers/mockFactory.js';
import {
  getEligibleUserIds,
  runDailyMatchCalculation,
  pushRecommendation,
  scheduleRetry,
  notifyNoCandidates,
  runDailyPush,
  runDailyReset,
  startCronJobs,
  stopCronJobs,
} from '../../../src/cron/dailyRecommendation.js';

describe('每日推荐定时任务调度', () => {
  let mockPrisma;

  beforeEach(() => {
    mockPrisma = createMockPrismaClient();
    jest.useFakeTimers();
  });

  afterEach(() => {
    stopCronJobs();
    jest.useRealTimers();
  });

  describe('getEligibleUserIds', () => {
    it('应返回所有状态为 preference_set 的用户 ID', async () => {
      const mockUsers = [
        { id: 'user-1' },
        { id: 'user-2' },
        { id: 'user-3' },
      ];
      mockPrisma.user.findMany.mockResolvedValue(mockUsers);

      const result = await getEligibleUserIds({ prismaClient: mockPrisma });

      expect(result).toEqual(['user-1', 'user-2', 'user-3']);
      expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
        where: { status: 'preference_set' },
        select: { id: true },
      });
    });

    it('无符合条件用户时应返回空数组', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);

      const result = await getEligibleUserIds({ prismaClient: mockPrisma });

      expect(result).toEqual([]);
    });
  });

  describe('runDailyMatchCalculation', () => {
    it('应为所有符合条件的用户生成推荐', async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        { id: 'user-1' },
        { id: 'user-2' },
      ]);

      const mockGenerateFn = jest.fn()
        .mockResolvedValueOnce({ id: 'rec-1', userId: 'user-1', matchIds: ['m1'] })
        .mockResolvedValueOnce({ id: 'rec-2', userId: 'user-2', matchIds: ['m2'] });

      const result = await runDailyMatchCalculation({
        prismaClient: mockPrisma,
        generateRecommendationsFn: mockGenerateFn,
      });

      expect(result.processed).toBe(2);
      expect(result.generated).toBe(2);
      expect(result.noCandidates).toEqual([]);
      expect(mockGenerateFn).toHaveBeenCalledTimes(2);
    });

    it('无候选对象时应创建 failed 状态记录', async () => {
      mockPrisma.user.findMany.mockResolvedValue([{ id: 'user-1' }]);
      mockPrisma.dailyRecommendation.create.mockResolvedValue({
        id: 'rec-1',
        userId: 'user-1',
        status: 'failed',
      });

      const mockGenerateFn = jest.fn().mockResolvedValue(null);

      const result = await runDailyMatchCalculation({
        prismaClient: mockPrisma,
        generateRecommendationsFn: mockGenerateFn,
      });

      expect(result.processed).toBe(1);
      expect(result.generated).toBe(0);
      expect(result.noCandidates).toEqual(['user-1']);
      expect(mockPrisma.dailyRecommendation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          matchIds: [],
          status: 'failed',
        }),
      });
    });

    it('生成推荐抛出异常时应继续处理其他用户', async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        { id: 'user-1' },
        { id: 'user-2' },
      ]);

      const mockGenerateFn = jest.fn()
        .mockRejectedValueOnce(new Error('AI 服务不可用'))
        .mockResolvedValueOnce({ id: 'rec-2', userId: 'user-2', matchIds: ['m2'] });

      const result = await runDailyMatchCalculation({
        prismaClient: mockPrisma,
        generateRecommendationsFn: mockGenerateFn,
      });

      expect(result.processed).toBe(2);
      expect(result.generated).toBe(1);
    });
  });

  describe('pushRecommendation', () => {
    it('应更新状态为 pushed 并调用 emitFn', async () => {
      const recommendation = {
        id: 'rec-1',
        userId: 'user-1',
        matchIds: ['m1', 'm2'],
        recommendationDate: new Date('2024-01-15'),
      };

      mockPrisma.dailyRecommendation.update.mockResolvedValue({
        ...recommendation,
        status: 'pushed',
      });

      const emitFn = jest.fn();

      const success = await pushRecommendation(recommendation, {
        prismaClient: mockPrisma,
        emitFn,
      });

      expect(success).toBe(true);
      expect(mockPrisma.dailyRecommendation.update).toHaveBeenCalledWith({
        where: { id: 'rec-1' },
        data: {
          status: 'pushed',
          pushedAt: expect.any(Date),
        },
      });
      expect(emitFn).toHaveBeenCalledWith('user-1', 'recommendation:new', {
        matchIds: ['m1', 'm2'],
        date: recommendation.recommendationDate,
      });
    });

    it('推送失败时应返回 false', async () => {
      const recommendation = {
        id: 'rec-1',
        userId: 'user-1',
        matchIds: ['m1'],
        recommendationDate: new Date(),
      };

      mockPrisma.dailyRecommendation.update.mockRejectedValue(
        new Error('数据库连接失败')
      );

      const success = await pushRecommendation(recommendation, {
        prismaClient: mockPrisma,
      });

      expect(success).toBe(false);
    });

    it('无 emitFn 时仍应成功更新状态', async () => {
      const recommendation = {
        id: 'rec-1',
        userId: 'user-1',
        matchIds: ['m1'],
        recommendationDate: new Date(),
      };

      mockPrisma.dailyRecommendation.update.mockResolvedValue({
        ...recommendation,
        status: 'pushed',
      });

      const success = await pushRecommendation(recommendation, {
        prismaClient: mockPrisma,
      });

      expect(success).toBe(true);
    });
  });

  describe('scheduleRetry', () => {
    it('应在指定延迟后重试推送', async () => {
      const recommendation = {
        id: 'rec-1',
        userId: 'user-1',
        matchIds: ['m1'],
        retryCount: 0,
      };

      mockPrisma.dailyRecommendation.findUnique.mockResolvedValue({
        ...recommendation,
        status: 'pending',
        retryCount: 0,
      });
      mockPrisma.dailyRecommendation.update.mockResolvedValue({
        ...recommendation,
        status: 'pushed',
        retryCount: 1,
      });

      const emitFn = jest.fn();

      scheduleRetry(recommendation, {
        prismaClient: mockPrisma,
        emitFn,
        retryDelay: 1000, // 1秒用于测试
      });

      // 推进时间
      jest.advanceTimersByTime(1000);

      // 等待异步操作完成
      await Promise.resolve();
      await Promise.resolve();

      expect(mockPrisma.dailyRecommendation.findUnique).toHaveBeenCalledWith({
        where: { id: 'rec-1' },
      });
    });

    it('已成功推送时不应重试', async () => {
      const recommendation = {
        id: 'rec-1',
        userId: 'user-1',
        matchIds: ['m1'],
        retryCount: 0,
      };

      mockPrisma.dailyRecommendation.findUnique.mockResolvedValue({
        ...recommendation,
        status: 'pushed',
        retryCount: 0,
      });

      scheduleRetry(recommendation, {
        prismaClient: mockPrisma,
        retryDelay: 1000,
      });

      jest.advanceTimersByTime(1000);
      await Promise.resolve();
      await Promise.resolve();

      // 不应调用 update（因为已经是 pushed 状态）
      expect(mockPrisma.dailyRecommendation.update).not.toHaveBeenCalled();
    });

    it('达到最大重试次数时应标记为 failed', async () => {
      const recommendation = {
        id: 'rec-1',
        userId: 'user-1',
        matchIds: ['m1'],
        retryCount: 1,
      };

      mockPrisma.dailyRecommendation.findUnique.mockResolvedValue({
        ...recommendation,
        status: 'pending',
        retryCount: 2, // 已达上限
      });

      scheduleRetry(recommendation, {
        prismaClient: mockPrisma,
        retryDelay: 1000,
      });

      jest.advanceTimersByTime(1000);
      await Promise.resolve();
      await Promise.resolve();

      expect(mockPrisma.dailyRecommendation.update).toHaveBeenCalledWith({
        where: { id: 'rec-1' },
        data: { status: 'failed' },
      });
    });

    it('默认重试延迟应为30分钟（1800000毫秒）', () => {
      const recommendation = {
        id: 'rec-1',
        userId: 'user-1',
        matchIds: ['m1'],
        retryCount: 0,
      };

      mockPrisma.dailyRecommendation.findUnique.mockResolvedValue({
        ...recommendation,
        status: 'pending',
        retryCount: 0,
      });
      mockPrisma.dailyRecommendation.update.mockResolvedValue({});

      // 不传 retryDelay，使用默认值
      scheduleRetry(recommendation, {
        prismaClient: mockPrisma,
      });

      // 29分钟后不应触发重试
      jest.advanceTimersByTime(29 * 60 * 1000);
      expect(mockPrisma.dailyRecommendation.findUnique).not.toHaveBeenCalled();

      // 30分钟后应触发重试
      jest.advanceTimersByTime(1 * 60 * 1000);
      expect(mockPrisma.dailyRecommendation.findUnique).toHaveBeenCalledWith({
        where: { id: 'rec-1' },
      });
    });

    it('重试时应递增 retryCount', async () => {
      const recommendation = {
        id: 'rec-1',
        userId: 'user-1',
        matchIds: ['m1'],
        retryCount: 0,
        recommendationDate: new Date(),
      };

      mockPrisma.dailyRecommendation.findUnique.mockResolvedValue({
        ...recommendation,
        status: 'pending',
        retryCount: 0,
      });
      mockPrisma.dailyRecommendation.update.mockResolvedValue({
        ...recommendation,
        status: 'pushed',
        retryCount: 1,
      });

      scheduleRetry(recommendation, {
        prismaClient: mockPrisma,
        retryDelay: 1000,
      });

      jest.advanceTimersByTime(1000);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      // 验证 retryCount 递增调用
      expect(mockPrisma.dailyRecommendation.update).toHaveBeenCalledWith({
        where: { id: 'rec-1' },
        data: { retryCount: { increment: 1 } },
      });
    });
  });

  describe('notifyNoCandidates', () => {
    it('应通过 emitFn 通知用户暂无推荐', () => {
      const emitFn = jest.fn();

      notifyNoCandidates('user-1', { emitFn });

      expect(emitFn).toHaveBeenCalledWith('user-1', 'recommendation:new', {
        matchIds: [],
        message: '今日暂无推荐，建议调整偏好设置以获得更多匹配机会',
      });
    });

    it('无 emitFn 时不应抛出异常', () => {
      expect(() => notifyNoCandidates('user-1', {})).not.toThrow();
    });
  });

  describe('runDailyPush', () => {
    it('应推送所有 pending 状态的推荐', async () => {
      const pendingRecs = [
        { id: 'rec-1', userId: 'user-1', matchIds: ['m1'], recommendationDate: new Date(), status: 'pending' },
        { id: 'rec-2', userId: 'user-2', matchIds: ['m2'], recommendationDate: new Date(), status: 'pending' },
      ];

      mockPrisma.dailyRecommendation.findMany
        .mockResolvedValueOnce(pendingRecs) // pending 查询
        .mockResolvedValueOnce([]); // failed 查询

      mockPrisma.dailyRecommendation.update.mockResolvedValue({});

      const emitFn = jest.fn();

      const result = await runDailyPush({
        prismaClient: mockPrisma,
        emitFn,
      });

      expect(result.pushed).toBe(2);
      expect(result.failed).toBe(0);
      expect(emitFn).toHaveBeenCalledTimes(2);
    });

    it('推送失败时应调度重试并计入 failed', async () => {
      const pendingRecs = [
        { id: 'rec-1', userId: 'user-1', matchIds: ['m1'], recommendationDate: new Date(), status: 'pending' },
      ];

      mockPrisma.dailyRecommendation.findMany
        .mockResolvedValueOnce(pendingRecs)
        .mockResolvedValueOnce([]);

      mockPrisma.dailyRecommendation.update.mockRejectedValue(
        new Error('推送失败')
      );

      const result = await runDailyPush({
        prismaClient: mockPrisma,
        retryDelay: 1000,
      });

      expect(result.pushed).toBe(0);
      expect(result.failed).toBe(1);
    });

    it('应通知无候选对象的用户', async () => {
      const failedRecs = [
        { id: 'rec-1', userId: 'user-1', matchIds: [], recommendationDate: new Date(), status: 'failed' },
      ];

      mockPrisma.dailyRecommendation.findMany
        .mockResolvedValueOnce([]) // pending 查询
        .mockResolvedValueOnce(failedRecs); // failed 查询

      const emitFn = jest.fn();

      const result = await runDailyPush({
        prismaClient: mockPrisma,
        emitFn,
      });

      expect(result.noCandidatesNotified).toBe(1);
      expect(emitFn).toHaveBeenCalledWith('user-1', 'recommendation:new', {
        matchIds: [],
        message: '今日暂无推荐，建议调整偏好设置以获得更多匹配机会',
      });
    });
  });

  describe('runDailyReset', () => {
    it('应调用 resetDailyCounts 并返回结果', async () => {
      // resetDailyCounts 内部调用 prisma.rateLimit.deleteMany
      mockPrisma.rateLimit.deleteMany.mockResolvedValue({ count: 5 });

      const result = await runDailyReset({ prismaClient: mockPrisma });

      expect(result.deletedCount).toBe(5);
    });
  });

  describe('startCronJobs / stopCronJobs', () => {
    it('应成功启动和停止定时任务', () => {
      expect(() => startCronJobs({})).not.toThrow();
      expect(() => stopCronJobs()).not.toThrow();
    });

    it('多次调用 stopCronJobs 不应抛出异常', () => {
      startCronJobs({});
      expect(() => stopCronJobs()).not.toThrow();
      expect(() => stopCronJobs()).not.toThrow();
    });
  });
});
