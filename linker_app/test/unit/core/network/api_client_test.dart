import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:linker_app/core/network/api_client.dart';

void main() {
  late Dio mockDio;
  late ApiClient apiClient;

  setUp(() {
    mockDio = Dio(BaseOptions(baseUrl: 'http://localhost:3000/api'));
    apiClient = ApiClient(mockDio);
  });

  group('ApiClient 构造', () {
    test('通过注入 Dio 实例创建', () {
      expect(apiClient.dio, equals(mockDio));
    });

    test('工厂方法创建带默认配置的实例', () {
      final client = ApiClient.configured();
      expect(client.dio.options.baseUrl, equals('http://localhost:3000/api'));
      expect(
        client.dio.options.connectTimeout,
        equals(const Duration(milliseconds: 15000)),
      );
      expect(
        client.dio.options.receiveTimeout,
        equals(const Duration(milliseconds: 15000)),
      );
      expect(
        client.dio.options.sendTimeout,
        equals(const Duration(milliseconds: 15000)),
      );
      expect(client.dio.options.contentType, equals('application/json'));
    });
  });

  group('ApiClient 拦截器', () {
    test('addInterceptor 添加拦截器到 Dio', () {
      final interceptor = InterceptorsWrapper(
        onRequest: (options, handler) => handler.next(options),
      );
      apiClient.addInterceptor(interceptor);
      expect(apiClient.dio.interceptors, contains(interceptor));
    });
  });

  group('ApiClient HTTP 方法', () {
    late DioAdapter dioAdapter;

    setUp(() {
      dioAdapter = DioAdapter();
      mockDio.httpClientAdapter = dioAdapter;
    });

    test('get 方法发送 GET 请求', () async {
      dioAdapter.responseBody = '{"data": "test"}';
      dioAdapter.responseStatusCode = 200;

      final response = await apiClient.get<dynamic>('/test');
      expect(response.statusCode, equals(200));
      expect(dioAdapter.lastMethod, equals('GET'));
    });

    test('get 方法支持 queryParams', () async {
      dioAdapter.responseBody = '{"data": "test"}';
      dioAdapter.responseStatusCode = 200;

      final response = await apiClient.get<dynamic>(
        '/test',
        queryParams: {'page': 1, 'limit': 10},
      );
      expect(response.statusCode, equals(200));
      expect(
        dioAdapter.lastUri?.queryParameters['page'],
        equals('1'),
      );
      expect(
        dioAdapter.lastUri?.queryParameters['limit'],
        equals('10'),
      );
    });

    test('post 方法发送 POST 请求', () async {
      dioAdapter.responseBody = '{"id": "123"}';
      dioAdapter.responseStatusCode = 201;

      final response = await apiClient.post<dynamic>(
        '/test',
        data: {'name': 'test'},
      );
      expect(response.statusCode, equals(201));
      expect(dioAdapter.lastMethod, equals('POST'));
    });

    test('put 方法发送 PUT 请求', () async {
      dioAdapter.responseBody = '{"updated": true}';
      dioAdapter.responseStatusCode = 200;

      final response = await apiClient.put<dynamic>(
        '/test',
        data: {'name': 'updated'},
      );
      expect(response.statusCode, equals(200));
      expect(dioAdapter.lastMethod, equals('PUT'));
    });

    test('delete 方法发送 DELETE 请求', () async {
      dioAdapter.responseBody = '';
      dioAdapter.responseStatusCode = 204;

      final response = await apiClient.delete<dynamic>('/test/123');
      expect(response.statusCode, equals(204));
      expect(dioAdapter.lastMethod, equals('DELETE'));
    });

    test('uploadFile 方法使用 MultipartFile 上传文件', () async {
      // 创建临时文件用于测试
      final tempDir = Directory.systemTemp;
      final tempFile = File('${tempDir.path}/test_upload.jpg');
      tempFile.writeAsBytesSync([0, 1, 2, 3]);

      dioAdapter.responseBody = '{"url": "https://example.com/photo.jpg"}';
      dioAdapter.responseStatusCode = 200;

      try {
        final response = await apiClient.uploadFile<dynamic>(
          '/profile/photos',
          file: tempFile,
        );
        expect(response.statusCode, equals(200));
        expect(dioAdapter.lastMethod, equals('POST'));
        expect(dioAdapter.lastData, isA<FormData>());
      } finally {
        tempFile.deleteSync();
      }
    });

    test('uploadFile 支持自定义 fieldName', () async {
      final tempDir = Directory.systemTemp;
      final tempFile = File('${tempDir.path}/test_avatar.png');
      tempFile.writeAsBytesSync([0, 1, 2, 3]);

      dioAdapter.responseBody = '{"url": "https://example.com/avatar.png"}';
      dioAdapter.responseStatusCode = 200;

      try {
        final response = await apiClient.uploadFile<dynamic>(
          '/profile/avatar',
          file: tempFile,
          fieldName: 'avatar',
        );
        expect(response.statusCode, equals(200));
        final formData = dioAdapter.lastData as FormData;
        expect(formData.files.first.key, equals('avatar'));
      } finally {
        tempFile.deleteSync();
      }
    });
  });
}

/// 简单的 Dio HttpClientAdapter 用于测试
class DioAdapter implements HttpClientAdapter {
  String responseBody = '';
  int responseStatusCode = 200;
  String? lastMethod;
  Uri? lastUri;
  dynamic lastData;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<List<int>>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    lastMethod = options.method;
    lastUri = options.uri;
    lastData = options.data;

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
