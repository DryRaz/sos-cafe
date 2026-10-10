import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';
import { getStaffFromRequest } from '@/lib/staff-auth';
import { nairobiToday } from '@/lib/nairobi';

export const dynamic = 'force-dynamic';

// Adds one of the day's pastries to the menu. It is stored as a regular
// menu item in the daily category, tagged with today's (Nairobi) date, so
// it shows up in the customer menu today only and drops off by itself
// tomorrow — nothing to clean up each morning.
export async function POST(req: NextRequest) {
  const staff = await getStaffFromRequest(req);
  if (!staff) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : '';
  const price = Number(body?.price);

  if (name.length < 2 || name.length > 60) {
    return NextResponse.json({ error: 'Enter a pastry name (2–60 characters).' }, { status: 400 });
  }
  if (!Number.isInteger(price) || price <= 0 || price > 100000) {
    return NextResponse.json({ error: 'Enter a unit price in whole shillings.' }, { status: 400 });
  }

  const { data: category } = await supabaseServer
    .from('menu_categories')
    .select('id')
    .eq('is_daily', true)
    .order('sort_order')
    .limit(1)
    .maybeSingle();

  if (!category) {
    return NextResponse.json({ error: 'The pastries category is missing.' }, { status: 500 });
  }

  const today = nairobiToday();
  const { count } = await supabaseServer
    .from('menu_items')
    .select('id', { count: 'exact', head: true })
    .eq('category_id', category.id)
    .eq('available_on', today);

  const { data: item, error } = await supabaseServer
    .from('menu_items')
    .insert({
      category_id: category.id,
      name,
      price_single: price,
      price_double: null,
      is_available: true,
      available_on: today,
      sort_order: count ?? 0,
    })
    .select('id, name, price_single, is_available, available_on')
    .single();

  if (error || !item) {
    return NextResponse.json({ error: 'Could not add the pastry. Please try again.' }, { status: 500 });
  }

  return NextResponse.json(item);
}
