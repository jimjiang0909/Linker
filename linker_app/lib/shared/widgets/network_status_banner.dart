import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/constants/app_colors.dart';
import '../../core/constants/app_sizes.dart';
import '../../core/constants/app_strings.dart';
import '../providers/connectivity_provider.dart';

/// 全局网络不可用提示条组件
///
/// 当网络不可用时在页面顶部展示红色提示条"网络不可用"，
/// 网络恢复时自动隐藏。使用 AnimatedContainer 实现显示/隐藏动画。
class NetworkStatusBanner extends ConsumerWidget {
  const NetworkStatusBanner({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isConnected = ref.watch(isConnectedProvider);

    return AnimatedContainer(
      duration: const Duration(milliseconds: 300),
      height: isConnected ? 0 : 36,
      color: AppColors.error,
      child: isConnected
          ? const SizedBox.shrink()
          : Center(
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(
                    Icons.wifi_off,
                    color: AppColors.textWhite,
                    size: AppSizes.iconSm,
                  ),
                  const SizedBox(width: AppSizes.spacingXs),
                  Text(
                    AppStrings.networkUnavailable,
                    style: const TextStyle(
                      color: AppColors.textWhite,
                      fontSize: AppSizes.fontSm,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),
    );
  }
}
