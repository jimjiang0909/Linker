import 'package:flutter/material.dart';

/// 应用颜色常量定义
abstract final class AppColors {
  // ============ 品牌色 ============

  /// 主色调（品牌色）
  static const Color primary = Color(0xFF6C63FF);

  /// 主色调变体 - 浅色
  static const Color primaryLight = Color(0xFF9D97FF);

  /// 主色调变体 - 深色
  static const Color primaryDark = Color(0xFF4A42DB);

  // ============ 辅助色 ============

  /// 辅助色
  static const Color secondary = Color(0xFFFF6B9D);

  /// 辅助色变体 - 浅色
  static const Color secondaryLight = Color(0xFFFF9DC2);

  /// 辅助色变体 - 深色
  static const Color secondaryDark = Color(0xFFD44A7A);

  // ============ 背景色 ============

  /// 页面背景色
  static const Color background = Color(0xFFF8F9FA);

  /// 卡片/表面背景色
  static const Color surface = Color(0xFFFFFFFF);

  /// 深色背景（用于对比区域）
  static const Color backgroundDark = Color(0xFF1A1A2E);

  // ============ 文字颜色 ============

  /// 主要文字颜色
  static const Color textPrimary = Color(0xFF1A1A2E);

  /// 次要文字颜色
  static const Color textSecondary = Color(0xFF6B7280);

  /// 提示文字颜色
  static const Color textHint = Color(0xFF9CA3AF);

  /// 白色文字（用于深色背景）
  static const Color textWhite = Color(0xFFFFFFFF);

  // ============ 功能色 ============

  /// 错误色
  static const Color error = Color(0xFFEF4444);

  /// 错误色 - 浅色背景
  static const Color errorLight = Color(0xFFFEE2E2);

  /// 成功色
  static const Color success = Color(0xFF10B981);

  /// 成功色 - 浅色背景
  static const Color successLight = Color(0xFFD1FAE5);

  /// 警告色
  static const Color warning = Color(0xFFF59E0B);

  /// 警告色 - 浅色背景
  static const Color warningLight = Color(0xFFFEF3C7);

  /// 信息色
  static const Color info = Color(0xFF3B82F6);

  /// 信息色 - 浅色背景
  static const Color infoLight = Color(0xFFDBEAFE);

  // ============ 分割线与边框 ============

  /// 分割线颜色
  static const Color divider = Color(0xFFE5E7EB);

  /// 边框颜色
  static const Color border = Color(0xFFD1D5DB);

  /// 禁用状态颜色
  static const Color disabled = Color(0xFFD1D5DB);

  // ============ 其他 ============

  /// 遮罩层颜色
  static const Color overlay = Color(0x80000000);

  /// 阴影颜色
  static const Color shadow = Color(0x1A000000);

  /// 未读角标颜色
  static const Color badge = Color(0xFFEF4444);

  /// 匹配成功动画色
  static const Color matchSuccess = Color(0xFFFF6B9D);
}
