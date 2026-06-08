/**
 * 聊天服务单元测试
 */
import { jest } from '@jest/globals';
import {
  sendMessage,
  getMessages,
  endConversation,
} from '../../../src/services/chatService.js';

// 创建 mock Prisma 客户端
function createMockPrisma() {
  return {
    conversation: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    message: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
    },
    match: {
      update: jest.fn(),
    },
  };
}

// 创建基础 Conversation 数据
function createActiveConversation(overrides = {}) {
  return {
    id: 'conv-1',
    matchId: 'match-1',
    userAId: 'user-a',
    userBId: 'user-b',
    status: 'active',
    introduction: null,
    icebreakers: [],
    createdAt: new Date('2024-06-15T10:00:00.000Z'),
    endedAt: null,
    ...overrides,
  };
}

// 创建基础 Message 数据
function createMessage(overrides = {}) {
  return {
    id: 'msg-1',
    conversationId: 'conv-1',
    senderId: 'user-a',
    content: '你好！',
    type: 'text',
    isRead: false,
    createdAt: new Date('2024-06-15T12:00:00.000Z'),
    ...overrides,
  };
}

describe('chatService', () => {
  let mockPrisma;
  const fixedNow = new Date('2024-06-15T12:00:00.000Z');
  const getNow = () => fixedNow;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
  });

  describe('sendMessage', () => {
    it('消息为空时应抛出 400 错误', async () => {
      await expect(
        sendMessage('user-a', 'conv-1', '', { prismaClient: mockPrisma })
      ).rejects.toThrow('消息不能为空');
    });

    it('消息仅包含空白字符时应抛出 400 错误', async () => {
      await expect(
        sendMessage('user-a', 'conv-1', '   \n\t  ', { prismaClient: mockPrisma })
      ).rejects.toThrow('消息不能为空');
    });

    it('消息为 null 时应抛出 400 错误', async () => {
      await expect(
        sendMessage('user-a', 'conv-1', null, { prismaClient: mockPrisma })
      ).rejects.toThrow('消息不能为空');
    });

    it('消息为 undefined 时应抛出 400 错误', async () => {
      await expect(
        sendMessage('user-a', 'conv-1', undefined, { prismaClient: mockPrisma })
      ).rejects.toThrow('消息不能为空');
    });

    it('消息超过1000字符时应抛出 400 错误', async () => {
      const longMessage = 'a'.repeat(1001);
      await expect(
        sendMessage('user-a', 'conv-1', longMessage, { prismaClient: mockPrisma })
      ).rejects.toThrow('单条消息长度不能超过1000个字符');
    });

    it('消息恰好1000字符时应成功', async () => {
      const exactMessage = 'a'.repeat(1000);
      const conversation = createActiveConversation();
      mockPrisma.conversation.findUnique.mockResolvedValue(conversation);
      mockPrisma.message.create.mockResolvedValue(
        createMessage({ content: exactMessage })
      );

      const result = await sendMessage('user-a', 'conv-1', exactMessage, {
        prismaClient: mockPrisma,
      });

      expect(result).toBeDefined();
      expect(mockPrisma.message.create).toHaveBeenCalled();
    });

    it('对话不存在时应抛出 404 错误', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue(null);

      await expect(
        sendMessage('user-a', 'conv-1', '你好', { prismaClient: mockPrisma })
      ).rejects.toThrow('对话不存在');
    });

    it('用户不是参与方时应抛出 403 错误', async () => {
      const conversation = createActiveConversation();
      mockPrisma.conversation.findUnique.mockResolvedValue(conversation);

      await expect(
        sendMessage('user-c', 'conv-1', '你好', { prismaClient: mockPrisma })
      ).rejects.toThrow('您不是该对话的参与方');
    });

    it('对话已结束时应抛出 400 错误', async () => {
      const conversation = createActiveConversation({ status: 'ended' });
      mockPrisma.conversation.findUnique.mockResolvedValue(conversation);

      await expect(
        sendMessage('user-a', 'conv-1', '你好', { prismaClient: mockPrisma })
      ).rejects.toThrow('对话已结束，无法发送消息');
    });

    it('合法消息应成功创建', async () => {
      const conversation = createActiveConversation();
      const expectedMessage = createMessage({ content: '你好！' });
      mockPrisma.conversation.findUnique.mockResolvedValue(conversation);
      mockPrisma.message.create.mockResolvedValue(expectedMessage);

      const result = await sendMessage('user-a', 'conv-1', '你好！', {
        prismaClient: mockPrisma,
      });

      expect(result).toEqual(expectedMessage);
      expect(mockPrisma.message.create).toHaveBeenCalledWith({
        data: {
          conversationId: 'conv-1',
          senderId: 'user-a',
          content: '你好！',
          type: 'text',
        },
      });
    });

    it('userB 也可以发送消息', async () => {
      const conversation = createActiveConversation();
      const expectedMessage = createMessage({ senderId: 'user-b', content: '你好！' });
      mockPrisma.conversation.findUnique.mockResolvedValue(conversation);
      mockPrisma.message.create.mockResolvedValue(expectedMessage);

      const result = await sendMessage('user-b', 'conv-1', '你好！', {
        prismaClient: mockPrisma,
      });

      expect(result).toEqual(expectedMessage);
    });

    it('消息恰好1个字符时应成功', async () => {
      const conversation = createActiveConversation();
      const expectedMessage = createMessage({ content: 'A' });
      mockPrisma.conversation.findUnique.mockResolvedValue(conversation);
      mockPrisma.message.create.mockResolvedValue(expectedMessage);

      const result = await sendMessage('user-a', 'conv-1', 'A', {
        prismaClient: mockPrisma,
      });

      expect(result).toBeDefined();
      expect(mockPrisma.message.create).toHaveBeenCalled();
    });

    it('消息恰好999字符时应成功', async () => {
      const msg = 'x'.repeat(999);
      const conversation = createActiveConversation();
      mockPrisma.conversation.findUnique.mockResolvedValue(conversation);
      mockPrisma.message.create.mockResolvedValue(createMessage({ content: msg }));

      const result = await sendMessage('user-a', 'conv-1', msg, {
        prismaClient: mockPrisma,
      });

      expect(result).toBeDefined();
    });

    it('对话状态为 ended 时 userB 也无法发送消息', async () => {
      const conversation = createActiveConversation({ status: 'ended' });
      mockPrisma.conversation.findUnique.mockResolvedValue(conversation);

      await expect(
        sendMessage('user-b', 'conv-1', '你好', { prismaClient: mockPrisma })
      ).rejects.toThrow('对话已结束，无法发送消息');
    });
  });

  describe('getMessages', () => {
    it('对话不存在时应抛出 404 错误', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue(null);

      await expect(
        getMessages('user-a', 'conv-1', {}, { prismaClient: mockPrisma })
      ).rejects.toThrow('对话不存在');
    });

    it('用户不是参与方时应抛出 403 错误', async () => {
      const conversation = createActiveConversation();
      mockPrisma.conversation.findUnique.mockResolvedValue(conversation);

      await expect(
        getMessages('user-c', 'conv-1', {}, { prismaClient: mockPrisma })
      ).rejects.toThrow('您不是该对话的参与方');
    });

    it('应返回分页消息列表（默认第1页，每页20条）', async () => {
      const conversation = createActiveConversation();
      const messages = [createMessage(), createMessage({ id: 'msg-2' })];
      mockPrisma.conversation.findUnique.mockResolvedValue(conversation);
      mockPrisma.message.findMany.mockResolvedValue(messages);
      mockPrisma.message.count.mockResolvedValue(2);

      const result = await getMessages('user-a', 'conv-1', {}, { prismaClient: mockPrisma });

      expect(result.messages).toEqual(messages);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
      expect(mockPrisma.message.findMany).toHaveBeenCalledWith({
        where: { conversationId: 'conv-1' },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 20,
      });
    });

    it('应支持自定义分页参数', async () => {
      const conversation = createActiveConversation();
      mockPrisma.conversation.findUnique.mockResolvedValue(conversation);
      mockPrisma.message.findMany.mockResolvedValue([]);
      mockPrisma.message.count.mockResolvedValue(50);

      const result = await getMessages(
        'user-a',
        'conv-1',
        { page: 3, pageSize: 10 },
        { prismaClient: mockPrisma }
      );

      expect(result.page).toBe(3);
      expect(result.pageSize).toBe(10);
      expect(mockPrisma.message.findMany).toHaveBeenCalledWith({
        where: { conversationId: 'conv-1' },
        orderBy: { createdAt: 'desc' },
        skip: 20,
        take: 10,
      });
    });

    it('对话已结束时仍可查看历史消息', async () => {
      const conversation = createActiveConversation({ status: 'ended' });
      const messages = [createMessage()];
      mockPrisma.conversation.findUnique.mockResolvedValue(conversation);
      mockPrisma.message.findMany.mockResolvedValue(messages);
      mockPrisma.message.count.mockResolvedValue(1);

      const result = await getMessages('user-a', 'conv-1', {}, { prismaClient: mockPrisma });

      expect(result.messages).toEqual(messages);
    });
  });

  describe('endConversation', () => {
    it('对话不存在时应抛出 404 错误', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue(null);

      await expect(
        endConversation('user-a', 'conv-1', { prismaClient: mockPrisma, getNow })
      ).rejects.toThrow('对话不存在');
    });

    it('用户不是参与方时应抛出 403 错误', async () => {
      const conversation = createActiveConversation();
      mockPrisma.conversation.findUnique.mockResolvedValue(conversation);

      await expect(
        endConversation('user-c', 'conv-1', { prismaClient: mockPrisma, getNow })
      ).rejects.toThrow('您不是该对话的参与方');
    });

    it('对话已结束时应抛出 400 错误', async () => {
      const conversation = createActiveConversation({ status: 'ended' });
      mockPrisma.conversation.findUnique.mockResolvedValue(conversation);

      await expect(
        endConversation('user-a', 'conv-1', { prismaClient: mockPrisma, getNow })
      ).rejects.toThrow('对话已经结束');
    });

    it('应成功结束对话并设置 endedAt', async () => {
      const conversation = createActiveConversation();
      const updatedConversation = { ...conversation, status: 'ended', endedAt: fixedNow };
      mockPrisma.conversation.findUnique.mockResolvedValue(conversation);
      mockPrisma.conversation.update.mockResolvedValue(updatedConversation);

      const result = await endConversation('user-a', 'conv-1', {
        prismaClient: mockPrisma,
        getNow,
      });

      expect(result.status).toBe('ended');
      expect(result.endedAt).toEqual(fixedNow);
      expect(mockPrisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 'conv-1' },
        data: {
          status: 'ended',
          endedAt: fixedNow,
        },
      });
    });

    it('userB 也可以结束对话', async () => {
      const conversation = createActiveConversation();
      const updatedConversation = { ...conversation, status: 'ended', endedAt: fixedNow };
      mockPrisma.conversation.findUnique.mockResolvedValue(conversation);
      mockPrisma.conversation.update.mockResolvedValue(updatedConversation);

      const result = await endConversation('user-b', 'conv-1', {
        prismaClient: mockPrisma,
        getNow,
      });

      expect(result.status).toBe('ended');
    });
  });
});
