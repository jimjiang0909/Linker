import 'package:dio/dio.dart';

import '../constants/app_strings.dart';
import '../network/app_exception.dart';

/// Extract a user-friendly error message from any error object.
///
/// Handles:
/// - [AppException] → uses userMessage
/// - [DioException] with AppException in error field → extracts userMessage
/// - [DioException] without AppException → maps DioExceptionType
/// - Any other error → generic message
String getErrorMessage(Object error) {
  if (error is AppException) {
    return error.userMessage;
  }

  if (error is DioException) {
    // ErrorInterceptor wraps AppException in DioException.error
    if (error.error is AppException) {
      return (error.error as AppException).userMessage;
    }

    // Fallback for unprocessed DioExceptions
    switch (error.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.receiveTimeout:
      case DioExceptionType.sendTimeout:
        return AppStrings.requestTimeout;
      case DioExceptionType.connectionError:
        return AppStrings.networkUnavailable;
      case DioExceptionType.cancel:
        return 'Request cancelled';
      default:
        return AppStrings.unknownError;
    }
  }

  return AppStrings.unknownError;
}
