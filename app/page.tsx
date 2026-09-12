import { supabaseServer } from '@/lib/supabase-server';
import MenuBrowser from '@/components/MenuBrowser';
import type { MenuCategory } from '@/lib/types';

export const revalidate = 0;

async function getMenu(): Promise<MenuCategory[]> {
  const { data: categories, error: catError } = await supabaseServer
    .from('menu_categories')
    .select('id, name, sort_order')
    .order('sort_order');

  if (catError || !categories) return [];

  const { data: items } = await supabaseServer
    .from('menu_items')
    .select('id, category_id, name, price_single, price_double, is_available, image_url, sort_order')
    .eq('is_available', true)
    .order('sort_order');

  const { data: itemModifierRows } = await supabaseServer
    .from('menu_item_modifiers')
    .select('menu_item_id, modifiers ( id, name, price )');

  const modifiersByItem = new Map<string, { id: string; name: string; price: number }[]>();
  (itemModifierRows ?? []).forEach((row: any) => {
    if (!row.modifiers) return;
    const list = modifiersByItem.get(row.menu_item_id) ?? [];
    list.push(row.modifiers);
    modifiersByItem.set(row.menu_item_id, list);
  });

  return categories
    .map((c) => ({
      ...c,
      items: (items ?? [])
        .filter((i) => i.category_id === c.id)
        .map((i) => ({ ...i, modifiers: modifiersByItem.get(i.id) ?? [] })),
    }))
    .filter((c) => c.items.length > 0);
}

export default async function HomePage() {
  const menu = await getMenu();
  return <MenuBrowser menu={menu} />;
}
