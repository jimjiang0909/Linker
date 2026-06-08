/**
 * 测试数据生成器 - 使用 fast-check arbitraries 生成常用测试数据
 */
import fc from 'fast-check';

// ============================================================
// 基础类型生成器
// ============================================================

/**
 * 有效邮箱地址生成器
 */
export const validEmailArb = fc
  .tuple(
    fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')), { minLength: 1, maxLength: 20 }),
    fc.constantFrom('gmail.com', 'outlook.com', 'yahoo.com', 'qq.com', '163.com', 'example.com')
  )
  .map(([local, domain]) => `${local}@${domain}`);

/**
 * 无效邮箱地址生成器（缺少@或域名无效）
 */
export const invalidEmailArb = fc.oneof(
  // 没有 @ 符号
  fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')), { minLength: 1, maxLength: 20 }),
  // @ 后面没有域名
  fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')), { minLength: 1, maxLength: 10 }).map(s => `${s}@`),
  // @ 后面没有点号
  fc.tuple(
    fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')), { minLength: 1, maxLength: 10 }),
    fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')), { minLength: 1, maxLength: 10 })
  ).map(([local, domain]) => `${local}@${domain}`),
  // 空字符串
  fc.constant(''),
  // 只有空格
  fc.stringOf(fc.constant(' '), { minLength: 1, maxLength: 5 })
);

/**
 * UUID 生成器
 */
export const uuidArb = fc.uuid();

/**
 * 6位数字验证码生成器
 */
export const verificationCodeArb = fc
  .integer({ min: 100000, max: 999999 })
  .map(String);

/**
 * 8位字母数字邀请码生成器
 */
export const invitationCodeArb = fc
  .stringOf(
    fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.split('')),
    { minLength: 8, maxLength: 8 }
  );

/**
 * 无效邀请码生成器（长度不为8或包含特殊字符）
 */
export const invalidInvitationCodeArb = fc.oneof(
  // 长度不为8
  fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')), { minLength: 1, maxLength: 7 }),
  fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')), { minLength: 9, maxLength: 15 }),
  // 包含特殊字符
  fc.stringOf(fc.constantFrom(...'!@#$%^&*()_+-=[]{}|;:,.<>?'.split('')), { minLength: 8, maxLength: 8 }),
  // 空字符串
  fc.constant('')
);

// ============================================================
// 用户 Profile 相关生成器
// ============================================================

/**
 * 性别选项
 */
export const genderArb = fc.constantFrom('男', '女', '其他');

/**
 * 有效姓名生成器（1-20字符）
 */
export const validNameArb = fc.stringOf(
  fc.constantFrom(...'张李王赵刘陈杨黄周吴明华强伟芳秀英'.split('')),
  { minLength: 1, maxLength: 20 }
);

/**
 * 无效姓名生成器（空或超过20字符）
 */
export const invalidNameArb = fc.oneof(
  fc.constant(''),
  fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')), { minLength: 21, maxLength: 30 })
);

/**
 * 有效出生年份生成器（使年龄在18-60岁之间）
 */
export const validBirthYearArb = fc.integer({
  min: new Date().getFullYear() - 60,
  max: new Date().getFullYear() - 18,
});

/**
 * 无效出生年份生成器（年龄不在18-60岁之间）
 */
export const invalidBirthYearArb = fc.oneof(
  fc.integer({ min: new Date().getFullYear() - 17, max: new Date().getFullYear() }),
  fc.integer({ min: 1900, max: new Date().getFullYear() - 61 })
);

/**
 * 有效职业生成器（1-30字符）
 */
export const validOccupationArb = fc.constantFrom(
  '软件工程师', '产品经理', '设计师', '教师', '医生',
  '律师', '会计师', '市场营销', '数据分析师', '创业者'
);

/**
 * 有效城市生成器（1-30字符）
 */
export const validCityArb = fc.constantFrom(
  '北京', '上海', '广州', '深圳', '杭州',
  '成都', '武汉', '南京', '西安', '重庆'
);

/**
 * 有效自我介绍生成器（≤500字符）
 */
export const validBioArb = fc.stringOf(
  fc.constantFrom(...'我是一个热爱生活的人喜欢旅行读书运动希望找到志同道合的朋友'.split('')),
  { minLength: 1, maxLength: 100 }
);

/**
 * 超长自我介绍生成器（>500字符）
 */
export const invalidBioArb = fc.stringOf(
  fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')),
  { minLength: 501, maxLength: 600 }
);

/**
 * 完整有效 Profile 数据生成器
 */
export const validProfileArb = fc.record({
  name: validNameArb,
  birthYear: validBirthYearArb,
  gender: genderArb,
  occupation: validOccupationArb,
  city: validCityArb,
  bio: validBioArb,
});

// ============================================================
// 偏好设置相关生成器
// ============================================================

/**
 * 交友意图选项
 */
export const datingIntentArb = fc.constantFrom('认真约会', '轻社交', '交朋友');

/**
 * 有效年龄范围生成器（18-60，下限≤上限，跨度≥1）
 */
export const validAgeRangeArb = fc
  .tuple(fc.integer({ min: 18, max: 59 }), fc.integer({ min: 1, max: 42 }))
  .map(([min, span]) => ({
    ageMin: min,
    ageMax: Math.min(min + span, 60),
  }));

/**
 * 无效年龄范围生成器（下限>上限）
 */
export const invalidAgeRangeArb = fc
  .tuple(fc.integer({ min: 19, max: 60 }), fc.integer({ min: 18, max: 59 }))
  .filter(([min, max]) => min > max)
  .map(([ageMin, ageMax]) => ({ ageMin, ageMax }));

/**
 * 职业类型列表生成器（≤5项）
 */
export const occupationTypesArb = fc.array(
  fc.constantFrom('技术', '金融', '教育', '医疗', '法律', '设计', '市场', '管理'),
  { minLength: 0, maxLength: 5 }
);

/**
 * 性格特征列表生成器（≤5项）
 */
export const personalityTraitsArb = fc.array(
  fc.constantFrom('外向', '内向', '理性', '感性', '幽默', '稳重', '冒险', '温柔'),
  { minLength: 0, maxLength: 5 }
);

/**
 * 完整有效 Preference 数据生成器
 */
export const validPreferenceArb = fc.tuple(validAgeRangeArb, datingIntentArb, occupationTypesArb, personalityTraitsArb)
  .map(([ageRange, datingIntent, occupationTypes, personalityTraits]) => ({
    ...ageRange,
    datingIntent,
    occupationTypes,
    personalityTraits,
  }));

// ============================================================
// 匹配和消息相关生成器
// ============================================================

/**
 * Match 状态生成器
 */
export const matchStatusArb = fc.constantFrom('pending', 'matched', 'skipped', 'expired', 'closed');

/**
 * 用户选择生成器
 */
export const userChoiceArb = fc.constantFrom(null, 'interested', 'skipped');

/**
 * 匹配分数生成器（0-100）
 */
export const matchScoreArb = fc.integer({ min: 0, max: 100 });

/**
 * 有效匹配分数生成器（≥60）
 */
export const validMatchScoreArb = fc.integer({ min: 60, max: 100 });

/**
 * 有效消息内容生成器（非空，≤1000字符）
 */
export const validMessageContentArb = fc.stringOf(
  fc.constantFrom(...'你好很高兴认识请问有什么爱好吗我喜欢旅行读书运动'.split('')),
  { minLength: 1, maxLength: 100 }
);

/**
 * 无效消息内容生成器（空或超长）
 */
export const invalidMessageContentArb = fc.oneof(
  fc.constant(''),
  fc.stringOf(fc.constant(' '), { minLength: 1, maxLength: 10 }),
  fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')), { minLength: 1001, maxLength: 1100 })
);

/**
 * Conversation 状态生成器
 */
export const conversationStatusArb = fc.constantFrom('active', 'ended');

// ============================================================
// 复合数据生成器
// ============================================================

/**
 * 完整用户数据生成器（含 Profile 和 Preference）
 */
export const fullUserArb = fc.record({
  id: uuidArb,
  email: validEmailArb,
  status: fc.constantFrom('registered', 'profile_completed', 'preference_set'),
  profile: validProfileArb,
  preference: validPreferenceArb,
});
