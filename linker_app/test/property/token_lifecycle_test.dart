import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:glados/glados.dart';
import 'package:linker_app/core/storage/secure_storage.dart';

/// **Validates: Requirements 1.2, 1.3, 1.5**
///
/// 属性1：Token 生命周期管理正确性
/// 对于任意 Token 字符串，保存后读取应返回相同值；删除后读取应返回 null。
void main() {
  group('属性1：Token 生命周期管理正确性', () {
    late SecureStorage secureStorage;

    setUp(() {
      FlutterSecureStorage.setMockInitialValues({});
      secureStorage = SecureStorage(
        storage: const FlutterSecureStorage(),
      );
    });

    Glados(any.nonEmptyLetterOrDigits).test(
      '对于任意 Token 字符串，保存后读取应返回相同值',
      (token) async {
        await secureStorage.saveToken(token);
        final retrieved = await secureStorage.getToken();
        expect(retrieved, equals(token));
      },
    );

    Glados(any.nonEmptyLetterOrDigits).test(
      '对于任意 Token 字符串，保存后删除再读取应返回 null',
      (token) async {
        await secureStorage.saveToken(token);
        await secureStorage.deleteToken();
        final retrieved = await secureStorage.getToken();
        expect(retrieved, isNull);
      },
    );
  });
}
