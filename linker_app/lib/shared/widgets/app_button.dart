import 'package:flutter/material.dart';

import '../../core/constants/app_sizes.dart';

/// 通用主按钮组件（FilledButton 样式）
///
/// 支持 [isLoading] 参数，加载时显示 CircularProgressIndicator 并禁用按钮。
class AppPrimaryButton extends StatelessWidget {
  const AppPrimaryButton({
    super.key,
    required this.onPressed,
    required this.label,
    this.isLoading = false,
    this.icon,
    this.width,
  });

  /// 按钮点击回调
  final VoidCallback? onPressed;

  /// 按钮文字
  final String label;

  /// 是否处于加载状态
  final bool isLoading;

  /// 可选的前置图标
  final IconData? icon;

  /// 可选的固定宽度，为 null 时自适应
  final double? width;

  @override
  Widget build(BuildContext context) {
    final button = FilledButton(
      onPressed: isLoading ? null : onPressed,
      style: FilledButton.styleFrom(
        minimumSize: Size(width ?? 0, AppSizes.buttonHeightLg),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppSizes.radiusMd),
        ),
      ),
      child: isLoading
          ? const SizedBox(
              width: 20,
              height: 20,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                color: Colors.white,
              ),
            )
          : icon != null
              ? Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(icon, size: AppSizes.iconSm),
                    const SizedBox(width: AppSizes.spacingSm),
                    Text(label),
                  ],
                )
              : Text(label),
    );

    if (width != null) {
      return SizedBox(width: width, child: button);
    }
    return button;
  }
}

/// 通用次按钮组件（OutlinedButton 样式）
///
/// 支持 [isLoading] 参数，加载时显示 CircularProgressIndicator 并禁用按钮。
class AppSecondaryButton extends StatelessWidget {
  const AppSecondaryButton({
    super.key,
    required this.onPressed,
    required this.label,
    this.isLoading = false,
    this.icon,
    this.width,
  });

  /// 按钮点击回调
  final VoidCallback? onPressed;

  /// 按钮文字
  final String label;

  /// 是否处于加载状态
  final bool isLoading;

  /// 可选的前置图标
  final IconData? icon;

  /// 可选的固定宽度，为 null 时自适应
  final double? width;

  @override
  Widget build(BuildContext context) {
    final button = OutlinedButton(
      onPressed: isLoading ? null : onPressed,
      style: OutlinedButton.styleFrom(
        minimumSize: Size(width ?? 0, AppSizes.buttonHeightLg),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppSizes.radiusMd),
        ),
      ),
      child: isLoading
          ? SizedBox(
              width: 20,
              height: 20,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                color: Theme.of(context).colorScheme.primary,
              ),
            )
          : icon != null
              ? Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(icon, size: AppSizes.iconSm),
                    const SizedBox(width: AppSizes.spacingSm),
                    Text(label),
                  ],
                )
              : Text(label),
    );

    if (width != null) {
      return SizedBox(width: width, child: button);
    }
    return button;
  }
}
