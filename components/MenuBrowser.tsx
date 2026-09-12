'use client';

import { useState } from 'react';
import type { MenuCategory, MenuItem } from '@/lib/types';
import CategoryNav from './CategoryNav';
import MenuItemCard from './MenuItemCard';
import ItemOptionsSheet from './ItemOptionsSheet';

export default function MenuBrowser({ menu }: { menu: MenuCategory[] }) {
  const [activeCategory, setActiveCategory] = useState(menu[0]?.id ?? '');
  const [openItem, setOpenItem] = useState<MenuItem | null>(null);
  const active = menu.find((c) => c.id === activeCategory) ?? menu[0];

  if (!menu.length) {
    return (
      <p className="px-4 py-16 text-center text-espresso/70">
        The menu isn't available right now — please ask at the counter.
      </p>
    );
  }

  return (
    <div className="pb-28">
      <CategoryNav
        categories={menu.map((c) => ({ id: c.id, name: c.name }))}
        activeId={active?.id ?? ''}
        onSelect={setActiveCategory}
      />
      <div className="space-y-3 px-4 pt-4">
        {active?.items.map((item) => (
          <MenuItemCard key={item.id} item={item} onOpen={() => setOpenItem(item)} />
        ))}
        {!active?.items.length && (
          <p className="py-8 text-center text-sm text-espresso/60">
            No items available in this category right now.
          </p>
        )}
      </div>
      {openItem && <ItemOptionsSheet item={openItem} onClose={() => setOpenItem(null)} />}
    </div>
  );
}
