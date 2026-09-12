'use client';

import type { MenuItem } from '@/lib/types';
import { formatKsh } from '@/lib/format';

export default function MenuItemCard({ item, onOpen }: { item: MenuItem; onOpen: () => void }) {
  const priceLabel = item.price_double
    ? `${formatKsh(item.price_single)} / ${formatKsh(item.price_double)}`
    : formatKsh(item.price_single);

  return (
    <button
      onClick={onOpen}
      className="flex w-full items-center justify-between gap-4 rounded-xl border border-espresso/15 bg-white px-4 py-3.5 text-left transition-colors active:bg-cream"
    >
      <div>
        <p className="font-medium text-ink">{item.name}</p>
        <p className="mt-0.5 text-sm text-espresso">{priceLabel}</p>
      </div>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-forest text-lg leading-none text-cream">
        +
      </span>
    </button>
  );
}
