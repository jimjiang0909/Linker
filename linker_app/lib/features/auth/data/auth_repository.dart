import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/api_constants.dart';
import '../../../core/network/api_client.dart';

/// 认证 API 响应数据类
class AuthResponse {
  /// JWT Token
  final String token;

  /// Refresh Token
  final String refreshToken;

  /// 用户 ID
  final String userId;

  /// 用户状态（registered / profileCompleted / active）
  final String userStatus;

  const AuthResponse({
    required this.token,
    required this.refreshToken,
    required this.userId,
    required this.userStatus,
  });

  /// 从后端 JSON 响应解析
  factory AuthResponse.fromJson(Map<String, dynamic> json) {
    final data = json['data'] as Map<String, dynamic>;
    final user = data['user'] as Map<String, dynamic>;
    return AuthResponse(
      token: data['token'] as String,
      refreshToken: data['refreshToken'] as String,
      userId: user['id'] as String,
      userStatus: user['status'] as String,
    );
  }
}

/// 认证仓库
///
/// 封装认证相关的 API 调用，包括发送验证码和注册。
/// 错误由 [ErrorInterceptor] 统一处理，Repository 层不需要额外的 try-catch。
class AuthRepository {
  final ApiClient _apiClient;

  AuthRepository(this._apiClient);

  /// 发送验证码到指定邮箱
  ///
  /// 调用 POST /api/auth/send-code
  /// 成功时后端返回 200，无需解析响应体。
  Future<void> sendCode(String email) async {
    await _apiClient.post(
      ApiConstants.sendCode,
      data: {'email': email},
    );
  }

  /// 注册新用户
  ///
  /// 调用 POST /api/auth/register
  /// 返回 [AuthResponse] 包含 JWT Token 和用户状态。
  Future<AuthResponse> register({
    required String email,
    required String password,
    String? invitationCode,
  }) async {
    final data = <String, dynamic>{
      'email': email,
      'password': password,
    };
    if (invitationCode != null && invitationCode.isNotEmpty) {
      data['invitationCode'] = invitationCode;
    }
    final response = await _apiClient.post(
      ApiConstants.register,
      data: data,
    );
    return AuthResponse.fromJson(response.data as Map<String, dynamic>);
  }
  /// Login existing user
  ///
  /// Calls POST /api/auth/login
  /// Returns [AuthResponse] with JWT Token and user status.
  Future<AuthResponse> login({
    required String email,
    required String password,
  }) async {
    final response = await _apiClient.post(
      '/auth/login',
      data: {
        'email': email,
        'password': password,
      },
    );
    return AuthResponse.fromJson(response.data as Map<String, dynamic>);
  }

  /// Get current user info
  ///
  /// Calls GET /api/auth/me
  /// Returns a map with userId and status.
  Future<({String userId, String status})> getMe() async {
    final response = await _apiClient.get(ApiConstants.authMe);
    final json = response.data as Map<String, dynamic>;
    final data = json['data'] as Map<String, dynamic>;
    final user = data['user'] as Map<String, dynamic>;
    return (userId: user['id'] as String, status: user['status'] as String);
  }
}

/// AuthRepository 的 Riverpod Provider
final authRepositoryProvider = Provider<AuthRepository>((ref) {
  final apiClient = ref.watch(apiClientProvider);
  return AuthRepository(apiClient);
});
