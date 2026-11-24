export function formatWon(value: number, options: { sign?: boolean; compact?: boolean } = {}): string {
  const rounded = Math.round(value);
  const abs = Math.abs(rounded);
  const body = options.compact && abs >= 10_000 ? `${Math.round(abs / 10_000).toLocaleString('ko-KR')}만` : abs.toLocaleString('ko-KR');
  const sign = rounded < 0 ? '-' : options.sign && rounded > 0 ? '+' : '';
  return `${sign}${body}원`;
}

export function formatNumber(value: number, digits = 0): string {
  return value.toLocaleString('ko-KR', { maximumFractionDigits: digits });
}

export function parseAmountInput(raw: string): number {
  const digits = raw.replace(/[^\d]/g, '');
  return digits ? Number(digits) : 0;
}

export function formatRate(percent: number): string {
  return `${Number(percent.toFixed(2))}%`;
}

export function formatPercent(ratio: number, digits = 1): string {
  return `${(ratio * 100).toFixed(digits)}%`;
}
