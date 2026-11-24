import type { Card, CategoryId, Transaction } from '../types';
import { CATEGORY_LABEL, guessCategory } from '../data/categories';
import { todayISO } from '../engine/date';

export const CSV_TEMPLATE = [
  '날짜,카드,가맹점,업종,금액,상태,메모',
  '2026-11-24,메리어트 본보이,신세계백화점,백화점,300000,정상,예시 행',
  '2026-11-20,삼성 아멕스 플래티늄,롯데면세점,면세점,500000,정상,',
].join('\n');

const HEADER_ALIASES: Record<string, string> = {
  날짜: 'date',
  일시: 'date',
  date: 'date',
  카드: 'card',
  카드명: 'card',
  card: 'card',
  가맹점: 'merchant',
  사용처: 'merchant',
  merchant: 'merchant',
  업종: 'category',
  분류: 'category',
  category: 'category',
  금액: 'amount',
  amount: 'amount',
  상태: 'status',
  status: 'status',
  메모: 'memo',
  memo: 'memo',
};

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

function normalizeDate(raw: string, today: Date): string | null {
  const cleaned = raw.replace(/[.\-/]/g, '-').trim();
  const full = cleaned.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (full) {
    const [, y, m, d] = full;
    return `${y}-${String(Number(m)).padStart(2, '0')}-${String(Number(d)).padStart(2, '0')}`;
  }
  const short = cleaned.match(/^(\d{1,2})-(\d{1,2})$/);
  if (short) {
    const [, m, d] = short;
    return `${today.getFullYear()}-${String(Number(m)).padStart(2, '0')}-${String(Number(d)).padStart(2, '0')}`;
  }
  return null;
}

function matchCategory(raw: string, merchant: string): CategoryId {
  const text = raw.replace(/\s/g, '');
  for (const [id, label] of Object.entries(CATEGORY_LABEL)) {
    if (text && text === label.replace(/\s/g, '')) return id as CategoryId;
  }
  if (/면세/.test(text)) return 'dutyfree';
  if (/백화점/.test(text)) return 'department';
  if (/항공/.test(text)) return 'airline';
  return guessCategory(merchant);
}

function matchCard(raw: string, cards: Card[]): Card | null {
  const text = raw.replace(/\s/g, '').toLowerCase();
  if (!text) return null;
  const exact = cards.find((c) => c.name.replace(/\s/g, '').toLowerCase() === text || c.shortName.replace(/\s/g, '').toLowerCase() === text);
  if (exact) return exact;
  const partial = cards.find((c) => c.name.replace(/\s/g, '').toLowerCase().includes(text) || text.includes(c.shortName.replace(/\s/g, '').toLowerCase()));
  if (partial) return partial;
  const digits = raw.match(/(\d{4})\s*$/);
  if (digits) return cards.find((c) => c.last4 === digits[1]) ?? null;
  return null;
}

export interface CsvImportResult {
  transactions: Transaction[];
  errors: string[];
}

/** CSV 가져오기 — 헤더 이름(한/영)으로 열을 찾고, 카드·업종은 이름/라벨로 매칭한다. */
export function importTransactionsCsv(text: string, cards: Card[], today: Date = new Date()): CsvImportResult {
  const errors: string[] = [];
  const transactions: Transaction[] = [];
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    return { transactions: [], errors: ['데이터 행이 없습니다. 첫 줄은 헤더여야 합니다.'] };
  }

  const headers = splitCsvLine(lines[0]).map((h) => HEADER_ALIASES[h.toLowerCase()] ?? HEADER_ALIASES[h] ?? h);
  const required = ['date', 'card', 'amount'];
  for (const key of required) {
    if (!headers.includes(key)) errors.push(`필수 열이 없습니다: ${key}`);
  }
  if (errors.length > 0) return { transactions, errors };

  lines.slice(1).forEach((line, index) => {
    const cells = splitCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((key, i) => {
      row[key] = cells[i] ?? '';
    });
    const lineNo = index + 2;
    const card = matchCard(row.card ?? '', cards);
    if (!card) {
      errors.push(`${lineNo}행: 카드를 찾지 못했습니다 (${row.card})`);
      return;
    }
    const date = normalizeDate(row.date ?? '', today);
    if (!date) {
      errors.push(`${lineNo}행: 날짜 형식을 읽지 못했습니다 (${row.date})`);
      return;
    }
    const amount = Number((row.amount ?? '').replace(/[^\d-]/g, ''));
    if (!amount || Number.isNaN(amount) || amount <= 0) {
      errors.push(`${lineNo}행: 금액이 올바르지 않습니다 (${row.amount})`);
      return;
    }
    const statusText = (row.status ?? '').toLowerCase();
    const status: Transaction['status'] = /취소|cancel|refund/.test(statusText) ? 'canceled' : 'active';
    transactions.push({
      id: `csv-${Date.now()}-${index}`,
      cardId: card.id,
      merchant: row.merchant || '가맹점 미상',
      category: matchCategory(row.category ?? '', row.merchant ?? ''),
      amount,
      date,
      status,
      memo: row.memo || undefined,
      createdAt: new Date().toISOString(),
    });
  });

  return { transactions, errors };
}

export function exportTransactionsCsv(cards: Card[], transactions: Transaction[]): string {
  const rows = ['날짜,카드,가맹점,업종,금액,상태,메모'];
  for (const tx of [...transactions].sort((a, b) => (a.date < b.date ? -1 : 1))) {
    const card = cards.find((c) => c.id === tx.cardId);
    rows.push(
      [
        tx.date,
        `"${card?.shortName ?? '알 수 없음'}"`,
        `"${tx.merchant.replace(/"/g, '""')}"`,
        CATEGORY_LABEL[tx.category] ?? '일반',
        String(tx.amount),
        tx.status === 'canceled' ? '취소' : '정상',
        `"${(tx.memo ?? '').replace(/"/g, '""')}"`,
      ].join(','),
    );
  }
  return rows.join('\n');
}

export const CSV_TEMPLATE_TODAY = () => `${CSV_TEMPLATE.split('\n')[0]}\n${todayISO()},${CSV_TEMPLATE.split('\n')[1].split(',').slice(1).join(',')}`;
