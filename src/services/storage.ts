import type { AppState, Card } from '../types';
import { createSeedState } from '../data/seed';
import { CATALOG_BY_ID, catalogToCard } from '../data/catalog';
import { todayISO } from '../engine/date';

export const STORAGE_KEY = 'card-optimizer:v1';

/** 초기 샘플 카드 id → 카탈로그 상품 id (구버전 저장 데이터 업그레이드용) */
const LEGACY_SEED_MAP: Record<string, string> = {
  'marriott-bonvoy-shinhan': 'shinhan-marriott-bonvoy-best',
  'lotte-hilton-amex': 'lotte-hilton-amex',
  'lotte-digiroca-skypass': 'lotte-digiroca-skypass',
  'hyundai-koreanair-300': 'hyundai-koreanair-300',
  'samsung-amex-platinum-legacy': 'samsung-amex-platinum-legacy',
};

/**
 * 첫 배포 때 만들어진 샘플 카드는 일부 조건이 예시값이었다.
 * 사용자가 직접 수정한 값(이용실적·수동보정·메모·끝4자리·이벤트 응모)은 보존하고,
 * 상품 조건(연회비·실적 기준·혜택 목록)만 공식 확인값으로 갱신한다.
 */
function upgradeLegacyCard(card: Card): Card {
  if (card.catalogId) return card;
  const catalogId = LEGACY_SEED_MAP[card.id];
  const entry = catalogId ? CATALOG_BY_ID[catalogId] : undefined;
  if (!entry) return card;
  const base = catalogToCard(entry, { id: card.id, last4: card.last4, usage: card.usage ?? {} });
  return {
    ...base,
    last4: card.last4,
    usage: card.usage ?? {},
    manual: card.manual ?? base.manual,
    memo: card.memo,
    promos: card.promos && card.promos.length > 0 ? card.promos : base.promos,
    createdAt: card.createdAt ?? base.createdAt,
    changeHistory: [
      ...(card.changeHistory ?? []),
      { date: todayISO(), text: '상품 조건을 카탈로그 공식 확인값으로 갱신' },
    ],
  };
}

/**
 * 저장소 추상화.
 * 지금은 브라우저 localStorage 구현만 동작한다.
 * 다중 사용자·기기 간 동기화가 필요해지면 SupabaseRepository를 실제 구현으로 교체한다.
 * (스키마: supabase/schema.sql)
 */
export interface StateRepository {
  readonly kind: 'local' | 'supabase';
  load(): Promise<AppState | null>;
  save(state: AppState): Promise<void>;
  clear(): Promise<void>;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** 불러온 데이터에 빠진 필드를 기본값으로 보정한다(수동 편집·구버전 대비). */
export function normalizeState(raw: unknown): AppState {
  if (!isObject(raw)) throw new Error('JSON 형식이 올바르지 않습니다.');
  const seed = createSeedState();
  const cards = Array.isArray(raw.cards) ? (raw.cards as Card[]) : [];
  if (cards.length === 0 && !Array.isArray(raw.cards)) throw new Error('cards 배열이 없습니다.');

  const normalizedCards: Card[] = cards.map((card, idx): Card => ({
    ...card,
    id: card.id || `card-${idx}-${Date.now()}`,
    shortName: card.shortName || card.name || `카드 ${idx + 1}`,
    network: card.network || 'LOCAL',
    theme: card.theme || 'navy',
    annualFee: Number(card.annualFee) || 0,
    performance: {
      prevThreshold: Number(card.performance?.prevThreshold) || 0,
      minPerTransaction: Number(card.performance?.minPerTransaction) || 0,
      excludedCategories: Array.isArray(card.performance?.excludedCategories)
        ? (card.performance!.excludedCategories as Card['performance']['excludedCategories'])
        : (['tax'] as Card['performance']['excludedCategories']),
      excludedKeywords: Array.isArray(card.performance?.excludedKeywords) ? card.performance!.excludedKeywords : [],
    },
    benefits: Array.isArray(card.benefits) ? card.benefits : [],
    promos: Array.isArray(card.promos) ? card.promos : [],
    manual: {
      prevMonthAdjustment: Number(card.manual?.prevMonthAdjustment) || 0,
      currentMonthAdjustment: Number(card.manual?.currentMonthAdjustment) || 0,
    },
    usage: isObject(card.usage) ? (card.usage as Record<string, number>) : {},
    verification: card.verification === 'official' ? 'official' : 'example',
    changeHistory: Array.isArray(card.changeHistory) ? card.changeHistory : [],
    createdAt: card.createdAt || new Date().toISOString(),
  })).map(upgradeLegacyCard);

  return {
    version: 1,
    cards: normalizedCards,
    transactions: Array.isArray(raw.transactions) ? raw.transactions : [],
    wallet: Array.isArray(raw.wallet) ? raw.wallet : [],
    settings: {
      pointValues: {
        ...seed.settings.pointValues,
        ...(isObject(raw.settings) && isObject((raw.settings as Record<string, unknown>).pointValues)
          ? ((raw.settings as Record<string, unknown>).pointValues as Record<string, number>)
          : {}),
      },
    },
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : todayISO(),
  };
}

export class LocalStorageRepository implements StateRepository {
  readonly kind = 'local' as const;
  constructor(private readonly key: string = STORAGE_KEY) {}

  loadSync(): AppState | null {
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) return null;
      return normalizeState(JSON.parse(raw));
    } catch (error) {
      console.warn('[card-optimizer] 저장 데이터를 읽지 못했습니다.', error);
      return null;
    }
  }

  async load(): Promise<AppState | null> {
    return this.loadSync();
  }

  async save(state: AppState): Promise<void> {
    try {
      localStorage.setItem(this.key, JSON.stringify({ ...state, updatedAt: todayISO() }));
    } catch (error) {
      console.warn('[card-optimizer] 저장에 실패했습니다.', error);
    }
  }

  async clear(): Promise<void> {
    localStorage.removeItem(this.key);
  }
}

/**
 * Supabase 연동 자리.
 * 스키마(supabase/schema.sql)는 준비되어 있지만 클라이언트·인증은 아직 연결되지 않았다.
 * 연결 전에는 이 저장소를 사용하지 않는다(조용히 실패하지 않고 명확히 알린다).
 */
export class SupabaseRepository implements StateRepository {
  readonly kind = 'supabase' as const;
  constructor(private readonly endpoint: string | null = null) {}

  private fail(): never {
    throw new Error(
      'Supabase 저장소는 아직 연결되지 않았습니다. supabase/schema.sql을 적용하고 @supabase/supabase-js 클라이언트를 src/services/supabase.ts에 추가한 뒤 이 클래스를 교체하세요.',
    );
  }

  async load(): Promise<AppState | null> {
    return this.fail();
  }

  async save(): Promise<void> {
    this.fail();
  }

  async clear(): Promise<void> {
    this.fail();
  }
}

/** 브라우저 환경에서 사용할 저장소 — MVP는 localStorage 단일 구현 */
export function createRepository(): StateRepository {
  return new LocalStorageRepository();
}

export function exportStateJson(state: AppState): string {
  return JSON.stringify({ ...state, updatedAt: todayISO() }, null, 2);
}

export function importStateJson(json: string): AppState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('JSON을 읽을 수 없습니다. 내보낸 .json 파일인지 확인해 주세요.');
  }
  return normalizeState(parsed);
}

export function initialState(): AppState {
  return createSeedState();
}
