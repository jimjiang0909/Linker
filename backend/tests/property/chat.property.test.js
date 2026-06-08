/**
 * 聊天模块属性测试
 * 使用 fast-check 验证消息有效性的正确性属性
 *
 * **Validates: Requirements 6.3, 6.4, 6.9**
 */
import { describe, it, expect, jest } from '@jest/globals';
import fc from 'fast-check';
import { uuidArb, validMessageContentArb, invalidMessageContentArb } from '../helpers/index.js';
import { createMockPrismaClient } from '../helpers/mockFactory.js';
import { sendMessage } from '../../src/services/chatService.js';

// ============================================================
// 辅助生成器
// ============================================================

/**
 * 生成一个 active 状态的 Conversation 对象
 */
const activeConversationArb = fc
  .tuple(uuidArb, uuidArb, uuidArb)
  .filter(([id, userAId, userBId]) => userAId !== userBId)
  .map(([id, userAId, userBId]) => ({
    id,
    userAId,
    userBId,
    status: 'active',
    matchId: 'match-id',
    introduction: '介绍语',
    icebreakers: ['话题1', '话题2'],
    createdAt: new Date(),
    endedAt: null,
  }));

/**
 * 生成一个 ended 状态的 Conversation 对象
 */
const endedConversationArb = fc
  .tuple(uuidArb, uuidArb, uuidArb)
  .filter(([id, userAId, userBId]) => userAId !== userBId)
  .map(([id, userAId, userBId]) => ({
    id,
    userAId,
    userBId,
    status: 'ended',
    matchId: 'match-id',
    introduction: '介绍语',
    icebreakers: ['话题1', '话题2'],
    createdAt: new Date(),
    endedAt: new Date(),
  }));

/**
 * 空消息或仅空白字符的生成器
 */
const emptyOrWhitespaceContentArb = fc.oneof(
  fc.constant(''),
  fc.constant(null),
  fc.constant(undefined),
  fc.stringOf(fc.constantFrom(' ', '\t', '\n', '\r'), { minLength: 1, maxLength: 20 })
);

/**
 * 超过1000字符的消息生成器
 */
const tooLongContentArb = fc
  .stringOf(
    fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz你好世界测试消息'.split('')),
    { minLength: 1001, maxLength: 1200 }
  );

/**
 * 有效消息内容生成器（非空、非纯空白、≤1000字符）
 */
const validContentArb = fc
  .stringOf(
    fc.constantFrom(...'你好很高兴认识请问有什么爱好吗我喜欢旅行读书运动今天天气不错'.split('')),
    { minLength: 1, maxLength: 100 }
  )
  .filter(s => s.trim().length > 0);

// ============================================================
// 属性 11: 消息有效性验证
// ============================================================

describe('Feature: linker-mvp, Property 11: 消息有效性验证', () => {
  /**
   * **Validates: Requirements 6.3, 6.4, 6.9**
   *
   * 对于任意消息发送请求：
   * - 空消息/仅空白字符被拒绝
   * - 超过1000字符被拒绝
   * - Conversation 已结束时被拒绝
   * - 仅当消息非空、≤1000字符、Conversation 为 active 时接受
   */

  it('空消息或仅空白字符应被拒绝', async () => {
    await fc.assert(
      fc.asyncProperty(
        activeConversationArb,
        emptyOrWhitespaceContentArb,
        fc.constantFrom('A', 'B'),
        async (conversation, content, side) => {
          const mockPrisma = createMockPrismaClient();
          const userId = side === 'A' ? conversation.userAId : conversation.userBId;

          mockPrisma.conversation.findUnique.mockResolvedValue(conversation);

          await expect(
            sendMessage(userId, conversation.id, content, { prismaClient: mockPrisma })
          ).rejects.toMatchObject({
            statusCode: 400,
            code: 'EMPTY_MESSAGE',
          });

          // 不应创建消息记录
          expect(mockPrisma.message.create).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('超过1000字符的消息应被拒绝', async () => {
    await fc.assert(
      fc.asyncProperty(
        activeConversationArb,
        tooLongContentArb,
        fc.constantFrom('A', 'B'),
        async (conversation, content, side) => {
          const mockPrisma = createMockPrismaClient();
          const userId = side === 'A' ? conversation.userAId : conversation.userBId;

          mockPrisma.conversation.findUnique.mockResolvedValue(conversation);

          await expect(
            sendMessage(userId, conversation.id, content, { prismaClient: mockPrisma })
          ).rejects.toMatchObject({
            statusCode: 400,
            code: 'MESSAGE_TOO_LONG',
          });

          // 不应创建消息记录
          expect(mockPrisma.message.create).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Conversation 已结束时发送消息应被拒绝', async () => {
    await fc.assert(
      fc.asyncProperty(
        endedConversationArb,
        validContentArb,
        fc.constantFrom('A', 'B'),
        async (conversation, content, side) => {
          const mockPrisma = createMockPrismaClient();
          const userId = side === 'A' ? conversation.userAId : conversation.userBId;

          mockPrisma.conversation.findUnique.mockResolvedValue(conversation);

          await expect(
            sendMessage(userId, conversation.id, content, { prismaClient: mockPrisma })
          ).rejects.toMatchObject({
            statusCode: 400,
            code: 'CONVERSATION_ENDED',
          });

          // 不应创建消息记录
          expect(mockPrisma.message.create).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('有效消息（非空、≤1000字符、Conversation 为 active）应被接受', async () => {
    await fc.assert(
      fc.asyncProperty(
        activeConversationArb,
        validContentArb,
        fc.constantFrom('A', 'B'),
        async (conversation, content, side) => {
          const mockPrisma = createMockPrismaClient();
          const userId = side === 'A' ? conversation.userAId : conversation.userBId;

          mockPrisma.conversation.findUnique.mockResolvedValue(conversation);

          const createdMessage = {
            id: 'msg-id',
            conversationId: conversation.id,
            senderId: userId,
            content,
            type: 'text',
            createdAt: new Date(),
          };
          mockPrisma.message.create.mockResolvedValue(createdMessage);

          const result = await sendMessage(userId, conversation.id, content, {
            prismaClient: mockPrisma,
          });

          // 应成功创建消息
          expect(result).toBeDefined();
          expect(result.content).toBe(content);
          expect(result.senderId).toBe(userId);
          expect(result.conversationId).toBe(conversation.id);

          // 验证 message.create 被调用
          expect(mockPrisma.message.create).toHaveBeenCalledWith(
            expect.objectContaining({
              data: expect.objectContaining({
                conversationId: conversation.id,
                senderId: userId,
                content,
                type: 'text',
              }),
            })
          );
        }
      ),
      { numRuns: 100 }
    );
  });
});
