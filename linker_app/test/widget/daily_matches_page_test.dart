import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:linker_app/core/constants/app_strings.dart';
import 'package:linker_app/core/network/websocket_client.dart';
import 'package:linker_app/core/storage/secure_storage.dart';
import 'package:linker_app/features/matches/presentation/daily_matches_page.dart';
import 'package:linker_app/features/matches/providers/matches_provider.dart';
import 'package:linker_app/shared/models/daily_match.dart';

void main() {
  group('推荐卡片页面 Widget 测试', () {
    testWidgets('验证空状态展示', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            dailyMatchesProvider
                .overrideWith(() => _EmptyMatchesNotifier()),
            webSocketClientProvider.overrideWithValue(
              WebSocketClient(storage: SecureStorage()),
            ),
          ],
          child: const MaterialApp(
            home: DailyMatchesPage(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      // 验证空状态文案展示
      expect(find.text(AppStrings.allRecommendationViewed), findsOneWidget);
      expect(find.text(AppStrings.nextRecommendationHint), findsOneWidget);
      // 验证"调整偏好"按钮存在
      expect(find.text('调整偏好'), findsOneWidget);
    });
  });
}

/// 返回空列表的 Fake DailyMatchesNotifier
class _EmptyMatchesNotifier extends DailyMatchesNotifier {
  @override
  AsyncValue<List<DailyMatch>> build() {
    return const AsyncValue.data([]);
  }

  @override
  Future<void> fetchDailyMatches() async {
    state = const AsyncValue.data([]);
  }
}
