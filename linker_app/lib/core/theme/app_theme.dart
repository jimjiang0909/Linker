import 'package:flutter/material.dart';

import '../constants/app_colors.dart';
import '../constants/app_sizes.dart';

/// 应用主题配置
/// 基于 Material 3 设计规范，使用 AppColors 和 AppSizes 中定义的常量
abstract final class AppTheme {
  /// 亮色主题
  static ThemeData get lightTheme {
    final colorScheme = ColorScheme(
      brightness: Brightness.light,
      primary: AppColors.primary,
      onPrimary: AppColors.textWhite,
      primaryContainer: AppColors.primaryLight,
      onPrimaryContainer: AppColors.primaryDark,
      secondary: AppColors.secondary,
      onSecondary: AppColors.textWhite,
      secondaryContainer: AppColors.secondaryLight,
      onSecondaryContainer: AppColors.secondaryDark,
      error: AppColors.error,
      onError: AppColors.textWhite,
      errorContainer: AppColors.errorLight,
      onErrorContainer: AppColors.error,
      surface: AppColors.surface,
      onSurface: AppColors.textPrimary,
      onSurfaceVariant: AppColors.textSecondary,
      outline: AppColors.border,
      outlineVariant: AppColors.divider,
      shadow: AppColors.shadow,
    );

    return ThemeData(
      useMaterial3: true,
      colorScheme: colorScheme,
      scaffoldBackgroundColor: AppColors.background,
      appBarTheme: _appBarTheme(colorScheme),
      bottomNavigationBarTheme: _bottomNavigationBarTheme(colorScheme),
      elevatedButtonTheme: _elevatedButtonTheme(colorScheme),
      outlinedButtonTheme: _outlinedButtonTheme(colorScheme),
      textButtonTheme: _textButtonTheme(colorScheme),
      inputDecorationTheme: _inputDecorationTheme(colorScheme),
      cardTheme: _cardTheme(),
      textTheme: _textTheme(),
      dividerTheme: const DividerThemeData(
        color: AppColors.divider,
        thickness: AppSizes.dividerThickness,
      ),
    );
  }

  /// 暗色主题
  static ThemeData get darkTheme {
    final colorScheme = ColorScheme(
      brightness: Brightness.dark,
      primary: AppColors.primaryLight,
      onPrimary: AppColors.backgroundDark,
      primaryContainer: AppColors.primaryDark,
      onPrimaryContainer: AppColors.primaryLight,
      secondary: AppColors.secondaryLight,
      onSecondary: AppColors.backgroundDark,
      secondaryContainer: AppColors.secondaryDark,
      onSecondaryContainer: AppColors.secondaryLight,
      error: AppColors.error,
      onError: AppColors.textWhite,
      errorContainer: AppColors.errorLight,
      onErrorContainer: AppColors.error,
      surface: const Color(0xFF1E1E2E),
      onSurface: AppColors.textWhite,
      onSurfaceVariant: const Color(0xFFB0B0C0),
      outline: const Color(0xFF3A3A4A),
      outlineVariant: const Color(0xFF2A2A3A),
      shadow: AppColors.shadow,
    );

    return ThemeData(
      useMaterial3: true,
      colorScheme: colorScheme,
      scaffoldBackgroundColor: AppColors.backgroundDark,
      appBarTheme: _appBarTheme(colorScheme),
      bottomNavigationBarTheme: _bottomNavigationBarTheme(colorScheme),
      elevatedButtonTheme: _elevatedButtonTheme(colorScheme),
      outlinedButtonTheme: _outlinedButtonTheme(colorScheme),
      textButtonTheme: _textButtonTheme(colorScheme),
      inputDecorationTheme: _inputDecorationTheme(colorScheme),
      cardTheme: _cardTheme(),
      textTheme: _textTheme(),
      dividerTheme: DividerThemeData(
        color: colorScheme.outlineVariant,
        thickness: AppSizes.dividerThickness,
      ),
    );
  }

  // ============ 私有主题构建方法 ============

  static AppBarTheme _appBarTheme(ColorScheme colorScheme) {
    return AppBarTheme(
      elevation: 0,
      scrolledUnderElevation: 0.5,
      centerTitle: true,
      backgroundColor: colorScheme.surface,
      foregroundColor: colorScheme.onSurface,
      titleTextStyle: TextStyle(
        fontSize: AppSizes.fontLg,
        fontWeight: FontWeight.w600,
        color: colorScheme.onSurface,
      ),
      iconTheme: IconThemeData(
        color: colorScheme.onSurface,
        size: AppSizes.iconMd,
      ),
    );
  }

  static BottomNavigationBarThemeData _bottomNavigationBarTheme(
    ColorScheme colorScheme,
  ) {
    return BottomNavigationBarThemeData(
      type: BottomNavigationBarType.fixed,
      elevation: 8,
      backgroundColor: colorScheme.surface,
      selectedItemColor: colorScheme.primary,
      unselectedItemColor: colorScheme.onSurfaceVariant,
      selectedLabelStyle: const TextStyle(
        fontSize: AppSizes.fontXs,
        fontWeight: FontWeight.w600,
      ),
      unselectedLabelStyle: const TextStyle(
        fontSize: AppSizes.fontXs,
        fontWeight: FontWeight.w400,
      ),
      showUnselectedLabels: true,
    );
  }

  static ElevatedButtonThemeData _elevatedButtonTheme(
    ColorScheme colorScheme,
  ) {
    return ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        elevation: 0,
        backgroundColor: colorScheme.primary,
        foregroundColor: colorScheme.onPrimary,
        disabledBackgroundColor: AppColors.disabled,
        disabledForegroundColor: AppColors.textHint,
        minimumSize: const Size(
          double.infinity,
          AppSizes.buttonHeightLg,
        ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppSizes.radiusLg),
        ),
        textStyle: const TextStyle(
          fontSize: AppSizes.fontLg,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }

  static OutlinedButtonThemeData _outlinedButtonTheme(
    ColorScheme colorScheme,
  ) {
    return OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        elevation: 0,
        foregroundColor: colorScheme.primary,
        minimumSize: const Size(
          double.infinity,
          AppSizes.buttonHeightMd,
        ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppSizes.radiusLg),
        ),
        side: BorderSide(color: colorScheme.primary),
        textStyle: const TextStyle(
          fontSize: AppSizes.fontMd,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }

  static TextButtonThemeData _textButtonTheme(ColorScheme colorScheme) {
    return TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: colorScheme.primary,
        textStyle: const TextStyle(
          fontSize: AppSizes.fontMd,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }

  static InputDecorationTheme _inputDecorationTheme(
    ColorScheme colorScheme,
  ) {
    final border = OutlineInputBorder(
      borderRadius: BorderRadius.circular(AppSizes.radiusMd),
      borderSide: BorderSide(color: colorScheme.outline),
    );

    final focusedBorder = OutlineInputBorder(
      borderRadius: BorderRadius.circular(AppSizes.radiusMd),
      borderSide: BorderSide(color: colorScheme.primary, width: 1.5),
    );

    final errorBorder = OutlineInputBorder(
      borderRadius: BorderRadius.circular(AppSizes.radiusMd),
      borderSide: BorderSide(color: colorScheme.error),
    );

    return InputDecorationTheme(
      filled: true,
      fillColor: colorScheme.surface,
      contentPadding: const EdgeInsets.symmetric(
        horizontal: AppSizes.spacingMd,
        vertical: AppSizes.spacingSm + AppSizes.spacingXs,
      ),
      border: border,
      enabledBorder: border,
      focusedBorder: focusedBorder,
      errorBorder: errorBorder,
      focusedErrorBorder: errorBorder,
      hintStyle: TextStyle(
        color: colorScheme.onSurfaceVariant,
        fontSize: AppSizes.fontMd,
      ),
      errorStyle: TextStyle(
        color: colorScheme.error,
        fontSize: AppSizes.fontSm,
      ),
    );
  }

  static CardThemeData _cardTheme() {
    return CardThemeData(
      elevation: 1,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppSizes.radiusLg),
      ),
      clipBehavior: Clip.antiAlias,
      margin: const EdgeInsets.symmetric(
        horizontal: AppSizes.spacingMd,
        vertical: AppSizes.spacingSm,
      ),
    );
  }

  static TextTheme _textTheme() {
    return const TextTheme(
      displayLarge: TextStyle(
        fontSize: AppSizes.fontDisplay,
        fontWeight: FontWeight.w700,
        color: AppColors.textPrimary,
      ),
      headlineLarge: TextStyle(
        fontSize: AppSizes.fontXxl,
        fontWeight: FontWeight.w700,
        color: AppColors.textPrimary,
      ),
      headlineMedium: TextStyle(
        fontSize: AppSizes.fontXl,
        fontWeight: FontWeight.w600,
        color: AppColors.textPrimary,
      ),
      titleLarge: TextStyle(
        fontSize: AppSizes.fontLg,
        fontWeight: FontWeight.w600,
        color: AppColors.textPrimary,
      ),
      titleMedium: TextStyle(
        fontSize: AppSizes.fontMd,
        fontWeight: FontWeight.w600,
        color: AppColors.textPrimary,
      ),
      bodyLarge: TextStyle(
        fontSize: AppSizes.fontLg,
        fontWeight: FontWeight.w400,
        color: AppColors.textPrimary,
      ),
      bodyMedium: TextStyle(
        fontSize: AppSizes.fontMd,
        fontWeight: FontWeight.w400,
        color: AppColors.textPrimary,
      ),
      bodySmall: TextStyle(
        fontSize: AppSizes.fontSm,
        fontWeight: FontWeight.w400,
        color: AppColors.textSecondary,
      ),
      labelLarge: TextStyle(
        fontSize: AppSizes.fontMd,
        fontWeight: FontWeight.w600,
        color: AppColors.textPrimary,
      ),
      labelSmall: TextStyle(
        fontSize: AppSizes.fontXs,
        fontWeight: FontWeight.w400,
        color: AppColors.textHint,
      ),
    );
  }
}
