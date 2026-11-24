import type { Card } from '../types';

const gradients: Record<Card['theme'], string> = {
  navy: 'linear-gradient(135deg,#0a1428 0%,#1a3766 52%,#2f6fd0 100%)',
  violet: 'linear-gradient(135deg,#251047 0%,#5b21b6 52%,#a855f7 100%)',
  emerald: 'linear-gradient(135deg,#04231c 0%,#0d6b60 52%,#14b8a6 100%)',
  graphite: 'linear-gradient(135deg,#16181d 0%,#33373f 55%,#6b7280 100%)',
  coral: 'linear-gradient(135deg,#4c1010 0%,#b91c1c 52%,#f97316 100%)',
};

export function CardFace({
  card,
  size = 'md',
  onClick,
}: {
  card: Pick<Card, 'name' | 'shortName' | 'issuer' | 'network' | 'theme' | 'last4'>;
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
}) {
  const pad = size === 'sm' ? 'p-3' : size === 'lg' ? 'p-5' : 'p-4';
  const titleSize = size === 'sm' ? 'text-[13px]' : size === 'lg' ? 'text-[17px]' : 'text-[14px]';
  return (
    <div
      onClick={onClick}
      className={`relative overflow-hidden rounded-2xl ${pad} text-white shadow-card ring-1 ring-white/10 ${onClick ? 'cursor-pointer active:scale-[0.99] transition' : ''}`}
      style={{ background: gradients[card.theme] ?? gradients.navy }}
    >
      <div className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full bg-white/10 blur-xl" />
      <div className="pointer-events-none absolute -bottom-12 -left-6 h-28 w-28 rounded-full bg-white/5 blur-lg" />
      <div className="relative flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-white/60">{card.issuer}</p>
          <p className={`mt-1 truncate font-bold tracking-tight ${titleSize}`}>{card.shortName || card.name}</p>
        </div>
        <span className="mt-0.5 shrink-0 rounded-md bg-white/15 px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-white/90">{card.network}</span>
      </div>
      <div className="relative mt-4 flex items-end justify-between">
        <p className="font-mono text-[11.5px] tracking-[0.18em] text-white/75">{card.last4 ? `•••• ${card.last4}` : '•••• ••••'}</p>
        <div className="flex items-center gap-1">
          <span className="h-3.5 w-3.5 rounded-full bg-white/60" />
          <span className="-ml-2 h-3.5 w-3.5 rounded-full bg-white/30" />
        </div>
      </div>
    </div>
  );
}
