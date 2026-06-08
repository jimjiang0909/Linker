import 'package:glados/glados.dart';
import 'package:linker_app/core/utils/validators.dart';

/// **Validates: Requirements 3.2, 3.7**
///
/// 属性2：表单客户端校验与后端校验一致性
/// 对于任意 1-20 字符的字符串，validateName 应返回 null；
/// 对于任意 >20 字符的字符串，validateName 应返回错误。
void main() {
  group('属性2：表单客户端校验与后端校验一致性', () {
    // 生成 1-20 字符的字母数字字符串
    final validNameGen = any
        .listWithLengthInRange(1, 21, any.intInRange(0, 62))
        .map((indices) {
      const chars =
          'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      return indices.map((i) => chars[i % chars.length]).join();
    });

    // 生成 21-50 字符的字母数字字符串
    final invalidNameGen = any
        .listWithLengthInRange(21, 51, any.intInRange(0, 62))
        .map((indices) {
      const chars =
          'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      return indices.map((i) => chars[i % chars.length]).join();
    });

    Glados(validNameGen).test(
      '对于任意 1-20 字符的字符串，validateName 应返回 null',
      (name) {
        final result = Validators.validateName(name);
        expect(result, isNull,
            reason: '长度为 ${name.length} 的姓名 "$name" 应通过校验');
      },
    );

    Glados(invalidNameGen).test(
      '对于任意 >20 字符的字符串，validateName 应返回错误',
      (name) {
        final result = Validators.validateName(name);
        expect(result, isNotNull,
            reason: '长度为 ${name.length} 的姓名 "$name" 应校验失败');
        expect(result, equals('姓名长度为1-20字符'));
      },
    );
  });
}
