import { getDaysInMonth } from 'date-fns';

/**
 * 前半/後半の期間の開始日と終了日を計算するヘルパー関数
 * @param year 年
 * @param month 月（1-12）
 * @param period 'first' = 前半（1-15日）, 'second' = 後半（16日〜月末）
 * @returns { start: Date, end: Date }
 */
export const getPeriodDates = (year: number, month: number, period: 'first' | 'second') => {
  const daysInMonth = getDaysInMonth(new Date(year, month - 1));
  const startDay = period === 'first' ? 1 : 16;
  const endDay = period === 'first' ? 15 : daysInMonth;
  
  const start = new Date(year, month - 1, startDay);
  const end = new Date(year, month - 1, endDay);
  
  return { start, end };
};

/**
 * 指定された日付が前半か後半かを判定
 * @param date Date対象の日付
 * @returns 'first' | 'second'
 */
export const getPeriodFromDate = (date: Date): 'first' | 'second' => {
  return date.getDate() <= 15 ? 'first' : 'second';
};

/**
 * 期間の日本語名を取得
 * @param period 'first' | 'second'
 * @returns '前半' | '後半'
 */
export const getPeriodLabel = (period: 'first' | 'second'): string => {
  return period === 'first' ? '前半' : '後半';
};
