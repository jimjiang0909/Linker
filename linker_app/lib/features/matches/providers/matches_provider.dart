import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/app_exception.dart';
import '../../../shared/models/daily_match.dart';
import '../data/match_repository.dart';

/// 每日推荐状态管理
///
/// 管理每日推荐列表的获取、感兴趣标记和跳过操作。
/// 使用 AsyncValue 包装 List of DailyMatch 作为状态，支持加载、成功和错误三种状态。
class DailyMatchesNotifier extends Notifier<AsyncValue<List<DailyMatch>>> {
  @override
  AsyncValue<List<DailyMatch>> build() {
    return const AsyncValue.loading();
  }

  /// 获取每日推荐列表
  Future<void> fetchDailyMatches() async {
    state = const AsyncValue.loading();
    try {
      final repository = ref.read(matchRepositoryProvider);
      final matches = await repository.getDailyMatches();
      state = AsyncValue.data(matches);
    } catch (e, st) {
      state = AsyncValue.error(e, st);
    }
  }

  /// 标记感兴趣
  ///
  /// 调用 API 后从列表中移除该卡片。
  /// 如果返回 DAILY_LIMIT_REACHED 错误，抛出 AppException 供 UI 层处理。
  Future<void> markInterested(String matchId) async {
    try {
      final repository = ref.read(matchRepositoryProvider);
      await repository.markInterested(matchId);
      _removeMatch(matchId);
    } on AppException {
      // 重新抛出让 UI 层处理（如 DAILY_LIMIT_REACHED）
      rethrow;
    } catch (e) {
      rethrow;
    }
  }

  /// 跳过推荐
  ///
  /// 调用 API 后从列表中移除该卡片。
  Future<void> skip(String matchId) async {
    try {
      final repository = ref.read(matchRepositoryProvider);
      await repository.skip(matchId);
      _removeMatch(matchId);
    } catch (e) {
      rethrow;
    }
  }

  /// 从列表中移除指定匹配
  void _removeMatch(String matchId) {
    final currentState = state;
    if (currentState is AsyncData<List<DailyMatch>>) {
      final updated =
          currentState.value.where((m) => m.id != matchId).toList();
      state = AsyncValue.data(updated);
    }
  }
}

/// DailyMatchesNotifier 的 Riverpod Provider
final dailyMatchesProvider =
    NotifierProvider<DailyMatchesNotifier, AsyncValue<List<DailyMatch>>>(
  DailyMatchesNotifier.new,
);
