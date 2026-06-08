import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/api_constants.dart';
import '../../../core/network/api_client.dart';
import '../../../shared/models/profile.dart';

/// 资料更新请求数据类
///
/// 封装 PUT /api/profile 请求体中的可更新字段。
class ProfileUpdateRequest {
  final String name;
  final int birthYear;
  final String gender;
  final String occupation;
  final String city;
  final String? bio;

  const ProfileUpdateRequest({
    required this.name,
    required this.birthYear,
    required this.gender,
    required this.occupation,
    required this.city,
    this.bio,
  });

  /// 转换为 JSON Map，用于 API 请求体
  Map<String, dynamic> toJson() {
    return {
      'name': name,
      'birthYear': birthYear,
      'gender': gender,
      'occupation': occupation,
      'city': city,
      'bio': bio,
    };
  }
}

/// 用户资料仓库
///
/// 封装用户资料相关的 API 调用，包括获取资料、更新资料、上传照片和删除照片。
/// 错误由 [ErrorInterceptor] 统一处理，Repository 层不需要额外的 try-catch。
class ProfileRepository {
  final ApiClient _apiClient;

  ProfileRepository(this._apiClient);

  /// 获取当前用户资料
  ///
  /// 调用 GET /api/profile
  /// 返回 [Profile] 对象。
  ///
  /// 后端响应格式：
  /// ```json
  /// {
  ///   "code": "SUCCESS",
  ///   "data": { "id": "...", "name": "...", ... }
  /// }
  /// ```
  Future<Profile> getProfile() async {
    final response = await _apiClient.get(ApiConstants.profile);
    final json = response.data as Map<String, dynamic>;
    final data = json['data'] as Map<String, dynamic>;
    // Backend returns { profile: {...}, photos: [...] }
    final profileData = data['profile'] as Map<String, dynamic>?;
    final photosData = data['photos'] as List<dynamic>? ?? [];
    if (profileData == null) {
      throw Exception('Profile not found');
    }
    return _parseProfile(profileData, photosData);
  }

  /// 更新用户资料
  ///
  /// 调用 PUT /api/profile
  /// 返回更新后的 [Profile] 对象。
  Future<Profile> updateProfile(ProfileUpdateRequest request) async {
    final response = await _apiClient.put(
      ApiConstants.profile,
      data: request.toJson(),
    );
    final json = response.data as Map<String, dynamic>;
    final data = json['data'] as Map<String, dynamic>;
    // Backend returns { profile: {...} }
    final profileData = data['profile'] as Map<String, dynamic>;
    return _parseProfile(profileData, []);
  }

  /// Parse Prisma profile (snake_case) to Profile model (camelCase)
  Profile _parseProfile(Map<String, dynamic> p, List<dynamic> photosData) {
    final photos = photosData
        .map((e) => Photo(
              id: e['id'] as String,
              url: e['url'] as String,
              order: (e['sortOrder'] ?? e['sort_order'] ?? e['order'] ?? 0) as int,
            ))
        .toList();

    return Profile(
      id: p['id'] as String,
      name: p['name'] as String,
      birthYear: (p['birthYear'] ?? p['birth_year']) as int,
      gender: _parseGender(p['gender'] as String),
      occupation: p['occupation'] as String,
      city: p['city'] as String,
      bio: p['bio'] as String?,
      photos: photos,
      createdAt: DateTime.parse((p['createdAt'] ?? p['created_at']) as String),
    );
  }

  Gender _parseGender(String value) {
    switch (value) {
      case 'male':
        return Gender.male;
      case 'female':
        return Gender.female;
      default:
        return Gender.other;
    }
  }
  /// 上传用户照片
  ///
  /// 调用 POST /api/profile/photos
  /// 返回上传成功的 [Photo] 对象。
  Future<Photo> uploadPhoto(File file) async {
    final response = await _apiClient.uploadFile(
      ApiConstants.profilePhotos,
      file: file,
    );
    final json = response.data as Map<String, dynamic>;
    final data = json['data'] as Map<String, dynamic>;
    final photo = data['photo'] as Map<String, dynamic>;
    return Photo.fromJson(photo);
  }

  /// 删除指定照片
  ///
  /// 调用 DELETE /api/profile/photos/:photoId
  Future<void> deletePhoto(String photoId) async {
    await _apiClient.delete(ApiConstants.profilePhoto(photoId));
  }
}

/// ProfileRepository 的 Riverpod Provider
final profileRepositoryProvider = Provider<ProfileRepository>((ref) {
  final apiClient = ref.watch(apiClientProvider);
  return ProfileRepository(apiClient);
});
