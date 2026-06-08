import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/router/app_router.dart';
import '../../../core/router/route_guard.dart';
import '../data/preferences_repository.dart';

/// 偏好设置状态管理 Notifier
///
/// 管理用户偏好设置的获取和更新，包括：
/// - 获取用户偏好设置
/// - 更新用户偏好设置
///
/// 状态类型为 `AsyncValue<Preferences?>`：
/// - `AsyncLoading` 表示正在加载
/// - `AsyncData(null)` 表示尚未获取偏好
/// - `AsyncData(preferences)` 表示已成功获取偏好
/// - `AsyncError` 表示操作失败
class PreferencesNotifier extends Notifier<AsyncValue<Preferences?>> {
  @override
  AsyncValue<Preferences?> build() => const AsyncData<Preferences?>(null);

  /// 获取当前用户偏好设置
  ///
  /// 调用 [PreferencesRepository.getPreferences]，成功后将 state 设置为
  /// `AsyncData(preferences)`，失败时设置为 `AsyncError`。
  Future<void> fetchPreferences() async {
    state = const AsyncLoading<Preferences?>();
    state = await AsyncValue.guard(() async {
      final repository = ref.read(preferencesRepositoryProvider);
      return repository.getPreferences();
    });
  }

  /// 更新用户偏好设置
  ///
  /// 调用 [PreferencesRepository.updatePreferences]，成功后将 state 更新为
  /// 后端返回的最新 Preferences 数据。
  Future<void> updatePreferences(PreferencesUpdateRequest request) async {
    state = const AsyncLoading<Preferences?>();
    state = await AsyncValue.guard(() async {
      final repository = ref.read(preferencesRepositoryProvider);
      final preferences = await repository.updatePreferences(request);

      // Update user status to active after saving preferences (only during onboarding)
      final currentStatus = ref.read(userStatusProvider);
      if (currentStatus == UserStatus.profileCompleted) {
        ref.read(userStatusProvider.notifier).setStatus(UserStatus.active);
      }

      return preferences;
    });
  }
}

/// PreferencesNotifier 的 Riverpod Provider
final preferencesProvider =
    NotifierProvider<PreferencesNotifier, AsyncValue<Preferences?>>(
        PreferencesNotifier.new);
