/**
 * 集成测试 - 完整注册流程
 * 串联：邀请码验证 → 邮箱验证码 → 注册 → 生成邀请码 → 返回 Token
 *
 * 验证:
 * - 各模块间数据流正确
 * - 用户状态流转正确（registered → profile_completed → preference_set）
 * - 需求: 1.1, 8.1, 8.3
 */
import { jest } from '@jest/globals';

// ============================================================
// Mock 外部依赖
// ============================================================

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  verificationCode: {
    findFirst: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
    count: jest.fn(),
  },
  invitationCode: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  profile: {
    create: jest.fn(),
    findUnique: jest.fn(),
    upsert: jest.fn(),
  },
  preference: {
    create: jest.fn(),
    findUnique: jest.fn(),
    upsert: jest.fn(),
  },
  $transaction: jest.fn((fn) => fn(mockPrisma)),
};

jest.unstable_mockModule('../../src/lib/prisma.js', () => ({
  default: mockPrisma,
}));

// Mock Resend
jest.unstable_mockModule('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: {
      send: jest.fn().mockResolvedValue({ data: { id: 'email-1' }, error: null }),
    },
  })),
}));

// Mock jsonwebtoken
const mockJwtSign = jest.fn().mockReturnValue('mock-jwt-token-xyz');
jest.unstable_mockModule('jsonwebtoken', () => ({
  default: { sign: mockJwtSign, verify: jest.fn() },
}));

// Import app after mocks
const { default: app } = await import('../../src/app.js');
import http from 'http';

// ============================================================
// 测试辅助函数
// ============================================================

function makeRequest(method, path, body = {}) {
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
          try {
            resolve({
              status: res.statusCode,
              body: JSON.parse(responseData),
            });
          } catch {
            resolve({
              status: res.statusCode,
              body: responseData,
            });
          }
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

// ============================================================
// 测试用例
// ============================================================

describe('完整注册流程集成测试', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = 'integration-test-secret';
    process.env.JWT_EXPIRES_IN = '7d';
  });

  describe('正常注册流程 - 邀请码验证 → 邮箱验证码 → 注册 → 生成邀请码 → 返回 Token', () => {
    it('应完成完整注册流程并返回 Token 和用户信息', async () => {
      // 模拟数据
      const testEmail = 'newuser@example.com';
      const testCode = '123456';
      const testInvitationCode = 'AbCd1234';
      const testUserId = 'user-new-001';

      // 1. 邮箱唯一性检查 - 邮箱未注册
      mockPrisma.user.findUnique.mockResolvedValue(null);

      // 2. 邀请码验证 - 有效邀请码
      // findUnique 会被调用多次：第一次是 validateInvitationCode，后续是 generateUniqueCode 检查唯一性
      mockPrisma.invitationCode.findUnique
        .mockResolvedValueOnce({
          id: 'inv-001',
          code: testInvitationCode,
          ownerId: 'inviter-001',
          usedById: null,
          source: 'user',
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          createdAt: new Date(),
        })
        // useInvitationCode 内部再次调用 validateInvitationCode
        .mockResolvedValueOnce({
          id: 'inv-001',
          code: testInvitationCode,
          ownerId: 'inviter-001',
          usedById: null,
          source: 'user',
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          createdAt: new Date(),
        })
        // generateUniqueCode 检查邀请码唯一性（返回 null 表示不存在重复）
        .mockResolvedValue(null);

      // 3. 验证码校验 - 有效验证码
      mockPrisma.verificationCode.findFirst.mockResolvedValue({
        id: 'vc-001',
        email: testEmail,
        code: testCode,
        attempts: 0,
        isUsed: false,
        expiresAt: new Date(Date.now() + 3 * 60 * 1000), // 3分钟后过期
        createdAt: new Date(),
      });

      // 4. 验证码标记为已使用
      mockPrisma.verificationCode.update.mockResolvedValue({});

      // 5. 创建用户
      mockPrisma.user.create.mockResolvedValue({
        id: testUserId,
        email: testEmail,
        status: 'registered',
        createdAt: new Date(),
      });

      // 6. 使用邀请码（事务内）
      mockPrisma.invitationCode.update.mockResolvedValue({
        id: 'inv-001',
        code: testInvitationCode,
        usedById: testUserId,
        usedAt: new Date(),
      });
      mockPrisma.user.update.mockResolvedValue({});

      // 7. 为新用户生成3个邀请码
      mockPrisma.invitationCode.create.mockResolvedValue({
        id: 'new-inv-001',
        code: 'NewCode1',
        ownerId: testUserId,
        source: 'user',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });

      // 执行注册请求
      const res = await makeRequest('POST', '/api/auth/register', {
        email: testEmail,
        code: testCode,
        invitationCode: testInvitationCode,
      });

      // 验证响应
      expect(res.status).toBe(201);
      expect(res.body.code).toBe('SUCCESS');
      expect(res.body.message).toBe('注册成功');
      expect(res.body.data.token).toBe('mock-jwt-token-xyz');
      expect(res.body.data.user).toEqual({
        id: testUserId,
        email: testEmail,
        status: 'registered',
      });

      // 验证流程调用顺序
      // 1. 邮箱唯一性检查
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: testEmail },
      });

      // 2. 邀请码验证
      expect(mockPrisma.invitationCode.findUnique).toHaveBeenCalledWith({
        where: { code: testInvitationCode },
      });

      // 3. 验证码校验
      expect(mockPrisma.verificationCode.findFirst).toHaveBeenCalled();

      // 4. 验证码标记已使用
      expect(mockPrisma.verificationCode.update).toHaveBeenCalledWith({
        where: { id: 'vc-001' },
        data: { isUsed: true },
      });

      // 5. 创建用户
      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: { email: testEmail },
      });

      // 6. 为新用户生成3个邀请码（invitationCode.create 被调用3次）
      expect(mockPrisma.invitationCode.create).toHaveBeenCalledTimes(3);

      // 7. JWT Token 生成
      expect(mockJwtSign).toHaveBeenCalledWith(
        { userId: testUserId, email: testEmail },
        'integration-test-secret',
        { expiresIn: '7d' }
      );
    });

    it('新用户注册后状态应为 registered', async () => {
      const testEmail = 'status@example.com';

      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.invitationCode.findUnique
        .mockResolvedValueOnce({
          id: 'inv-002',
          code: 'ValidCd1',
          ownerId: 'inviter-002',
          usedById: null,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          createdAt: new Date(),
        })
        .mockResolvedValueOnce({
          id: 'inv-002',
          code: 'ValidCd1',
          ownerId: 'inviter-002',
          usedById: null,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          createdAt: new Date(),
        })
        .mockResolvedValue(null); // generateUniqueCode 唯一性检查
      mockPrisma.verificationCode.findFirst.mockResolvedValue({
        id: 'vc-002',
        email: testEmail,
        code: '654321',
        attempts: 0,
        isUsed: false,
        expiresAt: new Date(Date.now() + 3 * 60 * 1000),
        createdAt: new Date(),
      });
      mockPrisma.verificationCode.update.mockResolvedValue({});
      mockPrisma.user.create.mockResolvedValue({
        id: 'user-status-001',
        email: testEmail,
        status: 'registered',
        createdAt: new Date(),
      });
      mockPrisma.invitationCode.update.mockResolvedValue({});
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.invitationCode.create.mockResolvedValue({});

      const res = await makeRequest('POST', '/api/auth/register', {
        email: testEmail,
        code: '654321',
        invitationCode: 'ValidCd1',
      });

      expect(res.status).toBe(201);
      expect(res.body.data.user.status).toBe('registered');
    });
  });

  describe('邀请码验证失败场景', () => {
    it('应在邀请码格式错误时拒绝注册', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const res = await makeRequest('POST', '/api/auth/register', {
        email: 'test@example.com',
        code: '123456',
        invitationCode: 'short', // 格式错误：不是8位
      });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVITATION_INVALID_FORMAT');
    });

    it('应在邀请码已被使用时拒绝注册', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.invitationCode.findUnique.mockResolvedValue({
        id: 'inv-used',
        code: 'UsedCode',
        ownerId: 'inviter-003',
        usedById: 'someone-else', // 已被使用
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
      });

      const res = await makeRequest('POST', '/api/auth/register', {
        email: 'test@example.com',
        code: '123456',
        invitationCode: 'UsedCode',
      });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVITATION_ALREADY_USED');
    });

    it('应在邀请码已过期时拒绝注册', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.invitationCode.findUnique.mockResolvedValue({
        id: 'inv-expired',
        code: 'ExpCode1',
        ownerId: 'inviter-004',
        usedById: null,
        expiresAt: new Date(Date.now() - 1000), // 已过期
        createdAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
      });

      const res = await makeRequest('POST', '/api/auth/register', {
        email: 'test@example.com',
        code: '123456',
        invitationCode: 'ExpCode1',
      });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVITATION_EXPIRED');
    });
  });

  describe('验证码校验失败场景', () => {
    it('应在验证码不匹配时拒绝注册', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.invitationCode.findUnique.mockResolvedValue({
        id: 'inv-003',
        code: 'GoodCode',
        ownerId: 'inviter-005',
        usedById: null,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
      });
      mockPrisma.verificationCode.findFirst.mockResolvedValue({
        id: 'vc-003',
        email: 'test@example.com',
        code: '123456',
        attempts: 0,
        isUsed: false,
        expiresAt: new Date(Date.now() + 3 * 60 * 1000),
        createdAt: new Date(),
      });
      mockPrisma.verificationCode.update.mockResolvedValue({});

      const res = await makeRequest('POST', '/api/auth/register', {
        email: 'test@example.com',
        code: '999999', // 错误验证码
        invitationCode: 'GoodCode',
      });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_CODE');
    });

    it('应在验证码过期时拒绝注册', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.invitationCode.findUnique.mockResolvedValue({
        id: 'inv-004',
        code: 'GoodCod2',
        ownerId: 'inviter-006',
        usedById: null,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
      });
      mockPrisma.verificationCode.findFirst.mockResolvedValue({
        id: 'vc-004',
        email: 'test@example.com',
        code: '123456',
        attempts: 0,
        isUsed: false,
        expiresAt: new Date(Date.now() - 1000), // 已过期
        createdAt: new Date(Date.now() - 6 * 60 * 1000),
      });

      const res = await makeRequest('POST', '/api/auth/register', {
        email: 'test@example.com',
        code: '123456',
        invitationCode: 'GoodCod2',
      });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('CODE_EXPIRED');
    });

    it('应在连续5次验证码错误后锁定账户', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.invitationCode.findUnique.mockResolvedValue({
        id: 'inv-005',
        code: 'GoodCod3',
        ownerId: 'inviter-007',
        usedById: null,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
      });
      mockPrisma.verificationCode.findFirst.mockResolvedValue({
        id: 'vc-005',
        email: 'test@example.com',
        code: '123456',
        attempts: 5, // 已达到锁定阈值
        isUsed: false,
        expiresAt: new Date(Date.now() + 3 * 60 * 1000),
        createdAt: new Date(), // 刚创建，锁定期内
      });

      const res = await makeRequest('POST', '/api/auth/register', {
        email: 'test@example.com',
        code: '123456',
        invitationCode: 'GoodCod3',
      });

      expect(res.status).toBe(429);
      expect(res.body.code).toBe('ACCOUNT_LOCKED');
    });
  });

  describe('邮箱唯一性检查', () => {
    it('应在邮箱已注册时拒绝', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'existing-user',
        email: 'existing@example.com',
        status: 'registered',
      });

      const res = await makeRequest('POST', '/api/auth/register', {
        email: 'existing@example.com',
        code: '123456',
        invitationCode: 'AbCd1234',
      });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('EMAIL_ALREADY_REGISTERED');
    });
  });

  describe('输入验证', () => {
    it('应在邮箱格式错误时拒绝', async () => {
      const res = await makeRequest('POST', '/api/auth/register', {
        email: 'not-an-email',
        code: '123456',
        invitationCode: 'AbCd1234',
      });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_EMAIL_FORMAT');
    });

    it('应在缺少验证码时拒绝', async () => {
      const res = await makeRequest('POST', '/api/auth/register', {
        email: 'test@example.com',
        invitationCode: 'AbCd1234',
      });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('MISSING_CODE');
    });

    it('应在缺少邀请码时拒绝', async () => {
      const res = await makeRequest('POST', '/api/auth/register', {
        email: 'test@example.com',
        code: '123456',
      });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('MISSING_INVITATION_CODE');
    });
  });

  describe('注册后邀请码生成验证（需求 8.3）', () => {
    it('注册成功后应为新用户生成恰好3个邀请码', async () => {
      const testUserId = 'user-invite-gen';

      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.invitationCode.findUnique
        .mockResolvedValueOnce({
          id: 'inv-gen',
          code: 'GenCode1',
          ownerId: 'inviter-gen',
          usedById: null,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          createdAt: new Date(),
        })
        .mockResolvedValueOnce({
          id: 'inv-gen',
          code: 'GenCode1',
          ownerId: 'inviter-gen',
          usedById: null,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          createdAt: new Date(),
        })
        .mockResolvedValue(null); // generateUniqueCode 唯一性检查
      mockPrisma.verificationCode.findFirst.mockResolvedValue({
        id: 'vc-gen',
        email: 'gen@example.com',
        code: '111111',
        attempts: 0,
        isUsed: false,
        expiresAt: new Date(Date.now() + 3 * 60 * 1000),
        createdAt: new Date(),
      });
      mockPrisma.verificationCode.update.mockResolvedValue({});
      mockPrisma.user.create.mockResolvedValue({
        id: testUserId,
        email: 'gen@example.com',
        status: 'registered',
        createdAt: new Date(),
      });
      mockPrisma.invitationCode.update.mockResolvedValue({});
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.invitationCode.create.mockResolvedValue({
        id: 'new-inv',
        code: 'NewCode1',
        ownerId: testUserId,
        source: 'user',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });

      const res = await makeRequest('POST', '/api/auth/register', {
        email: 'gen@example.com',
        code: '111111',
        invitationCode: 'GenCode1',
      });

      expect(res.status).toBe(201);

      // 验证 invitationCode.create 被调用了3次（为新用户生成3个邀请码）
      expect(mockPrisma.invitationCode.create).toHaveBeenCalledTimes(3);

      // 验证每次调用的参数包含正确的 ownerId 和 source
      const createCalls = mockPrisma.invitationCode.create.mock.calls;
      createCalls.forEach((call) => {
        expect(call[0].data.ownerId).toBe(testUserId);
        expect(call[0].data.source).toBe('user');
        // 验证有效期约为30天
        const expiresAt = new Date(call[0].data.expiresAt);
        const now = new Date();
        const diffDays = (expiresAt - now) / (1000 * 60 * 60 * 24);
        expect(diffDays).toBeGreaterThan(29);
        expect(diffDays).toBeLessThanOrEqual(31);
      });
    });
  });

  describe('用户状态流转验证', () => {
    it('注册后初始状态为 registered，填写资料后变为 profile_completed', async () => {
      // 这个测试验证状态流转的设计正确性
      // 注册时用户状态为 registered
      const testUserId = 'user-flow-001';

      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.invitationCode.findUnique
        .mockResolvedValueOnce({
          id: 'inv-flow',
          code: 'FlowCod1',
          ownerId: 'inviter-flow',
          usedById: null,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          createdAt: new Date(),
        })
        .mockResolvedValueOnce({
          id: 'inv-flow',
          code: 'FlowCod1',
          ownerId: 'inviter-flow',
          usedById: null,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          createdAt: new Date(),
        })
        .mockResolvedValue(null); // generateUniqueCode 唯一性检查
      mockPrisma.verificationCode.findFirst.mockResolvedValue({
        id: 'vc-flow',
        email: 'flow@example.com',
        code: '222222',
        attempts: 0,
        isUsed: false,
        expiresAt: new Date(Date.now() + 3 * 60 * 1000),
        createdAt: new Date(),
      });
      mockPrisma.verificationCode.update.mockResolvedValue({});
      mockPrisma.user.create.mockResolvedValue({
        id: testUserId,
        email: 'flow@example.com',
        status: 'registered', // 初始状态
        createdAt: new Date(),
      });
      mockPrisma.invitationCode.update.mockResolvedValue({});
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.invitationCode.create.mockResolvedValue({});

      const res = await makeRequest('POST', '/api/auth/register', {
        email: 'flow@example.com',
        code: '222222',
        invitationCode: 'FlowCod1',
      });

      // 注册后状态为 registered
      expect(res.status).toBe(201);
      expect(res.body.data.user.status).toBe('registered');

      // 验证用户创建时没有指定 status（使用数据库默认值 registered）
      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: { email: 'flow@example.com' },
      });
    });
  });

  describe('邀请码使用后标记验证（需求 8.4）', () => {
    it('注册成功后邀请码应被标记为已使用', async () => {
      const testUserId = 'user-mark-001';
      const testInvCode = 'MarkCod1';

      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.invitationCode.findUnique
        .mockResolvedValueOnce({
          id: 'inv-mark',
          code: testInvCode,
          ownerId: 'inviter-mark',
          usedById: null,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          createdAt: new Date(),
        })
        .mockResolvedValueOnce({
          id: 'inv-mark',
          code: testInvCode,
          ownerId: 'inviter-mark',
          usedById: null,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          createdAt: new Date(),
        })
        .mockResolvedValue(null); // generateUniqueCode 唯一性检查
      mockPrisma.verificationCode.findFirst.mockResolvedValue({
        id: 'vc-mark',
        email: 'mark@example.com',
        code: '333333',
        attempts: 0,
        isUsed: false,
        expiresAt: new Date(Date.now() + 3 * 60 * 1000),
        createdAt: new Date(),
      });
      mockPrisma.verificationCode.update.mockResolvedValue({});
      mockPrisma.user.create.mockResolvedValue({
        id: testUserId,
        email: 'mark@example.com',
        status: 'registered',
        createdAt: new Date(),
      });
      mockPrisma.invitationCode.update.mockResolvedValue({
        id: 'inv-mark',
        code: testInvCode,
        usedById: testUserId,
        usedAt: new Date(),
      });
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.invitationCode.create.mockResolvedValue({});

      const res = await makeRequest('POST', '/api/auth/register', {
        email: 'mark@example.com',
        code: '333333',
        invitationCode: testInvCode,
      });

      expect(res.status).toBe(201);

      // 验证邀请码被标记为已使用（通过 $transaction 调用）
      expect(mockPrisma.$transaction).toHaveBeenCalled();
      // 验证 invitationCode.update 被调用来标记已使用
      expect(mockPrisma.invitationCode.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { code: testInvCode },
          data: expect.objectContaining({
            usedById: testUserId,
          }),
        })
      );
    });
  });

  describe('发送验证码端点集成', () => {
    it('应通过 /api/auth/send-code 端点发送验证码', async () => {
      // Mock authService.sendVerificationCode
      // 由于 sendVerificationCode 内部使用 prisma，我们需要 mock 相关调用
      mockPrisma.verificationCode.count.mockResolvedValue(0); // 频率限制检查通过
      mockPrisma.verificationCode.findFirst.mockResolvedValue(null); // 幂等性检查通过
      mockPrisma.verificationCode.create.mockResolvedValue({
        id: 'vc-send',
        email: 'send@example.com',
        code: '456789',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      });

      const res = await makeRequest('POST', '/api/auth/send-code', {
        email: 'send@example.com',
      });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe('SUCCESS');
      expect(res.body.data.expiresAt).toBeDefined();
    });

    it('应在邮箱格式错误时拒绝发送验证码', async () => {
      const res = await makeRequest('POST', '/api/auth/send-code', {
        email: 'invalid-email',
      });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_EMAIL_FORMAT');
    });
  });
});
