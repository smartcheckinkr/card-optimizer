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

/** official: 카드사·브랜드사 공식 자료로 확인된 값 · example: 공식 확인 전 예시값 · user: 사용자가 직접 입력 */
export type Verification = 'official' | 'example';
export type PerkVerification = Verification | 'user';

/** 혜택이 어디서 오는지 — 네트워크(브랜드) → 카드사 → 카드 고유(가맹점 포함) → 사용자 입력 */
export type PerkLayer = 'network' | 'issuer' | 'card' | 'merchant' | 'user';

/** 카드 상세에서 묶어 보여 주는 혜택 영역 */
export type PerkGroup =
  | 'airport'
  | 'hotel'
  | 'dutyfree'
  | 'culture'
  | 'cafe'
  | 'shopping'
  | 'transport'
  | 'living'
  | 'golf'
  | 'dining'
  | 'other';

export type PerkKind = 'discount' | 'points' | 'voucher' | 'free' | 'access' | 'status' | 'installment';

/**
 * 상시(고유) 혜택 한 건. 실제 적립률 계산에 쓰는 BenefitRule과 달리
 * 라운지·발렛·멤버십처럼 금액화하기 어려운 혜택과 가맹점 단위 혜택을 담는다.
 * 같은 혜택이 네트워크·카드사·카드에 겹쳐 있으면 dedupeKey로 묶어 하나만 적용한다.
 */
export interface Perk {
  id: string;
  layer: PerkLayer;
  /** 'AMEX' | 'VISA' | '신한카드' | '메리어트' | '사용자' 등 */
  provider: string;
  label: string;
  group: PerkGroup;
  kind: PerkKind;
  /** 할인·적립률(%) — kind=discount/points */
  ratePercent?: number;
  /** 정액 혜택(원) — kind=voucher/discount */
  amountKrw?: number;
  /** 월 한도(원) — 할인·적립형 혜택의 월 상한 */
  monthlyCapKrw?: number;
  /** 무료 이용 횟수 */
  uses?: { count: number; period: 'month' | 'year' | 'once' };
  /** '연 4회 본인+동반 1인'처럼 화면에 그대로 쓰는 표기 */
  valueText?: string;
  /** 왜 유리한지 한 줄 */
  summary: string;
  conditions?: string;
  minPrevMonth?: number;
  /** 가맹점 매칭 키(소문자 비교) */
  merchantKeys?: string[];
  categories?: CategoryId[];
  /** 같은 혜택 중복 방지 키(예: 'lounge', 'valet', 'dutyfree-membership') */
  dedupeKey?: string;
  verification: PerkVerification;
  sourceName?: string;
  sourceUrl?: string;
  /** IndexedDB에 저장한 캡처 이미지 키 */
  capturePath?: string;
  note?: string;
}

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
  /**
   * 여러 혜택이 하나의 월 한도를 나눠 쓰는 경우의 묶음 이름(예: ALL 특별적립 4,000P).
   * 같은 카드 안에서 같은 값을 가진 규칙의 이번 달 사용액을 합산해 한도를 계산한다.
   */
  sharedCapGroup?: string;
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

/** 기간 한정 이벤트 — 상시 혜택과 분리해서 표시하고, 기간이 지나면 계산에서 제외한다. */
export interface PromoRule {
  id: string;
  /** 이벤트명 */
  label: string;
  /** 혜택 내용(사용자가 직접 적는 설명) */
  description?: string;
  categories: CategoryId[];
  /** 이벤트 기간 중 해당 업종 누적 결제 기준액 */
  minSpend: number;
  rewardKrw: number;
  /** YYYY-MM-DD (없으면 시작일 제한 없음) */
  startsAt?: string;
  /** YYYY-MM-DD (이 날짜까지 유효) */
  expiresAt: string;
  enrolled: boolean;
  /** 이벤트 조건 메모(전월 실적·건당 금액 등) */
  conditions?: string;
  sourceName?: string;
  sourceUrl?: string;
  /** IndexedDB에 저장한 캡처 이미지 키 */
  capturePath?: string;
  verification: PerkVerification;
  note?: string;
}

/**
 * 전월 실적 기준이 여러 갈래인 카드의 상세 조건(예: ALL 인피니트 = 기본 적립 0원 / 특별적립 50만 원).
 * prevThreshold 는 엔진이 쓰는 대표 기준이고, 이 목록은 화면에 정확히 안내하기 위한 것이다.
 */
export interface PerformanceCondition {
  label: string;
  /** 이 갈래에 필요한 전월 실적(원). 0 = 실적 무관 */
  amount: number;
  note?: string;
}

/** 적립·할인 제외(실적 제외와 다름 — 실적에는 들어가지만 혜택은 안 붙는 결제) */
export interface BenefitExclusion {
  categories: CategoryId[];
  keywords: string[];
}

export interface PerformanceRule {
  /** 전월 실적 기준(원). 0이면 실적 무관 카드 */
  prevThreshold: number;
  /** 이 기준이 무엇에 걸리는 조건인지 짧은 표기(예: '특별적립·프리미엄 서비스') */
  thresholdScope?: string;
  /** 실적 인정 최소 건당 금액 */
  minPerTransaction: number;
  /** 실적 제외 업종 */
  excludedCategories: CategoryId[];
  /** 실적 제외 가맹점 키워드 */
  excludedKeywords?: string[];
  /** 전월 실적 기준 상세(카드사 약관의 갈래별 조건) */
  conditions?: PerformanceCondition[];
}

/** 카탈로그에서 불러올 때 저장해 두는 상품 조건 스냅샷 — 사용자 수정 여부 판별과 마이그레이션에 쓴다. */
export interface CatalogConditionSnapshot {
  catalogVersion: number;
  annualFee: number;
  prevThreshold: number;
  minPerTransaction: number;
  excludedCategories: CategoryId[];
  excludedKeywords: string[];
  benefitExclusions: BenefitExclusion;
  benefitIds: string[];
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
  /** 브랜드(네트워크) 등급 — 'Visa Infinite', 'Mastercard World', 'THE PLATINUM' 등 */
  networkTier?: string;
  performance: PerformanceRule;
  benefits: BenefitRule[];
  /** 브랜드사(네트워크) 공통 혜택 */
  networkPerks?: Perk[];
  /** 카드사 공통·선택서비스 혜택 */
  issuerPerks?: Perk[];
  /** 카드 고유 가맹점 혜택 */
  merchantPerks?: Perk[];
  /** 사용자가 직접 추가한 상시 혜택 */
  userPerks?: Perk[];
  promos: PromoRule[];
  /** 수동 보정(원). 카드사 공식 실적과 차이가 있을 때 사용자가 조정한다. */
  manual: { prevMonthAdjustment: number; currentMonthAdjustment: number };
  /** ruleId → 이번 달 이미 받은 혜택(원) */
  usage: Record<string, number>;
  /** 적립·할인 제외 업종/가맹점(실적 제외와 분리) */
  benefitExclusions: BenefitExclusion;
  /** 카드사 약관 요약 — '0원'만 보고 오해하지 않도록 화면 상단에 띄우는 안내문 */
  notice?: string;
  /** 불러온 카탈로그 조건 버전 */
  catalogVersion?: number;
  /** 불러온 시점의 카탈로그 값(사용자가 고친 항목을 판별하는 기준) */
  catalogSnapshot?: CatalogConditionSnapshot;
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
  /** 브랜드(네트워크) 등급 */
  networkTier?: string;
  performance: PerformanceRule;
  benefits: BenefitRule[];
  /** 브랜드사(네트워크) 공통 혜택 */
  networkPerks?: Perk[];
  /** 카드사 공통·선택서비스 혜택 */
  issuerPerks?: Perk[];
  /** 카드 고유 가맹점 혜택 */
  merchantPerks?: Perk[];
  /** 적립·할인 제외 대상(실적 제외 별개) */
  benefitExclusions?: BenefitExclusion;
  /** 카드 선택 화면·카드 상세에 띄우는 약관 요약 안내 */
  notice?: string;
  /** 카드 메모에 미리 채워 넣는 한 줄 요약(사용자가 지우면 유지) */
  memoHint?: string;
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
