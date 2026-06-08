/**
 * 集成测试 - WebSocket 消息实时传递
 * 测试 Socket.IO 实际连接、认证、消息发送和接收
 *
 * 验证:
 * - WebSocket JWT 认证握手
 * - message:send 事件处理（接收消息、存储、转发给对方）
 * - message:new 事件推送（实时送达）
 * - match:success 事件推送（匹配成功通知双方）
 * - 离线消息缓存和上线后推送
 * - 无效认证被拒绝
 * - 需求: 5.2, 6.2
 */
import { jest } from '@jest/globals';
import http from 'http';
import { Server } from 'socket.io';
import { io as ioClient } from 'socket.io-client';
import {
  initWebSocket,
  emitMatchSuccess,
  emitToUser,
  cacheOfflineMessage,
  resetState,
  getOnlineUserCount,
  getOfflineMessageCount,
} from '../../src/websocket/index.js';

// ============================================================
// 测试辅助
// ============================================================

function createTestServer() {
  const httpServer = http.createServer();
  return httpServer;
}

function createClient(port, token, options = {}) {
  return ioClient(`http://localhost:${port}`, {
    auth: { token },
    transports: ['websocket'],
    forceNew: true,
    ...options,
  });
}

function waitForEvent(emitter, event, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for event: ${event}`)), timeout);
    emitter.once(event, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

function waitForConnect(client, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Connection timeout')), timeout);
    client.on('connect', () => {
      clearTimeout(timer);
      resolve();
    });
    client.on('connect_error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

// ============================================================
// 测试
// ============================================================

describe('WebSocket 消息实时传递集成测试', () => {
  let httpServer;
  let ioServer;
  let port;

  // Mock 依赖
  const mockSendMessage = jest.fn();
  const mockPrisma = {
    conversation: {
      findUnique: jest.fn(),
    },
  };

  // 简单的 JWT 验证 mock
  const verifyToken = (token) => {
    if (token === 'invalid-token') throw new Error('Invalid token');
    if (token === 'expired-token') {
      const err = new Error('Token expired');
      err.name = 'TokenExpiredError';
      throw err;
    }
    // token 格式: "token-{userId}"
    const userId = token.replace('token-', '');
    if (!userId) throw new Error('Invalid token');
    return { userId };
  };

  beforeEach((done) => {
    resetState();
    jest.clearAllMocks();

    httpServer = createTestServer();
    ioServer = initWebSocket(httpServer, {
      deps: {
        verifyToken,
        sendMessageFn: mockSendMessage,
        prismaClient: mockPrisma,
      },
    });

    httpServer.listen(0, () => {
      port = httpServer.address().port;
      done();
    });
  });

  afterEach((done) => {
    resetState();
    if (ioServer) ioServer.close();
    if (httpServer) httpServer.close(done);
    else done();
  });

  describe('JWT 认证握手', () => {
    it('有效 Token 应成功连接', async () => {
      const client = createClient(port, 'token-user-a');
      await waitForConnect(client);

      expect(client.connected).toBe(true);
      expect(getOnlineUserCount()).toBe(1);

      client.disconnect();
    });

    it('缺少 Token 应拒绝连接', async () => {
      const client = createClient(port, '');

      await expect(waitForConnect(client)).rejects.toThrow();
      expect(client.connected).toBe(false);

      client.disconnect();
    });

    it('无效 Token 应拒绝连接', async () => {
      const client = createClient(port, 'invalid-token');

      await expect(waitForConnect(client)).rejects.toThrow();
      expect(client.connected).toBe(false);

      client.disconnect();
    });

    it('过期 Token 应拒绝连接', async () => {
      const client = createClient(port, 'expired-token');

      await expect(waitForConnect(client)).rejects.toThrow();
      expect(client.connected).toBe(false);

      client.disconnect();
    });
  });

  describe('message:send 事件处理 - 消息发送和转发', () => {
    it('应接收消息、存储并转发给对方（需求 6.2）', async () => {
      // 设置 mock
      const mockMessage = {
        id: 'msg-001',
        conversationId: 'conv-1',
        senderId: 'user-a',
        content: '你好！',
        type: 'text',
        createdAt: new Date().toISOString(),
      };
      mockSendMessage.mockResolvedValue(mockMessage);
      mockPrisma.conversation.findUnique.mockResolvedValue({
        id: 'conv-1',
        userAId: 'user-a',
        userBId: 'user-b',
        status: 'active',
      });

      // 连接双方用户
      const clientA = createClient(port, 'token-user-a');
      const clientB = createClient(port, 'token-user-b');
      await Promise.all([waitForConnect(clientA), waitForConnect(clientB)]);

      // userA 发送消息
      const messageNewPromise = waitForEvent(clientB, 'message:new');

      const ackPromise = new Promise((resolve) => {
        clientA.emit('message:send', { conversationId: 'conv-1', content: '你好！' }, resolve);
      });

      // 验证 ack 回调
      const ackResult = await ackPromise;
      expect(ackResult.success).toBe(true);
      expect(ackResult.message).toEqual(mockMessage);

      // 验证 chatService.sendMessage 被调用
      expect(mockSendMessage).toHaveBeenCalledWith('user-a', 'conv-1', '你好！');

      // 验证 userB 收到 message:new 事件
      const receivedData = await messageNewPromise;
      expect(receivedData.message).toEqual(mockMessage);

      clientA.disconnect();
      clientB.disconnect();
    });

    it('缺少参数时应返回错误', async () => {
      const client = createClient(port, 'token-user-a');
      await waitForConnect(client);

      const ackResult = await new Promise((resolve) => {
        client.emit('message:send', { conversationId: 'conv-1' }, resolve); // 缺少 content
      });

      expect(ackResult.error).toBeDefined();
      expect(ackResult.error.code).toBe('INVALID_PARAMS');

      client.disconnect();
    });

    it('sendMessage 失败时应返回错误', async () => {
      mockSendMessage.mockRejectedValue(new Error('对话已结束，无法发送消息'));

      const client = createClient(port, 'token-user-a');
      await waitForConnect(client);

      const ackResult = await new Promise((resolve) => {
        client.emit('message:send', { conversationId: 'conv-1', content: '测试' }, resolve);
      });

      expect(ackResult.error).toBeDefined();
      expect(ackResult.error.message).toContain('对话已结束');

      client.disconnect();
    });
  });

  describe('match:success 事件推送（需求 5.2）', () => {
    it('匹配成功时应通知双方用户', async () => {
      const clientA = createClient(port, 'token-user-a');
      const clientB = createClient(port, 'token-user-b');
      await Promise.all([waitForConnect(clientA), waitForConnect(clientB)]);

      // 监听 match:success 事件
      const matchPromiseA = waitForEvent(clientA, 'match:success');
      const matchPromiseB = waitForEvent(clientB, 'match:success');

      // 触发匹配成功通知
      emitMatchSuccess('user-a', 'user-b', 'conv-new');

      // 验证双方都收到通知
      const dataA = await matchPromiseA;
      expect(dataA.conversationId).toBe('conv-new');
      expect(dataA.partnerId).toBe('user-b');

      const dataB = await matchPromiseB;
      expect(dataB.conversationId).toBe('conv-new');
      expect(dataB.partnerId).toBe('user-a');

      clientA.disconnect();
      clientB.disconnect();
    });
  });

  describe('离线消息缓存和推送（需求 6.6）', () => {
    it('用户离线时消息应被缓存，上线后按时间顺序推送', async () => {
      // 用户 B 离线，缓存消息
      cacheOfflineMessage('user-b', 'message:new', { message: { id: 'msg-1', content: '第一条' } });
      cacheOfflineMessage('user-b', 'message:new', { message: { id: 'msg-2', content: '第二条' } });
      cacheOfflineMessage('user-b', 'match:success', { conversationId: 'conv-1', partnerId: 'user-a' });

      expect(getOfflineMessageCount('user-b')).toBe(3);

      // 用户 B 上线
      const receivedEvents = [];
      const clientB = createClient(port, 'token-user-b');

      clientB.on('message:new', (data) => receivedEvents.push({ event: 'message:new', data }));
      clientB.on('match:success', (data) => receivedEvents.push({ event: 'match:success', data }));

      await waitForConnect(clientB);

      // 等待离线消息推送完成
      await new Promise((resolve) => setTimeout(resolve, 100));

      // 验证收到所有离线消息
      expect(receivedEvents.length).toBe(3);
      expect(receivedEvents[0].event).toBe('message:new');
      expect(receivedEvents[0].data.message.content).toBe('第一条');
      expect(receivedEvents[1].event).toBe('message:new');
      expect(receivedEvents[1].data.message.content).toBe('第二条');
      expect(receivedEvents[2].event).toBe('match:success');
      expect(receivedEvents[2].data.conversationId).toBe('conv-1');

      // 离线消息队列应被清空
      expect(getOfflineMessageCount('user-b')).toBe(0);

      clientB.disconnect();
    });

    it('在线用户应直接收到消息而非缓存', async () => {
      const clientA = createClient(port, 'token-user-a');
      await waitForConnect(clientA);

      const eventPromise = waitForEvent(clientA, 'recommendation:new');

      // 直接推送给在线用户
      emitToUser('user-a', 'recommendation:new', { matchIds: ['match-1'] });

      const data = await eventPromise;
      expect(data.matchIds).toEqual(['match-1']);

      // 不应有离线消息缓存
      expect(getOfflineMessageCount('user-a')).toBe(0);

      clientA.disconnect();
    });
  });

  describe('断开连接处理', () => {
    it('用户断开连接后应从在线列表移除', async () => {
      const client = createClient(port, 'token-user-a');
      await waitForConnect(client);

      expect(getOnlineUserCount()).toBe(1);

      client.disconnect();

      // 等待断开事件处理
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(getOnlineUserCount()).toBe(0);
    });

    it('同一用户多个连接时，断开一个不影响其他连接', async () => {
      const client1 = createClient(port, 'token-user-a');
      const client2 = createClient(port, 'token-user-a');
      await Promise.all([waitForConnect(client1), waitForConnect(client2)]);

      expect(getOnlineUserCount()).toBe(1); // 同一用户只算1个

      // 断开一个连接
      client1.disconnect();
      await new Promise((resolve) => setTimeout(resolve, 100));

      // 用户仍然在线（还有另一个连接）
      expect(getOnlineUserCount()).toBe(1);

      client2.disconnect();
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(getOnlineUserCount()).toBe(0);
    });
  });
});
