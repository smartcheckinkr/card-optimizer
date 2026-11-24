import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AppState, Card, PointCurrencyId, Transaction, WalletItem } from '../types';
import { LocalStorageRepository, exportStateJson, importStateJson, initialState } from '../services/storage';
import { importTransactionsCsv } from '../services/csv';
import { todayISO } from '../engine/date';

interface CardStoreValue {
  state: AppState;
  update: (updater: (prev: AppState) => AppState) => void;
  replaceState: (state: AppState) => void;
  resetState: () => void;
  saveCard: (card: Card) => void;
  deleteCard: (cardId: string) => void;
  addTransaction: (tx: Omit<Transaction, 'id' | 'createdAt'>) => void;
  setTransactionStatus: (id: string, status: Transaction['status']) => void;
  removeTransaction: (id: string) => void;
  addWalletItem: (item: Omit<WalletItem, 'id'>) => void;
  updateWalletItem: (id: string, patch: Partial<WalletItem>) => void;
  deleteWalletItem: (id: string) => void;
  setPointValue: (id: PointCurrencyId, value: number) => void;
  exportJson: () => string;
  importJson: (json: string) => { ok: boolean; message: string };
  importCsv: (csv: string) => { ok: boolean; message: string };
  lastSavedAt: string | null;
}

const CardStoreContext = createContext<CardStoreValue | null>(null);
const repo = new LocalStorageRepository();

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function CardStoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(() => repo.loadSync() ?? initialState());
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    repo.save(state).then(() => {
      if (!cancelled) setLastSavedAt(new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }));
    });
    return () => {
      cancelled = true;
    };
  }, [state]);

  const update = useCallback((updater: (prev: AppState) => AppState) => {
    setState((prev) => ({ ...updater(prev), updatedAt: todayISO() }));
  }, []);

  const value = useMemo<CardStoreValue>(() => {
    const saveCard = (card: Card) =>
      update((prev) => {
        const exists = prev.cards.some((c) => c.id === card.id);
        return {
          ...prev,
          cards: exists ? prev.cards.map((c) => (c.id === card.id ? card : c)) : [...prev.cards, card],
        };
      });

    const deleteCard = (cardId: string) =>
      update((prev) => ({
        ...prev,
        cards: prev.cards.filter((c) => c.id !== cardId),
        transactions: prev.transactions.filter((t) => t.cardId !== cardId),
        wallet: prev.wallet.filter((w) => w.cardId !== cardId),
      }));

    const addTransaction = (tx: Omit<Transaction, 'id' | 'createdAt'>) =>
      update((prev) => ({
        ...prev,
        transactions: [
          { ...tx, id: uid('tx'), createdAt: new Date().toISOString() },
          ...prev.transactions,
        ],
      }));

    const setTransactionStatus = (id: string, status: Transaction['status']) =>
      update((prev) => ({
        ...prev,
        transactions: prev.transactions.map((t) => (t.id === id ? { ...t, status } : t)),
      }));

    const removeTransaction = (id: string) =>
      update((prev) => ({ ...prev, transactions: prev.transactions.filter((t) => t.id !== id) }));

    const addWalletItem = (item: Omit<WalletItem, 'id'>) =>
      update((prev) => ({ ...prev, wallet: [{ ...item, id: uid('w') }, ...prev.wallet] }));

    const updateWalletItem = (id: string, patch: Partial<WalletItem>) =>
      update((prev) => ({
        ...prev,
        wallet: prev.wallet.map((w) => (w.id === id ? { ...w, ...patch } : w)),
      }));

    const deleteWalletItem = (id: string) =>
      update((prev) => ({ ...prev, wallet: prev.wallet.filter((w) => w.id !== id) }));

    const setPointValue = (id: PointCurrencyId, v: number) =>
      update((prev) => ({
        ...prev,
        settings: {
          ...prev.settings,
          pointValues: { ...prev.settings.pointValues, [id]: Math.max(0, v) },
        },
      }));

    const exportJson = () => exportStateJson(state);

    const importJson = (json: string) => {
      try {
        const next = importStateJson(json);
        setState(next);
        return { ok: true, message: `카드 ${next.cards.length}장, 결제내역 ${next.transactions.length}건을 불러왔습니다.` };
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : '불러오기에 실패했습니다.' };
      }
    };

    const importCsv = (csv: string) => {
      try {
        const result = importTransactionsCsv(csv, state.cards);
        if (result.transactions.length === 0) {
          return { ok: false, message: result.errors.join(' / ') || '가져올 결제내역이 없습니다.' };
        }
        update((prev) => ({ ...prev, transactions: [...result.transactions, ...prev.transactions] }));
        const errorNote = result.errors.length > 0 ? ` (건너뜀 ${result.errors.length}건: ${result.errors[0]})` : '';
        return { ok: true, message: `결제내역 ${result.transactions.length}건을 가져왔습니다.${errorNote}` };
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : 'CSV 가져오기에 실패했습니다.' };
      }
    };

    return {
      state,
      update,
      replaceState: setState,
      resetState: () => setState(initialState()),
      saveCard,
      deleteCard,
      addTransaction,
      setTransactionStatus,
      removeTransaction,
      addWalletItem,
      updateWalletItem,
      deleteWalletItem,
      setPointValue,
      exportJson,
      importJson,
      importCsv,
      lastSavedAt,
    };
  }, [state, update, lastSavedAt]);

  return <CardStoreContext.Provider value={value}>{children}</CardStoreContext.Provider>;
}

export function useCardStore(): CardStoreValue {
  const ctx = useContext(CardStoreContext);
  if (!ctx) throw new Error('CardStoreProvider 안에서만 useCardStore를 사용할 수 있습니다.');
  return ctx;
}
