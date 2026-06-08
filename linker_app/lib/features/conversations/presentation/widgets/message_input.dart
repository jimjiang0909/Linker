import 'package:flutter/material.dart';

import '../../../../core/constants/app_colors.dart';
import '../../../../core/constants/app_sizes.dart';
import '../../../../core/constants/app_strings.dart';

/// 消息输入框组件
///
/// 底部消息输入区域，包含：
/// - 多行文本输入框（最多5行自动扩展）
/// - 发送按钮
/// - 字符数限制（1000字符）
/// - 对话已结束时禁用状态
class MessageInput extends StatefulWidget {
  const MessageInput({
    super.key,
    required this.enabled,
    required this.onSend,
  });

  /// 是否启用输入（对话已结束时为 false）
  final bool enabled;

  /// 发送消息回调
  final ValueChanged<String> onSend;

  @override
  State<MessageInput> createState() => _MessageInputState();
}

class _MessageInputState extends State<MessageInput> {
  final TextEditingController _controller = TextEditingController();
  final FocusNode _focusNode = FocusNode();

  /// 最大字符数限制
  static const int _maxLength = 1000;

  bool get _canSend =>
      widget.enabled &&
      _controller.text.trim().isNotEmpty &&
      _controller.text.length <= _maxLength;

  @override
  void initState() {
    super.initState();
    _controller.addListener(() {
      setState(() {});
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  void _handleSend() {
    if (!_canSend) return;

    final content = _controller.text.trim();
    _controller.clear();
    widget.onSend(content);
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        boxShadow: [
          BoxShadow(
            color: AppColors.shadow,
            blurRadius: 4,
            offset: const Offset(0, -1),
          ),
        ],
      ),
      child: SafeArea(
        child: widget.enabled ? _buildInput() : _buildDisabledState(),
      ),
    );
  }

  /// 构建输入框
  Widget _buildInput() {
    return Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSizes.spacingMd,
        vertical: AppSizes.spacingSm,
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Expanded(
            child: TextField(
              controller: _controller,
              focusNode: _focusNode,
              maxLines: 5,
              minLines: 1,
              maxLength: _maxLength,
              textInputAction: TextInputAction.send,
              onSubmitted: (_) => _handleSend(),
              decoration: InputDecoration(
                hintText: AppStrings.messagePlaceholder,
                hintStyle: TextStyle(color: AppColors.textHint),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(AppSizes.radiusXl),
                  borderSide: BorderSide(color: AppColors.border),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(AppSizes.radiusXl),
                  borderSide: BorderSide(color: AppColors.border),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(AppSizes.radiusXl),
                  borderSide: const BorderSide(color: AppColors.primary),
                ),
                contentPadding: const EdgeInsets.symmetric(
                  horizontal: AppSizes.spacingMd,
                  vertical: AppSizes.spacingSm + 2,
                ),
                counterText: '', // 隐藏字符计数器
                isDense: true,
              ),
            ),
          ),
          const SizedBox(width: AppSizes.spacingSm),
          _buildSendButton(),
        ],
      ),
    );
  }

  /// 构建发送按钮
  Widget _buildSendButton() {
    return Material(
      color: _canSend ? AppColors.primary : AppColors.disabled,
      borderRadius: BorderRadius.circular(AppSizes.radiusFull),
      child: InkWell(
        onTap: _canSend ? _handleSend : null,
        borderRadius: BorderRadius.circular(AppSizes.radiusFull),
        child: Container(
          width: 40,
          height: 40,
          alignment: Alignment.center,
          child: Icon(
            Icons.send_rounded,
            color: _canSend ? AppColors.textWhite : AppColors.textHint,
            size: AppSizes.iconSm + 4,
          ),
        ),
      ),
    );
  }

  /// 构建禁用状态（对话已结束）
  Widget _buildDisabledState() {
    return Container(
      padding: const EdgeInsets.symmetric(
        vertical: AppSizes.spacingMd,
      ),
      child: Center(
        child: Text(
          AppStrings.conversationEnded,
          style: TextStyle(
            color: AppColors.textHint,
            fontSize: AppSizes.fontMd,
          ),
        ),
      ),
    );
  }
}
