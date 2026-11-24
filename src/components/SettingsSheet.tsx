import { useState } from 'react';
import { useCardStore } from '../state/store';
import { POINT_CURRENCIES } from '../data/categories';
import { CSV_TEMPLATE, exportTransactionsCsv } from '../services/csv';
import { Field, InfoNote, Panel, Sheet, btnGhost, btnPrimary, inputClass } from './ui';
import { formatWon } from '../lib/format';

function download(filename: string, content: string, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function SettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, setPointValue, exportJson, importJson, importCsv, resetState, lastSavedAt } = useCardStore();
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const readFile = (file: File, handler: (text: string) => void) => {
    const reader = new FileReader();
    reader.onload = () => handler(String(reader.result ?? ''));
    reader.onerror = () => setMessage({ tone: 'error', text: '파일을 읽지 못했습니다.' });
    reader.readAsText(file);
  };

  return (
    <Sheet open={open} onClose={onClose} title="설정 · 데이터 관리" subtitle="MVP는 이 브라우저에만 저장합니다">
      <Panel className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[12.5px] font-bold text-ink">포인트·마일 환산 가치</p>
            <p className="text-[10.5px] text-slate-400">1단위당 원화 가치입니다. 추천 금액이 즉시 다시 계산됩니다.</p>
          </div>
          <span className="text-[10px] text-emerald-600">{lastSavedAt ? `저장됨 ${lastSavedAt}` : '자동 저장'}</span>
        </div>
        <div className="space-y-2">
          {POINT_CURRENCIES.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-[11.5px] font-medium text-slate-700">{c.name}</p>
                <p className="truncate text-[10px] text-slate-400">{c.note}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <input
                  className="w-16 rounded-lg border border-slate-200 bg-white px-2 py-1 text-right text-[11.5px] outline-none focus:border-indigo-400"
                  inputMode="decimal"
                  value={state.settings.pointValues[c.id] ?? c.defaultWonPerUnit}
                  onChange={(e) => setPointValue(c.id, Number(e.target.value) || 0)}
                />
                <span className="text-[10.5px] text-slate-400">{c.unit === '원' ? '원' : `원/${c.unit}`}</span>
              </div>
            </div>
          ))}
        </div>
        <InfoNote>기본값은 숙박·마일 사용 가치를 단순화한 추정치입니다. 본인의 실제 사용 가치로 바꿔 주세요.</InfoNote>
      </Panel>

      <Panel className="space-y-2.5">
        <p className="text-[12.5px] font-bold text-ink">백업 · 복원 (JSON)</p>
        <div className="flex gap-2">
          <button
            onClick={() => download(`card-optimizer-backup-${new Date().toISOString().slice(0, 10)}.json`, exportJson(), 'application/json;charset=utf-8')}
            className={`${btnGhost} flex-1`}
          >
            JSON 내보내기
          </button>
          <label className={`${btnGhost} flex-1 cursor-pointer`}>
            JSON 불러오기
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                readFile(file, (text) => {
                  const result = importJson(text);
                  setMessage({ tone: result.ok ? 'ok' : 'error', text: result.message });
                });
                e.target.value = '';
              }}
            />
          </label>
        </div>
        <div className="flex gap-2">
          <button onClick={() => download('card-optimizer-transactions.csv', `\uFEFF${exportTransactionsCsv(state.cards, state.transactions)}`, 'text/csv;charset=utf-8')} className={`${btnGhost} flex-1`}>
            결제내역 CSV
          </button>
          <button onClick={() => download('card-optimizer-import-template.csv', `\uFEFF${CSV_TEMPLATE}`, 'text/csv;charset=utf-8')} className={`${btnGhost} flex-1`}>
            CSV 양식 받기
          </button>
        </div>
        <label className="block">
          <span className={`${btnPrimary} w-full cursor-pointer`}>CSV 가져오기 (결제내역)</span>
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              readFile(file, (text) => {
                const result = importCsv(text);
                setMessage({ tone: result.ok ? 'ok' : 'error', text: result.message });
              });
              e.target.value = '';
            }}
          />
        </label>
        <p className="text-[10px] leading-relaxed text-slate-400">
          CSV 열: 날짜, 카드, 가맹점, 업종, 금액, 상태(정상/취소), 메모. 카드는 카드명·별칭·끝 4자리로 매칭합니다.
        </p>
        {message && (
          <p className={`rounded-xl px-3 py-2 text-[11px] ${message.tone === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'}`}>{message.text}</p>
        )}
      </Panel>

      <Panel className="space-y-2">
        <p className="text-[12.5px] font-bold text-ink">저장 위치</p>
        <p className="text-[11px] leading-relaxed text-slate-500">
          카드 {state.cards.length}장 · 결제내역 {state.transactions.length}건 · 지갑 {state.wallet.length}건이 브라우저 localStorage에 저장되어 있습니다.
          카드 전체 번호·CVC·비밀번호는 수집하지 않으며, 별칭과 끝 4자리(선택)만 저장합니다.
        </p>
        <InfoNote>
          Supabase 연동은 아직 구현되지 않았습니다. 스키마(supabase/schema.sql)만 준비되어 있고, 다중 기기 동기화는 다음 단계입니다.
        </InfoNote>
        <p className="text-[10.5px] text-slate-400">연회비 합계 {formatWon(state.cards.reduce((s, c) => s + c.annualFee, 0))}</p>
      </Panel>

      <div className="rounded-2xl border border-rose-100 bg-rose-50/60 p-3.5">
        <p className="text-[12px] font-bold text-rose-700">초기화</p>
        <p className="mt-0.5 text-[10.5px] leading-relaxed text-rose-600/80">모든 카드·결제내역·지갑 항목을 지우고 샘플 데이터로 되돌립니다.</p>
        {confirmReset ? (
          <div className="mt-2 flex gap-2">
            <button onClick={() => setConfirmReset(false)} className="flex-1 rounded-xl bg-white py-2 text-[11.5px] font-medium text-slate-600">취소</button>
            <button
              onClick={() => {
                resetState();
                setConfirmReset(false);
                setMessage({ tone: 'ok', text: '샘플 데이터로 초기화했습니다.' });
              }}
              className="flex-1 rounded-xl bg-rose-500 py-2 text-[11.5px] font-semibold text-white"
            >
              초기화 실행
            </button>
          </div>
        ) : (
          <button onClick={() => setConfirmReset(true)} className="mt-2 w-full rounded-xl bg-white py-2 text-[11.5px] font-medium text-rose-600 ring-1 ring-rose-100">
            초기화…
          </button>
        )}
      </div>

      <Panel className="space-y-1.5">
        <p className="text-[12.5px] font-bold text-ink">앱 정보</p>
        <p className="text-[10.5px] leading-relaxed text-slate-500">
          카드옵티마 MVP · React + TypeScript + Vite · PWA · 로컬 저장 v1
        </p>
        <p className="text-[10.5px] leading-relaxed text-slate-500">
          계산 결과는 입력값과 예시 데이터를 바탕으로 한 추정입니다. 실제 혜택은 카드사 공식 약관이 우선합니다.
        </p>
        <Field label="샘플 카드 5종">
          <span className="text-[10.5px] text-slate-400">메리어트 본보이 신한 · 롯데 힐튼 아멕스 · 디지로카 스카이패스 · 현대 대한항공 300 · 삼성 아멕스 플래티늄(구형)</span>
        </Field>
      </Panel>
    </Sheet>
  );
}
