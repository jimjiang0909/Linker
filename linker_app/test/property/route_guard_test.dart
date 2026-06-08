import 'package:flutter/material.dart';
import 'package:glados/glados.dart';
import 'package:go_router/go_router.dart';
import 'package:linker_app/core/router/app_routes.dart';
import 'package:linker_app/core/router/route_guard.dart';

/// **Validates: Requirements 1.2, 1.3, 2.7, 2.8, 4.8**
///
/// 属性5：导航路由守卫正确性
/// 对于 UserStatus.active，访问任何非 onboarding 路由应返回 null。
void main() {
  group('属性5：导航路由守卫正确性', () {
    /// 非 onboarding 路由列表
    final nonOnboardingRoutes = [
      AppRoutes.matches,
      AppRoutes.conversations,
      AppRoutes.me,
      '/conversations/some-id',
      AppRoutes.profileEdit,
      AppRoutes.preferencesEdit,
      AppRoutes.invitations,
      AppRoutes.invitees,
    ];

    /// onboarding 路由列表
    final onboardingRoutes = [
      AppRoutes.splash,
      AppRoutes.auth,
      AppRoutes.profileSetup,
      AppRoutes.preferencesSetup,
    ];

    Glados(any.choose(nonOnboardingRoutes)).test(
      '对于 UserStatus.active，访问任何非 onboarding 路由应返回 null',
      (route) {
        final state = _FakeGoRouterState(route);

        final result = routeGuard(
          _FakeBuildContext(),
          state,
          UserStatus.active,
        );

        expect(result, isNull);
      },
    );

    Glados(any.choose(onboardingRoutes)).test(
      '对于 UserStatus.active，访问 onboarding 路由应重定向到 /matches',
      (route) {
        final state = _FakeGoRouterState(route);

        final result = routeGuard(
          _FakeBuildContext(),
          state,
          UserStatus.active,
        );

        expect(result, equals(AppRoutes.matches));
      },
    );
  });
}

/// 用于测试的假 GoRouterState，只需要 uri.path
class _FakeGoRouterState implements GoRouterState {
  _FakeGoRouterState(this._path);

  final String _path;

  @override
  Uri get uri => Uri.parse(_path);

  @override
  dynamic noSuchMethod(Invocation invocation) => null;
}

/// 用于测试的假 BuildContext
class _FakeBuildContext implements BuildContext {
  @override
  dynamic noSuchMethod(Invocation invocation) => null;
}
