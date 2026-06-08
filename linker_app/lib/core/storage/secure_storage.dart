import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Token 安全存储封装
///
/// 使用 flutter_secure_storage 将 Auth Token 存储在设备加密存储中：
/// - iOS: Keychain
/// - Android: EncryptedSharedPreferences
class SecureStorage {
  static const String _tokenKey = 'auth_token';
  static const String _refreshTokenKey = 'refresh_token';
  static const String _userIdKey = 'user_id';

  final FlutterSecureStorage _storage;

  SecureStorage({FlutterSecureStorage? storage})
      : _storage = storage ??
            const FlutterSecureStorage(
              aOptions: AndroidOptions(),
              iOptions: IOSOptions(
                accessibility: KeychainAccessibility.first_unlock_this_device,
              ),
            );

  /// 保存 Auth Token
  Future<void> saveToken(String token) async {
    await _storage.write(key: _tokenKey, value: token);
  }

  /// 获取 Auth Token
  Future<String?> getToken() async {
    return await _storage.read(key: _tokenKey);
  }

  /// 删除 Auth Token
  Future<void> deleteToken() async {
    await _storage.delete(key: _tokenKey);
  }

  /// 保存 Refresh Token
  Future<void> saveRefreshToken(String token) async {
    await _storage.write(key: _refreshTokenKey, value: token);
  }

  /// 获取 Refresh Token
  Future<String?> getRefreshToken() async {
    return await _storage.read(key: _refreshTokenKey);
  }

  /// 删除 Refresh Token
  Future<void> deleteRefreshToken() async {
    await _storage.delete(key: _refreshTokenKey);
  }

  /// 检查是否存在 Token
  Future<bool> hasToken() async {
    final token = await _storage.read(key: _tokenKey);
    return token != null && token.isNotEmpty;
  }

  /// 保存 User ID
  Future<void> saveUserId(String userId) async {
    await _storage.write(key: _userIdKey, value: userId);
  }

  /// 获取 User ID
  Future<String?> getUserId() async {
    return await _storage.read(key: _userIdKey);
  }

  /// 清除所有安全存储数据
  Future<void> clearAll() async {
    await _storage.deleteAll();
  }
}

/// SecureStorage 的 Riverpod Provider
final secureStorageProvider = Provider<SecureStorage>((ref) {
  return SecureStorage();
});
