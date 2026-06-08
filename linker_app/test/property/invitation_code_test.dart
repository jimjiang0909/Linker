import 'package:glados/glados.dart';
import 'package:linker_app/core/utils/validators.dart';

/// **Validates: Requirements 2.2**
///
/// 属性6：邀请码格式校验幂等性
/// 对于任意输入，连续调用两次 validateInvitationCode 结果相同。
void main() {
  group('属性6：邀请码格式校验幂等性', () {
    Glados(any.letterOrDigits).test(
      '对于任意输入，连续调用两次 validateInvitationCode 结果相同',
      (input) {
        final result1 = Validators.validateInvitationCode(input);
        final result2 = Validators.validateInvitationCode(input);

        expect(result1, equals(result2),
            reason: '对同一输入 "$input" 的两次校验结果应相同');
      },
    );

    // 生成8位字母数字字符串
    final validCodeGen = any.listWithLength(8, any.intInRange(0, 62)).map(
      (indices) {
        const chars =
            'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        return indices.map((i) => chars[i % chars.length]).join();
      },
    );

    Glados(validCodeGen).test(
      '对于任意8位字母数字组合，validateInvitationCode 应返回 null',
      (code) {
        final result = Validators.validateInvitationCode(code);
        expect(result, isNull,
            reason: '8位字母数字邀请码 "$code" 应通过校验');
      },
    );
  });
}
