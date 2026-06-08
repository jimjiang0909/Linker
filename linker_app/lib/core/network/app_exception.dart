import '../constants/app_strings.dart';

/// 统一应用异常类
///
/// 将后端 API 错误和网络错误统一为标准格式，
/// 便于上层 UI 展示用户友好的错误提示。
class AppException implements Exception {
  /// 错误码（对应后端返回的 code 字段，如 'INVALID_EMAIL_FORMAT'）
  final String code;

  /// 错误消息（后端返回的原始消息或预定义消息）
  final String message;

  /// 附加错误详情
  final Map<String, dynamic>? details;

  /// HTTP 状态码（仅后端响应错误时有值）
  final int? statusCode;

  const AppException({
    required this.code,
    required this.message,
    this.details,
    this.statusCode,
  });

  /// 用户友好的中文错误消息
  ///
  /// 优先使用 [AppStrings.errorMessages] 中预定义的映射消息，
  /// 如果映射中不存在该错误码，则回退到 [message] 字段。
  String get userMessage {
    final mapped = AppStrings.errorMessages[code];
    return mapped ?? message;
  }

  @override
  String toString() => 'AppException(code: $code, message: $message)';

  // ============ 预定义错误工厂 ============

  /// 网络连接超时
  factory AppException.timeout() => const AppException(
        code: 'TIMEOUT',
        message: 'Request timed out. Please check your connection.',
      );

  /// 网络连接错误
  factory AppException.networkError() => const AppException(
        code: 'NETWORK_ERROR',
        message: 'No internet connection',
      );

  /// 请求被取消
  factory AppException.cancelled() => const AppException(
        code: 'CANCELLED',
        message: 'Request cancelled',
      );

  /// 服务器错误
  factory AppException.serverError({int? statusCode}) => AppException(
        code: 'SERVER_ERROR',
        message: 'Service temporarily unavailable. Please try again later.',
        statusCode: statusCode,
      );

  /// 未知错误
  factory AppException.unknown([String? message]) => AppException(
        code: 'UNKNOWN',
        message: message ?? 'Something went wrong. Please try again.',
      );

  /// 从后端错误响应构造
  factory AppException.fromResponse({
    required int statusCode,
    required String code,
    required String message,
    Map<String, dynamic>? details,
  }) =>
      AppException(
        code: code,
        message: message,
        details: details,
        statusCode: statusCode,
      );
}
