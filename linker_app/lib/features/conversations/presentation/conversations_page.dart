import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_sizes.dart';
import '../../../core/constants/app_strings.dart';
import '../../../core/router/app_routes.dart';
import '../../../shared/models/conversation.dart';
import '../providers/conversations_provider.dart';
import 'widgets/conversation_list_item.dart';

/// 对话列表页面
///
/// 展示所有对话，按最后消息时间倒序排列。
/// 支持下拉刷新和 WebSocket 实时更新。
/// 空状态时展示提示信息和跳转按钮。
class ConversationsPage extends ConsumerStatefulWidget {
  const ConversationsPage({super.key});

  @override
  ConsumerState<ConversationsPage> createState() => _ConversationsPageState();
}

class _ConversationsPageState extends ConsumerState<ConversationsPage> {
  @override
  void initState() {
    super.initState();
    // 页面初始化时加载对话列表
    Future.microtask(() {
      ref.read(conversationsProvider.notifier).fetchConversations();
    });
  }

  @override
  Widget build(BuildContext context) {
    final conversationsState = ref.watch(conversationsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text(AppStrings.conversations),
        centerTitle: true,
      ),
      body: conversationsState.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => _buildErrorState(context, error),
        data: (conversations) {
          if (conversations.isEmpty) {
            return _buildEmptyState(context);
          }
          return _buildConversationList(conversations);
        },
      ),
    );
  }

  /// 构建对话列表
  Widget _buildConversationList(List<Conversation> conversations) {
    return RefreshIndicator(
      onRefresh: () async {
        await ref.read(conversationsProvider.notifier).fetchConversations();
      },
      child: ListView.separated(
        itemCount: conversations.length,
        separatorBuilder: (context, index) => const Divider(
          height: AppSizes.dividerThickness,
          indent: AppSizes.spacingMd + AppSizes.avatarMd + AppSizes.spacingMd,
        ),
        itemBuilder: (context, index) {
          final conversation = conversations[index];
          return ConversationListItem(
            conversation: conversation,
            onTap: () {
              // 标记为已读
              ref
                  .read(conversationsProvider.notifier)
                  .markConversationAsRead(conversation.id);
              // 导航到聊天详情页
              context.push(AppRoutes.chatPath(conversation.id));
            },
          );
        },
      ),
    );
  }

  /// 构建空状态页面
  Widget _buildEmptyState(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSizes.spacingXl),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.chat_bubble_outline,
              size: 80,
              color: AppColors.textHint.withValues(alpha: 0.5),
            ),
            const SizedBox(height: AppSizes.spacingLg),
            Text(
              AppStrings.noConversations,
              style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                    color: AppColors.textSecondary,
                  ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: AppSizes.spacingLg),
            FilledButton.icon(
              onPressed: () {
                context.go(AppRoutes.matches);
              },
              icon: const Icon(Icons.favorite_outline),
              label: const Text('Check Recommendations'),
            ),
          ],
        ),
      ),
    );
  }

  /// 构建错误状态页面
  Widget _buildErrorState(BuildContext context, Object error) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSizes.spacingXl),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.error_outline,
              size: 64,
              color: AppColors.error.withValues(alpha: 0.7),
            ),
            const SizedBox(height: AppSizes.spacingMd),
            Text(
              'Failed to load. Please try again.',
              style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                    color: AppColors.textSecondary,
                  ),
            ),
            const SizedBox(height: AppSizes.spacingLg),
            FilledButton.icon(
              onPressed: () {
                ref.read(conversationsProvider.notifier).fetchConversations();
              },
              icon: const Icon(Icons.refresh),
              label: const Text(AppStrings.retry),
            ),
          ],
        ),
      ),
    );
  }
}
