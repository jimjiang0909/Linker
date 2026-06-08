import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:linker_app/core/constants/app_strings.dart';
import 'package:linker_app/features/preferences/data/preferences_repository.dart';
import 'package:linker_app/features/preferences/presentation/preferences_setup_page.dart';
import 'package:linker_app/features/preferences/providers/preferences_provider.dart';

void main() {
  group('偏好设置页面 Widget 测试', () {
    Widget buildTestWidget() {
      return ProviderScope(
        overrides: [
          preferencesProvider.overrideWith(() => _FakePreferencesNotifier()),
        ],
        child: const MaterialApp(
          home: PreferencesSetupPage(),
        ),
      );
    }

    testWidgets('验证滑块存在', (tester) async {
      await tester.pumpWidget(buildTestWidget());
      await tester.pumpAndSettle();

      // 验证年龄范围滑块存在
      expect(find.byType(RangeSlider), findsOneWidget);
      // 验证年龄范围标题存在
      expect(find.textContaining(AppStrings.ageRange), findsOneWidget);
      // 验证交友意图标题存在
      expect(find.text(AppStrings.datingIntent), findsOneWidget);
      // 验证职业类型标题存在
      expect(find.text(AppStrings.occupationTypes), findsOneWidget);
      // 验证性格特征标题存在
      expect(find.text(AppStrings.personalityTraits), findsOneWidget);
    });

    testWidgets('验证多选限制', (tester) async {
      await tester.pumpWidget(buildTestWidget());
      await tester.pumpAndSettle();

      // 选择5个职业类型
      final occupationChips = ['技术', '金融', '教育', '医疗', '设计'];
      for (final chip in occupationChips) {
        await tester.tap(find.text(chip));
        await tester.pumpAndSettle();
      }

      // 验证达到上限提示出现
      expect(find.text(AppStrings.selectionLimitReached), findsWidgets);

      // 验证计数显示 (5/5)
      expect(find.textContaining('5/5'), findsWidgets);
    });
  });
}

/// 用于测试的 Fake PreferencesNotifier
class _FakePreferencesNotifier extends PreferencesNotifier {
  @override
  AsyncValue<Preferences?> build() => const AsyncData<Preferences?>(null);
}
