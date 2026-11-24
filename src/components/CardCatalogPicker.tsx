import { useMemo, useState } from 'react';
import type { CatalogCard } from '../types';
import { CATALOG, CATALOG_TAGS, searchCatalog } from '../data/catalog';
import { CATEGORY_LABEL } from '../data/categories';
import { formatWon } from '../lib/format';
import { Badge, VerifyBadge, btnSubtle, inputClass } from './ui';

/** 업종 칩 목록을 짧은 문장으로 — 제외 대상을 한눈에 보여 준다. */
function exclusionSummary(entry: CatalogCard): string[] {
  const parts: string[] = [];
  const perf = entry.performance;
  if (perf.excludedCategories.length > 0) {
    parts.push(`실적 제외: ${perf.excludedCategories.map((c) => CATEGORY_LABEL[c]).join('·')}`);
  }
  const benefit = entry.benefitExclusions;
  if (benefit && benefit.categories.length > 0) {
    parts.push(`적립 제외: ${benefit.categories.map((c) => CATEGORY_LABEL[c]).join('·')}`);
  }
  return parts;
}

/**
 * '+ 카드 추가' 모달 상단의 카탈로그 검색.
 * 카드명·카드사·키워드로 검색해 선택하면 상품 조건이 폼 전체에 자동 입력된다.
 */
export function CardCatalogPicker({
  selected,
  onPick,
  onClear,
  onManual,
  existingCatalogIds,
}: {
  selected: CatalogCard | null;
  onPick: (entry: CatalogCard) => void;
  onClear: () => void;
  onManual: () => void;
  existingCatalogIds: string[];
}) {
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const results = useMemo(() => searchCatalog(query, tag), [query, tag]);

  if (selected) {
    return (
      <div className="rounded-2xl bg-emerald-50 p-3.5 ring-1 ring-emerald-200">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[10.5px] font-semibold text-emerald-700">
              <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-600 text-[9px] text-white">✓</span>
              카탈로그에서 자동 입력됨
            </p>
            <p className="mt-1 truncate text-[13.5px] font-bold text-ink">{selected.name}</p>
            <p className="mt-0.5 text-[10.5px] text-emerald-800/80">
              {selected.issuer} · 연회비 {selected.annualFee ? formatWon(selected.annualFee) : '없음'} ·{' '}
              {selected.performance.prevThreshold === 0 ? '전월 실적 조건 없음' : `전월 ${formatWon(selected.performance.prevThreshold)} 이상`}
            </p>
          </div>
          <VerifyBadge verification={selected.verification} />
        </div>
        <p className="mt-2 text-[10.5px] leading-relaxed text-emerald-900/70">
          아래 항목이 모두 채워졌어요. 숫자만 고쳐서 저장하면 됩니다.
        </p>
        {selected.performance.conditions && selected.performance.conditions.length > 0 && (
          <ul className="mt-2 space-y-1 rounded-xl bg-white/70 p-2 ring-1 ring-emerald-100">
            <li className="text-[9.5px] font-semibold text-emerald-700">전월 실적 조건</li>
            {selected.performance.conditions.map((c) => (
              <li key={`${c.label}-${c.amount}`} className="text-[10px] leading-snug text-emerald-900/80">
                · {c.label} — <span className="font-semibold">{c.amount === 0 ? '실적 무관' : `전월 ${formatWon(c.amount)} 이상`}</span>
                {c.note ? ` (${c.note})` : ''}
              </li>
            ))}
          </ul>
        )}
        {exclusionSummary(selected).length > 0 && (
          <p className="mt-2 space-y-0.5 text-[10px] leading-relaxed text-emerald-900/70">
            {exclusionSummary(selected).map((line) => (
              <span key={line} className="block">· {line}</span>
            ))}
          </p>
        )}
        {selected.notice && (
          <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[10px] leading-relaxed text-amber-800 ring-1 ring-amber-100">
            {selected.notice}
          </p>
        )}
        <div className="mt-2 flex gap-1.5">
          <button type="button" onClick={onClear} className="rounded-lg bg-white px-2.5 py-1.5 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200">
            다른 카드 검색
          </button>
          <button type="button" onClick={onManual} className="rounded-lg px-2 py-1.5 text-[11px] text-emerald-700/70">
            직접 입력으로 전환
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white p-3.5 ring-1 ring-slate-900/5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12.5px] font-bold text-ink">카드 검색해서 자동 입력</p>
        <span className="text-[10px] text-slate-400">카탈로그 {CATALOG.length}종</span>
      </div>
      <p className="mt-0.5 text-[10.5px] leading-relaxed text-slate-500">
        카드명·카드사·키워드로 찾으면 연회비·실적·혜택이 한 번에 채워집니다.
      </p>

      <div className="relative mt-2.5">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
        </span>
        <input
          className={`${inputClass} !pl-9`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="예: 아코르, iD EV, 힐튼, 면세점"
          aria-label="카드 검색"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full bg-slate-200 p-0.5 text-slate-500"
            aria-label="검색어 지우기"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        )}
      </div>

      <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => setTag(null)}
          className={`shrink-0 rounded-full px-2.5 py-1 text-[10.5px] font-medium ${tag === null ? 'bg-ink text-white' : 'bg-slate-100 text-slate-500'}`}
        >
          전체
        </button>
        {CATALOG_TAGS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTag(tag === t ? null : t)}
            className={`shrink-0 rounded-full px-2.5 py-1 text-[10.5px] font-medium ${tag === t ? 'bg-ink text-white' : 'bg-slate-100 text-slate-500'}`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="mt-1.5 max-h-[288px] space-y-1.5 overflow-y-auto pr-0.5">
        {results.length === 0 && (
          <p className="rounded-xl bg-slate-50 px-3 py-6 text-center text-[11.5px] leading-relaxed text-slate-400">
            검색 결과가 없습니다.
            <br />
            아래 '직접 입력하기'로 조건을 손수 넣을 수 있어요.
          </p>
        )}
        {results.map((card) => {
          const owned = existingCatalogIds.includes(card.id);
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => onPick(card)}
              className="flex w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left transition active:scale-[0.99]"
            >
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 truncate text-[12.5px] font-semibold text-ink">
                  {card.shortName}
                  {owned && <Badge tone="muted">보유 중</Badge>}
                  {card.status === 'discontinued' && <Badge tone="warning">발급 중단</Badge>}
                </p>
                <p className="mt-0.5 truncate text-[10.5px] text-slate-400">
                  {card.issuer} · 연회비 {card.annualFee ? formatWon(card.annualFee) : '없음'} ·{' '}
                  {card.performance.prevThreshold === 0 ? '실적 무관' : `전월 ${Math.round(card.performance.prevThreshold / 10_000)}만`}
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {card.tags.slice(0, 3).map((t) => (
                    <span key={t} className="rounded bg-slate-100 px-1.5 py-0.5 text-[9.5px] text-slate-500">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
              <span className="shrink-0 text-[11px] font-semibold text-indigo-600">불러오기</span>
            </button>
          );
        })}
      </div>

      <button type="button" onClick={onManual} className={`${btnSubtle} mt-2.5 w-full`}>
        목록에 없음 — 직접 입력하기
      </button>
    </div>
  );
}
