import type { CategoryId, PointCurrency, PointCurrencyId } from '../types';

export const CATEGORIES: { id: CategoryId; label: string; emoji: string; hint: string }[] = [
  { id: 'department', label: '백화점', emoji: '🏬', hint: '신세계·롯데·현대백화점' },
  { id: 'airline', label: '항공 공홈', emoji: '✈️', hint: '대한항공·아시아나 직판' },
  { id: 'overseas', label: '해외결제', emoji: '🌍', hint: '외화 결제·해외 가맹점' },
  { id: 'dutyfree', label: '면세점', emoji: '🛍️', hint: '롯데·신라·신세계면세점' },
  { id: 'dining', label: '음식점·카페', emoji: '🍽️', hint: '일반 음식점·커피' },
  { id: 'online', label: '온라인쇼핑', emoji: '💻', hint: '쿠팡·네이버쇼핑' },
  { id: 'golf', label: '골프', emoji: '⛳', hint: '골프장·골프용품' },
  { id: 'hotel', label: '호텔·숙박', emoji: '🏨', hint: '호텔 공홈·부킹닷컴' },
  { id: 'transit', label: '대중교통', emoji: '🚇', hint: '지하철·버스·택시' },
  { id: 'tax', label: '세금·공과금', emoji: '🧾', hint: '대부분 실적 제외' },
  { id: 'general', label: '일반', emoji: '💳', hint: '위 업종에 해당 없음' },
];

export const CATEGORY_LABEL: Record<CategoryId, string> = CATEGORIES.reduce(
  (acc, c) => ({ ...acc, [c.id]: c.label }),
  {} as Record<CategoryId, string>,
);

export const CATEGORY_EMOJI: Record<CategoryId, string> = CATEGORIES.reduce(
  (acc, c) => ({ ...acc, [c.id]: c.emoji }),
  {} as Record<CategoryId, string>,
);

export const POINT_CURRENCIES: PointCurrency[] = [
  { id: 'bonvoy', name: '메리어트 보너스 포인트', unit: 'P', defaultWonPerUnit: 10, note: '숙박 사용 시 1P≈9~12원, 전환은 더 낮음' },
  { id: 'hilton', name: '힐튼 아너스 포인트', unit: 'P', defaultWonPerUnit: 7, note: '숙박 사용 시 1P≈6~8원' },
  { id: 'skypass', name: '스카이패스 마일', unit: '마일', defaultWonPerUnit: 15, note: '이코노미 15원, 비즈니스 25원 이상' },
  { id: 'mr', name: 'MR 포인트', unit: 'P', defaultWonPerUnit: 1, note: '현금성 1P=1원, 항공 전환 15:1' },
  { id: 'krw', name: '포인트(1P=1원)', unit: 'P', defaultWonPerUnit: 1, note: '국내 포인트 일반' },
  { id: 'npay', name: '네이버페이 포인트', unit: '원', defaultWonPerUnit: 1, note: '1P=1원' },
];

export const POINT_CURRENCY_MAP: Record<PointCurrencyId, PointCurrency> = POINT_CURRENCIES.reduce(
  (acc, c) => ({ ...acc, [c.id]: c }),
  {} as Record<PointCurrencyId, PointCurrency>,
);

export const WALLET_KIND_LABEL: Record<string, string> = {
  stay: '무료 숙박권',
  lounge: '공항 라운지',
  valet: '발레파킹',
  spa: '스파',
  voucher: '바우처·크레딧',
  dining: '호텔 레스토랑',
  credit: '연간 크레딧',
  status: '멤버십 등급',
};

/** 가맹점명으로 업종을 추정한다(사용자가 언제든 바꿀 수 있음). */
export function guessCategory(merchant: string): CategoryId {
  const m = merchant.toLowerCase();
  const rules: [CategoryId, string[]][] = [
    ['dutyfree', ['면세', 'duty free', 'dutyfree']],
    ['department', ['백화점', '신세계', '롯데백', '현대백', '더현대']],
    ['airline', ['대한항공', '아시아나', 'korean air', '항공', 'airline']],
    ['hotel', ['호텔', 'hotel', '메리어트', '힐튼', '하얏트', '리츠', '부킹', 'booking', '아고다', 'airbnb']],
    ['golf', ['골프', 'golf', 'cc']],
    ['online', ['쿠팡', '네이버쇼핑', '11번가', '마켓컬리', 'amazon', '아마존']],
    ['transit', ['지하철', '버스', '택시', '카카오t', '티머니']],
    ['tax', ['국세', '지방세', '공과금', '관리비', '건강보험', '도시가스', '한국전력']],
    ['dining', ['식당', '음식', '카페', '스타벅스', '커피', '베이커리', 'restaurant']],
  ];
  for (const [id, keys] of rules) {
    if (keys.some((k) => m.includes(k))) return id;
  }
  return 'general';
}
