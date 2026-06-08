import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/api_constants.dart';
import '../../../core/network/api_client.dart';

/// 偏好设置数据模型
///
/// 对应后端 GET /api/preferences 返回的偏好数据。
class Preferences {
  final int ageMin;
  final int ageMax;
  final String datingIntent;
  final List<String> occupationTypes;
  final List<String> personalityTraits;

  const Preferences({
    required this.ageMin,
    required this.ageMax,
    required this.datingIntent,
    required this.occupationTypes,
    required this.personalityTraits,
  });

  /// 从 JSON Map 创建 Preferences 实例
  ///
  /// 同时兼容 camelCase 和 snake_case 字段名
  factory Preferences.fromJson(Map<String, dynamic> json) {
    return Preferences(
      ageMin: (json['ageMin'] ?? json['age_min']) as int,
      ageMax: (json['ageMax'] ?? json['age_max']) as int,
      datingIntent: (json['datingIntent'] ?? json['dating_intent']) as String,
      occupationTypes:
          ((json['occupationTypes'] ?? json['occupation_types']) as List<dynamic>)
              .map((e) => e as String)
              .toList(),
      personalityTraits:
          ((json['personalityTraits'] ?? json['personality_traits'])
                  as List<dynamic>)
              .map((e) => e as String)
              .toList(),
    );
  }

  /// 转换为 JSON Map
  Map<String, dynamic> toJson() {
    return {
      'ageMin': ageMin,
      'ageMax': ageMax,
      'datingIntent': datingIntent,
      'occupationTypes': occupationTypes,
      'personalityTraits': personalityTraits,
    };
  }
}

/// 偏好设置更新请求数据类
///
/// 封装 PUT /api/preferences 请求体。
class PreferencesUpdateRequest {
  final int ageMin;
  final int ageMax;
  final String datingIntent;
  final List<String> occupationTypes;
  final List<String> personalityTraits;

  const PreferencesUpdateRequest({
    required this.ageMin,
    required this.ageMax,
    required this.datingIntent,
    required this.occupationTypes,
    required this.personalityTraits,
  });

  /// 转换为 JSON Map，用于 API 请求体
  Map<String, dynamic> toJson() {
    return {
      'ageMin': ageMin,
      'ageMax': ageMax,
      'datingIntent': datingIntent,
      'occupationTypes': occupationTypes,
      'personalityTraits': personalityTraits,
    };
  }
}

/// 偏好设置仓库
///
/// 封装偏好设置相关的 API 调用，包括获取偏好和更新偏好。
/// 错误由 [ErrorInterceptor] 统一处理，Repository 层不需要额外的 try-catch。
class PreferencesRepository {
  final ApiClient _apiClient;

  PreferencesRepository(this._apiClient);

  /// 获取当前用户偏好设置
  ///
  /// 调用 GET /api/preferences
  /// 返回 [Preferences?] 对象，当后端返回空对象时返回 null。
  ///
  /// 后端响应格式：
  /// ```json
  /// {
  ///   "code": "SUCCESS",
  ///   "data": { "ageMin": 20, "ageMax": 35, ... }
  /// }
  /// ```
  /// 当偏好不存在时，后端返回 `data: {}`。
  Future<Preferences?> getPreferences() async {
    final response = await _apiClient.get(ApiConstants.preferences);
    final json = response.data as Map<String, dynamic>;
    final data = json['data'] as Map<String, dynamic>;
    // 后端在 preference 不存在时返回空对象
    if (data.isEmpty || !data.containsKey('ageMin') && !data.containsKey('age_min')) {
      return null;
    }
    return Preferences.fromJson(data);
  }

  /// 更新用户偏好设置
  ///
  /// 调用 PUT /api/preferences
  /// 返回更新后的 [Preferences] 对象。
  Future<Preferences> updatePreferences(PreferencesUpdateRequest request) async {
    final response = await _apiClient.put(
      ApiConstants.preferences,
      data: request.toJson(),
    );
    final json = response.data as Map<String, dynamic>;
    final data = json['data'] as Map<String, dynamic>;
    return Preferences.fromJson(data);
  }
}

/// PreferencesRepository 的 Riverpod Provider
final preferencesRepositoryProvider = Provider<PreferencesRepository>((ref) {
  final apiClient = ref.watch(apiClientProvider);
  return PreferencesRepository(apiClient);
});
