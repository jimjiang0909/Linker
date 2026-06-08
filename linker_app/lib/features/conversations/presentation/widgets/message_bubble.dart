import 'package:flutter/material.dart';

import '../../../../core/constants/app_colors.dart';
import '../../../../core/constants/app_sizes.dart';
import '../../../../shared/models/message.dart';

/// 消息气泡组件
///
/// 根据消息类型和发送者展示不同样式：
/// - 自己发送的消息：靠右，主色调背景
/// - 对方发送的消息：靠左，灰色背景
/// - 系统消息（介绍语、破冰话题）：居中，特殊样式
///
/// 发送失败的消息显示红色感叹号，点击可重发。
class MessageBubble extends StatelessWidget {
  const MessageBubble({
    super.key,
    required this.message,
    required this.isMe,
    this.onResend,
  });

  final Message message;
  final bool isMe;
  final VoidCallback? onResend;

  @override
  Widget build(BuildContext context) {
    // 系统消息居中展示
    if (message.type == MessageType.system ||
        message.type == MessageType.introduction ||
        message.type == MessageType.icebreaker) {
      return _buildSystemMessage(context);
    }

    // 普通消息
    return _buildChatMessage(context);
  }

  /// 构建系统消息（居中）
  Widget _buildSystemMessage(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSizes.spacingSm),
      child: Center(
        child: Container(
          constraints: BoxConstraints(
            maxWidth: MediaQuery.of(context).size.width * 0.75,
          ),
          padding: const EdgeInsets.symmetric(
            horizontal: AppSizes.spacingMd,
            vertical: AppSizes.spacingSm,
          ),
          decoration: BoxDecoration(
            color: _getSystemMessageColor(),
            borderRadius: BorderRadius.circular(AppSizes.radiusLg),
          ),
          child: Column(
            children: [
              if (message.type == MessageType.introduction)
                Padding(
                  padding: const EdgeInsets.only(bottom: AppSizes.spacingXs),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        Icons.auto_awesome,
                        size: AppSizes.iconSm,
                        color: AppColors.primary,
                      ),
                      const SizedBox(width: AppSizes.spacingXs),
                      Text(
                        'AI Intro',
                        style: TextStyle(
                          fontSize: AppSizes.fontSm,
                          fontWeight: FontWeight.w600,
                          color: AppColors.primary,
                        ),
                      ),
                    ],
                  ),
                ),
              if (message.type == MessageType.icebreaker)
                Padding(
                  padding: const EdgeInsets.only(bottom: AppSizes.spacingXs),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        Icons.tips_and_updates_outlined,
                        size: AppSizes.iconSm,
                        color: AppColors.secondary,
                      ),
                      const SizedBox(width: AppSizes.spacingXs),
                      Text(
                        'Icebreaker',
                        style: TextStyle(
                          fontSize: AppSizes.fontSm,
                          fontWeight: FontWeight.w600,
                          color: AppColors.secondary,
                        ),
                      ),
                    ],
                  ),
                ),
              Text(
                message.content,
                style: TextStyle(
                  fontSize: AppSizes.fontMd,
                  color: AppColors.textPrimary,
                ),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// 获取系统消息背景色
  Color _getSystemMessageColor() {
    switch (message.type) {
      case MessageType.introduction:
        return AppColors.primaryLight.withValues(alpha: 0.15);
      case MessageType.icebreaker:
        return AppColors.secondaryLight.withValues(alpha: 0.3);
      default:
        return AppColors.divider.withValues(alpha: 0.5);
    }
  }

  /// 构建聊天消息（靠左或靠右）
  Widget _buildChatMessage(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSizes.spacingXs),
      child: Row(
        mainAxisAlignment:
            isMe ? MainAxisAlignment.end : MainAxisAlignment.start,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          if (isMe && message.sendStatus == MessageSendStatus.failed)
            _buildFailedIndicator(),
          if (isMe && message.sendStatus == MessageSendStatus.sending)
            _buildSendingIndicator(),
          Flexible(
            child: Container(
              constraints: BoxConstraints(
                maxWidth: MediaQuery.of(context).size.width * 0.7,
              ),
              padding: const EdgeInsets.symmetric(
                horizontal: AppSizes.spacingMd,
                vertical: AppSizes.spacingSm + 2,
              ),
              decoration: BoxDecoration(
                color: isMe ? AppColors.primary : AppColors.surface,
                borderRadius: BorderRadius.only(
                  topLeft: const Radius.circular(AppSizes.radiusLg),
                  topRight: const Radius.circular(AppSizes.radiusLg),
                  bottomLeft: isMe
                      ? const Radius.circular(AppSizes.radiusLg)
                      : const Radius.circular(AppSizes.radiusSm),
                  bottomRight: isMe
                      ? const Radius.circular(AppSizes.radiusSm)
                      : const Radius.circular(AppSizes.radiusLg),
                ),
                boxShadow: [
                  BoxShadow(
                    color: AppColors.shadow,
                    blurRadius: 4,
                    offset: const Offset(0, 1),
                  ),
                ],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    message.content,
                    style: TextStyle(
                      fontSize: AppSizes.fontMd,
                      color: isMe ? AppColors.textWhite : AppColors.textPrimary,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    _formatTime(message.createdAt),
                    style: TextStyle(
                      fontSize: AppSizes.fontXs,
                      color: isMe
                          ? AppColors.textWhite.withValues(alpha: 0.7)
                          : AppColors.textHint,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// 构建发送失败指示器
  Widget _buildFailedIndicator() {
    return Padding(
      padding: const EdgeInsets.only(right: AppSizes.spacingXs),
      child: GestureDetector(
        onTap: onResend,
        child: const Icon(
          Icons.error,
          color: AppColors.error,
          size: AppSizes.iconMd,
        ),
      ),
    );
  }

  /// 构建发送中指示器
  Widget _buildSendingIndicator() {
    return const Padding(
      padding: EdgeInsets.only(right: AppSizes.spacingXs),
      child: SizedBox(
        width: 14,
        height: 14,
        child: CircularProgressIndicator(
          strokeWidth: 1.5,
          color: AppColors.textHint,
        ),
      ),
    );
  }

  /// 格式化时间
  String _formatTime(DateTime dateTime) {
    final local = dateTime.toLocal();
    return '${local.hour.toString().padLeft(2, '0')}:${local.minute.toString().padLeft(2, '0')}';
  }
}
