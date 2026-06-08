import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:linker_app/core/constants/app_strings.dart';
import 'package:linker_app/features/conversations/presentation/widgets/message_input.dart';

void main() {
  group('聊天页面 Widget 测试', () {
    testWidgets('验证输入框存在', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          child: MaterialApp(
            home: Scaffold(
              body: MessageInput(
                enabled: true,
                onSend: (_) {},
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      // 验证输入框存在
      expect(find.byType(TextField), findsOneWidget);
      // 验证占位文本
      expect(find.text(AppStrings.messagePlaceholder), findsOneWidget);
      // 验证发送按钮图标存在
      expect(find.byIcon(Icons.send_rounded), findsOneWidget);
    });

    testWidgets('验证禁用状态', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          child: MaterialApp(
            home: Scaffold(
              body: MessageInput(
                enabled: false,
                onSend: (_) {},
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      // 验证禁用状态显示"对话已结束"
      expect(find.text(AppStrings.conversationEnded), findsOneWidget);
      // 验证输入框不存在
      expect(find.byType(TextField), findsNothing);
    });
  });
}
