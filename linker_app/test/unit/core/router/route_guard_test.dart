import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:linker_app/core/router/app_routes.dart';
import 'package:linker_app/core/router/route_guard.dart';

/// 用于测试的假 GoRouterState，只需要 uri.path
class _FakeGoRouterState extends Fake implements GoRouterState {
  _FakeGoRouterState(this._path);

  final String _path;

  @override
  Uri get uri => Uri.parse(_path);
}

/// 用于测试的假 BuildContext（routeGuard 不使用 context）
class _FakeBuildContext extends Fake implements BuildContext {}

void main() {
  group('routeGuard', () {
    group('UserStatus.unauthenticated', () {
      const status = UserStatus.unauthenticated;

      test('允许访问 /splash', () {
        final state = _FakeGoRouterState(AppRoutes.splash);
        final result = routeGuard(_FakeBuildContext(), state, status);
        expect(result, isNull);
      });

      test('允许访问 /auth', () {
        final state = _FakeGoRouterState(AppRoutes.auth);
        final result = routeGuard(_FakeBuildContext(), state, status);
        expect(result, isNull);
      });

      test('访问 /matches 重定向到 /auth', () {
        final state = _FakeGoRouterState(AppRoutes.matches);
        final result = routeGuard(_FakeBuildContext(), state, status);
        expect(result, AppRoutes.auth);
      });

      test('访问 /profile/setup 重定向到 /auth', () {
        final state = _FakeGoRouterState(AppRoutes.profileSetup);
        final result = routeGuard(_FakeBuildContext(), state, status);
        expect(result, AppRoutes.auth);
      });

      test('访问 /conversations 重定向到 /auth', () {
        final state = _FakeGoRouterState(AppRoutes.conversations);
        final result = routeGuard(_FakeBuildContext(), state, status);
        expect(result, AppRoutes.auth);
      });

      test('访问 /me 重定向到 /auth', () {
        final state = _FakeGoRouterState(AppRoutes.me);
        final result = routeGuard(_FakeBuildContext(), state, status);
        expect(result, AppRoutes.auth);
      });
    });

    group('UserStatus.registered', () {
      const status = UserStatus.registered;

      test('允许访问 /profile/setup', () {
        final state = _FakeGoRouterState(AppRoutes.profileSetup);
        final result = routeGuard(_FakeBuildContext(), state, status);
        expect(result, isNull);
      });

      test('访问 /auth 重定向到 /profile/setup', () {
        final state = _FakeGoRouterState(AppRoutes.auth);
        final result = routeGuard(_FakeBuildContext(), state, status);
        expect(result, AppRoutes.profileSetup);
      });

      test('访问 /matches 重定向到 /profile/setup', () {
        final state = _FakeGoRouterState(AppRoutes.matches);
        final result = routeGuard(_FakeBuildContext(), state, status);
        expect(result, AppRoutes.profileSetup);
      });

      test('访问 /preferences/setup 重定向到 /profile/setup', () {
        final state = _FakeGoRouterState(AppRoutes.preferencesSetup);
        final result = routeGuard(_FakeBuildContext(), state, status);
        expect(result, AppRoutes.profileSetup);
      });
    });

    group('UserStatus.profileCompleted', () {
      const status = UserStatus.profileCompleted;

      test('允许访问 /preferences/setup', () {
        final state = _FakeGoRouterState(AppRoutes.preferencesSetup);
        final result = routeGuard(_FakeBuildContext(), state, status);
        expect(result, isNull);
      });

      test('访问 /auth 重定向到 /preferences/setup', () {
        final state = _FakeGoRouterState(AppRoutes.auth);
        final result = routeGuard(_FakeBuildContext(), state, status);
        expect(result, AppRoutes.preferencesSetup);
      });

      test('访问 /matches 重定向到 /preferences/setup', () {
        final state = _FakeGoRouterState(AppRoutes.matches);
        final result = routeGuard(_FakeBuildContext(), state, status);
        expect(result, AppRoutes.preferencesSetup);
      });

      test('访问 /profile/setup 重定向到 /preferences/setup', () {
        final state = _FakeGoRouterState(AppRoutes.profileSetup);
        final result = routeGuard(_FakeBuildContext(), state, status);
        expect(result, AppRoutes.preferencesSetup);
      });
    });

    group('UserStatus.active', () {
      const status = UserStatus.active;

      test('访问 /splash 重定向到 /matches', () {
        final state = _FakeGoRouterState(AppRoutes.splash);
        final result = routeGuard(_FakeBuildContext(), state, status);
        expect(result, AppRoutes.matches);
      });

      test('访问 /auth 重定向到 /matches', () {
        final state = _FakeGoRouterState(AppRoutes.auth);
        final result = routeGuard(_FakeBuildContext(), state, status);
        expect(result, AppRoutes.matches);
      });

      test('访问 /profile/setup 重定向到 /matches', () {
        final state = _FakeGoRouterState(AppRoutes.profileSetup);
        final result = routeGuard(_FakeBuildContext(), state, status);
        expect(result, AppRoutes.matches);
      });

      test('访问 /preferences/setup 重定向到 /matches', () {
        final state = _FakeGoRouterState(AppRoutes.preferencesSetup);
        final result = routeGuard(_FakeBuildContext(), state, status);
        expect(result, AppRoutes.matches);
      });

      test('允许访问 /matches', () {
        final state = _FakeGoRouterState(AppRoutes.matches);
        final result = routeGuard(_FakeBuildContext(), state, status);
        expect(result, isNull);
      });

      test('允许访问 /conversations', () {
        final state = _FakeGoRouterState(AppRoutes.conversations);
        final result = routeGuard(_FakeBuildContext(), state, status);
        expect(result, isNull);
      });

      test('允许访问 /me', () {
        final state = _FakeGoRouterState(AppRoutes.me);
        final result = routeGuard(_FakeBuildContext(), state, status);
        expect(result, isNull);
      });

      test('允许访问 /profile/edit', () {
        final state = _FakeGoRouterState(AppRoutes.profileEdit);
        final result = routeGuard(_FakeBuildContext(), state, status);
        expect(result, isNull);
      });

      test('允许访问 /invitations', () {
        final state = _FakeGoRouterState(AppRoutes.invitations);
        final result = routeGuard(_FakeBuildContext(), state, status);
        expect(result, isNull);
      });
    });
  });

  group('UserStatus 枚举', () {
    test('包含所有预期的状态值', () {
      expect(UserStatus.values, hasLength(4));
      expect(
        UserStatus.values,
        containsAll([
          UserStatus.unauthenticated,
          UserStatus.registered,
          UserStatus.profileCompleted,
          UserStatus.active,
        ]),
      );
    });
  });
}
