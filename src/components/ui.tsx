import type { ReactNode } from 'react';

export const inputClass =
  'w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[15px] text-ink outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100';

export const selectClass = `${inputClass} appearance-none`;

export const btnPrimary =
  'inline-flex items-center justify-center gap-1.5 rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40';

export const btnGhost =
  'inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-[13px] font-medium text-slate-700 transition active:scale-[0.98]';

export const btnSubtle =
  'inline-flex items-center justify-center rounded-lg bg-slate-100 px-2.5 py-1.5 text-[12px] font-medium text-slate-600 transition active:scale-95';

type Tone = 'official' | 'example' | 'danger' | 'primary' | 'muted' | 'success' | 'warning';

const toneClass: Record<Tone, string> = {
  official: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  example: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  danger: 'bg-rose-50 text-rose-600 ring-1 ring-rose-200',
  primary: 'bg-indigo-50 text-indigo-600 ring-1 ring-indigo-200',
  muted: 'bg-slate-100 text-slate-500 ring-1 ring-slate-200',
  success: 'bg-emerald-500/10 text-emerald-600 ring-1 ring-emerald-200',
  warning: 'bg-amber-500/10 text-amber-700 ring-1 ring-amber-200',
};

export function Badge({ children, tone = 'muted', className = '' }: { children: ReactNode; tone?: Tone; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold leading-4 ${toneClass[tone]} ${className}`}>
      {children}
    </span>
  );
}

export function VerifyBadge({ verification }: { verification: 'official' | 'example' }) {
  return verification === 'official' ? <Badge tone="official">공식 확인</Badge> : <Badge tone="example">예시 데이터</Badge>;
}

export function Progress({ ratio, tone = 'indigo' }: { ratio: number; tone?: 'indigo' | 'emerald' | 'amber' | 'rose' }) {
  const clamped = Math.max(0, Math.min(1, ratio));
  const colors = {
    indigo: 'bg-indigo-500',
    emerald: 'bg-emerald-500',
    amber: 'bg-amber-500',
    rose: 'bg-rose-500',
  } as const;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200/80">
      <div className={`h-full rounded-full ${colors[tone]} transition-all duration-500`} style={{ width: `${clamped * 100}%` }} />
    </div>
  );
}

export function SectionTitle({ title, action, subtitle }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-2.5 flex items-end justify-between gap-2">
      <div>
        <h2 className="text-[15px] font-bold tracking-tight text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[11.5px] text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl bg-white p-4 shadow-soft ring-1 ring-slate-900/5 ${className}`}>{children}</div>;
}

export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/45 backdrop-blur-[2px] sm:items-center" onClick={onClose} role="presentation">
      <div
        className="max-h-[90dvh] w-full max-w-[440px] animate-rise overflow-y-auto rounded-t-[28px] bg-[#f8f9fc] px-5 pb-6 pt-3 shadow-2xl sm:rounded-[28px]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-300 sm:hidden" />
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-[17px] font-bold tracking-tight text-ink">{title}</h3>
            {subtitle && <p className="mt-0.5 text-[12px] text-slate-500">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="rounded-full bg-white p-1.5 text-slate-400 ring-1 ring-slate-200 transition active:scale-95" aria-label="닫기">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="space-y-4">{children}</div>
        {footer && <div className="mt-5">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-[12.5px] font-semibold text-slate-700">{label}</span>
        {hint && <span className="text-[10.5px] text-slate-400">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 px-5 py-8 text-center">
      <p className="text-sm font-semibold text-slate-600">{title}</p>
      {description && <p className="mt-1 text-[12px] leading-relaxed text-slate-400">{description}</p>}
      {action && <div className="mt-3 flex justify-center">{action}</div>}
    </div>
  );
}

export function InfoNote({ children, tone = 'slate' }: { children: ReactNode; tone?: 'slate' | 'amber' | 'indigo' }) {
  const tones = {
    slate: 'bg-slate-100/80 text-slate-500',
    amber: 'bg-amber-50 text-amber-700',
    indigo: 'bg-indigo-50/80 text-indigo-700',
  } as const;
  return <p className={`rounded-xl px-3 py-2 text-[11.5px] leading-relaxed ${tones[tone]}`}>{children}</p>;
}

export function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <p className="text-[10.5px] font-medium uppercase tracking-wide text-white/55">{label}</p>
      <p className="mt-0.5 text-[17px] font-bold tracking-tight text-white">{value}</p>
      {hint && <p className="mt-0.5 text-[10.5px] text-white/45">{hint}</p>}
    </div>
  );
}
