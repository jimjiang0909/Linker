import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'app_routes.dart';

/// 用户状态枚举，表示用户在注册流程中的当前阶段
enum UserStatus {
  /// 未登录
  unauthenticated,

  /// 已注册但资料未完成
  registered,

  /// 资料已完成但偏好未设置
  profileCompleted,

  /// 偏好已设置，完全激活
  active,
}

/// 路由守卫逻辑
///
/// 根据当前用户状态决定是否需要重定向：
/// - [unauthenticated]: 只允许访问 /splash 和 /auth，其他重定向到 /auth
/// - [registered]: 重定向到 /profile/setup
/// - [profileCompleted]: 重定向到 /preferences/setup
/// - [active]: 如果访问 onboarding 页面则重定向到 /matches，其他正常访问
///
/// 返回 null 表示不需要重定向，返回路径字符串表示需要重定向到该路径。
String? routeGuard(
  BuildContext context,
  GoRouterState state,
  UserStatus userStatus,
) {
  final location = state.uri.path;

  switch (userStatus) {
    case UserStatus.unauthenticated:
      // 未登录用户只允许访问 splash 和 auth 页面
      if (location == AppRoutes.splash || location == AppRoutes.auth) {
        return null;
      }
      return AppRoutes.auth;

    case UserStatus.registered:
      // 已注册但资料未完成，强制跳转到资料填写页
      if (location == AppRoutes.profileSetup) {
        return null;
      }
      return AppRoutes.profileSetup;

    case UserStatus.profileCompleted:
      // 资料已完成但偏好未设置，强制跳转到偏好设置页
      if (location == AppRoutes.preferencesSetup) {
        return null;
      }
      return AppRoutes.preferencesSetup;

    case UserStatus.active:
      // 完全激活的用户不应访问 onboarding 流程页面
      const onboardingRoutes = [
        AppRoutes.splash,
        AppRoutes.auth,
        AppRoutes.profileSetup,
        AppRoutes.preferencesSetup,
      ];
      if (onboardingRoutes.contains(location)) {
        return AppRoutes.matches;
      }
      return null;
  }
}
