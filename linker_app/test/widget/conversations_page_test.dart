import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:linker_app/core/constants/app_strings.dart';
import 'package:linker_app/core/network/websocket_client.dart';
import 'package:linker_app/core/storage/secure_storage.dart';
import 'package:linker_app/features/conversations/presentation/conversations_page.dart';
import 'package:linker_app/features/conversations/providers/conversations_provider.dart';
import 'package:linker_app/shared/models/conversation.dart';

void main() {
  group('对话列表页面 Widget 测试', () {
    testWidgets('验证空状态展示', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            conversationsProvider
                .overrideWith(() => _EmptyConversationsNotifier()),
            webSocketClientProvider.overrideWithValue(
              WebSocketClient(storage: SecureStorage()),
            ),
          ],
          child: MaterialApp(
            home: const ConversationsPage(),
            routes: {
              '/matches': (_) => const Scaffold(body: Text('Matches')),
            },
          ),
        ),
      );
      await tester.pumpAndSettle();

      // 验证空状态文案展示
      expect(find.text(AppStrings.noConversations), findsOneWidget);
      // 验证"去看看推荐"按钮存在
      expect(find.text('去看看推荐'), findsOneWidget);
      // 验证空状态图标存在
      expect(find.byIcon(Icons.chat_bubble_outline), findsOneWidget);
    });
  });
}

/// 返回空列表的 Fake ConversationsNotifier
class _EmptyConversationsNotifier extends ConversationsNotifier {
  @override
  AsyncValue<List<Conversation>> build() {
    return const AsyncValue.data([]);
  }

  @override
  Future<void> fetchConversations() async {
    state = const AsyncValue.data([]);
  }
}
