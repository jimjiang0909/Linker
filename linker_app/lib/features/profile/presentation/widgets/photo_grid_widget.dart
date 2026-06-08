import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/constants/api_constants.dart';
import '../../../../core/constants/app_sizes.dart';
import '../../../../core/constants/app_strings.dart';
import '../../../../shared/models/profile.dart';
import '../../providers/profile_provider.dart';
import 'photo_picker_widget.dart';

/// 照片网格展示组件
///
/// 以网格形式展示已上传的照片缩略图，支持：
/// - 网格展示已上传照片（使用 CachedNetworkImage）
/// - 每张照片右上角有删除按钮
/// - 点击删除弹出确认对话框
/// - 照片数量 < 6 时显示"添加照片"按钮
/// - 照片数量 = 6 时不显示"添加照片"按钮
class PhotoGridWidget extends ConsumerWidget {
  /// 照片列表
  final List<Photo> photos;

  /// 最大照片数量
  static const int maxPhotos = 6;

  /// 每行照片数量
  static const int crossAxisCount = 3;

  const PhotoGridWidget({
    super.key,
    required this.photos,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final showAddButton = photos.length < maxPhotos;
    final itemCount = photos.length + (showAddButton ? 1 : 0);

    return Center(
      child: GridView.builder(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: crossAxisCount,
          crossAxisSpacing: AppSizes.spacingSm,
          mainAxisSpacing: AppSizes.spacingSm,
          childAspectRatio: 1.0,
        ),
        itemCount: itemCount,
        itemBuilder: (context, index) {
          if (index < photos.length) {
            return _PhotoGridItem(photo: photos[index]);
          }
          // 最后一个位置显示添加照片按钮
          return const PhotoPickerWidget();
        },
      ),
    );
  }
}

/// 单个照片网格项
///
/// 展示照片缩略图，右上角有删除按钮。
class _PhotoGridItem extends ConsumerWidget {
  final Photo photo;

  const _PhotoGridItem({required this.photo});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Stack(
      fit: StackFit.expand,
      children: [
        // 照片缩略图
        ClipRRect(
          borderRadius: BorderRadius.circular(AppSizes.radiusMd),
          child: CachedNetworkImage(
            imageUrl: ApiConstants.fullImageUrl(photo.url),
            width: double.infinity,
            height: double.infinity,
            fit: BoxFit.cover,
            placeholder: (context, url) => Container(
              decoration: BoxDecoration(
                color: Theme.of(context)
                    .colorScheme
                    .surfaceContainerHighest,
                borderRadius: BorderRadius.circular(AppSizes.radiusMd),
              ),
              child: const Center(
                child: SizedBox(
                  width: AppSizes.iconMd,
                  height: AppSizes.iconMd,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              ),
            ),
            errorWidget: (context, url, error) => Container(
              decoration: BoxDecoration(
                color: Theme.of(context)
                    .colorScheme
                    .surfaceContainerHighest,
                borderRadius: BorderRadius.circular(AppSizes.radiusMd),
              ),
              child: Icon(
                Icons.broken_image_outlined,
                size: AppSizes.iconLg,
                color: Theme.of(context).colorScheme.outline,
              ),
            ),
          ),
        ),
        // 右上角删除按钮
        Positioned(
          top: AppSizes.spacingXs,
          right: AppSizes.spacingXs,
          child: GestureDetector(
            onTap: () => _showDeleteConfirmation(context, ref),
            child: Container(
              width: AppSizes.iconMd,
              height: AppSizes.iconMd,
              decoration: const BoxDecoration(
                color: Colors.red,
                shape: BoxShape.circle,
              ),
              child: const Icon(
                Icons.close,
                size: AppSizes.iconSm,
                color: Colors.white,
              ),
            ),
          ),
        ),
      ],
    );
  }

  /// 显示删除确认对话框
  Future<void> _showDeleteConfirmation(
    BuildContext context,
    WidgetRef ref,
  ) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete Photo'),
        content: const Text('Are you sure you want to delete this photo?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text(AppStrings.cancel),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            style: TextButton.styleFrom(
              foregroundColor: Colors.red,
            ),
            child: const Text(AppStrings.confirm),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      ref.read(profileProvider.notifier).deletePhoto(photo.id);
    }
  }
}
