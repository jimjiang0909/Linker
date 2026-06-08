import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/websocket_client.dart';
import '../../../shared/models/conversation.dart';
import '../../../shared/models/message.dart';
import '../../../shared/providers/unread_count_provider.dart';
import '../data/conversation_repository.dart';

/// 对话列表状态管理
///
/// 管理对话列表的获取、实时更新和未读计数。
/// 监听 WebSocket message:new 事件，实时更新对话列表中对应对话的
/// 最后消息预览和未读计数，并将对话移动到列表顶部。
class ConversationsNotifier extends Notifier<AsyncValue<List<Conversation>>> {
  StreamSubscription<NewMessageEvent>? _messageSubscription;

  @override
  AsyncValue<List<Conversation>> build() {
    _listenToWebSocket();
    ref.onDispose(() {
      _messageSubscription?.cancel();
    });
    return const AsyncValue.loading();
  }

  /// 监听 WebSocket 新消息事件
  void _listenToWebSocket() {
    final wsClient = ref.read(webSocketClientProvider);
    _messageSubscription = wsClient.onNewMessage.listen((event) {
      updateConversationOnNewMessage(
        conversationId: event.conversationId,
        lastMessage: event.content,
        lastMessageAt: event.createdAt,
        isMine: false, // WebSocket message:new only delivers other's messages
      );
    });
  }

  /// 获取对话列表
  Future<void> fetchConversations() async {
    state = const AsyncValue.loading();
    try {
      final repository = ref.read(conversationRepositoryProvider);
      final conversations = await repository.getConversations();
      // 按最后消息时间倒序排列
      conversations.sort(_sortByLastMessageDesc);
      state = AsyncValue.data(conversations);
      // 更新全局未读计数
      _updateUnreadCount(conversations);
    } catch (e, st) {
      state = AsyncValue.error(e, st);
    }
  }

  /// 收到新消息时更新对话列表
  ///
  /// 更新对应对话的最后消息预览、时间和未读计数，
  /// 并将该对话移动到列表顶部。
  void updateConversationOnNewMessage({
    required String conversationId,
    required String lastMessage,
    required DateTime lastMessageAt,
    bool isMine = false,
  }) {
    final currentState = state;
    if (currentState is! AsyncData<List<Conversation>>) return;

    final conversations = List<Conversation>.from(currentState.value);
    final index = conversations.indexWhere((c) => c.id == conversationId);

    if (index != -1) {
      final conversation = conversations[index];
      final updated = conversation.copyWith(
        lastMessage: lastMessage,
        lastMessageAt: lastMessageAt,
        unreadCount: isMine ? conversation.unreadCount : conversation.unreadCount + 1,
      );
      conversations.removeAt(index);
      conversations.insert(0, updated); // 移动到顶部
    }

    state = AsyncValue.data(conversations);
    _updateUnreadCount(conversations);
  }

  /// 发送消息成功后更新对话列表的最后消息（不增加未读数）
  void updateLastMessage({
    required String conversationId,
    required String lastMessage,
    required DateTime lastMessageAt,
  }) {
    final currentState = state;
    if (currentState is! AsyncData<List<Conversation>>) return;

    final conversations = List<Conversation>.from(currentState.value);
    final index = conversations.indexWhere((c) => c.id == conversationId);

    if (index != -1) {
      final conversation = conversations[index];
      final updated = conversation.copyWith(
        lastMessage: lastMessage,
        lastMessageAt: lastMessageAt,
      );
      conversations.removeAt(index);
      conversations.insert(0, updated);
    }

    state = AsyncValue.data(conversations);
  }

  /// 标记对话已读（清除未读计数）
  void markConversationAsRead(String conversationId) {
    final currentState = state;
    if (currentState is! AsyncData<List<Conversation>>) return;

    final conversations = currentState.value.map((c) {
      if (c.id == conversationId) {
        return c.copyWith(unreadCount: 0);
      }
      return c;
    }).toList();

    state = AsyncValue.data(conversations);
    _updateUnreadCount(conversations);
  }

  /// 更新对话状态为已结束
  void markConversationEnded(String conversationId) {
    final currentState = state;
    if (currentState is! AsyncData<List<Conversation>>) return;

    final conversations = currentState.value.map((c) {
      if (c.id == conversationId) {
        return c.copyWith(status: ConversationStatus.ended);
      }
      return c;
    }).toList();

    state = AsyncValue.data(conversations);
  }

  /// 更新全局未读消息总数
  void _updateUnreadCount(List<Conversation> conversations) {
    final totalUnread =
        conversations.fold<int>(0, (sum, c) => sum + c.unreadCount);
    ref.read(unreadCountProvider.notifier).setCount(totalUnread);
  }

  /// 按最后消息时间倒序排列比较函数
  int _sortByLastMessageDesc(Conversation a, Conversation b) {
    final aTime = a.lastMessageAt;
    final bTime = b.lastMessageAt;
    if (aTime == null && bTime == null) return 0;
    if (aTime == null) return 1;
    if (bTime == null) return -1;
    return bTime.compareTo(aTime);
  }
}

/// ConversationsNotifier 的 Riverpod Provider
final conversationsProvider =
    NotifierProvider<ConversationsNotifier, AsyncValue<List<Conversation>>>(
  ConversationsNotifier.new,
);

/// 聊天消息状态
class ChatState {
  final List<Message> messages;
  final bool isLoading;
  final bool hasMore;
  final ConversationStatus conversationStatus;

  const ChatState({
    this.messages = const [],
    this.isLoading = false,
    this.hasMore = true,
    this.conversationStatus = ConversationStatus.active,
  });

  ChatState copyWith({
    List<Message>? messages,
    bool? isLoading,
    bool? hasMore,
    ConversationStatus? conversationStatus,
  }) {
    return ChatState(
      messages: messages ?? this.messages,
      isLoading: isLoading ?? this.isLoading,
      hasMore: hasMore ?? this.hasMore,
      conversationStatus: conversationStatus ?? this.conversationStatus,
    );
  }
}

/// 聊天详情状态管理
///
/// 管理单个对话的消息列表、发送消息（乐观更新）、分页加载、
/// 结束对话和举报功能。
///
/// 使用 Notifier + family provider 模式，每个对话 ID 对应一个独立实例。
class ChatNotifier extends Notifier<ChatState> {
  final String conversationId;
  StreamSubscription<NewMessageEvent>? _messageSubscription;
  String? _currentUserId;

  ChatNotifier(this.conversationId);

  @override
  ChatState build() {
    _listenToWebSocket();
    ref.onDispose(() {
      _messageSubscription?.cancel();
    });
    return const ChatState();
  }

  /// 监听 WebSocket 新消息事件（仅当前对话）
  void _listenToWebSocket() {
    final wsClient = ref.read(webSocketClientProvider);
    _messageSubscription = wsClient.onNewMessage.listen((event) {
      if (event.conversationId == conversationId) {
        _addReceivedMessage(event);
      }
    });
  }

  /// 设置当前用户 ID（用于判断消息方向）
  void setCurrentUserId(String userId) {
    _currentUserId = userId;
  }

  /// 加载消息历史（初始加载）
  Future<void> loadMessages(String convId) async {
    state = state.copyWith(isLoading: true);
    try {
      final repository = ref.read(conversationRepositoryProvider);
      final page = await repository.getMessages(convId);
      state = state.copyWith(
        messages: page.messages.reversed.toList(),
        isLoading: false,
        hasMore: page.hasMore,
      );
    } catch (e) {
      state = state.copyWith(isLoading: false);
      rethrow;
    }
  }

  /// 加载更早的消息（分页加载）
  Future<void> loadMoreMessages(String convId) async {
    if (state.isLoading || !state.hasMore) return;
    if (state.messages.isEmpty) return;

    state = state.copyWith(isLoading: true);
    try {
      final repository = ref.read(conversationRepositoryProvider);
      final oldestMessageId = state.messages.first.id;
      final page = await repository.getMessages(
        convId,
        before: oldestMessageId,
      );
      state = state.copyWith(
        messages: [...page.messages.reversed, ...state.messages],
        isLoading: false,
        hasMore: page.hasMore,
      );
    } catch (e) {
      state = state.copyWith(isLoading: false);
    }
  }

  /// 发送消息（乐观更新）
  ///
  /// 1. 立即在消息列表中展示消息（状态=sending）
  /// 2. 通过 WebSocket 发送消息（未连接时降级为 HTTP）
  /// 3. 发送成功后用服务端返回的真实消息替换临时消息
  /// 4. 发送失败后标记为 failed
  Future<void> sendMessage(String convId, String content) async {
    final tempId = 'temp_${DateTime.now().millisecondsSinceEpoch}';
    final senderId = _currentUserId ?? 'me';

    // 乐观更新：立即展示消息
    final optimisticMessage = Message(
      id: tempId,
      conversationId: convId,
      senderId: senderId,
      content: content,
      type: MessageType.text,
      isRead: false,
      createdAt: DateTime.now(),
      sendStatus: MessageSendStatus.sending,
    );

    state = state.copyWith(
      messages: [...state.messages, optimisticMessage],
    );

    final wsClient = ref.read(webSocketClientProvider);

    if (wsClient.currentStatus == ConnectionStatus.connected) {
      // WebSocket 发送
      wsClient.sendMessage(
        conversationId: convId,
        content: content,
        onAck: (response) {
          if (response.containsKey('error')) {
            _updateMessageStatus(tempId, MessageSendStatus.failed);
          } else if (response.containsKey('message') &&
              response['message'] is Map<String, dynamic>) {
            final serverMsg = response['message'] as Map<String, dynamic>;
            _replaceTemporaryMessage(tempId, serverMsg);
            ref.read(conversationsProvider.notifier).updateLastMessage(
              conversationId: convId,
              lastMessage: content,
              lastMessageAt: serverMsg['createdAt'] != null
                  ? DateTime.parse(serverMsg['createdAt'] as String)
                  : DateTime.now(),
            );
          } else if (response.containsKey('success') &&
              response['success'] == true) {
            _updateMessageStatus(tempId, MessageSendStatus.sent);
          }
        },
      );
    } else {
      // HTTP REST 降级发送
      try {
        final repository = ref.read(conversationRepositoryProvider);
        final serverMsg = await repository.sendMessage(convId, content);
        _replaceTemporaryMessageFromModel(tempId, serverMsg);
        ref.read(conversationsProvider.notifier).updateLastMessage(
          conversationId: convId,
          lastMessage: content,
          lastMessageAt: serverMsg.createdAt,
        );
      } catch (e) {
        _updateMessageStatus(tempId, MessageSendStatus.failed);
      }
    }
  }

  /// 重发失败的消息
  Future<void> resendMessage(
      String convId, String messageId, String content) async {
    // 先更新状态为 sending
    _updateMessageStatus(messageId, MessageSendStatus.sending);

    try {
      final wsClient = ref.read(webSocketClientProvider);
      wsClient.sendMessage(
        conversationId: convId,
        content: content,
        onAck: (response) {
          if (response.containsKey('error')) {
            _updateMessageStatus(messageId, MessageSendStatus.failed);
          } else if (response.containsKey('message') &&
              response['message'] is Map<String, dynamic>) {
            final serverMsg = response['message'] as Map<String, dynamic>;
            _replaceTemporaryMessage(messageId, serverMsg);
          } else {
            _updateMessageStatus(messageId, MessageSendStatus.sent);
          }
        },
      );
    } catch (e) {
      _updateMessageStatus(messageId, MessageSendStatus.failed);
    }
  }

  /// 结束对话
  Future<void> endConversation(String convId) async {
    final repository = ref.read(conversationRepositoryProvider);
    await repository.endConversation(convId);
    state = state.copyWith(conversationStatus: ConversationStatus.ended);
    // 同步更新对话列表
    ref.read(conversationsProvider.notifier).markConversationEnded(convId);
  }

  /// 举报对话
  Future<void> reportConversation(String convId, String reason) async {
    final repository = ref.read(conversationRepositoryProvider);
    await repository.report(convId, reason);
  }

  /// 设置对话状态
  void setConversationStatus(ConversationStatus status) {
    state = state.copyWith(conversationStatus: status);
  }

  /// 收到新消息时追加到列表（带去重）
  void _addReceivedMessage(NewMessageEvent event) {
    // 去重：忽略自己发送的消息（已通过乐观更新展示）和已存在的消息
    if (event.senderId == _currentUserId) return;
    if (state.messages.any((m) => m.id == event.messageId)) return;

    final message = Message(
      id: event.messageId,
      conversationId: event.conversationId,
      senderId: event.senderId,
      content: event.content,
      type: MessageType.text,
      isRead: false,
      createdAt: event.createdAt,
      sendStatus: MessageSendStatus.sent,
    );

    state = state.copyWith(
      messages: [...state.messages, message],
    );
  }

  /// 更新消息发送状态
  void _updateMessageStatus(String messageId, MessageSendStatus sendStatus) {
    final messages = state.messages.map((m) {
      if (m.id == messageId) {
        return m.copyWith(sendStatus: sendStatus);
      }
      return m;
    }).toList();
    state = state.copyWith(messages: messages);
  }

  /// 用服务端返回的真实消息替换临时消息
  void _replaceTemporaryMessage(String tempId, Map<String, dynamic> serverMsg) {
    final messages = state.messages.map((m) {
      if (m.id == tempId) {
        return Message(
          id: serverMsg['id'] as String,
          conversationId: m.conversationId,
          senderId: m.senderId,
          content: m.content,
          type: MessageType.text,
          isRead: false,
          createdAt: serverMsg['createdAt'] != null
              ? DateTime.parse(serverMsg['createdAt'] as String)
              : m.createdAt,
          sendStatus: MessageSendStatus.sent,
        );
      }
      return m;
    }).toList();
    state = state.copyWith(messages: messages);
  }

  /// 用 Message 模型替换临时消息（HTTP降级时使用）
  void _replaceTemporaryMessageFromModel(String tempId, Message serverMsg) {
    final messages = state.messages.map((m) {
      if (m.id == tempId) {
        return serverMsg.copyWith(sendStatus: MessageSendStatus.sent);
      }
      return m;
    }).toList();
    state = state.copyWith(messages: messages);
  }
}

/// ChatNotifier 的 Riverpod Provider（按对话 ID 区分）
///
/// 使用 autoDispose 确保离开聊天页面后自动释放资源。
final chatProvider = NotifierProvider.family.autoDispose<ChatNotifier, ChatState, String>(
  (conversationId) => ChatNotifier(conversationId),
);
