import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:linker_app/core/constants/app_strings.dart';
import 'package:linker_app/features/auth/presentation/auth_page.dart';
import 'package:linker_app/features/auth/providers/auth_provider.dart';

void main() {
  group('注册页面 Widget 测试', () {
    Widget buildTestWidget() {
      return ProviderScope(
        overrides: [
          authProvider.overrideWith(() => _FakeAuthNotifier()),
        ],
        child: const MaterialApp(
          home: AuthPage(),
        ),
      );
    }

    testWidgets('验证表单字段存在', (tester) async {
      await tester.pumpWidget(buildTestWidget());
      await tester.pumpAndSettle();

      // 验证邀请码输入框存在
      expect(find.text(AppStrings.invitationCodeHint), findsOneWidget);
      // 验证邮箱输入框存在
      expect(find.text(AppStrings.emailHint), findsOneWidget);
      // 验证验证码输入框存在
      expect(find.text(AppStrings.verificationCodeHint), findsOneWidget);
      // 验证发送验证码按钮存在
      expect(find.text(AppStrings.sendCode), findsOneWidget);
      // 验证注册按钮存在
      expect(find.text(AppStrings.register), findsOneWidget);
    });

    testWidgets('验证空表单提交显示错误', (tester) async {
      await tester.pumpWidget(buildTestWidget());
      await tester.pumpAndSettle();

      // 点击注册按钮（空表单）
      await tester.tap(find.text(AppStrings.register));
      await tester.pumpAndSettle();

      // 验证显示校验错误信息
      expect(find.text('请输入邀请码'), findsOneWidget);
      expect(find.text('请输入邮箱'), findsOneWidget);
      // 验证码的 label 和 error 文本相同，所以会出现两次
      expect(find.text('请输入验证码'), findsAtLeast(2));
    });

    testWidgets('验证邀请码格式校验', (tester) async {
      await tester.pumpWidget(buildTestWidget());
      await tester.pumpAndSettle();

      // 输入不完整的邀请码（少于8位）
      final invitationField = find.byType(TextFormField).first;
      await tester.enterText(invitationField, 'abc');
      await tester.pumpAndSettle();

      // 点击注册触发校验
      await tester.tap(find.text(AppStrings.register));
      await tester.pumpAndSettle();

      // 验证显示邀请码长度错误
      expect(find.text('邀请码必须为8位'), findsOneWidget);
    });
  });
}

/// 用于测试的 Fake AuthNotifier
class _FakeAuthNotifier extends AuthNotifier {
  @override
  AsyncValue<void> build() => const AsyncData<void>(null);

  @override
  Future<void> sendVerificationCode(String email) async {}

  @override
  Future<void> register({
    required String email,
    required String code,
    required String invitationCode,
  }) async {}
}
