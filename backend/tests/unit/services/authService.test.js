/**
 * authService 单元测试
 * 测试验证码发送服务的核心逻辑
 */
import { jest } from '@jest/globals';
import { sendVerificationCode, generateVerificationCode } from '../../../src/services/authService.js';
import { createMockPrismaClient, createMockResendClient } from '../../helpers/mockFactory.js';

describe('authService', () => {
  let mockPrisma;
  let mockResend;

  beforeEach(() => {
    mockPrisma = createMockPrismaClient();
    mockResend = createMockResendClient();
  });

  describe('generateVerificationCode', () => {
    it('应生成6位数字验证码', () => {
      const code = generateVerificationCode();
      expect(code).toMatch(/^\d{6}$/);
    });

    it('应生成100000-999999范围内的验证码', () => {
      for (let i = 0; i < 100; i++) {
        const code = generateVerificationCode();
        const num = parseInt(code, 10);
        expect(num).toBeGreaterThanOrEqual(100000);
        expect(num).toBeLessThanOrEqual(999999);
      }
    });
  });

  describe('sendVerificationCode', () => {
    it('应成功发送验证码', async () => {
      mockPrisma.verificationCode.count.mockResolvedValue(0);
      mockPrisma.verificationCode.findFirst.mockResolvedValue(null);
      mockPrisma.verificationCode.create.mockResolvedValue({
        id: 'test-id',
        email: 'test@example.com',
        code: '123456',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      });

      const result = await sendVerificationCode('test@example.com', {
        prismaClient: mockPrisma,
        resendClient: mockResend,
      });

      expect(result.message).toBe('验证码已发送');
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(mockPrisma.verificationCode.create).toHaveBeenCalledTimes(1);
      expect(mockResend.emails.send).toHaveBeenCalledTimes(1);
    });

    it('应在10分钟内请求超过5次时拒绝', async () => {
      mockPrisma.verificationCode.count.mockResolvedValue(5);

      await expect(
        sendVerificationCode('test@example.com', {
          prismaClient: mockPrisma,
          resendClient: mockResend,
        })
      ).rejects.toMatchObject({
        statusCode: 429,
        code: 'RATE_LIMIT_EXCEEDED',
      });

      expect(mockPrisma.verificationCode.create).not.toHaveBeenCalled();
      expect(mockResend.emails.send).not.toHaveBeenCalled();
    });

    it('应在60秒内重复请求时返回已有验证码信息（幂等性）', async () => {
      const existingExpiry = new Date(Date.now() + 4 * 60 * 1000);
      mockPrisma.verificationCode.count.mockResolvedValue(1);
      mockPrisma.verificationCode.findFirst.mockResolvedValue({
        id: 'existing-id',
        email: 'test@example.com',
        code: '654321',
        expiresAt: existingExpiry,
        isUsed: false,
        createdAt: new Date(),
      });

      const result = await sendVerificationCode('test@example.com', {
        prismaClient: mockPrisma,
        resendClient: mockResend,
      });

      expect(result.message).toBe('验证码已发送，请查收邮件');
      expect(result.expiresAt).toEqual(existingExpiry);
      expect(mockPrisma.verificationCode.create).not.toHaveBeenCalled();
      expect(mockResend.emails.send).not.toHaveBeenCalled();
    });

    it('应在邮件发送失败时抛出错误', async () => {
      mockPrisma.verificationCode.count.mockResolvedValue(0);
      mockPrisma.verificationCode.findFirst.mockResolvedValue(null);
      mockPrisma.verificationCode.create.mockResolvedValue({
        id: 'test-id',
        email: 'test@example.com',
        code: '123456',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      });
      mockResend.emails.send.mockResolvedValue({
        data: null,
        error: { message: 'Failed to send' },
      });

      await expect(
        sendVerificationCode('test@example.com', {
          prismaClient: mockPrisma,
          resendClient: mockResend,
        })
      ).rejects.toMatchObject({
        statusCode: 500,
        code: 'EMAIL_SEND_FAILED',
      });
    });

    it('应正确设置5分钟有效期', async () => {
      mockPrisma.verificationCode.count.mockResolvedValue(0);
      mockPrisma.verificationCode.findFirst.mockResolvedValue(null);
      mockPrisma.verificationCode.create.mockResolvedValue({
        id: 'test-id',
        email: 'test@example.com',
        code: '123456',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      });

      const before = Date.now();
      const result = await sendVerificationCode('test@example.com', {
        prismaClient: mockPrisma,
        resendClient: mockResend,
      });
      const after = Date.now();

      // 验证 create 调用中的 expiresAt 在5分钟范围内
      const createCall = mockPrisma.verificationCode.create.mock.calls[0][0];
      const expiresAtMs = createCall.data.expiresAt.getTime();
      expect(expiresAtMs).toBeGreaterThanOrEqual(before + 5 * 60 * 1000 - 1000);
      expect(expiresAtMs).toBeLessThanOrEqual(after + 5 * 60 * 1000 + 1000);
    });

    it('应正确调用 Resend 发送邮件', async () => {
      mockPrisma.verificationCode.count.mockResolvedValue(0);
      mockPrisma.verificationCode.findFirst.mockResolvedValue(null);
      mockPrisma.verificationCode.create.mockResolvedValue({
        id: 'test-id',
        email: 'user@test.com',
        code: '123456',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      });

      await sendVerificationCode('user@test.com', {
        prismaClient: mockPrisma,
        resendClient: mockResend,
      });

      const sendCall = mockResend.emails.send.mock.calls[0][0];
      expect(sendCall.to).toBe('user@test.com');
      expect(sendCall.subject).toBe('您的 Linker 验证码');
      expect(sendCall.html).toContain('验证码');
      expect(sendCall.html).toContain('5分钟内有效');
    });

    it('频率限制应检查10分钟时间窗口', async () => {
      mockPrisma.verificationCode.count.mockResolvedValue(0);
      mockPrisma.verificationCode.findFirst.mockResolvedValue(null);
      mockPrisma.verificationCode.create.mockResolvedValue({
        id: 'test-id',
        email: 'test@example.com',
        code: '123456',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      });

      await sendVerificationCode('test@example.com', {
        prismaClient: mockPrisma,
        resendClient: mockResend,
      });

      const countCall = mockPrisma.verificationCode.count.mock.calls[0][0];
      expect(countCall.where.email).toBe('test@example.com');
      expect(countCall.where.createdAt.gte).toBeInstanceOf(Date);

      // 验证时间窗口约为10分钟
      const windowMs = Date.now() - countCall.where.createdAt.gte.getTime();
      expect(windowMs).toBeGreaterThanOrEqual(9 * 60 * 1000);
      expect(windowMs).toBeLessThanOrEqual(11 * 60 * 1000);
    });

    it('应在10分钟内恰好4次请求时允许发送（需求 1.8 边界）', async () => {
      mockPrisma.verificationCode.count.mockResolvedValue(4);
      mockPrisma.verificationCode.findFirst.mockResolvedValue(null);
      mockPrisma.verificationCode.create.mockResolvedValue({
        id: 'test-id',
        email: 'test@example.com',
        code: '123456',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      });

      const result = await sendVerificationCode('test@example.com', {
        prismaClient: mockPrisma,
        resendClient: mockResend,
      });

      expect(result.message).toBe('验证码已发送');
      expect(mockPrisma.verificationCode.create).toHaveBeenCalledTimes(1);
    });

    it('应在60秒刚过后允许发送新验证码（幂等性边界）', async () => {
      // 60秒前的验证码不应触发幂等性，应发送新验证码
      mockPrisma.verificationCode.count.mockResolvedValue(1);
      mockPrisma.verificationCode.findFirst.mockResolvedValue(null); // 60秒内无记录
      mockPrisma.verificationCode.create.mockResolvedValue({
        id: 'new-id',
        email: 'test@example.com',
        code: '789012',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      });

      const result = await sendVerificationCode('test@example.com', {
        prismaClient: mockPrisma,
        resendClient: mockResend,
      });

      expect(result.message).toBe('验证码已发送');
      expect(mockPrisma.verificationCode.create).toHaveBeenCalledTimes(1);
      expect(mockResend.emails.send).toHaveBeenCalledTimes(1);
    });

    it('应在幂等性检查中只查找未使用的验证码', async () => {
      mockPrisma.verificationCode.count.mockResolvedValue(1);
      mockPrisma.verificationCode.findFirst.mockResolvedValue(null);
      mockPrisma.verificationCode.create.mockResolvedValue({
        id: 'test-id',
        email: 'test@example.com',
        code: '123456',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      });

      await sendVerificationCode('test@example.com', {
        prismaClient: mockPrisma,
        resendClient: mockResend,
      });

      const findFirstCall = mockPrisma.verificationCode.findFirst.mock.calls[0][0];
      expect(findFirstCall.where.isUsed).toBe(false);
      expect(findFirstCall.where.email).toBe('test@example.com');
      expect(findFirstCall.where.createdAt.gte).toBeInstanceOf(Date);
    });

    it('应在幂等性检查中使用60秒时间窗口', async () => {
      mockPrisma.verificationCode.count.mockResolvedValue(1);
      mockPrisma.verificationCode.findFirst.mockResolvedValue(null);
      mockPrisma.verificationCode.create.mockResolvedValue({
        id: 'test-id',
        email: 'test@example.com',
        code: '123456',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      });

      await sendVerificationCode('test@example.com', {
        prismaClient: mockPrisma,
        resendClient: mockResend,
      });

      const findFirstCall = mockPrisma.verificationCode.findFirst.mock.calls[0][0];
      const windowMs = Date.now() - findFirstCall.where.createdAt.gte.getTime();
      // 验证时间窗口约为60秒
      expect(windowMs).toBeGreaterThanOrEqual(59 * 1000);
      expect(windowMs).toBeLessThanOrEqual(61 * 1000);
    });
  });
});
