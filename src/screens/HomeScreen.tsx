import { useMemo } from 'react';
import { useCardStore } from '../state/store';
import { currentMonthSpend, prevMonthSpend } from '../engine/performance';
import { sumUsageKrw } from '../engine/recommend';
import { dDay, formatDate } from '../engine/date';
import { formatWon } from '../lib/format';
import { Badge, InfoNote, Panel, Progress, SectionTitle, Stat, VerifyBadge } from '../components/ui';
import type { TabId } from '../components/BottomNav';
import { CATEGORY_EMOJI, WALLET_KIND_LABEL } from '../data/categories';

export function HomeScreen({ onNavigate, onOpenSettings }: { onNavigate: (tab: TabId) => void; onOpenSettings: () => void }) {
  const { state } = useCardStore();
  const today = useMemo(() => new Date(), []);

  const cards = state.cards;
  const usageTotal = cards.reduce((s, c) => s + sumUsageKrw(c), 0);
  const currentTotal = cards.reduce((s, c) => s + currentMonthSpend(c, state.transactions, today), 0);
  const metCount = cards.filter((c) => c.performance.prevThreshold === 0 || prevMonthSpend(c, state.transactions, today) >= c.performance.prevThreshold).length;

  const shortfallCards = cards
    .filter((c) => c.performance.prevThreshold > 0)
    .map((c) => ({
      card: c,
      current: currentMonthSpend(c, state.transactions, today),
      prev: prevMonthSpend(c, state.transactions, today),
      gap: Math.max(0, c.performance.prevThreshold - currentMonthSpend(c, state.transactions, today)),
    }))
    .filter((x) => x.gap > 0)
    .sort((a, b) => a.gap - b.gap);

  const expiring = state.wallet
    .filter((w) => w.remaining > 0 && w.expiresAt)
    .map((w) => ({ w, d: dDay(w.expiresAt, today) ?? 9999 }))
    .filter((x) => x.d >= 0 && x.d <= 45)
    .sort((a, b) => a.d - b.d)
    .slice(0, 3);

  const recent = [...state.transactions]
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, 4);

  return (
    <div className="pb-6">
      <div className="relative overflow-hidden rounded-b-[28px] px-5 pb-6 pt-4 text-white" style={{ background: 'linear-gradient(160deg,#0b1428 0%,#1a2f5e 55%,#2d4f9e 100%)' }}>
        <div className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-indigo-400/20 blur-2xl" />
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/15 text-[13px]">💳</div>
            <span className="text-[13px] font-bold tracking-tight">카드옵티마</span>
            <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] font-semibold text-white/70">MVP</span>
          </div>
          <button onClick={onOpenSettings} className="rounded-full bg-white/10 p-2 text-white/80 transition active:scale-95" aria-label="설정과 데이터 관리">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
              <circle cx="12" cy="12" r="3.2" />
              <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.1-1.55 1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3.09V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.06.24.15.46.27.67" />
            </svg>
          </button>
        </div>

        <div className="relative mt-5">
          <p className="text-[11.5px] font-medium text-white/60">
            {today.getFullYear()}년 {today.getMonth() + 1}월 · 이번 달 받은 혜택(입력 기준)
          </p>
          <p className="mt-1 text-[30px] font-bold leading-tight tracking-tight">{formatWon(usageTotal)}</p>
          <div className="mt-4 grid grid-cols-3 gap-3 border-t border-white/10 pt-3.5">
            <Stat label="당월 인정 실적" value={formatWon(currentTotal, { compact: true })} hint="다음 달 기준" />
            <Stat label="전월 충족 카드" value={`${metCount} / ${cards.length}`} hint="장" />
            <Stat label="소멸 임박" value={`${expiring.length}건`} hint="45일 이내" />
          </div>
        </div>
      </div>

      <div className="space-y-6 px-4 pt-5">
        <section>
          <SectionTitle
            title="카드별 실적 현황"
            subtitle="막대는 당월 인정 실적(다음 달 혜택 기준)입니다"
            action={<button onClick={() => onNavigate('cards')} className="text-[11.5px] font-semibold text-indigo-600">전체 보기</button>}
          />
          <div className="space-y-2.5">
            {cards.map((card) => {
              const prev = prevMonthSpend(card, state.transactions, today);
              const cur = currentMonthSpend(card, state.transactions, today);
              const threshold = card.performance.prevThreshold;
              const met = threshold === 0 || prev >= threshold;
              const ratio = threshold === 0 ? 1 : Math.min(1, cur / threshold);
              return (
                <Panel key={card.id} className="!p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className="h-7 w-1.5 shrink-0 rounded-full"
                        style={{ background: { navy: '#1e3a8a', violet: '#7c3aed', emerald: '#0d9488', graphite: '#334155', coral: '#e11d48' }[card.theme] }}
                      />
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-semibold text-ink">{card.shortName}</p>
                        <p className="truncate text-[10.5px] text-slate-400">{card.issuer} · 연회비 {formatWon(card.annualFee, { compact: true })}</p>
                      </div>
                    </div>
                    {threshold === 0 ? (
                      <Badge tone="muted">실적 무관</Badge>
                    ) : met ? (
                      <Badge tone="success">전월 충족</Badge>
                    ) : (
                      <Badge tone="danger">전월 미달</Badge>
                    )}
                  </div>
                  <div className="mt-3">
                    {threshold === 0 ? (
                      <p className="text-[11px] text-slate-500">당월 인정 실적 {formatWon(cur)} · 실적 조건 없음</p>
                    ) : (
                      <>
                        <div className="mb-1 flex items-center justify-between text-[11px]">
                          <span className="text-slate-500">
                            당월 {formatWon(cur)} <span className="text-slate-300">/</span> {formatWon(threshold, { compact: true })}
                          </span>
                          <span className={ratio >= 1 ? 'font-semibold text-emerald-600' : 'font-semibold text-slate-500'}>
                            {ratio >= 1 ? '다음 달 충족' : `${formatWon(Math.max(0, threshold - cur))} 부족`}
                          </span>
                        </div>
                        <Progress ratio={ratio} tone={ratio >= 1 ? 'emerald' : ratio >= 0.6 ? 'indigo' : 'amber'} />
                      </>
                    )}
                  </div>
                </Panel>
              );
            })}
          </div>
        </section>

        {shortfallCards.length > 0 && (
          <section>
            <SectionTitle title="실적 부족 카드" subtitle="이번 달 채우면 다음 달 혜택이 열립니다" />
            <div className="rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200/70">
              <ul className="space-y-2">
                {shortfallCards.map(({ card, gap, prev }) => (
                  <li key={card.id} className="flex items-center justify-between gap-2 text-[12.5px]">
                    <span className="flex items-center gap-1.5 font-medium text-amber-900">
                      {card.shortName}
                      {prev < card.performance.prevThreshold && <Badge tone="danger">전월 미달</Badge>}
                    </span>
                    <span className="font-bold text-amber-800">{formatWon(gap)} 부족</span>
                  </li>
                ))}
              </ul>
              <button onClick={() => onNavigate('recommend')} className="mt-3 w-full rounded-xl bg-amber-900/90 py-2 text-[12.5px] font-semibold text-white transition active:scale-[0.99]">
                이 결제로 실적 채우기 →
              </button>
            </div>
          </section>
        )}

        <section>
          <SectionTitle title="소멸 예정 혜택" subtitle="45일 이내 만료" action={<button onClick={() => onNavigate('wallet')} className="text-[11.5px] font-semibold text-indigo-600">지갑 열기</button>} />
          {expiring.length === 0 ? (
            <InfoNote>45일 안에 만료되는 혜택이 없습니다.</InfoNote>
          ) : (
            <div className="space-y-2">
              {expiring.map(({ w, d }) => {
                const card = cards.find((c) => c.id === w.cardId);
                return (
                  <button key={w.id} onClick={() => onNavigate('wallet')} className="flex w-full items-center gap-3 rounded-2xl bg-white p-3.5 text-left shadow-soft ring-1 ring-slate-900/5 transition active:scale-[0.99]">
                    <div className={`flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-xl ${d <= 20 ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-600'}`}>
                      <span className="text-[9px] font-semibold leading-none">D-{d}</span>
                      <span className="mt-0.5 text-[9px] leading-none opacity-70">{w.expiresAt?.slice(5).replace('-', '/')}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-ink">{w.title}</p>
                      <p className="mt-0.5 truncate text-[10.5px] text-slate-400">
                        {WALLET_KIND_LABEL[w.kind] ?? '혜택'} · {card?.shortName ?? '카드 미지정'} · {w.remaining}/{w.total}{w.unit}
                      </p>
                    </div>
                    <span className="text-slate-300">›</span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section>
          <SectionTitle title="최근 결제" subtitle="실적 반영 내역" action={<button onClick={() => onNavigate('cards')} className="text-[11.5px] font-semibold text-indigo-600">관리</button>} />
          <Panel className="divide-y divide-slate-100 !p-0">
            {recent.length === 0 && <p className="p-4 text-[12px] text-slate-400">결제내역이 없습니다.</p>}
            {recent.map((tx) => {
              const card = cards.find((c) => c.id === tx.cardId);
              return (
                <div key={tx.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="text-[15px]">{CATEGORY_EMOJI[tx.category] ?? '💳'}</span>
                    <div className="min-w-0">
                      <p className="truncate text-[12.5px] font-medium text-ink">
                        {tx.merchant}
                        {tx.status === 'canceled' && <Badge tone="danger" className="ml-1.5">취소</Badge>}
                      </p>
                      <p className="text-[10.5px] text-slate-400">
                        {formatDate(tx.date)} · {card?.shortName ?? '카드 미지정'}
                      </p>
                    </div>
                  </div>
                  <span className={`shrink-0 text-[12.5px] font-semibold ${tx.status === 'canceled' ? 'text-slate-300 line-through' : 'text-ink'}`}>{formatWon(tx.amount)}</span>
                </div>
              );
            })}
          </Panel>
        </section>

        <div className="rounded-2xl bg-white/70 p-3.5 ring-1 ring-slate-900/5">
          <div className="flex items-center gap-2">
            <VerifyBadge verification="official" />
            <VerifyBadge verification="example" />
          </div>
          <p className="mt-2 text-[10.5px] leading-relaxed text-slate-500">
            공식 확인 배지는 2026-11-24 대화·카드사 화면에서 확인한 값, 예시 데이터는 확인 전 가정값입니다. 모든 수치는 내 카드 탭에서 직접 수정할 수 있고,
            데이터는 이 브라우저(localStorage)에만 저장됩니다.
          </p>
        </div>
      </div>
    </div>
  );
}
