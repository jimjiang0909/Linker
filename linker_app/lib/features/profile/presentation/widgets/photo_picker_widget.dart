import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../../../core/constants/app_sizes.dart';
import '../../../../core/constants/app_strings.dart';
import '../../providers/profile_provider.dart';

/// 照片选择、预览和上传组件
///
/// 集成 image_picker 包，提供以下功能：
/// - 点击触发照片选择面板（从相册选择或拍照）
/// - 选择后展示照片预览
/// - 校验照片格式（JPEG/PNG）、大小（≤5MB）、分辨率（≥300×300）
/// - 校验通过后调用 [ProfileNotifier.uploadPhoto] 上传
class PhotoPickerWidget extends ConsumerStatefulWidget {
  /// 照片选择成功后的回调（可选）
  ///
  /// 如果提供，将在照片校验通过后调用此回调。
  /// 如果未提供，将直接调用 [ProfileNotifier.uploadPhoto] 上传。
  final void Function(File photo)? onPhotoSelected;

  const PhotoPickerWidget({
    super.key,
    this.onPhotoSelected,
  });

  @override
  ConsumerState<PhotoPickerWidget> createState() => _PhotoPickerWidgetState();
}

class _PhotoPickerWidgetState extends ConsumerState<PhotoPickerWidget> {
  final ImagePicker _picker = ImagePicker();

  /// 当前选中的照片文件（预览用）
  File? _selectedPhoto;

  /// 是否正在上传
  bool _isUploading = false;

  /// 允许的照片扩展名
  static const _allowedExtensions = ['.jpg', '.jpeg', '.png'];

  /// 最大文件大小：5MB
  static const _maxFileSize = 5 * 1024 * 1024;

  /// 最小分辨率
  static const _minResolution = 300;

  /// 展示照片选择面板
  Future<void> _showPickerOptions() async {
    await showModalBottomSheet<void>(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(
          top: Radius.circular(AppSizes.radiusXl),
        ),
      ),
      builder: (context) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: AppSizes.spacingMd),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ListTile(
                leading: const Icon(Icons.photo_library_outlined),
                title: const Text('Choose from Gallery'),
                onTap: () {
                  Navigator.of(context).pop();
                  _pickImage(ImageSource.gallery);
                },
              ),
              ListTile(
                leading: const Icon(Icons.camera_alt_outlined),
                title: const Text('Take Photo'),
                onTap: () {
                  Navigator.of(context).pop();
                  _pickImage(ImageSource.camera);
                },
              ),
              const Divider(),
              ListTile(
                leading: const Icon(Icons.close),
                title: const Text(AppStrings.cancel),
                onTap: () => Navigator.of(context).pop(),
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// 选择照片
  Future<void> _pickImage(ImageSource source) async {
    try {
      final XFile? pickedFile = await _picker.pickImage(source: source);
      if (pickedFile == null) return;

      final file = File(pickedFile.path);

      // 校验照片
      final validationError = await _validatePhoto(file);
      if (validationError != null) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(validationError),
              backgroundColor: Theme.of(context).colorScheme.error,
            ),
          );
        }
        return;
      }

      // 校验通过，展示预览
      setState(() {
        _selectedPhoto = file;
      });

      // 上传照片
      await _uploadPhoto(file);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to pick photo: $e'),
            backgroundColor: Theme.of(context).colorScheme.error,
          ),
        );
      }
    }
  }

  /// 校验照片格式、大小和分辨率
  ///
  /// 返回 null 表示校验通过，返回错误信息字符串表示校验失败。
  Future<String?> _validatePhoto(File file) async {
    // 1. 校验格式
    final extension = _getFileExtension(file.path);
    if (!_allowedExtensions.contains(extension)) {
      return AppStrings.getErrorMessage('PHOTO_FORMAT_INVALID');
    }

    // 2. 校验文件大小
    final fileSize = await file.length();
    if (fileSize > _maxFileSize) {
      return AppStrings.getErrorMessage('PHOTO_SIZE_EXCEEDED');
    }

    // 3. 校验分辨率
    final resolutionError = await _checkResolution(file);
    if (resolutionError != null) {
      return resolutionError;
    }

    return null;
  }

  /// 获取文件扩展名（小写）
  String _getFileExtension(String path) {
    final lastDot = path.lastIndexOf('.');
    if (lastDot == -1) return '';
    return path.substring(lastDot).toLowerCase();
  }

  /// 检查照片分辨率是否满足最低要求（≥300×300）
  Future<String?> _checkResolution(File file) async {
    try {
      final bytes = await file.readAsBytes();
      final codec = await ui.instantiateImageCodec(bytes);
      final frame = await codec.getNextFrame();
      final image = frame.image;

      final width = image.width;
      final height = image.height;
      image.dispose();

      if (width < _minResolution || height < _minResolution) {
        return AppStrings.getErrorMessage('PHOTO_RESOLUTION_LOW');
      }
      return null;
    } catch (_) {
      return AppStrings.getErrorMessage('INVALID_IMAGE');
    }
  }

  /// 上传照片
  Future<void> _uploadPhoto(File file) async {
    if (widget.onPhotoSelected != null) {
      widget.onPhotoSelected!(file);
      return;
    }

    setState(() {
      _isUploading = true;
    });

    try {
      await ref.read(profileProvider.notifier).uploadPhoto(file);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Upload failed: $e'),
            backgroundColor: Theme.of(context).colorScheme.error,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _isUploading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return GestureDetector(
      onTap: _isUploading ? null : _showPickerOptions,
      child: _selectedPhoto != null
          ? _buildPreview(theme)
          : _buildPlaceholder(theme),
    );
  }

  /// 构建照片预览视图
  Widget _buildPreview(ThemeData theme) {
    return Stack(
      children: [
        Container(
          height: AppSizes.photoGridItemSize,
          width: AppSizes.photoGridItemSize,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppSizes.radiusMd),
            image: DecorationImage(
              image: FileImage(_selectedPhoto!),
              fit: BoxFit.cover,
            ),
          ),
        ),
        if (_isUploading)
          Container(
            height: AppSizes.photoGridItemSize,
            width: AppSizes.photoGridItemSize,
            decoration: BoxDecoration(
              color: Colors.black.withValues(alpha: 0.4),
              borderRadius: BorderRadius.circular(AppSizes.radiusMd),
            ),
            child: const Center(
              child: SizedBox(
                width: AppSizes.iconMd,
                height: AppSizes.iconMd,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: Colors.white,
                ),
              ),
            ),
          ),
      ],
    );
  }

  /// 构建占位视图（未选择照片时）
  Widget _buildPlaceholder(ThemeData theme) {
    return Container(
      height: AppSizes.photoGridItemSize,
      width: AppSizes.photoGridItemSize,
      decoration: BoxDecoration(
        border: Border.all(
          color: theme.colorScheme.outline,
          width: 1,
        ),
        borderRadius: BorderRadius.circular(AppSizes.radiusMd),
      ),
      child: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.add_a_photo_outlined,
              size: AppSizes.iconLg,
              color: theme.colorScheme.outline,
            ),
            const SizedBox(height: AppSizes.spacingXs),
            Text(
              AppStrings.photoUpload,
              style: TextStyle(
                fontSize: AppSizes.fontSm,
                color: theme.colorScheme.outline,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
