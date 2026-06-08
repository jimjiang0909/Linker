import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/auth/presentation/auth_page.dart';
import '../../features/auth/presentation/splash_page.dart';
import '../../features/conversations/presentation/chat_page.dart';
import '../../features/conversations/presentation/conversations_page.dart';
import '../../features/invitations/presentation/invitations_page.dart';
import '../../features/invitations/presentation/invitees_page.dart';
import '../../features/matches/presentation/daily_matches_page.dart';
import '../../features/preferences/presentation/preferences_edit_page.dart';
import '../../features/preferences/presentation/preferences_setup_page.dart';
import '../../features/profile/presentation/me_page.dart';
import '../../features/profile/presentation/profile_edit_page.dart';
import '../../features/profile/presentation/profile_setup_page.dart';
import '../../shared/widgets/main_shell.dart';
import 'app_routes.dart';
import 'route_guard.dart';

/// 用户状态 Notifier，管理当前用户在注册流程中的状态
class UserStatusNotifier extends Notifier<UserStatus> {
  @override
  UserStatus build() => UserStatus.unauthenticated;

  /// 更新用户状态
  void setStatus(UserStatus status) {
    state = status;
  }
}

/// 当前用户状态 Provider（由认证模块更新）
final userStatusProvider =
    NotifierProvider<UserStatusNotifier, UserStatus>(UserStatusNotifier.new);

/// GoRouter 实例 Provider
final routerProvider = Provider<GoRouter>((ref) {
  final userStatus = ref.watch(userStatusProvider);
  return createRouter(userStatus: userStatus);
});

/// 创建 GoRouter 实例
///
/// [userStatus] 当前用户状态，用于路由守卫判断重定向
GoRouter createRouter({UserStatus userStatus = UserStatus.unauthenticated}) {
  return GoRouter(
    initialLocation: AppRoutes.splash,
    redirect: (context, state) => routeGuard(context, state, userStatus),
    routes: [
      GoRoute(
        path: AppRoutes.splash,
        builder: (context, state) => const SplashPage(),
      ),
      GoRoute(
        path: AppRoutes.auth,
        builder: (context, state) => const AuthPage(),
      ),
      GoRoute(
        path: AppRoutes.profileSetup,
        builder: (context, state) => const ProfileSetupPage(),
      ),
      GoRoute(
        path: AppRoutes.preferencesSetup,
        builder: (context, state) => const PreferencesSetupPage(),
      ),
      ShellRoute(
        builder: (context, state, child) => MainShell(child: child),
        routes: [
          GoRoute(
            path: AppRoutes.matches,
            builder: (context, state) => const DailyMatchesPage(),
          ),
          GoRoute(
            path: AppRoutes.conversations,
            builder: (context, state) => const ConversationsPage(),
          ),
          GoRoute(
            path: AppRoutes.me,
            builder: (context, state) => const MePage(),
          ),
        ],
      ),
      GoRoute(
        path: AppRoutes.chat,
        builder: (context, state) {
          final id = state.pathParameters['id']!;
          return ChatPage(conversationId: id);
        },
      ),
      GoRoute(
        path: AppRoutes.profileEdit,
        builder: (context, state) => const ProfileEditPage(),
      ),
      GoRoute(
        path: AppRoutes.preferencesEdit,
        builder: (context, state) => const PreferencesEditPage(),
      ),
      GoRoute(
        path: AppRoutes.invitations,
        builder: (context, state) => const InvitationsPage(),
      ),
      GoRoute(
        path: AppRoutes.invitees,
        builder: (context, state) => const InviteesPage(),
      ),
    ],
  );
}


