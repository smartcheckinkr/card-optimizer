import type { AppState, CategoryId, Card } from '../types';
import { CATEGORY_LABEL, guessCategory } from '../data/categories';
import { dDay, monthProgress, todayISO, toMonthKey } from './date';
import { estimateGatedMonthlyValue, capKrwOf, rateOfRule } from './benefits';
import { currentMonthSpend, prevMonthSpend } from './performance';
import { recommendPayment, simulateSplit, sumUsageKrw } from './recommend';
import { activePromos, findMerchantPerkHits, LAYER_LABEL, type MerchantPerkHit } from './perks';

export interface AssistantAnswer {
  intent: string;
  text: string;
  followUps: string[];
}

const won = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`;
const man = (n: number) => `${Math.round(n / 10_000).toLocaleString('ko-KR')}만 원`;
/** 갈래가 나뉜 카드의 전월 실적을 '실적 무관'으로 잘못 말하지 않도록 한 줄로 정리 */
const thresholdText = (card: Card): string => {
  const { prevThreshold, thresholdScope } = card.performance;
  if (prevThreshold === 0) return '전월 실적 없음';
  return `전월 ${man(prevThreshold)}${thresholdScope ? `(${thresholdScope})` : ''}`;
};

function parseAmount(q: string): number | null {
  const manMatch = q.match(/([\d,]+(?:\.\d+)?)\s*만/);
  if (manMatch) return Math.round(parseFloat(manMatch[1].replace(/,/g, '')) * 10_000);
  const wonMatch = q.match(/([\d,]{3,})\s*원/);
  if (wonMatch) return Number(wonMatch[1].replace(/,/g, ''));
  const plain = q.match(/(\d{4,})/);
  if (plain) return Number(plain[1]);
  return null;
}

/** 일상 가맹점·세금 키워드 → 업종 + 기본 비교 금액 + 안내 */
interface MerchantHint {
  category: CategoryId;
  label: string;
  /** 금액 없이 물었을 때 비교 기준 금액 */
  defaultAmount: number;
  note?: string;
}

const MERCHANT_HINTS: { keys: string[]; hint: MerchantHint }[] = [
  {
    keys: ['지방세', '국세', '재산세', '자동차세', '취득세', '등록세', '세금', '공과금', '고지서', '4대보험', '건강보험', '국민연금', '건보', '연금', '아파트관리비', '관리비'],
    hint: { category: 'tax', label: '세금·공과금', defaultAmount: 100_000 },
  },
  {
    keys: ['지하철', '버스', '택시', '카카오t', '카카오 t', '티머니', 'ktx', 'srt', '고속버스', '기차', '교통'],
    hint: { category: 'transit', label: '대중교통', defaultAmount: 5_000 },
  },
  {
    keys: ['cgv', '씨지브이', '롯데시네마', '메가박스', '영화', '시네마', '공연', '콘서트'],
    hint: {
      category: 'general',
      label: '영화·문화',
      defaultAmount: 30_000,
      note: '영화관은 업종상 문화/일반으로 분류되어 업종 적립은 낮지만, CGV·롯데시네마·메가박스 전용 할인이 있는 카드는 위에 표시됩니다.',
    },
  },
  {
    keys: ['공항 라운지', '라운지', 'priority pass', 'pp카드', 'the lounge', '센츄리온'],
    hint: {
      category: 'general',
      label: '공항 라운지',
      defaultAmount: 0,
      note: '라운지는 결제금액과 무관하게 이용 횟수·동반인 조건으로 비교합니다.',
    },
  },
  {
    keys: ['스타벅스', '투썸', '폴바셋', '커피빈', '커피', '카페', '이디야', '메가커피', '빽다방'],
    hint: { category: 'dining', label: '카페', defaultAmount: 10_000 },
  },
  {
    keys: ['편의점', 'gs25', 'cu', '세븐일레븐', '이마트24'],
    hint: { category: 'general', label: '편의점', defaultAmount: 10_000 },
  },
  {
    keys: ['마트', '이마트', '홈플러스', '롯데마트', '농협하나로', '코스트코'],
    hint: { category: 'general', label: '대형마트', defaultAmount: 100_000 },
  },
  {
    keys: ['병원', '의원', '치과', '한의원', '약국', '의료'],
    hint: { category: 'general', label: '병·의원', defaultAmount: 30_000 },
  },
  {
    keys: ['배달', '배민', '배달의민족', '쿠팡이츠', '요기요'],
    hint: { category: 'delivery', label: '배달앱', defaultAmount: 25_000 },
  },
  {
    keys: ['쿠팡', '네이버쇼핑', '11번가', '마켓컬리', '컬리', 'ssg', '아마존', '직구', '온라인'],
    hint: { category: 'online', label: '온라인쇼핑', defaultAmount: 50_000 },
  },
  {
    keys: ['주유', '주유소', 'gs칼텍스', 's-oil', '오일뱅크', 'sk에너지', '기름'],
    hint: { category: 'fuel', label: '주유', defaultAmount: 60_000 },
  },
  {
    keys: ['전기차', '충전', '테슬라', '수퍼차저', '슈퍼차저', 'e-pit', '에버온'],
    hint: { category: 'ev', label: '전기차 충전', defaultAmount: 30_000 },
  },
  {
    keys: ['주차', '하이패스', '통행료', '톨게이트'],
    hint: { category: 'parking', label: '주차·하이패스', defaultAmount: 10_000 },
  },
  {
    keys: ['넷플릭스', '유튜브', '티빙', '웨이브', '왓챠', '디즈니', '멜론', '스트리밍', '구독'],
    hint: { category: 'streaming', label: '스트리밍·구독', defaultAmount: 15_000 },
  },
  {
    keys: ['네이버페이', '카카오페이', '토스페이', '삼성페이', 'ssg페이', '페이코', '간편결제'],
    hint: { category: 'simplepay', label: '간편결제', defaultAmount: 30_000 },
  },
  {
    keys: ['백화점', '신세계', '롯데백화점', '현대백화점', '더현대', '갤러리아'],
    hint: { category: 'department', label: '백화점', defaultAmount: 300_000 },
  },
  {
    keys: ['면세점', '신라면세점', '롯데면세점', '신세계면세점', '면세'],
    hint: { category: 'dutyfree', label: '면세점', defaultAmount: 500_000 },
  },
  {
    keys: ['대한항공', '아시아나', '제주항공', '진에어', '항공', '비행기'],
    hint: { category: 'airline', label: '항공', defaultAmount: 500_000 },
  },
  {
    keys: ['호텔', '숙박', '리조트', '노보텔', '소피텔', '힐튼', '메리어트', '아코르', '하얏트'],
    hint: { category: 'hotel', label: '호텔·숙박', defaultAmount: 300_000 },
  },
  {
    keys: ['골프', '골프장', '스크린골프'],
    hint: { category: 'golf', label: '골프', defaultAmount: 200_000 },
  },
  {
    keys: ['식당', '맛집', '음식', '외식', '점심', '저녁', '밥'],
    hint: { category: 'dining', label: '음식점', defaultAmount: 50_000 },
  },
  {
    keys: ['통신', 'skt', 'kt', 'lg u+', '유플러스', '휴대폰', '핸드폰'],
    hint: { category: 'general', label: '통신요금', defaultAmount: 60_000, note: '통신요금은 대부분 전월 실적에는 포함되지만 별도 적립 혜택은 없습니다.' },
  },
];

function findMerchantHint(q: string): MerchantHint | null {
  const lower = q.toLowerCase();
  for (const row of MERCHANT_HINTS) {
    if (row.keys.some((k) => lower.includes(k))) return row.hint;
  }
  return null;
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
      lines.push(`${i + 1}) ${cardShort(r.card)} — 다음 달 기준 충족 (${man(r.cur)}/${man(r.card.performance.prevThreshold)})`);
    } else {
      lines.push(`${i + 1}) ${cardShort(r.card)} — ${man(r.cur)}/${man(r.card.performance.prevThreshold)} · ${man(r.gap)} 부족`);
      lines.push(`   · 채우면 열리는 혜택: ${gatedSummary(r.card, state)}`);
      lines.push(`   · 기대 가치 약 ${won(r.gatedValue)}/월 (추정) · 부족액 대비 ${(r.efficiency * 100).toFixed(1)}%`);
    }
    if (r.prev < r.card.performance.prevThreshold && r.card.performance.prevThreshold > 0) {
      lines.push(`   · 주의: 전월 실적 ${man(r.prev)}로 미달 — 이번 달 혜택은 제한됩니다.`);
      if (r.card.notice) lines.push(`   · ${r.card.notice}`);
    }
  });

  const firstToFill = rows.find((r) => r.gap > 0);
  lines.push('');
  if (firstToFill) {
    lines.push(
      `먼저 채울 카드는 ${cardShort(firstToFill.card)}입니다. ${man(firstToFill.gap)}을 더 쓰면 다음 달 ${won(firstToFill.gatedValue)} 상당 혜택 조건이 열립니다(추정).`,
    );
  } else {
    lines.push('지금은 모든 실적 조건이 채워져 있습니다. 한도 소진만 확인하면 됩니다.');
  }

  return {
    intent: 'performance',
    text: lines.join('\n'),
    followUps: ['이번 달 소멸 예정인 혜택은?', '연회비 대비 효율이 가장 낮은 카드는?', '지방세 내기 좋을 카드'],
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
    followUps: ['이번 달 어떤 카드 실적을 먼저 채워야 하나요?', 'CGV 결제에 유리한 카드'],
  };
}

function cardShort(card: Card): string {
  return card.shortName;
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
    const card = state.cards.find((c) => c.id === r.cardId);
    lines.push(`   · 실적: ${r.performance.threshold === 0 ? '조건 없음' : r.performance.met ? '전월 충족' : '전월 미달'}`);
    lines.push(`   · ${r.futureLabel}`);
    for (const c of r.cautions.slice(0, 2)) lines.push(`   · 주의: ${c}`);
    if (r.promo?.achievable) lines.push(`   · 이벤트: ${r.promo.label} (조건 충족 시 ${won(r.promo.rewardKrw)})`);
    if (card?.notice && i === 0) lines.push(`   · ${card.notice}`);
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

/**
 * 세금·공과금 전용 답변.
 * 보유 카드 대부분이 세금을 '적립 제외'로 두기 때문에 일반 추천 순위로는 아무 의미가 없다.
 * → 실제 약관 데이터로 (1) 적립이 붙는 카드가 있는지, (2) 실적에 잡히는 카드가 있는지를 갈라서 답한다.
 */
function taxAnswer(state: AppState, amount: number, today: Date): AssistantAnswer {
  const results = recommendPayment(state, { amount, category: 'tax', merchant: '지방세' }, today);
  const withBenefit = results.filter((r) => r.immediateKrw > 0);
  const perfIncluded = state.cards.filter((c) => !c.performance.excludedCategories.includes('tax'));
  const perfExcluded = state.cards.filter((c) => c.performance.excludedCategories.includes('tax'));

  const lines: string[] = [`세금·공과금 ${man(amount)} 결제 기준입니다.`, ''];

  if (withBenefit.length === 0) {
    lines.push('적립·할인은 기대하지 않는 게 맞습니다. 보유 카드 전부 세금·공과금을 적립 제외로 두고 있습니다.');
  } else {
    lines.push('세금에도 혜택이 붙는 카드:');
    withBenefit.slice(0, 3).forEach((r, i) => {
      lines.push(`${i + 1}) ${r.cardShort} — 약 ${won(r.immediateKrw)}`);
      if (r.benefitLines[0]) lines.push(`   · ${r.benefitLines[0].label}`);
    });
  }

  lines.push('');
  const perfWithThreshold = perfIncluded.filter((c) => c.performance.prevThreshold > 0);
  const perfNoThreshold = perfIncluded.filter((c) => c.performance.prevThreshold === 0);
  if (perfWithThreshold.length > 0) {
    lines.push('전월 실적에 잡히는 카드(세금을 내면서 실적도 쌓임):');
    for (const c of perfWithThreshold) {
      lines.push(`· ${c.shortName} — ${thresholdText(c)}`);
    }
    lines.push(`→ 다음 달 실적을 채워야 한다면 ${perfWithThreshold.map((c) => c.shortName).join('·')}로 내는 편이 낫습니다.`);
  } else {
    lines.push('전월 실적에 잡히는 카드가 없습니다(모든 카드가 세금을 실적에서 제외).');
  }
  if (perfNoThreshold.length > 0) {
    lines.push('');
    lines.push(`실적 조건 자체가 없어 세금으로 채울 실적이 없는 카드: ${perfNoThreshold.map((c) => c.shortName).join(', ')}`);
  }
  if (perfExcluded.length > 0) {
    lines.push('');
    lines.push(`실적에서도 빠지는 카드: ${perfExcluded.map((c) => c.shortName).join(', ')}`);
  }

  lines.push('');
  lines.push('※ 세금·공과금은 카드사 공통으로 적립 제외가 일반적이고, 무이자할부도 적용되지 않습니다. 자동이체·간편결제 수수료가 붙는지도 함께 확인하세요.');
  return {
    intent: 'tax',
    text: lines.join('\n'),
    followUps: ['이번 달 어떤 카드 실적을 먼저 채워야 하나요?', 'CGV 결제에 유리한 카드', `${man(amount)} 결제 카드 추천`],
  };
}

/** 간편결제 연계 팁 — 영화관·편의점처럼 전용 혜택이 없는 가맹점에서 유용하다. */
function simplePayTip(state: AppState): string[] {
  const lines: string[] = [];
  for (const card of state.cards) {
    const rule = card.benefits.find(
      (b) => b.categories.includes('simplepay') && (b.percent ?? 0) >= 5,
    );
    if (!rule) continue;
    const cap = capKrwOf(rule, state.settings.pointValues);
    lines.push(
      `· ${card.shortName}: 간편결제 ${rule.percent}%${rule.minTransaction ? ` (건당 ${won(rule.minTransaction)} 이상)` : ''}` +
        `${rule.minPrevMonth ? ` · 전월 ${man(rule.minPrevMonth)} 이상` : ''}${cap ? ` · 월 ${won(cap)} 한도` : ''}`,
    );
  }
  return [
    lines.length > 0
      ? '💡 간편결제 팁: 삼성페이·네이버페이 등으로 결제하면 아래 카드 혜택을 받을 수 있습니다(가맹점이 간편결제 명의로 승인될 때).'
      : '💡 간편결제 팁: 이 업종은 카드 전용 혜택이 거의 없습니다. 삼성페이·네이버페이 등 간편결제로 결제하면 간편결제 특화 카드(예: MG+ S 하나 간편결제 10%) 혜택을 받을 수 있으니, 보유 중이라면 앱에 추가해 비교해 보세요.',
    ...lines,
  ];
}

function placeAnswer(state: AppState, question: string, hint: MerchantHint, today: Date): AssistantAnswer {
  if (hint.category === 'tax') {
    const amount = parseAmount(question) ?? hint.defaultAmount;
    return taxAnswer(state, amount, today);
  }

  const answer = merchantAnswer(state, question, hint, today);
  const lines = [answer.text];
  if (hint.note) {
    lines.push('');
    lines.push(`※ ${hint.note}`);
  }
  if ((hint.category === 'general' || hint.category === 'dining') && hint.defaultAmount > 0) {
    const tip = simplePayTip(state);
    if (tip.length > 0) {
      lines.push('');
      lines.push(...tip);
    }
  }
  if (hint.category === 'transit') {
    lines.push('');
    lines.push('※ 교통카드 충전·고속버스는 카드에 따라 실적·적립에서 빠집니다(특히 우리 ALL은 충전 금액 제외).');
  }
  return { ...answer, intent: 'place', text: lines.join('\n') };
}

/**
 * 가맹점·브랜드 질문 전용 답변.
 * ① 가맹점 직접 혜택 → ② 네트워크·카드사 혜택 → ③ 업종 카테고리 혜택 → ④ 기본 적립 순으로 보여 준다.
 * 각 카드마다 왜 유리한지(혜택명·할인/적립률·한도·필요 실적)를 한 줄씩 붙인다.
 */
function merchantAnswer(state: AppState, question: string, hint: MerchantHint, today: Date): AssistantAnswer {
  const parsed = parseAmount(question);
  const amount = parsed ?? hint.defaultAmount;
  const amountText = amount > 0 ? man(amount) : '금액 무관';
  const prevOf = (card: (typeof state.cards)[number]) => prevMonthSpend(card, state.transactions, today);
  const hits = findMerchantPerkHits(state.cards, question, hint.category, amount, prevOf);
  const results = recommendPayment(state, { amount, category: hint.category, merchant: question }, today);

  interface Row {
    card: (typeof state.cards)[number];
    tier: 0 | 1 | 2 | 3;
    score: number;
    reason: string;
    detail: string;
    source: string;
    warning?: string;
    promo?: string;
  }

  const rows: Row[] = [];
  for (const card of state.cards) {
    const rec = results.find((r) => r.cardId === card.id);
    const direct = hits.find((h) => h.card.id === card.id && h.tier === 0);
    const layered = hits.find((h) => h.card.id === card.id && h.tier === 1);
    const promos = activePromos(card, today).filter((p) => p.categories.includes(hint.category));
    const promoLine = promos.length > 0
      ? `이벤트(기간 한정): ${promos[0].label}${promos[0].rewardKrw ? ` — 조건 충족 시 ${won(promos[0].rewardKrw)}` : ''} (~${promos[0].expiresAt})`
      : undefined;

    const buildPerkRow = (hit: MerchantPerkHit, tier: 0 | 1): Row => {
      const { perk } = hit;
      const valueText = hit.valueKrw > 0 ? `약 ${won(hit.valueKrw)}` : perk.valueText ?? '금액화 어려움';
      const bits = [perk.summary];
      if (perk.valueText && hit.valueKrw > 0) bits.push(perk.valueText);
      if (perk.conditions) bits.push(perk.conditions);
      const warning = hit.shortfallKrw > 0
        ? `전월 ${man(perk.minPrevMonth ?? 0)} 미달이면 이 혜택은 적용되지 않습니다(현재 ${man(Math.max(0, (perk.minPrevMonth ?? 0) - hit.shortfallKrw))}).`
        : undefined;
      const dupNote = perk.dedupeKey && hits.some((h) => h !== hit && h.card.id === card.id && h.perk.dedupeKey === perk.dedupeKey && h.tier !== hit.tier)
        ? ' (다른 계층의 같은 혜택은 통합해 하나만 적용)'
        : '';
      return {
        card,
        tier,
        score: hit.valueKrw + (perk.kind === 'access' || perk.kind === 'free' || perk.kind === 'status' ? 1 : 0),
        reason: `${perk.label} — ${valueText}`,
        detail: bits.join(' · ') + dupNote,
        source: LAYER_LABEL[perk.layer],
        warning,
        promo: promoLine,
      };
    };

    if (direct) {
      rows.push(buildPerkRow(direct, 0));
      continue;
    }
    if (layered) {
      rows.push(buildPerkRow(layered, 1));
      continue;
    }
    if (rec && rec.immediateKrw > 0) {
      const m = rec.performance.met;
      rows.push({
        card,
        tier: 2,
        score: rec.immediateKrw,
        reason: `${rec.bestLabel} — 약 ${won(rec.immediateKrw)}`,
        detail: `${(rec.bestRatePercent).toFixed(2)}% · ${rec.performance.threshold === 0 ? '전월 실적 조건 없음' : `전월 ${man(rec.performance.threshold)}${m ? ' 충족' : ' 미달'}`}`,
        source: '카드',
        warning: !m ? `전월 ${man(rec.performance.threshold)} 미달이면 이 혜택은 적용되지 않습니다.` : undefined,
        promo: promoLine,
      });
      continue;
    }
    const fallbackRate = Math.max(
      0,
      ...card.benefits
        .filter((b) => b.categories.includes(hint.category))
        .filter((b) => !b.keywords || b.keywords.length === 0)
        .map((b) => (b.earnType === 'percent' ? (b.percent ?? 0) / 100 : 0)),
    );
    if (fallbackRate > 0) {
      rows.push({
        card,
        tier: 3,
        score: fallbackRate * 100,
        reason: `기본 적립 ${(fallbackRate * 100).toFixed(2)}%`,
        detail: `${amountText} 결제 시 약 ${won(amount * fallbackRate)}${rec && !rec.performance.met && rec.performance.threshold > 0 ? ` · 전월 ${man(rec.performance.threshold)} 필요` : ''}`,
        source: '카드',
        warning: rec && !rec.performance.met && rec.performance.threshold > 0 ? `전월 ${man(rec.performance.threshold)} 미달이면 기본 적립이 적용되지 않을 수 있습니다.` : undefined,
        promo: promoLine,
      });
      continue;
    }
    rows.push({
      card,
      tier: 3,
      score: 0,
      reason: '이 업종 혜택 없음',
      detail: '실적·한도만 확인하세요.',
      source: '카드',
      promo: promoLine,
    });
  }

  rows.sort((a, b) => (a.tier !== b.tier ? a.tier - b.tier : b.score - a.score));
  rows.forEach((r) => {
    r.warning = r.warning ?? undefined;
  });

  const tier0 = rows.filter((r) => r.tier === 0);
  const tier1 = rows.filter((r) => r.tier === 1);
  const tier2 = rows.filter((r) => r.tier === 2);
  const tier3 = rows.filter((r) => r.tier === 3 && r.score > 0);

  const lines: string[] = [
    amount > 0
      ? `"${hint.label}" ${amountText} 결제 기준입니다.${parsed ? '' : ` (금액을 말하지 않아 ${amountText}으로 계산)`}`
      : `"${hint.label}" 기준입니다. (결제금액과 무관하게 이용 조건으로 비교)`,
    '',
  ];

  if (tier0.length === 0) {
    if (tier1.length === 0) {
      lines.push(`전용 혜택 없음 — "${hint.label}"에 직접 적용되는 가맹점 혜택이 확인되지 않았습니다.`);
      lines.push('대신 업종·기본 적립 기준으로 아래 카드가 낫습니다.');
    } else {
      lines.push(`가맹점 전용 혜택은 확인되지 않았습니다. 대신 네트워크·카드사 혜택이 있는 카드를 위에 두었습니다.`);
    }
    lines.push('');
  }

  const section = (title: string, list: Row[], limit: number) => {
    if (list.length === 0) return;
    lines.push(title);
    list.slice(0, limit).forEach((r, i) => {
      lines.push(`${i + 1}) ${r.card.shortName} — ${r.reason}  [${r.source}]`);
      if (r.detail) lines.push(`   · ${r.detail}`);
      if (r.warning) lines.push(`   · ⚠ ${r.warning}`);
      if (r.promo) lines.push(`   · ${r.promo}`);
    });
    if (list.length > limit) lines.push(`   외 ${list.length - limit}개 카드는 카드 탭에서 확인할 수 있습니다.`);
    lines.push('');
  };

  section('① 가맹점 직접 혜택이 있는 카드', tier0, 4);
  section('② 네트워크·카드사 혜택이 있는 카드', tier1, 3);
  if (amount > 0) {
    section('③ 업종 혜택 기준', tier2, 3);
    section('④ 기본 적립 기준', tier3, 2);
  }

  lines.push('※ 출처 라벨: [네트워크]=브랜드사, [카드사]=발급사 선택서비스, [카드]=상품 고유 혜택, [가맹점]=특정 가맹점 혜택, [직접 추가]=내가 등록한 혜택.');
  lines.push('※ 라운지·발렛처럼 횟수로 주는 혜택은 금액화하지 않고 순서만 위에 두었습니다. 예시 데이터가 있으면 ⚠표시와 함께 카드사 공식 약관을 확인하세요.');

  return {
    intent: 'place',
    text: lines.join('\n'),
    followUps: ['이번 달 어떤 카드 실적을 먼저 채워야 하나요?', '이번 달 소멸 예정인 혜택은?', '지방세 내기 좋을 카드'],
  };
}

function splitAnswer(state: AppState, question: string, today: Date): AssistantAnswer {
  const amount = parseAmount(question) ?? 1_000_000;
  const hint = findMerchantHint(question);
  const guessed = hint ? hint.category : guessCategory(question);
  const category = guessed === 'general' ? 'overseas' : guessed;
  const plan = simulateSplit(state, { amount, category, merchant: '분할 결제' }, today);
  const lines: string[] = [];
  lines.push(`${man(amount)} 결제를 1만 원 단위로 나눠 배분했을 때입니다. (업종: ${CATEGORY_LABEL[category]})`);
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

export const ASSISTANT_SUGGESTIONS = [
  '이번 달 어떤 카드 실적을 먼저 채워야 하나요?',
  '이번 달 소멸 예정인 혜택은?',
  '지방세 내기 좋을 카드',
  'CGV 결제에 유리한 카드',
  '스타벅스 카드 추천',
  '면세점 결제 유리한 카드',
  '공항 라운지 되는 카드',
  '해외에서 어떤 카드를 써야 하나요?',
  '100만 원 분할 결제 유리한가?',
  '연회비 대비 효율이 가장 낮은 카드는?',
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
  if (/(카드 목록|보유 카드|내 카드)/.test(q)) {
    const lines = ['보유 카드 목록입니다.', ''];
    for (const card of state.cards) {
      lines.push(`· ${card.name} (${card.issuer} ${card.network}) — 연회비 ${won(card.annualFee)}, ${thresholdText(card)}`);
    }
    return { intent: 'cards', text: lines.join('\n'), followUps: ASSISTANT_SUGGESTIONS.slice(0, 3) };
  }

  // 가맹점·업종 키워드가 있으면 금액이 없어도 기본 금액으로 비교한다.
  const hint = findMerchantHint(q);
  if (hint) {
    // 호텔은 '결제/추천' 없이 브랜드만 물으면 보유 혜택 안내가 더 유용하다.
    if (hint.category === 'hotel' && /(힐튼|메리어트)/.test(q) && !/(결제|추천|유리|좋|쓸|쓸까|어디)/.test(q)) {
      return hotelAnswer(state, q, today);
    }
    return placeAnswer(state, q, hint, today);
  }

  if (/(해외|일본|유럽|미국|달러|엔화|여행)/.test(q)) return overseasAnswer(state, q, today);

  if (/(추천|유리|좋을|좋은|어떤 카드|어디에|어디서|쓸까)/.test(lower)) {
    // 가맹점을 못 알아본 경우: 일반 결제로 비교하고 무엇을 몰랐는지 밝힌다.
    const amount = parseAmount(q) ?? 100_000;
    const text = recommendText(
      state,
      'general',
      amount,
      q,
      today,
      `업종을 특정하지 못해 '일반' ${man(amount)} 결제로 비교했습니다. 가맹점 이름을 함께 적으면 더 정확합니다.`,
    );
    return {
      intent: 'place',
      text,
      followUps: ['지방세 내기 좋을 카드', 'CGV 결제에 유리한 카드', '스타벅스 카드 추천'],
    };
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
