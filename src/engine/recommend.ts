import type { AppState, Card, PaymentInput, PerkVerification, PromoRule, Transaction, Verification } from '../types';
import {
  capKrwOf,
  estimateGatedMonthlyValue,
  evaluateBenefit,
  isBenefitExcluded,
  rateOfRule,
  usageOf,
  type BenefitEvaluation,
} from './benefits';
import {
  currentMonthSpend,
  isPerformanceEligible,
  prevMonthSpend,
  performanceStatus,
} from './performance';
import { monthKeyOf, todayISO, toMonthKey } from './date';
import { promoActive } from './perks';

export interface BenefitLine {
  label: string;
  krw: number;
  ratePercent: number;
  capped: boolean;
  verification: Verification;
  note?: string;
  pointsLabel?: string;
}

export interface PromoEvaluation {
  id: string;
  label: string;
  rewardKrw: number;
  minSpend: number;
  progressBefore: number;
  progressAfter: number;
  achievable: boolean;
  newlyAchieved: boolean;
  enrolled: boolean;
  expiresAt: string;
  note?: string;
  verification: PerkVerification;
}

export interface PaymentPerformance {
  threshold: number;
  prevSpend: number;
  met: boolean;
  shortfall: number;
  /** 이번 결제 전 당월 인정 실적 */
  currentSpend: number;
  /** 이번 결제 후 당월 인정 실적(다음 달 기준) */
  afterCurrentSpend: number;
  nextMetBefore: boolean;
  nextMetAfter: boolean;
  contributionKrw: number;
  contributionRatio: number;
  paymentEligible: boolean;
}

export interface CardRecommendation {
  cardId: string;
  cardName: string;
  cardShort: string;
  issuer: string;
  theme: Card['theme'];
  network: Card['network'];
  rank: number;
  immediateKrw: number;
  bestLabel: string;
  bestRatePercent: number;
  benefitLines: BenefitLine[];
  promo?: PromoEvaluation;
  performance: PaymentPerformance;
  futureValueKrw: number;
  futureLabel: string;
  reasons: string[];
  cautions: string[];
  blocked: boolean;
  verification: Verification;
}

function pseudoTransaction(card: Card, input: PaymentInput, today: Date): Transaction {
  return {
    id: 'preview',
    cardId: card.id,
    merchant: input.merchant || '결제 예정',
    category: input.category,
    amount: input.amount,
    date: todayISO(today),
    status: 'active',
    createdAt: today.toISOString(),
  };
}

function promoProgress(card: Card, promo: PromoRule, transactions: Transaction[], today: Date): number {
  const month = toMonthKey(today);
  let sum = 0;
  for (const tx of transactions) {
    if (tx.cardId !== card.id || tx.status !== 'active') continue;
    if (monthKeyOf(tx.date) !== month) continue;
    if (!promo.categories.includes(tx.category)) continue;
    sum += tx.amount;
  }
  return sum;
}

function evaluatePromo(card: Card, input: PaymentInput, transactions: Transaction[], today: Date): PromoEvaluation | undefined {
  const promo = card.promos.find((p) => promoActive(p, today) && p.categories.includes(input.category));
  if (!promo) return undefined;
  const before = promoProgress(card, promo, transactions, today);
  const after = before + input.amount;
  const already = before >= promo.minSpend;
  const achievable = promo.enrolled && after >= promo.minSpend;
  return {
    id: promo.id,
    label: promo.label,
    rewardKrw: achievable ? promo.rewardKrw : 0,
    minSpend: promo.minSpend,
    progressBefore: before,
    progressAfter: after,
    achievable,
    newlyAchieved: achievable && !already,
    enrolled: promo.enrolled,
    expiresAt: promo.expiresAt,
    note: promo.note,
    verification: promo.verification,
  };
}

export function evaluateCardPayment(
  card: Card,
  state: AppState,
  input: PaymentInput,
  today: Date = new Date(),
): CardRecommendation {
  const prevSpend = prevMonthSpend(card, state.transactions, today);
  const currentBefore = currentMonthSpend(card, state.transactions, today);
  const status = performanceStatus(card, state.transactions, today);
  const paymentEligible = isPerformanceEligible(card, pseudoTransaction(card, input, today));

  const evaluations: BenefitEvaluation[] = card.benefits.map((rule) =>
    evaluateBenefit(rule, {
      payment: input,
      prevSpend,
      ...usageOf(card, rule),
      exclusions: card.benefitExclusions,
      pointValues: state.settings.pointValues,
    }),
  );
  const applicable = evaluations.filter((e) => e.applicable);
  const applied = applicable.filter((e) => e.applied).sort((a, b) => b.benefitKrw - a.benefitKrw);
  const best = applied[0];

  const immediateKrw = best?.benefitKrw ?? 0;
  const benefitLines: BenefitLine[] = applicable
    .sort((a, b) => b.benefitKrw - a.benefitKrw)
    .map((e) => ({
      label: e.label,
      krw: e.benefitKrw,
      ratePercent: e.ratePercent,
      capped: e.capped,
      verification: e.verification,
      note: e.note,
      pointsLabel: e.points > 0 ? `${e.points.toLocaleString('ko-KR')}${e.pointUnit}` : undefined,
    }));

  const threshold = card.performance.prevThreshold;
  const contributionKrw = paymentEligible ? Math.min(input.amount, Math.max(0, threshold - currentBefore)) : 0;
  const contributionRatio = threshold > 0 ? Math.min(1, contributionKrw / threshold) : 0;
  const afterCurrentSpend = currentBefore + (paymentEligible ? input.amount : 0);
  const nextMetBefore = threshold === 0 || currentBefore >= threshold;
  const nextMetAfter = threshold === 0 || afterCurrentSpend >= threshold;
  const gatedMonthlyValue = estimateGatedMonthlyValue(card, state.settings.pointValues);
  const futureValueKrw = nextMetBefore || gatedMonthlyValue === 0
    ? 0
    : Math.round(gatedMonthlyValue * contributionRatio);

  const reasons: string[] = [];
  const cautions: string[] = [];

  if (best) {
    reasons.push(`${best.label} → 약 ${immediateKrw.toLocaleString('ko-KR')}원`);
    if (best.capped) {
      reasons.push(`월 한도 잔여 ${(best.capRemainingKrw ?? 0).toLocaleString('ko-KR')}원까지만 반영`);
    }
  } else if (applicable.length > 0) {
    reasons.push('적용 가능한 혜택이 있으나 이번 달 한도가 모두 소진되었습니다.');
  } else {
    reasons.push('이 업종에 적용되는 혜택이 없습니다.');
  }

  if (threshold === 0) {
    reasons.push('전월 실적 조건 없음');
  } else if (status.met) {
    reasons.push(`전월 실적 충족 (${Math.round(prevSpend / 10_000)}만/${Math.round(threshold / 10_000)}만 원)`);
  } else {
    const gap = Math.max(0, threshold - prevSpend);
    cautions.push(`전월 실적 미달(${Math.round(prevSpend / 10_000)}만/${Math.round(threshold / 10_000)}만 원) — 실적 조건 혜택은 이번 달 적용되지 않습니다.`);
    reasons.push(`실적까지 ${gap.toLocaleString('ko-KR')}원 부족`);
  }

  if (!paymentEligible) {
    cautions.push('이 결제는 이 카드의 실적 인정 조건(업종·건당 최소금액)에 해당하지 않습니다.');
  }
  if (isBenefitExcluded(card.benefitExclusions, input)) {
    cautions.push('이 결제는 이 카드의 적립·할인 제외 대상입니다(세금·공과금 등).');
  }
  if (input.category === 'overseas') {
    cautions.push('해외 결제는 카드사 해외이용수수료(약 1~1.5%)가 별도로 붙을 수 있습니다.');
  }
  for (const e of applicable) {
    if (!e.applied && e.blockedReason && !cautions.some((c) => c.includes(e.blockedReason!))) {
      cautions.push(`${e.label}: ${e.blockedReason}`);
    }
    for (const w of e.warnings) {
      if (!cautions.includes(w)) cautions.push(w);
    }
  }
  if (card.verification === 'example' || benefitLines.some((l) => l.verification === 'example')) {
    cautions.push('예시 데이터가 포함되어 있습니다. 실제 결제 전 카드사 공식 약관으로 확인하세요.');
  }

  let futureLabel: string;
  if (threshold === 0) {
    futureLabel = '실적 조건이 없어 향후 기여 없음';
  } else if (nextMetBefore) {
    futureLabel = '이미 다음 달 기준 충족';
  } else if (futureValueKrw > 0) {
    futureLabel = nextMetAfter
      ? `이번 결제로 다음 달 실적 충족 — 기대 가치 약 ${futureValueKrw.toLocaleString('ko-KR')}원(추정)`
      : `다음 달 실적 ${Math.round(contributionRatio * 100)}% 기여 — 기대 가치 약 ${futureValueKrw.toLocaleString('ko-KR')}원(추정)`;
  } else {
    futureLabel = `다음 달 실적까지 ${Math.max(0, threshold - afterCurrentSpend).toLocaleString('ko-KR')}원 부족`;
  }

  const promo = evaluatePromo(card, input, state.transactions, today);

  return {
    cardId: card.id,
    cardName: card.name,
    cardShort: card.shortName,
    issuer: card.issuer,
    theme: card.theme,
    network: card.network,
    rank: 0,
    immediateKrw,
    bestLabel: best?.label ?? '적용 혜택 없음',
    bestRatePercent: best?.ratePercent ?? 0,
    benefitLines,
    promo,
    performance: {
      threshold,
      prevSpend,
      met: status.met,
      shortfall: status.shortfall,
      currentSpend: currentBefore,
      afterCurrentSpend,
      nextMetBefore,
      nextMetAfter,
      contributionKrw,
      contributionRatio,
      paymentEligible,
    },
    futureValueKrw,
    futureLabel,
    reasons,
    cautions,
    blocked: immediateKrw === 0,
    verification: card.verification,
  };
}

export function recommendPayment(
  state: AppState,
  input: PaymentInput,
  today: Date = new Date(),
): CardRecommendation[] {
  const results = state.cards
    .map((card) => evaluateCardPayment(card, state, input, today))
    .sort((a, b) => {
      if (b.immediateKrw !== a.immediateKrw) return b.immediateKrw - a.immediateKrw;
      if (b.futureValueKrw !== a.futureValueKrw) return b.futureValueKrw - a.futureValueKrw;
      return a.cardName.localeCompare(b.cardName, 'ko');
    });
  return results.map((r, i) => ({ ...r, rank: i + 1 }));
}

export interface SplitAllocation {
  cardId: string;
  cardName: string;
  cardShort: string;
  amount: number;
  benefitKrw: number;
  ratePercent: number;
}

export interface SplitPlan {
  input: PaymentInput;
  allocations: SplitAllocation[];
  totalBenefitKrw: number;
  singleBest: { cardId: string; cardName: string; benefitKrw: number } | null;
  gainKrw: number;
  splitUseful: boolean;
  cautions: string[];
}

/**
 * 분할 결제 시뮬레이션: 1만 원 단위로 "다음 1만 원에서 한계 혜택이 가장 큰 카드"에 배분한다.
 * 월 한도가 있는 카드가 섞여 있을 때 단일 카드 대비 이득을 계산한다.
 */
export function simulateSplit(
  state: AppState,
  input: PaymentInput,
  today: Date = new Date(),
  step = 10_000,
): SplitPlan {
  const cards = state.cards;
  const allocations = new Map<string, number>(cards.map((c) => [c.id, 0]));
  const usageSim = new Map<string, Record<string, number>>(
    cards.map((c) => [c.id, { ...c.usage }]),
  );
  const gainSim = new Map<string, number>(cards.map((c) => [c.id, 0]));

  const benefitAt = (card: Card, amountSoFar: number, extra: number): { gain: number; ruleId?: string } => {
    if (extra <= 0) return { gain: 0 };
    const usage = usageSim.get(card.id) ?? {};
    const groupUsage = (rule: (typeof card.benefits)[number]): number | undefined => {
      if (!rule.sharedCapGroup) return undefined;
      return card.benefits
        .filter((r) => r.sharedCapGroup === rule.sharedCapGroup)
        .reduce((sum, r) => sum + Math.max(0, usage[r.id] ?? 0), 0);
    };
    const evals = card.benefits.map((rule) =>
      evaluateBenefit(rule, {
        payment: { ...input, amount: amountSoFar + extra },
        prevSpend: prevMonthSpend(card, state.transactions, today),
        usageKrw: Math.max(0, usage[rule.id] ?? 0),
        groupUsageKrw: groupUsage(rule),
        exclusions: card.benefitExclusions,
        pointValues: state.settings.pointValues,
      }),
    );
    // 현재 배분분까지의 혜택
    const nowEvals = card.benefits.map((rule) =>
      evaluateBenefit(rule, {
        payment: { ...input, amount: amountSoFar },
        prevSpend: prevMonthSpend(card, state.transactions, today),
        usageKrw: Math.max(0, usage[rule.id] ?? 0),
        groupUsageKrw: groupUsage(rule),
        exclusions: card.benefitExclusions,
        pointValues: state.settings.pointValues,
      }),
    );
    const bestNow = Math.max(0, ...nowEvals.filter((e) => e.applied).map((e) => e.benefitKrw));
    const next = evals.filter((e) => e.applied).sort((a, b) => b.benefitKrw - a.benefitKrw)[0];
    if (!next) return { gain: 0 };
    return { gain: Math.max(0, next.benefitKrw - bestNow), ruleId: next.ruleId };
  };

  let remaining = Math.max(0, Math.round(input.amount));
  let guard = 0;
  while (remaining > 0 && guard < 2_000) {
    guard += 1;
    const chunk = Math.min(step, remaining);
    let bestCard: Card | null = null;
    let bestGain = 0;
    let bestRule: string | undefined;
    for (const card of cards) {
      const amountSoFar = allocations.get(card.id) ?? 0;
      const { gain, ruleId } = benefitAt(card, amountSoFar, chunk);
      if (gain > bestGain) {
        bestGain = gain;
        bestCard = card;
        bestRule = ruleId;
      }
    }
    if (!bestCard) break;
    allocations.set(bestCard.id, (allocations.get(bestCard.id) ?? 0) + chunk);
    const usage = usageSim.get(bestCard.id) ?? {};
    if (bestRule) usage[bestRule] = (usage[bestRule] ?? 0) + bestGain;
    usageSim.set(bestCard.id, usage);
    gainSim.set(bestCard.id, (gainSim.get(bestCard.id) ?? 0) + bestGain);
    remaining -= chunk;
  }

  const rows: SplitAllocation[] = cards
    .filter((c) => (allocations.get(c.id) ?? 0) > 0)
    .map((c) => {
      const amount = allocations.get(c.id) ?? 0;
      const benefitKrw = gainSim.get(c.id) ?? 0;
      return {
        cardId: c.id,
        cardName: c.name,
        cardShort: c.shortName,
        amount,
        benefitKrw,
        ratePercent: amount > 0 ? (benefitKrw / amount) * 100 : 0,
      };
    })
    .sort((a, b) => b.benefitKrw - a.benefitKrw);

  const totalBenefitKrw = rows.reduce((s, r) => s + r.benefitKrw, 0);
  const single = recommendPayment(state, input, today)[0] ?? null;
  const singleBest = single
    ? { cardId: single.cardId, cardName: single.cardShort, benefitKrw: single.immediateKrw }
    : null;
  const gainKrw = singleBest ? Math.max(0, totalBenefitKrw - singleBest.benefitKrw) : totalBenefitKrw;

  return {
    input,
    allocations: rows,
    totalBenefitKrw,
    singleBest,
    gainKrw,
    splitUseful: rows.length > 1 && gainKrw > 0,
    cautions: [
      '분할 결제는 카드별 이벤트·누적 조건(예: 해외 80만 원)을 깰 수 있습니다.',
      '카드사 혜택 중복 적용은 실제 약관에 따라 달라질 수 있습니다.',
    ],
  };
}

export function sumUsageKrw(card: Card): number {
  return Object.values(card.usage).reduce((s, v) => s + Math.max(0, v || 0), 0);
}

export function totalMonthlyCap(card: Card, pointValues: Record<string, number>): number {
  return card.benefits.reduce((sum, rule) => sum + (capKrwOf(rule, pointValues) ?? 0), 0);
}

export function cardEffectiveRate(card: Card, pointValues: Record<string, number>): number {
  if (card.benefits.length === 0) return 0;
  return Math.max(...card.benefits.map((r) => rateOfRule(r, pointValues)));
}
