/**
 * 邀请码服务单元测试
 */
import { jest } from '@jest/globals';

// Mock prisma
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

jest.unstable_mockModule('../../../src/lib/prisma.js', () => ({
  default: mockPrisma,
}));

const { generateInvitationCodes, validateInvitationCode, useInvitationCode } =
  await import('../../../src/services/inviteService.js');

describe('InviteService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateInvitationCodes', () => {
    it('应为用户生成指定数量的邀请码', async () => {
      mockPrisma.invitationCode.findUnique.mockResolvedValue(null);
      mockPrisma.invitationCode.create.mockImplementation(({ data }) => ({
        id: 'mock-id',
        ...data,
        createdAt: new Date(),
      }));

      const codes = await generateInvitationCodes('user-123', 3, 'user');

      expect(codes).toHaveLength(3);
      expect(mockPrisma.invitationCode.create).toHaveBeenCalledTimes(3);
    });

    it('生成的邀请码应为8位字母数字组合', async () => {
      mockPrisma.invitationCode.findUnique.mockResolvedValue(null);
      mockPrisma.invitationCode.create.mockImplementation(({ data }) => ({
        id: 'mock-id',
        ...data,
        createdAt: new Date(),
      }));

      const codes = await generateInvitationCodes('user-123', 1, 'user');

      expect(codes[0].code).toMatch(/^[A-Za-z0-9]{8}$/);
    });

    it('生成的邀请码有效期应为30天', async () => {
      mockPrisma.invitationCode.findUnique.mockResolvedValue(null);
      mockPrisma.invitationCode.create.mockImplementation(({ data }) => ({
        id: 'mock-id',
        ...data,
        createdAt: new Date(),
      }));

      const now = new Date();
      const codes = await generateInvitationCodes('user-123', 1, 'user');

      const expiresAt = codes[0].expiresAt;
      const diffDays = Math.round((expiresAt - now) / (1000 * 60 * 60 * 24));
      expect(diffDays).toBe(30);
    });

    it('应正确设置 source 字段', async () => {
      mockPrisma.invitationCode.findUnique.mockResolvedValue(null);
      mockPrisma.invitationCode.create.mockImplementation(({ data }) => ({
        id: 'mock-id',
        ...data,
        createdAt: new Date(),
      }));

      await generateInvitationCodes('user-123', 1, 'system');

      expect(mockPrisma.invitationCode.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ source: 'system' }),
        })
      );
    });

    it('当生成的邀请码已存在时应重新生成', async () => {
      // 第一次查询返回已存在，第二次返回不存在
      mockPrisma.invitationCode.findUnique
        .mockResolvedValueOnce({ code: 'existing1' })
        .mockResolvedValueOnce(null);
      mockPrisma.invitationCode.create.mockImplementation(({ data }) => ({
        id: 'mock-id',
        ...data,
        createdAt: new Date(),
      }));

      const codes = await generateInvitationCodes('user-123', 1, 'user');

      expect(codes).toHaveLength(1);
      expect(mockPrisma.invitationCode.findUnique).toHaveBeenCalledTimes(2);
    });
  });

  describe('validateInvitationCode', () => {
    it('格式不正确时应返回 INVALID_FORMAT', async () => {
      const result = await validateInvitationCode('short');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('INVALID_FORMAT');
    });

    it('包含特殊字符时应返回 INVALID_FORMAT', async () => {
      const result = await validateInvitationCode('abc!@#$%');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('INVALID_FORMAT');
    });

    it('空字符串应返回 INVALID_FORMAT', async () => {
      const result = await validateInvitationCode('');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('INVALID_FORMAT');
    });

    it('null 应返回 INVALID_FORMAT', async () => {
      const result = await validateInvitationCode(null);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('INVALID_FORMAT');
    });

    it('邀请码不存在时应返回 NOT_FOUND', async () => {
      mockPrisma.invitationCode.findUnique.mockResolvedValue(null);

      const result = await validateInvitationCode('AbCd1234');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('NOT_FOUND');
    });

    it('邀请码已使用时应返回 ALREADY_USED', async () => {
      mockPrisma.invitationCode.findUnique.mockResolvedValue({
        code: 'AbCd1234',
        usedById: 'some-user-id',
        expiresAt: new Date(Date.now() + 86400000),
      });

      const result = await validateInvitationCode('AbCd1234');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('ALREADY_USED');
    });

    it('邀请码已过期时应返回 EXPIRED', async () => {
      mockPrisma.invitationCode.findUnique.mockResolvedValue({
        code: 'AbCd1234',
        usedById: null,
        expiresAt: new Date(Date.now() - 86400000), // 过期1天
      });

      const result = await validateInvitationCode('AbCd1234');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('EXPIRED');
    });

    it('有效邀请码应返回 valid: true', async () => {
      const mockCode = {
        id: 'code-id',
        code: 'AbCd1234',
        ownerId: 'owner-id',
        usedById: null,
        expiresAt: new Date(Date.now() + 86400000 * 15), // 15天后过期
        createdAt: new Date(),
      };
      mockPrisma.invitationCode.findUnique.mockResolvedValue(mockCode);

      const result = await validateInvitationCode('AbCd1234');
      expect(result.valid).toBe(true);
      expect(result.invitationCode).toEqual(mockCode);
    });
  });

  describe('注册后生成邀请码 (需求 8.3)', () => {
    it('注册后应生成恰好3个邀请码', async () => {
      mockPrisma.invitationCode.findUnique.mockResolvedValue(null);
      mockPrisma.invitationCode.create.mockImplementation(({ data }) => ({
        id: `mock-id-${Date.now()}-${Math.random()}`,
        ...data,
        createdAt: new Date(),
      }));

      const codes = await generateInvitationCodes('new-user-id', 3, 'user');

      expect(codes).toHaveLength(3);
    });

    it('注册后生成的3个邀请码应各自为8位字母数字组合', async () => {
      mockPrisma.invitationCode.findUnique.mockResolvedValue(null);
      mockPrisma.invitationCode.create.mockImplementation(({ data }) => ({
        id: `mock-id-${Date.now()}-${Math.random()}`,
        ...data,
        createdAt: new Date(),
      }));

      const codes = await generateInvitationCodes('new-user-id', 3, 'user');

      codes.forEach((code) => {
        expect(code.code).toMatch(/^[A-Za-z0-9]{8}$/);
      });
    });

    it('注册后生成的3个邀请码有效期均为30天', async () => {
      mockPrisma.invitationCode.findUnique.mockResolvedValue(null);
      mockPrisma.invitationCode.create.mockImplementation(({ data }) => ({
        id: `mock-id-${Date.now()}-${Math.random()}`,
        ...data,
        createdAt: new Date(),
      }));

      const now = new Date();
      const codes = await generateInvitationCodes('new-user-id', 3, 'user');

      codes.forEach((code) => {
        const diffDays = Math.round((code.expiresAt - now) / (1000 * 60 * 60 * 24));
        expect(diffDays).toBe(30);
      });
    });

    it('注册后生成的3个邀请码初始状态为未使用（source 为 user）', async () => {
      mockPrisma.invitationCode.findUnique.mockResolvedValue(null);
      mockPrisma.invitationCode.create.mockImplementation(({ data }) => ({
        id: `mock-id-${Date.now()}-${Math.random()}`,
        ...data,
        usedById: null,
        usedAt: null,
        createdAt: new Date(),
      }));

      const codes = await generateInvitationCodes('new-user-id', 3, 'user');

      codes.forEach((code) => {
        expect(code.usedById).toBeNull();
        expect(code.usedAt).toBeNull();
      });

      // 验证 source 为 user
      const createCalls = mockPrisma.invitationCode.create.mock.calls;
      createCalls.forEach((call) => {
        expect(call[0].data.source).toBe('user');
      });
    });
  });

  describe('邀请码格式校验边界情况 (需求 8.1)', () => {
    it('7位字母数字应返回 INVALID_FORMAT', async () => {
      const result = await validateInvitationCode('AbCd123');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('INVALID_FORMAT');
    });

    it('9位字母数字应返回 INVALID_FORMAT', async () => {
      const result = await validateInvitationCode('AbCd12345');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('INVALID_FORMAT');
    });

    it('8位但包含空格应返回 INVALID_FORMAT', async () => {
      const result = await validateInvitationCode('AbCd 234');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('INVALID_FORMAT');
    });

    it('8位但包含中文字符应返回 INVALID_FORMAT', async () => {
      const result = await validateInvitationCode('AbCd12中文');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('INVALID_FORMAT');
    });

    it('undefined 应返回 INVALID_FORMAT', async () => {
      const result = await validateInvitationCode(undefined);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('INVALID_FORMAT');
    });
  });

  describe('useInvitationCode', () => {
    it('使用有效邀请码应标记为已使用并记录邀请关系', async () => {
      const mockCode = {
        id: 'code-id',
        code: 'AbCd1234',
        ownerId: 'owner-id',
        usedById: null,
        expiresAt: new Date(Date.now() + 86400000 * 15),
        createdAt: new Date(),
      };
      mockPrisma.invitationCode.findUnique.mockResolvedValue(mockCode);
      mockPrisma.invitationCode.update.mockResolvedValue({
        ...mockCode,
        usedById: 'new-user-id',
        usedAt: new Date(),
      });
      mockPrisma.user.update.mockResolvedValue({});

      const result = await useInvitationCode('AbCd1234', 'new-user-id');

      expect(mockPrisma.invitationCode.update).toHaveBeenCalledWith({
        where: { code: 'AbCd1234' },
        data: expect.objectContaining({
          usedById: 'new-user-id',
          usedAt: expect.any(Date),
        }),
      });
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'new-user-id' },
        data: { invitedBy: 'owner-id' },
      });
    });

    it('使用无效邀请码应抛出 AppError', async () => {
      mockPrisma.invitationCode.findUnique.mockResolvedValue(null);

      await expect(useInvitationCode('AbCd1234', 'user-id')).rejects.toThrow();
    });

    it('使用已使用的邀请码应抛出 AppError', async () => {
      mockPrisma.invitationCode.findUnique.mockResolvedValue({
        code: 'AbCd1234',
        usedById: 'another-user',
        expiresAt: new Date(Date.now() + 86400000),
      });

      await expect(useInvitationCode('AbCd1234', 'user-id')).rejects.toThrow();
    });

    it('使用过期邀请码应抛出 AppError', async () => {
      mockPrisma.invitationCode.findUnique.mockResolvedValue({
        code: 'AbCd1234',
        usedById: null,
        expiresAt: new Date(Date.now() - 86400000),
      });

      await expect(useInvitationCode('AbCd1234', 'user-id')).rejects.toThrow();
    });

    it('邀请码使用后应立即标记为已使用，后续使用被拒绝 (需求 8.4)', async () => {
      const mockCode = {
        id: 'code-id',
        code: 'AbCd1234',
        ownerId: 'owner-id',
        usedById: null,
        expiresAt: new Date(Date.now() + 86400000 * 15),
        createdAt: new Date(),
      };

      // 第一次使用：邀请码有效
      mockPrisma.invitationCode.findUnique.mockResolvedValueOnce(mockCode);
      mockPrisma.invitationCode.update.mockResolvedValueOnce({
        ...mockCode,
        usedById: 'first-user',
        usedAt: new Date(),
      });
      mockPrisma.user.update.mockResolvedValueOnce({});

      await useInvitationCode('AbCd1234', 'first-user');

      // 第二次使用：邀请码已被标记为已使用
      mockPrisma.invitationCode.findUnique.mockResolvedValueOnce({
        ...mockCode,
        usedById: 'first-user',
        usedAt: new Date(),
      });

      await expect(useInvitationCode('AbCd1234', 'second-user')).rejects.toThrow();
    });
  });
});
