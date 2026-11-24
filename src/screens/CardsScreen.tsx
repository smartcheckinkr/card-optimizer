import { useEffect, useMemo, useState } from 'react';
import { useCardStore } from '../state/store';
import type { BenefitRule, Card, CatalogCard, CategoryId, PointCurrencyId, Transaction, Verification } from '../types';
import { CATEGORIES, CATEGORY_LABEL, POINT_CURRENCIES } from '../data/categories';
import { CATALOG_BY_ID, catalogToCard, walletItemsFromHints } from '../data/catalog';
import { CardCatalogPicker } from '../components/CardCatalogPicker';
import { currentMonthSpend, prevMonthSpend } from '../engine/performance';
import { describeBenefitRule, capKrwOf, rateLabel } from '../engine/benefits';
import { formatWon, parseAmountInput } from '../lib/format';
import { formatDate, todayISO } from '../engine/date';
import { Badge, Field, Panel, Progress, SectionTitle, Sheet, VerifyBadge, btnGhost, btnPrimary, btnSubtle, inputClass, selectClass } from '../components/ui';
import { CardFace } from '../components/CardFace';
import { PerkItem, PromoSection, UserPerkSection } from '../components/PerkSection';

const emptyCard = (): Card => ({
  id: `card-${Date.now().toString(36)}`,
  name: '새 카드',
  shortName: '새 카드',
  issuer: '카드사 미지정',
  network: 'LOCAL',
  theme: 'navy',
  annualFee: 0,
  performance: { prevThreshold: 0, minPerTransaction: 0, excludedCategories: [], excludedKeywords: [] },
  benefits: [],
  networkPerks: [],
  issuerPerks: [],
  merchantPerks: [],
  userPerks: [],
  promos: [],
  manual: { prevMonthAdjustment: 0, currentMonthAdjustment: 0 },
  usage: {},
  benefitExclusions: { categories: [], keywords: [] },
  verification: 'example',
  changeHistory: [{ date: todayISO(), text: '사용자 직접 추가' }],
  createdAt: new Date().toISOString(),
});

/** 전월 실적 기준 문구 — 갈래가 나뉜 카드는 무엇에 걸리는 조건인지 함께 보여 준다. */
export function thresholdLabel(card: Card): string {
  const { prevThreshold, thresholdScope } = card.performance;
  if (prevThreshold === 0) return '전월 실적 조건 없음';
  return `전월 ${formatWon(prevThreshold)} 이상${thresholdScope ? ` (${thresholdScope})` : ''}`;
}

const emptyBenefit = (): BenefitRule => ({
  id: `rule-${Date.now().toString(36)}`,
  label: '새 혜택',
  categories: ['general'],
  earnType: 'percent',
  percent: 1,
  verification: 'example',
});

export function CardsScreen({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { state, deleteCard } = useCardStore();
  const today = useMemo(() => new Date(), []);
  const [editing, setEditing] = useState<Card | null>(null);
  const [txOpen, setTxOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const transactions = [...state.transactions].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, 12);

  return (
    <div className="pb-6">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-slate-200/70 bg-[#f6f7fb]/95 px-5 py-3.5 backdrop-blur">
        <div>
          <h1 className="text-[18px] font-bold tracking-tight text-ink">내 카드</h1>
          <p className="text-[11px] text-slate-400">카드 {state.cards.length}장 · 결제내역 {state.transactions.length}건</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={onOpenSettings} className="rounded-xl bg-white p-2 text-slate-500 ring-1 ring-slate-200" aria-label="설정">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
              <circle cx="12" cy="12" r="3.2" />
              <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.1-1.55 1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3.09V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.06.24.15.46.27.67" />
            </svg>
          </button>
          <button onClick={() => setEditing(emptyCard())} className="rounded-xl bg-ink px-3 py-2 text-[11.5px] font-semibold text-white transition active:scale-95">
            + 카드 추가
          </button>
        </div>
      </div>

      <div className="space-y-5 px-4 pt-4">
        {state.cards.map((card) => {
          const prev = prevMonthSpend(card, state.transactions, today);
          const cur = currentMonthSpend(card, state.transactions, today);
          const threshold = card.performance.prevThreshold;
          const met = threshold === 0 || prev >= threshold;
          return (
            <div key={card.id} className="space-y-2.5">
              <CardFace card={card} size="lg" />
              <Panel className="!p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[12.5px] font-semibold text-ink">{card.name}</p>
                  <VerifyBadge verification={card.verification} />
                </div>
                <p className="mt-0.5 text-[10.5px] text-slate-400">
                  연회비 {formatWon(card.annualFee)} · {thresholdLabel(card)}
                </p>
                {card.notice && (
                  <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[10px] leading-relaxed text-amber-800 ring-1 ring-amber-100">
                    {card.notice}
                  </p>
                )}

                <div className="mt-2.5">
                  <div className="mb-1 flex items-center justify-between text-[10.5px]">
                    <span className="text-slate-500">당월 인정 실적 {formatWon(cur)}</span>
                    {threshold === 0 ? <Badge tone="muted">실적 무관</Badge> : met ? <Badge tone="success">전월 충족</Badge> : <Badge tone="danger">전월 미달</Badge>}
                  </div>
                  <Progress ratio={threshold === 0 ? 1 : Math.min(1, cur / threshold)} tone={threshold === 0 ? 'emerald' : cur >= threshold ? 'emerald' : 'amber'} />
                </div>

                <div className="mt-3 space-y-1.5">
                  {card.benefits.slice(0, 3).map((rule) => (
                    <div key={rule.id} className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-[11.5px] text-slate-600">{rule.label}</p>
                        <p className="text-[10px] text-slate-400">{describeBenefitRule(rule, state.settings.pointValues)}</p>
                      </div>
                      <VerifyBadge verification={rule.verification} />
                    </div>
                  ))}
                  {card.benefits.length === 0 && <p className="text-[11px] text-slate-400">등록된 혜택이 없습니다. 수정에서 추가하세요.</p>}
                  {card.benefits.length > 3 && <p className="text-[10.5px] text-slate-400">외 {card.benefits.length - 3}개</p>}
                </div>

                <div className="mt-3 flex gap-1.5">
                  <button onClick={() => setEditing(card)} className={`${btnGhost} flex-1`}>카드·혜택 수정</button>
                  <button onClick={() => setConfirmDelete(card.id)} className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-[12px] font-medium text-rose-500">삭제</button>
                </div>
              </Panel>
            </div>
          );
        })}

        <section>
          <SectionTitle
            title="결제내역"
            subtitle="실적·이벤트 진행률에 바로 반영됩니다"
            action={<button onClick={() => setTxOpen(true)} className={btnSubtle}>+ 결제 추가</button>}
          />
          <Panel className="divide-y divide-slate-100 !p-0">
            {transactions.length === 0 && <p className="p-4 text-[12px] text-slate-400">결제내역이 없습니다.</p>}
            {transactions.map((tx) => (
              <TransactionRow key={tx.id} tx={tx} />
            ))}
          </Panel>
          <p className="mt-2 text-[10.5px] leading-relaxed text-slate-400">
            취소 처리한 결제는 실적·혜택 계산에서 빠집니다(원본은 남고 상태만 바뀝니다). 전체 내역은 JSON 내보내기로 확인할 수 있습니다.
          </p>
        </section>
      </div>

      {editing && <CardEditor card={editing} onClose={() => setEditing(null)} />}
      <TransactionSheet open={txOpen} onClose={() => setTxOpen(false)} />

      <Sheet open={confirmDelete !== null} onClose={() => setConfirmDelete(null)} title="카드를 삭제할까요?" subtitle="카드의 혜택·결제내역·지갑 항목이 함께 삭제됩니다">
        <div className="flex gap-2">
          <button onClick={() => setConfirmDelete(null)} className={`${btnGhost} flex-1`}>취소</button>
          <button
            onClick={() => {
              if (confirmDelete) deleteCard(confirmDelete);
              setConfirmDelete(null);
            }}
            className="flex-1 rounded-xl bg-rose-500 py-2.5 text-[13px] font-semibold text-white"
          >
            삭제
          </button>
        </div>
      </Sheet>
    </div>
  );
}

function TransactionRow({ tx }: { tx: Transaction }) {
  const { state, setTransactionStatus } = useCardStore();
  const card = state.cards.find((c) => c.id === tx.cardId);
  return (
    <div className="flex items-center justify-between gap-2 px-4 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-[12px] font-medium text-ink">
          {tx.merchant} {tx.status === 'canceled' && <Badge tone="danger">취소</Badge>}
        </p>
        <p className="text-[10px] text-slate-400">
          {formatDate(tx.date)} · {card?.shortName ?? '카드 미지정'} · {CATEGORY_LABEL[tx.category]}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className={`text-[12px] font-semibold ${tx.status === 'canceled' ? 'text-slate-300 line-through' : 'text-ink'}`}>{formatWon(tx.amount)}</span>
        <button
          onClick={() => setTransactionStatus(tx.id, tx.status === 'canceled' ? 'active' : 'canceled')}
          className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-medium text-slate-500"
        >
          {tx.status === 'canceled' ? '복원' : '취소'}
        </button>
      </div>
    </div>
  );
}

function CategoryMulti({ value, onChange, tone = 'ink' }: { value: CategoryId[]; onChange: (next: CategoryId[]) => void; tone?: 'ink' | 'rose' }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {CATEGORIES.map((c) => {
        const active = value.includes(c.id);
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onChange(active ? value.filter((v) => v !== c.id) : [...value, c.id])}
            className={`rounded-lg px-2 py-1 text-[10.5px] font-medium transition ${
              active ? (tone === 'rose' ? 'bg-rose-500 text-white' : 'bg-ink text-white') : 'bg-slate-100 text-slate-500'
            }`}
          >
            {c.label}
          </button>
        );
      })}
    </div>
  );
}

/** 키워드를 칩으로 보여 주고 ×로 지우거나 입력해서 더한다(쉼표 없이도 입력 가능). */
/** 자주 보는 실적·적립 제외 가맹점 키워드 — 탭하면 위 칸으로 올라가고, 한 번 더 탭하면 빠집니다. */
const SUGGESTED_KEYWORDS = [
  '아파트관리비',
  '임대료',
  '등록금',
  '상품권',
  '기프트카드',
  '선불카드',
  '교통카드 충전',
  '고속버스',
  '무이자할부',
  '4대보험',
  '정부지원금',
];

function KeywordChips({
  value,
  onChange,
  placeholder,
  suggestions = SUGGESTED_KEYWORDS,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  suggestions?: string[];
}) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const add = () => {
    const v = text.trim();
    if (!v) return;
    if (!value.includes(v)) onChange([...value, v]);
    setText('');
  };
  const remaining = suggestions.filter((k) => !value.includes(k));
  return (
    <div className="rounded-xl bg-slate-50 p-2 ring-1 ring-slate-200">
      <div className="flex flex-wrap gap-1">
        {value.length === 0 && <span className="px-1 py-0.5 text-[10.5px] text-slate-400">없음</span>}
        {value.map((k) => (
          <span key={k} className="inline-flex items-center gap-1 rounded-md bg-white px-1.5 py-0.5 text-[10.5px] text-slate-600 ring-1 ring-slate-200">
            {k}
            <button type="button" onClick={() => onChange(value.filter((v) => v !== k))} className="text-slate-400" aria-label={`${k} 삭제`}>
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="mt-1.5 flex gap-1">
        <input
          className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px]"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder ?? '가맹점 키워드 추가'}
        />
        <button type="button" onClick={add} className="rounded-lg bg-white px-2 py-1 text-[11px] font-medium text-indigo-600 ring-1 ring-slate-200">
          추가
        </button>
      </div>
      {remaining.length > 0 && (
        <div className="mt-1.5 border-t border-slate-200 pt-1.5">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="text-[10px] font-medium text-slate-500"
          >
            자주 쓰는 키워드 {open ? '접기' : '보기'}
          </button>
          {open && (
            <div className="mt-1 flex flex-wrap gap-1">
              {remaining.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => onChange([...value, k])}
                  className="inline-flex items-center gap-0.5 rounded-md bg-white px-1.5 py-0.5 text-[10.5px] text-slate-500 ring-1 ring-slate-200"
                >
                  <span className="text-indigo-500">+</span>
                  {k}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CardEditor({ card, onClose }: { card: Card; onClose: () => void }) {
  const { state, saveCard, addWalletItem } = useCardStore();
  const isNew = !state.cards.some((c) => c.id === card.id);
  const [draft, setDraft] = useState<Card>(card);
  const [openRule, setOpenRule] = useState<string | null>(null);
  const [newRule, setNewRule] = useState<BenefitRule | null>(null);
  const [pickerMode, setPickerMode] = useState<'search' | 'picked' | 'manual'>(
    isNew ? (card.catalogId ? 'picked' : 'search') : 'manual',
  );
  const [catalogEntry, setCatalogEntry] = useState<CatalogCard | null>(
    card.catalogId ? CATALOG_BY_ID[card.catalogId] ?? null : null,
  );
  const [includeWallet, setIncludeWallet] = useState(true);

  useEffect(() => setDraft(card), [card]);

  const today = useMemo(() => new Date(), []);
  const patch = (p: Partial<Card>) => setDraft((d) => ({ ...d, ...p }));

  const pickCatalog = (entry: CatalogCard) => {
    const next = catalogToCard(entry, { id: draft.id, last4: draft.last4 });
    setDraft(next);
    setCatalogEntry(entry);
    setIncludeWallet(true);
    setPickerMode('picked');
  };

  const handleSave = () => {
    saveCard(draft);
    if (isNew && includeWallet && catalogEntry?.walletHints?.length) {
      for (const item of walletItemsFromHints(catalogEntry, draft.id)) {
        const { id: _ignored, ...rest } = item;
        addWalletItem(rest);
      }
    }
    onClose();
  };

  const ownedCatalogIds = state.cards
    .map((c) => c.catalogId)
    .filter((id): id is string => Boolean(id));

  return (
    <Sheet
      open
      onClose={onClose}
      title={isNew ? '카드 추가' : '카드 수정'}
      subtitle="모든 값은 직접 수정할 수 있습니다"
      footer={
        <div className="flex gap-2">
          <button onClick={onClose} className={`${btnGhost} flex-1`}>취소</button>
          <button onClick={handleSave} className={`${btnPrimary} flex-1`}>
            저장
          </button>
        </div>
      }
    >
      {isNew && pickerMode === 'search' && (
        <CardCatalogPicker
          selected={null}
          onPick={pickCatalog}
          onClear={() => setPickerMode('search')}
          onManual={() => setPickerMode('manual')}
          existingCatalogIds={ownedCatalogIds}
        />
      )}
      {isNew && pickerMode === 'picked' && catalogEntry && (
        <>
          <CardCatalogPicker
            selected={catalogEntry}
            onPick={pickCatalog}
            onClear={() => {
              setCatalogEntry(null);
              setPickerMode('search');
            }}
            onManual={() => setPickerMode('manual')}
            existingCatalogIds={ownedCatalogIds}
          />
          {catalogEntry.walletHints && catalogEntry.walletHints.length > 0 && (
            <label className="flex items-start justify-between gap-2 rounded-xl bg-indigo-50/70 px-3 py-2.5 ring-1 ring-indigo-100">
              <span className="min-w-0">
                <span className="block text-[11.5px] font-semibold text-indigo-700">
                  지갑에 대표 바우처 {catalogEntry.walletHints.length}개도 함께 추가
                </span>
                <span className="mt-0.5 block text-[10.5px] leading-relaxed text-indigo-700/70">
                  {catalogEntry.walletHints.map((h) => h.title).slice(0, 3).join(' · ')}
                  {catalogEntry.walletHints.length > 3 ? ' 외' : ''}
                </span>
              </span>
              <input
                type="checkbox"
                checked={includeWallet}
                onChange={(e) => setIncludeWallet(e.target.checked)}
                className="mt-1 h-4 w-4 shrink-0 accent-indigo-600"
              />
            </label>
          )}
        </>
      )}
      {isNew && pickerMode === 'manual' && (
        <button
          type="button"
          onClick={() => setPickerMode('search')}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-white py-2.5 text-[11.5px] font-medium text-indigo-600 ring-1 ring-slate-200"
        >
          🔍 카탈로그에서 카드 검색해서 채우기
        </button>
      )}

      <Panel className="space-y-3">
        <Field label="카드 별칭" hint="목록에 표시">
          <input className={inputClass} value={draft.shortName} onChange={(e) => patch({ shortName: e.target.value })} />
        </Field>
        <Field label="카드 정식 명칭">
          <input className={inputClass} value={draft.name} onChange={(e) => patch({ name: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="카드사">
            <input className={inputClass} value={draft.issuer} onChange={(e) => patch({ issuer: e.target.value })} />
          </Field>
          <Field label="브랜드">
            <select className={selectClass} value={draft.network} onChange={(e) => patch({ network: e.target.value as Card['network'] })}>
              {['AMEX', 'VISA', 'MASTERCARD', 'LOCAL'].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="카드 색상">
            <select className={selectClass} value={draft.theme} onChange={(e) => patch({ theme: e.target.value as Card['theme'] })}>
              {[
                ['navy', '네이비'],
                ['violet', '바이올렛'],
                ['emerald', '에메랄드'],
                ['graphite', '그래파이트'],
                ['coral', '코랄'],
              ].map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </Field>
          <Field label="끝 4자리" hint="선택">
            <input className={inputClass} inputMode="numeric" maxLength={4} value={draft.last4 ?? ''} onChange={(e) => patch({ last4: e.target.value.replace(/[^\d]/g, '').slice(0, 4) })} placeholder="1234" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="연회비(원)" hint={catalogEntry?.annualFeeNote}>
            <input className={inputClass} inputMode="numeric" value={draft.annualFee ? draft.annualFee.toLocaleString('ko-KR') : ''} onChange={(e) => patch({ annualFee: parseAmountInput(e.target.value) })} />
          </Field>
          <Field label="데이터 신뢰도">
            <select className={selectClass} value={draft.verification} onChange={(e) => patch({ verification: e.target.value as Verification })}>
              <option value="official">공식 확인</option>
              <option value="example">예시 데이터</option>
            </select>
          </Field>
        </div>
        <Field label="메모">
          <input className={inputClass} value={draft.memo ?? ''} onChange={(e) => patch({ memo: e.target.value })} placeholder="예: 2026-11-24 발급" />
        </Field>
      </Panel>

      <Panel className="space-y-3">
        <p className="text-[12.5px] font-bold text-ink">실적 기준</p>
        {draft.notice && (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-[10.5px] leading-relaxed text-amber-800 ring-1 ring-amber-100">
            {draft.notice}
          </p>
        )}
        {draft.performance.conditions && draft.performance.conditions.length > 0 && (
          <div className="rounded-xl bg-slate-50 p-2.5">
            <p className="text-[10.5px] font-semibold text-slate-600">카드사 약관의 전월 실적 갈래</p>
            <ul className="mt-1 space-y-0.5">
              {draft.performance.conditions.map((c) => (
                <li key={`${c.label}-${c.amount}`} className="text-[10px] leading-snug text-slate-500">
                  · {c.label} — <span className="font-medium text-slate-700">{c.amount === 0 ? '실적 무관' : formatWon(c.amount)}</span>
                  {c.note ? ` (${c.note})` : ''}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Field label="전월 실적 기준(원)" hint="0 = 실적 무관">
            <input
              className={inputClass}
              inputMode="numeric"
              value={draft.performance.prevThreshold ? draft.performance.prevThreshold.toLocaleString('ko-KR') : '0'}
              onChange={(e) => patch({ performance: { ...draft.performance, prevThreshold: parseAmountInput(e.target.value) } })}
            />
          </Field>
          <Field label="건당 최소 인정금액" hint="0 = 제한 없음">
            <input
              className={inputClass}
              inputMode="numeric"
              value={draft.performance.minPerTransaction ? draft.performance.minPerTransaction.toLocaleString('ko-KR') : '0'}
              onChange={(e) => patch({ performance: { ...draft.performance, minPerTransaction: parseAmountInput(e.target.value) } })}
            />
          </Field>
        </div>
        <div className="rounded-xl bg-slate-50 p-2.5 ring-1 ring-slate-200">
          <p className="text-[10.5px] font-semibold text-slate-600">
            실적 제외 합계 — 업종 {(draft.performance.excludedCategories ?? []).length}개 · 가맹점 키워드{' '}
            {(draft.performance.excludedKeywords ?? []).length}개
          </p>
          <p className="mt-0.5 text-[10px] leading-relaxed text-slate-500">
            {(draft.performance.excludedCategories ?? []).length + (draft.performance.excludedKeywords ?? []).length === 0
              ? '제외 대상 없음'
              : [
                  ...(draft.performance.excludedCategories ?? []).map((c) => CATEGORY_LABEL[c]),
                  ...(draft.performance.excludedKeywords ?? []),
                ].join(' · ')}
          </p>
        </div>
        <Field label="실적 제외 업종" hint="이 업종 결제는 전월 실적에 안 들어갑니다">
          <CategoryMulti value={draft.performance.excludedCategories} onChange={(v) => patch({ performance: { ...draft.performance, excludedCategories: v } })} />
        </Field>
        <Field label="실적 제외 가맹점 키워드" hint="탭해서 삭제">
          <KeywordChips
            value={draft.performance.excludedKeywords ?? []}
            onChange={(v) => patch({ performance: { ...draft.performance, excludedKeywords: v } })}
            placeholder="예: 상품권, 교통카드 충전"
          />
        </Field>
        <div className="rounded-xl bg-rose-50/60 p-2.5 ring-1 ring-rose-100">
          <p className="text-[10.5px] font-semibold text-rose-700">적립·할인 제외 (실적에는 들어가도 혜택은 없음)</p>
          <p className="mt-0.5 text-[9.5px] leading-relaxed text-rose-500/80">
            세금·공과금처럼 실적에는 잡히지만 적립은 안 붙는 결제를 여기에 둡니다.
          </p>
          <p className="mt-1 text-[9.5px] leading-relaxed text-rose-600/70">
            제외 합계 —{' '}
            {(draft.benefitExclusions?.categories ?? []).length + (draft.benefitExclusions?.keywords ?? []).length === 0
              ? '없음'
              : [
                  ...(draft.benefitExclusions?.categories ?? []).map((c) => CATEGORY_LABEL[c]),
                  ...(draft.benefitExclusions?.keywords ?? []),
                ].join(' · ')}
          </p>
          <div className="mt-2 space-y-2">
            <CategoryMulti
              value={draft.benefitExclusions?.categories ?? []}
              onChange={(v) =>
                patch({ benefitExclusions: { categories: v, keywords: draft.benefitExclusions?.keywords ?? [] } })
              }
              tone="rose"
            />
            <KeywordChips
              value={draft.benefitExclusions?.keywords ?? []}
              onChange={(v) =>
                patch({ benefitExclusions: { categories: draft.benefitExclusions?.categories ?? [], keywords: v } })
              }
              placeholder="예: 등록금, 수도요금"
            />
          </div>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-[11px] font-semibold text-slate-600">실적 수동 보정 (카드사 공식 실적과 다를 때)</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Field label="전월 보정(원)">
              <input
                className={inputClass}
                type="number"
                step={10000}
                value={draft.manual.prevMonthAdjustment}
                onChange={(e) => patch({ manual: { ...draft.manual, prevMonthAdjustment: Number(e.target.value) || 0 } })}
              />
            </Field>
            <Field label="당월 보정(원)">
              <input
                className={inputClass}
                type="number"
                step={10000}
                value={draft.manual.currentMonthAdjustment}
                onChange={(e) => patch({ manual: { ...draft.manual, currentMonthAdjustment: Number(e.target.value) || 0 } })}
              />
            </Field>
          </div>
        </div>
      </Panel>

      <Panel className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[12.5px] font-bold text-ink">혜택 {draft.benefits.length}개</p>
          <button onClick={() => setNewRule(emptyBenefit())} className={btnSubtle}>+ 혜택 추가</button>
        </div>
        {draft.benefits.map((rule) => (
          <div key={rule.id} className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex items-start justify-between gap-2">
              <button className="min-w-0 flex-1 text-left" onClick={() => setOpenRule(openRule === rule.id ? null : rule.id)}>
                <p className="truncate text-[12px] font-medium text-slate-700">{rule.label}</p>
                <p className="text-[10px] text-slate-400">{rateLabel(rule, state.settings.pointValues)}{capKrwOf(rule, state.settings.pointValues) !== null ? ` · ${rule.sharedCapGroup ? '통합 ' : ''}월 한도 ${formatWon(capKrwOf(rule, state.settings.pointValues)!)}` : ''}</p>
              </button>
              <div className="flex shrink-0 items-center gap-1">
                <VerifyBadge verification={rule.verification} />
                <button
                  onClick={() => patch({ benefits: draft.benefits.filter((b) => b.id !== rule.id) })}
                  className="rounded-lg bg-rose-50 px-1.5 py-1 text-[10px] text-rose-500"
                >
                  삭제
                </button>
              </div>
            </div>
            {openRule === rule.id && (
              <BenefitFields
                rule={rule}
                pointValues={state.settings.pointValues}
                usedKrw={draft.usage[rule.id] ?? 0}
                onChange={(next) => patch({ benefits: draft.benefits.map((b) => (b.id === rule.id ? next : b)) })}
                onUsageChange={(v) => patch({ usage: { ...draft.usage, [rule.id]: v } })}
              />
            )}
          </div>
        ))}
        {newRule && (
          <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11.5px] font-semibold text-indigo-700">새 혜택</p>
              <button onClick={() => setNewRule(null)} className="text-[10.5px] text-slate-400">취소</button>
            </div>
            <BenefitFields
              rule={newRule}
              pointValues={state.settings.pointValues}
              usedKrw={0}
              onChange={setNewRule}
              onUsageChange={() => undefined}
            />
            <button
              onClick={() => {
                patch({ benefits: [...draft.benefits, newRule] });
                setNewRule(null);
              }}
              className="mt-2 w-full rounded-lg bg-ink py-2 text-[11.5px] font-semibold text-white"
            >
              이 혜택 추가
            </button>
          </div>
        )}
        {draft.benefits.length === 0 && !newRule && <p className="text-[11px] text-slate-400">혜택을 추가하면 이 카드도 추천 계산에 반영됩니다.</p>}
      </Panel>

      {(draft.networkPerks?.length ?? 0) > 0 && (
        <Panel className="space-y-2">
          <p className="text-[12.5px] font-bold text-ink">
            브랜드(네트워크) 혜택 {draft.networkPerks!.length}개
          </p>
          <p className="text-[10px] leading-relaxed text-slate-400">
            {draft.network} {draft.networkTier ? `${draft.networkTier} 등급` : ''} 공통 혜택입니다. 카드 고유 혜택과 같은 항목은 하나만 적용됩니다.
          </p>
          {draft.networkPerks!.map((perk) => (
            <PerkItem key={perk.id} perk={perk} />
          ))}
        </Panel>
      )}

      {(draft.issuerPerks?.length ?? 0) > 0 && (
        <Panel className="space-y-2">
          <p className="text-[12.5px] font-bold text-ink">카드사 혜택 {draft.issuerPerks!.length}개</p>
          <p className="text-[10px] leading-relaxed text-slate-400">카드사가 이 상품에 제공하는 선택서비스입니다.</p>
          {draft.issuerPerks!.map((perk) => (
            <PerkItem key={perk.id} perk={perk} />
          ))}
        </Panel>
      )}

      {(draft.merchantPerks?.length ?? 0) > 0 && (
        <Panel className="space-y-2">
          <p className="text-[12.5px] font-bold text-ink">카드 고유·가맹점 혜택 {draft.merchantPerks!.length}개</p>
          <p className="text-[10px] leading-relaxed text-slate-400">라운지·발렛·특정 가맹점 할인처럼 이 카드에만 있는 혜택입니다.</p>
          {draft.merchantPerks!.map((perk) => (
            <PerkItem key={perk.id} perk={perk} />
          ))}
        </Panel>
      )}

      <Panel>
        <UserPerkSection perks={draft.userPerks ?? []} onChange={(next) => patch({ userPerks: next })} />
      </Panel>

      <Panel>
        <PromoSection promos={draft.promos} onChange={(next) => patch({ promos: next })} today={today} />
      </Panel>
    </Sheet>
  );
}

function BenefitFields({
  rule,
  pointValues,
  usedKrw,
  onChange,
  onUsageChange,
}: {
  rule: BenefitRule;
  pointValues: Record<string, number>;
  usedKrw: number;
  onChange: (next: BenefitRule) => void;
  onUsageChange: (v: number) => void;
}) {
  const patch = (p: Partial<BenefitRule>) => onChange({ ...rule, ...p });
  return (
    <div className="mt-2.5 space-y-2.5 border-t border-slate-100 pt-2.5">
      <Field label="혜택 이름">
        <input className={inputClass} value={rule.label} onChange={(e) => patch({ label: e.target.value })} />
      </Field>
      <Field label="적용 업종">
        <CategoryMulti value={rule.categories} onChange={(v) => patch({ categories: v })} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="혜택 방식">
          <select className={selectClass} value={rule.earnType} onChange={(e) => patch({ earnType: e.target.value as BenefitRule['earnType'] })}>
            <option value="percent">정률 할인·적립(%)</option>
            <option value="points">포인트 적립</option>
          </select>
        </Field>
        {rule.earnType === 'percent' ? (
          <Field label="비율(%)">
            <input className={inputClass} inputMode="decimal" value={rule.percent ?? 0} onChange={(e) => patch({ percent: Number(e.target.value) || 0 })} />
          </Field>
        ) : (
          <Field label="적립 단위(원당)">
            <input className={inputClass} inputMode="numeric" value={rule.unitAmount ?? 1000} onChange={(e) => patch({ unitAmount: parseAmountInput(e.target.value) || 1000 })} />
          </Field>
        )}
      </div>
      {rule.earnType === 'points' && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="단위당 포인트">
            <input className={inputClass} inputMode="decimal" value={rule.pointsPerUnit ?? 1} onChange={(e) => patch({ pointsPerUnit: Number(e.target.value) || 0 })} />
          </Field>
          <Field label="포인트 종류">
            <select className={selectClass} value={rule.pointCurrencyId ?? 'krw'} onChange={(e) => patch({ pointCurrencyId: e.target.value as PointCurrencyId })}>
              {POINT_CURRENCIES.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Field label="월 혜택 한도(원)" hint="비우면 없음">
          <input
            className={inputClass}
            inputMode="numeric"
            value={rule.monthlyCapKrw ? rule.monthlyCapKrw.toLocaleString('ko-KR') : ''}
            onChange={(e) => patch({ monthlyCapKrw: e.target.value ? parseAmountInput(e.target.value) : undefined })}
            placeholder="한도 없음"
          />
        </Field>
        <Field label="전월 실적 조건(원)">
          <input
            className={inputClass}
            inputMode="numeric"
            value={rule.minPrevMonth ? rule.minPrevMonth.toLocaleString('ko-KR') : ''}
            onChange={(e) => patch({ minPrevMonth: e.target.value ? parseAmountInput(e.target.value) : undefined })}
            placeholder="조건 없음"
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="이번 달 사용한 혜택(원)">
          <input className={inputClass} inputMode="numeric" value={usedKrw ? usedKrw.toLocaleString('ko-KR') : '0'} onChange={(e) => onUsageChange(parseAmountInput(e.target.value))} />
        </Field>
        <Field label="데이터 신뢰도">
          <select className={selectClass} value={rule.verification} onChange={(e) => patch({ verification: e.target.value as Verification })}>
            <option value="official">공식 확인</option>
            <option value="example">예시 데이터</option>
          </select>
        </Field>
      </div>
      <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
        <span className="text-[11px] text-slate-600">카드사 직접 결제 조건</span>
        <input type="checkbox" checked={!!rule.requiresDirect} onChange={(e) => patch({ requiresDirect: e.target.checked })} className="h-4 w-4 accent-indigo-600" />
      </div>
      <Field label="메모">
        <input className={inputClass} value={rule.note ?? ''} onChange={(e) => patch({ note: e.target.value })} placeholder="예: 한도는 예시값" />
      </Field>
      <p className="rounded-lg bg-indigo-50 px-2.5 py-1.5 text-[10px] text-indigo-700">
        현재 환산: {rateLabel(rule, pointValues)}
      </p>
    </div>
  );
}

function TransactionSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, addTransaction } = useCardStore();
  const [cardId, setCardId] = useState(state.cards[0]?.id ?? '');
  const [merchant, setMerchant] = useState('');
  const [category, setCategory] = useState<CategoryId>('general');
  const [amount, setAmount] = useState(0);
  const [date, setDate] = useState(todayISO());
  const [memo, setMemo] = useState('');

  useEffect(() => {
    if (open) {
      setCardId(state.cards[0]?.id ?? '');
      setMerchant('');
      setCategory('general');
      setAmount(0);
      setDate(todayISO());
      setMemo('');
    }
  }, [open, state.cards]);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="결제내역 추가"
      subtitle="카드 승인내역을 수동으로 기록합니다"
      footer={
        <button
          disabled={!cardId || amount <= 0 || !merchant.trim()}
          onClick={() => {
            addTransaction({ cardId, merchant: merchant.trim(), category, amount, date, status: 'active', memo: memo || undefined });
            onClose();
          }}
          className={`${btnPrimary} w-full`}
        >
          저장
        </button>
      }
    >
      <Panel className="space-y-3">
        <Field label="카드">
          <select className={selectClass} value={cardId} onChange={(e) => setCardId(e.target.value)}>
            {state.cards.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="가맹점">
            <input className={inputClass} value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="신세계백화점" />
          </Field>
          <Field label="금액(원)">
            <input className={inputClass} inputMode="numeric" value={amount ? amount.toLocaleString('ko-KR') : ''} onChange={(e) => setAmount(parseAmountInput(e.target.value))} placeholder="300,000" />
          </Field>
        </div>
        <Field label="업종">
          <select className={selectClass} value={category} onChange={(e) => setCategory(e.target.value as CategoryId)}>
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </Field>
        <Field label="결제일">
          <input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="메모">
          <input className={inputClass} value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="선택" />
        </Field>
      </Panel>
    </Sheet>
  );
}
