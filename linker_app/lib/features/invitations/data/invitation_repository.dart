import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/api_constants.dart';
import '../../../core/network/api_client.dart';
import '../../../shared/models/invitation_code.dart';

/// 邀请码仓库
///
/// 封装邀请码相关的 API 调用，包括获取邀请码列表和已邀请用户列表。
/// 错误由 [ErrorInterceptor] 统一处理，Repository 层不需要额外的 try-catch。
class InvitationRepository {
  final ApiClient _apiClient;

  InvitationRepository(this._apiClient);

  /// 获取当前用户的邀请码列表
  ///
  /// 调用 GET /api/invitations
  /// 返回 [List<InvitationCode>]。
  ///
  /// 后端响应格式：
  /// ```json
  /// {
  ///   "code": "SUCCESS",
  ///   "data": [{ "id": "...", "code": "...", "status": "available", ... }]
  /// }
  /// ```
  Future<List<InvitationCode>> getInvitations() async {
    final response = await _apiClient.get(ApiConstants.invitations);
    final json = response.data as Map<String, dynamic>;
    final data = json['data'] as List<dynamic>;
    return data
        .map((e) => InvitationCode.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// 获取已邀请用户列表
  ///
  /// 调用 GET /api/invitations/invitees
  /// 返回 [List<Invitee>]。
  ///
  /// 后端响应格式：
  /// ```json
  /// {
  ///   "code": "SUCCESS",
  ///   "data": [{ "id": "...", "name": "...", "registeredAt": "..." }]
  /// }
  /// ```
  Future<List<Invitee>> getInvitees() async {
    final response = await _apiClient.get(ApiConstants.invitees);
    final json = response.data as Map<String, dynamic>;
    final data = json['data'] as List<dynamic>;
    return data
        .map((e) => Invitee.fromJson(e as Map<String, dynamic>))
        .toList();
  }
}

/// InvitationRepository 的 Riverpod Provider
final invitationRepositoryProvider = Provider<InvitationRepository>((ref) {
  final apiClient = ref.watch(apiClientProvider);
  return InvitationRepository(apiClient);
});
