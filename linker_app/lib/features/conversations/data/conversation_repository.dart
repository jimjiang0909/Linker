import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/api_constants.dart';
import '../../../core/network/api_client.dart';
import '../../../shared/models/conversation.dart';
import '../../../shared/models/message.dart';

/// 消息分页响应
class MessagePage {
  final List<Message> messages;
  final bool hasMore;

  const MessagePage({
    required this.messages,
    required this.hasMore,
  });
}

/// 对话仓库
///
/// 封装对话相关的 API 调用，包括获取对话列表、消息历史、发送消息、
/// 结束对话和举报。
/// 错误由 [ErrorInterceptor] 统一处理，Repository 层不需要额外的 try-catch。
class ConversationRepository {
  final ApiClient _apiClient;

  ConversationRepository(this._apiClient);

  /// 获取对话列表
  ///
  /// 调用 GET /api/conversations
  /// 返回 [List<Conversation>] 对话列表。
  ///
  /// 后端响应格式：
  /// ```json
  /// {
  ///   "code": "SUCCESS",
  ///   "data": [{ "id": "...", "otherUser": {...}, "lastMessage": {...} }]
  /// }
  /// ```
  /// 获取对话列表结果
  Future<({List<Conversation> conversations, int totalUnreadCount})> getConversations() async {
    final response = await _apiClient.get(ApiConstants.conversations);
    final json = response.data as Map<String, dynamic>;
    final rawData = json['data'];
    final List<dynamic> data;
    int totalUnreadCount = 0;
    if (rawData is List) {
      data = rawData;
    } else if (rawData is Map<String, dynamic>) {
      data = rawData['conversations'] as List<dynamic>? ?? [];
      totalUnreadCount = rawData['totalUnreadCount'] as int? ?? 0;
    } else {
      data = [];
    }
    final conversations = data.map((e) {
      final item = e as Map<String, dynamic>;
      // 如果后端返回的是新结构（含 otherUser），手动映射
      if (item.containsKey('otherUser')) {
        final otherUser = item['otherUser'] as Map<String, dynamic>?;
        final lastMsg = item['lastMessage'] as Map<String, dynamic>?;
        return Conversation(
          id: item['id'] as String,
          partnerName: otherUser?['name'] as String? ?? 'Unknown',
          partnerPhotoUrl: null,
          lastMessage: lastMsg?['content'] as String?,
          lastMessageAt: lastMsg?['createdAt'] != null
              ? DateTime.parse(lastMsg!['createdAt'] as String)
              : null,
          unreadCount: item['unreadCount'] as int? ?? 0,
          status: ConversationStatus.values
              .where((e) => e.name == (item['status'] as String? ?? 'active'))
              .firstOrNull ?? ConversationStatus.active,
          introduction: item['introduction'] as String?,
          icebreakers: (item['icebreakers'] as List<dynamic>?)
                  ?.map((e) => e as String)
                  .toList() ??
              [],
        );
      }
      // 兼容旧结构（直接平铺字段）
      return Conversation.fromJson(item);
    }).toList();
    return (conversations: conversations, totalUnreadCount: totalUnreadCount);
  }

  /// 获取消息历史（分页）
  ///
  /// 调用 GET /api/conversations/:id/messages
  /// [conversationId] 对话 ID
  /// [limit] 每页消息数量，默认 20
  /// [before] 游标，获取此 ID 之前的消息（用于向上加载更早消息）
  ///
  /// 后端响应格式：
  /// ```json
  /// {
  ///   "code": "SUCCESS",
  ///   "data": {
  ///     "messages": [...],
  ///     "hasMore": true
  ///   }
  /// }
  /// ```
  Future<MessagePage> getMessages(
    String conversationId, {
    int limit = 20,
    String? before,
  }) async {
    final queryParams = <String, dynamic>{
      'limit': limit,
    };
    if (before != null) {
      queryParams['before'] = before;
    }

    final response = await _apiClient.get(
      ApiConstants.conversationMessages(conversationId),
      queryParams: queryParams,
    );
    final json = response.data as Map<String, dynamic>;
    final data = json['data'] as Map<String, dynamic>;
    final messagesJson = data['messages'] as List<dynamic>;

    // 兼容两种分页结构：
    // 1. { messages, hasMore }
    // 2. { messages, total, page, pageSize }
    final bool hasMore;
    if (data.containsKey('hasMore')) {
      hasMore = data['hasMore'] as bool? ?? false;
    } else {
      hasMore = messagesJson.length >= limit;
    }

    final messages = messagesJson
        .map((item) => Message.fromJson(item as Map<String, dynamic>))
        .toList();

    return MessagePage(messages: messages, hasMore: hasMore);
  }

  /// 发送消息（REST 备用方式）
  ///
  /// 调用 POST /api/conversations/:id/messages
  /// 主要通过 WebSocket 发送消息，此方法作为备用。
  ///
  /// 后端响应格式：
  /// ```json
  /// {
  ///   "code": "SUCCESS",
  ///   "data": { "id": "...", "content": "...", ... }
  /// }
  /// ```
  Future<Message> sendMessage(String conversationId, String content) async {
    final response = await _apiClient.post(
      ApiConstants.conversationMessages(conversationId),
      data: {'content': content},
    );
    final json = response.data as Map<String, dynamic>;
    final data = json['data'] as Map<String, dynamic>;
    return Message.fromJson(data);
  }

  /// 结束对话
  ///
  /// 调用 POST /api/conversations/:id/end
  Future<void> endConversation(String conversationId) async {
    await _apiClient.post(ApiConstants.conversationEnd(conversationId));
  }

  /// 举报对话
  ///
  /// 调用 POST /api/conversations/:id/report
  /// [reason] 举报原因
  Future<void> report(String conversationId, String reason) async {
    await _apiClient.post(
      ApiConstants.conversationReport(conversationId),
      data: {'reason': reason},
    );
  }
}

/// ConversationRepository 的 Riverpod Provider
final conversationRepositoryProvider = Provider<ConversationRepository>((ref) {
  final apiClient = ref.watch(apiClientProvider);
  return ConversationRepository(apiClient);
});
