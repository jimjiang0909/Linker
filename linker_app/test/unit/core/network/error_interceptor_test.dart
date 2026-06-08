import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:linker_app/core/network/api_interceptors.dart';
import 'package:linker_app/core/network/app_exception.dart';

void main() {
  late ErrorInterceptor interceptor;
  late RequestOptions requestOptions;

  setUp(() {
    interceptor = ErrorInterceptor();
    requestOptions = RequestOptions(path: '/test');
  });

  group('ErrorInterceptor', () {
    group('超时错误', () {
      test('connectionTimeout 转换为 AppException.timeout', () async {
        final err = DioException(
          requestOptions: requestOptions,
          type: DioExceptionType.connectionTimeout,
        );

        AppException? caught;
        final handler = _MockErrorHandler(
          onReject: (e) {
            caught = e.error as AppException;
          },
        );

        interceptor.onError(err, handler);

        expect(caught, isNotNull);
        expect(caught!.code, 'TIMEOUT');
        expect(caught!.message, '请求超时，请检查网络后重试');
      });

      test('receiveTimeout 转换为 AppException.timeout', () async {
        final err = DioException(
          requestOptions: requestOptions,
          type: DioExceptionType.receiveTimeout,
        );

        AppException? caught;
        final handler = _MockErrorHandler(
          onReject: (e) {
            caught = e.error as AppException;
          },
        );

        interceptor.onError(err, handler);

        expect(caught, isNotNull);
        expect(caught!.code, 'TIMEOUT');
      });

      test('sendTimeout 转换为 AppException.timeout', () async {
        final err = DioException(
          requestOptions: requestOptions,
          type: DioExceptionType.sendTimeout,
        );

        AppException? caught;
        final handler = _MockErrorHandler(
          onReject: (e) {
            caught = e.error as AppException;
          },
        );

        interceptor.onError(err, handler);

        expect(caught, isNotNull);
        expect(caught!.code, 'TIMEOUT');
      });
    });

    group('网络连接错误', () {
      test('connectionError 转换为 AppException.networkError', () {
        final err = DioException(
          requestOptions: requestOptions,
          type: DioExceptionType.connectionError,
        );

        AppException? caught;
        final handler = _MockErrorHandler(
          onReject: (e) {
            caught = e.error as AppException;
          },
        );

        interceptor.onError(err, handler);

        expect(caught, isNotNull);
        expect(caught!.code, 'NETWORK_ERROR');
        expect(caught!.message, '网络不可用');
      });
    });

    group('请求取消', () {
      test('cancel 转换为 AppException.cancelled', () {
        final err = DioException(
          requestOptions: requestOptions,
          type: DioExceptionType.cancel,
        );

        AppException? caught;
        final handler = _MockErrorHandler(
          onReject: (e) {
            caught = e.error as AppException;
          },
        );

        interceptor.onError(err, handler);

        expect(caught, isNotNull);
        expect(caught!.code, 'CANCELLED');
        expect(caught!.message, '请求已取消');
      });
    });

    group('未知错误', () {
      test('unknown 类型转换为 AppException.unknown', () {
        final err = DioException(
          requestOptions: requestOptions,
          type: DioExceptionType.unknown,
        );

        AppException? caught;
        final handler = _MockErrorHandler(
          onReject: (e) {
            caught = e.error as AppException;
          },
        );

        interceptor.onError(err, handler);

        expect(caught, isNotNull);
        expect(caught!.code, 'UNKNOWN');
        expect(caught!.message, '发生未知错误，请重试');
      });

      test('badCertificate 转换为 AppException.unknown', () {
        final err = DioException(
          requestOptions: requestOptions,
          type: DioExceptionType.badCertificate,
        );

        AppException? caught;
        final handler = _MockErrorHandler(
          onReject: (e) {
            caught = e.error as AppException;
          },
        );

        interceptor.onError(err, handler);

        expect(caught, isNotNull);
        expect(caught!.code, 'UNKNOWN');
      });
    });

    group('后端响应错误解析', () {
      test('解析格式1: { code, message, details }', () {
        final response = Response(
          requestOptions: requestOptions,
          statusCode: 400,
          data: {
            'code': 'INVALID_EMAIL_FORMAT',
            'message': '邮箱格式错误',
            'details': {'email': 'invalid'},
          },
        );

        final err = DioException(
          requestOptions: requestOptions,
          type: DioExceptionType.badResponse,
          response: response,
        );

        AppException? caught;
        final handler = _MockErrorHandler(
          onReject: (e) {
            caught = e.error as AppException;
          },
        );

        interceptor.onError(err, handler);

        expect(caught, isNotNull);
        expect(caught!.code, 'INVALID_EMAIL_FORMAT');
        expect(caught!.message, '邮箱格式错误');
        expect(caught!.statusCode, 400);
        expect(caught!.details, {'email': 'invalid'});
      });

      test('解析格式2: { error: { code, message } }', () {
        final response = Response(
          requestOptions: requestOptions,
          statusCode: 422,
          data: {
            'error': {
              'code': 'VERIFICATION_CODE_EXPIRED',
              'message': '验证码已过期',
            },
          },
        );

        final err = DioException(
          requestOptions: requestOptions,
          type: DioExceptionType.badResponse,
          response: response,
        );

        AppException? caught;
        final handler = _MockErrorHandler(
          onReject: (e) {
            caught = e.error as AppException;
          },
        );

        interceptor.onError(err, handler);

        expect(caught, isNotNull);
        expect(caught!.code, 'VERIFICATION_CODE_EXPIRED');
        expect(caught!.message, '验证码已过期');
        expect(caught!.statusCode, 422);
      });

      test('解析格式3: { error: "错误消息" }', () {
        final response = Response(
          requestOptions: requestOptions,
          statusCode: 500,
          data: {'error': '服务器内部错误'},
        );

        final err = DioException(
          requestOptions: requestOptions,
          type: DioExceptionType.badResponse,
          response: response,
        );

        AppException? caught;
        final handler = _MockErrorHandler(
          onReject: (e) {
            caught = e.error as AppException;
          },
        );

        interceptor.onError(err, handler);

        expect(caught, isNotNull);
        expect(caught!.code, 'SERVER_ERROR');
        expect(caught!.message, '服务器内部错误');
        expect(caught!.statusCode, 500);
      });

      test('无法解析的响应体返回通用服务器错误', () {
        final response = Response(
          requestOptions: requestOptions,
          statusCode: 502,
          data: 'Bad Gateway',
        );

        final err = DioException(
          requestOptions: requestOptions,
          type: DioExceptionType.badResponse,
          response: response,
        );

        AppException? caught;
        final handler = _MockErrorHandler(
          onReject: (e) {
            caught = e.error as AppException;
          },
        );

        interceptor.onError(err, handler);

        expect(caught, isNotNull);
        expect(caught!.code, 'SERVER_ERROR');
        expect(caught!.statusCode, 502);
      });

      test('response 为 null 时返回通用服务器错误', () {
        final err = DioException(
          requestOptions: requestOptions,
          type: DioExceptionType.badResponse,
          response: null,
        );

        AppException? caught;
        final handler = _MockErrorHandler(
          onReject: (e) {
            caught = e.error as AppException;
          },
        );

        interceptor.onError(err, handler);

        expect(caught, isNotNull);
        expect(caught!.code, 'SERVER_ERROR');
      });
    });

    group('handler.reject 行为', () {
      test('使用 handler.reject 传递转换后的错误', () {
        final err = DioException(
          requestOptions: requestOptions,
          type: DioExceptionType.connectionTimeout,
        );

        DioException? rejected;
        final handler = _MockErrorHandler(
          onReject: (e) {
            rejected = e;
          },
        );

        interceptor.onError(err, handler);

        expect(rejected, isNotNull);
        expect(rejected!.error, isA<AppException>());
        expect(rejected!.requestOptions, same(requestOptions));
      });
    });
  });
}

/// 简单的 ErrorInterceptorHandler mock
class _MockErrorHandler extends ErrorInterceptorHandler {
  final void Function(DioException) onReject;

  _MockErrorHandler({required this.onReject});

  @override
  void reject(DioException err) {
    onReject(err);
  }
}
