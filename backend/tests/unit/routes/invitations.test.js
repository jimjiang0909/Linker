/**
 * 邀请码路由单元测试
 */
import { jest } from '@jest/globals';
import {
  createMockRequest,
  createMockResponse,
  createMockNext,
} from '../../helpers/mockFactory.js';

// Mock prisma
const mockPrisma = {
  invitationCode: {
    findMany: jest.fn(),
  },
  user: {
    findMany: jest.fn(),
  },
};

// Mock inviteService
const mockValidateInvitationCode = jest.fn();

// Mock auth middleware
const mockAuthenticate = jest.fn((req, _res, next) => next());

jest.unstable_mockModule('../../../src/lib/prisma.js', () => ({
  default: mockPrisma,
}));

jest.unstable_mockModule('../../../src/services/inviteService.js', () => ({
  validateInvitationCode: mockValidateInvitationCode,
}));

jest.unstable_mockModule('../../../src/middlewares/auth.js', () => ({
  authenticate: mockAuthenticate,
}));

// Dynamic import after mocks
const { default: express } = await import('express');
const { default: invitationsRouter } = await import('../../../src/routes/invitations.js');

// Create a test app
function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/invitations', invitationsRouter);
  return app;
}

describe('GET /api/invitations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('应返回用户的邀请码列表（含状态）', async () => {
    const now = new Date();
    const futureDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const pastDate = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);

    mockPrisma.invitationCode.findMany.mockResolvedValue([
      {
        id: 'code-1',
        code: 'ABCD1234',
        source: 'user',
        expiresAt: futureDate,
        usedAt: null,
        usedById: null,
        createdAt: now,
      },
      {
        id: 'code-2',
        code: 'EFGH5678',
        source: 'user',
        expiresAt: futureDate,
        usedAt: now,
        usedById: 'user-2',
        createdAt: now,
      },
      {
        id: 'code-3',
        code: 'IJKL9012',
        source: 'user',
        expiresAt: pastDate,
        usedAt: null,
        usedById: null,
        createdAt: now,
      },
    ]);

    const req = createMockRequest({
      user: { userId: 'user-1' },
    });
    const res = createMockResponse();
    const next = createMockNext();

    // 直接调用路由处理器
    // 由于 authenticate 被 mock 为直接 next()，我们模拟已认证的请求
    const app = createTestApp();

    // 使用 supertest 风格的手动调用
    // 由于没有 supertest，我们直接测试路由逻辑
    const routeHandler = invitationsRouter.stack.find(
      (layer) => layer.route && layer.route.path === '/' && layer.route.methods.get
    ).route.stack[1].handle; // 跳过 authenticate 中间件

    await routeHandler(req, res, next);

    expect(mockPrisma.invitationCode.findMany).toHaveBeenCalledWith({
      where: { ownerId: 'user-1' },
      select: {
        id: true,
        code: true,
        source: true,
        expiresAt: true,
        usedAt: true,
        usedById: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    expect(res.json).toHaveBeenCalledWith({
      code: 'SUCCESS',
      message: '获取邀请码列表成功',
      data: [
        {
          id: 'code-1',
          code: 'ABCD1234',
          source: 'user',
          status: 'available',
          expiresAt: futureDate,
          usedAt: null,
          createdAt: now,
        },
        {
          id: 'code-2',
          code: 'EFGH5678',
          source: 'user',
          status: 'used',
          expiresAt: futureDate,
          usedAt: now,
          createdAt: now,
        },
        {
          id: 'code-3',
          code: 'IJKL9012',
          source: 'user',
          status: 'expired',
          expiresAt: pastDate,
          usedAt: null,
          createdAt: now,
        },
      ],
    });
  });

  it('应返回空列表当用户没有邀请码', async () => {
    mockPrisma.invitationCode.findMany.mockResolvedValue([]);

    const req = createMockRequest({
      user: { userId: 'user-1' },
    });
    const res = createMockResponse();
    const next = createMockNext();

    const routeHandler = invitationsRouter.stack.find(
      (layer) => layer.route && layer.route.path === '/' && layer.route.methods.get
    ).route.stack[1].handle;

    await routeHandler(req, res, next);

    expect(res.json).toHaveBeenCalledWith({
      code: 'SUCCESS',
      message: '获取邀请码列表成功',
      data: [],
    });
  });
});

describe('GET /api/invitations/invitees', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('应返回已邀请用户列表（含昵称和注册时间）', async () => {
    const registeredAt = new Date('2024-01-15T10:00:00Z');

    mockPrisma.user.findMany.mockResolvedValue([
      {
        id: 'invitee-1',
        createdAt: registeredAt,
        profile: { name: '张三' },
      },
      {
        id: 'invitee-2',
        createdAt: registeredAt,
        profile: { name: '李四' },
      },
    ]);

    const req = createMockRequest({
      user: { userId: 'user-1' },
    });
    const res = createMockResponse();
    const next = createMockNext();

    const routeHandler = invitationsRouter.stack.find(
      (layer) => layer.route && layer.route.path === '/invitees' && layer.route.methods.get
    ).route.stack[1].handle;

    await routeHandler(req, res, next);

    expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
      where: { invitedBy: 'user-1' },
      select: {
        id: true,
        createdAt: true,
        profile: {
          select: {
            name: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    expect(res.json).toHaveBeenCalledWith({
      code: 'SUCCESS',
      message: '获取已邀请用户列表成功',
      data: [
        { id: 'invitee-1', name: '张三', registeredAt },
        { id: 'invitee-2', name: '李四', registeredAt },
      ],
    });
  });

  it('应处理没有 profile 的被邀请用户（name 为 null）', async () => {
    const registeredAt = new Date('2024-01-15T10:00:00Z');

    mockPrisma.user.findMany.mockResolvedValue([
      {
        id: 'invitee-1',
        createdAt: registeredAt,
        profile: null,
      },
    ]);

    const req = createMockRequest({
      user: { userId: 'user-1' },
    });
    const res = createMockResponse();
    const next = createMockNext();

    const routeHandler = invitationsRouter.stack.find(
      (layer) => layer.route && layer.route.path === '/invitees' && layer.route.methods.get
    ).route.stack[1].handle;

    await routeHandler(req, res, next);

    expect(res.json).toHaveBeenCalledWith({
      code: 'SUCCESS',
      message: '获取已邀请用户列表成功',
      data: [{ id: 'invitee-1', name: null, registeredAt }],
    });
  });
});

describe('POST /api/invitations/validate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('应返回邀请码有效', async () => {
    mockValidateInvitationCode.mockResolvedValue({
      valid: true,
      invitationCode: { id: 'code-1', code: 'ABCD1234' },
    });

    const req = createMockRequest({
      body: { code: 'ABCD1234' },
    });
    const res = createMockResponse();
    const next = createMockNext();

    const routeHandler = invitationsRouter.stack.find(
      (layer) => layer.route && layer.route.path === '/validate' && layer.route.methods.post
    ).route.stack[0].handle;

    await routeHandler(req, res, next);

    expect(mockValidateInvitationCode).toHaveBeenCalledWith('ABCD1234');
    expect(res.json).toHaveBeenCalledWith({
      code: 'SUCCESS',
      message: '邀请码有效',
      data: { valid: true },
    });
  });

  it('应返回400当邀请码格式错误', async () => {
    mockValidateInvitationCode.mockResolvedValue({
      valid: false,
      reason: 'INVALID_FORMAT',
      message: '邀请码格式错误，应为8位字母数字组合',
    });

    const req = createMockRequest({
      body: { code: 'short' },
    });
    const res = createMockResponse();
    const next = createMockNext();

    const routeHandler = invitationsRouter.stack.find(
      (layer) => layer.route && layer.route.path === '/validate' && layer.route.methods.post
    ).route.stack[0].handle;

    await routeHandler(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      code: 'INVITATION_INVALID_FORMAT',
      message: '邀请码格式错误，应为8位字母数字组合',
      details: { reason: 'INVALID_FORMAT' },
    });
  });

  it('应返回400当邀请码已被使用', async () => {
    mockValidateInvitationCode.mockResolvedValue({
      valid: false,
      reason: 'ALREADY_USED',
      message: '邀请码已被使用',
    });

    const req = createMockRequest({
      body: { code: 'USED1234' },
    });
    const res = createMockResponse();
    const next = createMockNext();

    const routeHandler = invitationsRouter.stack.find(
      (layer) => layer.route && layer.route.path === '/validate' && layer.route.methods.post
    ).route.stack[0].handle;

    await routeHandler(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      code: 'INVITATION_ALREADY_USED',
      message: '邀请码已被使用',
      details: { reason: 'ALREADY_USED' },
    });
  });

  it('应返回400当邀请码已过期', async () => {
    mockValidateInvitationCode.mockResolvedValue({
      valid: false,
      reason: 'EXPIRED',
      message: '邀请码已过期',
    });

    const req = createMockRequest({
      body: { code: 'EXPR1234' },
    });
    const res = createMockResponse();
    const next = createMockNext();

    const routeHandler = invitationsRouter.stack.find(
      (layer) => layer.route && layer.route.path === '/validate' && layer.route.methods.post
    ).route.stack[0].handle;

    await routeHandler(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      code: 'INVITATION_EXPIRED',
      message: '邀请码已过期',
      details: { reason: 'EXPIRED' },
    });
  });

  it('应返回400当未提供邀请码', async () => {
    const req = createMockRequest({
      body: {},
    });
    const res = createMockResponse();
    const next = createMockNext();

    const routeHandler = invitationsRouter.stack.find(
      (layer) => layer.route && layer.route.path === '/validate' && layer.route.methods.post
    ).route.stack[0].handle;

    await routeHandler(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      code: 'MISSING_CODE',
      message: '请提供邀请码',
      details: {},
    });
  });

  it('应将异常传递给 next 错误处理', async () => {
    const error = new Error('数据库连接失败');
    mockValidateInvitationCode.mockRejectedValue(error);

    const req = createMockRequest({
      body: { code: 'ABCD1234' },
    });
    const res = createMockResponse();
    const next = createMockNext();

    const routeHandler = invitationsRouter.stack.find(
      (layer) => layer.route && layer.route.path === '/validate' && layer.route.methods.post
    ).route.stack[0].handle;

    await routeHandler(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
  });
});
