/** 날짜 계산 유틸 — 모든 기준일은 사용자 로컬 시간대 기준 */

export function toMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** 'YYYY-MM-DD' 또는 ISO 문자열의 월 키 */
export function monthKeyOf(dateStr: string): string {
  return dateStr.slice(0, 7);
}

export function shiftMonth(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

export function prevMonthKey(date: Date): string {
  return toMonthKey(shiftMonth(date, -1));
}

export function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-');
  return `${y}년 ${Number(m)}월`;
}

export function todayISO(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** D-day (만료일 - 오늘). 음수면 이미 만료 */
export function dDay(expiresAt: string | undefined, today: Date = new Date()): number | null {
  if (!expiresAt) return null;
  const [y, m, d] = expiresAt.split('-').map(Number);
  const target = new Date(y, (m || 1) - 1, d || 1);
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target.getTime() - base.getTime()) / 86_400_000);
}

export function formatDate(dateStr: string): string {
  const [, m, d] = dateStr.split('-');
  return `${Number(m)}/${Number(d)}`;
}

/** 이번 달 1일 ~ 오늘까지 남은 일수 비율(월말 실적 알림용) */
export function monthProgress(date: Date = new Date()): { day: number; lastDay: number; ratio: number } {
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  return { day: date.getDate(), lastDay, ratio: date.getDate() / lastDay };
}
