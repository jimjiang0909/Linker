/**
 * 聊天模块路由单元测试
 */
import { jest } from '@jest/globals';
import {
  createMockRequest,
  createMockResponse,
  createMockNext,
} from '../../helpers/mockFactory.js';

// Mock prisma
const mockPrisma = {
  conversation: {
    findMany: jest.fn(),
  },
};

// Mock auth middleware
const mockAuthenticate = jest.fn((req, _res, next) => next());

// Mock chatService
const mockSendMessage = jest.fn();
const mockGetMessages = jest.fn();
const mockEndConversation = jest.fn();

// Mock reportService
const mockCreateReport = jest.fn();

jest.unstable_mockModule('../../../src/lib/prisma.js', () => ({
  default: mockPrisma,
}));

jest.unstable_mockModule('../../../src/middlewares/auth.js', () => ({
  authenticate: mockAuthenticate,
}));

jest.unstable_mockModule('../../../src/services/chatService.js', () => ({
  sendMessage: mockSendMessage,
  getMessages: mockGetMessages,
  endConversation: mockEndConversation,
}));

jest.unstable_mockModule('../../../src/services/reportService.js', () => ({
  createReport: mockCreateReport,
}));

// Dynamic import after mocks
const { default: conversationsRouter } = await import(
  '../../../src/routes/conversations.js'
);

describe('GET /api/conversations', () => {
  let routeHandler;

  beforeAll(() => {
    const layer = conversationsRouter.stack.find(
      (l) => l.route && l.route.path === '/' && l.route.methods.get
    );
    routeHandler = layer.route.stack[1].handle;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('应返回用户的对话列表', async () => {
    const createdAt = new Date('2024-06-10T10:00:00Z');
    mockPrisma.conversation.findMany.mockResolvedValue([
      {
        id: 'conv-1',
        userAId: 'user-1',
        userBId: 'user-2',
        status: 'active',
        createdAt,
        endedAt: null,
        userA: {
          id: 'user-1',
          profile: { name: '小明', occupation: '工程师', city: '北京' },
        },
        userB: {
          id: 'user-2',
          profile: { name: '小红', occupation: '设计师', city: '上海' },
        },
        messages: [
          {
            id: 'msg-1',
            content: '你好！',
            type: 'text',
            senderId: 'user-2',
            createdAt: new Date('2024-06-10T11:00:00Z'),
            isRead: false,
          },
        ],
      },
    ]);

    const req = createMockRequest({ user: { userId: 'user-1' } });
    const res = createMockResponse();
    const next = createMockNext();

    await routeHandler(req, res, next);

    expect(res.json).toHaveBeenCalledWith({
      code: 'SUCCESS',
      message: '获取对话列表成功',
      data: [
        {
          id: 'conv-1',
          status: 'active',
          createdAt,
          endedAt: null,
          otherUser: {
            id: 'user-2',
            name: '小红',
            occupation: '设计师',
            city: '上海',
          },
          lastMessage: {
            id: 'msg-1',
            content: '你好！',
            type: 'text',
            senderId: 'user-2',
            createdAt: new Date('2024-06-10T11:00:00Z'),
            isRead: false,
          },
        },
      ],
    });
  });

  it('应返回空数组当用户没有对话', async () => {
    mockPrisma.conversation.findMany.mockResolvedValue([]);

    const req = createMockRequest({ user: { userId: 'user-1' } });
    const res = createMockResponse();
    const next = createMockNext();

    await routeHandler(req, res, next);

    expect(res.json).toHaveBeenCalledWith({
      code: 'SUCCESS',
      message: '获取对话列表成功',
      data: [],
    });
  });

  it('应对系统消息显示 [系统消息] 占位文本', async () => {
    mockPrisma.conversation.findMany.mockResolvedValue([
      {
        id: 'conv-1',
        userAId: 'user-1',
        userBId: 'user-2',
        status: 'active',
        createdAt: new Date(),
        endedAt: null,
        userA: {
          id: 'user-1',
          profile: { name: '小明', occupation: '工程师', city: '北京' },
        },
        userB: {
          id: 'user-2',
          profile: { name: '小红', occupation: '设计师', city: '上海' },
        },
        messages: [
          {
            id: 'msg-sys',
            content: '{"reporterId":"user-1"}',
            type: 'system',
            senderId: 'user-1',
            createdAt: new Date(),
            isRead: false,
          },
        ],
      },
    ]);

    const req = createMockRequest({ user: { userId: 'user-1' } });
    const res = createMockResponse();
    const next = createMockNext();

    await routeHandler(req, res, next);

    const data = res.json.mock.calls[0][0].data;
    expect(data[0].lastMessage.content).toBe('[系统消息]');
  });

  it('应将异常传递给 next 错误处理', async () => {
    const error = new Error('数据库连接失败');
    mockPrisma.conversation.findMany.mockRejectedValue(error);

    const req = createMockRequest({ user: { userId: 'user-1' } });
    const res = createMockResponse();
    const next = createMockNext();

    await routeHandler(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
  });
});

describe('GET /api/conversations/:id/messages', () => {
  let routeHandler;

  beforeAll(() => {
    const layer = conversationsRouter.stack.find(
      (l) => l.route && l.route.path === '/:id/messages' && l.route.methods.get
    );
    routeHandler = layer.route.stack[1].handle;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('应返回分页消息历史', async () => {
    const messages = [
      { id: 'msg-1', content: '你好', type: 'text', senderId: 'user-1', createdAt: new Date() },
    ];
    mockGetMessages.mockResolvedValue({
      messages,
      total: 1,
      page: 1,
      pageSize: 20,
    });

    const req = createMockRequest({
      user: { userId: 'user-1' },
      params: { id: 'conv-1' },
      query: {},
    });
    const res = createMockResponse();
    const next = createMockNext();

    await routeHandler(req, res, next);

    expect(mockGetMessages).toHaveBeenCalledWith('user-1', 'conv-1', { page: 1, pageSize: 20 });
    expect(res.json).toHaveBeenCalledWith({
      code: 'SUCCESS',
      message: '获取消息历史成功',
      data: {
        messages,
        total: 1,
        page: 1,
        pageSize: 20,
      },
    });
  });

  it('应正确解析分页参数', async () => {
    mockGetMessages.mockResolvedValue({
      messages: [],
      total: 50,
      page: 3,
      pageSize: 10,
    });

    const req = createMockRequest({
      user: { userId: 'user-1' },
      params: { id: 'conv-1' },
      query: { page: '3', pageSize: '10' },
    });
    const res = createMockResponse();
    const next = createMockNext();

    await routeHandler(req, res, next);

    expect(mockGetMessages).toHaveBeenCalledWith('user-1', 'conv-1', { page: 3, pageSize: 10 });
  });

  it('应限制 pageSize 最大为50', async () => {
    mockGetMessages.mockResolvedValue({
      messages: [],
      total: 0,
      page: 1,
      pageSize: 50,
    });

    const req = createMockRequest({
      user: { userId: 'user-1' },
      params: { id: 'conv-1' },
      query: { pageSize: '100' },
    });
    const res = createMockResponse();
    const next = createMockNext();

    await routeHandler(req, res, next);

    expect(mockGetMessages).toHaveBeenCalledWith('user-1', 'conv-1', { page: 1, pageSize: 50 });
  });

  it('应在非参与方访问时传递错误', async () => {
    const error = new Error('您不是该对话的参与方');
    error.statusCode = 403;
    error.code = 'NOT_PARTICIPANT';
    mockGetMessages.mockRejectedValue(error);

    const req = createMockRequest({
      user: { userId: 'user-3' },
      params: { id: 'conv-1' },
      query: {},
    });
    const res = createMockResponse();
    const next = createMockNext();

    await routeHandler(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
  });
});

describe('POST /api/conversations/:id/messages', () => {
  let routeHandler;

  beforeAll(() => {
    const layer = conversationsRouter.stack.find(
      (l) => l.route && l.route.path === '/:id/messages' && l.route.methods.post
    );
    routeHandler = layer.route.stack[1].handle;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('应成功发送消息', async () => {
    const message = {
      id: 'msg-new',
      conversationId: 'conv-1',
      senderId: 'user-1',
      content: '你好！',
      type: 'text',
      createdAt: new Date(),
    };
    mockSendMessage.mockResolvedValue(message);

    const req = createMockRequest({
      user: { userId: 'user-1' },
      params: { id: 'conv-1' },
      body: { content: '你好！' },
    });
    const res = createMockResponse();
    const next = createMockNext();

    await routeHandler(req, res, next);

    expect(mockSendMessage).toHaveBeenCalledWith('user-1', 'conv-1', '你好！');
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      code: 'SUCCESS',
      message: '消息发送成功',
      data: message,
    });
  });

  it('应在空消息时传递错误', async () => {
    const error = new Error('消息不能为空');
    error.statusCode = 400;
    error.code = 'EMPTY_MESSAGE';
    mockSendMessage.mockRejectedValue(error);

    const req = createMockRequest({
      user: { userId: 'user-1' },
      params: { id: 'conv-1' },
      body: { content: '' },
    });
    const res = createMockResponse();
    const next = createMockNext();

    await routeHandler(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
  });

  it('应在对话已结束时传递错误', async () => {
    const error = new Error('对话已结束，无法发送消息');
    error.statusCode = 400;
    error.code = 'CONVERSATION_ENDED';
    mockSendMessage.mockRejectedValue(error);

    const req = createMockRequest({
      user: { userId: 'user-1' },
      params: { id: 'conv-1' },
      body: { content: '你好' },
    });
    const res = createMockResponse();
    const next = createMockNext();

    await routeHandler(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
  });
});

describe('POST /api/conversations/:id/end', () => {
  let routeHandler;

  beforeAll(() => {
    const layer = conversationsRouter.stack.find(
      (l) => l.route && l.route.path === '/:id/end' && l.route.methods.post
    );
    routeHandler = layer.route.stack[1].handle;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('应成功结束对话', async () => {
    const endedAt = new Date();
    mockEndConversation.mockResolvedValue({
      id: 'conv-1',
      status: 'ended',
      endedAt,
    });

    const req = createMockRequest({
      user: { userId: 'user-1' },
      params: { id: 'conv-1' },
    });
    const res = createMockResponse();
    const next = createMockNext();

    await routeHandler(req, res, next);

    expect(mockEndConversation).toHaveBeenCalledWith('user-1', 'conv-1');
    expect(res.json).toHaveBeenCalledWith({
      code: 'SUCCESS',
      message: '对话已结束',
      data: {
        id: 'conv-1',
        status: 'ended',
        endedAt,
      },
    });
  });

  it('应在对话已结束时传递错误', async () => {
    const error = new Error('对话已经结束');
    error.statusCode = 400;
    error.code = 'CONVERSATION_ALREADY_ENDED';
    mockEndConversation.mockRejectedValue(error);

    const req = createMockRequest({
      user: { userId: 'user-1' },
      params: { id: 'conv-1' },
    });
    const res = createMockResponse();
    const next = createMockNext();

    await routeHandler(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
  });

  it('应在非参与方操作时传递错误', async () => {
    const error = new Error('您不是该对话的参与方');
    error.statusCode = 403;
    error.code = 'NOT_PARTICIPANT';
    mockEndConversation.mockRejectedValue(error);

    const req = createMockRequest({
      user: { userId: 'user-3' },
      params: { id: 'conv-1' },
    });
    const res = createMockResponse();
    const next = createMockNext();

    await routeHandler(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
  });
});

describe('POST /api/conversations/:id/report', () => {
  let routeHandler;

  beforeAll(() => {
    const layer = conversationsRouter.stack.find(
      (l) => l.route && l.route.path === '/:id/report' && l.route.methods.post
    );
    routeHandler = layer.route.stack[1].handle;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('应成功提交举报', async () => {
    const reportedAt = new Date().toISOString();
    mockCreateReport.mockResolvedValue({
      id: 'report-1',
      reporterId: 'user-1',
      reportedUserId: 'user-2',
      reportedMessageId: 'msg-bad',
      reason: '骚扰信息',
      reportedAt,
      createdAt: new Date(),
    });

    const req = createMockRequest({
      user: { userId: 'user-1' },
      params: { id: 'conv-1' },
      body: { messageId: 'msg-bad', reason: '骚扰信息' },
    });
    const res = createMockResponse();
    const next = createMockNext();

    await routeHandler(req, res, next);

    expect(mockCreateReport).toHaveBeenCalledWith('user-1', 'conv-1', 'msg-bad', '骚扰信息');
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      code: 'SUCCESS',
      message: '举报已提交，我们将在24小时内进行审核',
      data: expect.objectContaining({
        reporterId: 'user-1',
        reportedUserId: 'user-2',
        reportedMessageId: 'msg-bad',
        reason: '骚扰信息',
      }),
    });
  });

  it('应在缺少 messageId 时返回 400', async () => {
    const req = createMockRequest({
      user: { userId: 'user-1' },
      params: { id: 'conv-1' },
      body: { reason: '骚扰信息' },
    });
    const res = createMockResponse();
    const next = createMockNext();

    await routeHandler(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      code: 'MISSING_MESSAGE_ID',
      message: '请指定被举报的消息',
      details: {},
    });
    expect(mockCreateReport).not.toHaveBeenCalled();
  });

  it('应在缺少 reason 时返回 400', async () => {
    const req = createMockRequest({
      user: { userId: 'user-1' },
      params: { id: 'conv-1' },
      body: { messageId: 'msg-bad' },
    });
    const res = createMockResponse();
    const next = createMockNext();

    await routeHandler(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      code: 'MISSING_REASON',
      message: '请填写举报原因',
      details: {},
    });
    expect(mockCreateReport).not.toHaveBeenCalled();
  });

  it('应在 reason 为空白字符时返回 400', async () => {
    const req = createMockRequest({
      user: { userId: 'user-1' },
      params: { id: 'conv-1' },
      body: { messageId: 'msg-bad', reason: '   ' },
    });
    const res = createMockResponse();
    const next = createMockNext();

    await routeHandler(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      code: 'MISSING_REASON',
      message: '请填写举报原因',
      details: {},
    });
  });

  it('应在非参与方举报时传递错误', async () => {
    const error = new Error('您不是该对话的参与方');
    error.statusCode = 403;
    error.code = 'NOT_PARTICIPANT';
    mockCreateReport.mockRejectedValue(error);

    const req = createMockRequest({
      user: { userId: 'user-3' },
      params: { id: 'conv-1' },
      body: { messageId: 'msg-bad', reason: '骚扰' },
    });
    const res = createMockResponse();
    const next = createMockNext();

    await routeHandler(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
  });
});
