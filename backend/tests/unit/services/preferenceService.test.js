/**
 * preferenceService 单元测试
 * 测试偏好设置服务的校验逻辑和创建/更新功能
 */
import { jest } from '@jest/globals';
import {
  createOrUpdatePreference,
  validatePreference,
  normalizeDatingIntent,
} from '../../../src/services/preferenceService.js';
import { createMockPrismaClient } from '../../helpers/mockFactory.js';

describe('preferenceService', () => {
  let mockPrisma;

  beforeEach(() => {
    mockPrisma = createMockPrismaClient();
    // 覆盖 $transaction 以支持数组形式
    mockPrisma.$transaction = jest.fn((operations) => Promise.all(operations));
  });

  describe('validatePreference', () => {
    it('应通过合法的完整偏好数据校验', () => {
      const errors = validatePreference({
        ageMin: 20,
        ageMax: 30,
        datingIntent: '认真约会',
        occupationTypes: ['工程师', '设计师'],
        personalityTraits: ['外向', '幽默'],
      });
      expect(errors).toHaveLength(0);
    });

    it('应通过仅包含必填项的偏好数据校验', () => {
      const errors = validatePreference({
        ageMin: 18,
        ageMax: 60,
        datingIntent: '轻社交',
      });
      expect(errors).toHaveLength(0);
    });

    it('应在年龄下限大于上限时返回错误', () => {
      const errors = validatePreference({
        ageMin: 35,
        ageMax: 25,
        datingIntent: '交朋友',
      });
      expect(errors).toContain('年龄范围无效：下限不能大于上限');
    });

    it('应在年龄范围跨度小于1时返回错误', () => {
      const errors = validatePreference({
        ageMin: 25,
        ageMax: 25,
        datingIntent: '认真约会',
      });
      expect(errors).toContain('年龄范围跨度最小为1岁');
    });

    it('应在年龄下限小于18时返回错误', () => {
      const errors = validatePreference({
        ageMin: 16,
        ageMax: 30,
        datingIntent: '认真约会',
      });
      expect(errors).toContain('期望年龄下限必须在18-60之间');
    });

    it('应在年龄上限大于60时返回错误', () => {
      const errors = validatePreference({
        ageMin: 20,
        ageMax: 65,
        datingIntent: '认真约会',
      });
      expect(errors).toContain('期望年龄上限必须在18-60之间');
    });

    it('应在年龄下限为空时返回必填项错误', () => {
      const errors = validatePreference({
        ageMax: 30,
        datingIntent: '认真约会',
      });
      expect(errors).toContain('期望年龄下限为必填项');
    });

    it('应在年龄上限为空时返回必填项错误', () => {
      const errors = validatePreference({
        ageMin: 20,
        datingIntent: '认真约会',
      });
      expect(errors).toContain('期望年龄上限为必填项');
    });

    it('应在交友意图为空时返回必填项错误', () => {
      const errors = validatePreference({
        ageMin: 20,
        ageMax: 30,
      });
      expect(errors).toContain('交友意图为必填项');
    });

    it('应在交友意图为非法选项时返回错误', () => {
      const errors = validatePreference({
        ageMin: 20,
        ageMax: 30,
        datingIntent: '随便看看',
      });
      expect(errors.some((e) => e.includes('交友意图无效'))).toBe(true);
    });

    it('应在职业类型超过5项时返回错误', () => {
      const errors = validatePreference({
        ageMin: 20,
        ageMax: 30,
        datingIntent: '认真约会',
        occupationTypes: ['a', 'b', 'c', 'd', 'e', 'f'],
      });
      expect(errors).toContain('期望职业类型最多可选择5项');
    });

    it('应在性格特征超过5项时返回错误', () => {
      const errors = validatePreference({
        ageMin: 20,
        ageMax: 30,
        datingIntent: '认真约会',
        personalityTraits: ['a', 'b', 'c', 'd', 'e', 'f'],
      });
      expect(errors).toContain('期望性格特征最多可选择5项');
    });

    it('应同时返回多个错误', () => {
      const errors = validatePreference({
        ageMin: 16,
        ageMax: 65,
        datingIntent: '无效选项',
        occupationTypes: ['a', 'b', 'c', 'd', 'e', 'f'],
        personalityTraits: ['a', 'b', 'c', 'd', 'e', 'f'],
      });
      expect(errors.length).toBeGreaterThanOrEqual(4);
    });

    it('应接受枚举值形式的交友意图', () => {
      const errors = validatePreference({
        ageMin: 20,
        ageMax: 30,
        datingIntent: 'serious_dating',
      });
      expect(errors).toHaveLength(0);
    });

    it('应在职业类型恰好5项时通过校验', () => {
      const errors = validatePreference({
        ageMin: 20,
        ageMax: 30,
        datingIntent: '认真约会',
        occupationTypes: ['a', 'b', 'c', 'd', 'e'],
      });
      expect(errors).toHaveLength(0);
    });

    it('应在性格特征恰好5项时通过校验', () => {
      const errors = validatePreference({
        ageMin: 20,
        ageMax: 30,
        datingIntent: '认真约会',
        personalityTraits: ['a', 'b', 'c', 'd', 'e'],
      });
      expect(errors).toHaveLength(0);
    });

    it('应在年龄范围跨度恰好为1时通过校验', () => {
      const errors = validatePreference({
        ageMin: 25,
        ageMax: 26,
        datingIntent: '认真约会',
      });
      expect(errors).toHaveLength(0);
    });
  });

  describe('normalizeDatingIntent', () => {
    it('应将"认真约会"转换为 serious_dating', () => {
      expect(normalizeDatingIntent('认真约会')).toBe('serious_dating');
    });

    it('应将"轻社交"转换为 casual_social', () => {
      expect(normalizeDatingIntent('轻社交')).toBe('casual_social');
    });

    it('应将"交朋友"转换为 make_friends', () => {
      expect(normalizeDatingIntent('交朋友')).toBe('make_friends');
    });

    it('应直接返回已经是枚举值的输入', () => {
      expect(normalizeDatingIntent('serious_dating')).toBe('serious_dating');
      expect(normalizeDatingIntent('casual_social')).toBe('casual_social');
      expect(normalizeDatingIntent('make_friends')).toBe('make_friends');
    });
  });

  describe('createOrUpdatePreference', () => {
    const validData = {
      ageMin: 22,
      ageMax: 35,
      datingIntent: '认真约会',
      occupationTypes: ['工程师'],
      personalityTraits: ['外向'],
    };

    it('应成功创建偏好设置并更新用户状态', async () => {
      const mockPreference = {
        id: 'pref-id',
        userId: 'user-id',
        ageMin: 22,
        ageMax: 35,
        datingIntent: 'serious_dating',
        occupationTypes: ['工程师'],
        personalityTraits: ['外向'],
      };

      mockPrisma.preference.upsert.mockResolvedValue(mockPreference);
      mockPrisma.user.update.mockResolvedValue({ id: 'user-id', status: 'preference_set' });

      const result = await createOrUpdatePreference('user-id', validData, {
        prismaClient: mockPrisma,
      });

      expect(result).toEqual(mockPreference);
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('应在校验失败时抛出 VALIDATION_ERROR', async () => {
      await expect(
        createOrUpdatePreference('user-id', { ageMin: 20 }, { prismaClient: mockPrisma })
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('应将中文交友意图转换为枚举值后保存', async () => {
      mockPrisma.preference.upsert.mockResolvedValue({});
      mockPrisma.user.update.mockResolvedValue({});

      await createOrUpdatePreference('user-id', validData, {
        prismaClient: mockPrisma,
      });

      const upsertCall = mockPrisma.preference.upsert.mock.calls[0][0];
      expect(upsertCall.create.datingIntent).toBe('serious_dating');
      expect(upsertCall.update.datingIntent).toBe('serious_dating');
    });

    it('应在未提供选填项时默认为空数组', async () => {
      mockPrisma.preference.upsert.mockResolvedValue({});
      mockPrisma.user.update.mockResolvedValue({});

      await createOrUpdatePreference(
        'user-id',
        { ageMin: 20, ageMax: 30, datingIntent: '交朋友' },
        { prismaClient: mockPrisma }
      );

      const upsertCall = mockPrisma.preference.upsert.mock.calls[0][0];
      expect(upsertCall.create.occupationTypes).toEqual([]);
      expect(upsertCall.create.personalityTraits).toEqual([]);
    });

    it('应使用 upsert 支持创建和更新', async () => {
      mockPrisma.preference.upsert.mockResolvedValue({});
      mockPrisma.user.update.mockResolvedValue({});

      await createOrUpdatePreference('user-id', validData, {
        prismaClient: mockPrisma,
      });

      const upsertCall = mockPrisma.preference.upsert.mock.calls[0][0];
      expect(upsertCall.where).toEqual({ userId: 'user-id' });
      expect(upsertCall.create.userId).toBe('user-id');
    });

    it('应在错误详情中包含所有校验错误', async () => {
      try {
        await createOrUpdatePreference(
          'user-id',
          { ageMin: 16, ageMax: 65, datingIntent: '无效' },
          { prismaClient: mockPrisma }
        );
        fail('应抛出错误');
      } catch (err) {
        expect(err.details.errors).toBeInstanceOf(Array);
        expect(err.details.errors.length).toBeGreaterThan(1);
      }
    });
  });
});
