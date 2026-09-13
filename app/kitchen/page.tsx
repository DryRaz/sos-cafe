'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Session } from '@supabase/supabase-js';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { formatKsh } from '@/lib/format';
import { playNewOrderChime, vibrate } from '@/lib/notify';
import type { OrderStatus } from '@/lib/types';

interface KitchenModifier {
  name: string;
  price: number;
}

interface KitchenOrderItem {
  id: string;
  quantity: number;
  size: 'single' | 'double' | null;
  notes: string | null;
  menu_items: { name: string } | null;
  order_item_modifiers: { modifiers: KitchenModifier | null }[];
}

interface KitchenOrder {
  id: string;
  order_number: number;
  status: OrderStatus;
  total_amount: number;
  customer_name: string | null;
  customer_phone: string | null;
  created_at: string;
  order_items: KitchenOrderItem[];
}

interface KitchenMenuItem {
  id: string;
  name: string;
  is_available: boolean;
}

const STATUS_LABEL: Record<OrderStatus, string> = {
  paid: 'New',
  preparing: 'Preparing',
  ready: 'Ready',
  completed: 'Completed',
};

const NEXT_ACTION: Partial<Record<OrderStatus, { label: string; next: OrderStatus }>> = {
  paid: { label: 'Start preparing', next: 'preparing' },
  preparing: { label: 'Mark ready', next: 'ready' },
  ready: { label: 'Mark served', next: 'completed' },
};

export default function KitchenPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [menuItems, setMenuItems] = useState<KitchenMenuItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [newOrderAlert, setNewOrderAlert] = useState<{ orderId: string; orderNumber: number } | null>(
    null
  );
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const alertTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const originalTitleRef = useRef('');

  const loadOrders = useCallback(async () => {
    const { data, error } = await supabaseBrowser
      .from('orders')
      .select(
        'id, order_number, status, total_amount, customer_name, customer_phone, created_at, order_items(id, quantity, size, notes, menu_items(name), order_item_modifiers(modifiers(name, price)))'
      )
      .in('status', ['paid', 'preparing', 'ready'])
      .order('created_at', { ascending: true });

    if (error) {
      setLoadError(error.message);
      return;
    }
    setLoadError(null);
    setOrders((data ?? []) as unknown as KitchenOrder[]);
  }, []);

  const loadMenuItems = useCallback(async () => {
    const { data, error } = await supabaseBrowser
      .from('menu_items')
      .select('id, name, is_available')
      .order('sort_order', { ascending: true });
    if (!error) setMenuItems((data ?? []) as KitchenMenuItem[]);
  }, []);

  useEffect(() => {
    supabaseBrowser.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabaseBrowser.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // Reset the flashed tab title once the barista actually looks back at the
  // dashboard, rather than leaving it changed forever.
  useEffect(() => {
    originalTitleRef.current = document.title;
    const onVisible = () => {
      if (!document.hidden) document.title = originalTitleRef.current;
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  const notifyNewOrder = useCallback((orderId: string, orderNumber: number) => {
    playNewOrderChime();
    vibrate([150, 80, 150, 80, 150]);
    if (document.hidden) {
      document.title = `🔔 New order — ${originalTitleRef.current}`;
    }
    setNewOrderAlert({ orderId, orderNumber });
    if (alertTimeoutRef.current) clearTimeout(alertTimeoutRef.current);
    alertTimeoutRef.current = setTimeout(() => setNewOrderAlert(null), 6000);
  }, []);

  useEffect(() => {
    return () => {
      if (alertTimeoutRef.current) clearTimeout(alertTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (session === null) router.replace('/login');
  }, [session, router]);

  useEffect(() => {
    if (!session) return;
    loadOrders();
    loadMenuItems();

    const channel = supabaseBrowser
      .channel('kitchen-dashboard')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (payload) => {
        loadOrders();
        const newOrder = payload.new as { id?: string; order_number?: number } | null;
        if (newOrder?.id && newOrder.order_number) {
          notifyNewOrder(newOrder.id, newOrder.order_number);
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, () => loadOrders())
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'orders' }, () => loadOrders())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => loadOrders())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_items' }, () => loadMenuItems())
      .subscribe();

    return () => {
      supabaseBrowser.removeChannel(channel);
    };
  }, [session, loadOrders, loadMenuItems]);

  async function advanceStatus(orderId: string, next: OrderStatus) {
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: next } : o)));
    const { error } = await supabaseBrowser.from('orders').update({ status: next }).eq('id', orderId);
    if (error) loadOrders();
  }

  async function toggleAvailability(item: KitchenMenuItem) {
    setMenuItems((prev) =>
      prev.map((m) => (m.id === item.id ? { ...m, is_available: !m.is_available } : m))
    );
    const { error } = await supabaseBrowser
      .from('menu_items')
      .update({ is_available: !item.is_available })
      .eq('id', item.id);
    if (error) loadMenuItems();
  }

  async function handleLogout() {
    await supabaseBrowser.auth.signOut();
    router.replace('/login');
  }

  async function handleDailyReport() {
    setReportError(null);
    setIsGeneratingReport(true);
    try {
      const { data } = await supabaseBrowser.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        setReportError('Session expired — log in again and retry.');
        return;
      }

      const res = await fetch('/api/orders/daily-report', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setReportError('Unable to generate the daily recap.');
        return;
      }

      const blob = await res.blob();
      const disposition = res.headers.get('content-disposition') ?? '';
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? 'recap-sos-caffe.pdf';

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      setReportError('Unable to generate the daily recap.');
    } finally {
      setIsGeneratingReport(false);
    }
  }

  if (session === undefined) {
    return <div className="p-6 text-center text-ink/60">Loading…</div>;
  }
  if (!session) {
    return null;
  }

  return (
    <div className="mx-auto max-w-2xl px-4 pb-24 pt-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl text-forest">Orders</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={handleDailyReport}
            disabled={isGeneratingReport}
            className="rounded-lg border border-espresso/30 px-3 py-1.5 text-sm font-medium text-espresso disabled:opacity-50"
          >
            {isGeneratingReport ? 'Generating…' : '📄 Daily recap'}
          </button>
          <button onClick={handleLogout} className="text-sm text-ink/60 underline">
            Log out
          </button>
        </div>
      </div>

      {reportError && <p className="mb-4 text-sm text-red-600">{reportError}</p>}

      {newOrderAlert && (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-gold bg-gold/15 px-4 py-3">
          <p className="font-display text-base text-espresso">
            🔔 New order #{newOrderAlert.orderNumber}!
          </p>
          <button
            onClick={() => setNewOrderAlert(null)}
            className="rounded-lg bg-gold px-3 py-1 text-sm font-medium text-ink"
          >
            OK
          </button>
        </div>
      )}

      {loadError && <p className="mb-4 text-sm text-red-600">{loadError}</p>}

      {orders.length === 0 && (
        <p className="text-ink/60">No orders in progress right now.</p>
      )}

      <div className="flex flex-col gap-4">
        {orders.map((order) => {
          const action = NEXT_ACTION[order.status];
          return (
            <div
              key={order.id}
              className={`rounded-xl border bg-white p-4 shadow-sm ${
                newOrderAlert?.orderId === order.id
                  ? 'border-gold ring-2 ring-gold'
                  : 'border-ink/10'
              }`}
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="font-display text-lg text-forest">
                  Order #{order.order_number}
                </span>
                <span className="rounded-full bg-cream px-3 py-1 text-xs font-medium text-espresso">
                  {STATUS_LABEL[order.status]}
                </span>
              </div>
              {order.customer_name && (
                <p className="mb-2 text-sm text-ink/70">Customer: {order.customer_name}</p>
              )}
              <ul className="mb-3 flex flex-col gap-1.5 text-sm text-ink">
                {order.order_items.map((line) => {
                  const mods = (line.order_item_modifiers ?? [])
                    .map((m) => m.modifiers)
                    .filter((m): m is KitchenModifier => !!m);
                  return (
                    <li key={line.id}>
                      <p>
                        {line.quantity}× {line.menu_items?.name ?? 'Item'}
                        {line.size ? ` (${line.size === 'single' ? 'single' : 'double'})` : ''}
                        {line.notes ? ` — ${line.notes}` : ''}
                      </p>
                      {mods.length > 0 && (
                        <p className="ml-4 font-medium text-forest">
                          +{' '}
                          {mods
                            .map((m) => (m.price > 0 ? `${m.name} (+${formatKsh(m.price)})` : m.name))
                            .join(', ')}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-ink">{formatKsh(order.total_amount)}</span>
                {action && (
                  <button
                    onClick={() => advanceStatus(order.id, action.next)}
                    className="rounded-lg bg-forest px-4 py-2 text-sm font-medium text-cream"
                  >
                    {action.label}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <h2 className="mb-3 mt-10 font-display text-xl text-forest">Menu availability</h2>
      <div className="flex flex-col divide-y divide-ink/10 rounded-xl border border-ink/10 bg-white">
        {menuItems.map((item) => (
          <label key={item.id} className="flex items-center justify-between px-4 py-3">
            <span className={item.is_available ? 'text-ink' : 'text-ink/40 line-through'}>
              {item.name}
            </span>
            <input
              type="checkbox"
              checked={item.is_available}
              onChange={() => toggleAvailability(item)}
              className="h-5 w-5 accent-forest"
            />
          </label>
        ))}
      </div>
    </div>
  );
}
