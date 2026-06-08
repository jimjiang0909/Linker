/**
 * 偏好设置路由单元测试
 */
import { jest } from '@jest/globals';
import {
  createMockRequest,
  createMockResponse,
  createMockNext,
} from '../../helpers/mockFactory.js';

// Mock prisma
const mockPrisma = {
  preference: {
    findUnique: jest.fn(),
  },
};

// Mock preferenceService
const mockCreateOrUpdatePreference = jest.fn();

// Mock auth middleware
const mockAuthenticate = jest.fn((req, _res, next) => next());

jest.unstable_mockModule('../../../src/lib/prisma.js', () => ({
  default: mockPrisma,
}));

jest.unstable_mockModule('../../../src/services/preferenceService.js', () => ({
  createOrUpdatePreference: mockCreateOrUpdatePreference,
}));

jest.unstable_mockModule('../../../src/middlewares/auth.js', () => ({
  authenticate: mockAuthenticate,
}));

// Dynamic import after mocks
const { default: preferencesRouter } = await import(
  '../../../src/routes/preferences.js'
);

describe('GET /api/preferences', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('应返回用户的偏好设置', async () => {
    const mockPreference = {
      id: 'pref-1',
      userId: 'user-1',
      ageMin: 22,
      ageMax: 35,
      datingIntent: 'serious_dating',
      occupationTypes: ['工程师', '设计师'],
      personalityTraits: ['开朗', '幽默'],
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    };

    mockPrisma.preference.findUnique.mockResolvedValue(mockPreference);

    const req = createMockRequest({
      user: { userId: 'user-1' },
    });
    const res = createMockResponse();
    const next = createMockNext();

    const routeHandler = preferencesRouter.stack.find(
      (layer) =>
        layer.route && layer.route.path === '/' && layer.route.methods.get
    ).route.stack[1].handle;

    await routeHandler(req, res, next);

    expect(mockPrisma.preference.findUnique).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    });

    expect(res.json).toHaveBeenCalledWith({
      code: 'SUCCESS',
      message: '获取偏好设置成功',
      data: mockPreference,
    });
  });

  it('应返回空对象当用户未设置偏好', async () => {
    mockPrisma.preference.findUnique.mockResolvedValue(null);

    const req = createMockRequest({
      user: { userId: 'user-1' },
    });
    const res = createMockResponse();
    const next = createMockNext();

    const routeHandler = preferencesRouter.stack.find(
      (layer) =>
        layer.route && layer.route.path === '/' && layer.route.methods.get
    ).route.stack[1].handle;

    await routeHandler(req, res, next);

    expect(res.json).toHaveBeenCalledWith({
      code: 'SUCCESS',
      message: '获取偏好设置成功',
      data: {},
    });
  });

  it('应将异常传递给 next 错误处理', async () => {
    const error = new Error('数据库连接失败');
    mockPrisma.preference.findUnique.mockRejectedValue(error);

    const req = createMockRequest({
      user: { userId: 'user-1' },
    });
    const res = createMockResponse();
    const next = createMockNext();

    const routeHandler = preferencesRouter.stack.find(
      (layer) =>
        layer.route && layer.route.path === '/' && layer.route.methods.get
    ).route.stack[1].handle;

    await routeHandler(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
  });
});

describe('PUT /api/preferences', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('应成功创建偏好设置', async () => {
    const savedPreference = {
      id: 'pref-1',
      userId: 'user-1',
      ageMin: 22,
      ageMax: 35,
      datingIntent: 'serious_dating',
      occupationTypes: ['工程师'],
      personalityTraits: ['开朗'],
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    };

    mockCreateOrUpdatePreference.mockResolvedValue(savedPreference);

    const req = createMockRequest({
      user: { userId: 'user-1' },
      body: {
        ageMin: 22,
        ageMax: 35,
        datingIntent: '认真约会',
        occupationTypes: ['工程师'],
        personalityTraits: ['开朗'],
      },
    });
    const res = createMockResponse();
    const next = createMockNext();

    const routeHandler = preferencesRouter.stack.find(
      (layer) =>
        layer.route && layer.route.path === '/' && layer.route.methods.put
    ).route.stack[1].handle;

    await routeHandler(req, res, next);

    expect(mockCreateOrUpdatePreference).toHaveBeenCalledWith('user-1', {
      ageMin: 22,
      ageMax: 35,
      datingIntent: '认真约会',
      occupationTypes: ['工程师'],
      personalityTraits: ['开朗'],
    });

    expect(res.json).toHaveBeenCalledWith({
      code: 'SUCCESS',
      message: '偏好设置保存成功',
      data: savedPreference,
    });
  });

  it('应将校验错误传递给 next 错误处理', async () => {
    const validationError = new Error('偏好设置校验失败');
    validationError.statusCode = 400;
    validationError.code = 'VALIDATION_ERROR';
    validationError.details = { errors: ['期望年龄下限为必填项'] };

    mockCreateOrUpdatePreference.mockRejectedValue(validationError);

    const req = createMockRequest({
      user: { userId: 'user-1' },
      body: {
        ageMax: 35,
        datingIntent: '认真约会',
      },
    });
    const res = createMockResponse();
    const next = createMockNext();

    const routeHandler = preferencesRouter.stack.find(
      (layer) =>
        layer.route && layer.route.path === '/' && layer.route.methods.put
    ).route.stack[1].handle;

    await routeHandler(req, res, next);

    expect(next).toHaveBeenCalledWith(validationError);
  });

  it('应将数据库异常传递给 next 错误处理', async () => {
    const error = new Error('数据库连接失败');
    mockCreateOrUpdatePreference.mockRejectedValue(error);

    const req = createMockRequest({
      user: { userId: 'user-1' },
      body: {
        ageMin: 22,
        ageMax: 35,
        datingIntent: '认真约会',
      },
    });
    const res = createMockResponse();
    const next = createMockNext();

    const routeHandler = preferencesRouter.stack.find(
      (layer) =>
        layer.route && layer.route.path === '/' && layer.route.methods.put
    ).route.stack[1].handle;

    await routeHandler(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
  });
});
