import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

// Statuses from which a customer can still submit an M-Pesa code. failed and
// expired only exist on orders from the old STK push flow.
const PAYABLE_STATUSES = ['awaiting_payment', 'failed', 'expired'];

// M-Pesa confirmation codes are 10 characters, letters and digits, starting
// with a letter (e.g. SJK3ABC12D). Customers often paste the whole SMS
// ("SJK3ABC12D Confirmed. Ksh100.00 paid to ..."), so pull the code out of it.
function extractReceiptCode(input: string): string | null {
  const candidates = input.toUpperCase().match(/\b[A-Z][A-Z0-9]{9}\b/g) ?? [];
  return candidates.find((c) => /\d/.test(c)) ?? null;
}

// The customer pays the Till from their own M-Pesa app, then submits the
// confirmation code here. There is no automatic link between the Till and
// this app, so the code is NOT verified against Safaricom: the order goes
// to the kitchen as "paid" with the code shown on its card, and staff check
// it against the Till's M-Pesa SMS before handing the order over.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => null);
  const code = typeof body?.code === 'string' ? extractReceiptCode(body.code) : null;

  if (!code) {
    return NextResponse.json(
      { error: 'Enter the 10-character M-Pesa confirmation code, e.g. SJK3ABC12D.' },
      { status: 400 }
    );
  }

  const { data: order } = await supabaseServer
    .from('orders')
    .select('id, status, total_amount')
    .eq('id', params.id)
    .single();

  if (!order) {
    return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  }
  if (!PAYABLE_STATUSES.includes(order.status)) {
    return NextResponse.json({ error: 'This order has already been paid.' }, { status: 409 });
  }

  // One M-Pesa payment can only ever pay for one order. The unique index on
  // orders.mpesa_receipt_number enforces it; this check just answers early.
  const { data: reused } = await supabaseServer
    .from('orders')
    .select('id')
    .eq('mpesa_receipt_number', code)
    .neq('id', order.id)
    .limit(1);

  if (reused && reused.length > 0) {
    return NextResponse.json(
      { error: 'This M-Pesa code has already been used for another order.' },
      { status: 409 }
    );
  }

  // Only move the order on if it is still unpaid, so a double submit can't
  // overwrite a code that was already accepted.
  const { data: updated, error: updateError } = await supabaseServer
    .from('orders')
    .update({ status: 'paid', mpesa_receipt_number: code, payment_failure_reason: null })
    .eq('id', order.id)
    .in('status', PAYABLE_STATUSES)
    .select('id');

  if (updateError) {
    // 23505 = unique_violation on orders.mpesa_receipt_number: another order
    // claimed this code between the check above and this update.
    if (updateError.code === '23505') {
      return NextResponse.json(
        { error: 'This M-Pesa code has already been used for another order.' },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: 'Could not save your payment. Please try again.' }, { status: 500 });
  }
  if (!updated || updated.length === 0) {
    return NextResponse.json({ error: 'This order has already been paid.' }, { status: 409 });
  }

  // Payment trail: pending until someone checks the code against the Till.
  const { error: paymentError } = await supabaseServer.from('payments').upsert(
    {
      order_id: order.id,
      provider_ref: code,
      amount: order.total_amount,
      status: 'pending',
      raw_payload: { method: 'manual_till', submitted_code: body.code },
    },
    { onConflict: 'order_id' }
  );
  if (paymentError) {
    console.error('Failed to record payment for order', order.id, paymentError);
  }

  return NextResponse.json({ ok: true });
}
