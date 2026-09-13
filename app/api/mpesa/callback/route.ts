import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';
import { getCallbackMetadataValue } from '@/lib/mpesa';
import type { StkCallbackBody } from '@/lib/mpesa';

export const dynamic = 'force-dynamic';

// Safaricom calls this once the customer has responded to the STK prompt
// (paid, cancelled, or timed out) or if the prompt itself failed. There is
// no request signature to check, so trust is placed in this URL being
// unguessable/private plus matching CheckoutRequestID against an order we
// actually created — a stray or replayed POST that doesn't match anything
// just falls through to a 200 with no effect.
//
// Safaricom expects a 200 response no matter the outcome (it will otherwise
// retry the callback repeatedly), so every path below returns 200.
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as StkCallbackBody | null;
  const callback = body?.Body?.stkCallback;

  if (!callback?.CheckoutRequestID) {
    return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  }

  // De-duplicate: Safaricom can and does resend the same callback. The
  // unique constraint on event_id makes this insert fail on a repeat, which
  // is exactly how we detect one.
  const { error: logError } = await supabaseServer
    .from('payment_webhook_logs')
    .insert({ event_id: callback.CheckoutRequestID });

  if (logError) {
    // 23505 = unique_violation → already processed this callback, nothing to do.
    if (logError.code !== '23505') {
      console.error('Failed to log M-Pesa callback', logError);
    }
    return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  }

  const { data: order } = await supabaseServer
    .from('orders')
    .select('id, status')
    .eq('mpesa_checkout_request_id', callback.CheckoutRequestID)
    .single();

  if (!order) {
    console.error('M-Pesa callback for unknown CheckoutRequestID', callback.CheckoutRequestID);
    return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  }

  // Only act on orders still waiting — a retried payment or a late/duplicate
  // callback should never downgrade an order that's already moved on.
  if (order.status !== 'awaiting_payment') {
    return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  }

  if (callback.ResultCode === 0) {
    const receiptNumber = getCallbackMetadataValue(body!, 'MpesaReceiptNumber');
    await supabaseServer
      .from('orders')
      .update({
        status: 'paid',
        mpesa_receipt_number: receiptNumber ? String(receiptNumber) : null,
      })
      .eq('id', order.id);
  } else {
    // Common ResultDesc values: "Request cancelled by user", "The balance is
    // insufficient for the transaction", "DS timeout user cannot be reached".
    await supabaseServer
      .from('orders')
      .update({
        status: callback.ResultDesc?.toLowerCase().includes('timeout') ? 'expired' : 'failed',
        payment_failure_reason: callback.ResultDesc || 'Payment was not completed.',
      })
      .eq('id', order.id);
  }

  return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' });
}
