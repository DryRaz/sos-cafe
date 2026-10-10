import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';
import { getStaffFromRequest } from '@/lib/staff-auth';

export const dynamic = 'force-dynamic';

// Removes a pastry added by mistake. Only daily items can be removed here,
// never the permanent menu. A pastry that already appears in an order is
// kept for the order history and just taken off sale instead.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const staff = await getStaffFromRequest(req);
  if (!staff) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: item } = await supabaseServer
    .from('menu_items')
    .select('id, available_on')
    .eq('id', params.id)
    .maybeSingle();

  if (!item || !item.available_on) {
    return NextResponse.json({ error: 'Pastry not found.' }, { status: 404 });
  }

  const { count } = await supabaseServer
    .from('order_items')
    .select('id', { count: 'exact', head: true })
    .eq('menu_item_id', item.id);

  const { error } =
    count && count > 0
      ? await supabaseServer.from('menu_items').update({ is_available: false }).eq('id', item.id)
      : await supabaseServer.from('menu_items').delete().eq('id', item.id);

  if (error) {
    return NextResponse.json({ error: 'Could not remove the pastry. Please try again.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
