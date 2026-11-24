import type {
  BenefitExclusion,
  BenefitRule,
  Card,
  CatalogCard,
  CatalogConditionSnapshot,
  CategoryId,
  PerformanceCondition,
  PerformanceRule,
  WalletItem,
} from '../types';
import { todayISO } from '../engine/date';

/**
 * 카드 카탈로그 — '+ 카드 추가' 화면에서 검색해 조건을 자동 입력하는 상품 데이터.
 *
 * 원칙
 * - 연회비·전월 실적·적립/할인율·월 한도·실적/적립 제외 대상은 카드사 공식 상품 페이지·상품설명서에서 확인한 값을 넣는다.
 * - 공식 확인이 어려운 세부 한도는 verification: 'example' 로 표시하고 note 에 '예시'라고 적는다.
 * - '실적 제외'와 '적립·할인 제외'를 분리한다. 세금·공과금처럼 실적에는 들어가지만 적립은 안 되는 결제가 많다.
 * - 전월 실적이 갈래로 나뉘는 카드(기본 적립 무관 + 특별적립 50만 원 등)는 performance.conditions 에 상세를 남긴다.
 * - 특정 개인의 카드번호·이름·계정 정보는 이 파일에 존재하지 않는다(상품 조건만).
 *
 * 마지막 확인: 2026-11-24 (카드사 공식 페이지·상품설명서·카드 비교공시 웹 확인).
 * CATALOG_CONDITIONS_VERSION 을 올리면 저장된 카드의 상품 조건이 자동으로 갱신된다.
 */
export const CATALOG_CONDITIONS_VERSION = 2;

const DOMESTIC: CategoryId[] = [
  'department',
  'dining',
  'online',
  'golf',
  'hotel',
  'transit',
  'dutyfree',
  'fuel',
  'delivery',
  'streaming',
  'parking',
  'ev',
  'simplepay',
  'airline', // 항공사 공홈 원화 결제는 국내 가맹점으로 분류되는 경우가 많다
  'general',
];

const ALL_CATEGORIES: CategoryId[] = [...DOMESTIC, 'overseas'];

/** 실적·적립 제외로 자주 안내되는 가맹점 키워드 */
const COMMON_EXCLUDED = ['상품권', '선불카드', '등록금', '아파트관리비', '무이자할부'];

function performance(options: {
  prevThreshold: number;
  thresholdScope?: string;
  minPerTransaction?: number;
  excludedCategories?: CategoryId[];
  excludedKeywords?: string[];
  conditions?: PerformanceCondition[];
}): PerformanceRule {
  return {
    prevThreshold: options.prevThreshold,
    thresholdScope: options.thresholdScope,
    minPerTransaction: options.minPerTransaction ?? 0,
    excludedCategories: options.excludedCategories ?? [],
    excludedKeywords: options.excludedKeywords ?? [],
    conditions: options.conditions,
  };
}

function exclusions(categories: CategoryId[] = [], keywords: string[] = []): BenefitExclusion {
  return { categories, keywords };
}

const ARCOR_KEYWORDS = ['아코르', 'accor', '노보텔', '소피텔', '이비스', '풀만', '페어몬트', 'mercure', 'ibis', 'sofitel', 'novotel', 'pullman', 'fairmont'];

const CATALOG_LIST: CatalogCard[] = [
  // ─────────────────────────────────────────────────────────────
  // 1. 신한 메리어트 본보이 더 베스트
  // ─────────────────────────────────────────────────────────────
  {
    id: 'shinhan-marriott-bonvoy-best',
    name: '메리어트 본보이™ 더 베스트 신한카드',
    shortName: '메리어트 본보이',
    issuer: '신한카드',
    network: 'VISA',
    theme: 'navy',
    annualFee: 267_000,
    annualFeeNote: '국내전용 264,000원 / Visa 267,000원 (가족 50,000원)',
    performance: performance({
      prevThreshold: 300_000,
      thresholdScope: '특별적립·조식 할인',
      minPerTransaction: 0,
      // 신한은 세금·공과금·관리비·4대보험도 전월 실적에 포함된다(특별적립 실적은 국내 이용만).
      excludedCategories: [],
      excludedKeywords: ['상품권', '선불카드', '기프트카드', '연회비', '수수료', '이자'],
      conditions: [
        { label: '기본 적립(국내 1,000원당 1P)', amount: 0, note: '전월 실적 조건 없음' },
        { label: '특별적립(메리어트 5P · 해외/항공/택시/카페 3P)', amount: 300_000, note: '국내 이용분만 산정(해외 결제 제외)' },
        { label: '무료 숙박권(1박)', amount: 1_000_000, note: '연회비 주기 내 이용금액 기준' },
      ],
    }),
    benefitExclusions: exclusions(
      ['tax'],
      ['등록금', '스쿨뱅킹', '상품권', '선불카드', '무이자', '도시가스', '전기요금', '수도요금'],
    ),
    memoHint: '특별적립은 전월 국내 30만 원 이상, 기본 적립은 실적 무관',
    notice:
      '기본 적립(국내 1P)은 전월 실적과 무관하고, 특별적립(메리어트 5P·해외/항공/택시/카페 3P)은 전월 국내 30만 원 이상일 때 적용됩니다. 무료 숙박권은 연회비 주기 내 100만 원 이용이 조건입니다.',
    benefits: [
      {
        id: 'marriott-hotel',
        label: '메리어트 참여 호텔 1,000원당 5P',
        categories: ['hotel'],
        keywords: ['메리어트', 'marriott', '본보이'],
        earnType: 'points',
        pointsPerUnit: 5,
        unitAmount: 1_000,
        pointCurrencyId: 'bonvoy',
        minPrevMonth: 300_000,
        verification: 'official',
        note: '메리어트 공식 사이트·앱 또는 호텔 현장 결제만 특별적립. 임대 매장·여행사 예약은 기본적립.',
        source: '2026-11-24 신한카드 상품 페이지',
      },
      {
        id: 'marriott-airline',
        label: '대한항공·아시아나·제주·진에어 직판 1,000원당 3P',
        categories: ['airline'],
        keywords: ['대한항공', '아시아나', '제주항공', '진에어'],
        earnType: 'points',
        pointsPerUnit: 3,
        unitAmount: 1_000,
        pointCurrencyId: 'bonvoy',
        minPrevMonth: 300_000,
        requiresDirect: true,
        verification: 'official',
        note: '항공사 공식 웹사이트·앱 원화 결제만. 간편결제·여행사·항공권 대행 사이트 제외.',
        source: '2026-11-24 신한카드 상품 페이지',
      },
      {
        id: 'marriott-overseas',
        label: '해외 결제 1,000원당 3P',
        categories: ['overseas'],
        earnType: 'points',
        pointsPerUnit: 3,
        unitAmount: 1_000,
        pointCurrencyId: 'bonvoy',
        minPrevMonth: 300_000,
        verification: 'official',
        note: '해외 일시불 결제 기준(해외 할부 제외).',
        source: '2026-11-24 신한카드 상품 페이지',
      },
      {
        id: 'marriott-taxi',
        label: '택시 1,000원당 3P',
        categories: ['transit'],
        keywords: ['택시', '카카오 t', '카카오t', '우버', 'uber'],
        earnType: 'points',
        pointsPerUnit: 3,
        unitAmount: 1_000,
        pointCurrencyId: 'bonvoy',
        minPrevMonth: 300_000,
        verification: 'official',
        note: '택시 업종만. 택시 호출앱 자동결제·선결제 제외.',
        source: '2026-11-24 신한카드 상품 페이지',
      },
      {
        id: 'marriott-cafe',
        label: '스타벅스·커피빈·폴바셋·투썸 1,000원당 3P',
        categories: ['dining'],
        keywords: ['스타벅스', '커피빈', '폴바셋', '투썸'],
        earnType: 'points',
        pointsPerUnit: 3,
        unitAmount: 1_000,
        pointCurrencyId: 'bonvoy',
        minPrevMonth: 300_000,
        verification: 'official',
        note: '백화점·할인점 입점 매장, 해외 매장, 배달앱 결제 제외.',
        source: '2026-11-24 신한카드 상품 페이지',
      },
      {
        id: 'marriott-base',
        label: '국내 가맹점 1,000원당 1P',
        categories: ALL_CATEGORIES,
        earnType: 'points',
        pointsPerUnit: 1,
        unitAmount: 1_000,
        pointCurrencyId: 'bonvoy',
        verification: 'official',
        note: '특별적립 대상이 아닌 국내 가맹점. 적립 한도 없음(전월 실적 무관).',
        source: '2026-11-24 신한카드 상품 페이지',
      },
    ],
    walletHints: [
      {
        title: '메리어트 무료 숙박권 (35,000P 이하 1박)',
        kind: 'stay',
        total: 1,
        unit: '매',
        expiresAt: 'YEAR-END',
        conditions: '연회비 납부 완료 + 연회비 주기 내 100만 원 이상 이용',
        howTo: '메리어트 공식 앱 → 무료 숙박권 선택',
        valueKrw: 250_000,
        verification: 'official',
        note: '가치는 예시 추정',
      },
      {
        title: '공항 라운지 (The Lounge Members)',
        kind: 'lounge',
        total: 4,
        unit: '회',
        expiresAt: 'YEAR-END',
        conditions: '본인 1인, 연 4회, 전월 30만 원 이상',
        howTo: 'The Lounge 앱에서 카드 등록 후 이용권 발급',
        valueKrw: 35_000,
        verification: 'official',
        note: '1회 가치는 예시',
      },
      {
        title: '국내 메리어트 호텔 조식 5만 원 할인',
        kind: 'dining',
        total: 2,
        unit: '회',
        expiresAt: 'YEAR-END',
        conditions: '조식 결제 5만 원 이상, 전월 30만 원 이상 이용, 1일 1회',
        howTo: '지정 레스토랑에서 카드 제시',
        valueKrw: 50_000,
        verification: 'official',
      },
      {
        title: '메리어트 엘리트 숙박 크레딧 10',
        kind: 'credit',
        total: 10,
        unit: '크레딧',
        expiresAt: 'YEAR-END',
        conditions: '연 1회 제공',
        verification: 'official',
        note: '크레딧 가치는 사용 호텔에 따라 다름',
      },
      {
        title: '메리어트 본보이 골드 엘리트 등급',
        kind: 'status',
        total: 1,
        unit: '등급',
        conditions: '카드 발급·갱신 시 자동 부여, 연회비 주기 6천만 원 이상 이용 시 플래티넘',
        verification: 'official',
      },
    ],
    aliases: ['메리어트', '본보이', '마리어트', 'marriott', 'bonvoy', '신한', '호텔', '숙박'],
    tags: ['호텔', '여행', '프리미엄'],
    verification: 'official',
    source: 'https://www.shinhancard.com/pconts/html/card/apply/premium/1200288_2205.html',
    sourceNote:
      '2026-11-24 신한카드 상품 페이지 확인: 연회비(국내 26.4만/Visa 26.7만), 특별적립 전월 국내 30만 원, 적립률(메리어트 5P·해외/항공/택시/카페 3P·국내 1P), 무료 숙박권(주기 내 100만 원)·라운지 연 4회·조식 연 2회·숙박 크레딧. 실적 산정에서 세금·공과금·관리비·4대보험은 포함되고, 적립에서는 제외됩니다.',
  },

  // ─────────────────────────────────────────────────────────────
  // 2. 롯데 힐튼 아너스 아멕스
  // ─────────────────────────────────────────────────────────────
  {
    id: 'lotte-hilton-amex',
    name: '힐튼 아너스 아멕스 (롯데카드)',
    shortName: '힐튼 아너스',
    issuer: '롯데카드',
    network: 'AMEX',
    theme: 'graphite',
    annualFee: 250_000,
    annualFeeNote: '국내전용 247,000원 / AMEX 250,000원',
    performance: performance({
      prevThreshold: 500_000,
      thresholdScope: '공항 라운지',
      minPerTransaction: 0,
      excludedCategories: ['tax', 'transit'],
      excludedKeywords: [
        ...COMMON_EXCLUDED,
        '도시가스',
        '전기요금',
        '수도요금',
        'TV 수신료',
        '건강보험',
        '국민연금',
        '고용보험',
        '산재보험',
        '택시',
        '고속버스',
        '통행료',
        '하이패스',
        '임대료',
        '월세',
      ],
      conditions: [
        { label: '힐튼 아너스 포인트 적립(1,500원당 2~4P)', amount: 0, note: '실적 조건·한도 없음' },
        { label: '공항 라운지(연 2회, 동반 1인)', amount: 500_000 },
        { label: '힐튼 주말 무료 숙박권', amount: 0, note: '지난해 연회비 주기 1,200만 원 이상 이용' },
      ],
    }),
    benefitExclusions: exclusions(
      ['tax', 'transit'],
      [
        ...COMMON_EXCLUDED,
        '도시가스',
        '전기요금',
        '수도요금',
        'TV 수신료',
        '건강보험',
        '국민연금',
        '고용보험',
        '산재보험',
        '택시',
        '고속버스',
        '통행료',
        '하이패스',
      ],
    ),
    memoHint: '적립은 실적 무관 · 라운지는 전월 50만 원 · 숙박권은 전년 1,200만 원',
    notice:
      '포인트 적립(1,500원당 2~4P)은 전월 실적·한도 조건이 없습니다. 공항 라운지(연 2회)는 전월 50만 원, 주말 숙박권은 전년 연회비 주기 1,200만 원 이용이 조건입니다. 택시·대중교통·통행료·세금·공과금은 적립에서 빠집니다.',
    benefits: [
      {
        id: 'hilton-base',
        label: '국내 모든 가맹점 1,500원당 2P',
        categories: DOMESTIC.filter((c) => c !== 'transit' && c !== 'parking'),
        earnType: 'points',
        pointsPerUnit: 2,
        unitAmount: 1_500,
        pointCurrencyId: 'hilton',
        verification: 'official',
        note: '실적 조건·한도 없음. 택시·대중교통·통행료는 적립 제외.',
        source: '2026-11-24 롯데카드 상품 페이지',
      },
      {
        id: 'hilton-dutyfree',
        label: '오프라인 면세점 1,500원당 4P',
        categories: ['dutyfree'],
        earnType: 'points',
        pointsPerUnit: 4,
        unitAmount: 1_500,
        pointCurrencyId: 'hilton',
        verification: 'official',
        note: '온라인 면세점은 미적용(기본 2P).',
        source: '2026-11-24 롯데카드 상품 페이지',
      },
      {
        id: 'hilton-airline',
        label: '대한항공·아시아나 공홈 1,500원당 4P',
        categories: ['airline'],
        keywords: ['대한항공', '아시아나'],
        earnType: 'points',
        pointsPerUnit: 4,
        unitAmount: 1_500,
        pointCurrencyId: 'hilton',
        requiresDirect: true,
        verification: 'official',
        note: '항공사 홈페이지·앱 결제만. 여행사·간편결제 제외.',
        source: '2026-11-24 롯데카드 상품 페이지',
      },
      {
        id: 'hilton-overseas',
        label: '해외 모든 이용금액 1,500원당 4P',
        categories: ['overseas'],
        earnType: 'points',
        pointsPerUnit: 4,
        unitAmount: 1_500,
        pointCurrencyId: 'hilton',
        verification: 'official',
        note: '국내전용 카드는 해외 적립 미제공.',
        source: '2026-11-24 롯데카드 상품 페이지',
      },
      {
        id: 'hilton-hotel',
        label: '국내외 힐튼 호텔 1,500원당 4P',
        categories: ['hotel'],
        keywords: ['힐튼', 'hilton'],
        earnType: 'points',
        pointsPerUnit: 4,
        unitAmount: 1_500,
        pointCurrencyId: 'hilton',
        verification: 'official',
        source: '2026-11-24 롯데카드 상품 페이지',
      },
    ],
    walletHints: [
      {
        title: '힐튼 주말 무료 숙박권',
        kind: 'stay',
        total: 1,
        unit: '매',
        expiresAt: 'YEAR-END',
        conditions: '지난해 연회비 주기 이용실적 1,200만 원 이상, 금·토·일 1박',
        howTo: '힐튼 아너스 계정 이메일로 숙박권 번호 발송 → 고객센터 예약',
        valueKrw: 250_000,
        verification: 'official',
        note: '가치는 예시 추정',
      },
      {
        title: '국내·해외 공항 라운지 (동반 1인 포함)',
        kind: 'lounge',
        total: 2,
        unit: '회',
        expiresAt: 'YEAR-END',
        conditions: '지난달 이용금액 50만 원 이상, 본인+동반 1인',
        howTo: 'The Lounge 앱에서 카드 등록 후 이용권 발급',
        valueKrw: 45_000,
        verification: 'official',
        note: '1회 가치는 예시',
      },
      {
        title: '힐튼 아너스 실버 등급 + 골드 업그레이드',
        kind: 'status',
        total: 1,
        unit: '등급',
        conditions: '실버 자동 부여, 연 1,200만 원 이용 시 골드',
        verification: 'official',
      },
    ],
    aliases: ['힐튼', '아너스', 'hilton', 'honors', '롯데', '아멕스', 'amex', '호텔'],
    tags: ['호텔', '여행', '프리미엄'],
    verification: 'official',
    source: 'https://www.lottecard.co.kr/app/LPCDADB_V100.lc?vtCdKndC=P14733-A14733',
    sourceNote:
      '2026-11-24 롯데카드 상품 페이지 확인: 연회비(국내 24.7만/AMEX 25만), 적립은 실적 조건·한도 없이 1,500원당 2P(면세점·항공·해외·힐튼 4P), 라운지 연 2회(전월 50만), 주말 숙박권(전년 1,200만). 실적·적립 제외: 세금·공과금·관리비·4대보험·택시·대중교통·고속버스·통행료·상품권·선불카드.',
  },

  // ─────────────────────────────────────────────────────────────
  // 3. 롯데 디지로카 스카이패스
  // ─────────────────────────────────────────────────────────────
  {
    id: 'lotte-digiroca-skypass',
    name: 'DIGILOCA SKYPASS (디지로카 스카이패스)',
    shortName: '디지로카 스카이패스',
    issuer: '롯데카드',
    network: 'MASTERCARD',
    theme: 'violet',
    annualFee: 20_000,
    annualFeeNote: '국내전용·해외겸용 모두 20,000원 (가족 13,000원)',
    performance: performance({
      prevThreshold: 0,
      minPerTransaction: 1_000,
      excludedCategories: [],
      excludedKeywords: [],
      conditions: [{ label: '국내 1마일 · 해외 2마일 적립', amount: 0, note: '전월 실적 조건 없음' }],
    }),
    benefitExclusions: exclusions(
      ['tax', 'transit'],
      [...COMMON_EXCLUDED, '도시가스', '전기요금', '수도요금', 'TV 수신료', '택시', '고속버스', '통행료', '하이패스', '건강보험', '국민연금', '임대료'],
    ),
    memoHint: '전월 실적 없음 (1,000원 미만 결제는 적립 제외)',
    notice:
      '전월 실적 조건이 없는 카드입니다. 국내·해외 모두 1,000원 미만 결제는 적립에서 제외되고, 세금·공과금·대중교통·택시·통행료도 적립에서 빠집니다.',
    benefits: [
      {
        id: 'digiroca-domestic',
        label: '국내 1,000원당 1마일',
        categories: DOMESTIC,
        earnType: 'points',
        pointsPerUnit: 1,
        unitAmount: 1_000,
        pointCurrencyId: 'skypass',
        verification: 'official',
        note: '전월 실적 없이 적립, 월 한도 없음.',
        source: '2026-11-24 롯데카드 상품 페이지',
      },
      {
        id: 'digiroca-overseas',
        label: '해외 1,000원당 2마일',
        categories: ['overseas'],
        earnType: 'points',
        pointsPerUnit: 2,
        unitAmount: 1_000,
        pointCurrencyId: 'skypass',
        monthlyCapPoints: 2_000,
        verification: 'official',
        note: 'MASTER 브랜드는 월 2,000마일 한도(초과분 1마일). AMEX 브랜드는 한도 없음.',
        source: '2026-11-24 롯데카드 상품 페이지',
      },
    ],
    aliases: ['디지로카', '스카이패스', 'skypass', '롯데', '마일리지', '대한항공', '해외'],
    tags: ['항공·마일리지', '여행', '무실적'],
    verification: 'official',
    source: 'https://www.lottecard.co.kr/app/LPCDADB_V100.lc?vtCdKndC=P15672-A15672',
    sourceNote:
      '2026-11-24 롯데카드 상품 페이지 확인: 연회비 2만 원, 전월 실적 없음, 국내 1마일·해외 2마일(MASTER 월 2,000마일 한도). 1,000원 미만 건은 적립·절사 제외. 2024-12-30 출시.',
  },

  // ─────────────────────────────────────────────────────────────
  // 4. 현대카드 대한항공카드 300
  // ─────────────────────────────────────────────────────────────
  {
    id: 'hyundai-koreanair-300',
    name: '대한항공카드 300 (현대카드)',
    shortName: '대한항공 300',
    issuer: '현대카드',
    network: 'VISA',
    theme: 'coral',
    annualFee: 300_000,
    annualFeeNote: '국내전용·Visa Signature 모두 300,000원 (가족 100,000원)',
    performance: performance({
      prevThreshold: 500_000,
      thresholdScope: '기본·추가 적립',
      minPerTransaction: 0,
      // 현대카드 이용금액 합산 제외는 카드론·수수료·공과금·상품권뿐. 대중교통·관리비·등록금은 실적에 포함된다.
      excludedCategories: ['tax'],
      excludedKeywords: ['상품권', '선불카드', '기프트카드', '현금서비스', '카드론', '연회비'],
      conditions: [
        { label: '기본 적립(국내 1,000원당 1마일)', amount: 500_000 },
        { label: '추가 적립(직판·해외·특급호텔·백화점·골프 3마일)', amount: 500_000 },
        { label: '연간 보너스 1만 마일', amount: 0, note: '발급 첫해 100만 원 · 2차년도부터 전년 2,400만 원' },
      ],
    }),
    benefitExclusions: exclusions(
      ['tax'],
      [
        ...COMMON_EXCLUDED,
        '도시가스',
        '전기요금',
        '수도요금',
        '건강보험',
        '국민연금',
        '고용보험',
        '산재보험',
        '통행료',
        '하이패스',
        '고속버스',
        '임대료',
      ],
    ),
    memoHint: '전월 50만 원 미만이면 적립 없음 · 대중교통은 실적 포함',
    notice:
      '전월 50만 원 미만이면 기본·추가 적립이 모두 제공되지 않습니다(신규 발급 시 등록월 다음 달까지 유예). 대중교통과 아파트관리비·등록금은 실적에 포함되지만, 고속도로 통행료·하이패스·공과금은 적립에서 빠집니다.',
    benefits: [
      {
        id: 'hyundai-koreanair-direct',
        label: '대한항공 직판 항공권 1,000원당 3마일',
        categories: ['airline'],
        keywords: ['대한항공'],
        earnType: 'points',
        pointsPerUnit: 3,
        unitAmount: 1_000,
        pointCurrencyId: 'skypass',
        minPrevMonth: 500_000,
        requiresDirect: true,
        verification: 'official',
        note: '연 3만 마일 한도(초과 시 1마일). 대한항공 홈페이지·앱·지점 원화 결제만.',
        source: '2026-01 현대카드 가이드북',
      },
      {
        id: 'hyundai-overseas',
        label: '해외 가맹점 1,000원당 3마일',
        categories: ['overseas'],
        earnType: 'points',
        pointsPerUnit: 3,
        unitAmount: 1_000,
        pointCurrencyId: 'skypass',
        monthlyCapPoints: 6_000,
        minPrevMonth: 500_000,
        verification: 'official',
        note: '월 6,000마일 한도(초과 시 1마일). 외화 결제만.',
        source: '2026-01 현대카드 가이드북',
      },
      {
        id: 'hyundai-special-domestic',
        label: '국내 특급호텔·백화점·골프장 1,000원당 3마일',
        categories: ['hotel', 'department', 'golf'],
        earnType: 'points',
        pointsPerUnit: 3,
        unitAmount: 1_000,
        pointCurrencyId: 'skypass',
        monthlyCapPoints: 6_000,
        minPrevMonth: 500_000,
        verification: 'official',
        note: '월 6,000마일 한도(초과 시 1마일). 백화점은 오프라인 매장만.',
        source: '2026-01 현대카드 가이드북',
      },
      {
        id: 'hyundai-base',
        label: '국내 가맹점 1,000원당 1마일',
        categories: DOMESTIC,
        earnType: 'points',
        pointsPerUnit: 1,
        unitAmount: 1_000,
        pointCurrencyId: 'skypass',
        minPrevMonth: 500_000,
        verification: 'official',
        note: '적립 한도 없음.',
        source: '2026-01 현대카드 가이드북',
      },
    ],
    walletHints: [
      {
        title: '대한항공 직판 국제선 5만 원 할인 쿠폰',
        kind: 'voucher',
        total: 2,
        unit: '장',
        expiresAt: 'YEAR-END',
        conditions: '국제선 항공권 5만 원 이상 원화 결제, 1매당 1장',
        howTo: '대한항공 홈페이지·앱 결제 시 사용',
        valueKrw: 100_000,
        verification: 'official',
      },
      {
        title: '해외 공항 라운지 (THE LOUNGE)',
        kind: 'lounge',
        total: 10,
        unit: '회',
        expiresAt: 'YEAR-END',
        conditions: '전월 50만 원 이상, 연 10회(다른 혜택과 합산)',
        howTo: 'The Lounge 앱에서 이용권 발급',
        valueKrw: 40_000,
        verification: 'example',
        note: '횟수·가치는 확인 자료 기준 예시',
      },
      {
        title: '연간 보너스 1만 마일',
        kind: 'credit',
        total: 1,
        unit: '회',
        conditions: '발급 첫해 누적 100만 원, 2차년도부터 전년 2,400만 원 이상',
        valueKrw: 150_000,
        verification: 'official',
        note: '마일 가치는 예시(1마일 15원)',
      },
    ],
    aliases: ['대한항공', '현대카드', '300', 'koreanair', '스카이패스', '마일리지', '항공'],
    tags: ['항공·마일리지', '여행', '프리미엄'],
    verification: 'official',
    source: 'https://www.hyundaicard.com/upload/card/T_AZW-20260320-1106-30_%EA%B0%80%EC%9D%B4%EB%93%9C%EB%B6%81_%EB%8C%80%ED%95%9C%ED%95%AD%EA%B3%B5_Ed2_300_V1.pdf',
    sourceNote:
      '2026-01 현대카드 가이드북 확인: 연회비 30만 원, 전월 50만 원, 국내 1마일·직판/해외/특급호텔·백화점·골프 3마일, 월 6,000마일·연 3만 마일 한도, 직판 할인 쿠폰 연 2장. 실적 합산 제외는 카드론·수수료·이자·국제브랜드 수수료·공과금·상품권·선불카드뿐이고 대중교통은 실적에 포함됩니다. 라운지 횟수는 example.',
  },

  // ─────────────────────────────────────────────────────────────
  // 5. 삼성 아멕스 플래티늄 (구형)
  // ─────────────────────────────────────────────────────────────
  {
    id: 'samsung-amex-platinum-legacy',
    name: '삼성 아멕스 플래티늄 (구형)',
    shortName: '삼성 아멕스 플래티늄',
    issuer: '삼성카드',
    network: 'AMEX',
    theme: 'emerald',
    annualFee: 700_000,
    annualFeeNote: 'AMEX 700,000원 (기본 9만 + 제휴 61만)',
    performance: performance({
      prevThreshold: 0,
      minPerTransaction: 0,
      excludedCategories: ['tax', 'transit'],
      excludedKeywords: [...COMMON_EXCLUDED, '아파트관리비', '임대료'],
      conditions: [{ label: '면세점·해외·골프·국내 적립', amount: 0, note: '구형 상품 — 카드사 공식 약관 확인 불가' }],
    }),
    benefitExclusions: exclusions(['tax', 'transit'], [...COMMON_EXCLUDED, '아파트관리비']),
    memoHint: '구형 상품 — 적립 한도는 예시값',
    notice:
      '구형(2019년 이전) 상품으로 카드사 공식 약관이 남아 있지 않아 월 적립 한도 등 일부 값이 예시입니다. 실제 청구 전 카드사 안내를 확인하세요.',
    benefits: [
      {
        id: 'samsung-dutyfree',
        label: '면세점 5% 적립',
        categories: ['dutyfree'],
        earnType: 'percent',
        percent: 5,
        monthlyCapKrw: 100_000,
        verification: 'example',
        note: '월 적립 한도는 예시값(10만 원) — 약관 확인 필요',
        source: '구형 상품 안내(2019년 이전)',
      },
      {
        id: 'samsung-overseas',
        label: '해외 결제 2% 적립',
        categories: ['overseas'],
        earnType: 'percent',
        percent: 2,
        monthlyCapKrw: 300_000,
        verification: 'example',
        note: '월 한도는 예시값',
        source: '구형 상품 안내(2019년 이전)',
      },
      {
        id: 'samsung-golf',
        label: '골프장 2% 적립',
        categories: ['golf'],
        earnType: 'percent',
        percent: 2,
        monthlyCapKrw: 100_000,
        verification: 'example',
        note: '월 한도는 예시값',
        source: '구형 상품 안내(2019년 이전)',
      },
      {
        id: 'samsung-domestic',
        label: '국내 일시불·할부 1% 적립',
        categories: DOMESTIC.filter((c) => c !== 'dutyfree' && c !== 'golf'),
        earnType: 'percent',
        percent: 1,
        monthlyCapKrw: 100_000,
        verification: 'example',
        note: '월 한도는 예시값(10만 원)',
        source: '구형 상품 안내(2019년 이전)',
      },
    ],
    walletHints: [
      {
        title: '공항 라운지 이용권',
        kind: 'lounge',
        total: 12,
        unit: '회',
        expiresAt: 'YEAR-END',
        conditions: '본인 1인, 연 12회',
        howTo: '라운지 데스크에서 카드 제시',
        valueKrw: 40_000,
        verification: 'example',
        note: '횟수·가치는 예시',
      },
      {
        title: 'FHR 호텔 크레딧 $100',
        kind: 'credit',
        total: 1,
        unit: '회',
        expiresAt: 'YEAR-END',
        conditions: 'FHR(파인 호텔 & 리조트) 예약 시 1박 이상',
        howTo: 'FHR 경유 예약 후 체크인 시 적용',
        valueKrw: 130_000,
        verification: 'example',
        note: '금액·조건 예시',
      },
      {
        title: '발레파킹 서비스',
        kind: 'valet',
        total: 6,
        unit: '회',
        expiresAt: 'YEAR-END',
        conditions: '제휴 주차장, 월 1회 이내',
        howTo: '제휴 발레파킹 앱에서 카드 등록',
        valueKrw: 20_000,
        verification: 'example',
      },
    ],
    aliases: ['삼성', '아멕스', '플래티늄', '플래티넘', 'amex', 'platinum', '구형', '면세점'],
    tags: ['면세점', '프리미엄'],
    verification: 'example',
    status: 'discontinued',
    statusNote: '2021-03-31 리뉴얼(2021년형) 이후 구형은 신규 발급이 중단되었습니다. 보유 카드 갱신만 가능.',
    source: 'https://www.banksalad.com/product/cards/CARD001498',
    sourceNote:
      '구형 혜택 확인: 면세점 5%·해외/골프 2%·국내 1% 적립, 연회비 70만 원. 구형 상품의 공식 약관이 남아 있지 않아 적립 한도는 예시값이며, 2021년형(기본 1%, 해외·항공 +2%, 골프·주유·호텔 +4%)과 다른 상품입니다.',
  },

  // ─────────────────────────────────────────────────────────────
  // 6. 우리카드 ALL 우리카드 Infinite (아코르)
  // ─────────────────────────────────────────────────────────────
  {
    id: 'woori-all-infinite',
    name: 'ALL 우리카드 Infinite (아코르 제휴)',
    shortName: 'ALL 인피니트',
    issuer: '우리카드',
    network: 'VISA',
    theme: 'navy',
    annualFee: 500_000,
    annualFeeNote: '국내전용·VISA 모두 500,000원 (가족 100,000원)',
    performance: performance({
      // 기본 적립(1.3P)은 실적 무관이지만, 특별적립(5P/3P)·프리미엄 서비스는 전월 50만 원이 기준이다.
      prevThreshold: 500_000,
      thresholdScope: '특별적립·프리미엄 서비스',
      minPerTransaction: 0,
      excludedCategories: ['tax'],
      excludedKeywords: [
        '아파트관리비',
        '임대료',
        '등록금',
        '상품권',
        '기프트카드',
        '선불카드',
        '교통카드 충전',
        '고속버스',
        '정부지원금',
      ],
      conditions: [
        { label: '기본 적립(국내 1,000원당 1.3P)', amount: 0, note: '실적 조건·적립 한도 없음' },
        { label: '특별적립(아코르 5P · 해외 3P)', amount: 500_000, note: '통합 월 4,000P 한도' },
        { label: '프리미엄 서비스(라운지 월 2·연 10, 리무진 연 4, 골프 연 4)', amount: 500_000 },
        { label: '14,000 ALL P 기프트', amount: 0, note: '첫해 연회비 납부 시 · 2차년도부터 전년 1,000만 원 이상' },
      ],
    }),
    benefitExclusions: exclusions(
      ['tax'],
      ['아파트관리비', '임대료', '등록금', '상품권', '기프트카드', '선불카드', '교통카드 충전', '고속버스', '정부지원금'],
    ),
    memoHint: '기본 적립은 실적 무관 · 특별적립·프리미엄은 전월 50만 원',
    notice:
      '기본 적립(국내 1,000원당 1.3P)은 전월 실적과 무관하지만, 특별적립(아코르 5P·해외 3P)과 라운지·리무진·골프 등 프리미엄 서비스는 전월 50만 원 이상일 때 제공됩니다. 특별적립은 합쳐서 월 4,000P 한도이고, 14,000 ALL P 기프트는 2차년도부터 전년 1,000만 원 이상이 조건입니다.',
    benefits: [
      {
        id: 'all-hotel',
        label: '아코르 호텔 숙박·식음 3,000원당 5 ALL P',
        categories: ['hotel', 'dining'],
        keywords: ARCOR_KEYWORDS,
        earnType: 'points',
        pointsPerUnit: 5,
        unitAmount: 3_000,
        pointCurrencyId: 'all',
        minPrevMonth: 500_000,
        monthlyCapPoints: 4_000,
        sharedCapGroup: 'all-special',
        verification: 'official',
        note: '특별적립 통합 월 4,000P 한도(해외 3P와 합산). 초과분은 기본 1.3P.',
        source: '2026-11-24 우리카드 상품 페이지',
      },
      {
        id: 'all-overseas',
        label: '해외 가맹점 3,000원당 3 ALL P',
        categories: ['overseas'],
        earnType: 'points',
        pointsPerUnit: 3,
        unitAmount: 3_000,
        pointCurrencyId: 'all',
        minPrevMonth: 500_000,
        monthlyCapPoints: 4_000,
        sharedCapGroup: 'all-special',
        verification: 'official',
        note: '특별적립 통합 월 4,000P 한도(아코르 5P와 합산).',
        source: '2026-11-24 우리카드 상품 페이지',
      },
      {
        id: 'all-base',
        label: '국내 가맹점 3,000원당 1.3 ALL P',
        categories: DOMESTIC,
        earnType: 'points',
        pointsPerUnit: 1.3,
        unitAmount: 3_000,
        pointCurrencyId: 'all',
        verification: 'official',
        note: '실적 조건 없음, 적립 한도 없음. 간편결제·PG 명의로 승인되면 기본적립.',
        source: '2026-11-24 우리카드 상품 페이지',
      },
    ],
    walletHints: [
      {
        title: '14,000 ALL 리워드 포인트 기프트',
        kind: 'voucher',
        total: 1,
        unit: '회',
        expiresAt: 'YEAR-END',
        conditions: '첫해 연회비 납부 완료 7일 이내, 2차년도부터 전년 1,000만 원 이상',
        valueKrw: 420_000,
        verification: 'official',
        note: '14,000P ≈ 280유로 (1P=€0.02 기준)',
      },
      {
        title: 'ALL Accor Explorer 멤버십 · 1+1 숙박권',
        kind: 'stay',
        total: 2,
        unit: '매',
        expiresAt: 'YEAR-END',
        conditions: '연회비 납부 시 자동 가입, 1+1 숙박권 2매 포함',
        howTo: '아코르 플러스 멤버십에서 예약',
        valueKrw: 200_000,
        verification: 'official',
        note: '가치는 예시',
      },
      {
        title: 'ALL 회원 GOLD 등급',
        kind: 'status',
        total: 1,
        unit: '등급',
        conditions: '연회비 납부 시 자동 부여, 전년 3,500만 원 이용 시 플래티넘',
        verification: 'official',
      },
      {
        title: '국내외 공항 라운지 (동반 1인 포함)',
        kind: 'lounge',
        total: 10,
        unit: '회',
        expiresAt: 'YEAR-END',
        conditions: '전월 50만 원 이상, 월 2회·연 10회',
        howTo: 'The Lounge 앱 이용권 발급',
        valueKrw: 45_000,
        verification: 'official',
        note: '1회 가치는 예시',
      },
      {
        title: 'KAL 리무진 버스 무료 이용',
        kind: 'voucher',
        total: 4,
        unit: '회',
        expiresAt: 'YEAR-END',
        conditions: '전월 50만 원 이상, 월 1회·연 4회',
        valueKrw: 16_000,
        verification: 'official',
      },
      {
        title: '골프장 커피 또는 골프연습장 타석권',
        kind: 'voucher',
        total: 4,
        unit: '회',
        expiresAt: 'YEAR-END',
        conditions: '전월 50만 원 이상, 통합 월 1회·연 4회',
        valueKrw: 20_000,
        verification: 'official',
      },
    ],
    aliases: ['우리', '아코르', 'ALL', '인피니트', 'infinite', 'accor', '호텔', '노보텔', '소피텔'],
    tags: ['호텔', '여행', '프리미엄'],
    verification: 'official',
    source: 'https://pc.wooricard.com/dcpc/CONTENTS/CNTNTS/yh1/H1CRD202S14.do',
    sourceNote:
      '2026-11-24 우리카드·ALL 아코르 페이지 확인: 연회비 50만 원, 3,000원당 아코르 5P·해외 3P·국내 1.3P. 특별적립은 전월 50만 원 이상 + 통합 월 4,000P(본인+가족), 기본적립은 실적·한도 없음. 프리미엄(라운지 월 2·연 10, 리무진 월 1·연 4, 골프 월 1·연 4)은 전월 50만 원. 14,000P 기프트는 첫해 연회비 납부, 2차년도부터 전년 1,000만 원. 실적 제외: 아파트관리비·등록금·국세·지방세·공과금·상품권·선불카드·교통카드 충전·고속버스(대중교통 이용금액은 포함).',
  },

  // ─────────────────────────────────────────────────────────────
  // 7. 삼성 iD EV 카드
  // ─────────────────────────────────────────────────────────────
  {
    id: 'samsung-id-ev',
    name: '삼성 iD EV 카드',
    shortName: 'iD EV',
    issuer: '삼성카드',
    network: 'MASTERCARD',
    theme: 'emerald',
    annualFee: 15_000,
    annualFeeNote: '국내전용·해외겸용(Master) 모두 15,000원',
    performance: performance({
      prevThreshold: 300_000,
      thresholdScope: '전기차 충전 할인',
      minPerTransaction: 0,
      // 삼성카드 전월 이용금액 제외: 대중교통·택시·하이패스 통행료·세금·공과금·관리비·등록금 등
      excludedCategories: ['tax', 'transit'],
      excludedKeywords: [
        ...COMMON_EXCLUDED,
        '아파트관리비',
        '임대료',
        '건강보험',
        '국민연금',
        '고용보험',
        '산재보험',
        '하이패스',
        '통행료',
        '스쿨뱅킹',
        '학교납입금',
      ],
      conditions: [
        { label: '전기차 충전 50% 할인(월 2만 원)', amount: 300_000 },
        { label: '전기차 충전 70% 할인(월 3만 원)', amount: 600_000 },
        { label: '주차·하이패스·배달·스트리밍 할인', amount: 300_000, note: '60만 원 이상이면 한도 확대' },
      ],
    }),
    benefitExclusions: exclusions(
      ['tax', 'transit'],
      [...COMMON_EXCLUDED, '아파트관리비', '하이패스', '통행료', '건강보험', '국민연금'],
    ),
    memoHint: '전월 30만 원 50% / 60만 원 70% · 대중교통은 실적 제외',
    notice:
      '전월 30만 원 이상이면 충전 50%(월 2만 원), 60만 원 이상이면 70%(월 3만 원)입니다. 대중교통·택시·하이패스 통행료는 실적에서 빠지고, 할인받은 결제 건도 실적에 잡히지 않습니다.',
    benefits: [
      {
        id: 'id-ev-charge',
        label: '전기차 충전요금 50% 결제일할인',
        categories: ['ev'],
        earnType: 'percent',
        percent: 50,
        monthlyCapKrw: 20_000,
        minPrevMonth: 300_000,
        verification: 'official',
        note: '전월 60만 원 이상이면 70%·월 30,000원 한도. 아파트 관리비에 포함된 충전요금 제외.',
        source: '2026-11-24 삼성카드 상품 페이지',
      },
      {
        id: 'id-ev-parking',
        label: '주차장·하이패스·대리운전 10% 결제일할인',
        categories: ['parking', 'transit'],
        earnType: 'percent',
        percent: 10,
        monthlyCapKrw: 5_000,
        minPrevMonth: 300_000,
        verification: 'official',
        note: '케이엠파크·고속도로 통행료·카카오 T 대리, 통합 월 5,000원 한도.',
        source: '2026-11-24 삼성카드 상품 페이지',
      },
      {
        id: 'id-ev-delivery',
        label: '배달앱 10% 결제일할인',
        categories: ['delivery'],
        earnType: 'percent',
        percent: 10,
        monthlyCapKrw: 5_000,
        minPrevMonth: 300_000,
        verification: 'official',
        note: '배달의민족·쿠팡이츠. 전월 60만 원 이상이면 월 10,000원 한도.',
        source: '2026-11-24 삼성카드 상품 페이지',
      },
      {
        id: 'id-ev-streaming',
        label: '스트리밍 20% 결제일할인',
        categories: ['streaming'],
        earnType: 'percent',
        percent: 20,
        monthlyCapKrw: 5_000,
        minPrevMonth: 300_000,
        verification: 'official',
        note: '넷플릭스·웨이브·티빙·왓챠·멜론·FLO, 월 5,000원 한도.',
        source: '2026-11-24 삼성카드 상품 페이지',
      },
      {
        id: 'id-ev-overseas',
        label: '해외 1% 결제일할인',
        categories: ['overseas'],
        earnType: 'percent',
        percent: 1,
        verification: 'official',
        note: '전월 실적·한도 없음, 해외겸용 카드만.',
        source: '2026-11-24 삼성카드 상품 페이지',
      },
    ],
    walletHints: [
      {
        title: '현대해상 다이렉트 자동차보험료 3만 원 할인',
        kind: 'credit',
        total: 1,
        unit: '회',
        expiresAt: 'YEAR-END',
        conditions: '연 1회(1.1~12.31), 다이렉트 자동차보험료 결제 시',
        valueKrw: 30_000,
        verification: 'official',
      },
    ],
    aliases: ['삼성', 'iD', 'EV', '전기차', '충전', '아이디', '아이디이브이'],
    tags: ['전기차', '생활'],
    verification: 'official',
    status: 'discontinued',
    statusNote: '신규 발급 중단(갱신·재발급만 가능) 상태로 공시되어 있습니다.',
    source: 'https://www.samsungcard.com/home/card/cardinfo/PGHPPCCCardCardinfoDetails001?code=AAP1747',
    sourceNote:
      '2026-11-24 삼성카드 상품 페이지 확인: 연회비 15,000원, 전월 30만 원(60만 원 이상 구간 별도), 전기차 충전 50/70%, 주차·하이패스·대리운전 10%(월 5천), 배달앱 10%(5천/1만), 스트리밍 20%(월 5천), 해외 1%. 전월 이용금액 제외: 4대보험·국세·지방세·공과금·학교납입금·등록금·대중교통·택시·하이패스 통행료·아파트관리비·상품권·선불카드.',
  },

  // ─────────────────────────────────────────────────────────────
  // 8. 하나카드 그린카드
  // ─────────────────────────────────────────────────────────────
  {
    id: 'hana-green',
    name: '하나카드 그린 카드 (전국형)',
    shortName: '하나 그린',
    issuer: '하나카드',
    network: 'LOCAL',
    theme: 'emerald',
    annualFee: 0,
    annualFeeNote: '연회비 없음',
    performance: performance({
      prevThreshold: 200_000,
      thresholdScope: '국내 이용 기준',
      minPerTransaction: 0,
      // 해외매출·후불교통(대중교통)·제세공과금·아파트관리비·대학등록금·상품권은 전월 실적에서 제외
      excludedCategories: ['tax', 'transit', 'overseas'],
      excludedKeywords: ['아파트관리비', '등록금', '상품권', '제세공과금'],
      conditions: [
        { label: '전 가맹점 0.2~0.8% 적립', amount: 200_000, note: '20만/50만/100만/150만 원 구간' },
        { label: '버스·지하철 10~20%', amount: 200_000, note: '100만 원 이상 20%' },
        { label: 'KTX·고속버스 5%', amount: 200_000 },
      ],
    }),
    benefitExclusions: exclusions(
      ['tax', 'transit'],
      ['아파트관리비', '등록금', '상품권', '무이자'],
    ),
    memoHint: '전월 20만 원(국내 기준) · 해외·대중교통은 실적 제외',
    notice:
      '전월 20만 원 이상(국내 결제 기준)이면 서비스가 제공됩니다. 해외 결제와 후불교통(대중교통), 세금·공과금, 아파트관리비, 대학등록금은 실적에서 빠지지만 교통 적립은 따로 제공됩니다.',
    benefits: [
      {
        id: 'green-base-02',
        label: '국내 전 가맹점 0.2% 에코머니',
        categories: DOMESTIC,
        earnType: 'percent',
        percent: 0.2,
        minPrevMonth: 200_000,
        verification: 'official',
        note: '전월 20만~50만 원 구간.',
        source: '2026-11-24 하나카드 상품 페이지',
      },
      {
        id: 'green-base-04',
        label: '국내 전 가맹점 0.4% 에코머니',
        categories: DOMESTIC,
        earnType: 'percent',
        percent: 0.4,
        minPrevMonth: 500_000,
        verification: 'official',
        note: '전월 50만~100만 원 구간.',
        source: '2026-11-24 하나카드 상품 페이지',
      },
      {
        id: 'green-base-06',
        label: '국내 전 가맹점 0.6% 에코머니',
        categories: DOMESTIC,
        earnType: 'percent',
        percent: 0.6,
        minPrevMonth: 1_000_000,
        verification: 'official',
        note: '전월 100만~150만 원 구간.',
        source: '2026-11-24 하나카드 상품 페이지',
      },
      {
        id: 'green-base-08',
        label: '국내 전 가맹점 0.8% 에코머니',
        categories: DOMESTIC,
        earnType: 'percent',
        percent: 0.8,
        minPrevMonth: 1_500_000,
        verification: 'official',
        note: '전월 150만 원 이상 구간.',
        source: '2026-11-24 하나카드 상품 페이지',
      },
      {
        id: 'green-top2-1',
        label: '가장 많이 쓴 2개 업종 1% (5배 적립)',
        categories: ['department', 'fuel'],
        earnType: 'percent',
        percent: 1,
        monthlyCapPoints: 10_000,
        minPrevMonth: 200_000,
        verification: 'example',
        note: '5대 업종(대형마트·백화점·학원·병의원·주유) 중 월 매출 상위 2개에만 적용, 업종별 5,000·통합 10,000 한도. 앱에서는 백화점·주유 업종으로 근사.',
        source: '2026-11-24 하나카드 상품 페이지',
      },
      {
        id: 'green-top2-2',
        label: '가장 많이 쓴 2개 업종 2% (5배 적립)',
        categories: ['department', 'fuel'],
        earnType: 'percent',
        percent: 2,
        monthlyCapPoints: 10_000,
        minPrevMonth: 500_000,
        verification: 'example',
        note: '전월 50만~100만 원 구간. 상위 2개 업종에만 적용(근사 모델).',
        source: '2026-11-24 하나카드 상품 페이지',
      },
      {
        id: 'green-top2-4',
        label: '가장 많이 쓴 2개 업종 4% (5배 적립)',
        categories: ['department', 'fuel'],
        earnType: 'percent',
        percent: 4,
        monthlyCapPoints: 10_000,
        minPrevMonth: 1_500_000,
        verification: 'example',
        note: '전월 150만 원 이상 구간. 상위 2개 업종에만 적용(근사 모델).',
        source: '2026-11-24 하나카드 상품 페이지',
      },
      {
        id: 'green-transit-10',
        label: '버스·지하철 10% 에코머니',
        categories: ['transit'],
        keywords: ['버스', '지하철', '후불교통'],
        earnType: 'percent',
        percent: 10,
        monthlyCapPoints: 5_000,
        minPrevMonth: 200_000,
        verification: 'official',
        note: '버스+지하철 월 1만 원 이상 이용 시. 교통 통합 월 5,000P 한도(전월 20만~100만).',
        source: '2026-11-24 하나카드 상품 페이지',
      },
      {
        id: 'green-transit-20',
        label: '버스·지하철 20% 에코머니',
        categories: ['transit'],
        keywords: ['버스', '지하철', '후불교통'],
        earnType: 'percent',
        percent: 20,
        monthlyCapPoints: 10_000,
        minPrevMonth: 1_000_000,
        verification: 'official',
        note: '전월 100만 원 이상, 교통 통합 월 10,000P 한도.',
        source: '2026-11-24 하나카드 상품 페이지',
      },
      {
        id: 'green-ktx',
        label: 'KTX·고속버스 5% 에코머니',
        categories: ['transit'],
        keywords: ['ktx', '고속버스', 'srt'],
        earnType: 'percent',
        percent: 5,
        monthlyCapPoints: 5_000,
        minPrevMonth: 200_000,
        verification: 'official',
        note: '일 1회, 월 2회. 교통 통합 한도 내.',
        source: '2026-11-24 하나카드 상품 페이지',
      },
    ],
    aliases: ['하나', '그린', 'green', '에코머니', '환경', '친환경'],
    tags: ['대중교통', '생활', '연회비 없음'],
    verification: 'official',
    status: 'discontinued',
    statusNote: '신규 발급이 종료된 상품으로 공시되어 있습니다(2026-11-05 확인). 기존 보유 카드는 유지.',
    source: 'https://www.hanacard.co.kr/PI41000000D.web?CD_PD_SEQ=1215',
    sourceNote:
      '2026-11-24 하나카드 상품 페이지 확인: 연회비 없음, 전월 20만 원, 전 가맹점 0.2~0.8% 구간 적립, 대중교통 10~20%·KTX 5%(통합 5,000/10,000P), 5대 업종 5배. 실적 산정 제외: 해외매출·제세공과금·상품권·대학등록금·아파트관리비·후불교통. 상위 2개 업종 적립은 근사 모델(example).',
  },

  // ─────────────────────────────────────────────────────────────
  // 9. MG+ S 하나카드
  // ─────────────────────────────────────────────────────────────
  {
    id: 'mg-s-hana',
    name: 'MG+ S 하나카드',
    shortName: 'MG+ S 하나',
    issuer: '하나카드',
    network: 'MASTERCARD',
    theme: 'violet',
    annualFee: 17_000,
    annualFeeNote: '국내전용·해외겸용(Master) 모두 17,000원',
    performance: performance({
      prevThreshold: 300_000,
      thresholdScope: '통합 할인',
      minPerTransaction: 0,
      excludedCategories: ['tax'],
      excludedKeywords: [
        '수도요금',
        '전기요금',
        '도시가스',
        '아파트관리비',
        '스쿨뱅킹',
        '등록금',
        '상품권',
        '기프트카드',
        '선불카드',
        '하나머니 충전',
        '건강보험',
        '국민연금',
        '고용보험',
        '산재보험',
        '임대료',
      ],
      conditions: [
        { label: '통합 할인 한도', amount: 300_000, note: '30만 원 15,000원' },
        { label: '통합 할인 한도', amount: 600_000, note: '60만 원 30,000원' },
        { label: '통합 할인 한도', amount: 1_000_000, note: '100만 원 이상 60,000원' },
      ],
    }),
    benefitExclusions: exclusions(
      ['tax'],
      [
        '수도요금',
        '전기요금',
        '도시가스',
        '아파트관리비',
        '스쿨뱅킹',
        '등록금',
        '상품권',
        '기프트카드',
        '선불카드',
        '하나머니 충전',
        '건강보험',
        '국민연금',
        '무이자',
        '임대료',
      ],
    ),
    memoHint: '전월 30/60/100만 원 · 통합 한도 1.5/3/6만 원',
    notice:
      '전월 30/60/100만 원 구간에 따라 통합 할인 한도가 15,000/30,000/60,000원입니다. 간편결제·스트리밍·디지털 멤버십 할인이 이 한도를 함께 씁니다. 세금·공과금·관리비·4대보험·등록금은 실적에서 빠집니다.',
    benefits: [
      {
        id: 'mgs-pay-15',
        label: '간편결제 10% 청구할인 (월 15,000원 한도)',
        categories: ['simplepay'],
        earnType: 'percent',
        percent: 10,
        monthlyCapKrw: 15_000,
        minTransaction: 10_000,
        minPrevMonth: 300_000,
        sharedCapGroup: 'mg-total',
        verification: 'official',
        note: '건당 1만 원 이상, 전월 30만~60만 원 구간.',
        source: '2026-11-24 하나카드 상품 페이지',
      },
      {
        id: 'mgs-pay-30',
        label: '간편결제 10% 청구할인 (월 30,000원 한도)',
        categories: ['simplepay'],
        earnType: 'percent',
        percent: 10,
        monthlyCapKrw: 30_000,
        minTransaction: 10_000,
        minPrevMonth: 600_000,
        sharedCapGroup: 'mg-total',
        verification: 'official',
        note: '건당 1만 원 이상, 전월 60만~100만 원 구간.',
        source: '2026-11-24 하나카드 상품 페이지',
      },
      {
        id: 'mgs-pay-60',
        label: '간편결제 10% 청구할인 (월 60,000원 한도)',
        categories: ['simplepay'],
        earnType: 'percent',
        percent: 10,
        monthlyCapKrw: 60_000,
        minTransaction: 10_000,
        minPrevMonth: 1_000_000,
        sharedCapGroup: 'mg-total',
        verification: 'official',
        note: '건당 1만 원 이상, 전월 100만 원 이상 구간.',
        source: '2026-11-24 하나카드 상품 페이지',
      },
      {
        id: 'mgs-streaming',
        label: '영상 스트리밍 50% 청구할인',
        categories: ['streaming'],
        keywords: ['유튜브', '디즈니', '웨이브', '넷플릭스', '티빙'],
        earnType: 'percent',
        percent: 50,
        monthlyCapKrw: 30_000,
        minPrevMonth: 300_000,
        sharedCapGroup: 'mg-total',
        verification: 'official',
        note: '월 정기결제만. 통합 한도(15,000/30,000/60,000원) 내에서 적용 — 표시 한도는 60만 원 구간 기준.',
        source: '2026-11-24 하나카드 상품 페이지',
      },
      {
        id: 'mgs-membership',
        label: '디지털 멤버십 50% 청구할인',
        categories: ['streaming'],
        keywords: ['네이버플러스', '컬리', '쿠팡와우', '멤버십'],
        earnType: 'percent',
        percent: 50,
        monthlyCapKrw: 30_000,
        minPrevMonth: 300_000,
        sharedCapGroup: 'mg-total',
        verification: 'official',
        note: '네이버플러스·컬리멤버스·쿠팡와우 월 정기결제. 통합 한도 내 — 표시 한도는 60만 원 구간 기준.',
        source: '2026-11-24 하나카드 상품 페이지',
      },
    ],
    aliases: ['MG', '새마을금고', '하나', '엠지', '간편결제', 'OTT', '스트리밍'],
    tags: ['간편결제', '생활'],
    verification: 'official',
    status: 'discontinued',
    statusNote: '2025-10-17 신규·추가·갱신 발급 중단(판매 한도 소진). 기존 보유 카드는 유지.',
    source: 'https://m.hanacard.co.kr/MGINTROM.web?CD_PD_SEQ=18590',
    sourceNote:
      '2026-11-24 하나카드 약관(2025-06-16판)·상품 페이지 확인: 연회비 17,000원, 전월 30만 원, 간편결제 10%(건당 1만 원 이상), 스트리밍·디지털 멤버십 50%, 통합 월 15,000/30,000/60,000원 한도. 실적 제외: 국세·지방세·수도/전기·도시가스·공과금·아파트관리비·4대보험·스쿨뱅킹·등록금·상품권·선불카드 충전·임대료.',
  },

  // ─────────────────────────────────────────────────────────────
  // 10. BC 바로 그린카드
  // ─────────────────────────────────────────────────────────────
  {
    id: 'bc-green',
    name: '[BC바로] 그린카드',
    shortName: 'BC 그린',
    issuer: 'BC카드',
    network: 'LOCAL',
    theme: 'emerald',
    annualFee: 0,
    annualFeeNote: '연회비 없음 (후불교통카드 발급)',
    performance: performance({
      prevThreshold: 200_000,
      thresholdScope: '국내 이용 기준',
      minPerTransaction: 0,
      excludedCategories: ['tax', 'transit', 'overseas'],
      excludedKeywords: ['아파트관리비', '등록금', '상품권', '제세공과금'],
      conditions: [
        { label: '전 가맹점 0.2~0.8% 적립', amount: 200_000, note: '20만/50만/100만/150만 원 구간' },
        { label: '버스·지하철 10~20%', amount: 200_000, note: '100만 원 이상 20%' },
        { label: 'KTX·고속버스 5%', amount: 200_000 },
      ],
    }),
    benefitExclusions: exclusions(['tax', 'transit'], ['아파트관리비', '등록금', '상품권', '무이자']),
    memoHint: '전월 20만 원(국내 기준) · 해외·대중교통은 실적 제외',
    notice:
      '전월 20만 원 이상(국내 결제 기준)이면 서비스가 제공됩니다. 해외 결제와 후불교통(대중교통), 세금·공과금, 아파트관리비, 대학등록금은 실적에서 빠지지만 교통 적립은 따로 제공됩니다.',
    benefits: [
      {
        id: 'bcgreen-base-02',
        label: '국내 전 가맹점 0.2% 에코머니',
        categories: DOMESTIC,
        earnType: 'percent',
        percent: 0.2,
        minPrevMonth: 200_000,
        verification: 'official',
        note: '전월 20만~50만 원 구간.',
        source: '2026-11-24 BC카드 상품 페이지',
      },
      {
        id: 'bcgreen-base-08',
        label: '국내 전 가맹점 0.8% 에코머니',
        categories: DOMESTIC,
        earnType: 'percent',
        percent: 0.8,
        minPrevMonth: 1_500_000,
        verification: 'official',
        note: '전월 150만 원 이상 구간(50만~100만 0.4%, 100만~150만 0.6%).',
        source: '2026-11-24 BC카드 상품 페이지',
      },
      {
        id: 'bcgreen-transit-10',
        label: '버스·지하철 10% 에코머니',
        categories: ['transit'],
        keywords: ['버스', '지하철', '후불교통'],
        earnType: 'percent',
        percent: 10,
        monthlyCapPoints: 5_000,
        minPrevMonth: 200_000,
        verification: 'official',
        note: '버스+지하철 월 1만 원 이상, 교통 통합 월 5,000P 한도.',
        source: '2026-11-24 BC카드 상품 페이지',
      },
      {
        id: 'bcgreen-transit-20',
        label: '버스·지하철 20% 에코머니',
        categories: ['transit'],
        keywords: ['버스', '지하철', '후불교통'],
        earnType: 'percent',
        percent: 20,
        monthlyCapPoints: 10_000,
        minPrevMonth: 1_000_000,
        verification: 'official',
        note: '전월 100만 원 이상, 교통 통합 월 10,000P 한도.',
        source: '2026-11-24 BC카드 상품 페이지',
      },
      {
        id: 'bcgreen-ktx',
        label: 'KTX·고속버스 5% 에코머니',
        categories: ['transit'],
        keywords: ['ktx', '고속버스', 'srt'],
        earnType: 'percent',
        percent: 5,
        monthlyCapPoints: 5_000,
        minPrevMonth: 200_000,
        verification: 'official',
        note: '일 1회, 월 2회. 교통 통합 한도 내.',
        source: '2026-11-24 BC카드 상품 페이지',
      },
      {
        id: 'bcgreen-top2-4',
        label: '가장 많이 쓴 2개 업종 4% (5배 적립)',
        categories: ['department', 'fuel'],
        earnType: 'percent',
        percent: 4,
        monthlyCapPoints: 10_000,
        minPrevMonth: 1_500_000,
        verification: 'example',
        note: '5대 업종 중 월 매출 상위 2개에만 적용, 업종별 5,000·통합 10,000 한도. 상위 2개 업종은 근사 모델.',
        source: '2026-11-24 BC카드 상품 페이지',
      },
    ],
    aliases: ['BC', '비씨', '그린', 'green', '에코머니', '환경'],
    tags: ['대중교통', '생활', '연회비 없음'],
    verification: 'official',
    source: 'https://www.bccard.com/app/card/CardIntdMain.do?bcardNo=h&gdsno=100980',
    sourceNote:
      '2026-11-24 BC카드 상품 페이지 확인: 연회비 없음, 전월 20만 원, 전 가맹점 0.2~0.8%, 대중교통 10~20%·KTX 5%(통합 5,000/10,000P), 5대 업종 5배. 실적 산정 제외: 해외매출·제세공과금·상품권·대학등록금·아파트관리비·후불교통. 상위 2개 업종 적립은 근사 모델(example).',
  },

  // ─────────────────────────────────────────────────────────────
  // 11. 삼성 아멕스 플래티늄 (2021년형)
  // ─────────────────────────────────────────────────────────────
  {
    id: 'samsung-amex-platinum-2021',
    name: '삼성 아멕스 플래티늄 (2021년형)',
    shortName: '삼성 플래티늄 2021',
    issuer: '삼성카드',
    network: 'AMEX',
    theme: 'emerald',
    annualFee: 700_000,
    annualFeeNote: 'AMEX 700,000원 (기본 9만 + 제휴 61만)',
    performance: performance({
      prevThreshold: 1_000_000,
      thresholdScope: '추가 적립(2%·4%)',
      minPerTransaction: 0,
      excludedCategories: ['tax', 'transit'],
      excludedKeywords: [
        ...COMMON_EXCLUDED,
        '아파트관리비',
        '임대료',
        '건강보험',
        '국민연금',
        '고용보험',
        '산재보험',
        '스쿨뱅킹',
      ],
      conditions: [
        { label: '기본 1% 적립', amount: 0, note: '전월 실적·한도 없음' },
        { label: '해외·항공 추가 2%', amount: 1_000_000, note: '통합 월 15,000P' },
        { label: '골프·주유·호텔 추가 4%', amount: 1_000_000, note: '통합 월 15,000P' },
        { label: '추가 적립 한도 확대', amount: 2_000_000, note: '통합 월 40,000P' },
      ],
    }),
    benefitExclusions: exclusions(
      ['tax', 'transit'],
      [...COMMON_EXCLUDED, '아파트관리비', '임대료', '고속버스', '통행료', '하이패스', '건강보험', '국민연금'],
    ),
    memoHint: '기본 1%는 실적 무관 · 추가 2·4%는 전월 100만 원',
    notice:
      '기본 1%는 전월 실적과 무관하고, 추가 2%·4%는 전월 100만 원 이상(통합 월 15,000P)·200만 원 이상(40,000P)일 때 적용됩니다. 대중교통·택시·세금·공과금·관리비는 실적에서 빠집니다.',
    benefits: [
      {
        id: 'samsung21-base',
        label: '국내외 가맹점 1% 멤버십리워즈',
        categories: ALL_CATEGORIES,
        earnType: 'percent',
        percent: 1,
        verification: 'official',
        note: '전월 실적·한도 없이 기본 1%.',
        source: '2026-11-24 아멕스 코리아 상품 페이지',
      },
      {
        id: 'samsung21-overseas',
        label: '해외 가맹점 추가 2%',
        categories: ['overseas'],
        earnType: 'percent',
        percent: 2,
        monthlyCapPoints: 15_000,
        minPrevMonth: 1_000_000,
        sharedCapGroup: 'samsung21-extra',
        verification: 'official',
        note: '전월 100만 원 이상 통합 월 15,000P, 200만 원 이상 40,000P 한도.',
        source: '2026-11-24 아멕스 코리아 상품 페이지',
      },
      {
        id: 'samsung21-airline',
        label: '대한항공·아시아나·제주·진에어 추가 2%',
        categories: ['airline'],
        keywords: ['대한항공', '아시아나', '제주항공', '진에어'],
        earnType: 'percent',
        percent: 2,
        monthlyCapPoints: 15_000,
        minPrevMonth: 1_000_000,
        requiresDirect: true,
        sharedCapGroup: 'samsung21-extra',
        verification: 'official',
        note: '항공사 공식 홈페이지·앱 결제만(여행사 제외). 통합 월 한도.',
        source: '2026-11-24 아멕스 코리아 상품 페이지',
      },
      {
        id: 'samsung21-golf',
        label: '골프·주유·호텔 추가 4%',
        categories: ['golf', 'fuel', 'hotel'],
        earnType: 'percent',
        percent: 4,
        monthlyCapPoints: 15_000,
        minPrevMonth: 1_000_000,
        sharedCapGroup: 'samsung21-extra',
        verification: 'official',
        note: '골프·호텔은 국내 오프라인 결제만. 통합 월 15,000P(200만 원 이상 40,000P).',
        source: '2026-11-24 아멕스 코리아 상품 페이지',
      },
    ],
    walletHints: [
      {
        title: '국내 특급 호텔 25만 원 현장할인',
        kind: 'credit',
        total: 2,
        unit: '회',
        expiresAt: 'YEAR-END',
        conditions: '지정 호텔 객실·다이닝, 25만 원 × 연 2회',
        valueKrw: 500_000,
        verification: 'official',
      },
      {
        title: '해외·백화점 5만 원 결제일할인',
        kind: 'credit',
        total: 2,
        unit: '회',
        expiresAt: 'YEAR-END',
        conditions: '해외 가맹점·해외 직구 또는 국내 백화점 오프라인, 5만 원 × 연 2회',
        valueKrw: 100_000,
        verification: 'official',
      },
      {
        title: '공항 라운지·발렛파킹',
        kind: 'lounge',
        total: 1,
        unit: '종',
        conditions: '아멕스 플래티넘 등급 서비스',
        verification: 'example',
        note: '세부 횟수는 아멕스 정책에 따라 변동',
      },
    ],
    aliases: ['삼성', '아멕스', '플래티늄', '플래티넘', '2021', '리뉴얼', 'amex', 'platinum'],
    tags: ['프리미엄', '면세점'],
    verification: 'official',
    status: 'discontinued',
    statusNote: '2023-04-30 발급 중단. 구형과 혜택이 달라 별도 상품으로 표기합니다.',
    source: 'https://www.americanexpress.com/ko-kr/network/credit-cards/samsung/platinum-card.html',
    sourceNote:
      '2026-11-24 아멕스 코리아 확인: 연회비 70만 원, 기본 1%(실적 무관·한도 없음), 해외·항공 추가 2%, 골프·주유·호텔 추가 4%, 전월 100만/200만 원 구간별 통합 월 15,000/40,000P. 전월 이용금액 제외: 4대보험·국세·지방세·공과금·학교납입금·등록금·대중교통·택시·아파트관리비·상품권·선불카드.',
  },

  // ─────────────────────────────────────────────────────────────
  // 12. 네이버페이 신한카드
  // ─────────────────────────────────────────────────────────────
  {
    id: 'shinhan-naverpay',
    name: '네이버페이 신한카드',
    shortName: '네이버페이 신한',
    issuer: '신한카드',
    network: 'VISA',
    theme: 'coral',
    annualFee: 30_000,
    annualFeeNote: '국내전용 27,000원 / VISA 30,000원',
    performance: performance({
      prevThreshold: 0,
      minPerTransaction: 0,
      excludedCategories: [],
      excludedKeywords: [],
      conditions: [{ label: '전 가맹점 1% · 네이버페이 간편결제 +2%', amount: 0, note: '전월 실적 조건 없음' }],
    }),
    benefitExclusions: exclusions(
      ['tax'],
      ['수도요금', '도시가스', '전기요금', '아파트관리비', '등록금', '스쿨뱅킹', '상품권', '선불카드', '건강보험', '국민연금', '무이자'],
    ),
    memoHint: '전월 실적 없음',
    notice:
      '전월 실적 조건이 없는 카드입니다. 세금·공과금·관리비·등록금은 적립에서만 빠지고(실적 개념 없음), 네이버페이 간편결제 2% 추가 적립은 월 1만 포인트 한도입니다.',
    benefits: [
      {
        id: 'npay-base',
        label: '국내외 모든 가맹점 1% 네이버페이 포인트',
        categories: ALL_CATEGORIES,
        earnType: 'percent',
        percent: 1,
        verification: 'official',
        note: '전월 실적·적립 한도 없음.',
        source: '2026-11-24 신한카드 상품 안내',
      },
      {
        id: 'npay-extra',
        label: '네이버페이 카드간편결제 추가 2%',
        categories: ['simplepay', 'online'],
        keywords: ['네이버', 'naver', 'npay'],
        earnType: 'percent',
        percent: 2,
        monthlyCapKrw: 10_000,
        verification: 'official',
        note: '온라인 가맹점 결제 50만 원까지(최대 1만 포인트). 기본 1%와 중복되어 최대 3%.',
        source: '2026-11-24 신한카드 상품 안내',
      },
    ],
    aliases: ['네이버페이', '네이버', 'npay', '신한', '포인트', '온라인쇼핑'],
    tags: ['간편결제', '생활', '무실적'],
    verification: 'official',
    source: 'https://www.shinhancard.com/pconts/html/card/apply/credit/1200258_2205.html',
    sourceNote:
      '2026-11-24 확인: 연회비 국내 27,000/VISA 30,000원, 전월 실적 없음, 전 가맹점 1% + 네이버페이 간편결제 2%(월 50만 원·1만 포인트 한도). 적립 제외: 국세·지방세·수도·도시가스·전기·4대보험·관리비·등록금·상품권·선불카드.',
  },

  // ─────────────────────────────────────────────────────────────
  // 13. 현대카드M
  // ─────────────────────────────────────────────────────────────
  {
    id: 'hyundai-m',
    name: '현대카드M',
    shortName: '현대카드M',
    issuer: '현대카드',
    network: 'VISA',
    theme: 'graphite',
    annualFee: 30_000,
    annualFeeNote: '국내전용·Visa/Amex Platinum 모두 30,000원',
    performance: performance({
      prevThreshold: 500_000,
      thresholdScope: '기본 1.5% 적립',
      minPerTransaction: 0,
      excludedCategories: ['tax'],
      excludedKeywords: ['상품권', '선불카드', '기프트카드', '현금서비스', '카드론', '연회비'],
      conditions: [
        { label: '기본 1.5% M포인트', amount: 500_000, note: '한도 없음' },
        { label: '온라인쇼핑·음식점·해외 5%', amount: 1_000_000, note: '통합 월 1만 M포인트' },
      ],
    }),
    benefitExclusions: exclusions(
      ['tax', 'parking'],
      [
        ...COMMON_EXCLUDED,
        '전기요금',
        '도시가스',
        '아파트관리비',
        '건강보험',
        '국민연금',
        '고용보험',
        '산재보험',
        '통행료',
        '하이패스',
        '고속버스',
      ],
    ),
    memoHint: '기본 1.5%는 전월 50만 원 · 5%는 100만 원',
    notice:
      '기본 1.5%는 전월 50만 원, 추가 5%는 전월 100만 원 이상일 때 적용됩니다. 세금·공과금과 상품권·선불카드는 실적에서 제외되고, 통행료·하이패스·등록금은 적립에서 빠집니다.',
    benefits: [
      {
        id: 'm-base',
        label: '국내외 가맹점 1.5% M포인트',
        categories: ALL_CATEGORIES,
        earnType: 'percent',
        percent: 1.5,
        minPrevMonth: 500_000,
        verification: 'official',
        note: '전월 50만 원 이상, 1회·연간 적립 한도 없음.',
        source: '2026-11-24 현대카드 상품 안내',
      },
      {
        id: 'm-special',
        label: '온라인쇼핑·일반음식점·해외 5% M포인트',
        categories: ['online', 'dining', 'overseas'],
        earnType: 'percent',
        percent: 5,
        monthlyCapPoints: 10_000,
        minPrevMonth: 1_000_000,
        verification: 'official',
        note: '전월 100만 원 이상, 대상점 통합 월 1만 M포인트 한도(초과 시 1.5%).',
        source: '2026-11-24 현대카드 상품 안내',
      },
    ],
    aliases: ['현대', 'M', '엠', 'M포인트', '현대카드M', '현대카드엠'],
    tags: ['생활'],
    verification: 'official',
    source: 'https://www.hyundaicard.com/docfiles/cms/card/PC_CPCMA0101_01_PT_CMS02.html',
    sourceNote:
      '2026-11-24 현대카드 확인: 연회비 30,000원, 전월 50만 원 이상 1.5%, 전월 100만 원 이상 온라인쇼핑·일반음식점·해외 5%(월 1만 M포인트). 실적 합산 제외: 공과금(국세·지방세 포함)·상품권·선불카드·카드론·수수료. 대중교통은 실적에 포함.',
  },

  // ─────────────────────────────────────────────────────────────
  // 14. 하나 트래블로그 체크카드
  // ─────────────────────────────────────────────────────────────
  {
    id: 'hana-travelog-check',
    name: '트래블로그 체크카드 (하나카드)',
    shortName: '트래블로그',
    issuer: '하나카드',
    network: 'MASTERCARD',
    theme: 'violet',
    annualFee: 0,
    annualFeeNote: '연회비 없음 (체크카드)',
    performance: performance({
      prevThreshold: 0,
      minPerTransaction: 0,
      excludedCategories: [],
      excludedKeywords: [],
      conditions: [{ label: '국내 0.3% 하나머니 · 해외 수수료 면제', amount: 0, note: '전월 실적 조건 없음' }],
    }),
    benefitExclusions: exclusions(
      ['tax'],
      [
        '수도요금',
        '전기요금',
        '도시가스',
        '아파트관리비',
        '등록금',
        '스쿨뱅킹',
        '상품권',
        '기프트카드',
        '선불카드',
        '하나머니 충전',
        '건강보험',
        '국민연금',
        'ATM',
      ],
    ),
    memoHint: '전월 실적 없음 (체크카드)',
    notice:
      '전월 실적·적립 한도가 없는 체크카드입니다. 국내 0.3% 하나머니 적립에서 세금·공과금·관리비·등록금은 제외됩니다. 해외 가맹점·ATM 수수료는 면제(현지 ATM 수수료 별도)입니다.',
    benefits: [
      {
        id: 'travelog-domestic',
        label: '국내 가맹점 0.3% 하나머니 적립',
        categories: DOMESTIC,
        earnType: 'percent',
        percent: 0.3,
        verification: 'official',
        note: '원화 하나머니 결제 기준, 전월 실적·한도 없음.',
        source: '2026-11-24 하나카드 트래블로그 안내',
      },
      {
        id: 'travelog-overseas-fee',
        label: '해외 이용·ATM 수수료 면제 (적립 아님)',
        categories: ['overseas'],
        earnType: 'percent',
        percent: 0,
        verification: 'official',
        note: '해외서비스 수수료(건당 $0.5)·국제브랜드 수수료(1%) 면제, ATM 인출 수수료 면제. 현지 ATM 운영사 수수료는 별도. 적립 혜택은 아님.',
        source: '2026-11-24 하나카드 트래블로그 안내',
      },
    ],
    aliases: ['트래블로그', 'travelog', '하나', '체크', '환전', '여행', '해외'],
    tags: ['여행', '연회비 없음', '무실적'],
    verification: 'official',
    source: 'https://app.hanamembership.com/gw/gsp/gSP00201m.do',
    sourceNote:
      '2026-11-24 하나카드 확인: 연회비 없음, 전월 실적 없음, 국내 0.3% 하나머니(한도 없음), 해외 가맹점·ATM 수수료 면제(현지 ATM 수수료 별도), 58종 통화 무료환전(4종 상시·54종 2027-12-31까지). 적립 제외: 세금·공과금·4대보험·관리비·등록금·상품권·선불카드 충전·ATM.',
  },
];

export const CATALOG: CatalogCard[] = CATALOG_LIST;

export const CATALOG_BY_ID: Record<string, CatalogCard> = CATALOG_LIST.reduce(
  (acc, card) => ({ ...acc, [card.id]: card }),
  {} as Record<string, CatalogCard>,
);

/** 빠른 선택 칩 */
export const CATALOG_TAGS = ['호텔', '항공·마일리지', '면세점', '여행', '전기차', '대중교통', '간편결제', '프리미엄', '연회비 없음'];

function normalize(text: string): string {
  return text.toLowerCase().replace(/[\s\-_()™·.,/]/g, '');
}

/**
 * 카드명·카드사·키워드·태그로 카탈로그를 검색한다.
 * 모든 검색어 토큰이 이름/별칭/카드사/태그 중 하나에 포함되어야 한다.
 */
export function searchCatalog(query: string, tag?: string | null): CatalogCard[] {
  const tokens = query
    .trim()
    .split(/\s+/)
    .map(normalize)
    .filter(Boolean);

  const scored = CATALOG_LIST.filter((card) => !tag || card.tags.includes(tag))
    .map((card, index) => {
      const name = normalize(card.name);
      const shortName = normalize(card.shortName);
      const issuer = normalize(card.issuer);
      const aliases = card.aliases.map(normalize);
      const tags = card.tags.map(normalize);
      const haystack = [name, shortName, issuer, ...aliases, ...tags].join('|');

      const matchesAll = tokens.every((t) => haystack.includes(t));
      if (!matchesAll) return null;

      let score = 0;
      for (const token of tokens) {
        if (shortName === token) score += 60;
        else if (name.includes(token)) score += 35;
        else if (shortName.includes(token)) score += 30;
        else if (aliases.includes(token)) score += 28;
        else if (aliases.some((a) => a.includes(token))) score += 18;
        else if (issuer.includes(token)) score += 12;
        else if (tags.some((t) => t.includes(token))) score += 10;
      }
      return { card, score, index };
    })
    .filter((row): row is { card: CatalogCard; score: number; index: number } => row !== null);

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.index - b.index;
  });
  return scored.map((row) => row.card);
}

/** 카탈로그의 대표 바우처 힌트를 지갑 항목으로 바꾼다. */
export function walletItemsFromHints(entry: CatalogCard, cardId: string, today: Date = new Date()): WalletItem[] {
  return (entry.walletHints ?? []).map((hint, index) => ({
    id: `w-${cardId}-${index}`,
    cardId,
    title: hint.title,
    kind: hint.kind,
    remaining: hint.remaining ?? hint.total,
    total: hint.total,
    unit: hint.unit,
    expiresAt: hint.expiresAt === 'YEAR-END' ? `${today.getFullYear()}-12-31` : hint.expiresAt,
    conditions: hint.conditions,
    howTo: hint.howTo,
    valueKrw: hint.valueKrw,
    verification: hint.verification,
    note: hint.note,
  }));
}

/** 카탈로그 항목의 상품 조건 스냅샷(사용자 수정 판별·마이그레이션 기준) */
export function snapshotOf(entry: CatalogCard): CatalogConditionSnapshot {
  return {
    catalogVersion: CATALOG_CONDITIONS_VERSION,
    annualFee: entry.annualFee,
    prevThreshold: entry.performance.prevThreshold,
    minPerTransaction: entry.performance.minPerTransaction,
    excludedCategories: [...entry.performance.excludedCategories],
    excludedKeywords: [...(entry.performance.excludedKeywords ?? [])],
    benefitExclusions: {
      categories: [...(entry.benefitExclusions?.categories ?? [])],
      keywords: [...(entry.benefitExclusions?.keywords ?? [])],
    },
    benefitIds: entry.benefits.map((rule) => rule.id),
  };
}

function clonePerformance(entry: CatalogCard): PerformanceRule {
  return {
    prevThreshold: entry.performance.prevThreshold,
    thresholdScope: entry.performance.thresholdScope,
    minPerTransaction: entry.performance.minPerTransaction,
    excludedCategories: [...entry.performance.excludedCategories],
    excludedKeywords: entry.performance.excludedKeywords ? [...entry.performance.excludedKeywords] : [],
    conditions: entry.performance.conditions ? entry.performance.conditions.map((c) => ({ ...c })) : undefined,
  };
}

function cloneBenefit(rule: BenefitRule): BenefitRule {
  return {
    ...rule,
    categories: [...rule.categories],
    keywords: rule.keywords ? [...rule.keywords] : undefined,
  };
}

/**
 * 카탈로그 조건을 카드에 적용한다.
 * 사용자가 직접 관리하는 값(수동 보정·이번 달 사용액·끝 4자리·메모·이벤트 응모)은 건드리지 않고,
 * 카탈로그에 없는 사용자 추가 혜택은 뒤에 그대로 남긴다.
 */
export function applyCatalogConditions(entry: CatalogCard, card: Card): Card {
  const catalogBenefitIds = new Set(entry.benefits.map((rule) => rule.id));
  // 카탈로그에 없는 사용자 추가 혜택은 지우지 않는다.
  const customBenefits = card.benefits.filter((rule) => !catalogBenefitIds.has(rule.id));
  return {
    ...card,
    name: entry.name,
    shortName: card.shortName || entry.shortName,
    issuer: entry.issuer,
    network: entry.network,
    theme: entry.theme,
    annualFee: entry.annualFee,
    performance: clonePerformance(entry),
    benefits: [...entry.benefits.map(cloneBenefit), ...customBenefits.map(cloneBenefit)],
    benefitExclusions: {
      categories: [...(entry.benefitExclusions?.categories ?? [])],
      keywords: [...(entry.benefitExclusions?.keywords ?? [])],
    },
    notice: entry.notice,
    verification: entry.verification,
    sourceNote: entry.sourceNote,
    catalogId: entry.id,
    catalogVersion: CATALOG_CONDITIONS_VERSION,
    catalogSnapshot: snapshotOf(entry),
  };
}

/** 카탈로그 항목으로 실제 보유 카드(Card)를 만든다. */
export function catalogToCard(
  entry: CatalogCard,
  options: { id?: string; last4?: string; usage?: Record<string, number> } = {},
): Card {
  const now = new Date().toISOString();
  const base: Card = {
    id: options.id ?? `card-${entry.id}-${Date.now().toString(36)}`,
    catalogId: entry.id,
    name: entry.name,
    shortName: entry.shortName,
    issuer: entry.issuer,
    network: entry.network,
    theme: entry.theme,
    last4: options.last4,
    annualFee: entry.annualFee,
    performance: clonePerformance(entry),
    benefits: entry.benefits.map(cloneBenefit),
    promos: (entry.promos ?? []).map((promo) => ({ ...promo, enrolled: false })),
    manual: { prevMonthAdjustment: 0, currentMonthAdjustment: 0 },
    usage: options.usage ?? {},
    benefitExclusions: {
      categories: [...(entry.benefitExclusions?.categories ?? [])],
      keywords: [...(entry.benefitExclusions?.keywords ?? [])],
    },
    notice: entry.notice,
    catalogVersion: CATALOG_CONDITIONS_VERSION,
    catalogSnapshot: snapshotOf(entry),
    verification: entry.verification,
    sourceNote: entry.sourceNote,
    // '0원'만 보고 실적 조건이 없는 카드로 오해하지 않도록 메모에도 한 줄 요약을 남긴다(사용자가 지우면 유지).
    memo: entry.memoHint,
    changeHistory: [
      { date: todayISO(), text: `카탈로그에서 불러옴 (약관 v${CATALOG_CONDITIONS_VERSION})` },
    ],
    createdAt: now,
  };
  return base;
}
