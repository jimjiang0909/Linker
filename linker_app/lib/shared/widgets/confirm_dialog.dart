import 'package:flutter/material.dart';

import '../../core/constants/app_strings.dart';

/// 通用确认对话框组件
///
/// 封装 showDialog + AlertDialog，
/// 返回 `Future<bool>` 表示用户选择（确认为 true，取消为 false）。
class ConfirmDialog {
  /// 显示确认对话框
  ///
  /// [context] - BuildContext
  /// [title] - 对话框标题
  /// [content] - 对话框内容
  /// [confirmLabel] - 确认按钮文字，默认"确认"
  /// [cancelLabel] - 取消按钮文字，默认"取消"
  /// [isDestructive] - 确认按钮是否为破坏性操作（红色）
  ///
  /// 返回 true 表示用户点击确认，false 表示取消或关闭对话框
  static Future<bool> show({
    required BuildContext context,
    required String title,
    required String content,
    String? confirmLabel,
    String? cancelLabel,
    bool isDestructive = false,
  }) async {
    final result = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(title),
        content: Text(content),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: Text(cancelLabel ?? AppStrings.cancel),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            style: isDestructive
                ? TextButton.styleFrom(
                    foregroundColor: Theme.of(context).colorScheme.error,
                  )
                : null,
            child: Text(confirmLabel ?? AppStrings.confirm),
          ),
        ],
      ),
    );
    return result ?? false;
  }
}
