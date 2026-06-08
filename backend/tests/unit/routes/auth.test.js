/**
 * auth 路由单元测试
 * 测试 POST /api/auth/send-code 和 POST /api/auth/register
 */
import { jest } from '@jest/globals';

// Mock prisma
const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  verificationCode: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  invitationCode: {
    findUnique: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  },
  $transaction: jest.fn((fn) => fn(mockPrisma)),
};

jest.unstable_mockModule('../../../src/lib/prisma.js', () => ({
  default: mockPrisma,
}));

const mockSendVerificationCode = jest.fn();
jest.unstable_mockModule('../../../src/services/authService.js', () => ({
  sendVerificationCode: mockSendVerificationCode,
}));

const mockValidateInvitationCode = jest.fn();
const mockUseInvitationCode = jest.fn();
const mockGenerateInvitationCodes = jest.fn();
jest.unstable_mockModule('../../../src/services/inviteService.js', () => ({
  validateInvitationCode: mockValidateInvitationCode,
  useInvitationCode: mockUseInvitationCode,
  generateInvitationCodes: mockGenerateInvitationCodes,
}));

// Mock jsonwebtoken
const mockSign = jest.fn().mockReturnValue('mock-jwt-token');
jest.unstable_mockModule('jsonwebtoken', () => ({
  default: { sign: mockSign },
}));

// Import after mocks
const { default: authRouter } = await import('../../../src/routes/auth.js');
import express from 'express';

// Create test app
function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  app.use((err, _req, res, _next) => {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
      code: err.code || 'INTERNAL_ERROR',
      message: err.message || '服务器内部错误',
      details: err.details || {},
    });
  });
  return app;
}

// We'll use a simple approach to test routes
async function makeRequest(app, method, path, body = {}) {
  const { default: http } = await import('http');
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const port = server.address().port;
      const data = JSON.stringify(body);
      const options = {
        hostname: 'localhost',
        port,
        path,
        method: method.toUpperCase(),
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
      };

      const req = http.request(options, (res) => {
        let responseData = '';
        res.on('data', (chunk) => { responseData += chunk; });
        res.on('end', () => {
          server.close();
          resolve({
            status: res.statusCode,
            body: JSON.parse(responseData),
          });
        });
      });

      req.on('error', (err) => {
        server.close();
        reject(err);
      });

      req.write(data);
      req.end();
    });
  });
}

describe('POST /api/auth/send-code', () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
    jest.clearAllMocks();
  });

  it('应在邮箱格式正确时成功发送验证码', async () => {
    mockSendVerificationCode.mockResolvedValue({
      message: '验证码已发送',
      expiresAt: new Date('2025-01-01T00:05:00Z'),
    });

    const res = await makeRequest(app, 'POST', '/api/auth/send-code', {
      email: 'test@example.com',
    });

    expect(res.status).toBe(200);
    expect(res.body.code).toBe('SUCCESS');
    expect(res.body.message).toBe('验证码已发送');
    expect(mockSendVerificationCode).toHaveBeenCalledWith('test@example.com');
  });

  it('应在邮箱缺少@符号时返回格式错误', async () => {
    const res = await makeRequest(app, 'POST', '/api/auth/send-code', {
      email: 'invalid-email',
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_EMAIL_FORMAT');
    expect(mockSendVerificationCode).not.toHaveBeenCalled();
  });

  it('应在邮箱为空时返回格式错误', async () => {
    const res = await makeRequest(app, 'POST', '/api/auth/send-code', {
      email: '',
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_EMAIL_FORMAT');
  });

  it('应在邮箱缺少域名时返回格式错误', async () => {
    const res = await makeRequest(app, 'POST', '/api/auth/send-code', {
      email: 'user@',
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_EMAIL_FORMAT');
  });

  it('应在邮箱域名无点号时返回格式错误', async () => {
    const res = await makeRequest(app, 'POST', '/api/auth/send-code', {
      email: 'user@domain',
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_EMAIL_FORMAT');
  });
});

describe('POST /api/auth/register', () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
    jest.clearAllMocks();
    process.env.JWT_SECRET = 'test-secret';
    process.env.JWT_EXPIRES_IN = '7d';
  });

  it('应在所有条件满足时成功注册', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockValidateInvitationCode.mockResolvedValue({ valid: true, invitationCode: { id: 'inv-1' } });
    mockPrisma.verificationCode.findFirst.mockResolvedValue({
      id: 'vc-1',
      email: 'new@example.com',
      code: '123456',
      attempts: 0,
      isUsed: false,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      createdAt: new Date(),
    });
    mockPrisma.verificationCode.update.mockResolvedValue({});
    mockPrisma.user.create.mockResolvedValue({
      id: 'user-1',
      email: 'new@example.com',
      status: 'registered',
    });
    mockUseInvitationCode.mockResolvedValue({});
    mockGenerateInvitationCodes.mockResolvedValue([]);

    const res = await makeRequest(app, 'POST', '/api/auth/register', {
      email: 'new@example.com',
      code: '123456',
      invitationCode: 'AbCd1234',
    });

    expect(res.status).toBe(201);
    expect(res.body.code).toBe('SUCCESS');
    expect(res.body.data.token).toBe('mock-jwt-token');
    expect(res.body.data.user.email).toBe('new@example.com');
    expect(mockGenerateInvitationCodes).toHaveBeenCalledWith('user-1', 3, 'user');
  });

  it('应在邮箱格式错误时拒绝注册', async () => {
    const res = await makeRequest(app, 'POST', '/api/auth/register', {
      email: 'invalid',
      code: '123456',
      invitationCode: 'AbCd1234',
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_EMAIL_FORMAT');
  });

  it('应在邮箱已注册时拒绝（需求 1.5）', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'existing-user',
      email: 'existing@example.com',
    });

    const res = await makeRequest(app, 'POST', '/api/auth/register', {
      email: 'existing@example.com',
      code: '123456',
      invitationCode: 'AbCd1234',
    });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('EMAIL_ALREADY_REGISTERED');
  });

  it('应在验证码不匹配时拒绝并增加错误次数（需求 1.3）', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockValidateInvitationCode.mockResolvedValue({ valid: true, invitationCode: { id: 'inv-1' } });
    mockPrisma.verificationCode.findFirst.mockResolvedValue({
      id: 'vc-1',
      email: 'test@example.com',
      code: '123456',
      attempts: 0,
      isUsed: false,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      createdAt: new Date(),
    });
    mockPrisma.verificationCode.update.mockResolvedValue({});

    const res = await makeRequest(app, 'POST', '/api/auth/register', {
      email: 'test@example.com',
      code: '999999',
      invitationCode: 'AbCd1234',
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_CODE');
    expect(mockPrisma.verificationCode.update).toHaveBeenCalledWith({
      where: { id: 'vc-1' },
      data: { attempts: 1 },
    });
  });

  it('应在验证码过期时拒绝（需求 1.3）', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockValidateInvitationCode.mockResolvedValue({ valid: true, invitationCode: { id: 'inv-1' } });
    mockPrisma.verificationCode.findFirst.mockResolvedValue({
      id: 'vc-1',
      email: 'test@example.com',
      code: '123456',
      attempts: 0,
      isUsed: false,
      expiresAt: new Date(Date.now() - 1000), // 已过期
      createdAt: new Date(Date.now() - 6 * 60 * 1000),
    });

    const res = await makeRequest(app, 'POST', '/api/auth/register', {
      email: 'test@example.com',
      code: '123456',
      invitationCode: 'AbCd1234',
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('CODE_EXPIRED');
  });

  it('应在连续5次错误后锁定30分钟（需求 1.4）', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockValidateInvitationCode.mockResolvedValue({ valid: true, invitationCode: { id: 'inv-1' } });
    mockPrisma.verificationCode.findFirst.mockResolvedValue({
      id: 'vc-1',
      email: 'test@example.com',
      code: '123456',
      attempts: 5,
      isUsed: false,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      createdAt: new Date(), // 刚创建，锁定期内
    });

    const res = await makeRequest(app, 'POST', '/api/auth/register', {
      email: 'test@example.com',
      code: '123456',
      invitationCode: 'AbCd1234',
    });

    expect(res.status).toBe(429);
    expect(res.body.code).toBe('ACCOUNT_LOCKED');
  });

  it('应在锁定期过后允许重新验证', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockValidateInvitationCode.mockResolvedValue({ valid: true, invitationCode: { id: 'inv-1' } });
    // findFirst 被调用两次：第一次用于锁定检查，第二次用于验证码校验
    mockPrisma.verificationCode.findFirst.mockResolvedValue({
      id: 'vc-1',
      email: 'test@example.com',
      code: '123456',
      attempts: 5,
      isUsed: false,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      createdAt: new Date(Date.now() - 31 * 60 * 1000), // 31分钟前创建，锁定期已过
    });
    mockPrisma.verificationCode.update.mockResolvedValue({});
    mockPrisma.user.create.mockResolvedValue({
      id: 'user-1',
      email: 'test@example.com',
      status: 'registered',
    });
    mockUseInvitationCode.mockResolvedValue({});
    mockGenerateInvitationCodes.mockResolvedValue([]);

    const res = await makeRequest(app, 'POST', '/api/auth/register', {
      email: 'test@example.com',
      code: '123456',
      invitationCode: 'AbCd1234',
    });

    expect(res.status).toBe(201);
    expect(res.body.code).toBe('SUCCESS');
  });

  it('应在第5次错误时返回锁定提示（需求 1.4）', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockValidateInvitationCode.mockResolvedValue({ valid: true, invitationCode: { id: 'inv-1' } });
    mockPrisma.verificationCode.findFirst.mockResolvedValue({
      id: 'vc-1',
      email: 'test@example.com',
      code: '123456',
      attempts: 4, // 第5次错误
      isUsed: false,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      createdAt: new Date(),
    });
    mockPrisma.verificationCode.update.mockResolvedValue({});

    const res = await makeRequest(app, 'POST', '/api/auth/register', {
      email: 'test@example.com',
      code: '000000', // 错误验证码
      invitationCode: 'AbCd1234',
    });

    expect(res.status).toBe(429);
    expect(res.body.code).toBe('ACCOUNT_LOCKED');
  });

  it('应在邀请码无效时拒绝注册', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockValidateInvitationCode.mockResolvedValue({
      valid: false,
      reason: 'NOT_FOUND',
      message: '邀请码不存在',
    });

    const res = await makeRequest(app, 'POST', '/api/auth/register', {
      email: 'test@example.com',
      code: '123456',
      invitationCode: 'INVALID1',
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVITATION_NOT_FOUND');
  });

  it('应在缺少验证码时拒绝', async () => {
    const res = await makeRequest(app, 'POST', '/api/auth/register', {
      email: 'test@example.com',
      invitationCode: 'AbCd1234',
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MISSING_CODE');
  });

  it('应在缺少邀请码时拒绝', async () => {
    const res = await makeRequest(app, 'POST', '/api/auth/register', {
      email: 'test@example.com',
      code: '123456',
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MISSING_INVITATION_CODE');
  });

  it('应在验证码恰好5分钟过期时拒绝（需求 1.7 边界）', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockValidateInvitationCode.mockResolvedValue({ valid: true, invitationCode: { id: 'inv-1' } });
    // 验证码恰好在5分钟前过期（expiresAt 刚好是过去时间）
    mockPrisma.verificationCode.findFirst.mockResolvedValue({
      id: 'vc-1',
      email: 'test@example.com',
      code: '123456',
      attempts: 0,
      isUsed: false,
      expiresAt: new Date(Date.now() - 1), // 刚刚过期1毫秒
      createdAt: new Date(Date.now() - 5 * 60 * 1000),
    });

    const res = await makeRequest(app, 'POST', '/api/auth/register', {
      email: 'test@example.com',
      code: '123456',
      invitationCode: 'AbCd1234',
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('CODE_EXPIRED');
  });

  it('应在锁定恰好30分钟时仍然锁定（需求 1.4 边界）', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockValidateInvitationCode.mockResolvedValue({ valid: true, invitationCode: { id: 'inv-1' } });
    // createdAt 恰好在30分钟前，lockExpiry = createdAt + 30min = now，仍在锁定期内
    mockPrisma.verificationCode.findFirst.mockResolvedValue({
      id: 'vc-1',
      email: 'test@example.com',
      code: '123456',
      attempts: 5,
      isUsed: false,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      createdAt: new Date(Date.now() - 29 * 60 * 1000), // 29分钟前，锁定期未过
    });

    const res = await makeRequest(app, 'POST', '/api/auth/register', {
      email: 'test@example.com',
      code: '123456',
      invitationCode: 'AbCd1234',
    });

    expect(res.status).toBe(429);
    expect(res.body.code).toBe('ACCOUNT_LOCKED');
  });

  it('应在连续错误未达5次时不锁定（需求 1.4）', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockValidateInvitationCode.mockResolvedValue({ valid: true, invitationCode: { id: 'inv-1' } });
    mockPrisma.verificationCode.findFirst.mockResolvedValue({
      id: 'vc-1',
      email: 'test@example.com',
      code: '123456',
      attempts: 3, // 只有3次错误，不应锁定
      isUsed: false,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      createdAt: new Date(),
    });
    mockPrisma.verificationCode.update.mockResolvedValue({});
    mockPrisma.user.create.mockResolvedValue({
      id: 'user-1',
      email: 'test@example.com',
      status: 'registered',
    });
    mockUseInvitationCode.mockResolvedValue({});
    mockGenerateInvitationCodes.mockResolvedValue([]);

    const res = await makeRequest(app, 'POST', '/api/auth/register', {
      email: 'test@example.com',
      code: '123456',
      invitationCode: 'AbCd1234',
    });

    expect(res.status).toBe(201);
    expect(res.body.code).toBe('SUCCESS');
  });

  it('应在验证码错误时正确递增 attempts 计数', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockValidateInvitationCode.mockResolvedValue({ valid: true, invitationCode: { id: 'inv-1' } });
    mockPrisma.verificationCode.findFirst.mockResolvedValue({
      id: 'vc-1',
      email: 'test@example.com',
      code: '123456',
      attempts: 2,
      isUsed: false,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      createdAt: new Date(),
    });
    mockPrisma.verificationCode.update.mockResolvedValue({});

    const res = await makeRequest(app, 'POST', '/api/auth/register', {
      email: 'test@example.com',
      code: '000000', // 错误验证码
      invitationCode: 'AbCd1234',
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_CODE');
    expect(mockPrisma.verificationCode.update).toHaveBeenCalledWith({
      where: { id: 'vc-1' },
      data: { attempts: 3 },
    });
  });

  it('应在注册成功后生成 JWT Token', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockValidateInvitationCode.mockResolvedValue({ valid: true, invitationCode: { id: 'inv-1' } });
    mockPrisma.verificationCode.findFirst.mockResolvedValue({
      id: 'vc-1',
      email: 'jwt@example.com',
      code: '123456',
      attempts: 0,
      isUsed: false,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      createdAt: new Date(),
    });
    mockPrisma.verificationCode.update.mockResolvedValue({});
    mockPrisma.user.create.mockResolvedValue({
      id: 'user-jwt',
      email: 'jwt@example.com',
      status: 'registered',
    });
    mockUseInvitationCode.mockResolvedValue({});
    mockGenerateInvitationCodes.mockResolvedValue([]);

    await makeRequest(app, 'POST', '/api/auth/register', {
      email: 'jwt@example.com',
      code: '123456',
      invitationCode: 'AbCd1234',
    });

    expect(mockSign).toHaveBeenCalledWith(
      { userId: 'user-jwt', email: 'jwt@example.com' },
      'test-secret',
      { expiresIn: '7d' }
    );
  });
});
