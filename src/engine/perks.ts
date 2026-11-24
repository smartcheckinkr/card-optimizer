import type { Card, CategoryId, Perk, PerkLayer, PromoRule } from '../types';

/** 혜택 출처 라벨 */
export const LAYER_LABEL: Record<PerkLayer, string> = {
  network: '네트워크',
  issuer: '카드사',
  card: '카드',
  merchant: '가맹점',
  user: '직접 추가',
};

export const PERK_GROUP_LABEL: Record<Perk['group'], string> = {
  airport: '공항·라운지',
  hotel: '호텔',
  dutyfree: '면세점',
  culture: '문화·영화',
  cafe: '카페',
  shopping: '쇼핑',
  transport: '교통·여행',
  living: '생활',
  golf: '골프',
  dining: '다이닝',
  other: '기타',
};

export const PERK_GROUP_ORDER: Perk['group'][] = [
  'airport',
  'hotel',
  'dutyfree',
  'culture',
  'cafe',
  'shopping',
  'transport',
  'living',
  'golf',
  'dining',
  'other',
];

const normalize = (text: string) => text.toLowerCase().replace(/[\s\-_()™·.,/]/g, '');

/** 카드에 붙은 모든 상시 혜택(네트워크 → 카드사 → 카드 → 사용자) */
export function allPerks(card: Card): Perk[] {
  return [
    ...(card.networkPerks ?? []),
    ...(card.issuerPerks ?? []),
    ...(card.merchantPerks ?? []),
    ...(card.userPerks ?? []),
  ];
}

/** 같은 혜택이 여러 계층에 있을 때 구체적인 계층 하나만 남긴다(카드 > 카드사 > 네트워크). */
const LAYER_PRIORITY: Record<PerkLayer, number> = {
  merchant: 0,
  card: 1,
  user: 2,
  issuer: 3,
  network: 4,
};

export interface DedupedPerks {
  kept: Perk[];
  /** 중복으로 접힌 혜택과, 대신 남은 혜택 */
  merged: { perk: Perk; keptBy: Perk }[];
}

export function dedupePerks(perks: Perk[]): DedupedPerks {
  const byKey = new Map<string, Perk>();
  const merged: { perk: Perk; keptBy: Perk }[] = [];
  const kept: Perk[] = [];
  for (const perk of perks) {
    if (!perk.dedupeKey) {
      kept.push(perk);
      byKey.set(`id:${perk.id}`, perk);
      continue;
    }
    const existing = byKey.get(perk.dedupeKey);
    if (!existing) {
      byKey.set(perk.dedupeKey, perk);
      kept.push(perk);
      continue;
    }
    const currentWins = LAYER_PRIORITY[perk.layer] < LAYER_PRIORITY[existing.layer];
    if (currentWins) {
      merged.push({ perk: existing, keptBy: perk });
      kept[kept.indexOf(existing)] = perk;
      byKey.set(perk.dedupeKey, perk);
    } else {
      merged.push({ perk, keptBy: existing });
    }
  }
  return { kept, merged };
}

const STOP_WORDS = new Set(['카드', '결제', '추천', '유리한', '유리', '어떤', '어디', '좋은', '좋을', '되는', '있는', '할인', '혜택', '받을', '쓸까', '뭐가']);

/** 혜택이 가맹점 질문과 맞는지 */
export function perkMatches(perk: Perk, query: string, category?: CategoryId): boolean {
  const tokens = query
    .split(/[\s,/·]+/)
    .map(normalize)
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t));
  if (perk.merchantKeys && perk.merchantKeys.length > 0) {
    const matched = perk.merchantKeys.some((key) => {
      const k = normalize(key);
      return k.length > 0 && tokens.some((t) => t.includes(k) || k.includes(t));
    });
    if (matched) return true;
    // 가맹점 키가 있는 혜택은 업종만으로 넓혀 잡지 않는다.
    if (!(category && perk.categories && perk.categories.includes(category))) return false;
    return false;
  }
  if (category && perk.categories && perk.categories.includes(category)) return true;
  const text = normalize(`${perk.label} ${perk.summary}`);
  return tokens.some((t) => text.includes(t));
}

/** 혜택의 원화 환산 가치(추정). 라운지·발렛처럼 횟수형은 0원으로 두고 순위에서 '직접 혜택'으로 먼저 보여 준다. */
export function perkValueKrw(perk: Perk, amount: number): number {
  if (perk.kind === 'discount' || perk.kind === 'points') {
    const raw = ((perk.ratePercent ?? 0) / 100) * amount;
    const capped = perk.monthlyCapKrw != null ? Math.min(raw, perk.monthlyCapKrw) : raw;
    return Math.round(Math.max(0, capped));
  }
  if (perk.kind === 'voucher') return Math.round(perk.amountKrw ?? 0);
  return 0;
}

export function promoActive(promo: PromoRule, today: Date = new Date()): boolean {
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
    today.getDate(),
  ).padStart(2, '0')}`;
  if (promo.startsAt && iso < promo.startsAt) return false;
  if (promo.expiresAt && iso > promo.expiresAt) return false;
  return true;
}

export function promosState(promo: PromoRule, today: Date = new Date()): 'active' | 'upcoming' | 'expired' {
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
    today.getDate(),
  ).padStart(2, '0')}`;
  if (promo.startsAt && iso < promo.startsAt) return 'upcoming';
  if (promo.expiresAt && iso > promo.expiresAt) return 'expired';
  return 'active';
}

/** 기간이 지난·아직 시작 전인 이벤트는 계산에서 제외한다. */
export function activePromos(card: Card, today: Date = new Date()): PromoRule[] {
  return card.promos.filter((promo) => promoActive(promo, today));
}

export interface MerchantPerkHit {
  card: Card;
  perk: Perk;
  valueKrw: number;
  layerLabel: string;
  /** 0: 가맹점 직접, 1: 네트워크·카드사 */
  tier: 0 | 1;
  shortfallKrw: number;
}

/** 가맹점 질문에 걸리는 상시 혜택을 카드별로 모아 정렬한다. */
export function findMerchantPerkHits(
  cards: Card[],
  query: string,
  category: CategoryId | undefined,
  amount: number,
  prevSpendOf: (card: Card) => number,
): MerchantPerkHit[] {
  const hits: MerchantPerkHit[] = [];
  for (const card of cards) {
    const { kept } = dedupePerks(allPerks(card));
    for (const perk of kept) {
      if (!perkMatches(perk, query, category)) continue;
      const tier: 0 | 1 = perk.layer === 'merchant' || perk.layer === 'card' || perk.layer === 'user' ? 0 : 1;
      const shortfall = perk.minPrevMonth ? Math.max(0, perk.minPrevMonth - prevSpendOf(card)) : 0;
      hits.push({
        card,
        perk,
        valueKrw: perkValueKrw(perk, amount),
        layerLabel: LAYER_LABEL[perk.layer],
        tier,
        shortfallKrw: shortfall,
      });
    }
  }
  hits.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    if (b.valueKrw !== a.valueKrw) return b.valueKrw - a.valueKrw;
    if (a.shortfallKrw !== b.shortfallKrw) return a.shortfallKrw - b.shortfallKrw;
    return a.card.shortName.localeCompare(b.card.shortName, 'ko');
  });
  return hits;
}

/** 카드 상세용 그룹핑 — 네트워크 → 카드사 → 카드 → 사용자 */
export function perksByLayer(card: Card): { layer: PerkLayer; label: string; perks: Perk[] }[] {
  const rows: { layer: PerkLayer; label: string; perks: Perk[] }[] = [
    { layer: 'network', label: '브랜드(네트워크) 혜택', perks: card.networkPerks ?? [] },
    { layer: 'issuer', label: '카드사 혜택', perks: card.issuerPerks ?? [] },
    { layer: 'merchant', label: '카드 고유·가맹점 혜택', perks: card.merchantPerks ?? [] },
    { layer: 'user', label: '내가 추가한 혜택', perks: card.userPerks ?? [] },
  ];
  return rows.filter((row) => row.perks.length > 0);
}

export function groupPerks(perks: Perk[]): { group: Perk['group']; label: string; perks: Perk[] }[] {
  const map = new Map<Perk['group'], Perk[]>();
  for (const perk of perks) {
    const list = map.get(perk.group) ?? [];
    list.push(perk);
    map.set(perk.group, list);
  }
  return PERK_GROUP_ORDER.filter((g) => map.has(g)).map((g) => ({
    group: g,
    label: PERK_GROUP_LABEL[g],
    perks: map.get(g)!,
  }));
}
