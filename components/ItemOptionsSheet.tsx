'use client';

import { useState } from 'react';
import type { MenuItem, DrinkSize } from '@/lib/types';
import { useCart } from './CartProvider';
import { formatKsh } from '@/lib/format';

export default function ItemOptionsSheet({
  item,
  onClose,
}: {
  item: MenuItem;
  onClose: () => void;
}) {
  const { addLine } = useCart();
  const [size, setSize] = useState<DrinkSize>('single');
  const [selectedModifiers, setSelectedModifiers] = useState<string[]>([]);
  const [quantity, setQuantity] = useState(1);

  const unitPrice = size === 'double' && item.price_double ? item.price_double : item.price_single;
  const modifiersTotal = item.modifiers
    .filter((m) => selectedModifiers.includes(m.id))
    .reduce((s, m) => s + m.price, 0);
  const lineTotal = (unitPrice + modifiersTotal) * quantity;

  function toggleModifier(id: string) {
    setSelectedModifiers((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]));
  }

  function handleAdd() {
    addLine({
      menu_item_id: item.id,
      name: item.name,
      size: item.price_double ? size : null,
      unit_price: unitPrice,
      quantity,
      modifiers: item.modifiers.filter((m) => selectedModifiers.includes(m.id)),
    });
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={item.name}
    >
      <div className="w-full max-w-md rounded-t-2xl bg-cream p-5 pb-6" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-espresso/20" />
        <h2 className="font-display text-xl text-ink">{item.name}</h2>

        {item.price_double && (
          <div className="mt-4">
            <p className="mb-2 text-sm text-espresso">Size</p>
            <div className="flex gap-2">
              {(['single', 'double'] as DrinkSize[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSize(s)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm capitalize ${
                    size === s ? 'border-forest bg-forest text-cream' : 'border-espresso/20 text-ink'
                  }`}
                >
                  {s} · {formatKsh(s === 'double' ? item.price_double! : item.price_single)}
                </button>
              ))}
            </div>
          </div>
        )}

        {item.modifiers.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-sm text-espresso">Add extras</p>
            <div className="space-y-2">
              {item.modifiers.map((m) => (
                <label
                  key={m.id}
                  className="flex items-center justify-between rounded-lg border border-espresso/15 bg-white px-3 py-2.5"
                >
                  <span className="flex items-center gap-2 text-sm text-ink">
                    <input
                      type="checkbox"
                      checked={selectedModifiers.includes(m.id)}
                      onChange={() => toggleModifier(m.id)}
                      className="h-4 w-4 accent-forest"
                    />
                    {m.name}
                  </span>
                  <span className="text-sm text-espresso">+{formatKsh(m.price)}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="mt-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              className="h-9 w-9 rounded-full border border-espresso/20 text-ink"
              aria-label="Decrease quantity"
            >
              −
            </button>
            <span className="w-5 text-center font-medium">{quantity}</span>
            <button
              type="button"
              onClick={() => setQuantity((q) => q + 1)}
              className="h-9 w-9 rounded-full border border-espresso/20 text-ink"
              aria-label="Increase quantity"
            >
              +
            </button>
          </div>
          <button
            type="button"
            onClick={handleAdd}
            className="rounded-full bg-forest px-6 py-3 text-sm font-medium text-cream"
          >
            Add · {formatKsh(lineTotal)}
          </button>
        </div>
      </div>
    </div>
  );
}
