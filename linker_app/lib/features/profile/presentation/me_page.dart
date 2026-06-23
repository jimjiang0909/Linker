import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/constants/api_constants.dart';
import '../../../core/constants/app_sizes.dart';
import '../../../core/constants/app_strings.dart';
import '../../../core/router/app_routes.dart';
import '../../../features/auth/providers/auth_provider.dart';
import '../providers/profile_provider.dart';

/// 个人中心页面
///
/// 展示用户头像和姓名，提供功能入口列表：
/// - 编辑资料
/// - 偏好设置
/// - 我的邀请码
/// - 已邀请用户
/// - 退出登录
class MePage extends ConsumerStatefulWidget {
  const MePage({super.key});

  @override
  ConsumerState<MePage> createState() => _MePageState();
}

class _MePageState extends ConsumerState<MePage> {
  @override
  void initState() {
    super.initState();
    // 页面加载时获取最新用户资料
    Future.microtask(() {
      ref.read(profileProvider.notifier).fetchProfile();
    });
  }

  @override
  Widget build(BuildContext context) {
    final profileState = ref.watch(profileProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text(AppStrings.myProfile),
        centerTitle: true,
      ),
      body: Column(
        children: [
          // 用户信息头部
          _buildUserHeader(context, profileState),
          const Divider(height: 1),
          // 功能入口列表
          Expanded(
            child: ListView(
              children: [
                _buildMenuItem(
                  context,
                  icon: Icons.person_outline,
                  title: AppStrings.editProfile,
                  onTap: () => context.push(AppRoutes.profileEdit),
                ),
                _buildMenuItem(
                  context,
                  icon: Icons.tune,
                  title: AppStrings.preferencesSettings,
                  onTap: () => context.push(AppRoutes.preferencesEdit),
                ),
                _buildMenuItem(
                  context,
                  icon: Icons.card_giftcard,
                  title: AppStrings.myInvitationCodes,
                  onTap: () => context.push(AppRoutes.invitations),
                ),
                _buildMenuItem(
                  context,
                  icon: Icons.people_outline,
                  title: AppStrings.invitedUsers,
                  onTap: () => context.push(AppRoutes.invitees),
                ),
                const Divider(height: 1),
                _buildMenuItem(
                  context,
                  icon: Icons.logout,
                  title: AppStrings.logout,
                  isDestructive: true,
                  onTap: () => _showLogoutConfirmDialog(context),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  /// 构建用户信息头部区域
  Widget _buildUserHeader(
      BuildContext context, AsyncValue profileState) {
    final profile = profileState.value;

    return Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSizes.spacingLg,
        vertical: AppSizes.spacingXl,
      ),
      child: Row(
        children: [
          // 头像
          _buildAvatar(profile),
          const SizedBox(width: AppSizes.spacingMd),
          // 姓名和职业
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  profile?.name ?? '...',
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                ),
                if (profile?.occupation != null) ...[
                  const SizedBox(height: AppSizes.spacingXs),
                  Text(
                    profile!.occupation,
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: Theme.of(context)
                              .colorScheme
                              .onSurface
                              .withValues(alpha: 0.6),
                        ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  /// 构建头像组件
  Widget _buildAvatar(dynamic profile) {
    final photoUrl = (profile != null &&
            profile.photos != null &&
            profile.photos.isNotEmpty)
        ? profile.photos.first.url
        : null;

    if (photoUrl != null) {
      return ClipOval(
        child: CachedNetworkImage(
          imageUrl: ApiConstants.fullImageUrl(photoUrl),
          width: AppSizes.avatarLg,
          height: AppSizes.avatarLg,
          fit: BoxFit.cover,
          placeholder: (context, url) => CircleAvatar(
            radius: AppSizes.avatarLg / 2,
            child: const CircularProgressIndicator(strokeWidth: 2),
          ),
          errorWidget: (context, url, error) => CircleAvatar(
            radius: AppSizes.avatarLg / 2,
            child: const Icon(Icons.person, size: AppSizes.iconXl),
          ),
        ),
      );
    }

    return CircleAvatar(
      radius: AppSizes.avatarLg / 2,
      child: const Icon(Icons.person, size: AppSizes.iconXl),
    );
  }

  /// 构建功能入口列表项
  Widget _buildMenuItem(
    BuildContext context, {
    required IconData icon,
    required String title,
    required VoidCallback onTap,
    bool isDestructive = false,
  }) {
    final color = isDestructive
        ? Theme.of(context).colorScheme.error
        : Theme.of(context).colorScheme.onSurface;

    return ListTile(
      leading: Icon(icon, color: color),
      title: Text(
        title,
        style: TextStyle(color: color),
      ),
      trailing: isDestructive
          ? null
          : Icon(
              Icons.chevron_right,
              color: Theme.of(context)
                  .colorScheme
                  .onSurface
                  .withValues(alpha: 0.4),
            ),
      onTap: onTap,
    );
  }

  /// 显示退出登录确认对话框
  void _showLogoutConfirmDialog(BuildContext context) {
    showDialog(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text(AppStrings.logout),
        content: const Text(AppStrings.logoutConfirm),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: const Text(AppStrings.cancel),
          ),
          TextButton(
            onPressed: () {
              Navigator.of(dialogContext).pop();
              _performLogout();
            },
            child: Text(
              AppStrings.confirm,
              style: TextStyle(
                color: Theme.of(context).colorScheme.error,
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// 执行退出登录
  ///
  /// 调用 AuthNotifier.logout() 清除 Token、断开 WebSocket、重置状态。
  /// 路由守卫会自动将用户导航到登录页。
  Future<void> _performLogout() async {
    await ref.read(authProvider.notifier).logout();
  }
}
