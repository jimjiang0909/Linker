import 'dart:ui';

import 'package:dio/dio.dart';

import '../constants/api_constants.dart';
import '../storage/secure_storage.dart';
import 'app_exception.dart';

/// Auth 拦截器
///
/// 自动从 SecureStorage 读取 Token 并附加到请求的 Authorization header。
/// 当收到 HTTP 401 响应时，尝试用 refresh token 刷新 access token 并重试请求。
/// 如果刷新也失败，则清除 Token 并通知应用需要重新登录。
class AuthInterceptor extends QueuedInterceptor {
  final SecureStorage _storage;
  final VoidCallback? _onUnauthorized;
  final Dio _dio;
  bool _isRefreshing = false;

  AuthInterceptor({
    required SecureStorage storage,
    required Dio dio,
    VoidCallback? onUnauthorized,
  })  : _storage = storage,
        _dio = dio,
        _onUnauthorized = onUnauthorized;

  @override
  Future<void> onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    final token = await _storage.getToken();
    if (token != null && token.isNotEmpty) {
      options.headers['Authorization'] = 'Bearer $token';
    }
    handler.next(options);
  }

  @override
  Future<void> onError(
    DioException err,
    ErrorInterceptorHandler handler,
  ) async {
    if (err.response?.statusCode != 401) {
      return handler.next(err);
    }

    // 如果是 refresh 请求本身失败，不要循环刷新
    if (err.requestOptions.path == ApiConstants.refreshToken) {
      await _clearAndNotify();
      return handler.next(err);
    }

    // 尝试刷新 token
    final refreshToken = await _storage.getRefreshToken();
    if (refreshToken == null || refreshToken.isEmpty) {
      await _clearAndNotify();
      return handler.next(err);
    }

    if (_isRefreshing) {
      return handler.next(err);
    }

    _isRefreshing = true;
    try {
      final response = await _dio.post(
        ApiConstants.refreshToken,
        data: {'refreshToken': refreshToken},
      );

      final data = response.data as Map<String, dynamic>;
      final newToken = (data['data'] as Map<String, dynamic>)['token'] as String;
      final newRefreshToken = (data['data'] as Map<String, dynamic>)['refreshToken'] as String;

      await _storage.saveToken(newToken);
      await _storage.saveRefreshToken(newRefreshToken);
      _isRefreshing = false;

      // 用新 token 重试原请求
      final opts = err.requestOptions;
      opts.headers['Authorization'] = 'Bearer $newToken';
      final retryResponse = await _dio.fetch(opts);
      return handler.resolve(retryResponse);
    } catch (_) {
      _isRefreshing = false;
      await _clearAndNotify();
      return handler.next(err);
    }
  }

  Future<void> _clearAndNotify() async {
    await _storage.deleteToken();
    await _storage.deleteRefreshToken();
    _onUnauthorized?.call();
  }
}

/// 错误处理拦截器
///
/// 将 DioException 统一转换为 [AppException] 格式，
/// 使上层代码只需处理 AppException 而无需关心底层网络错误细节。
///
/// 后端错误响应格式：
/// ```json
/// { "code": "INVALID_EMAIL_FORMAT", "message": "邮箱格式错误", "details": {} }
/// ```
class ErrorInterceptor extends Interceptor {
  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    final appException = _convertToAppException(err);

    handler.reject(
      DioException(
        requestOptions: err.requestOptions,
        response: err.response,
        type: err.type,
        error: appException,
      ),
    );
  }

  /// 将 DioException 转换为 AppException
  AppException _convertToAppException(DioException err) {
    switch (err.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.receiveTimeout:
      case DioExceptionType.sendTimeout:
        return AppException.timeout();

      case DioExceptionType.connectionError:
        return AppException.networkError();

      case DioExceptionType.badResponse:
        return _parseResponseError(err.response);

      case DioExceptionType.cancel:
        return AppException.cancelled();

      case DioExceptionType.badCertificate:
      case DioExceptionType.unknown:
        return AppException.unknown();
    }
  }

  /// 解析后端返回的错误响应体
  ///
  /// 支持两种格式：
  /// 1. `{ "code": "...", "message": "...", "details": {...} }`
  /// 2. `{ "error": { "code": "...", "message": "..." } }`
  /// 3. `{ "error": "错误消息" }`
  AppException _parseResponseError(Response<dynamic>? response) {
    if (response == null) {
      return AppException.serverError();
    }

    final statusCode = response.statusCode ?? 500;
    final data = response.data;

    if (data is Map<String, dynamic>) {
      // 格式 1: { "code": "...", "message": "..." }
      if (data.containsKey('code') && data.containsKey('message')) {
        return AppException.fromResponse(
          statusCode: statusCode,
          code: data['code'] as String? ?? 'UNKNOWN',
          message: data['message'] as String? ?? 'Service temporarily unavailable. Please try again later.',
          details: data['details'] is Map<String, dynamic>
              ? data['details'] as Map<String, dynamic>
              : null,
        );
      }

      // 格式 2: { "error": { "code": "...", "message": "..." } }
      if (data.containsKey('error') && data['error'] is Map<String, dynamic>) {
        final error = data['error'] as Map<String, dynamic>;
        return AppException.fromResponse(
          statusCode: statusCode,
          code: error['code'] as String? ?? 'UNKNOWN',
          message: error['message'] as String? ?? 'Service temporarily unavailable. Please try again later.',
          details: error['details'] is Map<String, dynamic>
              ? error['details'] as Map<String, dynamic>
              : null,
        );
      }

      // 格式 3: { "error": "错误消息" }
      if (data.containsKey('error') && data['error'] is String) {
        return AppException.fromResponse(
          statusCode: statusCode,
          code: 'SERVER_ERROR',
          message: data['error'] as String,
        );
      }
    }

    // 无法解析的响应，返回通用服务器错误
    return AppException.serverError(statusCode: statusCode);
  }
}
