import 'package:flutter/material.dart';

import '../../core/constants/app_colors.dart';
import '../../core/constants/app_sizes.dart';

/// 通用加载状态组件
///
/// 居中的 CircularProgressIndicator，可选的加载文字。
/// 用于页面加载中或数据请求中的统一加载展示。
class LoadingWidget extends StatelessWidget {
  const LoadingWidget({
    super.key,
    this.message,
  });

  /// 可选的加载提示文字
  final String? message;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const CircularProgressIndicator(
            color: AppColors.primary,
          ),
          if (message != null) ...[
            const SizedBox(height: AppSizes.spacingMd),
            Text(
              message!,
              style: const TextStyle(
                fontSize: AppSizes.fontMd,
                color: AppColors.textSecondary,
              ),
            ),
          ],
        ],
      ),
    );
  }
}
