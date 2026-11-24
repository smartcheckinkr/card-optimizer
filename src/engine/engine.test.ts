import { describe, expect, it } from 'vitest';
import { createSeedState } from '../data/seed';
import { evaluateCardPayment, recommendPayment, simulateSplit } from './recommend';
import { currentMonthSpend, performanceStatus, prevMonthSpend, spendBreakdown } from './performance';
import { askAssistant } from './assistant';
import { exportTransactionsCsv, importTransactionsCsv } from '../services/csv';
import { exportStateJson, importStateJson } from '../services/storage';
import type { AppState, Transaction } from '../types';

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

  it('전월 실적 미달 카드(현대 300)를 미달로 판정한다', () => {
    const state = base();
    const hyundai = cardOf(state, 'hyundai-koreanair-300');
    const status = performanceStatus(hyundai, state.transactions, today);
    expect(status.prevSpend).toBe(620_000);
    expect(status.met).toBe(false);
    expect(status.shortfall).toBe(380_000);
  });
});

describe('신세계백화점 30만 원', () => {
  const state = base();
  const results = recommendPayment(state, { amount: 300_000, category: 'department', merchant: '신세계백화점' }, today);

  it('힐튼 아너스가 1위(5,600원)로 계산된다', () => {
    expect(results[0].cardShort).toBe('힐튼 아너스');
    expect(results[0].immediateKrw).toBe(5_600);
    expect(results[0].rank).toBe(1);
  });

  it('디지로카 스카이패스가 2위(4,500원), 메리어트·삼성은 3,000원이다', () => {
    expect(results[1].cardShort).toBe('디지로카 스카이패스');
    expect(results[1].immediateKrw).toBe(4_500);
    const marriott = results.find((r) => r.cardId === 'marriott-bonvoy-shinhan')!;
    const samsung = results.find((r) => r.cardId === 'samsung-amex-platinum-legacy')!;
    expect(marriott.immediateKrw).toBe(3_000);
    expect(samsung.immediateKrw).toBe(3_000);
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

  it('전월 실적을 채운 메리어트 본보이가 1위(45,000원)', () => {
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
    expect(rec.immediateKrw).toBe(0);

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

  it('해외 결제 질문은 디지로카를 1위로 계산한다', () => {
    const answer = askAssistant('해외에서 어떤 카드를 써야 하나요?', state, today);
    expect(answer.intent).toBe('overseas');
    expect(answer.text).toContain('1) 디지로카 스카이패스');
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

  it('빠진 설정 필드는 기본값으로 보정한다', () => {
    const state = base();
    const partial = JSON.parse(exportStateJson(state));
    delete partial.settings;
    const restored = importStateJson(JSON.stringify(partial));
    expect(restored.settings.pointValues.bonvoy).toBe(10);
  });
});
