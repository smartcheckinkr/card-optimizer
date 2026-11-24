import { describe, expect, it } from 'vitest';
import { createSeedState } from '../data/seed';
import { evaluateCardPayment, recommendPayment, simulateSplit } from './recommend';
import { currentMonthSpend, performanceStatus, prevMonthSpend, spendBreakdown } from './performance';
import { askAssistant } from './assistant';
import { exportTransactionsCsv, importTransactionsCsv } from '../services/csv';
import { exportStateJson, importStateJson } from '../services/storage';
import type { AppState, Transaction } from '../types';
import { CATALOG, CATALOG_BY_ID, catalogToCard, searchCatalog, walletItemsFromHints } from '../data/catalog';
import { dedupePerks, findMerchantPerkHits, promoActive, promosState } from './perks';
import type { Perk } from '../types';

// 기준일: 2026-11-24 (전월 10월 / 당월 11월)
const today = new Date(2026, 10, 24, 12, 0, 0);
const base = (): AppState => createSeedState(today);
const cardOf = (state: AppState, id: string) => state.cards.find((c) => c.id === id)!;

function withTransaction(state: AppState, tx: Partial<Transaction> & { cardId: string; amount: number; date: string }): AppState {
  const next: Transaction = {
    id: `t-${Math.random().toString(36).slice(2)}`,
    merchant: '테스트',
    category: 'general',
    status: 'active',
    createdAt: today.toISOString(),
    ...tx,
  };
  return { ...state, transactions: [...state.transactions, next] };
}

describe('시드 데이터 기준일 계산', () => {
  it('전월·당월 인정 실적을 월 단위로 분리한다', () => {
    const state = base();
    const marriott = cardOf(state, 'marriott-bonvoy-shinhan');
    expect(prevMonthSpend(marriott, state.transactions, today)).toBe(450_000);
    expect(currentMonthSpend(marriott, state.transactions, today)).toBe(300_000);
    const status = performanceStatus(marriott, state.transactions, today);
    expect(status.met).toBe(true);
    expect(status.currentSpend).toBe(300_000);
  });

  it('전월 실적 미달 카드(현대 300, 기준 50만 원)를 미달로 판정한다', () => {
    const state = base();
    const hyundai = cardOf(state, 'hyundai-koreanair-300');
    const status = performanceStatus(hyundai, state.transactions, today);
    expect(hyundai.performance.prevThreshold).toBe(500_000);
    expect(status.prevSpend).toBe(420_000);
    expect(status.met).toBe(false);
    expect(status.shortfall).toBe(80_000);
  });
});

describe('신세계백화점 30만 원', () => {
  const state = base();
  const results = recommendPayment(state, { amount: 300_000, category: 'department', merchant: '신세계백화점' }, today);

  it('디지로카 스카이패스가 1위(4,500원 · 국내 1마일)로 계산된다', () => {
    expect(results[0].cardShort).toBe('디지로카 스카이패스');
    expect(results[0].immediateKrw).toBe(4_500);
    expect(results[0].rank).toBe(1);
  });

  it('메리어트·삼성은 3,000원, 힐튼은 국내 1,500원당 2P로 2,800원이다', () => {
    const marriott = results.find((r) => r.cardId === 'marriott-bonvoy-shinhan')!;
    const samsung = results.find((r) => r.cardId === 'samsung-amex-platinum-legacy')!;
    const hilton = results.find((r) => r.cardId === 'lotte-hilton-amex')!;
    expect(marriott.immediateKrw).toBe(3_000);
    expect(samsung.immediateKrw).toBe(3_000);
    expect(hilton.immediateKrw).toBe(2_800);
  });

  it('즉시 혜택과 향후 실적 기여를 별도 필드로 분리한다', () => {
    const hyundai = results.find((r) => r.cardId === 'hyundai-koreanair-300')!;
    expect(hyundai.immediateKrw).toBe(0);
    expect(hyundai.futureValueKrw).toBeGreaterThan(0);
    // 즉시 혜택에는 미래 가치가 합산되지 않는다
    expect(hyundai.immediateKrw + hyundai.futureValueKrw).toBe(hyundai.futureValueKrw);
    expect(hyundai.futureLabel).toContain('추정');
  });
});

describe('대한항공 공홈 150만 원', () => {
  const state = base();
  const results = recommendPayment(state, { amount: 1_500_000, category: 'airline', merchant: '대한항공' }, today);

  it('전월 실적을 채운 메리어트 본보이가 1위(45,000원 · 직판 3P)', () => {
    // 현대 300은 직판 3마일이 더 크지만 전월 50만 원 미달로 0원이다
    expect(results[0].cardId).toBe('marriott-bonvoy-shinhan');
    expect(results[0].immediateKrw).toBe(45_000);
    expect(results[0].performance.met).toBe(true);
  });

  it('힐튼 28,000원 · 디지로카 22,500원 · 삼성 15,000원 순', () => {
    expect(results.find((r) => r.cardId === 'lotte-hilton-amex')!.immediateKrw).toBe(28_000);
    expect(results.find((r) => r.cardId === 'lotte-digiroca-skypass')!.immediateKrw).toBe(22_500);
    expect(results.find((r) => r.cardId === 'samsung-amex-platinum-legacy')!.immediateKrw).toBe(15_000);
  });

  it('전월 실적 미달 현대 300은 즉시 혜택 0 + 주의사항 표시', () => {
    const hyundai = results.find((r) => r.cardId === 'hyundai-koreanair-300')!;
    expect(hyundai.immediateKrw).toBe(0);
    expect(hyundai.performance.met).toBe(false);
    expect(hyundai.cautions.join(' ')).toContain('전월 실적 미달');
  });

  it('메리어트 기본적립은 실적과 무관하게 1P가 유지된다', () => {
    const marriott = results.find((r) => r.cardId === 'marriott-bonvoy-shinhan')!;
    expect(marriott.benefitLines.some((l) => l.label.includes('국내 가맹점 1,000원당 1P'))).toBe(true);
  });

  it('디지로카 해외 80만 원 이벤트는 조건 충족 시 별도 표기된다', () => {
    const digiroca = results.find((r) => r.cardId === 'lotte-digiroca-skypass')!;
    expect(digiroca.promo).toBeDefined();
    expect(digiroca.promo!.achievable).toBe(true);
    expect(digiroca.promo!.rewardKrw).toBe(110_000);
    expect(digiroca.promo!.progressAfter).toBeGreaterThanOrEqual(800_000);
  });

  it('카드사 직판 조건을 주의사항으로 안내한다', () => {
    expect(results[0].cautions.join(' ')).toContain('직접 입력');
  });
});

describe('월 한도 초과', () => {
  it('삼성 아멕스 면세점 5%는 잔여 한도(80,000원)까지만 반영된다', () => {
    const state = base();
    const samsung = cardOf(state, 'samsung-amex-platinum-legacy');
    const rec = evaluateCardPayment(samsung, state, { amount: 3_000_000, category: 'dutyfree', merchant: '롯데면세점' }, today);
    // 5% = 150,000원이지만 월 한도 100,000 - 기사용 20,000 = 80,000
    expect(rec.immediateKrw).toBe(80_000);
    expect(rec.benefitLines[0].capped).toBe(true);
    expect(rec.cautions.join(' ')).toContain('한도');
  });

  it('기사용 혜택이 없으면 한도 전액(100,000원)까지 반영된다', () => {
    const state = base();
    state.cards = state.cards.map((c) => (c.id === 'samsung-amex-platinum-legacy' ? { ...c, usage: {} } : c));
    const rec = evaluateCardPayment(cardOf(state, 'samsung-amex-platinum-legacy'), state, {
      amount: 3_000_000,
      category: 'dutyfree',
      merchant: '롯데면세점',
    }, today);
    expect(rec.immediateKrw).toBe(100_000);
  });
});

describe('실적 미달 · 취소 반영', () => {
  it('직전 결제를 취소하면 전월 실적이 줄고 항공 혜택이 막힌다', () => {
    const state = base();
    const marriott = cardOf(state, 'marriott-bonvoy-shinhan');
    const target = state.transactions.find((t) => t.cardId === marriott.id && t.date.startsWith('2026-10') && t.amount === 250_000)!;
    const canceled: AppState = {
      ...state,
      transactions: state.transactions.map((t) => (t.id === target.id ? { ...t, status: 'canceled' } : t)),
    };
    expect(prevMonthSpend(marriott, canceled.transactions, today)).toBe(200_000);

    const rec = evaluateCardPayment(marriott, canceled, { amount: 1_500_000, category: 'airline', merchant: '대한항공' }, today);
    expect(rec.performance.met).toBe(false);
    // 특별적립(직판 3P)은 막히지만, 기본적립 1P는 실적 조건이 없어 유지된다
    expect(rec.immediateKrw).toBe(15_000);
    expect(rec.cautions.join(' ')).toContain('전월 실적 미달');

    // 대신 힐튼 아너스가 1위가 된다
    const results = recommendPayment(canceled, { amount: 1_500_000, category: 'airline', merchant: '대한항공' }, today);
    expect(results[0].cardShort).toBe('힐튼 아너스');
  });

  it('세금·공과금은 실적 제외로 표시된 카드에서 빠진다 (ALL 인피니트)', () => {
    const state = base();
    const all = { ...catalogToCard(CATALOG_BY_ID['woori-all-infinite'], { id: 'all-tax' }) };
    const withTax = withTransaction(state, { cardId: all.id, amount: 500_000, date: '2026-11-20', category: 'tax', merchant: '국세청' });
    const breakdown = spendBreakdown(all, withTax.transactions, '2026-11');
    expect(all.performance.excludedCategories).toContain('tax');
    expect(breakdown.recognized).toBe(0);
    expect(breakdown.exclusion.category).toBe(500_000);
  });

  it('메리어트 신한은 세금·공과금도 전월 실적에 포함한다(약관: 실적 제외 아님)', () => {
    const state = base();
    const marriott = cardOf(state, 'marriott-bonvoy-shinhan');
    const withTax = withTransaction(state, { cardId: marriott.id, amount: 300_000, date: '2026-10-20', category: 'tax', merchant: '국세청' });
    expect(marriott.performance.excludedCategories).not.toContain('tax');
    expect(prevMonthSpend(marriott, withTax.transactions, today)).toBe(750_000);
  });

  it('건당 최소 인정금액 미만 결제는 실적에서 제외된다 (디지로카 1,000원)', () => {
    const state = base();
    const digiroca = catalogToCard(CATALOG_BY_ID['lotte-digiroca-skypass'], { id: 'digiroca-min' });
    const withSmall = withTransaction(state, { cardId: digiroca.id, amount: 500, date: '2026-11-21', category: 'dining', merchant: '커피' });
    const breakdown = spendBreakdown(digiroca, withSmall.transactions, '2026-11');
    expect(digiroca.performance.minPerTransaction).toBe(1_000);
    expect(breakdown.recognized).toBe(0);
    expect(breakdown.exclusion.minAmount).toBe(500);
  });

  it('건당 최소금액이 없는 카드는 소액 결제도 실적에 들어간다 (메리어트)', () => {
    const state = base();
    const marriott = cardOf(state, 'marriott-bonvoy-shinhan');
    const withSmall = withTransaction(state, { cardId: marriott.id, amount: 500, date: '2026-11-21', category: 'dining', merchant: '커피' });
    expect(spendBreakdown(marriott, withSmall.transactions, '2026-11').recognized).toBe(300_500);
  });

  it('이번 결제가 다음 달 실적을 채우면 충족 상태로 표시된다', () => {
    const state = base();
    const hyundai = cardOf(state, 'hyundai-koreanair-300');
    const rec = evaluateCardPayment(hyundai, state, { amount: 1_000_000, category: 'department', merchant: '신세계백화점' }, today);
    expect(rec.performance.nextMetBefore).toBe(false);
    expect(rec.performance.nextMetAfter).toBe(true);
    expect(rec.futureValueKrw).toBeGreaterThan(0);
    expect(rec.futureLabel).toContain('실적 충족');
  });
});

describe('분할 결제 시뮬레이션', () => {
  it('한도 없는 카드가 최적인 해외 100만 원은 분할 이득이 없다', () => {
    const state = base();
    const plan = simulateSplit(state, { amount: 1_000_000, category: 'overseas', merchant: '해외' }, today);
    expect(plan.allocations).toHaveLength(1);
    expect(plan.splitUseful).toBe(false);
    expect(plan.totalBenefitKrw).toBe(plan.singleBest!.benefitKrw);
  });

  it('면세점 300만 원은 한도 카드 + 무한도 카드 분할이 유리하다', () => {
    const state = base();
    const plan = simulateSplit(state, { amount: 3_000_000, category: 'dutyfree', merchant: '롯데면세점' }, today);
    const allocated = plan.allocations.reduce((s, a) => s + a.amount, 0);
    expect(allocated).toBe(3_000_000);
    expect(plan.allocations.length).toBeGreaterThan(1);
    expect(plan.totalBenefitKrw).toBeGreaterThan(plan.singleBest!.benefitKrw);
    expect(plan.splitUseful).toBe(true);
  });
});

describe('CSV 가져오기 / 내보내기', () => {
  const state = base();
  const csv = [
    '날짜,카드,가맹점,업종,금액,상태,메모',
    '2026-11-20,메리어트 본보이,신세계백화점,백화점,300000,정상,테스트',
    '2026-11-21,삼성 아멕스 플래티늄,롯데면세점,면세점,500000,취소,',
  ].join('\n');

  it('한글 헤더·카드 별칭·취소 상태를 읽는다', () => {
    const result = importTransactionsCsv(csv, state.cards, today);
    expect(result.errors).toHaveLength(0);
    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0].cardId).toBe('marriott-bonvoy-shinhan');
    expect(result.transactions[0].category).toBe('department');
    expect(result.transactions[0].amount).toBe(300_000);
    expect(result.transactions[1].status).toBe('canceled');
  });

  it('알 수 없는 카드는 오류로 남기고 나머지는 가져온다', () => {
    const bad = '날짜,카드,가맹점,업종,금액,상태\n2026-11-20,없는카드,가게,일반,10000,정상';
    const result = importTransactionsCsv(bad, state.cards, today);
    expect(result.transactions).toHaveLength(0);
    expect(result.errors[0]).toContain('카드를 찾지 못했습니다');
  });

  it('CSV로 내보낸 뒤 다시 읽을 수 있다', () => {
    const out = exportTransactionsCsv(state.cards, state.transactions);
    const back = importTransactionsCsv(out, state.cards, today);
    expect(back.transactions.length).toBeGreaterThanOrEqual(state.transactions.length - 1);
    expect(back.errors).toHaveLength(0);
  });
});

describe('AI 비서 (로컬 규칙 엔진)', () => {
  const state = base();

  it('실적 우선순위 질문에 부족액과 기대 가치를 계산해 답한다', () => {
    const answer = askAssistant('이번 달 어떤 카드 실적을 먼저 채워야 하나요?', state, today);
    expect(answer.intent).toBe('performance');
    expect(answer.text).toContain('대한항공 300');
    expect(answer.text).toContain('부족');
  });

  it('소멸 예정 혜택 질문에 D-day 목록을 답한다', () => {
    const answer = askAssistant('이번 달 소멸 예정인 혜택은?', state, today);
    expect(answer.intent).toBe('expiring');
    expect(answer.text).toContain('FHR');
    expect(answer.text).toContain('D-');
  });

  it('해외 결제 질문은 메리어트·디지로카(동률)를 상위로 계산한다', () => {
    const answer = askAssistant('해외에서 어떤 카드를 써야 하나요?', state, today);
    expect(answer.intent).toBe('overseas');
    // 해외 3P(1P=10원)와 2마일(1마일=15원)이 같은 3%라 50만 원에서는 동률이다
    expect(answer.text).toContain('메리어트 본보이');
    expect(answer.text).toContain('디지로카 스카이패스');
  });

  it('분할 결제 질문은 배분안과 주의사항을 답한다', () => {
    const answer = askAssistant('100만 원 분할 결제 유리한가?', state, today);
    expect(answer.intent).toBe('split');
    expect(answer.text).toContain('분할');
    expect(answer.text).toContain('주의');
  });

  it('연회비 효율 질문에 카드별 배수를 계산한다', () => {
    const answer = askAssistant('연회비 대비 효율이 가장 낮은 카드는?', state, today);
    expect(answer.intent).toBe('annual-fee');
    expect(answer.text).toContain('연회비');
  });

  it('해석하지 못한 질문은 LLM 미연동을 투명하게 알린다', () => {
    const answer = askAssistant('오늘 기분 어때', state, today);
    expect(answer.intent).toBe('unknown');
    expect(answer.text).toContain('외부 LLM');
  });
});

describe('카드 카탈로그', () => {
  it('보유 10종 + 인기 카드까지 14종 이상을 수록한다', () => {
    expect(CATALOG.length).toBeGreaterThanOrEqual(14);
    const required = [
      'shinhan-marriott-bonvoy-best',
      'lotte-hilton-amex',
      'lotte-digiroca-skypass',
      'hyundai-koreanair-300',
      'samsung-amex-platinum-legacy',
      'woori-all-infinite',
      'samsung-id-ev',
      'hana-green',
      'mg-s-hana',
      'bc-green',
    ];
    for (const id of required) expect(CATALOG_BY_ID[id], id).toBeDefined();
    // 인기 카드(네이버페이·현대카드M·트래블로그 등)
    expect(searchCatalog('네이버페이').length).toBeGreaterThan(0);
    expect(searchCatalog('트래블로그').length).toBeGreaterThan(0);
  });

  it('카드명·카드사·키워드로 검색된다', () => {
    expect(searchCatalog('아코르')[0].id).toBe('woori-all-infinite');
    expect(searchCatalog('iD EV')[0].id).toBe('samsung-id-ev');
    expect(searchCatalog('힐튼')[0].id).toBe('lotte-hilton-amex');
    expect(searchCatalog('신한')[0].issuer).toBe('신한카드');
    expect(searchCatalog('면세점').some((c) => c.id === 'samsung-amex-platinum-legacy')).toBe(true);
    expect(searchCatalog('없는카드검색')).toHaveLength(0);
    expect(searchCatalog('호텔').every((c) => c.tags.includes('호텔'))).toBe(true);
  });

  it('선택하면 연회비·실적·혜택·신뢰도가 모두 채워진다', () => {
    const entry = CATALOG_BY_ID['woori-all-infinite'];
    const card = catalogToCard(entry);
    expect(card.catalogId).toBe('woori-all-infinite');
    expect(card.name).toBe(entry.name);
    expect(card.annualFee).toBe(500_000);
    // 기본 적립은 실적 무관이지만 특별적립·프리미엄 서비스는 전월 50만 원이 기준이다
    expect(card.performance.prevThreshold).toBe(500_000);
    expect(card.performance.thresholdScope).toContain('특별적립');
    expect(card.performance.excludedCategories).toContain('tax');
    expect(card.performance.excludedKeywords).toContain('교통카드 충전');
    expect(card.benefitExclusions?.categories).toContain('tax');
    expect(card.performance.conditions?.some((c) => c.amount === 0)).toBe(true);
    expect(card.performance.conditions?.some((c) => c.amount === 500_000)).toBe(true);
    expect(card.benefits.length).toBe(entry.benefits.length);
    expect(card.benefits.some((b) => b.minPrevMonth === 500_000)).toBe(true);
    expect(card.verification).toBe('official');
    expect(card.usage).toEqual({});
    expect(card.manual).toEqual({ prevMonthAdjustment: 0, currentMonthAdjustment: 0 });
  });

  it('대표 바우처를 지갑 항목으로 만들 수 있다', () => {
    const items = walletItemsFromHints(CATALOG_BY_ID['shinhan-marriott-bonvoy-best'], 'card-x', today);
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.cardId === 'card-x')).toBe(true);
    expect(items.some((i) => i.title.includes('숙박권'))).toBe(true);
    expect(items.every((i) => i.remaining === i.total)).toBe(true);
  });

  it('태그가 실제 조건과 모순되지 않는다', () => {
    for (const card of CATALOG) {
      if (card.tags.includes('연회비 없음')) expect(card.annualFee, card.id).toBe(0);
      if (card.tags.includes('무실적')) expect(card.performance.prevThreshold, card.id).toBe(0);
    }
  });

  it('카탈로그에는 결제 인증정보·연락처가 없다', () => {
    const text = JSON.stringify(CATALOG);
    expect(text).not.toMatch(/\d{3}-\d{3,4}-\d{4}/); // 전화번호
    expect(text).not.toMatch(/\d{13,19}/); // 카드번호
    expect(text).not.toMatch(/@/); // 이메일
    for (const card of CATALOG) expect(Object.keys(card)).not.toContain('last4');
  });

  it('시드 카드 5장은 모두 카탈로그와 연결되어 있다', () => {
    for (const card of base().cards) {
      expect(card.catalogId, card.id).toBeDefined();
      expect(CATALOG_BY_ID[card.catalogId!], card.id).toBeDefined();
    }
  });
});

describe('카탈로그 카드 계산', () => {
  it('iD EV 전기차 충전 5만 원은 50%·월 2만 원 한도로 20,000원', () => {
    const state = base();
    const card = {
      ...catalogToCard(CATALOG_BY_ID['samsung-id-ev'], { id: 'ev-card' }),
      manual: { prevMonthAdjustment: 300_000, currentMonthAdjustment: 0 },
    };
    state.cards = [card];
    const rec = evaluateCardPayment(card, state, { amount: 50_000, category: 'ev', merchant: '테슬라 수퍼차저' }, today);
    expect(rec.immediateKrw).toBe(20_000);
    expect(rec.benefitLines[0].capped).toBe(true);
  });

  it('ALL 인피니트 아코르 호텔 300만 원은 통합 4,000P 한도로 120,000원', () => {
    const state = base();
    const card = {
      ...catalogToCard(CATALOG_BY_ID['woori-all-infinite'], { id: 'all-card' }),
      manual: { prevMonthAdjustment: 500_000, currentMonthAdjustment: 0 },
    };
    state.cards = [card];
    const rec = evaluateCardPayment(card, state, { amount: 3_000_000, category: 'hotel', merchant: '노보텔 앰배서더 서울' }, today);
    expect(rec.immediateKrw).toBe(120_000);
  });

  it('현대카드M은 세금·공과금을 실적에서 제외한다(약관: 공과금 납부액 제외)', () => {
    const state = base();
    const card = catalogToCard(CATALOG_BY_ID['hyundai-m'], { id: 'm-card' });
    state.cards = [card];
    state.transactions = [{ id: 't', cardId: 'm-card', merchant: '국세청', category: 'tax', amount: 600_000, date: '2026-10-10', status: 'active', createdAt: today.toISOString() }];
    expect(card.performance.excludedCategories).toContain('tax');
    expect(performanceStatus(card, state.transactions, today).met).toBe(false);
    expect(spendBreakdown(card, state.transactions, '2026-10').exclusion.category).toBe(600_000);
  });
});

describe('저장 · 복원', () => {
  it('JSON 내보내기/불러오기 왕복이 유지된다', () => {
    const state = base();
    const json = exportStateJson(state);
    const restored = importStateJson(json);
    expect(restored.cards).toHaveLength(state.cards.length);
    expect(restored.transactions).toHaveLength(state.transactions.length);
    expect(restored.settings.pointValues.skypass).toBe(15);
  });

  it('깨진 JSON은 한국어 오류로 거부한다', () => {
    expect(() => importStateJson('{oops')).toThrow('JSON을 읽을 수 없습니다');
  });

  it('구버전 샘플 카드는 상품 조건만 갱신하고 사용 기록은 보존한다', () => {
    const raw = JSON.parse(exportStateJson(base()));
    const digiroca = raw.cards.find((c: { id: string }) => c.id === 'lotte-digiroca-skypass');
    delete digiroca.catalogId;
    digiroca.annualFee = 200_000; // 구버전 예시값
    digiroca.usage = { 'digiroca-domestic': 7_500 };
    digiroca.memo = '내 메모';

    const restored = importStateJson(JSON.stringify(raw));
    const upgraded = restored.cards.find((c) => c.id === 'lotte-digiroca-skypass')!;
    expect(upgraded.annualFee).toBe(20_000);
    expect(upgraded.catalogId).toBe('lotte-digiroca-skypass');
    expect(upgraded.usage).toEqual({ 'digiroca-domestic': 7_500 });
    expect(upgraded.memo).toBe('내 메모');
    expect(upgraded.changeHistory.some((h) => h.text.includes('카탈로그'))).toBe(true);
  });

  it('빠진 설정 필드는 기본값으로 보정한다', () => {
    const state = base();
    const partial = JSON.parse(exportStateJson(state));
    delete partial.settings;
    const restored = importStateJson(JSON.stringify(partial));
    expect(restored.settings.pointValues.bonvoy).toBe(10);
  });
});

describe('약관 정밀 보정 (v2)', () => {
  it('ALL 인피니트 특별적립은 아코르·해외가 통합 4,000P 한도를 함께 쓴다', () => {
    const state = base();
    const card = {
      ...catalogToCard(CATALOG_BY_ID['woori-all-infinite'], { id: 'all-shared' }),
      manual: { prevMonthAdjustment: 500_000, currentMonthAdjustment: 0 },
    };
    state.cards = [card];
    const hotel = evaluateCardPayment(card, state, { amount: 3_000_000, category: 'hotel', merchant: '노보텔 앰배서더' }, today);
    // 3,000,000/3,000 × 5P = 5,000P 이지만 통합 한도 4,000P(≈120,000원)까지만
    expect(hotel.immediateKrw).toBe(120_000);
    expect(hotel.benefitLines[0].capped).toBe(true);

    // 이미 아코르 특별적립으로 한도를 다 쓴 상태라면 해외 특별적립은 0 (같은 4,000P 묶음)
    state.cards = [{ ...card, usage: { 'all-hotel': 120_000 } }];
    const after = evaluateCardPayment(state.cards[0], state, { amount: 3_000_000, category: 'overseas', merchant: '해외 가맹점' }, today);
    expect(after.immediateKrw).toBe(0);
  });

  it('ALL 인피니트 기본적립은 실적 미달이어도 유지되고 특별적립만 막힌다', () => {
    const state = base();
    const card = catalogToCard(CATALOG_BY_ID['woori-all-infinite'], { id: 'all-base' });
    state.cards = [card];
    const hotel = evaluateCardPayment(card, state, { amount: 300_000, category: 'hotel', merchant: '노보텔 앰배서더' }, today);
    // 전월 실적 0 → 특별적립(5P) 불가, 기본 1.3P만 적용
    expect(hotel.performance.met).toBe(false);
    expect(hotel.benefitLines[0].label).toContain('국내 가맹점');
    expect(hotel.immediateKrw).toBeGreaterThan(0);
  });

  it('적립 제외 업종은 실적에는 들어가지만 혜택은 0이다', () => {
    const state = base();
    const card = catalogToCard(CATALOG_BY_ID['shinhan-marriott-bonvoy-best'], { id: 'marriott-excl' });
    state.cards = [card];
    const rec = evaluateCardPayment(card, state, { amount: 500_000, category: 'tax', merchant: '지방세' }, today);
    expect(rec.immediateKrw).toBe(0);
    expect(rec.cautions.join(' ')).toContain('적립·할인 제외');
  });

  it('실적 제외 업종 칩이 카드사 약관대로 채워져 있다', () => {
    const all = CATALOG_BY_ID['woori-all-infinite'];
    expect(all.performance.excludedCategories).toEqual(['tax']);
    expect(all.performance.excludedKeywords).toContain('교통카드 충전');

    const idEv = CATALOG_BY_ID['samsung-id-ev'];
    expect(idEv.performance.excludedCategories).toEqual(expect.arrayContaining(['tax', 'transit']));
    expect(idEv.performance.excludedKeywords).toContain('하이패스');

    const green = CATALOG_BY_ID['hana-green'];
    expect(green.performance.excludedCategories).toEqual(expect.arrayContaining(['tax', 'transit', 'overseas']));

    const hilton = CATALOG_BY_ID['lotte-hilton-amex'];
    expect(hilton.performance.excludedCategories).toEqual(expect.arrayContaining(['tax', 'transit']));
  });

  it('모든 카탈로그 카드가 전월 실적 갈래(conditions)와 안내문을 갖는다', () => {
    for (const card of CATALOG) {
      expect(card.performance.conditions?.length, card.id).toBeGreaterThan(0);
      expect(card.notice, card.id).toBeTruthy();
      if (card.benefits.some((b) => b.minPrevMonth)) {
        expect(card.performance.prevThreshold, card.id).toBeGreaterThan(0);
      }
      expect(card.benefitExclusions?.keywords.length ?? 0, card.id).toBeGreaterThan(0);
      const perfKeywords = card.performance.excludedKeywords ?? [];
      expect(new Set(perfKeywords).size, card.id).toBe(perfKeywords.length);
      const benefitKeywords = card.benefitExclusions?.keywords ?? [];
      expect(new Set(benefitKeywords).size, card.id).toBe(benefitKeywords.length);
    }
  });

  it('저장된 카드의 제외 키워드도 중복 없이 정리된다', () => {
    const state = base();
    state.cards = state.cards.map((c) =>
      c.id === 'marriott-bonvoy-shinhan'
        ? { ...c, performance: { ...c.performance, excludedKeywords: ['상품권', '상품권', '등록금'] } }
        : c,
    );
    const restored = importStateJson(exportStateJson(state));
    const card = restored.cards.find((c) => c.id === 'marriott-bonvoy-shinhan')!;
    expect(card.performance.excludedKeywords).toEqual(['상품권', '등록금']);
  });

  it('저장된 카드(v1)는 최신 약관으로 자동 갱신되고 사용자 값은 유지된다', () => {
    const raw = JSON.parse(exportStateJson(base()));
    const all = raw.cards.find((c: { id: string }) => c.id === 'marriott-bonvoy-shinhan');
    // v1 저장본: 해외/면세점이 없고 실적 갈래·안내·제외 목록이 비어 있던 상태
    all.catalogId = 'shinhan-marriott-bonvoy-best';
    all.catalogVersion = 1;
    all.performance.prevThreshold = 300_000;
    all.performance.excludedCategories = ['tax'];
    delete all.performance.conditions;
    delete all.notice;
    delete all.benefitExclusions;
    all.manual = { prevMonthAdjustment: 120_000, currentMonthAdjustment: 50_000 };
    all.usage = { 'marriott-airline': 9_000 };
    all.last4 = '8765';
    all.memo = '내가 쓴 메모';

    const restored = importStateJson(JSON.stringify(raw));
    const card = restored.cards.find((c) => c.id === 'marriott-bonvoy-shinhan')!;
    expect(card.catalogVersion).toBeGreaterThanOrEqual(2);
    expect(card.performance.excludedCategories).not.toContain('tax');
    expect(card.performance.conditions?.length).toBeGreaterThan(0);
    expect(card.notice).toBeTruthy();
    expect(card.manual).toEqual({ prevMonthAdjustment: 120_000, currentMonthAdjustment: 50_000 });
    expect(card.usage['marriott-airline']).toBe(9_000);
    expect(card.last4).toBe('8765');
    expect(card.memo).toBe('내가 쓴 메모');
    expect(card.changeHistory.some((h) => h.text.includes('최신 약관'))).toBe(true);
  });

  it('마이그레이션은 두 번 돌려도 값이 바뀌지 않는다(멱등)', () => {
    const once = importStateJson(exportStateJson(base()));
    const twice = importStateJson(exportStateJson(once));
    expect(twice.cards.map((c) => c.performance.prevThreshold)).toEqual(once.cards.map((c) => c.performance.prevThreshold));
    expect(twice.cards.every((c) => c.changeHistory.filter((h) => h.text.includes('최신 약관')).length <= 1)).toBe(true);
  });
});

describe('AI 비서 — 금액 없는 가맹점/세금 질문', () => {
  const state = base();

  it('"지방세 내기 좋을 카드"에 세금 적립 제외·실적 인정 카드를 구분해 답한다', () => {
    const answer = askAssistant('지방세 내기 좋을 카드', state, today);
    expect(answer.intent).toBe('tax');
    expect(answer.text).toContain('세금·공과금');
    expect(answer.text).toContain('적립');
    expect(answer.text).toContain('전월 실적에 잡히는 카드');
    expect(answer.text).toContain('메리어트 본보이');
  });

  it('"CGV 결제에 유리한 카드"는 문화/일반 업종으로 계산하고 간편결제 팁을 준다', () => {
    const answer = askAssistant('CGV 결제에 유리한 카드', state, today);
    expect(answer.intent).toBe('place');
    expect(answer.text).toContain('영화·문화');
    expect(answer.text).toContain('3만 원'); // 금액을 말하지 않아 3만 원 기준
    expect(answer.text).toContain('1)');
    expect(answer.text).toContain('간편결제');
  });

  it('"스타벅스 카드 추천"은 카페 업종으로 비교한다', () => {
    const answer = askAssistant('스타벅스 카드 추천', state, today);
    expect(answer.intent).toBe('place');
    expect(answer.text).toContain('카페');
  });

  it('"아파트관리비"처럼 키워드만 있어도 세금·공과금 답변으로 간다', () => {
    const answer = askAssistant('아파트관리비', state, today);
    expect(answer.intent).toBe('tax');
  });

  it('일상 키워드(배달·주유·편의점·병원)도 업종으로 인식한다', () => {
    expect(askAssistant('배민 결제 카드', state, today).text).toContain('배달앱');
    expect(askAssistant('주유소 카드 추천', state, today).text).toContain('주유');
    expect(askAssistant('편의점 결제 유리한 카드', state, today).text).toContain('편의점');
    expect(askAssistant('병원 결제 카드', state, today).text).toContain('병·의원');
  });
});

describe('혜택 3계층(네트워크·카드사·카드) · 가맹점 · 이벤트', () => {
  const stateWith = (...catalogIds: string[]): AppState => {
    const state = base();
    state.cards = catalogIds.map((id) => catalogToCard(CATALOG_BY_ID[id], { id: `c-${id}` }));
    return state;
  };

  it('카탈로그는 30종 이상이고 id가 겹치지 않는다', () => {
    expect(CATALOG.length).toBeGreaterThanOrEqual(30);
    const ids = CATALOG.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const card of CATALOG) {
      expect(card.benefits.length, card.id).toBeGreaterThan(0);
      expect(card.source, card.id).toMatch(/^https?:\/\//);
      expect(card.notice, card.id).toBeTruthy();
    }
  });

  it('카드 브랜드 등급에 맞는 네트워크 혜택이 붙는다', () => {
    const amex = CATALOG_BY_ID['samsung-amex-platinum-2021'];
    expect(amex.networkTier).toBe('THE PLATINUM');
    expect(amex.networkPerks?.some((p) => p.id === 'amex-global-lounge')).toBe(true);

    const all = CATALOG_BY_ID['woori-all-infinite'];
    expect(all.networkTier).toBe('Visa Infinite');
    expect(all.networkPerks?.some((p) => p.id === 'visa-inf-concierge')).toBe(true);

    const marriott = CATALOG_BY_ID['shinhan-marriott-bonvoy-best'];
    expect(marriott.networkTier).toBe('Visa Signature');
    expect(marriott.networkPerks?.some((p) => p.id === 'visa-sig-luxury-hotel')).toBe(true);

    // 등급을 확인하지 못한 카드에는 네트워크 혜택을 붙이지 않는다
    expect(CATALOG_BY_ID['lotte-digiroca-skypass'].networkPerks).toEqual([]);
  });

  it('같은 혜택이 네트워크·카드에 겹치면 구체적인 계층 하나만 남긴다', () => {
    const network: Perk = {
      id: 'n-lounge',
      layer: 'network',
      provider: 'AMEX',
      label: 'Global Lounge',
      group: 'airport',
      kind: 'access',
      summary: '네트워크 라운지',
      dedupeKey: 'lounge',
      verification: 'official',
    };
    const cardPerk: Perk = {
      id: 'c-lounge',
      layer: 'merchant',
      provider: '신한카드',
      label: 'The Lounge 연 4회',
      group: 'airport',
      kind: 'access',
      summary: '카드 고유 라운지',
      dedupeKey: 'lounge',
      verification: 'official',
    };
    const { kept, merged } = dedupePerks([network, cardPerk]);
    expect(kept).toHaveLength(1);
    expect(kept[0].id).toBe('c-lounge');
    expect(merged[0].perk.id).toBe('n-lounge');
  });

  it('CGV 질문은 CGV 직접 혜택이 있는 카드를 먼저 보여 준다', () => {
    const state = stateWith('samsung-taptap-o', 'shinhan-marriott-bonvoy-best', 'kb-toktok-my-point');
    const answer = askAssistant('CGV 결제에 유리한 카드', state, today);
    expect(answer.intent).toBe('place');
    expect(answer.text).not.toContain('전용 혜택 없음');
    expect(answer.text).toContain('① 가맹점 직접 혜택');
    expect(answer.text).toContain('taptap O');
    expect(answer.text).toContain('5,000원');
  });

  it('면세점 질문에 면세점 멤버십·적립 근거가 나온다', () => {
    const state = stateWith('samsung-amex-platinum-2021', 'lotte-hilton-amex', 'hana-jade-classic');
    const answer = askAssistant('면세점 결제 유리한 카드', state, today);
    expect(answer.text).toContain('면세점');
    expect(answer.text).toMatch(/멤버십|면세점 \d/);
  });

  it('공항 라운지 질문은 라운지 혜택 카드를 리스트업한다', () => {
    const state = stateWith('shinhan-marriott-bonvoy-best', 'woori-all-infinite', 'hana-jade-classic');
    const answer = askAssistant('공항 라운지 되는 카드', state, today);
    expect(answer.intent).toBe('place');
    expect(answer.text).toContain('라운지');
    expect(answer.text).toContain('결제금액과 무관');
    expect(answer.text).toMatch(/메리어트|ALL 인피니트|JADE/);
  });

  it('기간이 지난 이벤트는 추천 계산에서 제외한다', () => {
    const state = stateWith('samsung-taptap-o');
    const card = state.cards[0];
    card.promos = [
      {
        id: 'expired',
        label: '지난 이벤트',
        categories: ['general'],
        minSpend: 0,
        rewardKrw: 10_000,
        expiresAt: '2026-10-31',
        enrolled: true,
        verification: 'official',
      },
      {
        id: 'active',
        label: '진행 이벤트',
        categories: ['general'],
        minSpend: 0,
        rewardKrw: 5_000,
        expiresAt: '2026-12-31',
        enrolled: true,
        verification: 'official',
      },
    ];
    const rec = evaluateCardPayment(card, state, { amount: 30_000, category: 'general', merchant: '테스트' }, today);
    expect(rec.promo?.id).toBe('active');
    expect(promoActive(card.promos[0], today)).toBe(false);
    expect(promosState(card.promos[0], today)).toBe('expired');
  });

  it('진행 중 이벤트는 AI 비서 답변에 기간 한정으로 표시한다', () => {
    const state = stateWith('samsung-taptap-o');
    const card = state.cards[0];
    card.promos = [
      {
        id: 'active',
        label: '영화 3천 원 추가 할인',
        categories: ['general'],
        minSpend: 10_000,
        rewardKrw: 3_000,
        expiresAt: '2026-12-31',
        enrolled: true,
        verification: 'official',
      },
    ];
    const answer = askAssistant('CGV 결제에 유리한 카드', state, today);
    expect(answer.text).toContain('이벤트(기간 한정)');
    expect(answer.text).toContain('2026-12-31');
  });

  it('사용자가 직접 추가한 혜택도 순위와 답변에 반영된다', () => {
    const state = stateWith('kb-toktok-my-point', 'samsung-taptap-o');
    const custom = state.cards[0];
    custom.userPerks = [
      {
        id: 'user-cgv',
        layer: 'user',
        provider: '사용자',
        label: 'CGV 3,000원 할인',
        group: 'culture',
        kind: 'voucher',
        amountKrw: 3_000,
        summary: '카드사 앱에서 확인한 CGV 할인',
        merchantKeys: ['cgv', '영화'],
        verification: 'user',
        sourceUrl: 'https://example.com/benefit',
        capturePath: 'cap-test-1',
      },
    ];
    const hits = findMerchantPerkHits(state.cards, 'CGV', 'general', 30_000, () => 500_000);
    const customHit = hits.find((h) => h.card.id === custom.id);
    expect(customHit).toBeDefined();
    expect(customHit!.layerLabel).toBe('직접 추가');
    // 사용자 혜택(3천 원)은 카드 고유 혜택(5천 원)보다 뒤에 정렬된다
    expect(hits[0].card.id).toBe('c-samsung-taptap-o');
    const answer = askAssistant('CGV 결제 유리한 카드', state, today);
    expect(answer.text).toContain('톡톡 My point');
    expect(answer.text).toContain('[직접 추가]');
  });

  it('저장 데이터를 내보내고 다시 불러와도 사용자 혜택·캡처 경로·이벤트 출처가 유지된다', () => {
    const state = stateWith('samsung-taptap-o');
    const card = state.cards[0];
    card.userPerks = [
      {
        id: 'u1',
        layer: 'user',
        provider: '사용자',
        label: '스타벅스 2,000원 할인',
        group: 'cafe',
        kind: 'voucher',
        amountKrw: 2_000,
        summary: '앱 캡처로 확인',
        verification: 'user',
        capturePath: 'cap-abc',
        sourceUrl: 'https://example.com/cafe',
      },
    ];
    card.promos = [
      {
        id: 'p1',
        label: '이벤트',
        categories: ['general'],
        minSpend: 0,
        rewardKrw: 1_000,
        startsAt: '2026-11-01',
        expiresAt: '2026-12-31',
        enrolled: false,
        verification: 'user',
        sourceUrl: 'https://example.com/event',
        capturePath: 'cap-evt',
      },
    ];
    const restored = importStateJson(exportStateJson(state));
    const target = restored.cards.find((c) => c.catalogId === 'samsung-taptap-o')!;
    expect(target.userPerks?.[0].capturePath).toBe('cap-abc');
    expect(target.userPerks?.[0].sourceUrl).toBe('https://example.com/cafe');
    expect(target.promos[0].sourceUrl).toBe('https://example.com/event');
    expect(target.promos[0].capturePath).toBe('cap-evt');
    expect(target.promos[0].startsAt).toBe('2026-11-01');
    // 사용자가 입력한 값은 카탈로그 갱신 후에도 남는다
    expect(target.merchantPerks?.length ?? 0).toBeGreaterThan(0);
  });

  it('가맹점 혜택이 없는 질문은 전용 혜택 없음을 솔직히 말하고 대안을 제시한다', () => {
    const state = stateWith('samsung-taptap-o', 'hyundai-zero-edition3');
    const answer = askAssistant('병원 결제 유리한 카드', state, today);
    expect(answer.text).toContain('전용 혜택 없음');
    expect(answer.text).toMatch(/대신 업종·기본 적립/);
    expect(answer.text).toContain('금액을 말하지 않아');
  });

  it('카탈로그 검색은 새로 추가한 카드사·카드를 찾는다', () => {
    expect(searchCatalog('삼성').some((c) => c.id === 'samsung-taptap-o')).toBe(true);
    expect(searchCatalog('KB').some((c) => c.issuer === 'KB국민카드')).toBe(true);
    expect(searchCatalog('JADE')[0].id).toBe('hana-jade-classic');
    expect(searchCatalog('농협').some((c) => c.id === 'nh-solsol')).toBe(true);
  });
});
