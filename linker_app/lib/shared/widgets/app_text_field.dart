import 'package:flutter/material.dart';

import '../../core/constants/app_sizes.dart';

/// 通用输入框组件
///
/// 封装 TextFormField，支持 label、hint、validator、controller、prefixIcon 等参数。
/// 自动展示校验错误提示。
class AppTextField extends StatelessWidget {
  const AppTextField({
    super.key,
    this.controller,
    this.label,
    this.hint,
    this.validator,
    this.prefixIcon,
    this.suffixIcon,
    this.obscureText = false,
    this.keyboardType,
    this.maxLines = 1,
    this.maxLength,
    this.onChanged,
    this.enabled = true,
    this.autofocus = false,
    this.textInputAction,
  });

  /// 文本控制器
  final TextEditingController? controller;

  /// 标签文字
  final String? label;

  /// 提示文字
  final String? hint;

  /// 校验函数
  final String? Function(String?)? validator;

  /// 前置图标
  final IconData? prefixIcon;

  /// 后置图标组件
  final Widget? suffixIcon;

  /// 是否隐藏输入内容（密码输入）
  final bool obscureText;

  /// 键盘类型
  final TextInputType? keyboardType;

  /// 最大行数
  final int maxLines;

  /// 最大字符数
  final int? maxLength;

  /// 文本变化回调
  final ValueChanged<String>? onChanged;

  /// 是否启用
  final bool enabled;

  /// 是否自动获取焦点
  final bool autofocus;

  /// 键盘操作按钮类型
  final TextInputAction? textInputAction;

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      controller: controller,
      validator: validator,
      obscureText: obscureText,
      keyboardType: keyboardType,
      maxLines: maxLines,
      maxLength: maxLength,
      onChanged: onChanged,
      enabled: enabled,
      autofocus: autofocus,
      textInputAction: textInputAction,
      decoration: InputDecoration(
        labelText: label,
        hintText: hint,
        prefixIcon: prefixIcon != null ? Icon(prefixIcon) : null,
        suffixIcon: suffixIcon,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppSizes.radiusMd),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppSizes.radiusMd),
          borderSide: BorderSide(
            color: Theme.of(context).colorScheme.outline,
          ),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppSizes.radiusMd),
          borderSide: BorderSide(
            color: Theme.of(context).colorScheme.primary,
            width: 2,
          ),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppSizes.radiusMd),
          borderSide: BorderSide(
            color: Theme.of(context).colorScheme.error,
          ),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppSizes.radiusMd),
          borderSide: BorderSide(
            color: Theme.of(context).colorScheme.error,
            width: 2,
          ),
        ),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: AppSizes.spacingMd,
          vertical: AppSizes.spacingSm + 4,
        ),
      ),
    );
  }
}
