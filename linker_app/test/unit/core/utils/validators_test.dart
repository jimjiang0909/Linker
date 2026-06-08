import 'package:flutter_test/flutter_test.dart';
import 'package:linker_app/core/utils/validators.dart';

void main() {
  group('Validators.validateInvitationCode', () {
    test('returns error when value is null', () {
      expect(Validators.validateInvitationCode(null), '请输入邀请码');
    });

    test('returns error when value is empty', () {
      expect(Validators.validateInvitationCode(''), '请输入邀请码');
    });

    test('returns error when length is not 8', () {
      expect(Validators.validateInvitationCode('ABC123'), '邀请码必须为8位');
      expect(Validators.validateInvitationCode('ABCDEFGHI'), '邀请码必须为8位');
    });

    test('returns error when contains non-alphanumeric chars', () {
      expect(
          Validators.validateInvitationCode('ABCD123!'), '邀请码只能包含字母和数字');
      expect(
          Validators.validateInvitationCode('ABCD 234'), '邀请码只能包含字母和数字');
    });

    test('returns null for valid 8-char alphanumeric code', () {
      expect(Validators.validateInvitationCode('ABCD1234'), isNull);
      expect(Validators.validateInvitationCode('abcd1234'), isNull);
      expect(Validators.validateInvitationCode('12345678'), isNull);
      expect(Validators.validateInvitationCode('AbCdEfGh'), isNull);
    });
  });

  group('Validators.validateEmail', () {
    test('returns error when value is null', () {
      expect(Validators.validateEmail(null), '请输入邮箱');
    });

    test('returns error when value is empty', () {
      expect(Validators.validateEmail(''), '请输入邮箱');
    });

    test('returns error for invalid email format', () {
      expect(Validators.validateEmail('invalid'), '邮箱格式错误');
      expect(Validators.validateEmail('no@domain'), '邮箱格式错误');
      expect(Validators.validateEmail('@example.com'), '邮箱格式错误');
      expect(Validators.validateEmail('user@.com'), '邮箱格式错误');
    });

    test('returns null for valid email', () {
      expect(Validators.validateEmail('user@example.com'), isNull);
      expect(Validators.validateEmail('test.user@domain.co'), isNull);
      expect(Validators.validateEmail('a+b@c.org'), isNull);
    });
  });

  group('Validators.validateVerificationCode', () {
    test('returns error when value is null', () {
      expect(Validators.validateVerificationCode(null), '请输入验证码');
    });

    test('returns error when value is empty', () {
      expect(Validators.validateVerificationCode(''), '请输入验证码');
    });

    test('returns null for any non-empty value', () {
      expect(Validators.validateVerificationCode('123456'), isNull);
      expect(Validators.validateVerificationCode('1'), isNull);
    });
  });

  group('Validators.validateName', () {
    test('returns error when value is null', () {
      expect(Validators.validateName(null), '请输入姓名');
    });

    test('returns error when value is empty', () {
      expect(Validators.validateName(''), '请输入姓名');
    });

    test('returns null for valid name within 1-20 chars', () {
      expect(Validators.validateName('张三'), isNull);
      expect(Validators.validateName('A'), isNull);
      expect(Validators.validateName('a' * 20), isNull);
    });

    test('returns error when name exceeds 20 chars', () {
      expect(Validators.validateName('a' * 21), '姓名长度为1-20字符');
    });
  });

  group('Validators.validateBirthYear', () {
    test('returns error when value is null', () {
      expect(Validators.validateBirthYear(null), '请选择出生年份');
    });

    test('returns null for valid birth year (age 18-60)', () {
      final currentYear = DateTime.now().year;
      expect(Validators.validateBirthYear(currentYear - 18), isNull);
      expect(Validators.validateBirthYear(currentYear - 30), isNull);
      expect(Validators.validateBirthYear(currentYear - 60), isNull);
    });

    test('returns error when age is less than 18', () {
      final currentYear = DateTime.now().year;
      expect(
        Validators.validateBirthYear(currentYear - 17),
        '年龄需在18-60岁之间',
      );
    });

    test('returns error when age is greater than 60', () {
      final currentYear = DateTime.now().year;
      expect(
        Validators.validateBirthYear(currentYear - 61),
        '年龄需在18-60岁之间',
      );
    });
  });

  group('Validators.validateOccupation', () {
    test('returns error when value is null', () {
      expect(Validators.validateOccupation(null), '请输入职业');
    });

    test('returns error when value is empty', () {
      expect(Validators.validateOccupation(''), '请输入职业');
    });

    test('returns null for valid occupation within 1-30 chars', () {
      expect(Validators.validateOccupation('工程师'), isNull);
      expect(Validators.validateOccupation('A'), isNull);
      expect(Validators.validateOccupation('a' * 30), isNull);
    });

    test('returns error when occupation exceeds 30 chars', () {
      expect(Validators.validateOccupation('a' * 31), '职业长度为1-30字符');
    });
  });

  group('Validators.validateCity', () {
    test('returns error when value is null', () {
      expect(Validators.validateCity(null), '请输入城市');
    });

    test('returns error when value is empty', () {
      expect(Validators.validateCity(''), '请输入城市');
    });

    test('returns null for valid city within 1-30 chars', () {
      expect(Validators.validateCity('北京'), isNull);
      expect(Validators.validateCity('A'), isNull);
      expect(Validators.validateCity('a' * 30), isNull);
    });

    test('returns error when city exceeds 30 chars', () {
      expect(Validators.validateCity('a' * 31), '城市长度为1-30字符');
    });
  });

  group('Validators.validateBio', () {
    test('returns null when value is null (optional field)', () {
      expect(Validators.validateBio(null), isNull);
    });

    test('returns null when value is empty (optional field)', () {
      expect(Validators.validateBio(''), isNull);
    });

    test('returns null for valid bio within 500 chars', () {
      expect(Validators.validateBio('这是一段自我介绍'), isNull);
      expect(Validators.validateBio('a' * 500), isNull);
    });

    test('returns error when bio exceeds 500 chars', () {
      expect(Validators.validateBio('a' * 501), '自我介绍不超过500字符');
    });
  });
}
