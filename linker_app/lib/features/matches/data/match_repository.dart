import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/api_constants.dart';
import '../../../core/network/api_client.dart';
import '../../../shared/models/daily_match.dart';

/// 匹配仓库
///
/// 封装每日推荐相关的 API 调用，包括获取推荐列表、标记感兴趣和跳过。
/// 错误由 [ErrorInterceptor] 统一处理，Repository 层不需要额外的 try-catch。
class MatchRepository {
  final ApiClient _apiClient;

  MatchRepository(this._apiClient);

  /// 获取每日推荐列表
  ///
  /// 调用 GET /api/matches/daily
  /// 返回 [List<DailyMatch>] 推荐列表。
  ///
  /// 后端响应格式：
  /// ```json
  /// {
  ///   "code": "SUCCESS",
  ///   "data": [{ "matchId": "...", "score": 85, "recommendedUser": {...} }]
  /// }
  /// ```
  Future<List<DailyMatch>> getDailyMatches() async {
    final response = await _apiClient.get(ApiConstants.dailyMatches);
    final json = response.data as Map<String, dynamic>;
    final data = json['data'] as List<dynamic>;
    return data.map((e) {
      final item = e as Map<String, dynamic>;
      // 如果后端返回的是新结构（含 recommendedUser），手动映射
      if (item.containsKey('recommendedUser')) {
        final user = item['recommendedUser'] as Map<String, dynamic>;
        final photos = user['photos'] as List<dynamic>?;
        String? photoUrl;
        if (photos != null && photos.isNotEmpty) {
          final firstPhoto = photos.first as Map<String, dynamic>;
          photoUrl = firstPhoto['url'] as String?;
        }
        return DailyMatch(
          id: (item['matchId'] ?? item['id']) as String,
          name: user['name'] as String? ?? '',
          age: user['age'] as int? ?? 0,
          occupation: user['occupation'] as String? ?? '',
          city: user['city'] as String? ?? '',
          score: item['score'] as int? ?? 0,
          reason: (item['reason'] ?? '') as String,
          photoUrl: photoUrl,
          status: _parseMatchStatus(item['status'] as String? ?? 'pending'),
        );
      }
      // 兼容旧结构（直接平铺字段）
      return DailyMatch.fromJson(item);
    }).toList();
  }

  /// 将后端状态字符串映射为 MatchStatus 枚举
  MatchStatus _parseMatchStatus(String status) {
    switch (status) {
      case 'pending':
        return MatchStatus.pending;
      case 'interested':
        return MatchStatus.interested;
      case 'skipped':
        return MatchStatus.skipped;
      case 'matched':
        return MatchStatus.matched;
      default:
        return MatchStatus.pending;
    }
  }

  /// 标记感兴趣
  ///
  /// 调用 POST /api/matches/:matchId/interested
  /// 当对方也感兴趣时，后端会通过 WebSocket 推送 match:success 事件。
  ///
  /// 可能抛出 DAILY_LIMIT_REACHED 错误（男性用户每日上限）。
  Future<void> markInterested(String matchId) async {
    await _apiClient.post(ApiConstants.matchInterested(matchId));
  }

  /// 跳过推荐
  ///
  /// 调用 POST /api/matches/:matchId/skip
  Future<void> skip(String matchId) async {
    await _apiClient.post(ApiConstants.matchSkip(matchId));
  }
}

/// MatchRepository 的 Riverpod Provider
final matchRepositoryProvider = Provider<MatchRepository>((ref) {
  final apiClient = ref.watch(apiClientProvider);
  return MatchRepository(apiClient);
});
