export type DrinkSize = 'single' | 'double';

export type OrderStatus = 'paid' | 'preparing' | 'ready' | 'completed';

export interface Modifier {
  id: string;
  name: string;
  price: number;
}

export interface MenuItem {
  id: string;
  category_id: string;
  name: string;
  price_single: number;
  price_double: number | null;
  is_available: boolean;
  image_url: string | null;
  sort_order: number;
  modifiers: Modifier[];
}

export interface MenuCategory {
  id: string;
  name: string;
  sort_order: number;
  items: MenuItem[];
}

export interface CartLine {
  key: string;
  menu_item_id: string;
  name: string;
  size: DrinkSize | null;
  unit_price: number;
  quantity: number;
  modifiers: Modifier[];
  notes?: string;
}
