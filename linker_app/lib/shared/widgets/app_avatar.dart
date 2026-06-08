import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../core/constants/app_colors.dart';
import '../../core/constants/app_sizes.dart';

/// 头像大小枚举
enum AvatarSize {
  /// 小头像 32px（列表项）
  sm,

  /// 中头像 48px（对话列表）
  md,

  /// 大头像 72px（个人中心）
  lg,

  /// 超大头像 120px（资料详情）
  xl,
}

/// 通用头像组件
///
/// 圆形裁剪，支持网络图片 URL。
/// 无图片时显示占位图（首字母或默认图标）。
/// 支持不同大小（sm/md/lg/xl）。
class AppAvatar extends StatelessWidget {
  const AppAvatar({
    super.key,
    this.imageUrl,
    this.name,
    this.size = AvatarSize.md,
  });

  /// 网络图片 URL
  final String? imageUrl;

  /// 用户名称（用于生成首字母占位图）
  final String? name;

  /// 头像大小
  final AvatarSize size;

  /// 获取头像像素大小
  double get _sizeValue {
    switch (size) {
      case AvatarSize.sm:
        return AppSizes.avatarSm;
      case AvatarSize.md:
        return AppSizes.avatarMd;
      case AvatarSize.lg:
        return AppSizes.avatarLg;
      case AvatarSize.xl:
        return AppSizes.avatarXl;
    }
  }

  /// 获取字体大小
  double get _fontSize {
    switch (size) {
      case AvatarSize.sm:
        return AppSizes.fontSm;
      case AvatarSize.md:
        return AppSizes.fontMd;
      case AvatarSize.lg:
        return AppSizes.fontXl;
      case AvatarSize.xl:
        return AppSizes.fontDisplay;
    }
  }

  @override
  Widget build(BuildContext context) {
    return ClipOval(
      child: SizedBox(
        width: _sizeValue,
        height: _sizeValue,
        child: _buildContent(),
      ),
    );
  }

  Widget _buildContent() {
    if (imageUrl != null && imageUrl!.isNotEmpty) {
      return CachedNetworkImage(
        imageUrl: imageUrl!,
        fit: BoxFit.cover,
        placeholder: (_, _) => _buildPlaceholder(),
        errorWidget: (_, _, _) => _buildPlaceholder(),
      );
    }
    return _buildPlaceholder();
  }

  Widget _buildPlaceholder() {
    final initial = _getInitial();

    return Container(
      color: AppColors.primaryLight.withValues(alpha: 0.3),
      alignment: Alignment.center,
      child: initial != null
          ? Text(
              initial,
              style: TextStyle(
                fontSize: _fontSize,
                fontWeight: FontWeight.w600,
                color: AppColors.primary,
              ),
            )
          : Icon(
              Icons.person,
              size: _sizeValue * 0.5,
              color: AppColors.primary,
            ),
    );
  }

  /// 获取名称首字母
  String? _getInitial() {
    if (name == null || name!.isEmpty) return null;
    return name![0].toUpperCase();
  }
}
