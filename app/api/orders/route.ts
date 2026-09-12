import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';

interface OrderItemInput {
  menu_item_id: string;
  size: 'single' | 'double' | null;
  quantity: number;
  modifier_ids: string[];
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body || !Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: 'No items in order.' }, { status: 400 });
  }
  if (!body.phone || typeof body.phone !== 'string') {
    return NextResponse.json({ error: 'Phone number is required.' }, { status: 400 });
  }

  const items: OrderItemInput[] = body.items;
  const menuItemIds = [...new Set(items.map((i) => i.menu_item_id))];

  const { data: menuItems, error: menuError } = await supabaseServer
    .from('menu_items')
    .select('id, price_single, price_double, is_available')
    .in('id', menuItemIds);

  if (menuError || !menuItems) {
    return NextResponse.json({ error: 'Could not verify the menu. Please try again.' }, { status: 500 });
  }

  const menuById = new Map(menuItems.map((m) => [m.id, m]));

  const unavailable = items.find((i) => {
    const m = menuById.get(i.menu_item_id);
    return !m || !m.is_available;
  });
  if (unavailable) {
    return NextResponse.json(
      { error: 'One of the items in your cart just went out of stock. Please review your order.' },
      { status: 409 }
    );
  }

  const modifierIds = [...new Set(items.flatMap((i) => i.modifier_ids))];
  const { data: modifiers } = modifierIds.length
    ? await supabaseServer.from('modifiers').select('id, price').in('id', modifierIds)
    : { data: [] as { id: string; price: number }[] };
  const modifierById = new Map((modifiers ?? []).map((m) => [m.id, m]));

  let totalAmount = 0;
  const resolvedItems = items.map((i) => {
    const menuItem = menuById.get(i.menu_item_id)!;
    const unitPrice =
      i.size === 'double' && menuItem.price_double ? menuItem.price_double : menuItem.price_single;
    const modifiersTotal = i.modifier_ids.reduce((sum, id) => sum + (modifierById.get(id)?.price ?? 0), 0);
    totalAmount += (unitPrice + modifiersTotal) * i.quantity;
    return { ...i, unitPrice };
  });

  const { data: order, error: orderError } = await supabaseServer
    .from('orders')
    .insert({
      status: 'paid',
      total_amount: totalAmount,
      customer_phone: body.phone,
      customer_name: body.name ?? null,
    })
    .select('id, order_number')
    .single();

  if (orderError || !order) {
    return NextResponse.json({ error: 'Could not create the order. Please try again.' }, { status: 500 });
  }

  for (const item of resolvedItems) {
    const { data: orderItem, error: itemError } = await supabaseServer
      .from('order_items')
      .insert({
        order_id: order.id,
        menu_item_id: item.menu_item_id,
        size: item.size,
        quantity: item.quantity,
        unit_price: item.unitPrice,
      })
      .select('id')
      .single();

    if (itemError || !orderItem) {
      return NextResponse.json({ error: 'Could not save an item in your order.' }, { status: 500 });
    }

    if (item.modifier_ids.length > 0) {
      await supabaseServer
        .from('order_item_modifiers')
        .insert(item.modifier_ids.map((modifier_id) => ({ order_item_id: orderItem.id, modifier_id })));
    }
  }

  return NextResponse.json({ id: order.id, order_number: order.order_number });
}
