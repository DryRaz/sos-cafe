import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';

// Next.js caches outbound fetch calls (including supabase-js's) by default —
// without this the status would be frozen at whatever it was on first poll.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Minimal, unauthenticated status lookup for the customer-facing order page.
// Only exposes `status` (never phone/name/etc.) so the anon confirmation
// page can poll it without needing RLS access to the full `orders` row.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { data, error } = await supabaseServer
    .from('orders')
    .select('status')
    .eq('id', params.id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  }

  return NextResponse.json({ status: data.status });
}
