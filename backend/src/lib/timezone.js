/**
 * 统一时区工具函数
 * 所有 CST (Asia/Shanghai, UTC+8) 时间处理集中在此
 *
 * 设计说明：
 * getTodayCST() 返回的 Date 对象时间部分为 UTC 00:00:00，日期部分为 CST 当天日期。
 * 例如：CST 2026-05-26 23:30 → 返回 2026-05-26T00:00:00.000Z
 * 这是为了配合 Prisma @db.Date 类型（只存储日期，忽略时间部分）。
 * 注意：不要将此返回值与其他 UTC 时间戳做大小比较，它仅用于日期匹配。
 */

const CST_TIMEZONE = 'Asia/Shanghai';

/**
 * 获取当前 CST 日期（返回 UTC 日期对象，时间部分为 00:00:00）
 * 用于数据库 @db.Date 类型字段的日期匹配查询
 *
 * 重要：返回值仅用于 Prisma Date 字段的等值/范围查询，
 * 不可与 createdAt 等完整时间戳做时间先后比较。
 *
 * @returns {Date} CST 当天日期对应的 YYYY-MM-DDT00:00:00.000Z
 */
export function getTodayCST() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: CST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const dateStr = formatter.format(now); // Format: YYYY-MM-DD
  return new Date(dateStr + 'T00:00:00.000Z');
}

/**
 * 获取下一个 CST 00:00 的 UTC 时间点
 * CST = UTC+8，所以 CST 00:00 = UTC 前一天 16:00
 * @returns {Date} 下一个 CST 00:00 对应的 UTC 时间
 */
export function getNextResetTimeCST() {
  const today = getTodayCST();
  // today is YYYY-MM-DDT00:00:00.000Z where YYYY-MM-DD is CST date
  // Next CST 00:00 = next CST date at UTC 16:00 the day before
  // Which is: today (CST date) + 1 day - 8 hours offset
  const nextDay = new Date(today);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  // Subtract 8 hours to convert from "CST date midnight as UTC midnight" to actual UTC time of CST midnight
  nextDay.setUTCHours(nextDay.getUTCHours() - 8);
  return nextDay;
}

/**
 * 获取指定日期的 CST 日期对象
 * @param {Date} date - 任意日期
 * @returns {Date} 该日期在 CST 时区的 00:00:00 UTC 表示
 */
export function toDateCST(date) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: CST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const dateStr = formatter.format(date);
  return new Date(dateStr + 'T00:00:00.000Z');
}

export { CST_TIMEZONE };
