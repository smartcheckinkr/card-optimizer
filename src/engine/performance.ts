import type { Card, Transaction } from '../types';
import { monthKeyOf, prevMonthKey, toMonthKey } from './date';

export interface SpendBreakdown {
  monthKey: string;
  total: number;
  recognized: number;
  excluded: number;
  canceled: number;
  count: number;
  recognizedCount: number;
  exclusion: { category: number; minAmount: number; merchant: number; canceled: number };
}

/** 실적 인정 여부: 업종 제외 / 건당 최소금액 / 가맹점 제외 조건을 본다. */
export function isPerformanceEligible(card: Card, tx: Transaction): boolean {
  if (card.performance.excludedCategories.includes(tx.category)) return false;
  if (card.performance.minPerTransaction > 0 && tx.amount < card.performance.minPerTransaction) return false;
  const keywords = card.performance.excludedKeywords ?? [];
  if (keywords.some((k) => k && tx.merchant.toLowerCase().includes(k.toLowerCase()))) return false;
  return true;
}

/** 특정 월(YYYY-MM)의 결제 합계와 실적 인정액 */
export function spendBreakdown(card: Card, transactions: Transaction[], monthKey: string): SpendBreakdown {
  const result: SpendBreakdown = {
    monthKey,
    total: 0,
    recognized: 0,
    excluded: 0,
    canceled: 0,
    count: 0,
    recognizedCount: 0,
    exclusion: { category: 0, minAmount: 0, merchant: 0, canceled: 0 },
  };
  for (const tx of transactions) {
    if (tx.cardId !== card.id) continue;
    if (monthKeyOf(tx.date) !== monthKey) continue;
    result.count += 1;
    if (tx.status === 'canceled') {
      result.canceled += tx.amount;
      result.exclusion.canceled += tx.amount;
      continue;
    }
    result.total += tx.amount;
    if (card.performance.excludedCategories.includes(tx.category)) {
      result.excluded += tx.amount;
      result.exclusion.category += tx.amount;
      continue;
    }
    if (card.performance.minPerTransaction > 0 && tx.amount < card.performance.minPerTransaction) {
      result.excluded += tx.amount;
      result.exclusion.minAmount += tx.amount;
      continue;
    }
    const keywords = card.performance.excludedKeywords ?? [];
    if (keywords.some((k) => k && tx.merchant.toLowerCase().includes(k.toLowerCase()))) {
      result.excluded += tx.amount;
      result.exclusion.merchant += tx.amount;
      continue;
    }
    result.recognized += tx.amount;
    result.recognizedCount += 1;
  }
  return result;
}

/** 전월 인정 실적 (수동 보정 포함) */
export function prevMonthSpend(card: Card, transactions: Transaction[], today: Date = new Date()): number {
  const base = spendBreakdown(card, transactions, prevMonthKey(today)).recognized;
  return Math.max(0, base + card.manual.prevMonthAdjustment);
}

/** 당월 인정 실적 (수동 보정 포함) — 다음 달 실적 기준이 된다. */
export function currentMonthSpend(card: Card, transactions: Transaction[], today: Date = new Date()): number {
  const base = spendBreakdown(card, transactions, toMonthKey(today)).recognized;
  return Math.max(0, base + card.manual.currentMonthAdjustment);
}

export interface PerformanceStatus {
  threshold: number;
  prevSpend: number;
  prevBreakdown: SpendBreakdown;
  met: boolean;
  shortfall: number;
  ratio: number;
  currentSpend: number;
  currentBreakdown: SpendBreakdown;
  nextMet: boolean;
  nextShortfall: number;
  /** 이번 결제가 실적으로 인정되는지 (업종·최소금액 기준) */
  paymentEligible: boolean;
}

export function performanceRiskLabel(status: PerformanceStatus): string {
  if (status.threshold === 0) return '실적 조건 없음';
  if (status.met) return '전월 실적 충족';
  return `전월 실적 ${Math.round(status.ratio * 100)}%`;
}

/** 전월 실적 충족 여부 + 당월(다음 달 기준) 진행 상황 */
export function performanceStatus(
  card: Card,
  transactions: Transaction[],
  today: Date = new Date(),
  paymentCategoryEligible = true,
): PerformanceStatus {
  const threshold = card.performance.prevThreshold;
  const prevBreakdown = spendBreakdown(card, transactions, prevMonthKey(today));
  const currentBreakdown = spendBreakdown(card, transactions, toMonthKey(today));
  const prevTotal = Math.max(0, prevBreakdown.recognized + card.manual.prevMonthAdjustment);
  const currentTotal = Math.max(0, currentBreakdown.recognized + card.manual.currentMonthAdjustment);
  const met = threshold === 0 || prevTotal >= threshold;
  return {
    threshold,
    prevSpend: prevTotal,
    prevBreakdown,
    met,
    shortfall: Math.max(0, threshold - prevTotal),
    ratio: threshold === 0 ? 1 : Math.min(1, prevTotal / threshold),
    currentSpend: currentTotal,
    currentBreakdown,
    nextMet: threshold === 0 || currentTotal >= threshold,
    nextShortfall: Math.max(0, threshold - currentTotal),
    paymentEligible: paymentCategoryEligible,
  };
}
