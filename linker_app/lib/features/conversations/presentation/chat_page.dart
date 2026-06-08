import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/app_sizes.dart';
import '../../../core/constants/app_strings.dart';
import '../../../core/storage/secure_storage.dart';
import '../../../shared/models/conversation.dart';
import '../../../shared/models/message.dart';
import '../providers/conversations_provider.dart';
import 'widgets/message_bubble.dart';
import 'widgets/message_input.dart';
import 'widgets/report_bottom_sheet.dart';

/// 聊天详情页面
///
/// 展示消息列表（气泡形式）、底部输入框和发送按钮。
/// 支持：
/// - 消息乐观更新（发送后立即展示）
/// - WebSocket 实时接收新消息
/// - 向上滚动加载更早消息（分页）
/// - 结束对话和举报功能（AppBar 更多菜单）
/// - 对话已结束时禁用输入框
class ChatPage extends ConsumerStatefulWidget {
  const ChatPage({super.key, required this.conversationId});

  final String conversationId;

  @override
  ConsumerState<ChatPage> createState() => _ChatPageState();
}

class _ChatPageState extends ConsumerState<ChatPage> {
  final ScrollController _scrollController = ScrollController();
  bool _isLoadingMore = false;
  String? _currentUserId;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
    // 加载消息历史
    Future.microtask(() {
      _loadInitialData();
    });
  }

  Future<void> _loadInitialData() async {
    final chatNotifier = ref.read(chatProvider(widget.conversationId).notifier);

    // 设置当前用户ID用于判断消息方向
    final secureStorage = ref.read(secureStorageProvider);
    final userId = await secureStorage.getUserId();
    if (userId != null) {
      chatNotifier.setCurrentUserId(userId);
      _currentUserId = userId;
    }

    // 从对话列表获取对话状态
    final conversationsState = ref.read(conversationsProvider);
    if (conversationsState is AsyncData<List<Conversation>>) {
      final conversation = conversationsState.value
          .where((c) => c.id == widget.conversationId)
          .firstOrNull;
      if (conversation != null) {
        chatNotifier.setConversationStatus(conversation.status);
      }
    }

    await chatNotifier.loadMessages(widget.conversationId);
    _scrollToBottom();
  }

  @override
  void dispose() {
    _scrollController.removeListener(_onScroll);
    _scrollController.dispose();
    super.dispose();
  }

  /// 监听滚动事件，向上滚动到顶部时加载更早消息
  void _onScroll() {
    if (_scrollController.position.pixels <=
            _scrollController.position.minScrollExtent + 50 &&
        !_isLoadingMore) {
      _loadMoreMessages();
    }
  }

  /// 加载更早的消息
  Future<void> _loadMoreMessages() async {
    final chatState = ref.read(chatProvider(widget.conversationId));
    if (!chatState.hasMore || chatState.isLoading) return;

    setState(() => _isLoadingMore = true);
    await ref
        .read(chatProvider(widget.conversationId).notifier)
        .loadMoreMessages(widget.conversationId);
    setState(() => _isLoadingMore = false);
  }

  /// 滚动到底部
  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  /// 发送消息
  void _handleSendMessage(String content) {
    ref
        .read(chatProvider(widget.conversationId).notifier)
        .sendMessage(widget.conversationId, content);
    _scrollToBottom();
  }

  /// 结束对话
  Future<void> _handleEndConversation() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text(AppStrings.endConversation),
        content: const Text(AppStrings.endConversationConfirm),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text(AppStrings.cancel),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text(AppStrings.confirm),
          ),
        ],
      ),
    );

    if (confirmed == true && mounted) {
      try {
        await ref
            .read(chatProvider(widget.conversationId).notifier)
            .endConversation(widget.conversationId);
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Conversation ended')),
          );
        }
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Failed: $e')),
          );
        }
      }
    }
  }

  /// 举报
  Future<void> _handleReport() async {
    final reason = await showModalBottomSheet<String>(
      context: context,
      builder: (context) => const ReportBottomSheet(),
    );

    if (reason != null && mounted) {
      try {
        await ref
            .read(chatProvider(widget.conversationId).notifier)
            .reportConversation(widget.conversationId, reason);
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Report submitted')),
          );
        }
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Report failed: $e')),
          );
        }
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final chatState = ref.watch(chatProvider(widget.conversationId));
    final isEnded = chatState.conversationStatus == ConversationStatus.ended;

    // 监听消息列表变化，自动滚动到底部
    ref.listen(chatProvider(widget.conversationId), (previous, next) {
      if (previous != null &&
          next.messages.length > previous.messages.length) {
        // 新消息追加时滚动到底部
        final lastMsg = next.messages.last;
        if (lastMsg.sendStatus == MessageSendStatus.sending ||
            lastMsg.senderId != (previous.messages.lastOrNull?.senderId)) {
          _scrollToBottom();
        }
      }
    });

    return Scaffold(
      appBar: AppBar(
        title: _buildTitle(),
        actions: [
          PopupMenuButton<String>(
            onSelected: (value) {
              switch (value) {
                case 'end':
                  _handleEndConversation();
                case 'report':
                  _handleReport();
              }
            },
            itemBuilder: (context) => [
              if (!isEnded)
                const PopupMenuItem(
                  value: 'end',
                  child: Row(
                    children: [
                      Icon(Icons.block, size: AppSizes.iconSm),
                      SizedBox(width: AppSizes.spacingSm),
                      Text(AppStrings.endConversation),
                    ],
                  ),
                ),
              const PopupMenuItem(
                value: 'report',
                child: Row(
                  children: [
                    Icon(Icons.flag_outlined, size: AppSizes.iconSm),
                    SizedBox(width: AppSizes.spacingSm),
                    Text(AppStrings.report),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
      body: Column(
        children: [
          // 消息列表
          Expanded(
            child: _buildMessageList(chatState),
          ),
          // 输入框
          MessageInput(
            enabled: !isEnded,
            onSend: _handleSendMessage,
          ),
        ],
      ),
    );
  }

  /// 构建标题
  Widget _buildTitle() {
    final conversationsState = ref.watch(conversationsProvider);
    String title = 'Chat';

    if (conversationsState is AsyncData<List<Conversation>>) {
      final conversation = conversationsState.value
          .where((c) => c.id == widget.conversationId)
          .firstOrNull;
      if (conversation != null) {
        title = conversation.partnerName;
      }
    }

    return Text(title);
  }

  /// 构建消息列表
  Widget _buildMessageList(ChatState chatState) {
    if (chatState.isLoading && chatState.messages.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }

    return ListView.builder(
      controller: _scrollController,
      padding: const EdgeInsets.symmetric(
        horizontal: AppSizes.spacingMd,
        vertical: AppSizes.spacingSm,
      ),
      itemCount: chatState.messages.length + (_isLoadingMore ? 1 : 0),
      itemBuilder: (context, index) {
        // 顶部加载指示器
        if (_isLoadingMore && index == 0) {
          return const Padding(
            padding: EdgeInsets.all(AppSizes.spacingSm),
            child: Center(
              child: SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            ),
          );
        }

        final messageIndex = _isLoadingMore ? index - 1 : index;
        final message = chatState.messages[messageIndex];

        return MessageBubble(
          message: message,
          isMe: _isMyMessage(message),
          onResend: message.sendStatus == MessageSendStatus.failed
              ? () => _handleResend(message)
              : null,
        );
      },
    );
  }

  /// 判断是否是自己发送的消息
  bool _isMyMessage(Message message) {
    if (message.id.startsWith('temp_')) return true;
    if (_currentUserId != null) {
      return message.senderId == _currentUserId;
    }
    return message.senderId == 'me';
  }

  /// 重发消息
  void _handleResend(Message message) {
    ref
        .read(chatProvider(widget.conversationId).notifier)
        .resendMessage(widget.conversationId, message.id, message.content);
  }
}
