import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/websocket_client.dart';
import '../../../core/router/app_router.dart';
import '../../../core/router/route_guard.dart';
import '../../../core/storage/secure_storage.dart';
import '../../../shared/providers/unread_count_provider.dart';
import '../../conversations/providers/conversations_provider.dart';
import '../../profile/providers/profile_provider.dart';
import '../data/auth_repository.dart';

/// 认证状态管理 Notifier
///
/// 管理用户认证生命周期，包括：
/// - 发送验证码
/// - 注册（保存 Token、更新用户状态）
/// - 退出登录（清除 Token、断开 WebSocket、重置状态）
/// - 检查本地 Token 恢复登录状态
///
/// 状态类型为 `AsyncValue<void>`，用于跟踪异步操作的加载/成功/错误状态。
class AuthNotifier extends Notifier<AsyncValue<void>> {
  @override
  AsyncValue<void> build() => const AsyncData<void>(null);

  /// 发送验证码到指定邮箱
  ///
  /// 调用 [AuthRepository.sendCode]，状态在请求期间为 loading，
  /// 成功后恢复为 data，失败时设置为 error。
  Future<void> sendVerificationCode(String email) async {
    state = await AsyncValue.guard(() async {
      final authRepository = ref.read(authRepositoryProvider);
      await authRepository.sendCode(email);
    });
  }

  /// 注册新用户
  ///
  /// 调用 [AuthRepository.register]，成功后：
  /// 1. 将返回的 JWT Token 保存到 SecureStorage
  /// 2. 根据返回的 userStatus 更新 UserStatusNotifier
  Future<void> register({
    required String email,
    required String password,
    String? invitationCode,
  }) async {
    state = const AsyncLoading<void>();
    state = await AsyncValue.guard(() async {
      final authRepository = ref.read(authRepositoryProvider);
      final secureStorage = ref.read(secureStorageProvider);

      final response = await authRepository.register(
        email: email,
        password: password,
        invitationCode: invitationCode,
      );

      // 保存 Token 到安全存储
      await secureStorage.saveToken(response.token);
      await secureStorage.saveRefreshToken(response.refreshToken);
      await secureStorage.saveUserId(response.userId);

      // 重置旧用户的缓存状态
      ref.invalidate(profileProvider);

      // 根据后端返回的 userStatus 更新用户状态
      final userStatus = _mapUserStatus(response.userStatus);
      ref.read(userStatusProvider.notifier).setStatus(userStatus);

      // 建立 WebSocket 连接
      ref.read(webSocketClientProvider).connect();
    });
  }

  /// Login existing user
  ///
  /// Calls [AuthRepository.login], on success:
  /// 1. Save JWT Token to SecureStorage
  /// 2. Update UserStatusNotifier based on returned userStatus
  Future<void> login({
    required String email,
    required String password,
  }) async {
    state = const AsyncLoading<void>();
    state = await AsyncValue.guard(() async {
      final authRepository = ref.read(authRepositoryProvider);
      final secureStorage = ref.read(secureStorageProvider);

      final response = await authRepository.login(
        email: email,
        password: password,
      );

      await secureStorage.saveToken(response.token);
      await secureStorage.saveRefreshToken(response.refreshToken);
      await secureStorage.saveUserId(response.userId);

      // 重置旧用户的缓存状态
      ref.invalidate(profileProvider);

      final userStatus = _mapUserStatus(response.userStatus);
      ref.read(userStatusProvider.notifier).setStatus(userStatus);

      // 建立 WebSocket 连接
      ref.read(webSocketClientProvider).connect();
    });
  }

  /// 退出登录
  ///
  /// 执行以下清理操作：
  /// 1. 清除 SecureStorage 中的 Token
  /// 2. 断开 WebSocket 连接
  /// 3. 重置 UserStatusNotifier 为 unauthenticated
  Future<void> logout() async {
    final secureStorage = ref.read(secureStorageProvider);
    final webSocketClient = ref.read(webSocketClientProvider);

    await secureStorage.deleteToken();
    await secureStorage.deleteRefreshToken();
    webSocketClient.disconnect();
    ref.invalidate(profileProvider);
    ref.invalidate(conversationsProvider);
    ref.read(unreadCountProvider.notifier).setCount(0);
    ref.read(userStatusProvider.notifier).setStatus(UserStatus.unauthenticated);

    state = const AsyncData<void>(null);
  }

  /// 检查本地认证状态
  /// 检查当前是否已登录并获取真实用户状态
  ///
  /// 检查 SecureStorage 中是否存在 Token：
  /// - 有 Token：调用 /auth/me 获取真实用户状态
  /// - 无 Token：保持 unauthenticated 状态
  ///
  /// 返回 true 表示已登录，false 表示未登录。
  Future<bool> checkAuthStatus() async {
    final secureStorage = ref.read(secureStorageProvider);
    final hasToken = await secureStorage.hasToken();

    if (!hasToken) return false;

    try {
      final authRepository = ref.read(authRepositoryProvider);
      final me = await authRepository.getMe();
      await secureStorage.saveUserId(me.userId);
      ref.read(userStatusProvider.notifier).setStatus(_mapUserStatus(me.status));

      // 恢复登录态后建立 WebSocket 连接
      ref.read(webSocketClientProvider).connect();
      return true;
    } catch (_) {
      // Token invalid or expired, clear it
      await secureStorage.deleteToken();
      await secureStorage.deleteRefreshToken();
      return false;
    }
  }

  /// 将后端返回的 userStatus 字符串映射为 [UserStatus] 枚举
  UserStatus _mapUserStatus(String status) {
    switch (status) {
      case 'registered':
        return UserStatus.registered;
      case 'profileCompleted':
        return UserStatus.profileCompleted;
      case 'active':
      case 'preference_set':
        return UserStatus.active;
      default:
        return UserStatus.registered;
    }
  }
}

/// AuthNotifier 的 Riverpod Provider
final authProvider =
    NotifierProvider<AuthNotifier, AsyncValue<void>>(AuthNotifier.new);
