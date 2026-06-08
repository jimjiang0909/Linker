/**
 * WebSocket 模块单元测试
 * 测试：
 * - JWT 认证握手
 * - 在线用户管理
 * - 离线消息缓存（最多500条）
 * - message:send 事件处理
 * - match:success 事件推送
 * - recommendation:new 事件推送
 * - 离线消息上线后按时间顺序推送
 */
import { jest } from '@jest/globals';

// Mock dependencies
jest.unstable_mockModule('jsonwebtoken', () => ({
  default: {
    verify: jest.fn(),
  },
}));

jest.unstable_mockModule('../../../src/services/chatService.js', () => ({
  sendMessage: jest.fn(),
}));

jest.unstable_mockModule('../../../src/lib/prisma.js', () => ({
  default: {
    conversation: {
      findUnique: jest.fn(),
    },
  },
}));

const {
  registerOnlineUser,
  unregisterOnlineUser,
  isUserOnline,
  emitToUser,
  cacheOfflineMessage,
  deliverOfflineMessages,
  emitMatchSuccess,
  emitRecommendation,
  emitNewMessage,
  getOnlineUserCount,
  getOfflineMessageCount,
  resetState,
  MAX_OFFLINE_MESSAGES,
  initWebSocket,
} = await import('../../../src/websocket/index.js');

describe('WebSocket 模块', () => {
  beforeEach(() => {
    resetState();
  });

  describe('在线用户管理', () => {
    test('注册在线用户后，用户应为在线状态', () => {
      registerOnlineUser('user-1', 'socket-1');
      expect(isUserOnline('user-1')).toBe(true);
    });

    test('未注册的用户应为离线状态', () => {
      expect(isUserOnline('user-unknown')).toBe(false);
    });

    test('同一用户多个连接应都被追踪', () => {
      registerOnlineUser('user-1', 'socket-1');
      registerOnlineUser('user-1', 'socket-2');
      expect(isUserOnline('user-1')).toBe(true);
      expect(getOnlineUserCount()).toBe(1);
    });

    test('注销一个连接后，若还有其他连接，用户仍在线', () => {
      registerOnlineUser('user-1', 'socket-1');
      registerOnlineUser('user-1', 'socket-2');
      unregisterOnlineUser('user-1', 'socket-1');
      expect(isUserOnline('user-1')).toBe(true);
    });

    test('注销所有连接后，用户应为离线状态', () => {
      registerOnlineUser('user-1', 'socket-1');
      unregisterOnlineUser('user-1', 'socket-1');
      expect(isUserOnline('user-1')).toBe(false);
    });

    test('注销不存在的用户不应报错', () => {
      expect(() => unregisterOnlineUser('user-unknown', 'socket-1')).not.toThrow();
    });

    test('getOnlineUserCount 应返回正确的在线用户数', () => {
      registerOnlineUser('user-1', 'socket-1');
      registerOnlineUser('user-2', 'socket-2');
      expect(getOnlineUserCount()).toBe(2);
    });
  });

  describe('离线消息缓存', () => {
    test('缓存离线消息后，消息数量应增加', () => {
      cacheOfflineMessage('user-1', 'message:new', { content: 'hello' });
      expect(getOfflineMessageCount('user-1')).toBe(1);
    });

    test('缓存多条离线消息', () => {
      cacheOfflineMessage('user-1', 'message:new', { content: 'msg1' });
      cacheOfflineMessage('user-1', 'message:new', { content: 'msg2' });
      cacheOfflineMessage('user-1', 'match:success', { conversationId: 'conv-1' });
      expect(getOfflineMessageCount('user-1')).toBe(3);
    });

    test('离线消息超过500条时，应保留最近的500条', () => {
      // 缓存 510 条消息
      for (let i = 0; i < 510; i++) {
        cacheOfflineMessage('user-1', 'message:new', { content: `msg-${i}` });
      }
      expect(getOfflineMessageCount('user-1')).toBe(MAX_OFFLINE_MESSAGES);
    });

    test('超过500条时，丢弃最早的消息，保留最近的', () => {
      // 缓存 502 条消息
      for (let i = 0; i < 502; i++) {
        cacheOfflineMessage('user-1', 'message:new', { content: `msg-${i}` });
      }
      expect(getOfflineMessageCount('user-1')).toBe(500);
    });

    test('超过500条时，保留的应是最近的500条消息内容', () => {
      // 缓存 505 条消息（msg-0 到 msg-504）
      for (let i = 0; i < 505; i++) {
        cacheOfflineMessage('user-1', 'message:new', { content: `msg-${i}` });
      }

      // 推送离线消息并验证内容
      const mockSocket = { emit: jest.fn() };
      deliverOfflineMessages('user-1', mockSocket);

      // 应推送500条
      expect(mockSocket.emit).toHaveBeenCalledTimes(500);

      // 第一条应是 msg-5（最早的5条 msg-0~msg-4 被丢弃）
      expect(mockSocket.emit.mock.calls[0][1]).toEqual({ content: 'msg-5' });

      // 最后一条应是 msg-504
      expect(mockSocket.emit.mock.calls[499][1]).toEqual({ content: 'msg-504' });
    });

    test('未缓存消息的用户，离线消息数量应为0', () => {
      expect(getOfflineMessageCount('user-unknown')).toBe(0);
    });
  });

  describe('deliverOfflineMessages - 上线后推送离线消息', () => {
    test('上线后应按时间顺序推送所有离线消息', () => {
      // 模拟缓存消息（手动设置不同时间戳）
      cacheOfflineMessage('user-1', 'message:new', { content: 'first' });
      cacheOfflineMessage('user-1', 'match:success', { conversationId: 'conv-1' });
      cacheOfflineMessage('user-1', 'message:new', { content: 'third' });

      const mockSocket = { emit: jest.fn() };
      deliverOfflineMessages('user-1', mockSocket);

      // 应推送3条消息
      expect(mockSocket.emit).toHaveBeenCalledTimes(3);

      // 验证推送顺序（按时间升序）
      expect(mockSocket.emit.mock.calls[0][0]).toBe('message:new');
      expect(mockSocket.emit.mock.calls[0][1]).toEqual({ content: 'first' });
      expect(mockSocket.emit.mock.calls[1][0]).toBe('match:success');
      expect(mockSocket.emit.mock.calls[2][0]).toBe('message:new');
      expect(mockSocket.emit.mock.calls[2][1]).toEqual({ content: 'third' });
    });

    test('推送后应清空离线消息队列', () => {
      cacheOfflineMessage('user-1', 'message:new', { content: 'hello' });

      const mockSocket = { emit: jest.fn() };
      deliverOfflineMessages('user-1', mockSocket);

      expect(getOfflineMessageCount('user-1')).toBe(0);
    });

    test('无离线消息时不应调用 emit', () => {
      const mockSocket = { emit: jest.fn() };
      deliverOfflineMessages('user-1', mockSocket);
      expect(mockSocket.emit).not.toHaveBeenCalled();
    });
  });

  describe('emitToUser - 向用户推送事件', () => {
    test('用户离线时，消息应被缓存', () => {
      emitToUser('offline-user', 'message:new', { content: 'hello' });
      expect(getOfflineMessageCount('offline-user')).toBe(1);
    });

    test('userId 为 null 或 undefined 时不应报错', () => {
      expect(() => emitToUser(null, 'message:new', {})).not.toThrow();
      expect(() => emitToUser(undefined, 'message:new', {})).not.toThrow();
    });
  });

  describe('emitMatchSuccess - 匹配成功通知', () => {
    test('应向双方推送 match:success 事件', () => {
      // 双方都离线，消息应被缓存
      emitMatchSuccess('user-a', 'user-b', 'conv-123');

      expect(getOfflineMessageCount('user-a')).toBe(1);
      expect(getOfflineMessageCount('user-b')).toBe(1);
    });

    test('推送数据应包含 conversationId 和 partnerId', () => {
      emitMatchSuccess('user-a', 'user-b', 'conv-123');

      // 验证缓存的消息内容
      const mockSocket = { emit: jest.fn() };

      deliverOfflineMessages('user-a', mockSocket);
      expect(mockSocket.emit).toHaveBeenCalledWith('match:success', {
        conversationId: 'conv-123',
        partnerId: 'user-b',
      });

      deliverOfflineMessages('user-b', mockSocket);
      expect(mockSocket.emit).toHaveBeenCalledWith('match:success', {
        conversationId: 'conv-123',
        partnerId: 'user-a',
      });
    });
  });

  describe('emitRecommendation - 每日推荐通知', () => {
    test('应向用户推送 recommendation:new 事件', () => {
      const data = { matchIds: ['match-1', 'match-2'], date: '2024-01-01' };
      emitRecommendation('user-1', data);

      expect(getOfflineMessageCount('user-1')).toBe(1);

      const mockSocket = { emit: jest.fn() };
      deliverOfflineMessages('user-1', mockSocket);
      expect(mockSocket.emit).toHaveBeenCalledWith('recommendation:new', data);
    });
  });

  describe('emitNewMessage - 新消息通知', () => {
    test('应向用户推送 message:new 事件', () => {
      const message = { id: 'msg-1', content: 'hello', senderId: 'user-a' };
      emitNewMessage('user-b', message);

      expect(getOfflineMessageCount('user-b')).toBe(1);

      const mockSocket = { emit: jest.fn() };
      deliverOfflineMessages('user-b', mockSocket);
      expect(mockSocket.emit).toHaveBeenCalledWith('message:new', { message });
    });
  });

  describe('initWebSocket - Socket.IO 初始化', () => {
    test('应返回 Socket.IO 服务器实例', async () => {
      // 创建一个更完整的 mock HTTP server（Socket.IO 需要 listeners 方法）
      const { createServer } = await import('http');
      const mockHttpServer = createServer();

      const ioInstance = initWebSocket(mockHttpServer, {
        deps: {
          verifyToken: jest.fn().mockReturnValue({ userId: 'user-1' }),
          sendMessageFn: jest.fn(),
        },
      });

      expect(ioInstance).toBeDefined();
      expect(typeof ioInstance.on).toBe('function');
      expect(typeof ioInstance.emit).toBe('function');

      // 清理
      ioInstance.close();
      mockHttpServer.close();
      resetState();
    });
  });
});
