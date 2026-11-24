import type { AppState, CategoryId, Card } from '../types';
import { guessCategory } from '../data/categories';
import { dDay, monthProgress, todayISO, toMonthKey } from './date';
import { estimateGatedMonthlyValue, capKrwOf, rateOfRule } from './benefits';
import { currentMonthSpend, prevMonthSpend } from './performance';
import { recommendPayment, simulateSplit, sumUsageKrw } from './recommend';

export interface AssistantAnswer {
  intent: string;
  text: string;
  followUps: string[];
}

const won = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`;
const man = (n: number) => `${Math.round(n / 10_000).toLocaleString('ko-KR')}만 원`;

function parseAmount(q: string): number | null {
  const manMatch = q.match(/([\d,]+(?:\.\d+)?)\s*만/);
  if (manMatch) return Math.round(parseFloat(manMatch[1].replace(/,/g, '')) * 10_000);
  const wonMatch = q.match(/([\d,]{3,})\s*원/);
  if (wonMatch) return Number(wonMatch[1].replace(/,/g, ''));
  const plain = q.match(/(\d{4,})/);
  if (plain) return Number(plain[1]);
  return null;
}

function cardShort(card: Card, state: AppState): string {
  return card.shortName;
}

function gatedSummary(card: Card, state: AppState): string {
  const gated = card.benefits.filter((b) => b.minPrevMonth);
  if (gated.length === 0) return '실적 조건 혜택 없음';
  const parts = gated.map((b) => `${b.label}`);
  return parts.join(', ');
}

function performanceAnswer(state: AppState, today: Date): AssistantAnswer {
  const rows = state.cards
    .filter((c) => c.performance.prevThreshold > 0)
    .map((card) => {
      const cur = currentMonthSpend(card, state.transactions, today);
      const prev = prevMonthSpend(card, state.transactions, today);
      const gap = Math.max(0, card.performance.prevThreshold - cur);
      const gatedValue = estimateGatedMonthlyValue(card, state.settings.pointValues);
      const efficiency = gap > 0 ? gatedValue / gap : 0;
      return { card, cur, prev, gap, gatedValue, efficiency };
    })
    .sort((a, b) => {
      if (a.gap === 0 && b.gap !== 0) return 1;
      if (b.gap === 0 && a.gap !== 0) return -1;
      return b.efficiency - a.efficiency;
    });

  const { day, lastDay } = monthProgress(today);
  const lines: string[] = [
    `오늘은 ${today.getMonth() + 1}월 ${day}일(${lastDay}일 중) — 당월 실적이 다음 달 혜택 기준이 됩니다.`,
    '',
  ];

  if (rows.length === 0) {
    lines.push('실적 기준이 있는 카드가 없습니다. 모든 카드가 실적 무관 카드예요.');
  }

  rows.forEach((r, i) => {
    if (r.gap <= 0) {
      lines.push(`${i + 1}) ${cardShort(r.card, state)} — 다음 달 기준 충족 (${man(r.cur)}/${man(r.card.performance.prevThreshold)})`);
    } else {
      lines.push(`${i + 1}) ${cardShort(r.card, state)} — ${man(r.cur)}/${man(r.card.performance.prevThreshold)} · ${man(r.gap)} 부족`);
      lines.push(`   · 채우면 열리는 혜택: ${gatedSummary(r.card, state)}`);
      lines.push(`   · 기대 가치 약 ${won(r.gatedValue)}/월 (추정) · 부족액 대비 ${(r.efficiency * 100).toFixed(1)}%`);
    }
    if (r.prev < r.card.performance.prevThreshold && r.card.performance.prevThreshold > 0) {
      lines.push(`   · 주의: 전월 실적 ${man(r.prev)}로 미달 — 이번 달 혜택은 제한됩니다.`);
    }
  });

  const firstToFill = rows.find((r) => r.gap > 0);
  lines.push('');
  if (firstToFill) {
    lines.push(
      `먼저 채울 카드는 ${cardShort(firstToFill.card, state)}입니다. ${man(firstToFill.gap)}을 더 쓰면 다음 달 ${won(firstToFill.gatedValue)} 상당 혜택 조건이 열립니다(추정).`,
    );
  } else {
    lines.push('지금은 모든 실적 조건이 채워져 있습니다. 한도 소진만 확인하면 됩니다.');
  }

  return {
    intent: 'performance',
    text: lines.join('\n'),
    followUps: ['이번 달 소멸 예정인 혜택은?', '연회비 대비 효율이 가장 낮은 카드는?', '100만 원 분할 결제 유리한가?'],
  };
}

function expiringAnswer(state: AppState, today: Date): AssistantAnswer {
  const items = state.wallet
    .filter((w) => w.remaining > 0 && w.expiresAt)
    .map((w) => ({ w, d: dDay(w.expiresAt, today) ?? 9999 }))
    .filter((x) => x.d >= 0 && x.d <= 90)
    .sort((a, b) => a.d - b.d);
  const lines: string[] = [];
  if (items.length === 0) {
    lines.push('90일 안에 소멸하는 혜택이 없습니다. 혜택 지갑 탭에서 만료일을 확인해 보세요.');
  } else {
    lines.push('소멸 예정 혜택(90일 이내)입니다.');
    lines.push('');
    items.slice(0, 5).forEach((x, i) => {
      const card = state.cards.find((c) => c.id === x.w.cardId);
      lines.push(`${i + 1}) D-${x.d} · ${x.w.title}`);
      lines.push(`   · ${card?.shortName ?? '카드 미지정'} · ${x.w.remaining}/${x.w.total}${x.w.unit} 남음${x.w.valueKrw ? ` (약 ${won(x.w.valueKrw)})` : ''}`);
      if (x.w.conditions) lines.push(`   · 조건: ${x.w.conditions}`);
      if (x.w.howTo) lines.push(`   · 이용: ${x.w.howTo}`);
    });
    if (items.length > 5) lines.push('', `외 ${items.length - 5}건은 혜택 지갑 탭에서 확인할 수 있습니다.`);
  }
  return {
    intent: 'expiring',
    text: lines.join('\n'),
    followUps: ['이번 달 어떤 카드 실적을 먼저 채워야 하나요?', '해외에서 어떤 카드를 써야 하나요?'],
  };
}

function recommendText(state: AppState, category: CategoryId, amount: number, merchant: string, today: Date, header: string): string {
  const results = recommendPayment(state, { amount, category, merchant }, today);
  const top = results.slice(0, 3);
  const lines = [header, ''];
  top.forEach((r, i) => {
    lines.push(`${i + 1}) ${r.cardShort} — 즉시 혜택 약 ${won(r.immediateKrw)}`);
    if (r.benefitLines.length > 0) {
      const line = r.benefitLines[0];
      lines.push(`   · ${line.label}${line.pointsLabel ? ` (${line.pointsLabel})` : ''}${line.capped ? ' — 월 한도 적용' : ''}`);
    }
    lines.push(`   · 실적: ${r.performance.threshold === 0 ? '조건 없음' : r.performance.met ? '전월 충족' : '전월 미달'}`);
    lines.push(`   · ${r.futureLabel}`);
    for (const c of r.cautions.slice(0, 2)) lines.push(`   · 주의: ${c}`);
    if (r.promo?.achievable) lines.push(`   · 이벤트: ${r.promo.label} (조건 충족 시 ${won(r.promo.rewardKrw)})`);
  });
  const diff = top.length > 1 ? top[0].immediateKrw - top[1].immediateKrw : 0;
  if (top.length > 1 && diff > 0) {
    lines.push('');
    lines.push(`1위와 2위 차이는 약 ${won(diff)}입니다.`);
  }
  lines.push('');
  lines.push('※ 즉시 혜택(원화 환산)만 비교한 순위이고, 향후 실적 기여는 별도 표기입니다. 예시 데이터가 포함되어 있으니 공식 약관을 확인하세요.');
  return lines.join('\n');
}

function overseasAnswer(state: AppState, question: string, today: Date): AssistantAnswer {
  const amount = parseAmount(question) ?? 500_000;
  const text = recommendText(
    state,
    'overseas',
    amount,
    '해외 결제',
    today,
    `해외 결제 ${man(amount)} 기준 비교입니다. (외화 결제·해외 가맹점)`,
  );
  return {
    intent: 'overseas',
    text,
    followUps: ['이번 달 소멸 예정인 혜택은?', `${man(amount)} 분할 결제 유리한가?`],
  };
}

function splitAnswer(state: AppState, question: string, today: Date): AssistantAnswer {
  const amount = parseAmount(question) ?? 1_000_000;
  const category = guessCategory(question) === 'general' ? 'overseas' : guessCategory(question);
  const plan = simulateSplit(state, { amount, category, merchant: '분할 결제' }, today);
  const lines: string[] = [];
  lines.push(`${man(amount)} 결제를 1만 원 단위로 나눠 배분했을 때입니다. (업종: ${category === 'overseas' ? '해외결제' : category})`);
  lines.push('');
  if (!plan.splitUseful) {
    lines.push(`분할해도 총 혜택은 단일 카드와 비슷합니다. 단일 카드 최적: ${plan.singleBest?.cardName ?? '-'} 약 ${won(plan.singleBest?.benefitKrw ?? 0)}.`);
  } else {
    lines.push(`분할 시 총 혜택 약 ${won(plan.totalBenefitKrw)} vs 단일 카드 약 ${won(plan.singleBest?.benefitKrw ?? 0)} → 차이 +${won(plan.gainKrw)}`);
  }
  lines.push('');
  plan.allocations.forEach((a, i) => {
    lines.push(`${i + 1}) ${a.cardShort} ${won(a.amount)} → 혜택 약 ${won(a.benefitKrw)} (${a.ratePercent.toFixed(2)}%)`);
  });
  lines.push('');
  for (const c of plan.cautions) lines.push(`※ 주의: ${c}`);
  return {
    intent: 'split',
    text: lines.join('\n'),
    followUps: ['이번 달 소멸 예정인 혜택은?', '이번 달 어떤 카드 실적을 먼저 채워야 하나요?'],
  };
}

function annualFeeAnswer(state: AppState, today: Date): AssistantAnswer {
  const rows = state.cards.map((card) => {
    const monthlyGated = estimateGatedMonthlyValue(card, state.settings.pointValues);
    const monthlyCap = card.benefits.reduce((s, b) => s + (capKrwOf(b, state.settings.pointValues) ?? 0), 0);
    const monthlyValue = Math.max(monthlyGated, monthlyCap);
    const annualValue = monthlyValue * 12;
    return { card, annualFee: card.annualFee, annualValue, ratio: card.annualFee > 0 ? annualValue / card.annualFee : Infinity };
  });
  rows.sort((a, b) => a.ratio - b.ratio);
  const lines = ['연회비 대비 추정 혜택 효율입니다. (월 한도·실적 조건 기준 단순 추정)', ''];
  rows.forEach((r, i) => {
    lines.push(`${i + 1}) ${r.card.shortName}`);
    lines.push(`   · 연회비 ${won(r.annualFee)} · 추정 연 혜택 ${won(r.annualValue)} → ${r.ratio === Infinity ? '실적 무관' : `${r.ratio.toFixed(1)}배`}`);
  });
  const worst = rows[0];
  lines.push('');
  lines.push(`가장 효율이 낮은 카드는 ${worst.card.shortName}입니다. 추정 ${worst.ratio === Infinity ? '-' : `${worst.ratio.toFixed(1)}배`}로, 실제 사용 패턴에서 혜택을 못 쓰면 연회비 부담이 남습니다.`);
  lines.push('※ 연회비는 카드사 공식 값, 혜택은 입력·예시 데이터 기준입니다.');
  return {
    intent: 'annual-fee',
    text: lines.join('\n'),
    followUps: ['이번 달 소멸 예정인 혜택은?', '이번 달 어떤 카드 실적을 먼저 채워야 하나요?'],
  };
}

function limitAnswer(state: AppState): AssistantAnswer {
  const lines = ['이번 달 혜택 한도 잔여입니다.', ''];
  for (const card of state.cards) {
    if (card.benefits.length === 0) continue;
    lines.push(`· ${card.shortName}`);
    for (const rule of card.benefits) {
      const cap = capKrwOf(rule, state.settings.pointValues);
      if (cap === null) {
        lines.push(`   - ${rule.label}: 한도 없음 (${(rateOfRule(rule, state.settings.pointValues) * 100).toFixed(2)}%)`);
      } else {
        const used = card.usage[rule.id] ?? 0;
        lines.push(`   - ${rule.label}: ${won(Math.max(0, cap - used))} 남음 / ${won(cap)}`);
      }
    }
  }
  return {
    intent: 'limits',
    text: lines.join('\n'),
    followUps: ['이번 달 소멸 예정인 혜택은?', '신세계백화점 30만 원 결제 카드 추천'],
  };
}

function hotelAnswer(state: AppState, question: string, today: Date): AssistantAnswer {
  const brand = question.includes('힐튼') ? 'hilton' : 'bonvoy';
  const cards = state.cards.filter((c) => c.benefits.some((b) => b.pointCurrencyId === brand));
  const wallet = state.wallet.filter((w) => cards.some((c) => c.id === w.cardId));
  const lines = [`${brand === 'hilton' ? '힐튼' : '메리어트'} 관련 보유 혜택입니다.`, ''];
  for (const card of cards) {
    const rules = card.benefits.filter((b) => b.pointCurrencyId === brand);
    lines.push(`· ${card.shortName}`);
    for (const r of rules) {
      lines.push(`   - ${r.label}${r.minPrevMonth ? ` (전월 ${man(r.minPrevMonth)} 이상)` : ''}`);
    }
  }
  lines.push('');
  lines.push('혜택 지갑에 있는 항목:');
  for (const w of wallet) {
    const card = state.cards.find((c) => c.id === w.cardId);
    const d = dDay(w.expiresAt, today);
    lines.push(`· ${w.title} — ${w.remaining}/${w.total}${w.unit}${d !== null ? ` · D-${d}` : ''} (${card?.shortName})`);
  }
  lines.push('');
  lines.push('※ 호텔 결제는 호텔 공식 채널·멤버십 연동 여부에 따라 적립이 달라집니다.');
  return {
    intent: 'hotel',
    text: lines.join('\n'),
    followUps: ['이번 달 소멸 예정인 혜택은?', '해외에서 어떤 카드를 써야 하나요?'],
  };
}

function placeAnswer(state: AppState, question: string, today: Date): AssistantAnswer {
  const category = guessCategory(question);
  const amount = parseAmount(question) ?? 300_000;
  const merchant = question.replace(/\d[\d,]*\s*(만\s*원|원)?/g, '').trim() || '결제 예정';
  const text = recommendText(
    state,
    category,
    amount,
    merchant,
    today,
    `"${merchant}" ${man(amount)} 결제 기준 추천입니다. (업종: ${category})`,
  );
  return {
    intent: 'place',
    text,
    followUps: ['이번 달 어떤 카드 실적을 먼저 채워야 하나요?', '이번 달 소멸 예정인 혜택은?', '100만 원 분할 결제 유리한가?'],
  };
}

export const ASSISTANT_SUGGESTIONS = [
  '이번 달 어떤 카드 실적을 먼저 채워야 하나요?',
  '이번 달 소멸 예정인 혜택은?',
  '해외에서 어떤 카드를 써야 하나요?',
  '100만 원 분할 결제 유리한가?',
  '연회비 대비 효율이 가장 낮은 카드는?',
  '신세계백화점 30만 원 결제 카드 추천',
];

export function askAssistant(question: string, state: AppState, today: Date = new Date()): AssistantAnswer {
  const q = question.trim();
  const lower = q.toLowerCase();

  if (!q) {
    return {
      intent: 'empty',
      text: '궁금한 점을 입력해 주세요. 보유 카드의 실적·한도·혜택 데이터로 계산해 답합니다.',
      followUps: ASSISTANT_SUGGESTIONS.slice(0, 3),
    };
  }

  if (/(분할|나눠|나누|쪼개)/.test(q)) return splitAnswer(state, q, today);
  if (/(소멸|만료|유효기간|언제까지)/.test(q)) return expiringAnswer(state, today);
  if (/(연회비)/.test(q)) return annualFeeAnswer(state, today);
  if (/(한도|잔여|남은 혜택)/.test(q) && !/실적/.test(q)) return limitAnswer(state);
  if (/(실적)/.test(q)) return performanceAnswer(state, today);
  if (/(힐튼|메리어트|호텔)/.test(q) && !/결제|추천/.test(q)) return hotelAnswer(state, q, today);
  if (/(해외|일본|유럽|미국|달러|엔화|여행)/.test(q)) return overseasAnswer(state, q, today);
  if (/(추천|어디|어떤 카드|결제)/.test(q) && (/(신세계|백화점|면세|항공|쿠팡|스타벅스|골프|호텔)/.test(q) || parseAmount(q))) {
    return placeAnswer(state, q, today);
  }
  if (/(카드 목록|보유 카드|내 카드)/.test(q)) {
    const lines = ['보유 카드 목록입니다.', ''];
    for (const card of state.cards) {
      lines.push(`· ${card.name} (${card.issuer} ${card.network}) — 연회비 ${won(card.annualFee)}${card.performance.prevThreshold ? `, 전월 ${man(card.performance.prevThreshold)}` : ', 실적 무관'}`);
    }
    return { intent: 'cards', text: lines.join('\n'), followUps: ASSISTANT_SUGGESTIONS.slice(0, 3) };
  }

  const usage = state.cards.reduce((s, c) => s + sumUsageKrw(c), 0);
  return {
    intent: 'unknown',
    text: [
      '질문을 정확히 해석하지 못했습니다. 현재는 외부 LLM 없이 로컬 규칙·계산 엔진으로만 답합니다.',
      '',
      '이렇게 물어봐 주세요:',
      ...ASSISTANT_SUGGESTIONS.map((s) => `· ${s}`),
      '',
      `참고: 이번 달 입력된 혜택 합계 ${won(usage)} · 기준일 ${todayISO(today)} (${toMonthKey(today)})`,
    ].join('\n'),
    followUps: ASSISTANT_SUGGESTIONS.slice(0, 3),
  };
}
