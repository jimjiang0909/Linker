import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/router/app_router.dart';
import 'core/theme/app_theme.dart';

/// Linker 应用根 Widget
///
/// 使用 [ConsumerWidget] 监听 [routerProvider]，当用户状态变化时
/// GoRouter 会自动重建并通过路由守卫将用户导航到正确的页面。
///
/// 导航机制：
/// 1. AuthNotifier.register() 成功后更新 userStatusProvider
/// 2. routerProvider watch 了 userStatusProvider，状态变化时重建 GoRouter
/// 3. GoRouter 的 redirect 回调（routeGuard）根据新的 UserStatus 自动重定向
///    - unauthenticated → /auth
///    - registered → /profile/setup
///    - profileCompleted → /preferences/setup
///    - active → /matches
class LinkerApp extends ConsumerWidget {
  const LinkerApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);

    return MaterialApp.router(
      title: 'Linker',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.lightTheme,
      darkTheme: AppTheme.darkTheme,
      themeMode: ThemeMode.light,
      routerConfig: router,
    );
  }
}
