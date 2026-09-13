import { notFound } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase-server';
import { formatKsh } from '@/lib/format';
import OrderStatusBanner from '@/components/OrderStatusBanner';
import type { OrderStatus } from '@/lib/types';

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
    .select(
      'id, quantity, size, unit_price, menu_items ( name ), order_item_modifiers ( modifiers ( name, price ) )'
    )
    .eq('order_id', order.id);

  return (
    <div className="min-h-screen bg-cream px-4 pb-10 pt-10 text-center">
      <p className="font-script text-3xl text-forest">
        Thank you{order.customer_name ? `, ${order.customer_name}` : ''}.
      </p>
      <p className="mt-2 text-espresso">
        Order <span className="font-display text-2xl text-ink">#{order.order_number}</span>
      </p>
      <OrderStatusBanner orderId={order.id} initialStatus={order.status as OrderStatus}>
        <div className="mt-6 space-y-3 rounded-xl border border-espresso/15 bg-white p-4 text-left">
          {(items ?? []).map((item: any) => {
            const mods = (item.order_item_modifiers ?? [])
              .map((m: any) => m.modifiers)
              .filter((m: any): m is { name: string; price: number } => !!m);
            const modsTotal = mods.reduce((s: number, m: { price: number }) => s + m.price, 0);
            return (
              <div key={item.id} className="flex justify-between text-sm">
                <div>
                  <p className="text-ink">
                    {item.quantity} × {item.menu_items?.name}
                    {item.size ? ` (${item.size})` : ''}
                  </p>
                  {mods.length > 0 && (
                    <p className="mt-0.5 text-espresso">
                      {mods
                        .map((m: { name: string; price: number }) =>
                          m.price > 0 ? `${m.name} (+${formatKsh(m.price)})` : m.name
                        )
                        .join(', ')}
                    </p>
                  )}
                </div>
                <span className="whitespace-nowrap text-espresso">
                  {formatKsh((item.unit_price + modsTotal) * item.quantity)}
                </span>
              </div>
            );
          })}
          <div className="flex justify-between border-t border-espresso/10 pt-2 font-medium">
            <span>Total</span>
            <span>{formatKsh(order.total_amount)}</span>
          </div>
        </div>
      </OrderStatusBanner>
    </div>
  );
}
