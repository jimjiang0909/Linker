import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:linker_app/core/constants/app_strings.dart';
import 'package:linker_app/features/profile/presentation/profile_setup_page.dart';
import 'package:linker_app/features/profile/providers/profile_provider.dart';
import 'package:linker_app/shared/models/profile.dart';

void main() {
  group('资料填写页面 Widget 测试', () {
    Widget buildTestWidget() {
      return ProviderScope(
        overrides: [
          profileProvider.overrideWith(() => _FakeProfileNotifier()),
        ],
        child: const MaterialApp(
          home: ProfileSetupPage(),
        ),
      );
    }

    testWidgets('验证表单字段存在', (tester) async {
      await tester.pumpWidget(buildTestWidget());
      await tester.pumpAndSettle();

      // 验证姓名输入框存在
      expect(find.text(AppStrings.nameHint), findsOneWidget);
      // 验证职业输入框存在
      expect(find.text(AppStrings.occupationHint), findsOneWidget);
      // 验证城市输入框存在
      expect(find.text(AppStrings.cityHint), findsOneWidget);
      // 验证自我介绍输入框存在
      expect(find.text(AppStrings.bioHint), findsOneWidget);
      // 验证保存按钮存在
      expect(find.text(AppStrings.save), findsOneWidget);
      // 验证照片上传区域存在
      expect(find.text(AppStrings.photoUpload), findsOneWidget);
    });

    testWidgets('验证姓名校验', (tester) async {
      await tester.pumpWidget(buildTestWidget());
      await tester.pumpAndSettle();

      // 找到姓名输入框并输入超长字符串
      final nameField = find.widgetWithText(TextFormField, AppStrings.nameHint);
      await tester.enterText(nameField, 'a' * 21);
      await tester.pumpAndSettle();

      // 点击保存触发校验
      await tester.tap(find.text(AppStrings.save));
      await tester.pumpAndSettle();

      // 由于 maxLength: 20 限制，输入会被截断，所以不会出现错误
      // 验证空姓名的校验
      await tester.enterText(nameField, '');
      await tester.pumpAndSettle();

      await tester.tap(find.text(AppStrings.save));
      await tester.pumpAndSettle();

      expect(find.text('请输入姓名'), findsOneWidget);
    });
  });
}

/// 用于测试的 Fake ProfileNotifier
class _FakeProfileNotifier extends ProfileNotifier {
  @override
  AsyncValue<Profile?> build() => const AsyncData<Profile?>(null);
}
