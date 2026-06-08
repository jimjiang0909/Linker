import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/router/app_router.dart';
import '../../../core/router/route_guard.dart';
import '../../../shared/models/profile.dart';
import '../data/profile_repository.dart';

/// 用户资料状态管理 Notifier
///
/// 管理用户资料的完整生命周期，包括：
/// - 获取用户资料
/// - 更新用户资料
/// - 上传照片（追加到 photos 列表）
/// - 删除照片（从 photos 列表移除）
///
/// 状态类型为 `AsyncValue<Profile?>`：
/// - `AsyncLoading` 表示正在加载
/// - `AsyncData(null)` 表示尚未获取资料
/// - `AsyncData(profile)` 表示已成功获取资料
/// - `AsyncError` 表示操作失败
class ProfileNotifier extends Notifier<AsyncValue<Profile?>> {
  @override
  AsyncValue<Profile?> build() => const AsyncData<Profile?>(null);

  /// 获取当前用户资料
  ///
  /// 调用 [ProfileRepository.getProfile]，成功后将 state 设置为
  /// `AsyncData(profile)`，失败时设置为 `AsyncError`。
  Future<void> fetchProfile() async {
    state = const AsyncLoading<Profile?>();
    state = await AsyncValue.guard(() async {
      final repository = ref.read(profileRepositoryProvider);
      return repository.getProfile();
    });
  }

  /// 更新用户资料
  ///
  /// 调用 [ProfileRepository.updateProfile]，成功后将 state 更新为
  /// 后端返回的最新 Profile 数据，并更新用户状态为 profileCompleted。
  Future<void> updateProfile(ProfileUpdateRequest request) async {
    state = const AsyncLoading<Profile?>();
    state = await AsyncValue.guard(() async {
      final repository = ref.read(profileRepositoryProvider);
      final profile = await repository.updateProfile(request);

      // Update user status to profileCompleted after saving profile (only during onboarding)
      final currentStatus = ref.read(userStatusProvider);
      if (currentStatus == UserStatus.registered) {
        ref.read(userStatusProvider.notifier).setStatus(UserStatus.profileCompleted);
      }

      return profile;
    });
  }

  /// 上传照片
  ///
  /// 调用 [ProfileRepository.uploadPhoto]，上传成功后将返回的 [Photo]
  /// 追加到当前 profile 的 photos 列表中。
  /// 如果当前 state 中没有有效的 profile（新用户首次设置资料），
  /// 仍然执行上传，但不改变 state（避免触发 UI 重建丢失预览）。
  Future<void> uploadPhoto(File photo) async {
    final currentProfile = state.value;

    if (currentProfile == null) {
      // 新用户还没有 profile，直接上传，不改变 state
      final repository = ref.read(profileRepositoryProvider);
      await repository.uploadPhoto(photo);
      return;
    }

    state = const AsyncLoading<Profile?>();
    state = await AsyncValue.guard(() async {
      final repository = ref.read(profileRepositoryProvider);
      final newPhoto = await repository.uploadPhoto(photo);
      return currentProfile.copyWith(
        photos: [...currentProfile.photos, newPhoto],
      );
    });
  }

  /// 删除照片
  ///
  /// 调用 [ProfileRepository.deletePhoto]，删除成功后从当前 profile 的
  /// photos 列表中移除对应 photoId 的照片。
  /// 如果当前 state 中没有有效的 profile，则不执行操作。
  Future<void> deletePhoto(String photoId) async {
    final currentProfile = state.value;
    if (currentProfile == null) return;

    state = const AsyncLoading<Profile?>();
    state = await AsyncValue.guard(() async {
      final repository = ref.read(profileRepositoryProvider);
      await repository.deletePhoto(photoId);
      return currentProfile.copyWith(
        photos:
            currentProfile.photos.where((p) => p.id != photoId).toList(),
      );
    });
  }
}

/// ProfileNotifier 的 Riverpod Provider
final profileProvider =
    NotifierProvider<ProfileNotifier, AsyncValue<Profile?>>(
        ProfileNotifier.new);
