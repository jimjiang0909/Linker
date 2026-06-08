import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/constants/app_sizes.dart';
import '../../../core/constants/app_strings.dart';
import '../../../core/router/app_routes.dart';
import '../providers/auth_provider.dart';

/// 启动页
///
/// 展示 App Logo 和加载指示器，同时执行 Token 检查：
/// - 有 Token：设置用户状态为 active，路由守卫自动重定向到 /matches
/// - 无 Token：手动导航到 /auth 页面
class SplashPage extends ConsumerStatefulWidget {
  const SplashPage({super.key});

  @override
  ConsumerState<SplashPage> createState() => _SplashPageState();
}

class _SplashPageState extends ConsumerState<SplashPage> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _checkAuthStatus();
    });
  }

  /// 检查认证状态并执行导航
  Future<void> _checkAuthStatus() async {
    final isAuthenticated =
        await ref.read(authProvider.notifier).checkAuthStatus();

    if (!mounted) return;

    if (!isAuthenticated) {
      context.go(AppRoutes.auth);
    }
    // 如果已认证，userStatusProvider 已被设置为 active，
    // GoRouter 的路由守卫会自动将 /splash 重定向到 /matches
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      backgroundColor: theme.colorScheme.surface,
      body: Column(
        children: [
          // Logo 居中展示
          Expanded(
            child: Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    Icons.people_alt_rounded,
                    size: AppSizes.iconXl * 2,
                    color: theme.colorScheme.primary,
                  ),
                  const SizedBox(height: AppSizes.spacingMd),
                  Text(
                    AppStrings.appName,
                    style: theme.textTheme.headlineMedium?.copyWith(
                      fontWeight: FontWeight.bold,
                      color: theme.colorScheme.primary,
                    ),
                  ),
                ],
              ),
            ),
          ),

          // 底部加载指示器
          Padding(
            padding: const EdgeInsets.only(bottom: AppSizes.spacingXxl),
            child: CircularProgressIndicator(
              color: theme.colorScheme.primary,
            ),
          ),
        ],
      ),
    );
  }
}
