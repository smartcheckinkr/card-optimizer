import { describe, expect, it } from 'vitest';
import { createSeedState } from '../data/seed';
import { evaluateCardPayment, recommendPayment, simulateSplit } from './recommend';
import { currentMonthSpend, performanceStatus, prevMonthSpend, spendBreakdown } from './performance';
import { askAssistant } from './assistant';
import { exportTransactionsCsv, importTransactionsCsv } from '../services/csv';
import { exportStateJson, importStateJson } from '../services/storage';
import type { AppState, Transaction } from '../types';
import { CATALOG, CATALOG_BY_ID, catalogToCard, searchCatalog, walletItemsFromHints } from '../data/catalog';

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

  it('세금·공과금은 실적에서 제외된다', () => {
    const state = base();
    const marriott = cardOf(state, 'marriott-bonvoy-shinhan');
    const withTax = withTransaction(state, { cardId: marriott.id, amount: 500_000, date: '2026-11-20', category: 'tax', merchant: '국세청' });
    const breakdown = spendBreakdown(marriott, withTax.transactions, '2026-11');
    expect(breakdown.recognized).toBe(300_000);
    expect(breakdown.exclusion.category).toBe(500_000);
  });

  it('건당 최소금액 미만 결제는 실적에서 제외된다', () => {
    const state = base();
    const marriott = cardOf(state, 'marriott-bonvoy-shinhan');
    const withSmall = withTransaction(state, { cardId: marriott.id, amount: 500, date: '2026-11-21', category: 'dining', merchant: '커피' });
    const breakdown = spendBreakdown(marriott, withSmall.transactions, '2026-11');
    expect(breakdown.recognized).toBe(300_000);
    expect(breakdown.exclusion.minAmount).toBe(500);
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
    const answer = askAssistant('오늘 점심 뭐 먹지', state, today);
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
    expect(card.performance.prevThreshold).toBe(0);
    expect(card.performance.excludedCategories).toContain('tax');
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
