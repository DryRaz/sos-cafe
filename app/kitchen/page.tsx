'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { Session } from '@supabase/supabase-js';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { formatKsh } from '@/lib/format';
import { playNewOrderChime, vibrate } from '@/lib/notify';
import type { OrderStatus } from '@/lib/types';
import { nairobiToday } from '@/lib/nairobi';

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
  mpesa_receipt_number: string | null;
  created_at: string;
  order_items: KitchenOrderItem[];
}

interface KitchenMenuItem {
  id: string;
  name: string;
  price_single: number;
  is_available: boolean;
  available_on: string | null;
}

const STATUS_LABEL: Record<OrderStatus, string> = {
  awaiting_payment: 'Awaiting payment',
  paid: 'New',
  preparing: 'Preparing',
  ready: 'Ready',
  completed: 'Completed',
  failed: 'Payment failed',
  expired: 'Payment expired',
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
  const [pastryName, setPastryName] = useState('');
  const [pastryPrice, setPastryPrice] = useState('');
  const [isAddingPastry, setIsAddingPastry] = useState(false);
  const [pastryError, setPastryError] = useState<string | null>(null);
  const alertTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const originalTitleRef = useRef('');
  // One repeating timer per order that's waiting to be started ('paid' status).
  // Each order gets its own clock, started the moment it's first seen pending,
  // so the alarm for order #5 keeps firing every 2 minutes independently of
  // order #6's — and stops the instant that specific order moves to
  // 'preparing', regardless of what's happening with any other order.
  const pendingAlarmTimersRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());

  const loadOrders = useCallback(async () => {
    const { data, error } = await supabaseBrowser
      .from('orders')
      .select(
        'id, order_number, status, total_amount, customer_name, customer_phone, mpesa_receipt_number, created_at, order_items(id, quantity, size, notes, menu_items(name), order_item_modifiers(modifiers(name, price)))'
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
      .select('id, name, price_single, is_available, available_on')
      // Pastries from previous days stay in the table for order history only.
      .or(`available_on.is.null,available_on.eq.${nairobiToday()}`)
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
    // Mirrors the three-burst audio alarm so a phone on silent/vibrate still
    // gets the same "keep buzzing until you notice" treatment.
    vibrate([150, 80, 150, 80, 150, 520, 150, 80, 150, 80, 150, 520, 150, 80, 150, 80, 150]);
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

  // Keep one repeating alarm per order that's still 'paid' (i.e. the barista
  // hasn't hit "Start preparing" yet). Runs every time the order list changes
  // so it stays in sync with reality: a new pending order gets its own timer,
  // and an order that starts preparing (or disappears — served, cancelled)
  // has its timer stopped immediately, without touching any other order's.
  useEffect(() => {
    const timers = pendingAlarmTimersRef.current;
    const pendingOrders = orders.filter((o) => o.status === 'paid');
    const pendingIds = new Set(pendingOrders.map((o) => o.id));

    pendingOrders.forEach((order) => {
      if (timers.has(order.id)) return;
      const interval = setInterval(() => {
        playNewOrderChime();
        vibrate([150, 80, 150, 80, 150, 520, 150, 80, 150, 80, 150, 520, 150, 80, 150, 80, 150]);
        if (document.hidden) {
          document.title = `🔔 Order #${order.order_number} still waiting — ${originalTitleRef.current}`;
        }
      }, 2 * 60 * 1000);
      timers.set(order.id, interval);
    });

    timers.forEach((interval, orderId) => {
      if (!pendingIds.has(orderId)) {
        clearInterval(interval);
        timers.delete(orderId);
      }
    });
  }, [orders]);

  // Belt-and-braces: clear every outstanding repeat timer if the dashboard
  // itself unmounts (e.g. staff navigates away), so nothing keeps firing
  // against a component that no longer exists.
  useEffect(() => {
    const timers = pendingAlarmTimersRef.current;
    return () => {
      timers.forEach((interval) => clearInterval(interval));
      timers.clear();
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
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, () => loadOrders())
      // Orders are created unpaid and only reach the kitchen once the customer
      // submits their M-Pesa code, which flips them to "paid" — that update is
      // the real "new order" moment.
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, (payload) => {
        loadOrders();
        const updated = payload.new as { id?: string; order_number?: number; status?: string } | null;
        if (updated?.status === 'paid' && updated.id && updated.order_number) {
          notifyNewOrder(updated.id, updated.order_number);
        }
      })
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

  async function staffFetch(url: string, init: RequestInit = {}) {
    const { data } = await supabaseBrowser.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error('Session expired — log in again and retry.');
    const res = await fetch(url, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error ?? 'Something went wrong. Please try again.');
    }
    return res.json();
  }

  async function handleAddPastry(e: FormEvent) {
    e.preventDefault();
    setPastryError(null);
    setIsAddingPastry(true);
    try {
      await staffFetch('/api/kitchen/pastries', {
        method: 'POST',
        body: JSON.stringify({ name: pastryName, price: Number(pastryPrice) }),
      });
      setPastryName('');
      setPastryPrice('');
      loadMenuItems();
    } catch (err) {
      setPastryError(err instanceof Error ? err.message : 'Could not add the pastry.');
    } finally {
      setIsAddingPastry(false);
    }
  }

  async function handleRemovePastry(item: KitchenMenuItem) {
    if (!window.confirm(`Remove "${item.name}" from today's menu?`)) return;
    setPastryError(null);
    try {
      await staffFetch(`/api/kitchen/pastries/${item.id}`, { method: 'DELETE' });
      loadMenuItems();
    } catch (err) {
      setPastryError(err instanceof Error ? err.message : 'Could not remove the pastry.');
    }
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

  const todaysPastries = menuItems.filter((m) => m.available_on !== null);
  const permanentItems = menuItems.filter((m) => m.available_on === null);

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
              {order.mpesa_receipt_number && (
                <p className="mb-2 rounded-lg bg-gold/15 px-3 py-2 text-sm text-espresso">
                  M-Pesa code:{' '}
                  <span className="font-mono font-bold tracking-wider text-ink">
                    {order.mpesa_receipt_number}
                  </span>
                  {order.status === 'paid' && (
                    <span className="block text-xs text-espresso/70">
                      Check it matches the Till SMS ({formatKsh(order.total_amount)}) before preparing.
                    </span>
                  )}
                </p>
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

      <h2 className="mb-1 mt-10 font-display text-xl text-forest">Today&apos;s pastries</h2>
      <p className="mb-3 text-sm text-ink/60">
        Add the pastries delivered this morning. They show on the customer menu today only.
      </p>
      <form onSubmit={handleAddPastry} className="mb-3 flex flex-wrap gap-2">
        <input
          type="text"
          placeholder="Pastry name"
          value={pastryName}
          onChange={(e) => setPastryName(e.target.value)}
          maxLength={60}
          required
          className="min-w-0 flex-[2_1_10rem] rounded-lg border border-ink/20 bg-white px-3 py-2 text-ink"
        />
        <input
          type="number"
          inputMode="numeric"
          placeholder="Price (KSh)"
          min={1}
          step={1}
          value={pastryPrice}
          onChange={(e) => setPastryPrice(e.target.value)}
          required
          className="min-w-0 flex-[1_1_6rem] rounded-lg border border-ink/20 bg-white px-3 py-2 text-ink"
        />
        <button
          type="submit"
          disabled={isAddingPastry}
          className="rounded-lg bg-forest px-4 py-2 text-sm font-medium text-cream disabled:opacity-60"
        >
          {isAddingPastry ? 'Adding…' : 'Add'}
        </button>
      </form>
      {pastryError && <p className="mb-3 text-sm text-red-600">{pastryError}</p>}
      {todaysPastries.length === 0 ? (
        <p className="text-sm text-ink/60">No pastries added for today yet.</p>
      ) : (
        <div className="flex flex-col divide-y divide-ink/10 rounded-xl border border-ink/10 bg-white">
          {todaysPastries.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <span className={item.is_available ? 'text-ink' : 'text-ink/40 line-through'}>
                {item.name} — {formatKsh(item.price_single)}
              </span>
              <div className="flex shrink-0 items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs text-ink/60">
                  In stock
                  <input
                    type="checkbox"
                    checked={item.is_available}
                    onChange={() => toggleAvailability(item)}
                    className="h-5 w-5 accent-forest"
                  />
                </label>
                <button
                  onClick={() => handleRemovePastry(item)}
                  className="text-sm text-red-700 underline"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <h2 className="mb-3 mt-10 font-display text-xl text-forest">Menu availability</h2>
      <div className="flex flex-col divide-y divide-ink/10 rounded-xl border border-ink/10 bg-white">
        {permanentItems.map((item) => (
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
