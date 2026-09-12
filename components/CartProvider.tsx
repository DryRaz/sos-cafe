'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { CartLine } from '@/lib/types';

interface CartContextValue {
  lines: CartLine[];
  addLine: (line: Omit<CartLine, 'key'>) => void;
  updateQuantity: (key: string, quantity: number) => void;
  removeLine: (key: string) => void;
  clear: () => void;
  total: number;
  count: number;
}

const CartContext = createContext<CartContextValue | null>(null);
const STORAGE_KEY = 'sos-caffe-cart';

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setLines(JSON.parse(raw));
    } catch {
      // stockage corrompu ou indisponible
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
  }, [lines, hydrated]);

  const addLine: CartContextValue['addLine'] = (line) => {
    setLines((prev) => [...prev, { ...line, key: crypto.randomUUID() }]);
  };

  const updateQuantity = (key: string, quantity: number) => {
    setLines((prev) =>
      quantity <= 0
        ? prev.filter((l) => l.key !== key)
        : prev.map((l) => (l.key === key ? { ...l, quantity } : l))
    );
  };

  const removeLine = (key: string) => setLines((prev) => prev.filter((l) => l.key !== key));
  const clear = () => setLines([]);

  const total = useMemo(
    () =>
      lines.reduce(
        (sum, l) => sum + (l.unit_price + l.modifiers.reduce((s, m) => s + m.price, 0)) * l.quantity,
        0
      ),
    [lines]
  );
  const count = useMemo(() => lines.reduce((s, l) => s + l.quantity, 0), [lines]);

  return (
    <CartContext.Provider value={{ lines, addLine, updateQuantity, removeLine, clear, total, count }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart doit être utilisé à l’intérieur de CartProvider');
  return ctx;
}
