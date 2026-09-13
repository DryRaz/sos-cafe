import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';
import { initiateStkPush } from '@/lib/mpesa';

export const dynamic = 'force-dynamic';

// Re-sends the M-Pesa prompt for an order whose previous attempt is
// definitively over (failed or expired) — never while a prompt might still
// be pending, to avoid a customer completing two prompts for the same order.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { data: order } = await supabaseServer
    .from('orders')
    .select('id, order_number, status, total_amount, customer_phone')
    .eq('id', params.id)
    .single();

  if (!order) {
    return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  }
  if (order.status !== 'failed' && order.status !== 'expired') {
    return NextResponse.json(
      { error: 'This order is not in a state that can be retried.' },
      { status: 409 }
    );
  }
  if (!order.customer_phone) {
    return NextResponse.json({ error: 'No phone number on file for this order.' }, { status: 400 });
  }

  await supabaseServer
    .from('orders')
    .update({ status: 'awaiting_payment', payment_failure_reason: null })
    .eq('id', order.id);

  const callbackUrl = process.env.MPESA_CALLBACK_URL || `${req.nextUrl.origin}/api/mpesa/callback`;
  try {
    const stk = await initiateStkPush({
      phone: order.customer_phone,
      amount: order.total_amount,
      accountReference: `SOS Caffe #${order.order_number}`,
      transactionDesc: `SOS Caffe order #${order.order_number}`,
      callbackUrl,
    });
    await supabaseServer
      .from('orders')
      .update({
        mpesa_checkout_request_id: stk.checkoutRequestId,
        mpesa_merchant_request_id: stk.merchantRequestId,
      })
      .eq('id', order.id);
  } catch (err) {
    await supabaseServer
      .from('orders')
      .update({
        status: 'failed',
        payment_failure_reason:
          err instanceof Error ? err.message : 'Could not reach M-Pesa. Please try again.',
      })
      .eq('id', order.id);
    return NextResponse.json({ error: 'Could not reach M-Pesa. Please try again.' }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
