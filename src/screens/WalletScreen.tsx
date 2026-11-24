import { useMemo, useState } from 'react';
import { useCardStore } from '../state/store';
import type { WalletItem, WalletKind } from '../types';
import { WALLET_KIND_LABEL } from '../data/categories';
import { dDay, todayISO } from '../engine/date';
import { formatWon, parseAmountInput } from '../lib/format';
import { Badge, Field, InfoNote, Panel, SectionTitle, Sheet, VerifyBadge, btnPrimary, btnSubtle, inputClass, selectClass } from '../components/ui';

const KIND_EMOJI: Record<WalletKind, string> = {
  stay: '🛏️',
  lounge: '🛋️',
  valet: '🅿️',
  spa: '💆',
  voucher: '🎟️',
  dining: '🍽️',
  credit: '💵',
  status: '🏅',
};

const FILTERS: { id: 'all' | WalletKind; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'stay', label: '숙박권' },
  { id: 'lounge', label: '라운지' },
  { id: 'valet', label: '발레파킹' },
  { id: 'voucher', label: '바우처' },
  { id: 'credit', label: '크레딧' },
  { id: 'status', label: '등급' },
];

const emptyItem = (cardId: string): WalletItem => ({
  id: `w-${Date.now().toString(36)}`,
  cardId,
  title: '',
  kind: 'voucher',
  remaining: 1,
  total: 1,
  unit: '회',
  expiresAt: todayISO(),
  verification: 'example',
  conditions: '',
  howTo: '',
});

export function WalletScreen() {
  const { state, updateWalletItem, addWalletItem, deleteWalletItem } = useCardStore();
  const [filter, setFilter] = useState<'all' | WalletKind>('all');
  const [adding, setAdding] = useState<WalletItem | null>(null);
  const today = useMemo(() => new Date(), []);

  const items = state.wallet
    .filter((w) => filter === 'all' || w.kind === filter)
    .slice()
    .sort((a, b) => {
      const da = dDay(a.expiresAt, today);
      const db = dDay(b.expiresAt, today);
      return (da ?? 9999) - (db ?? 9999);
    });

  const active = state.wallet.filter((w) => w.remaining > 0);
  const expiringSoon = active.filter((w) => {
    const d = dDay(w.expiresAt, today);
    return d !== null && d >= 0 && d <= 30;
  });
  const totalValue = active.reduce((s, w) => s + (w.valueKrw ?? 0) * (w.total > 0 ? w.remaining / w.total : 1), 0);

  return (
    <div className="pb-6">
      <div className="rounded-b-[26px] px-5 pb-5 pt-5 text-white" style={{ background: 'linear-gradient(150deg,#1a1035 0%,#3b1d63 55%,#7c3aed 130%)' }}>
        <h1 className="text-[19px] font-bold tracking-tight">혜택 지갑</h1>
        <p className="mt-1 text-[11.5px] text-white/60">숙박권·라운지·바우처 잔여 횟수와 만료를 관리합니다.</p>
        <div className="mt-4 grid grid-cols-3 gap-3 border-t border-white/10 pt-3.5">
          <div>
            <p className="text-[10px] text-white/50">사용 가능</p>
            <p className="mt-0.5 text-[17px] font-bold">{active.length}건</p>
          </div>
          <div>
            <p className="text-[10px] text-white/50">30일 내 소멸</p>
            <p className="mt-0.5 text-[17px] font-bold text-amber-200">{expiringSoon.length}건</p>
          </div>
          <div>
            <p className="text-[10px] text-white/50">추정 가치</p>
            <p className="mt-0.5 text-[17px] font-bold">{formatWon(totalValue, { compact: true })}</p>
          </div>
        </div>
      </div>

      <div className="space-y-4 px-4 pt-4">
        <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${filter === f.id ? 'bg-ink text-white' : 'bg-white text-slate-500 ring-1 ring-slate-200'}`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <button onClick={() => setAdding(emptyItem(state.cards[0]?.id ?? ''))} className={`${btnSubtle} shrink-0`}>+ 추가</button>
        </div>

        {expiringSoon.length > 0 && filter === 'all' && (
          <InfoNote tone="amber">
            {expiringSoon.map((w) => w.title).join(', ')}이 30일 안에 만료됩니다. 사용 계획이 없다면 카드사에 문의해 연장 가능 여부를 확인하세요.
          </InfoNote>
        )}

        <div className="space-y-2.5">
          {items.length === 0 && <InfoNote>이 분류에 등록된 혜택이 없습니다.</InfoNote>}
          {items.map((w) => {
            const card = state.cards.find((c) => c.id === w.cardId);
            const d = dDay(w.expiresAt, today);
            return (
              <Panel key={w.id} className="!p-3.5">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-[16px]">{KIND_EMOJI[w.kind] ?? '🎁'}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate text-[13px] font-semibold text-ink">{w.title}</p>
                      <VerifyBadge verification={w.verification} />
                    </div>
                    <p className="mt-0.5 text-[10.5px] text-slate-400">
                      {card?.shortName ?? '카드 미지정'} · {WALLET_KIND_LABEL[w.kind]}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10.5px]">
                      {w.expiresAt && (
                        <Badge tone={d !== null && d <= 15 ? 'danger' : d !== null && d <= 30 ? 'warning' : 'muted'}>
                          {d === null ? '' : d < 0 ? '만료됨' : `D-${d}`} · {w.expiresAt}
                        </Badge>
                      )}
                      {w.valueKrw ? <Badge tone="primary">약 {formatWon(w.valueKrw, { compact: true })}</Badge> : null}
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-2.5 py-1.5">
                      <span className="text-[11px] text-slate-500">잔여</span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => updateWalletItem(w.id, { remaining: Math.max(0, w.remaining - 1) })}
                          className="h-6 w-6 rounded-lg bg-white text-[13px] font-bold text-slate-500 ring-1 ring-slate-200"
                          aria-label="잔여 차감"
                        >
                          −
                        </button>
                        <span className="min-w-[46px] text-center text-[12px] font-bold text-ink">
                          {w.remaining} / {w.total} {w.unit}
                        </span>
                        <button
                          onClick={() => updateWalletItem(w.id, { remaining: Math.min(w.total, w.remaining + 1) })}
                          className="h-6 w-6 rounded-lg bg-white text-[13px] font-bold text-slate-500 ring-1 ring-slate-200"
                          aria-label="잔여 증가"
                        >
                          +
                        </button>
                      </div>
                    </div>
                    {(w.conditions || w.howTo) && (
                      <div className="mt-1.5 space-y-0.5 text-[10px] leading-relaxed text-slate-500">
                        {w.conditions && <p>조건: {w.conditions}</p>}
                        {w.howTo && <p>이용: {w.howTo}</p>}
                      </div>
                    )}
                    {w.note && <p className="mt-1 text-[10px] text-amber-600">{w.note}</p>}
                    <div className="mt-1.5 flex justify-end">
                      <button onClick={() => deleteWalletItem(w.id)} className="text-[10px] text-slate-300">삭제</button>
                    </div>
                  </div>
                </div>
              </Panel>
            );
          })}
        </div>

        <p className="pt-1 text-[10.5px] leading-relaxed text-slate-400">
          잔여 횟수는 사용할 때마다 직접 차감합니다. 예시 데이터 배지가 있는 항목은 카드사 공식 혜택 안내로 조건을 확인해 주세요.
        </p>
      </div>

      <Sheet
        open={adding !== null}
        onClose={() => setAdding(null)}
        title="혜택 추가"
        subtitle="숙박권·라운지·바우처 등을 직접 등록합니다"
        footer={
          <button
            disabled={!adding?.title.trim() || !adding?.cardId}
            onClick={() => {
              if (!adding) return;
              addWalletItem(adding);
              setAdding(null);
            }}
            className={`${btnPrimary} w-full`}
          >
            저장
          </button>
        }
      >
        {adding && (
          <Panel className="space-y-3">
            <Field label="혜택 이름">
              <input className={inputClass} value={adding.title} onChange={(e) => setAdding({ ...adding, title: e.target.value })} placeholder="예: 주말 무료 숙박권" />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="카드">
                <select className={selectClass} value={adding.cardId} onChange={(e) => setAdding({ ...adding, cardId: e.target.value })}>
                  {state.cards.map((c) => (
                    <option key={c.id} value={c.id}>{c.shortName}</option>
                  ))}
                </select>
              </Field>
              <Field label="분류">
                <select className={selectClass} value={adding.kind} onChange={(e) => setAdding({ ...adding, kind: e.target.value as WalletKind })}>
                  {Object.entries(WALLET_KIND_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Field label="잔여">
                <input className={inputClass} inputMode="numeric" value={adding.remaining} onChange={(e) => setAdding({ ...adding, remaining: Number(e.target.value) || 0 })} />
              </Field>
              <Field label="전체">
                <input className={inputClass} inputMode="numeric" value={adding.total} onChange={(e) => setAdding({ ...adding, total: Number(e.target.value) || 0 })} />
              </Field>
              <Field label="단위">
                <input className={inputClass} value={adding.unit} onChange={(e) => setAdding({ ...adding, unit: e.target.value })} placeholder="회" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="만료일">
                <input type="date" className={inputClass} value={adding.expiresAt ?? ''} onChange={(e) => setAdding({ ...adding, expiresAt: e.target.value })} />
              </Field>
              <Field label="추정 가치(원)">
                <input className={inputClass} inputMode="numeric" value={adding.valueKrw ? adding.valueKrw.toLocaleString('ko-KR') : ''} onChange={(e) => setAdding({ ...adding, valueKrw: parseAmountInput(e.target.value) })} placeholder="선택" />
              </Field>
            </div>
            <Field label="이용 조건">
              <input className={inputClass} value={adding.conditions ?? ''} onChange={(e) => setAdding({ ...adding, conditions: e.target.value })} placeholder="예: 주말 표준 객실, 세금 별도" />
            </Field>
            <Field label="예약·이용 방법">
              <input className={inputClass} value={adding.howTo ?? ''} onChange={(e) => setAdding({ ...adding, howTo: e.target.value })} placeholder="예: 카드사 앱 > 혜택 > 예약" />
            </Field>
            <Field label="데이터 신뢰도">
              <select className={selectClass} value={adding.verification} onChange={(e) => setAdding({ ...adding, verification: e.target.value as WalletItem['verification'] })}>
                <option value="official">공식 확인</option>
                <option value="example">예시 데이터</option>
              </select>
            </Field>
          </Panel>
        )}
      </Sheet>
    </div>
  );
}
