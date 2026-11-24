import type { AppState, Card, Transaction, WalletItem } from '../types';
import { todayISO, toMonthKey, shiftMonth } from '../engine/date';
import { CATALOG_BY_ID, catalogToCard, walletItemsFromHints } from './catalog';

/**
 * 초기 샘플 데이터.
 * - 카드 조건은 카탈로그(src/data/catalog.ts)의 공식 확인값을 그대로 사용한다.
 * - 사용자가 이미 쓰던 카드 5장은 카탈로그에서 만들어 id만 기존 값으로 고정한다
 *   (결제내역·지갑 샘플이 같은 id를 참조).
 * - 수치·한도는 언제든 앱 안에서 직접 수정할 수 있다.
 */

function monthDay(today: Date, monthOffset: number, day: number): string {
  const base = shiftMonth(today, monthOffset);
  const lastDay = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
  const safeDay = Math.min(day, lastDay);
  return `${toMonthKey(base)}-${String(safeDay).padStart(2, '0')}`;
}

function seedCard(catalogId: string, id: string, usage: Record<string, number> = {}): Card {
  const entry = CATALOG_BY_ID[catalogId];
  return catalogToCard(entry, { id, usage });
}

export function createSeedCards(): Card[] {
  return [
    seedCard('shinhan-marriott-bonvoy-best', 'marriott-bonvoy-shinhan', { 'marriott-airline': 9_000 }),
    seedCard('lotte-hilton-amex', 'lotte-hilton-amex', { 'hilton-base': 5_222 }),
    (() => {
      const card = seedCard('lotte-digiroca-skypass', 'lotte-digiroca-skypass');
      return {
        ...card,
        promos: [
          {
            id: 'digiroca-npay-event',
            label: '해외 결제 80만 원 이상 시 네이버페이 11만 원',
            categories: ['overseas', 'airline', 'dutyfree'],
            minSpend: 800_000,
            rewardKrw: 110_000,
            expiresAt: `${new Date().getFullYear()}-12-15`,
            enrolled: true,
            verification: 'official',
            note: '응모 완료(2026-11-24 기준). 지급 조건·기간은 카드사 공지 확인 필요.',
          },
        ],
      };
    })(),
    seedCard('hyundai-koreanair-300', 'hyundai-koreanair-300'),
    seedCard('samsung-amex-platinum-legacy', 'samsung-amex-platinum-legacy', {
      'samsung-dutyfree': 20_000,
      'samsung-domestic': 1_500,
    }),
  ];
}

export function createSeedTransactions(today: Date = new Date()): Transaction[] {
  const now = new Date().toISOString();
  const row = (cardId: string, daysAgoMonth: number, day: number, merchant: string, category: Transaction['category'], amount: number, status: Transaction['status'] = 'active'): Transaction => ({
    id: `seed-${cardId}-${daysAgoMonth}-${day}-${amount}`,
    cardId,
    merchant,
    category,
    amount,
    date: monthDay(today, daysAgoMonth, day),
    status,
    createdAt: now,
  });
  return [
    // 지난달(전월 실적)
    row('marriott-bonvoy-shinhan', -1, 8, '신세계백화점 강남', 'department', 250_000),
    row('marriott-bonvoy-shinhan', -1, 19, '스타벅스', 'dining', 200_000),
    row('lotte-hilton-amex', -1, 11, '쿠팡', 'online', 320_000),
    row('lotte-digiroca-skypass', -1, 15, '한식당', 'dining', 180_000),
    // 현대 300은 전월 실적(50만 원) 미달 상태를 보여 주는 샘플
    row('hyundai-koreanair-300', -1, 5, '현대백화점', 'department', 420_000),
    row('samsung-amex-platinum-legacy', -1, 3, '롯데백화점', 'department', 700_000),
    row('samsung-amex-platinum-legacy', -1, 22, '롯데면세점', 'dutyfree', 500_000),
    // 이번 달(당월 실적 / 이벤트 진행률)
    row('lotte-digiroca-skypass', 0, 10, 'Booking.com 파리', 'overseas', 350_000),
    row('samsung-amex-platinum-legacy', 0, 6, '롯데면세점', 'dutyfree', 400_000),
    row('marriott-bonvoy-shinhan', 0, 14, '대한항공 (공홈 직판)', 'airline', 300_000),
    row('samsung-amex-platinum-legacy', 0, 18, '쿠팡', 'online', 150_000),
    row('hyundai-koreanair-300', 0, 20, '한식당', 'dining', 120_000),
    row('lotte-hilton-amex', 0, 16, '호텔 식당', 'dining', 280_000),
  ];
}

export function createSeedWallet(today: Date = new Date()): WalletItem[] {
  const year = today.getFullYear();
  const items: WalletItem[] = [
    ...walletItemsFromHints(CATALOG_BY_ID['lotte-hilton-amex'], 'lotte-hilton-amex', today),
    ...walletItemsFromHints(CATALOG_BY_ID['samsung-amex-platinum-legacy'], 'samsung-amex-platinum-legacy', today),
    ...walletItemsFromHints(CATALOG_BY_ID['shinhan-marriott-bonvoy-best'], 'marriott-bonvoy-shinhan', today),
  ];
  items.push({
    id: 'w-digiroca-npay',
    cardId: 'lotte-digiroca-skypass',
    title: '네이버페이 11만 원 이벤트',
    kind: 'voucher',
    remaining: 1,
    total: 1,
    unit: '건',
    expiresAt: `${year}-12-15`,
    conditions: '이벤트 기간 중 해외 결제 80만 원 이상',
    howTo: '응모 완료 — 조건 충족 시 자동 지급',
    valueKrw: 110_000,
    verification: 'official',
    note: '2026-11-24 응모 완료 확인',
  });
  return items;
}

export function createSeedState(today: Date = new Date()): AppState {
  return {
    version: 1,
    cards: createSeedCards(),
    transactions: createSeedTransactions(today),
    wallet: createSeedWallet(today),
    settings: {
      pointValues: {
        bonvoy: 10,
        hilton: 7,
        skypass: 15,
        mr: 1,
        krw: 1,
        npay: 1,
        all: 30,
        eco: 1,
        hana: 1,
        m: 1,
      },
    },
    updatedAt: todayISO(today),
  };
}
