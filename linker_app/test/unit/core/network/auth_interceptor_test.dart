import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:linker_app/core/network/api_interceptors.dart';
import 'package:linker_app/core/storage/secure_storage.dart';

/// 模拟 SecureStorage，用于测试 AuthInterceptor
class _FakeSecureStorage extends SecureStorage {
  String? _token;

  _FakeSecureStorage({String? token}) : _token = token, super(storage: null);

  void setToken(String? token) => _token = token;

  @override
  Future<String?> getToken() async => _token;

  @override
  Future<void> saveToken(String token) async => _token = token;

  @override
  Future<void> deleteToken() async => _token = null;

  @override
  Future<bool> hasToken() async => _token != null && _token!.isNotEmpty;
}

/// 模拟 RequestInterceptorHandler
class _MockRequestHandler extends RequestInterceptorHandler {
  RequestOptions? passedOptions;
  bool nextCalled = false;

  @override
  void next(RequestOptions requestOptions) {
    passedOptions = requestOptions;
    nextCalled = true;
  }
}

/// 模拟 ErrorInterceptorHandler
class _MockErrorHandler extends ErrorInterceptorHandler {
  DioException? passedError;
  bool nextCalled = false;

  @override
  void next(DioException err) {
    passedError = err;
    nextCalled = true;
  }
}

void main() {
  late _FakeSecureStorage fakeStorage;
  late AuthInterceptor interceptor;
  late bool unauthorizedCalled;

  setUp(() {
    fakeStorage = _FakeSecureStorage(token: 'test-jwt-token');
    unauthorizedCalled = false;
    interceptor = AuthInterceptor(
      storage: fakeStorage,
      onUnauthorized: () {
        unauthorizedCalled = true;
      },
    );
  });

  group('AuthInterceptor.onRequest', () {
    test('Token 存在时自动注入 Authorization header', () async {
      final options = RequestOptions(path: '/profile');
      final handler = _MockRequestHandler();

      await interceptor.onRequest(options, handler);

      expect(handler.nextCalled, isTrue);
      expect(
        handler.passedOptions?.headers['Authorization'],
        equals('Bearer test-jwt-token'),
      );
    });

    test('Token 不存在时不注入 header', () async {
      fakeStorage.setToken(null);
      final options = RequestOptions(path: '/profile');
      final handler = _MockRequestHandler();

      await interceptor.onRequest(options, handler);

      expect(handler.nextCalled, isTrue);
      expect(
        handler.passedOptions?.headers['Authorization'],
        isNull,
      );
    });

    test('Token 为空字符串时不注入 header', () async {
      fakeStorage.setToken('');
      final options = RequestOptions(path: '/profile');
      final handler = _MockRequestHandler();

      await interceptor.onRequest(options, handler);

      expect(handler.nextCalled, isTrue);
      expect(
        handler.passedOptions?.headers['Authorization'],
        isNull,
      );
    });
  });

  group('AuthInterceptor.onError', () {
    test('收到 401 时清除 Token 并调用 onUnauthorized 回调', () async {
      final requestOptions = RequestOptions(path: '/profile');
      final response = Response(
        requestOptions: requestOptions,
        statusCode: 401,
        data: {'code': 'UNAUTHORIZED', 'message': '未授权'},
      );
      final err = DioException(
        requestOptions: requestOptions,
        type: DioExceptionType.badResponse,
        response: response,
      );
      final handler = _MockErrorHandler();

      await interceptor.onError(err, handler);

      // 验证 Token 被清除
      expect(await fakeStorage.getToken(), isNull);
      // 验证 onUnauthorized 回调被调用
      expect(unauthorizedCalled, isTrue);
      // 验证错误继续传递
      expect(handler.nextCalled, isTrue);
      expect(handler.passedError, isNotNull);
    });

    test('非 401 错误正常传递，不清除 Token', () async {
      final requestOptions = RequestOptions(path: '/profile');
      final response = Response(
        requestOptions: requestOptions,
        statusCode: 500,
        data: {'code': 'SERVER_ERROR', 'message': '服务器错误'},
      );
      final err = DioException(
        requestOptions: requestOptions,
        type: DioExceptionType.badResponse,
        response: response,
      );
      final handler = _MockErrorHandler();

      await interceptor.onError(err, handler);

      // 验证 Token 未被清除
      expect(await fakeStorage.getToken(), equals('test-jwt-token'));
      // 验证 onUnauthorized 未被调用
      expect(unauthorizedCalled, isFalse);
      // 验证错误继续传递
      expect(handler.nextCalled, isTrue);
    });

    test('403 错误不触发 Token 清除', () async {
      final requestOptions = RequestOptions(path: '/admin');
      final response = Response(
        requestOptions: requestOptions,
        statusCode: 403,
        data: {'code': 'FORBIDDEN', 'message': '无权限'},
      );
      final err = DioException(
        requestOptions: requestOptions,
        type: DioExceptionType.badResponse,
        response: response,
      );
      final handler = _MockErrorHandler();

      await interceptor.onError(err, handler);

      expect(await fakeStorage.getToken(), equals('test-jwt-token'));
      expect(unauthorizedCalled, isFalse);
      expect(handler.nextCalled, isTrue);
    });

    test('网络错误不触发 Token 清除', () async {
      final requestOptions = RequestOptions(path: '/profile');
      final err = DioException(
        requestOptions: requestOptions,
        type: DioExceptionType.connectionError,
      );
      final handler = _MockErrorHandler();

      await interceptor.onError(err, handler);

      expect(await fakeStorage.getToken(), equals('test-jwt-token'));
      expect(unauthorizedCalled, isFalse);
      expect(handler.nextCalled, isTrue);
    });

    test('onUnauthorized 为 null 时 401 仍清除 Token 但不崩溃', () async {
      final interceptorNoCallback = AuthInterceptor(
        storage: fakeStorage,
      );

      final requestOptions = RequestOptions(path: '/profile');
      final response = Response(
        requestOptions: requestOptions,
        statusCode: 401,
      );
      final err = DioException(
        requestOptions: requestOptions,
        type: DioExceptionType.badResponse,
        response: response,
      );
      final handler = _MockErrorHandler();

      await interceptorNoCallback.onError(err, handler);

      // Token 仍然被清除
      expect(await fakeStorage.getToken(), isNull);
      // 不会崩溃
      expect(handler.nextCalled, isTrue);
    });
  });
}
