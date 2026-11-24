export type TabId = 'home' | 'recommend' | 'cards' | 'wallet' | 'assistant';

const tabs: { id: TabId; label: string; icon: (active: boolean) => JSX.Element }[] = [
  {
    id: 'home',
    label: '홈',
    icon: (active) => (
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.4 : 1.9} strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 10.5 12 3l9 7.5" />
        <path d="M5.5 9.5V21h13V9.5" />
        <path d="M9.5 21v-6h5v6" />
      </svg>
    ),
  },
  {
    id: 'recommend',
    label: '결제 추천',
    icon: (active) => (
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.4 : 1.9} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v3M12 18v3M4.2 7.2l2.1 2.1M17.7 14.7l2.1 2.1M3 12h3M18 12h3M4.2 16.8l2.1-2.1M17.7 9.3l2.1-2.1" />
        <circle cx="12" cy="12" r="3.2" />
      </svg>
    ),
  },
  {
    id: 'cards',
    label: '내 카드',
    icon: (active) => (
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.4 : 1.9} strokeLinecap="round" strokeLinejoin="round">
        <rect x="2.5" y="5.5" width="19" height="13" rx="2.6" />
        <path d="M2.5 10h19" />
        <path d="M6 14.5h3.5" />
      </svg>
    ),
  },
  {
    id: 'wallet',
    label: '혜택 지갑',
    icon: (active) => (
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.4 : 1.9} strokeLinecap="round" strokeLinejoin="round">
        <path d="M3.5 7.5A2.5 2.5 0 0 1 6 5h11.5a1 1 0 0 1 1 1v2" />
        <rect x="3.5" y="7.5" width="17" height="11.5" rx="2.4" />
        <path d="M16 12.5h2.5" />
      </svg>
    ),
  },
  {
    id: 'assistant',
    label: 'AI 비서',
    icon: (active) => (
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.4 : 1.9} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3.2l1.6 4.2 4.2 1.6-4.2 1.6L12 14.8l-1.6-4.2L6.2 9l4.2-1.6z" />
        <path d="M18 15.2l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
      </svg>
    ),
  },
];

export function BottomNav({ active, onChange }: { active: TabId; onChange: (tab: TabId) => void }) {
  return (
    <nav className="relative z-20 border-t border-slate-200/80 bg-white/95 px-1 pb-[max(6px,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur">
      <ul className="flex items-stretch justify-between">
        {tabs.map((tab) => {
          const isActive = tab.id === active;
          return (
            <li key={tab.id} className="flex-1">
              <button
                onClick={() => onChange(tab.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`flex w-full flex-col items-center gap-1 rounded-xl px-1 py-1.5 transition ${
                  isActive ? 'text-indigo-600' : 'text-slate-400 active:text-slate-600'
                }`}
              >
                <span className={`${isActive ? 'scale-105' : ''} transition`}>{tab.icon(isActive)}</span>
                <span className={`text-[10px] ${isActive ? 'font-bold' : 'font-medium'}`}>{tab.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
