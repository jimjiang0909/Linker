import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:linker_app/core/constants/api_constants.dart';
import 'package:linker_app/core/network/api_client.dart';
import 'package:linker_app/features/auth/data/auth_repository.dart';

import '../../core/network/api_client_test_helper.dart';

void main() {
  late Dio dio;
  late DioAdapter dioAdapter;
  late ApiClient apiClient;
  late AuthRepository authRepository;

  setUp(() {
    dio = Dio(BaseOptions(baseUrl: 'http://localhost:3000/api'));
    dioAdapter = DioAdapter();
    dio.httpClientAdapter = dioAdapter;
    apiClient = ApiClient(dio);
    authRepository = AuthRepository(apiClient);
  });

  group('AuthRepository.sendCode', () {
    test('成功发送验证码', () async {
      dioAdapter.responseBody = '{"code": "SUCCESS"}';
      dioAdapter.responseStatusCode = 200;

      await authRepository.sendCode('test@example.com');

      expect(dioAdapter.lastMethod, equals('POST'));
      expect(dioAdapter.lastUri?.path, contains(ApiConstants.sendCode));
    });

    test('网络错误时抛出 DioException', () async {
      dioAdapter.shouldThrowError = true;
      dioAdapter.errorType = DioExceptionType.connectionError;

      expect(
        () => authRepository.sendCode('test@example.com'),
        throwsA(isA<DioException>()),
      );
    });

    test('服务器返回错误时抛出 DioException', () async {
      dioAdapter.shouldThrowError = true;
      dioAdapter.errorType = DioExceptionType.badResponse;
      dioAdapter.errorStatusCode = 429;
      dioAdapter.errorResponseBody = {
        'code': 'RATE_LIMIT_EXCEEDED',
        'message': '请求过于频繁',
      };

      expect(
        () => authRepository.sendCode('test@example.com'),
        throwsA(isA<DioException>()),
      );
    });
  });

  group('AuthRepository.register', () {
    test('注册成功返回 AuthResponse', () async {
      dioAdapter.responseBody = '''
      {
        "code": "SUCCESS",
        "data": {
          "token": "jwt-token-123",
          "user": {
            "id": "user-1",
            "email": "test@example.com",
            "status": "registered"
          }
        }
      }
      ''';
      dioAdapter.responseStatusCode = 200;

      final result = await authRepository.register(
        email: 'test@example.com',
        code: '123456',
        invitationCode: 'ABCD1234',
      );

      expect(result.token, equals('jwt-token-123'));
      expect(result.userStatus, equals('registered'));
      expect(dioAdapter.lastMethod, equals('POST'));
      expect(dioAdapter.lastUri?.path, contains(ApiConstants.register));
    });

    test('邀请码无效时抛出 DioException', () async {
      dioAdapter.shouldThrowError = true;
      dioAdapter.errorType = DioExceptionType.badResponse;
      dioAdapter.errorStatusCode = 400;
      dioAdapter.errorResponseBody = {
        'code': 'INVALID_INVITATION_CODE',
        'message': '邀请码无效或已过期',
      };

      expect(
        () => authRepository.register(
          email: 'test@example.com',
          code: '123456',
          invitationCode: 'INVALID1',
        ),
        throwsA(isA<DioException>()),
      );
    });

    test('验证码错误时抛出 DioException', () async {
      dioAdapter.shouldThrowError = true;
      dioAdapter.errorType = DioExceptionType.badResponse;
      dioAdapter.errorStatusCode = 400;
      dioAdapter.errorResponseBody = {
        'code': 'INVALID_VERIFICATION_CODE',
        'message': '验证码错误或已过期',
      };

      expect(
        () => authRepository.register(
          email: 'test@example.com',
          code: '000000',
          invitationCode: 'ABCD1234',
        ),
        throwsA(isA<DioException>()),
      );
    });

    test('网络错误时抛出 DioException', () async {
      dioAdapter.shouldThrowError = true;
      dioAdapter.errorType = DioExceptionType.connectionTimeout;

      expect(
        () => authRepository.register(
          email: 'test@example.com',
          code: '123456',
          invitationCode: 'ABCD1234',
        ),
        throwsA(isA<DioException>()),
      );
    });
  });

  group('AuthResponse.fromJson', () {
    test('正确解析后端响应', () {
      final json = {
        'code': 'SUCCESS',
        'data': {
          'token': 'my-jwt-token',
          'user': {
            'id': 'user-123',
            'email': 'user@test.com',
            'status': 'active',
          },
        },
      };

      final response = AuthResponse.fromJson(json);
      expect(response.token, equals('my-jwt-token'));
      expect(response.userStatus, equals('active'));
    });
  });
}
