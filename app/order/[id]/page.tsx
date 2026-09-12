import { notFound } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase-server';
import { formatKsh } from '@/lib/format';

export const revalidate = 0;

export default async function OrderConfirmationPage({ params }: { params: { id: string } }) {
  const { data: order } = await supabaseServer
    .from('orders')
    .select('id, order_number, status, total_amount, customer_name, created_at')
    .eq('id', params.id)
    .single();

  if (!order) notFound();

  const { data: items } = await supabaseServer
    .from('order_items')
    .select('id, quantity, size, unit_price, menu_items ( name )')
    .eq('order_id', order.id);

  return (
    <div className="min-h-screen bg-cream px-4 pb-10 pt-10 text-center">
      <p className="font-script text-3xl text-forest">
        Thank you{order.customer_name ? `, ${order.customer_name}` : ''}.
      </p>
      <p className="mt-2 text-espresso">
        Order <span className="font-display text-2xl text-ink">#{order.order_number}</span>
      </p>
      <p className="mt-1 text-sm text-espresso/70">
        We&apos;ll call your number when it&apos;s ready — show this screen at the counter.
      </p>

      <div className="mt-6 space-y-2 rounded-xl border border-espresso/15 bg-white p-4 text-left">
        {(items ?? []).map((item: any) => (
          <div key={item.id} className="flex justify-between text-sm">
            <span className="text-ink">
              {item.quantity} × {item.menu_items?.name}
              {item.size ? ` (${item.size})` : ''}
            </span>
            <span className="text-espresso">{formatKsh(item.unit_price * item.quantity)}</span>
          </div>
        ))}
        <div className="flex justify-between border-t border-espresso/10 pt-2 font-medium">
          <span>Total</span>
          <span>{formatKsh(order.total_amount)}</span>
        </div>
      </div>

      <a href="/" className="mt-8 inline-block text-forest underline">
        Back to menu
      </a>
    </div>
  );
}
