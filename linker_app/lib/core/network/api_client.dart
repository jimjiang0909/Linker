import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../constants/api_constants.dart';
import '../storage/secure_storage.dart';
import 'api_interceptors.dart';

/// Dio HTTP 客户端封装
///
/// 负责所有 REST API 调用，提供统一的请求方法和文件上传能力。
/// 构造函数接收 Dio 实例以便于测试注入。
class ApiClient {
  final Dio _dio;

  /// 通过注入 Dio 实例创建 ApiClient（便于测试）
  ApiClient(this._dio);

  /// 创建带有默认配置的 ApiClient 实例
  factory ApiClient.configured() {
    final dio = Dio(
      BaseOptions(
        baseUrl: ApiConstants.baseUrl,
        connectTimeout: const Duration(milliseconds: ApiConstants.connectTimeout),
        receiveTimeout: const Duration(milliseconds: ApiConstants.receiveTimeout),
        sendTimeout: const Duration(milliseconds: ApiConstants.sendTimeout),
        contentType: Headers.jsonContentType,
      ),
    );
    return ApiClient(dio);
  }

  /// 获取底层 Dio 实例（用于高级配置场景）
  Dio get dio => _dio;

  /// 添加拦截器
  void addInterceptor(Interceptor interceptor) {
    _dio.interceptors.add(interceptor);
  }

  /// GET 请求
  Future<Response<T>> get<T>(
    String path, {
    Map<String, dynamic>? queryParams,
  }) {
    return _dio.get<T>(
      path,
      queryParameters: queryParams,
    );
  }

  /// POST 请求
  Future<Response<T>> post<T>(
    String path, {
    dynamic data,
  }) {
    return _dio.post<T>(
      path,
      data: data,
    );
  }

  /// PUT 请求
  Future<Response<T>> put<T>(
    String path, {
    dynamic data,
  }) {
    return _dio.put<T>(
      path,
      data: data,
    );
  }

  /// DELETE 请求
  Future<Response<T>> delete<T>(String path) {
    return _dio.delete<T>(path);
  }

  /// 文件上传
  ///
  /// 使用 MultipartFile 上传文件，默认字段名为 'photo'。
  Future<Response<T>> uploadFile<T>(
    String path, {
    required File file,
    String fieldName = 'photo',
  }) {
    final formData = FormData.fromMap({
      fieldName: MultipartFile.fromFileSync(
        file.path,
        filename: file.path.split('/').last,
      ),
    });
    return _dio.post<T>(
      path,
      data: formData,
    );
  }
}

/// ApiClient 的 Riverpod Provider
final apiClientProvider = Provider<ApiClient>((ref) {
  final apiClient = ApiClient.configured();
  final secureStorage = ref.watch(secureStorageProvider);

  // 添加 Auth 拦截器（自动附加 Token、401 自动刷新）
  apiClient.addInterceptor(AuthInterceptor(
    storage: secureStorage,
    dio: apiClient.dio,
  ));

  // 添加错误处理拦截器
  apiClient.addInterceptor(ErrorInterceptor());

  return apiClient;
});
