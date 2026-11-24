import { useEffect, useRef, useState } from 'react';
import { CardStoreProvider } from './state/store';
import { BottomNav, type TabId } from './components/BottomNav';
import { HomeScreen } from './screens/HomeScreen';
import { RecommendScreen } from './screens/RecommendScreen';
import { CardsScreen } from './screens/CardsScreen';
import { WalletScreen } from './screens/WalletScreen';
import { AssistantScreen } from './screens/AssistantScreen';
import { SettingsSheet } from './components/SettingsSheet';

function BrandPanel() {
  return (
    <aside className="hidden w-[360px] shrink-0 lg:block">
      <div className="flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-ink text-[16px] text-white">💳</div>
        <div>
          <p className="text-[15px] font-bold tracking-tight text-ink">카드옵티마</p>
          <p className="text-[11px] text-slate-500">신용카드 최적 결제 추천</p>
        </div>
      </div>
      <h1 className="mt-8 text-[34px] font-bold leading-[1.25] tracking-tight text-ink">
        결제 전 3초,
        <br />
        가장 유리한 카드.
      </h1>
      <p className="mt-4 text-[13px] leading-relaxed text-slate-500">
        전월 실적, 월 할인 한도, 포인트·마일 환산 가치, 이벤트 조건을 한 번에 계산합니다.
        즉시 혜택과 향후 실적 기여는 분리해서 보여드립니다.
      </p>
      <ul className="mt-7 space-y-3">
        {[
          ['실적 계산 엔진', '전월·당월 인정 실적, 제외 업종, 수동 보정 반영'],
          ['보유 카드 전체 동시 비교', '업종별 할인·적립 + 잔여 한도 + 이벤트 진행률'],
          ['혜택 지갑', '숙박권·라운지·바우처 잔여 횟수와 D-day'],
          ['로컬 저장', '카드번호·CVC는 수집하지 않음 · JSON/CSV 백업'],
        ].map(([title, desc]) => (
          <li key={title} className="flex gap-3">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500" />
            <div>
              <p className="text-[12.5px] font-semibold text-ink">{title}</p>
              <p className="text-[11.5px] leading-relaxed text-slate-500">{desc}</p>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-8 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-[10.5px] font-medium text-slate-500 ring-1 ring-slate-200">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        1단계 MVP · 브라우저에만 저장
      </div>
    </aside>
  );
}

function AppShell() {
  const [tab, setTab] = useState<TabId>('home');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [tab]);

  const screen = (() => {
    switch (tab) {
      case 'home':
        return <HomeScreen onNavigate={setTab} onOpenSettings={() => setSettingsOpen(true)} />;
      case 'recommend':
        return <RecommendScreen />;
      case 'cards':
        return <CardsScreen onOpenSettings={() => setSettingsOpen(true)} />;
      case 'wallet':
        return <WalletScreen />;
      case 'assistant':
        return <AssistantScreen />;
      default:
        return null;
    }
  })();

  return (
    <div className="min-h-[100dvh] w-full bg-[#e9edf6]">
      <div
        className="pointer-events-none fixed inset-0 opacity-70"
        style={{ background: 'radial-gradient(1000px 600px at 15% 10%, #dfe6fa 0%, transparent 60%), radial-gradient(900px 500px at 90% 80%, #e3f2ee 0%, transparent 55%)' }}
      />
      <div className="relative mx-auto flex min-h-[100dvh] w-full max-w-[1140px] items-center lg:gap-20 lg:px-6 lg:py-8">
        <BrandPanel />
        <main className="mx-auto h-[100dvh] w-full max-w-[430px] lg:h-[880px] lg:shrink-0">
          <div className="relative flex h-full flex-col overflow-hidden bg-[#f6f7fb] lg:rounded-[2.75rem] lg:border-[7px] lg:border-slate-900 lg:shadow-[0_40px_90px_-40px_rgba(15,23,41,0.55)]">
            <div ref={scrollRef} className={`min-h-0 flex-1 ${tab === 'assistant' ? 'overflow-hidden' : 'overflow-y-auto overscroll-contain'}`}>{screen}</div>
            <BottomNav active={tab} onChange={setTab} />
          </div>
        </main>
      </div>
      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

export default function App() {
  return (
    <CardStoreProvider>
      <AppShell />
    </CardStoreProvider>
  );
}
