'use client';

import { useEffect, useRef, useState } from 'react';
import type { OrderStatus } from '@/lib/types';
import { playReadyChime, vibrate } from '@/lib/notify';

const STATUS_COPY: Record<OrderStatus, { title: string; subtitle: string }> = {
  paid: {
    title: 'Order received',
    subtitle: "We'll start preparing it shortly.",
  },
  preparing: {
    title: 'Being prepared…',
    subtitle: 'Your order is on its way.',
  },
  ready: {
    title: "It's ready! 🎉",
    subtitle: 'Please collect your order at the counter.',
  },
  completed: {
    title: 'Order collected',
    subtitle: 'Thanks for stopping by!',
  },
};

export default function OrderStatusBanner({
  orderId,
  initialStatus,
}: {
  orderId: string;
  initialStatus: OrderStatus;
}) {
  const [status, setStatus] = useState<OrderStatus>(initialStatus);
  const prevStatusRef = useRef<OrderStatus>(initialStatus);
  const originalTitleRef = useRef<string>('');

  useEffect(() => {
    originalTitleRef.current = document.title;
  }, []);

  // Poll for status changes. Simple and reliable for an unauthenticated
  // customer page — avoids opening up Realtime/RLS access to the full
  // orders table just for this.
  useEffect(() => {
    if (status === 'completed') return;

    let cancelled = false;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/orders/${orderId}/status`, { cache: 'no-store' });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (data.status && data.status !== status) {
          setStatus(data.status as OrderStatus);
        }
      } catch {
        // Network hiccup — just try again on the next tick.
      }
    }, 4000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [orderId, status]);

  useEffect(() => {
    if (status === 'ready' && prevStatusRef.current !== 'ready') {
      playReadyChime();
      vibrate([200, 100, 200]);
      document.title = `✅ Order ready! — ${originalTitleRef.current}`;
    }
    prevStatusRef.current = status;
  }, [status]);

  const copy = STATUS_COPY[status];
  const isReady = status === 'ready';

  return (
    <div
      className={`mt-4 rounded-xl border p-4 transition-colors ${
        isReady ? 'animate-pulse border-forest bg-forest' : 'border-espresso/15 bg-white'
      }`}
    >
      <p className={`font-display text-xl ${isReady ? 'text-cream' : 'text-forest'}`}>
        {copy.title}
      </p>
      <p className={`mt-1 text-sm ${isReady ? 'text-cream/90' : 'text-espresso/70'}`}>
        {copy.subtitle}
      </p>
    </div>
  );
}
