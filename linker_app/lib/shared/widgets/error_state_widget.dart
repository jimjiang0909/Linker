import 'package:flutter/material.dart';

import '../../core/constants/app_colors.dart';
import '../../core/constants/app_sizes.dart';
import '../../core/constants/app_strings.dart';

/// 通用错误状态页面组件
///
/// 展示错误图标、错误描述文字和"重试"按钮。
/// 用于页面加载失败或 API 请求出错时的统一错误展示。
class ErrorStateWidget extends StatelessWidget {
  const ErrorStateWidget({
    super.key,
    required this.errorMessage,
    this.onRetry,
  });

  /// 错误描述文字
  final String errorMessage;

  /// 重试按钮回调，为 null 时不展示重试按钮
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSizes.spacingLg),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(
              Icons.error_outline,
              size: AppSizes.iconXl,
              color: AppColors.error,
            ),
            const SizedBox(height: AppSizes.spacingMd),
            Text(
              errorMessage,
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: AppSizes.fontMd,
                color: AppColors.textSecondary,
              ),
            ),
            if (onRetry != null) ...[
              const SizedBox(height: AppSizes.spacingLg),
              FilledButton.icon(
                onPressed: onRetry,
                icon: const Icon(Icons.refresh),
                label: const Text(AppStrings.retry),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
