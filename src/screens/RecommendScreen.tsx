import { useMemo, useState } from 'react';
import { useCardStore } from '../state/store';
import { recommendPayment, type CardRecommendation } from '../engine/recommend';
import { CATEGORIES } from '../data/categories';
import { formatWon, parseAmountInput } from '../lib/format';
import { Badge, InfoNote, Panel, Progress, Sheet, VerifyBadge } from '../components/ui';
import type { CategoryId } from '../types';

const PRESETS: { label: string; amount: number; category: CategoryId; merchant: string }[] = [
  { label: '신세계백화점 30만', amount: 300_000, category: 'department', merchant: '신세계백화점' },
  { label: '대한항공 공홈 150만', amount: 1_500_000, category: 'airline', merchant: '대한항공' },
  { label: '해외결제 80만', amount: 800_000, category: 'overseas', merchant: '해외 결제' },
  { label: '롯데면세점 50만', amount: 500_000, category: 'dutyfree', merchant: '롯데면세점' },
];

export function RecommendScreen() {
  const { state } = useCardStore();
  const [amount, setAmount] = useState(300_000);
  const [category, setCategory] = useState<CategoryId>('department');
  const [merchant, setMerchant] = useState('신세계백화점');
  const [showAll, setShowAll] = useState(false);
  const [detail, setDetail] = useState<CardRecommendation | null>(null);
  const today = useMemo(() => new Date(), []);

  const results = useMemo(() => {
    if (amount <= 0) return [];
    return recommendPayment(state, { amount, category, merchant }, today);
  }, [amount, category, merchant, state, today]);

  const top = results.slice(0, 3);
  const rest = results.slice(3);

  const applyPreset = (preset: (typeof PRESETS)[number]) => {
    setAmount(preset.amount);
    setCategory(preset.category);
    setMerchant(preset.merchant);
  };

  return (
    <div className="pb-6">
      <div className="px-5 pb-4 pt-5" style={{ background: 'linear-gradient(150deg,#0a1a2f 0%,#123a52 60%,#0f766e 140%)' }}>
        <h1 className="text-[19px] font-bold tracking-tight text-white">결제 카드 추천</h1>
        <p className="mt-1 text-[11.5px] leading-relaxed text-white/60">결제 장소와 금액만 입력하면 보유 카드 전체를 계산해 순위를 보여드립니다.</p>

        <div className="mt-4 rounded-2xl bg-white/10 p-4 ring-1 ring-white/15 backdrop-blur">
          <label className="block text-[11px] font-medium text-white/60" htmlFor="amount">결제 예정 금액</label>
          <div className="mt-1 flex items-baseline gap-1.5">
            <input
              id="amount"
              inputMode="numeric"
              value={amount ? amount.toLocaleString('ko-KR') : ''}
              onChange={(e) => setAmount(parseAmountInput(e.target.value))}
              placeholder="0"
              className="w-full min-w-0 bg-transparent text-[28px] font-bold tracking-tight text-white outline-none placeholder:text-white/30"
            />
            <span className="text-[15px] font-semibold text-white/70">원</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {[10_000, 100_000, 300_000, 500_000].map((v) => (
              <button key={v} onClick={() => setAmount((prev) => prev + v)} className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white/80 transition active:scale-95">
                +{v / 10_000}만
              </button>
            ))}
            <button onClick={() => setAmount(0)} className="rounded-full bg-white/5 px-2.5 py-1 text-[11px] font-medium text-white/50 transition active:scale-95">
              지우기
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-4 px-4 pt-4">
        <div>
          <p className="mb-2 text-[12px] font-semibold text-slate-700">빠른 프리셋</p>
          <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {PRESETS.map((p) => {
              const active = amount === p.amount && category === p.category;
              return (
                <button
                  key={p.label}
                  onClick={() => applyPreset(p)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-[11.5px] font-semibold transition active:scale-95 ${
                    active ? 'bg-ink text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="mb-2 text-[12px] font-semibold text-slate-700">업종</p>
          <div className="flex gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                onClick={() => setCategory(c.id)}
                className={`flex shrink-0 items-center gap-1 rounded-xl px-2.5 py-2 text-[11.5px] font-medium transition active:scale-95 ${
                  category === c.id ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white text-slate-600 ring-1 ring-slate-200'
                }`}
              >
                <span>{c.emoji}</span>
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <input
            value={merchant}
            onChange={(e) => setMerchant(e.target.value)}
            placeholder="가맹점명 (선택, 예: 신세계백화점)"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[13px] outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          />
        </div>

        {amount > 0 && results.length > 0 ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-bold text-ink">추천 순위</h2>
              <span className="text-[10.5px] text-slate-400">{results.length}장 비교 · {formatWon(amount)} 결제</span>
            </div>
            <InfoNote tone="indigo">즉시 혜택과 향후 실적 기여 가치는 성격이 달라 합산하지 않았습니다. 순위는 즉시 혜택(원화 환산) 기준입니다.</InfoNote>

            {top.map((r) => (
              <RecommendationCard key={r.cardId} rec={r} onDetail={() => setDetail(r)} featured={r.rank === 1} />
            ))}

            {rest.length > 0 && (
              <div>
                <button onClick={() => setShowAll((v) => !v)} className="w-full rounded-xl bg-white py-2.5 text-[12px] font-semibold text-slate-600 ring-1 ring-slate-200">
                  {showAll ? '나머지 접기' : `나머지 ${rest.length}장 비교하기`}
                </button>
                {showAll && (
                  <div className="mt-2 space-y-1.5">
                    {rest.map((r) => (
                      <button key={r.cardId} onClick={() => setDetail(r)} className="flex w-full items-center justify-between gap-2 rounded-xl bg-white px-3.5 py-2.5 text-left ring-1 ring-slate-100">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="text-[10px] font-bold text-slate-300">{r.rank}</span>
                          <span className="truncate text-[12px] font-medium text-slate-700">{r.cardShort}</span>
                          {!r.performance.met && <Badge tone="danger">전월 미달</Badge>}
                        </span>
                        <span className="shrink-0 text-[12px] font-semibold text-slate-500">{formatWon(r.immediateKrw)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <InfoNote>금액을 입력하면 즉시 계산합니다. 프리셋을 눌러 바로 확인할 수도 있습니다.</InfoNote>
        )}
      </div>

      <Sheet open={detail !== null} onClose={() => setDetail(null)} title={detail?.cardName ?? ''} subtitle="계산 상세">
        {detail && <DetailBody rec={detail} />}
      </Sheet>
    </div>
  );
}

function RecommendationCard({ rec, onDetail, featured }: { rec: CardRecommendation; onDetail: () => void; featured?: boolean }) {
  const [openCaution, setOpenCaution] = useState(false);
  return (
    <div className={`rounded-2xl bg-white p-4 shadow-soft ${featured ? 'ring-2 ring-indigo-500/70' : 'ring-1 ring-slate-900/5'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${featured ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}>{rec.rank}</span>
          <div className="min-w-0">
            <p className="truncate text-[13.5px] font-bold text-ink">{rec.cardShort}</p>
            <p className="truncate text-[10.5px] text-slate-400">{rec.issuer} · {rec.network}</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {featured && <Badge tone="primary">최적 카드</Badge>}
          <VerifyBadge verification={rec.verification} />
        </div>
      </div>

      <div className="mt-3 flex items-end justify-between gap-2 rounded-xl bg-slate-50 px-3.5 py-3">
        <div>
          <p className="text-[10.5px] font-medium text-slate-500">즉시 혜택 (원화 환산)</p>
          <p className="mt-0.5 text-[22px] font-bold leading-tight tracking-tight text-ink">
            {rec.immediateKrw > 0 ? formatWon(rec.immediateKrw) : '혜택 없음'}
          </p>
        </div>
        {rec.immediateKrw > 0 && <span className="rounded-full bg-white px-2 py-1 text-[10.5px] font-semibold text-indigo-600 ring-1 ring-indigo-100">≈ {rec.bestRatePercent.toFixed(2)}%</span>}
      </div>

      <p className="mt-2 text-[11.5px] leading-snug text-slate-600">{rec.bestLabel}</p>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-slate-50 px-3 py-2">
          <p className="text-[10px] text-slate-400">전월 실적</p>
          <p className="mt-0.5 text-[11.5px] font-semibold text-slate-700">
            {rec.performance.threshold === 0 ? '조건 없음' : rec.performance.met ? `충족 (${formatWon(rec.performance.prevSpend, { compact: true })})` : `미달 (${formatWon(rec.performance.prevSpend, { compact: true })})`}
          </p>
        </div>
        <div className="rounded-xl bg-slate-50 px-3 py-2">
          <p className="text-[10px] text-slate-400">이 결제 후 당월</p>
          <p className="mt-0.5 text-[11.5px] font-semibold text-slate-700">{formatWon(rec.performance.afterCurrentSpend, { compact: true })}</p>
        </div>
      </div>

      <div className="mt-2 rounded-xl border border-dashed border-indigo-200 bg-indigo-50/40 px-3 py-2">
        <p className="text-[10px] font-semibold text-indigo-500">향후 실적 기여 (확정 아님 · 즉시 혜택과 합산하지 않음)</p>
        <p className="mt-0.5 text-[11.5px] font-medium leading-snug text-slate-700">{rec.futureLabel}</p>
      </div>

      {rec.promo && (
        <div className="mt-2 rounded-xl bg-emerald-50/70 px-3 py-2 ring-1 ring-emerald-100">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10.5px] font-semibold text-emerald-700">이벤트 · {rec.promo.enrolled ? '응모 완료' : '미응모'}</p>
            <p className="text-[10.5px] text-emerald-700">{formatWon(rec.promo.progressAfter, { compact: true })} / {formatWon(rec.promo.minSpend, { compact: true })}</p>
          </div>
          <Progress ratio={rec.promo.minSpend ? rec.promo.progressAfter / rec.promo.minSpend : 0} tone="emerald" />
          <p className="mt-1 text-[10.5px] text-emerald-800">
            {rec.promo.achievable ? `조건 충족 시 ${formatWon(rec.promo.rewardKrw)} 지급` : `${formatWon(Math.max(0, rec.promo.minSpend - rec.promo.progressAfter))} 더 결제하면 조건 충족`}
          </p>
        </div>
      )}

      <ul className="mt-3 space-y-1">
        {rec.reasons.slice(0, 3).map((r) => (
          <li key={r} className="flex gap-1.5 text-[11px] leading-snug text-slate-600">
            <span className="mt-0.5 text-emerald-500">✓</span>
            <span>{r}</span>
          </li>
        ))}
      </ul>

      {rec.cautions.length > 0 && (
        <div className="mt-2">
          <p className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-[10.5px] leading-snug text-amber-800">! {rec.cautions[0]}</p>
          {rec.cautions.length > 1 && (
            <button onClick={() => setOpenCaution((v) => !v)} className="mt-1.5 text-[10.5px] font-semibold text-amber-600">
              주의사항 {rec.cautions.length - 1}건 더보기 {openCaution ? '접기' : ''}
            </button>
          )}
          {openCaution && rec.cautions.length > 1 && (
            <ul className="mt-1 space-y-1 rounded-xl bg-amber-50/70 px-3 py-2">
              {rec.cautions.slice(1).map((c) => (
                <li key={c} className="flex gap-1.5 text-[10.5px] leading-snug text-amber-800">
                  <span className="mt-0.5">!</span>
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <button onClick={onDetail} className="mt-3 w-full rounded-xl bg-slate-100 py-2 text-[11.5px] font-semibold text-slate-600 transition active:scale-[0.99]">
        혜택 상세 보기
      </button>
    </div>
  );
}

function DetailBody({ rec }: { rec: CardRecommendation }) {
  return (
    <div className="space-y-4">
      <Panel>
        <p className="text-[11px] text-slate-500">즉시 혜택 합계</p>
        <p className="mt-0.5 text-[24px] font-bold text-ink">{formatWon(rec.immediateKrw)}</p>
        <div className="mt-3 space-y-2">
          {rec.benefitLines.length === 0 && <p className="text-[12px] text-slate-400">적용 가능한 혜택이 없습니다.</p>}
          {rec.benefitLines.map((line) => (
            <div key={line.label} className="flex items-start justify-between gap-2 border-t border-slate-100 pt-2 first:border-0 first:pt-0">
              <div className="min-w-0">
                <p className="text-[12px] font-medium text-slate-700">{line.label}</p>
                <p className="text-[10.5px] text-slate-400">
                  {line.pointsLabel ? `${line.pointsLabel} · ` : ''}≈{line.ratePercent.toFixed(2)}%{line.capped ? ' · 월 한도 적용' : ''}
                </p>
              </div>
              <span className="shrink-0 text-[12px] font-semibold text-ink">{formatWon(line.krw)}</span>
            </div>
          ))}
        </div>
      </Panel>

      <Panel>
        <p className="text-[12px] font-bold text-ink">실적 영향</p>
        <dl className="mt-2 space-y-1.5 text-[11.5px]">
          <div className="flex justify-between gap-2"><dt className="text-slate-500">전월 인정 실적</dt><dd className="font-semibold text-slate-700">{formatWon(rec.performance.prevSpend)}{rec.performance.threshold > 0 && ` / ${formatWon(rec.performance.threshold)}`}</dd></div>
          <div className="flex justify-between gap-2"><dt className="text-slate-500">이 결제 전 당월 실적</dt><dd className="font-semibold text-slate-700">{formatWon(rec.performance.currentSpend)}</dd></div>
          <div className="flex justify-between gap-2"><dt className="text-slate-500">이 결제 후 당월 실적</dt><dd className="font-semibold text-slate-700">{formatWon(rec.performance.afterCurrentSpend)}</dd></div>
          <div className="flex justify-between gap-2"><dt className="text-slate-500">실적 인정 여부</dt><dd className="font-semibold text-slate-700">{rec.performance.paymentEligible ? '인정' : '인정 안 됨'}</dd></div>
        </dl>
        <p className="mt-2 rounded-lg bg-indigo-50 px-2.5 py-2 text-[10.5px] leading-snug text-indigo-700">{rec.futureLabel}</p>
      </Panel>

      {rec.cautions.length > 0 && (
        <div className="rounded-2xl bg-amber-50 p-3.5 ring-1 ring-amber-100">
          <p className="text-[11.5px] font-bold text-amber-800">주의사항</p>
          <ul className="mt-1.5 space-y-1">
            {rec.cautions.map((c) => (
              <li key={c} className="text-[10.5px] leading-snug text-amber-800">· {c}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
