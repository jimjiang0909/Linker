/**
 * profileService 单元测试
 * 测试资料管理服务的核心逻辑：字段校验和 Profile 创建/更新
 */
import { jest } from '@jest/globals';
import {
  createOrUpdateProfile,
  validateProfileFields,
} from '../../../src/services/profileService.js';
import { createMockPrismaClient } from '../../helpers/mockFactory.js';

describe('profileService', () => {
  let mockPrisma;
  const currentYear = new Date().getFullYear();

  beforeEach(() => {
    mockPrisma = createMockPrismaClient();
    // 模拟 $transaction 执行传入的回调
    mockPrisma.$transaction.mockImplementation(async (fn) => {
      return fn(mockPrisma);
    });
  });

  const validProfileData = {
    name: '张三',
    birthYear: currentYear - 25,
    gender: '男',
    occupation: '软件工程师',
    city: '北京',
    bio: '热爱生活，喜欢旅行',
  };

  describe('validateProfileFields', () => {
    it('应对有效数据返回空错误列表', () => {
      const errors = validateProfileFields(validProfileData);
      expect(errors).toEqual([]);
    });

    it('应检测缺失的必填字段', () => {
      const errors = validateProfileFields({});
      const errorFields = errors.map((e) => e.field);
      expect(errorFields).toContain('name');
      expect(errorFields).toContain('birthYear');
      expect(errorFields).toContain('gender');
      expect(errorFields).toContain('occupation');
      expect(errorFields).toContain('city');
    });

    it('应检测部分必填字段缺失并返回对应字段列表', () => {
      // 只提供 name 和 gender，缺少 birthYear、occupation、city
      const data = { name: '张三', gender: '男' };
      const errors = validateProfileFields(data);
      const errorFields = errors.map((e) => e.field);
      expect(errorFields).toContain('birthYear');
      expect(errorFields).toContain('occupation');
      expect(errorFields).toContain('city');
      expect(errorFields).not.toContain('name');
      expect(errorFields).not.toContain('gender');
    });

    it('应将空字符串视为必填字段缺失', () => {
      const data = {
        name: '',
        birthYear: '',
        gender: '',
        occupation: '',
        city: '',
      };
      const errors = validateProfileFields(data);
      const errorFields = errors.map((e) => e.field);
      expect(errorFields).toContain('name');
      expect(errorFields).toContain('birthYear');
      expect(errorFields).toContain('gender');
      expect(errorFields).toContain('occupation');
      expect(errorFields).toContain('city');
    });

    it('应将 null 值视为必填字段缺失', () => {
      const data = {
        name: null,
        birthYear: null,
        gender: null,
        occupation: null,
        city: null,
      };
      const errors = validateProfileFields(data);
      const errorFields = errors.map((e) => e.field);
      expect(errorFields).toContain('name');
      expect(errorFields).toContain('birthYear');
      expect(errorFields).toContain('gender');
      expect(errorFields).toContain('occupation');
      expect(errorFields).toContain('city');
    });

    it('应同时返回所有校验错误', () => {
      const data = {
        name: 'a'.repeat(21), // 超过20字符
        birthYear: currentYear - 10, // 年龄不足18
        gender: '未知', // 无效性别
        occupation: 'a'.repeat(31), // 超过30字符
        city: 'a'.repeat(31), // 超过30字符
        bio: 'a'.repeat(501), // 超过500字符
      };
      const errors = validateProfileFields(data);
      expect(errors.length).toBeGreaterThanOrEqual(6);
    });

    // 姓名校验
    it('应拒绝超过20字符的姓名', () => {
      const data = { ...validProfileData, name: 'a'.repeat(21) };
      const errors = validateProfileFields(data);
      expect(errors.some((e) => e.field === 'name')).toBe(true);
    });

    it('应接受恰好20字符的姓名', () => {
      const data = { ...validProfileData, name: 'a'.repeat(20) };
      const errors = validateProfileFields(data);
      expect(errors.some((e) => e.field === 'name')).toBe(false);
    });

    it('应接受1字符的姓名', () => {
      const data = { ...validProfileData, name: 'a' };
      const errors = validateProfileFields(data);
      expect(errors.some((e) => e.field === 'name')).toBe(false);
    });

    // 出生年份校验
    it('应拒绝年龄不足18岁的出生年份', () => {
      const data = { ...validProfileData, birthYear: currentYear - 17 };
      const errors = validateProfileFields(data);
      expect(errors.some((e) => e.field === 'birthYear')).toBe(true);
    });

    it('应拒绝年龄超过60岁的出生年份', () => {
      const data = { ...validProfileData, birthYear: currentYear - 61 };
      const errors = validateProfileFields(data);
      expect(errors.some((e) => e.field === 'birthYear')).toBe(true);
    });

    it('应接受恰好18岁的出生年份', () => {
      const data = { ...validProfileData, birthYear: currentYear - 18 };
      const errors = validateProfileFields(data);
      expect(errors.some((e) => e.field === 'birthYear')).toBe(false);
    });

    it('应接受恰好60岁的出生年份', () => {
      const data = { ...validProfileData, birthYear: currentYear - 60 };
      const errors = validateProfileFields(data);
      expect(errors.some((e) => e.field === 'birthYear')).toBe(false);
    });

    it('应拒绝非整数的出生年份', () => {
      const data = { ...validProfileData, birthYear: 1995.5 };
      const errors = validateProfileFields(data);
      expect(errors.some((e) => e.field === 'birthYear')).toBe(true);
    });

    // 性别校验
    it('应接受中文性别选项"男"', () => {
      const data = { ...validProfileData, gender: '男' };
      const errors = validateProfileFields(data);
      expect(errors.some((e) => e.field === 'gender')).toBe(false);
    });

    it('应接受中文性别选项"女"', () => {
      const data = { ...validProfileData, gender: '女' };
      const errors = validateProfileFields(data);
      expect(errors.some((e) => e.field === 'gender')).toBe(false);
    });

    it('应接受中文性别选项"其他"', () => {
      const data = { ...validProfileData, gender: '其他' };
      const errors = validateProfileFields(data);
      expect(errors.some((e) => e.field === 'gender')).toBe(false);
    });

    it('应接受英文性别选项"male"', () => {
      const data = { ...validProfileData, gender: 'male' };
      const errors = validateProfileFields(data);
      expect(errors.some((e) => e.field === 'gender')).toBe(false);
    });

    it('应接受英文性别选项"female"', () => {
      const data = { ...validProfileData, gender: 'female' };
      const errors = validateProfileFields(data);
      expect(errors.some((e) => e.field === 'gender')).toBe(false);
    });

    it('应接受英文性别选项"other"', () => {
      const data = { ...validProfileData, gender: 'other' };
      const errors = validateProfileFields(data);
      expect(errors.some((e) => e.field === 'gender')).toBe(false);
    });

    it('应拒绝无效的性别值', () => {
      const data = { ...validProfileData, gender: '未知' };
      const errors = validateProfileFields(data);
      expect(errors.some((e) => e.field === 'gender')).toBe(true);
    });

    // 职业校验
    it('应拒绝超过30字符的职业', () => {
      const data = { ...validProfileData, occupation: 'a'.repeat(31) };
      const errors = validateProfileFields(data);
      expect(errors.some((e) => e.field === 'occupation')).toBe(true);
    });

    it('应接受恰好30字符的职业', () => {
      const data = { ...validProfileData, occupation: 'a'.repeat(30) };
      const errors = validateProfileFields(data);
      expect(errors.some((e) => e.field === 'occupation')).toBe(false);
    });

    // 城市校验
    it('应拒绝超过30字符的城市', () => {
      const data = { ...validProfileData, city: 'a'.repeat(31) };
      const errors = validateProfileFields(data);
      expect(errors.some((e) => e.field === 'city')).toBe(true);
    });

    it('应接受恰好30字符的城市', () => {
      const data = { ...validProfileData, city: 'a'.repeat(30) };
      const errors = validateProfileFields(data);
      expect(errors.some((e) => e.field === 'city')).toBe(false);
    });

    // 自我介绍校验
    it('应拒绝超过500字符的自我介绍', () => {
      const data = { ...validProfileData, bio: 'a'.repeat(501) };
      const errors = validateProfileFields(data);
      expect(errors.some((e) => e.field === 'bio')).toBe(true);
    });

    it('应接受恰好500字符的自我介绍', () => {
      const data = { ...validProfileData, bio: 'a'.repeat(500) };
      const errors = validateProfileFields(data);
      expect(errors.some((e) => e.field === 'bio')).toBe(false);
    });

    it('应允许自我介绍为空（选填字段）', () => {
      const data = { ...validProfileData };
      delete data.bio;
      const errors = validateProfileFields(data);
      expect(errors.some((e) => e.field === 'bio')).toBe(false);
    });
  });

  describe('createOrUpdateProfile', () => {
    it('应成功创建 Profile 并更新用户状态', async () => {
      const mockProfile = {
        id: 'profile-id',
        userId: 'user-id',
        ...validProfileData,
        gender: 'male',
      };
      mockPrisma.profile.upsert.mockResolvedValue(mockProfile);
      mockPrisma.user.update.mockResolvedValue({ id: 'user-id', status: 'profile_completed' });

      const result = await createOrUpdateProfile('user-id', validProfileData, {
        prismaClient: mockPrisma,
      });

      expect(result).toEqual(mockProfile);
      expect(mockPrisma.profile.upsert).toHaveBeenCalledWith({
        where: { userId: 'user-id' },
        create: expect.objectContaining({
          userId: 'user-id',
          name: '张三',
          birthYear: currentYear - 25,
          gender: 'male',
          occupation: '软件工程师',
          city: '北京',
          bio: '热爱生活，喜欢旅行',
        }),
        update: expect.objectContaining({
          name: '张三',
          gender: 'male',
        }),
      });
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-id' },
        data: { status: 'profile_completed' },
      });
    });

    it('应在校验失败时抛出 VALIDATION_ERROR', async () => {
      const invalidData = { name: '', gender: '未知' };

      await expect(
        createOrUpdateProfile('user-id', invalidData, { prismaClient: mockPrisma })
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });

      expect(mockPrisma.profile.upsert).not.toHaveBeenCalled();
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('应在必填字段缺失时返回包含缺失字段列表的错误详情', async () => {
      // 只提供 name，缺少其他必填字段
      const incompleteData = { name: '张三' };

      try {
        await createOrUpdateProfile('user-id', incompleteData, { prismaClient: mockPrisma });
        expect(true).toBe(false); // 不应到达这里
      } catch (err) {
        expect(err.statusCode).toBe(400);
        expect(err.code).toBe('VALIDATION_ERROR');
        const errorFields = err.details.errors.map((e) => e.field);
        expect(errorFields).toContain('birthYear');
        expect(errorFields).toContain('gender');
        expect(errorFields).toContain('occupation');
        expect(errorFields).toContain('city');
        // name 已提供，不应在错误列表中
        expect(errorFields).not.toContain('name');
      }
    });

    it('应在校验失败时返回所有错误详情', async () => {
      const invalidData = {
        name: 'a'.repeat(21),
        birthYear: currentYear - 10,
        gender: '未知',
        occupation: 'a'.repeat(31),
        city: 'a'.repeat(31),
        bio: 'a'.repeat(501),
      };

      try {
        await createOrUpdateProfile('user-id', invalidData, { prismaClient: mockPrisma });
        expect(true).toBe(false); // 不应到达这里
      } catch (err) {
        expect(err.details.errors.length).toBeGreaterThanOrEqual(6);
      }
    });

    it('应将中文性别"女"转换为英文枚举"female"', async () => {
      const data = { ...validProfileData, gender: '女' };
      const mockProfile = { id: 'profile-id', userId: 'user-id', ...data, gender: 'female' };
      mockPrisma.profile.upsert.mockResolvedValue(mockProfile);
      mockPrisma.user.update.mockResolvedValue({ id: 'user-id', status: 'profile_completed' });

      await createOrUpdateProfile('user-id', data, { prismaClient: mockPrisma });

      const upsertCall = mockPrisma.profile.upsert.mock.calls[0][0];
      expect(upsertCall.create.gender).toBe('female');
      expect(upsertCall.update.gender).toBe('female');
    });

    it('应将中文性别"其他"转换为英文枚举"other"', async () => {
      const data = { ...validProfileData, gender: '其他' };
      const mockProfile = { id: 'profile-id', userId: 'user-id', ...data, gender: 'other' };
      mockPrisma.profile.upsert.mockResolvedValue(mockProfile);
      mockPrisma.user.update.mockResolvedValue({ id: 'user-id', status: 'profile_completed' });

      await createOrUpdateProfile('user-id', data, { prismaClient: mockPrisma });

      const upsertCall = mockPrisma.profile.upsert.mock.calls[0][0];
      expect(upsertCall.create.gender).toBe('other');
    });

    it('应在 bio 为空时保存为 null', async () => {
      const data = { ...validProfileData };
      delete data.bio;
      const mockProfile = { id: 'profile-id', userId: 'user-id', ...data, gender: 'male', bio: null };
      mockPrisma.profile.upsert.mockResolvedValue(mockProfile);
      mockPrisma.user.update.mockResolvedValue({ id: 'user-id', status: 'profile_completed' });

      await createOrUpdateProfile('user-id', data, { prismaClient: mockPrisma });

      const upsertCall = mockPrisma.profile.upsert.mock.calls[0][0];
      expect(upsertCall.create.bio).toBeNull();
      expect(upsertCall.update.bio).toBeNull();
    });

    it('应使用事务确保原子性', async () => {
      const mockProfile = { id: 'profile-id', userId: 'user-id' };
      mockPrisma.profile.upsert.mockResolvedValue(mockProfile);
      mockPrisma.user.update.mockResolvedValue({ id: 'user-id', status: 'profile_completed' });

      await createOrUpdateProfile('user-id', validProfileData, { prismaClient: mockPrisma });

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });
});
