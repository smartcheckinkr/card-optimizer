import type { BenefitExclusion, BenefitRule, Card, PaymentInput, PointCurrencyId, Verification } from '../types';
import { POINT_CURRENCY_MAP } from '../data/categories';

/** 실적 미달 시 "다음 달 예상 사용액" 가정치 (향후 기대 가치 추정에만 사용) */
export const ASSUMED_MONTHLY_SPEND = 300_000;

export interface BenefitContext {
  payment: PaymentInput;
  /** 전월 인정 실적 */
  prevSpend: number;
  /** 이번 달 이미 받은 혜택(원) */
  usageKrw: number;
  /**
   * 같은 공유 한도 묶음(sharedCapGroup)에 속한 규칙들의 이번 달 사용액 합계.
   * 없으면 usageKrw 만 본다.
   */
  groupUsageKrw?: number;
  /** 적립·할인 제외 업종/가맹점(실적 제외와 분리) */
  exclusions?: BenefitExclusion;
  pointValues: Record<PointCurrencyId, number>;
}

export interface BenefitEvaluation {
  ruleId: string;
  label: string;
  /** 업종·가맹점·최소금액·전월실적 조건을 모두 충족했는지 */
  applicable: boolean;
  /** 실제 혜택이 발생했는지(한도 소진 시 false) */
  applied: boolean;
  benefitKrw: number;
  rawKrw: number;
  points: number;
  pointUnit: string;
  /** 혜택률(%) — 원화 환산 기준 */
  ratePercent: number;
  capKrw: number | null;
  capRemainingKrw: number | null;
  capped: boolean;
  blockedReason?: string;
  warnings: string[];
  verification: Verification;
  note?: string;
  requiresDirect?: boolean;
}

export function pointValueOf(pointValues: Record<string, number>, id?: PointCurrencyId): number {
  if (!id) return 1;
  if (typeof pointValues[id] === 'number') return pointValues[id];
  return POINT_CURRENCY_MAP[id]?.defaultWonPerUnit ?? 1;
}

/** 카드1 원당 혜택률 */
export function rateOfRule(rule: BenefitRule, pointValues: Record<string, number>): number {
  if (rule.earnType === 'percent') return (rule.percent ?? 0) / 100;
  const unit = rule.unitAmount && rule.unitAmount > 0 ? rule.unitAmount : 1_000;
  const unitValue = (rule.pointsPerUnit ?? 0) * pointValueOf(pointValues, rule.pointCurrencyId);
  return unitValue / unit;
}

export function ratePercentOfRule(rule: BenefitRule, pointValues: Record<string, number>): number {
  return rateOfRule(rule, pointValues) * 100;
}

export function capKrwOf(rule: BenefitRule, pointValues: Record<string, number>): number | null {
  if (typeof rule.monthlyCapKrw === 'number') return rule.monthlyCapKrw;
  if (typeof rule.monthlyCapPoints === 'number') {
    return rule.monthlyCapPoints * pointValueOf(pointValues, rule.pointCurrencyId);
  }
  return null;
}

export function rateLabel(rule: BenefitRule, pointValues: Record<string, number>): string {
  if (rule.earnType === 'percent') return `${Number((rule.percent ?? 0).toFixed(2))}%`;
  const unit = rule.unitAmount ?? 1_000;
  const cur = rule.pointCurrencyId ? POINT_CURRENCY_MAP[rule.pointCurrencyId] : undefined;
  const unitLabel = cur?.unit ?? 'P';
  return `${unit.toLocaleString('ko-KR')}원당 ${rule.pointsPerUnit ?? 0}${unitLabel} (≈${ratePercentOfRule(rule, pointValues).toFixed(2)}%)`;
}

/**
 * 카드의 적립·할인 제외 대상에 해당하는 결제인지 확인한다.
 * (세금·공과금처럼 실적에는 들어가지만 혜택은 안 붙는 결제를 구분하기 위한 것)
 */
export function isBenefitExcluded(exclusions: BenefitExclusion | undefined, payment: PaymentInput): boolean {
  if (!exclusions) return false;
  if (exclusions.categories.includes(payment.category)) return true;
  const merchant = payment.merchant.toLowerCase();
  return exclusions.keywords.some((k) => k && merchant.includes(k.toLowerCase()));
}

/** 단일 혜택 규칙 평가 */
export function evaluateBenefit(rule: BenefitRule, ctx: BenefitContext): BenefitEvaluation {
  const { payment, prevSpend, usageKrw, pointValues } = ctx;
  const ratePercent = Number(ratePercentOfRule(rule, pointValues).toFixed(4));
  const cap = capKrwOf(rule, pointValues);
  const usedKrw = Math.max(0, Math.max(usageKrw, ctx.groupUsageKrw ?? 0));
  const capRemaining = cap === null ? null : Math.max(0, cap - usedKrw);
  const unit = rule.pointCurrencyId ? POINT_CURRENCY_MAP[rule.pointCurrencyId]?.unit ?? 'P' : 'P';

  const base: BenefitEvaluation = {
    ruleId: rule.id,
    label: rule.label,
    applicable: false,
    applied: false,
    benefitKrw: 0,
    rawKrw: 0,
    points: 0,
    pointUnit: unit,
    ratePercent,
    capKrw: cap,
    capRemainingKrw: capRemaining,
    capped: false,
    warnings: [],
    verification: rule.verification,
    note: rule.note,
    requiresDirect: rule.requiresDirect,
  };

  if (!rule.categories.includes(payment.category)) {
    return { ...base, blockedReason: '이 업종에는 적용되지 않음' };
  }
  if (isBenefitExcluded(ctx.exclusions, payment)) {
    return { ...base, blockedReason: '적립·할인 제외 대상 결제' };
  }
  if (rule.keywords && rule.keywords.length > 0) {
    const merchant = payment.merchant.toLowerCase();
    if (!rule.keywords.some((k) => merchant.includes(k.toLowerCase()))) {
      return { ...base, blockedReason: '가맹점 조건 미충족' };
    }
  }
  if (rule.minTransaction && payment.amount < rule.minTransaction) {
    return { ...base, blockedReason: `건당 ${rule.minTransaction.toLocaleString('ko-KR')}원 이상 결제 시 적용` };
  }
  if (rule.minPrevMonth && prevSpend < rule.minPrevMonth) {
    return {
      ...base,
      blockedReason: `전월 실적 ${rule.minPrevMonth.toLocaleString('ko-KR')}원 미달`,
      warnings: ['전월 실적 조건으로 이번 달에는 적용되지 않습니다.'],
    };
  }

  let points = 0;
  let raw = 0;
  if (rule.earnType === 'percent') {
    raw = Math.round((payment.amount * (rule.percent ?? 0)) / 100);
  } else {
    const unitAmount = rule.unitAmount && rule.unitAmount > 0 ? rule.unitAmount : 1_000;
    points = Math.floor(payment.amount / unitAmount) * (rule.pointsPerUnit ?? 0);
    raw = Math.round(points * pointValueOf(pointValues, rule.pointCurrencyId));
  }

  const benefit = capRemaining === null ? raw : Math.min(raw, capRemaining);
  const capped = benefit < raw;
  const warnings: string[] = [];
  if (capped) warnings.push(`이번 달 혜택 한도(${cap?.toLocaleString('ko-KR')}원)에 걸려 일부만 반영됩니다.`);
  if (rule.requiresDirect) warnings.push('카드사 공홈·앱에서 카드를 직접 입력해 결제할 때만 적용됩니다(여행사·간편결제 제외).');

  return {
    ...base,
    applicable: true,
    applied: benefit > 0,
    benefitKrw: benefit,
    rawKrw: raw,
    points,
    capped,
    warnings,
  };
}

/** 한 규칙의 이번 달 사용액과, 같은 공유 한도 묶음의 합계를 계산한다. */
export function usageOf(card: Card, rule: BenefitRule): { usageKrw: number; groupUsageKrw?: number } {
  const usageKrw = Math.max(0, card.usage[rule.id] ?? 0);
  if (!rule.sharedCapGroup) return { usageKrw };
  const groupUsageKrw = card.benefits
    .filter((r) => r.sharedCapGroup === rule.sharedCapGroup)
    .reduce((sum, r) => sum + Math.max(0, card.usage[r.id] ?? 0), 0);
  return { usageKrw, groupUsageKrw };
}

/** 이 카드의 혜택 중 가장 유리한 1개 + 나머지(참고용) */
export function evaluateCardBenefits(card: Card, ctx: BenefitContext): {
  evaluations: BenefitEvaluation[];
  best?: BenefitEvaluation;
} {
  const evaluations = card.benefits.map((rule) =>
    evaluateBenefit(rule, { ...ctx, usageKrw: ctx.usageKrw }),
  );
  const applied = evaluations.filter((e) => e.applied).sort((a, b) => b.benefitKrw - a.benefitKrw);
  return { evaluations, best: applied[0] };
}

export interface SingleRuleContext extends Omit<BenefitContext, 'usageKrw'> {
  usageKrw: number;
}

/** 전월 실적 조건이 붙은 혜택을 월 30만 원 사용 가정으로 환산한 기대 가치 */
export function estimateGatedMonthlyValue(card: Card, pointValues: Record<string, number>): number {
  let total = 0;
  for (const rule of card.benefits) {
    if (!rule.minPrevMonth) continue;
    const cap = capKrwOf(rule, pointValues);
    if (cap !== null) {
      total += cap;
    } else {
      total += rateOfRule(rule, pointValues) * ASSUMED_MONTHLY_SPEND;
    }
  }
  return Math.round(total);
}

export function describeBenefitRule(rule: BenefitRule, pointValues: Record<string, number>): string {
  const parts = [rateLabel(rule, pointValues)];
  const cap = capKrwOf(rule, pointValues);
  if (cap !== null) parts.push(`${rule.sharedCapGroup ? '통합 ' : ''}월 한도 ${cap.toLocaleString('ko-KR')}원`);
  if (rule.minPrevMonth) parts.push(`전월 ${Math.round(rule.minPrevMonth / 10_000)}만 원 이상`);
  if (rule.requiresDirect) parts.push('직판 조건');
  return parts.join(' · ');
}
