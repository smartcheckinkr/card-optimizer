import { useEffect, useRef, useState } from 'react';
import type { CategoryId, Perk, PerkGroup, PerkKind, PromoRule } from '../types';
import { CATEGORIES } from '../data/categories';
import { deleteCapture, getCapture, saveCapture } from '../services/captures';
import { PERK_GROUP_LABEL, PERK_GROUP_ORDER, promosState } from '../engine/perks';
import { formatWon, parseAmountInput } from '../lib/format';
import { Badge, Field, inputClass, selectClass } from './ui';

export function PerkVerifyBadge({ verification }: { verification: Perk['verification'] }) {
  if (verification === 'official') return <Badge tone="official">공식 확인</Badge>;
  if (verification === 'user') return <Badge tone="primary">내가 추가</Badge>;
  return <Badge tone="example">예시 데이터</Badge>;
}

/** IndexedDB에 저장한 캡처를 불러와 썸네일로 보여 준다. 누르면 원본 크기로 연다. */
export function CaptureThumb({ capturePath, onRemove }: { capturePath: string; onRemove?: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    getCapture(capturePath).then((value) => {
      if (alive) setUrl(value);
    });
    return () => {
      alive = false;
    };
  }, [capturePath]);

  if (!url) {
    return <span className="inline-flex h-12 w-12 items-center justify-center rounded-lg bg-slate-100 text-[9px] text-slate-400">불러오는 중</span>;
  }
  return (
    <>
      <span className="relative inline-flex">
        <button type="button" onClick={() => setOpen(true)} className="h-12 w-12 overflow-hidden rounded-lg ring-1 ring-slate-200" aria-label="캡처 크게 보기">
          <img src={url} alt="혜택 캡처" className="h-full w-full object-cover" />
        </button>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="absolute -right-1.5 -top-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] text-white"
            aria-label="캡처 삭제"
          >
            ×
          </button>
        )}
      </span>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/70 p-4" onClick={() => setOpen(false)} role="presentation">
          <img src={url} alt="혜택 캡처 원본" className="max-h-full max-w-full rounded-xl bg-white object-contain" />
        </div>
      )}
    </>
  );
}

/** 캡처 파일 선택 + 저장. 성공하면 키를 돌려준다. */
export function CaptureUpload({ onSaved, label = '캡처 이미지 첨부' }: { onSaved: (key: string) => void; label?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="rounded-xl bg-slate-50 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-slate-600">{label}</span>
        <button
          type="button"
          onClick={() => ref.current?.click()}
          disabled={busy}
          className="rounded-lg bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 ring-1 ring-slate-200 disabled:opacity-50"
        >
          {busy ? '저장 중…' : '이미지 선택'}
        </button>
      </div>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setBusy(true);
          setError(null);
          try {
            const key = await saveCapture(file);
            onSaved(key);
          } catch (err) {
            setError(err instanceof Error ? err.message : '캡처를 저장하지 못했습니다.');
          } finally {
            setBusy(false);
            if (ref.current) ref.current.value = '';
          }
        }}
      />
      <p className="mt-1 text-[10px] leading-relaxed text-slate-400">
        긴 변 1280px로 줄여 브라우저(IndexedDB)에 저장합니다. 새로고침·재방문 후에도 유지됩니다.
      </p>
      {error && <p className="mt-1 text-[10px] text-rose-500">{error}</p>}
    </div>
  );
}

function perkValueLabel(perk: Perk): string {
  if (perk.valueText) return perk.valueText;
  if (perk.kind === 'discount' || perk.kind === 'points') return `${perk.ratePercent ?? 0}%`;
  if (perk.kind === 'voucher') return formatWon(perk.amountKrw ?? 0);
  return '';
}

/** 읽기 전용 혜택 한 줄(브랜드·카드사·가맹점 공통) */
export function PerkItem({
  perk,
  onEdit,
  onDelete,
}: {
  perk: Perk;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[11.5px] font-medium text-slate-800">{perk.label}</p>
          <p className="mt-0.5 text-[10.5px] leading-relaxed text-slate-500">{perk.summary}</p>
          <p className="mt-0.5 text-[10px] text-slate-400">
            {perkValueLabel(perk)}
            {perk.minPrevMonth ? ` · 전월 ${formatWon(perk.minPrevMonth)} 이상` : ''}
            {perk.conditions ? ` · ${perk.conditions}` : ''}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge tone="muted">{PERK_GROUP_LABEL[perk.group]}</Badge>
            <PerkVerifyBadge verification={perk.verification} />
            <span className="text-[10px] text-slate-400">{perk.provider}</span>
            {perk.sourceUrl && (
              <a
                href={perk.sourceUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="text-[10px] font-medium text-indigo-600 underline decoration-indigo-200 underline-offset-2"
              >
                출처
              </a>
            )}
          </div>
          {perk.note && <p className="mt-1 rounded-lg bg-amber-50 px-2 py-1 text-[10px] text-amber-800">{perk.note}</p>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {perk.capturePath && <CaptureThumb capturePath={perk.capturePath} />}
          {onEdit && (
            <button type="button" onClick={onEdit} className="text-[10px] text-slate-400 underline">
              수정
            </button>
          )}
          {onDelete && (
            <button type="button" onClick={onDelete} className="text-[10px] text-rose-500 underline">
              삭제
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const emptyPerk = (): Perk => ({
  id: `perk-${Date.now().toString(36)}`,
  layer: 'user',
  provider: '사용자',
  label: '',
  group: 'other',
  kind: 'discount',
  ratePercent: 0,
  summary: '',
  verification: 'user',
});

/** 사용자가 직접 추가하는 상시 혜택 편집기 */
export function UserPerkEditor({
  perk,
  onChange,
  onCancel,
}: {
  perk: Perk;
  onChange: (next: Perk) => void;
  onCancel: () => void;
}) {
  const patch = (p: Partial<Perk>) => onChange({ ...perk, ...p });
  return (
    <div className="space-y-2 rounded-xl border border-indigo-200 bg-indigo-50/40 p-2.5">
      <Field label="혜택 이름">
        <input className={inputClass} value={perk.label} onChange={(e) => patch({ label: e.target.value })} placeholder="예: CGV 3,000원 할인" />
      </Field>
      <Field label="왜 유리한지 한 줄">
        <input className={inputClass} value={perk.summary} onChange={(e) => patch({ summary: e.target.value })} placeholder="예: 영화 예매 시 3천 원 청구할인" />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="영역">
          <select className={selectClass} value={perk.group} onChange={(e) => patch({ group: e.target.value as PerkGroup })}>
            {PERK_GROUP_ORDER.map((g) => (
              <option key={g} value={g}>{PERK_GROUP_LABEL[g]}</option>
            ))}
          </select>
        </Field>
        <Field label="혜택 방식">
          <select className={selectClass} value={perk.kind} onChange={(e) => patch({ kind: e.target.value as PerkKind })}>
            <option value="discount">할인</option>
            <option value="points">적립</option>
            <option value="voucher">정액·바우처</option>
            <option value="free">무료 이용</option>
            <option value="access">이용권</option>
            <option value="status">등급·멤버십</option>
          </select>
        </Field>
      </div>
      {(perk.kind === 'discount' || perk.kind === 'points') && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="비율(%)">
            <input className={inputClass} inputMode="decimal" value={perk.ratePercent ?? 0} onChange={(e) => patch({ ratePercent: Number(e.target.value) || 0 })} />
          </Field>
          <Field label="월 한도(원)" hint="선택">
            <input
              className={inputClass}
              inputMode="numeric"
              value={perk.monthlyCapKrw ? perk.monthlyCapKrw.toLocaleString('ko-KR') : ''}
              onChange={(e) => patch({ monthlyCapKrw: e.target.value ? parseAmountInput(e.target.value) : undefined })}
              placeholder="한도 없음"
            />
          </Field>
        </div>
      )}
      {(perk.kind === 'voucher' || perk.kind === 'free' || perk.kind === 'access') && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="금액(원)" hint="선택">
            <input
              className={inputClass}
              inputMode="numeric"
              value={perk.amountKrw ? perk.amountKrw.toLocaleString('ko-KR') : ''}
              onChange={(e) => patch({ amountKrw: e.target.value ? parseAmountInput(e.target.value) : undefined })}
              placeholder="금액 없음"
            />
          </Field>
          <Field label="표시 문구">
            <input className={inputClass} value={perk.valueText ?? ''} onChange={(e) => patch({ valueText: e.target.value })} placeholder="예: 연 2회" />
          </Field>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Field label="전월 실적(원)" hint="선택">
          <input
            className={inputClass}
            inputMode="numeric"
            value={perk.minPrevMonth ? perk.minPrevMonth.toLocaleString('ko-KR') : ''}
            onChange={(e) => patch({ minPrevMonth: e.target.value ? parseAmountInput(e.target.value) : undefined })}
            placeholder="조건 없음"
          />
        </Field>
        <Field label="가맹점 키워드" hint="쉼표 구분">
          <input
            className={inputClass}
            value={(perk.merchantKeys ?? []).join(', ')}
            onChange={(e) => patch({ merchantKeys: e.target.value.split(',').map((v) => v.trim()).filter(Boolean) })}
            placeholder="예: CGV, 영화"
          />
        </Field>
      </div>
      <Field label="조건 메모">
        <input className={inputClass} value={perk.conditions ?? ''} onChange={(e) => patch({ conditions: e.target.value })} placeholder="예: 1만 원 이상 결제, 월 2회" />
      </Field>
      <Field label="출처 링크" hint="선택">
        <input className={inputClass} value={perk.sourceUrl ?? ''} onChange={(e) => patch({ sourceUrl: e.target.value })} placeholder="https://" />
      </Field>
      {perk.capturePath ? (
        <div className="flex items-center gap-2">
          <CaptureThumb
            capturePath={perk.capturePath}
            onRemove={() => {
              void deleteCapture(perk.capturePath!);
              patch({ capturePath: undefined });
            }}
          />
          <span className="text-[10px] text-slate-500">캡처 첨부됨 — 브라우저에 저장됩니다</span>
        </div>
      ) : (
        <CaptureUpload onSaved={(key) => patch({ capturePath: key })} />
      )}
      <p className="rounded-lg bg-white px-2.5 py-1.5 text-[10px] leading-relaxed text-slate-500">
        링크의 제목·내용은 직접 적어 주세요. 앱이 다른 사이트를 대신 열어 내용을 긁어오는 것은 보안(CORS) 때문에 불가능합니다.
        링크·캡처를 보내 주시면 카탈로그에 등록해 드립니다.
      </p>
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="flex-1 rounded-lg bg-white py-2 text-[11.5px] font-medium text-slate-600 ring-1 ring-slate-200">
          취소
        </button>
      </div>
    </div>
  );
}

export function UserPerkSection({
  perks,
  onChange,
}: {
  perks: Perk[];
  onChange: (next: Perk[]) => void;
}) {
  const [draft, setDraft] = useState<Perk | null>(null);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[12.5px] font-bold text-ink">내가 추가한 혜택 {perks.length}개</p>
        <button type="button" onClick={() => setDraft(emptyPerk())} className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-[12px] font-medium text-slate-600">
          + 혜택 추가
        </button>
      </div>
      {perks.map((perk) => (
        <PerkItem
          key={perk.id}
          perk={perk}
          onEdit={() => setDraft(perk)}
          onDelete={() => {
            if (perk.capturePath) void deleteCapture(perk.capturePath);
            onChange(perks.filter((p) => p.id !== perk.id));
          }}
        />
      ))}
      {draft && (
        <UserPerkEditor
          perk={draft}
          onChange={setDraft}
          onCancel={() => setDraft(null)}
        />
      )}
      {draft && (
        <button
          type="button"
          onClick={() => {
            onChange([...perks.filter((p) => p.id !== draft.id), draft]);
            setDraft(null);
          }}
          disabled={!draft.label.trim()}
          className="w-full rounded-lg bg-ink py-2 text-[11.5px] font-semibold text-white disabled:opacity-40"
        >
          이 혜택 저장
        </button>
      )}
      {perks.length === 0 && !draft && <p className="text-[11px] text-slate-400">카드사 앱·캡처에서 확인한 혜택을 직접 추가할 수 있습니다.</p>}
    </div>
  );
}

const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** 새 이벤트는 오늘~30일 뒤를 기본 기간으로 채운다(그대로 저장해도 되고 직접 고쳐도 된다). */
const emptyPromo = (today: Date = new Date()): PromoRule => {
  const end = new Date(today);
  end.setDate(end.getDate() + 30);
  return {
    id: `promo-${Date.now().toString(36)}`,
    label: '',
    description: '',
    categories: ['general'],
    minSpend: 0,
    rewardKrw: 0,
    startsAt: isoDate(today),
    expiresAt: isoDate(end),
    enrolled: false,
    verification: 'user',
    note: '',
  };
};

function CategoryChips({ value, onChange }: { value: CategoryId[]; onChange: (v: CategoryId[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {CATEGORIES.map((c) => {
        const on = value.includes(c.id);
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onChange(on ? value.filter((v) => v !== c.id) : [...value, c.id])}
            className={`rounded-full px-2 py-0.5 text-[10px] ring-1 transition ${
              on ? 'bg-indigo-600 text-white ring-indigo-600' : 'bg-white text-slate-500 ring-slate-200'
            }`}
          >
            {c.label}
          </button>
        );
      })}
    </div>
  );
}

export function PromoSection({
  promos,
  onChange,
  today,
}: {
  promos: PromoRule[];
  onChange: (next: PromoRule[]) => void;
  today: Date;
}) {
  const [draft, setDraft] = useState<PromoRule | null>(null);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[12.5px] font-bold text-ink">이벤트(기간 한정) {promos.length}개</p>
        <button type="button" onClick={() => setDraft(emptyPromo(today))} className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-[12px] font-medium text-slate-600">
          + 이벤트 추가
        </button>
      </div>
      {promos.map((promo) => {
        const state = promosState(promo, today);
        return (
          <div
            key={promo.id}
            className={`rounded-xl border p-2.5 ${
              state === 'expired' ? 'border-slate-200 bg-slate-50 opacity-55' : state === 'upcoming' ? 'border-indigo-200 bg-indigo-50/40' : 'border-slate-200 bg-white'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-[11.5px] font-medium text-slate-800">{promo.label}</p>
                <p className="text-[10px] text-slate-500">
                  {promo.startsAt ? `${promo.startsAt} ~ ` : '~ '}
                  {promo.expiresAt || '기간 미정'}
                  {state === 'expired' ? ' · 종료' : state === 'upcoming' ? ' · 시작 전' : ' · 진행 중'}
                </p>
                <p className="mt-0.5 text-[10px] text-slate-400">
                  {formatWon(promo.minSpend)} 이상 · {formatWon(promo.rewardKrw)}
                  {promo.description ? ` · ${promo.description}` : ''}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <Badge tone={state === 'active' ? 'success' : 'muted'}>이벤트(기간 한정)</Badge>
                  <PerkVerifyBadge verification={promo.verification} />
                  <label className="flex items-center gap-1 text-[10px] text-slate-500">
                    <input
                      type="checkbox"
                      checked={promo.enrolled}
                      onChange={(e) => onChange(promos.map((p) => (p.id === promo.id ? { ...p, enrolled: e.target.checked } : p)))}
                      className="h-3.5 w-3.5 accent-indigo-600"
                    />
                    응모 완료
                  </label>
                  {promo.sourceUrl && (
                    <a href={promo.sourceUrl} target="_blank" rel="noreferrer noopener" className="text-[10px] text-indigo-600 underline">
                      출처
                    </a>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                {promo.capturePath && (
                  <CaptureThumb
                    capturePath={promo.capturePath}
                    onRemove={() => {
                      void deleteCapture(promo.capturePath!);
                      onChange(promos.map((p) => (p.id === promo.id ? { ...p, capturePath: undefined } : p)));
                    }}
                  />
                )}
                <button type="button" onClick={() => setDraft(promo)} className="text-[10px] text-slate-400 underline">
                  수정
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (promo.capturePath) void deleteCapture(promo.capturePath);
                    onChange(promos.filter((p) => p.id !== promo.id));
                  }}
                  className="text-[10px] text-rose-500 underline"
                >
                  삭제
                </button>
              </div>
            </div>
          </div>
        );
      })}
      {draft && (
        <div className="space-y-2 rounded-xl border border-indigo-200 bg-indigo-50/40 p-2.5">
          <Field label="이벤트명">
            <input className={inputClass} value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="예: CGV 3천 원 할인 응모" />
          </Field>
          <Field label="혜택 내용">
            <input className={inputClass} value={draft.description ?? ''} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="예: 1만 원 이상 결제 시 3,000원 청구할인" />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="시작일" hint="선택">
              <input type="date" className={inputClass} value={draft.startsAt ?? ''} onChange={(e) => setDraft({ ...draft, startsAt: e.target.value })} />
            </Field>
            <Field label="종료일">
              <input type="date" className={inputClass} value={draft.expiresAt} onChange={(e) => setDraft({ ...draft, expiresAt: e.target.value })} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="필요 결제액(원)">
              <input
                className={inputClass}
                inputMode="numeric"
                value={draft.minSpend ? draft.minSpend.toLocaleString('ko-KR') : '0'}
                onChange={(e) => setDraft({ ...draft, minSpend: parseAmountInput(e.target.value) })}
              />
            </Field>
            <Field label="혜택 금액(원)">
              <input
                className={inputClass}
                inputMode="numeric"
                value={draft.rewardKrw ? draft.rewardKrw.toLocaleString('ko-KR') : '0'}
                onChange={(e) => setDraft({ ...draft, rewardKrw: parseAmountInput(e.target.value) })}
              />
            </Field>
          </div>
          <Field label="대상 업종">
            <CategoryChips value={draft.categories} onChange={(v) => setDraft({ ...draft, categories: v })} />
          </Field>
          <Field label="조건 메모">
            <input className={inputClass} value={draft.conditions ?? ''} onChange={(e) => setDraft({ ...draft, conditions: e.target.value })} placeholder="예: 전월 30만 원, 1인 1회" />
          </Field>
          <Field label="출처 링크" hint="선택">
            <input className={inputClass} value={draft.sourceUrl ?? ''} onChange={(e) => setDraft({ ...draft, sourceUrl: e.target.value })} placeholder="https://" />
          </Field>
          {draft.capturePath ? (
            <div className="flex items-center gap-2">
              <CaptureThumb
                capturePath={draft.capturePath}
                onRemove={() => {
                  void deleteCapture(draft.capturePath!);
                  setDraft({ ...draft, capturePath: undefined });
                }}
              />
              <span className="text-[10px] text-slate-500">캡처 첨부됨</span>
            </div>
          ) : (
            <CaptureUpload onSaved={(key) => setDraft({ ...draft, capturePath: key })} />
          )}
          <p className="rounded-lg bg-white px-2.5 py-1.5 text-[10px] leading-relaxed text-slate-500">
            이벤트 내용·기간은 직접 적어 주세요(앱이 다른 사이트를 대신 열어 긁어오는 것은 CORS 때문에 불가능합니다).
            기간이 지나면 목록에 흐리게 남고 추천 계산에서는 자동 제외됩니다.
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setDraft(null)} className="flex-1 rounded-lg bg-white py-2 text-[11.5px] font-medium text-slate-600 ring-1 ring-slate-200">
              취소
            </button>
            <button
              type="button"
              onClick={() => {
                if (!draft.label.trim() || !draft.expiresAt) return;
                onChange([...promos.filter((p) => p.id !== draft.id), draft]);
                setDraft(null);
              }}
              disabled={!draft.label.trim() || !draft.expiresAt}
              className="flex-1 rounded-lg bg-ink py-2 text-[11.5px] font-semibold text-white disabled:opacity-40"
            >
              이벤트 저장
            </button>
          </div>
        </div>
      )}
      {promos.length === 0 && !draft && <p className="text-[11px] text-slate-400">기간 한정 이벤트를 직접 추가하면 AI 비서가 유효 기간 안에서만 반영합니다.</p>}
    </div>
  );
}
