/**
 * 用户资料路由单元测试
 */
import { jest } from '@jest/globals';
import {
  createMockRequest,
  createMockResponse,
  createMockNext,
} from '../../helpers/mockFactory.js';

// Mock prisma
const mockPrisma = {
  profile: {
    findUnique: jest.fn(),
  },
  photo: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
  user: {
    update: jest.fn(),
  },
};

// Mock profileService
const mockCreateOrUpdateProfile = jest.fn();

// Mock photoService
const mockUploadPhoto = jest.fn();
const mockDeletePhoto = jest.fn();

// Mock auth middleware
const mockAuthenticate = jest.fn((req, _res, next) => next());

jest.unstable_mockModule('../../../src/lib/prisma.js', () => ({
  default: mockPrisma,
}));

jest.unstable_mockModule('../../../src/services/profileService.js', () => ({
  createOrUpdateProfile: mockCreateOrUpdateProfile,
}));

jest.unstable_mockModule('../../../src/services/photoService.js', () => ({
  uploadPhoto: mockUploadPhoto,
  deletePhoto: mockDeletePhoto,
}));

jest.unstable_mockModule('../../../src/middlewares/auth.js', () => ({
  authenticate: mockAuthenticate,
}));

// Dynamic import after mocks
const { default: profileRouter } = await import('../../../src/routes/profile.js');

describe('GET /api/profile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('应返回用户资料和照片', async () => {
    const mockProfile = {
      id: 'profile-1',
      userId: 'user-1',
      name: '张三',
      birthYear: 1995,
      gender: 'male',
      occupation: '工程师',
      city: '北京',
      bio: '热爱生活',
    };

    const mockPhotos = [
      { id: 'photo-1', userId: 'user-1', url: '/uploads/test1.jpg', sortOrder: 0 },
      { id: 'photo-2', userId: 'user-1', url: '/uploads/test2.jpg', sortOrder: 1 },
    ];

    mockPrisma.profile.findUnique.mockResolvedValue(mockProfile);
    mockPrisma.photo.findMany.mockResolvedValue(mockPhotos);

    const req = createMockRequest({ user: { userId: 'user-1' } });
    const res = createMockResponse();
    const next = createMockNext();

    // 找到 GET / 路由处理器（跳过 authenticate 中间件）
    const routeHandler = profileRouter.stack.find(
      (layer) => layer.route && layer.route.path === '/' && layer.route.methods.get
    ).route.stack[1].handle;

    await routeHandler(req, res, next);

    expect(mockPrisma.profile.findUnique).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    });
    expect(mockPrisma.photo.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      orderBy: { sortOrder: 'asc' },
    });
    expect(res.json).toHaveBeenCalledWith({
      code: 'SUCCESS',
      message: '获取资料成功',
      data: {
        profile: mockProfile,
        photos: mockPhotos,
      },
    });
  });

  it('应返回 null profile 当用户未填写资料', async () => {
    mockPrisma.profile.findUnique.mockResolvedValue(null);
    mockPrisma.photo.findMany.mockResolvedValue([]);

    const req = createMockRequest({ user: { userId: 'user-1' } });
    const res = createMockResponse();
    const next = createMockNext();

    const routeHandler = profileRouter.stack.find(
      (layer) => layer.route && layer.route.path === '/' && layer.route.methods.get
    ).route.stack[1].handle;

    await routeHandler(req, res, next);

    expect(res.json).toHaveBeenCalledWith({
      code: 'SUCCESS',
      message: '获取资料成功',
      data: {
        profile: null,
        photos: [],
      },
    });
  });

  it('应将异常传递给 next 错误处理', async () => {
    const error = new Error('数据库连接失败');
    mockPrisma.profile.findUnique.mockRejectedValue(error);

    const req = createMockRequest({ user: { userId: 'user-1' } });
    const res = createMockResponse();
    const next = createMockNext();

    const routeHandler = profileRouter.stack.find(
      (layer) => layer.route && layer.route.path === '/' && layer.route.methods.get
    ).route.stack[1].handle;

    await routeHandler(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
  });
});

describe('PUT /api/profile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('应成功更新资料（有照片时保持 profile_completed 状态）', async () => {
    const mockProfile = {
      id: 'profile-1',
      userId: 'user-1',
      name: '张三',
      birthYear: 1995,
      gender: 'male',
      occupation: '工程师',
      city: '北京',
      bio: '热爱生活',
    };

    mockCreateOrUpdateProfile.mockResolvedValue(mockProfile);
    mockPrisma.photo.count.mockResolvedValue(2);

    const req = createMockRequest({
      user: { userId: 'user-1' },
      body: {
        name: '张三',
        birthYear: 1995,
        gender: 'male',
        occupation: '工程师',
        city: '北京',
        bio: '热爱生活',
      },
    });
    const res = createMockResponse();
    const next = createMockNext();

    const routeHandler = profileRouter.stack.find(
      (layer) => layer.route && layer.route.path === '/' && layer.route.methods.put
    ).route.stack[1].handle;

    await routeHandler(req, res, next);

    expect(mockCreateOrUpdateProfile).toHaveBeenCalledWith('user-1', req.body);
    expect(mockPrisma.photo.count).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
    // 有照片时不应回退状态
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      code: 'SUCCESS',
      message: '资料更新成功',
      data: { profile: mockProfile },
    });
  });

  it('应在没有照片时将用户状态回退为 registered', async () => {
    const mockProfile = {
      id: 'profile-1',
      userId: 'user-1',
      name: '张三',
      birthYear: 1995,
      gender: 'male',
      occupation: '工程师',
      city: '北京',
    };

    mockCreateOrUpdateProfile.mockResolvedValue(mockProfile);
    mockPrisma.photo.count.mockResolvedValue(0);
    mockPrisma.user.update.mockResolvedValue({});

    const req = createMockRequest({
      user: { userId: 'user-1' },
      body: {
        name: '张三',
        birthYear: 1995,
        gender: 'male',
        occupation: '工程师',
        city: '北京',
      },
    });
    const res = createMockResponse();
    const next = createMockNext();

    const routeHandler = profileRouter.stack.find(
      (layer) => layer.route && layer.route.path === '/' && layer.route.methods.put
    ).route.stack[1].handle;

    await routeHandler(req, res, next);

    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { status: 'registered' },
    });
  });

  it('应将 profileService 抛出的错误传递给 next', async () => {
    const error = new Error('VALIDATION_ERROR');
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    mockCreateOrUpdateProfile.mockRejectedValue(error);

    const req = createMockRequest({
      user: { userId: 'user-1' },
      body: { name: '' },
    });
    const res = createMockResponse();
    const next = createMockNext();

    const routeHandler = profileRouter.stack.find(
      (layer) => layer.route && layer.route.path === '/' && layer.route.methods.put
    ).route.stack[1].handle;

    await routeHandler(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
  });
});

describe('POST /api/profile/photos', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('应成功上传照片', async () => {
    const mockPhoto = {
      id: 'photo-1',
      userId: 'user-1',
      url: '/uploads/test.jpg',
      sortOrder: 0,
    };

    mockUploadPhoto.mockResolvedValue(mockPhoto);

    const req = createMockRequest({
      user: { userId: 'user-1' },
      file: {
        buffer: Buffer.from('fake-image-data'),
        size: 1024,
        originalname: 'test.jpg',
      },
    });
    const res = createMockResponse();
    const next = createMockNext();

    // POST /photos 路由：stack[1] 是 authenticate, stack[2] 是 multer, stack[3] 是 handler
    const route = profileRouter.stack.find(
      (layer) => layer.route && layer.route.path === '/photos' && layer.route.methods.post
    );
    // 获取最后一个处理器（实际业务逻辑）
    const routeHandler = route.route.stack[route.route.stack.length - 1].handle;

    await routeHandler(req, res, next);

    expect(mockUploadPhoto).toHaveBeenCalledWith('user-1', req.file);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      code: 'SUCCESS',
      message: '照片上传成功',
      data: { photo: mockPhoto },
    });
  });

  it('应返回400当未上传文件', async () => {
    const req = createMockRequest({
      user: { userId: 'user-1' },
      file: null,
    });
    const res = createMockResponse();
    const next = createMockNext();

    const route = profileRouter.stack.find(
      (layer) => layer.route && layer.route.path === '/photos' && layer.route.methods.post
    );
    const routeHandler = route.route.stack[route.route.stack.length - 1].handle;

    await routeHandler(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      code: 'MISSING_FILE',
      message: '请上传照片文件',
      details: {},
    });
  });

  it('应将 photoService 抛出的错误传递给 next', async () => {
    const error = new Error('PHOTO_LIMIT_REACHED');
    error.statusCode = 400;
    mockUploadPhoto.mockRejectedValue(error);

    const req = createMockRequest({
      user: { userId: 'user-1' },
      file: {
        buffer: Buffer.from('fake-image-data'),
        size: 1024,
        originalname: 'test.jpg',
      },
    });
    const res = createMockResponse();
    const next = createMockNext();

    const route = profileRouter.stack.find(
      (layer) => layer.route && layer.route.path === '/photos' && layer.route.methods.post
    );
    const routeHandler = route.route.stack[route.route.stack.length - 1].handle;

    await routeHandler(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
  });
});

describe('DELETE /api/profile/photos/:id', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('应成功删除照片', async () => {
    mockDeletePhoto.mockResolvedValue({ id: 'photo-1' });

    const req = createMockRequest({
      user: { userId: 'user-1' },
      params: { id: 'photo-1' },
    });
    const res = createMockResponse();
    const next = createMockNext();

    const routeHandler = profileRouter.stack.find(
      (layer) => layer.route && layer.route.path === '/photos/:id' && layer.route.methods.delete
    ).route.stack[1].handle;

    await routeHandler(req, res, next);

    expect(mockDeletePhoto).toHaveBeenCalledWith('user-1', 'photo-1');
    expect(res.json).toHaveBeenCalledWith({
      code: 'SUCCESS',
      message: '照片删除成功',
      data: {},
    });
  });

  it('应将 photoService 抛出的错误传递给 next', async () => {
    const error = new Error('PHOTO_NOT_FOUND');
    error.statusCode = 404;
    mockDeletePhoto.mockRejectedValue(error);

    const req = createMockRequest({
      user: { userId: 'user-1' },
      params: { id: 'nonexistent-photo' },
    });
    const res = createMockResponse();
    const next = createMockNext();

    const routeHandler = profileRouter.stack.find(
      (layer) => layer.route && layer.route.path === '/photos/:id' && layer.route.methods.delete
    ).route.stack[1].handle;

    await routeHandler(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
  });
});
