import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 本地缓存封装
///
/// 使用 shared_preferences 存储非敏感数据：
/// - 用户资料缓存
/// - 偏好设置
/// - 应用配置
class LocalCache {
  final SharedPreferences _prefs;

  LocalCache({required SharedPreferences prefs}) : _prefs = prefs;

  /// 存储字符串
  Future<void> setString(String key, String value) async {
    await _prefs.setString(key, value);
  }

  /// 获取字符串
  String? getString(String key) {
    return _prefs.getString(key);
  }

  /// 存储布尔值
  Future<void> setBool(String key, bool value) async {
    await _prefs.setBool(key, value);
  }

  /// 获取布尔值
  bool? getBool(String key) {
    return _prefs.getBool(key);
  }

  /// 存储整数
  Future<void> setInt(String key, int value) async {
    await _prefs.setInt(key, value);
  }

  /// 获取整数
  int? getInt(String key) {
    return _prefs.getInt(key);
  }

  /// 存储 JSON 对象（序列化为字符串）
  Future<void> setJson(String key, Map<String, dynamic> json) async {
    final jsonString = jsonEncode(json);
    await _prefs.setString(key, jsonString);
  }

  /// 获取 JSON 对象（反序列化）
  Map<String, dynamic>? getJson(String key) {
    final jsonString = _prefs.getString(key);
    if (jsonString == null) return null;
    return jsonDecode(jsonString) as Map<String, dynamic>;
  }

  /// 删除指定 key
  Future<void> remove(String key) async {
    await _prefs.remove(key);
  }

  /// 清除所有缓存数据
  Future<void> clearAll() async {
    await _prefs.clear();
  }
}

/// LocalCache 的 Riverpod Provider
///
/// 使用 FutureProvider 因为 SharedPreferences.getInstance() 是异步的
final localCacheProvider = FutureProvider<LocalCache>((ref) async {
  final prefs = await SharedPreferences.getInstance();
  return LocalCache(prefs: prefs);
});
