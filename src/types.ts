// 카드옵티마 — 공용 도메인 타입
// 민감 결제 인증정보(전체 카드번호·CVC·비밀번호)는 어떤 타입에도 존재하지 않습니다.
// 카드 식별은 별칭 + (선택) 끝 4자리까지만 허용합니다.

export type CategoryId =
  | 'department' // 백화점
  | 'airline' // 항공사 공홈/앱
  | 'overseas' // 해외(외화) 결제
  | 'dutyfree' // 면세점
  | 'dining' // 음식점/카페
  | 'online' // 온라인쇼핑
  | 'golf' // 골프
  | 'hotel' // 호텔/숙박
  | 'transit' // 대중교통
  | 'ev' // 전기차 충전
  | 'delivery' // 배달앱
  | 'streaming' // 스트리밍·구독
  | 'parking' // 주차·하이패스
  | 'fuel' // 주유
  | 'simplepay' // 간편결제(네이버페이·카카오페이 등)
  | 'tax' // 세금·공과금(대부분 실적 제외)
  | 'general'; // 일반

/** official: 카드사 공식 자료로 확인된 값 · example: 공식 확인 전 예시값 */
export type Verification = 'official' | 'example';

export type PointCurrencyId =
  | 'bonvoy'
  | 'hilton'
  | 'skypass'
  | 'mr'
  | 'krw'
  | 'npay'
  | 'all' // ALL 리워드 포인트(아코르)
  | 'eco' // 에코머니 포인트(그린카드, 1P=1원)
  | 'hana' // 하나머니(1P=1원)
  | 'm'; // M포인트(현대카드)

export interface PointCurrency {
  id: PointCurrencyId;
  name: string;
  unit: string;
  defaultWonPerUnit: number;
  note: string;
}

export interface BenefitRule {
  id: string;
  label: string;
  categories: CategoryId[];
  /** 가맹점명 일치 조건(소문자 비교). 비어 있으면 업종만 본다. */
  keywords?: string[];
  earnType: 'percent' | 'points';
  /** earnType='percent' */
  percent?: number;
  /** earnType='points' — unitAmount 원당 pointsPerUnit */
  pointsPerUnit?: number;
  unitAmount?: number;
  pointCurrencyId?: PointCurrencyId;
  /** 월 혜택 한도(원). 이번 달 사용분(usage)을 차감해 계산한다. */
  monthlyCapKrw?: number;
  monthlyCapPoints?: number;
  /** 이 혜택을 받으려면 필요한 전월 실적 */
  minPrevMonth?: number;
  /** 건당 최소 결제금액 */
  minTransaction?: number;
  /** 카드사 공홈/앱 직접 결제 등 조건이 있는 혜택 */
  requiresDirect?: boolean;
  verification: Verification;
  source?: string;
  note?: string;
}

/** 기간 한정 이벤트(응모형) — 확정 할인과 분리해서 표시한다. */
export interface PromoRule {
  id: string;
  label: string;
  categories: CategoryId[];
  /** 이벤트 기간 중 해당 업종 누적 결제 기준액 */
  minSpend: number;
  rewardKrw: number;
  expiresAt: string;
  enrolled: boolean;
  verification: Verification;
  note?: string;
}

export interface PerformanceRule {
  /** 전월 실적 기준(원). 0이면 실적 무관 카드 */
  prevThreshold: number;
  /** 실적 인정 최소 건당 금액 */
  minPerTransaction: number;
  /** 실적 제외 업종 */
  excludedCategories: CategoryId[];
  /** 실적 제외 가맹점 키워드 */
  excludedKeywords?: string[];
}

export interface Card {
  id: string;
  /** 카탈로그에서 불러온 경우 원본 상품 키(중복 등록 확인용) */
  catalogId?: string;
  name: string;
  shortName: string;
  issuer: string;
  network: 'AMEX' | 'VISA' | 'MASTERCARD' | 'LOCAL';
  theme: 'navy' | 'violet' | 'emerald' | 'graphite' | 'coral';
  last4?: string;
  annualFee: number;
  performance: PerformanceRule;
  benefits: BenefitRule[];
  promos: PromoRule[];
  /** 수동 보정(원). 카드사 공식 실적과 차이가 있을 때 사용자가 조정한다. */
  manual: { prevMonthAdjustment: number; currentMonthAdjustment: number };
  /** ruleId → 이번 달 이미 받은 혜택(원) */
  usage: Record<string, number>;
  verification: Verification;
  sourceNote?: string;
  changeHistory: { date: string; text: string }[];
  memo?: string;
  createdAt: string;
}

export interface Transaction {
  id: string;
  cardId: string;
  merchant: string;
  category: CategoryId;
  amount: number;
  /** YYYY-MM-DD */
  date: string;
  status: 'active' | 'canceled';
  memo?: string;
  createdAt: string;
}

export type WalletKind = 'stay' | 'lounge' | 'valet' | 'spa' | 'voucher' | 'dining' | 'credit' | 'status';

export interface WalletItem {
  id: string;
  cardId: string;
  title: string;
  kind: WalletKind;
  remaining: number;
  total: number;
  unit: string;
  /** YYYY-MM-DD */
  expiresAt?: string;
  conditions?: string;
  howTo?: string;
  valueKrw?: number;
  verification: Verification;
  note?: string;
}

export interface Settings {
  /** 포인트/마일 1단위의 원화 가치(사용자 설정) */
  pointValues: Record<PointCurrencyId, number>;
}

export interface AppState {
  version: 1;
  cards: Card[];
  transactions: Transaction[];
  wallet: WalletItem[];
  settings: Settings;
  /** 화면에 안내하기 위한 마지막 갱신 시각 */
  updatedAt: string;
}

export interface PaymentInput {
  amount: number;
  category: CategoryId;
  merchant: string;
}

/** 카탈로그에서 카드를 고르면 지갑에 함께 추가할 수 있는 대표 바우처 */
export interface CatalogWalletHint {
  title: string;
  kind: WalletKind;
  total: number;
  /** 기본값은 total */
  remaining?: number;
  unit: string;
  /** 오늘 기준 연도 말일 등 상대 표기를 쓰려면 'YEAR-END' */
  expiresAt?: string;
  conditions?: string;
  howTo?: string;
  valueKrw?: number;
  verification: Verification;
  note?: string;
}

/** '+ 카드 추가' 화면의 카드 검색 카탈로그 항목(공식 상품 조건 기반) */
export interface CatalogCard {
  id: string;
  name: string;
  shortName: string;
  issuer: string;
  network: Card['network'];
  theme: Card['theme'];
  /** 대표(해외겸용) 연회비 */
  annualFee: number;
  annualFeeNote?: string;
  performance: PerformanceRule;
  benefits: BenefitRule[];
  /** 이벤트(응모형) — 카탈로그에서는 enrolled=false 로 시작 */
  promos?: Omit<PromoRule, 'enrolled'>[];
  walletHints?: CatalogWalletHint[];
  /** 검색 보조 키워드 */
  aliases: string[];
  /** 빠른 선택 칩 */
  tags: string[];
  verification: Verification;
  /** 확인 출처(카드사 공식 페이지 등) */
  source: string;
  sourceNote: string;
  /** 신규 발급 중단 등 상태 안내 */
  status?: 'active' | 'discontinued';
  statusNote?: string;
}
