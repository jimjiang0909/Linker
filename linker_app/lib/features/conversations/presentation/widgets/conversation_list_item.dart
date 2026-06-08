import 'package:flutter/material.dart';

import '../../../../core/constants/api_constants.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/constants/app_sizes.dart';
import '../../../../core/constants/app_strings.dart';
import '../../../../shared/models/conversation.dart';

/// 对话列表项组件
///
/// 展示单个对话的信息，包括：
/// - 对方头像（圆形，带占位图）
/// - 对方姓名
/// - 最后一条消息预览（截取前30字符）
/// - 最后消息时间（智能格式化）
/// - 未读消息数量角标
/// - 已结束对话标签
class ConversationListItem extends StatelessWidget {
  const ConversationListItem({
    super.key,
    required this.conversation,
    required this.onTap,
  });

  final Conversation conversation;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSizes.spacingMd,
          vertical: AppSizes.spacingMd,
        ),
        child: Row(
          children: [
            _buildAvatar(),
            const SizedBox(width: AppSizes.spacingMd),
            Expanded(child: _buildContent(context)),
            _buildTrailing(context),
          ],
        ),
      ),
    );
  }

  /// 构建头像
  Widget _buildAvatar() {
    return CircleAvatar(
      radius: AppSizes.avatarMd / 2,
      backgroundColor: AppColors.primaryLight.withValues(alpha: 0.3),
      backgroundImage: conversation.partnerPhotoUrl != null
          ? NetworkImage(ApiConstants.fullImageUrl(conversation.partnerPhotoUrl!))
          : null,
      child: conversation.partnerPhotoUrl == null
          ? Text(
              conversation.partnerName.isNotEmpty
                  ? conversation.partnerName[0].toUpperCase()
                  : '?',
              style: const TextStyle(
                fontSize: AppSizes.fontXl,
                fontWeight: FontWeight.w600,
                color: AppColors.primary,
              ),
            )
          : null,
    );
  }

  /// 构建中间内容区域（姓名 + 最后消息预览）
  Widget _buildContent(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                conversation.partnerName,
                style: Theme.of(context).textTheme.titleSmall?.copyWith(
                      fontWeight: conversation.unreadCount > 0
                          ? FontWeight.w700
                          : FontWeight.w500,
                    ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            if (conversation.status == ConversationStatus.ended)
              Container(
                margin: const EdgeInsets.only(left: AppSizes.spacingXs),
                padding: const EdgeInsets.symmetric(
                  horizontal: AppSizes.spacingSm,
                  vertical: 2,
                ),
                decoration: BoxDecoration(
                  color: AppColors.textHint.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(AppSizes.radiusSm),
                ),
                child: Text(
                  AppStrings.conversationEnded,
                  style: TextStyle(
                    fontSize: AppSizes.fontXs,
                    color: AppColors.textHint,
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: AppSizes.spacingXs),
        Text(
          _getMessagePreview(),
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: conversation.unreadCount > 0
                    ? AppColors.textPrimary
                    : AppColors.textSecondary,
                fontWeight: conversation.unreadCount > 0
                    ? FontWeight.w500
                    : FontWeight.normal,
              ),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
      ],
    );
  }

  /// 构建右侧区域（时间 + 未读角标）
  Widget _buildTrailing(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        Text(
          _formatTime(conversation.lastMessageAt),
          style: TextStyle(
            fontSize: AppSizes.fontXs,
            color: AppColors.textHint,
          ),
        ),
        const SizedBox(height: AppSizes.spacingXs),
        if (conversation.unreadCount > 0) _buildUnreadBadge(),
      ],
    );
  }

  /// 构建未读角标
  Widget _buildUnreadBadge() {
    final text =
        conversation.unreadCount > 99 ? '99+' : '${conversation.unreadCount}';
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: 6,
        vertical: 2,
      ),
      constraints: const BoxConstraints(minWidth: AppSizes.badgeSize),
      decoration: BoxDecoration(
        color: AppColors.badge,
        borderRadius: BorderRadius.circular(AppSizes.radiusFull),
      ),
      child: Text(
        text,
        style: const TextStyle(
          color: AppColors.textWhite,
          fontSize: AppSizes.fontXs,
          fontWeight: FontWeight.w600,
        ),
        textAlign: TextAlign.center,
      ),
    );
  }

  /// 获取消息预览（截取前30字符）
  String _getMessagePreview() {
    final message = conversation.lastMessage;
    if (message == null || message.isEmpty) return '';
    if (message.length <= 30) return message;
    return '${message.substring(0, 30)}...';
  }

  /// 格式化时间显示
  ///
  /// - 今天：显示 HH:mm
  /// - 昨天：显示"昨天"
  /// - 本周内：显示星期几
  /// - 更早：显示 MM/DD
  String _formatTime(DateTime? dateTime) {
    if (dateTime == null) return '';

    final local = dateTime.toLocal();
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final messageDate =
        DateTime(local.year, local.month, local.day);
    final difference = today.difference(messageDate).inDays;

    if (difference == 0) {
      // 今天：显示时间
      return '${local.hour.toString().padLeft(2, '0')}:${local.minute.toString().padLeft(2, '0')}';
    } else if (difference == 1) {
      return 'Yesterday';
    } else if (difference < 7) {
      const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      return weekdays[local.weekday - 1];
    } else {
      return '${local.month}/${local.day}';
    }
  }
}
