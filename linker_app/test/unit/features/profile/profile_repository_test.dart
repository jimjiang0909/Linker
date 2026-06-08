import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:linker_app/core/constants/api_constants.dart';
import 'package:linker_app/core/network/api_client.dart';
import 'package:linker_app/features/profile/data/profile_repository.dart';
import 'package:linker_app/shared/models/profile.dart';

import '../../core/network/api_client_test_helper.dart';

void main() {
  late Dio dio;
  late DioAdapter dioAdapter;
  late ApiClient apiClient;
  late ProfileRepository profileRepository;

  setUp(() {
    dio = Dio(BaseOptions(baseUrl: 'http://localhost:3000/api'));
    dioAdapter = DioAdapter();
    dio.httpClientAdapter = dioAdapter;
    apiClient = ApiClient(dio);
    profileRepository = ProfileRepository(apiClient);
  });

  group('ProfileRepository.getProfile', () {
    test('成功获取用户资料', () async {
      dioAdapter.responseBody = '''
      {
        "code": "SUCCESS",
        "data": {
          "id": "user-1",
          "name": "张三",
          "birthYear": 1995,
          "gender": "male",
          "occupation": "工程师",
          "city": "北京",
          "bio": "热爱生活",
          "photos": [
            {"id": "photo-1", "url": "https://example.com/1.jpg", "order": 0}
          ],
          "createdAt": "2024-01-01T00:00:00.000Z"
        }
      }
      ''';
      dioAdapter.responseStatusCode = 200;

      final profile = await profileRepository.getProfile();

      expect(profile.id, equals('user-1'));
      expect(profile.name, equals('张三'));
      expect(profile.birthYear, equals(1995));
      expect(profile.gender, equals(Gender.male));
      expect(profile.occupation, equals('工程师'));
      expect(profile.city, equals('北京'));
      expect(profile.bio, equals('热爱生活'));
      expect(profile.photos, hasLength(1));
      expect(profile.photos.first.id, equals('photo-1'));
      expect(dioAdapter.lastMethod, equals('GET'));
      expect(dioAdapter.lastUri?.path, contains(ApiConstants.profile));
    });

    test('网络错误时抛出 DioException', () async {
      dioAdapter.shouldThrowError = true;
      dioAdapter.errorType = DioExceptionType.connectionError;

      expect(
        () => profileRepository.getProfile(),
        throwsA(isA<DioException>()),
      );
    });
  });

  group('ProfileRepository.updateProfile', () {
    test('成功更新用户资料', () async {
      dioAdapter.responseBody = '''
      {
        "code": "SUCCESS",
        "data": {
          "id": "user-1",
          "name": "李四",
          "birthYear": 1990,
          "gender": "female",
          "occupation": "设计师",
          "city": "上海",
          "bio": "喜欢旅行",
          "photos": [],
          "createdAt": "2024-01-01T00:00:00.000Z"
        }
      }
      ''';
      dioAdapter.responseStatusCode = 200;

      final request = ProfileUpdateRequest(
        name: '李四',
        birthYear: 1990,
        gender: 'female',
        occupation: '设计师',
        city: '上海',
        bio: '喜欢旅行',
      );

      final profile = await profileRepository.updateProfile(request);

      expect(profile.name, equals('李四'));
      expect(profile.birthYear, equals(1990));
      expect(profile.gender, equals(Gender.female));
      expect(profile.occupation, equals('设计师'));
      expect(profile.city, equals('上海'));
      expect(profile.bio, equals('喜欢旅行'));
      expect(dioAdapter.lastMethod, equals('PUT'));
      expect(dioAdapter.lastUri?.path, contains(ApiConstants.profile));
    });

    test('服务器错误时抛出 DioException', () async {
      dioAdapter.shouldThrowError = true;
      dioAdapter.errorType = DioExceptionType.badResponse;
      dioAdapter.errorStatusCode = 500;

      final request = ProfileUpdateRequest(
        name: '李四',
        birthYear: 1990,
        gender: 'female',
        occupation: '设计师',
        city: '上海',
      );

      expect(
        () => profileRepository.updateProfile(request),
        throwsA(isA<DioException>()),
      );
    });
  });

  group('ProfileRepository.uploadPhoto', () {
    test('成功上传照片', () async {
      dioAdapter.responseBody = '''
      {
        "code": "SUCCESS",
        "data": {
          "id": "photo-new",
          "url": "https://example.com/new.jpg",
          "order": 1
        }
      }
      ''';
      dioAdapter.responseStatusCode = 200;

      // 创建临时文件用于测试
      final tempDir = Directory.systemTemp;
      final tempFile = File('${tempDir.path}/test_photo_upload.jpg');
      tempFile.writeAsBytesSync([0, 1, 2, 3]);

      try {
        final photo = await profileRepository.uploadPhoto(tempFile);

        expect(photo.id, equals('photo-new'));
        expect(photo.url, equals('https://example.com/new.jpg'));
        expect(photo.order, equals(1));
        expect(dioAdapter.lastMethod, equals('POST'));
        expect(
            dioAdapter.lastUri?.path, contains(ApiConstants.profilePhotos));
      } finally {
        tempFile.deleteSync();
      }
    });

    test('上传失败时抛出 DioException', () async {
      dioAdapter.shouldThrowError = true;
      dioAdapter.errorType = DioExceptionType.badResponse;
      dioAdapter.errorStatusCode = 413;
      dioAdapter.errorResponseBody = {
        'code': 'FILE_TOO_LARGE',
        'message': '文件大小超过限制',
      };

      final tempDir = Directory.systemTemp;
      final tempFile = File('${tempDir.path}/test_photo_large.jpg');
      tempFile.writeAsBytesSync([0, 1, 2, 3]);

      try {
        expect(
          () => profileRepository.uploadPhoto(tempFile),
          throwsA(isA<DioException>()),
        );
      } finally {
        tempFile.deleteSync();
      }
    });
  });

  group('ProfileRepository.deletePhoto', () {
    test('成功删除照片', () async {
      dioAdapter.responseBody = '{"code": "SUCCESS"}';
      dioAdapter.responseStatusCode = 200;

      await profileRepository.deletePhoto('photo-1');

      expect(dioAdapter.lastMethod, equals('DELETE'));
      expect(dioAdapter.lastUri?.path,
          contains(ApiConstants.profilePhoto('photo-1')));
    });

    test('删除不存在的照片时抛出 DioException', () async {
      dioAdapter.shouldThrowError = true;
      dioAdapter.errorType = DioExceptionType.badResponse;
      dioAdapter.errorStatusCode = 404;
      dioAdapter.errorResponseBody = {
        'code': 'PHOTO_NOT_FOUND',
        'message': '照片不存在',
      };

      expect(
        () => profileRepository.deletePhoto('non-existent'),
        throwsA(isA<DioException>()),
      );
    });
  });

  group('ProfileUpdateRequest', () {
    test('toJson 正确序列化所有字段', () {
      final request = ProfileUpdateRequest(
        name: '张三',
        birthYear: 1995,
        gender: 'male',
        occupation: '工程师',
        city: '北京',
        bio: '热爱生活',
      );

      final json = request.toJson();
      expect(json['name'], equals('张三'));
      expect(json['birthYear'], equals(1995));
      expect(json['gender'], equals('male'));
      expect(json['occupation'], equals('工程师'));
      expect(json['city'], equals('北京'));
      expect(json['bio'], equals('热爱生活'));
    });

    test('toJson bio 为 null 时包含 null 值', () {
      final request = ProfileUpdateRequest(
        name: '张三',
        birthYear: 1995,
        gender: 'male',
        occupation: '工程师',
        city: '北京',
      );

      final json = request.toJson();
      expect(json['bio'], isNull);
    });
  });
}
