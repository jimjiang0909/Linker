import 'dart:convert';

import 'package:dio/dio.dart';

/// 可复用的 Dio HttpClientAdapter 用于测试
///
/// 支持模拟成功响应和错误响应。
class DioAdapter implements HttpClientAdapter {
  String responseBody = '';
  int responseStatusCode = 200;
  String? lastMethod;
  Uri? lastUri;
  dynamic lastData;

  /// 是否应该抛出错误
  bool shouldThrowError = false;

  /// 错误类型
  DioExceptionType errorType = DioExceptionType.unknown;

  /// 错误状态码（用于 badResponse 类型）
  int errorStatusCode = 500;

  /// 错误响应体（用于 badResponse 类型）
  Map<String, dynamic>? errorResponseBody;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<List<int>>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    lastMethod = options.method;
    lastUri = options.uri;
    lastData = options.data;

    if (shouldThrowError) {
      Response<dynamic>? response;
      if (errorType == DioExceptionType.badResponse) {
        response = Response(
          requestOptions: options,
          statusCode: errorStatusCode,
          data: errorResponseBody,
        );
      }
      throw DioException(
        requestOptions: options,
        type: errorType,
        response: response,
      );
    }

    return ResponseBody.fromString(
      responseBody,
      responseStatusCode,
      headers: {
        Headers.contentTypeHeader: ['application/json'],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}
