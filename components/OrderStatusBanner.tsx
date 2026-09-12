'use client';

import { useEffect, useRef, useState } from 'react';
import type { MouseEvent, ReactNode } from 'react';
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
  children,
}: {
  orderId: string;
  initialStatus: OrderStatus;
  children?: ReactNode;
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

  const isActive = status !== 'completed';

  // Warn before the customer accidentally closes the tab, refreshes, or
  // follows a link away while we still need this page open to notify them.
  useEffect(() => {
    if (!isActive) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isActive]);

  function handleBackClick(e: MouseEvent<HTMLAnchorElement>) {
    if (isActive) {
      const ok = window.confirm(
        "If you leave now, you won't see it here when your order is ready — you'd have to check back at the counter yourself. Leave anyway?"
      );
      if (!ok) e.preventDefault();
    }
  }

  const copy = STATUS_COPY[status];
  const isReady = status === 'ready';

  return (
    <>
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

      {isActive && (
        <div className="mt-3 flex items-center gap-3 rounded-xl border-2 border-gold bg-gold/15 px-4 py-3 text-left">
          <span className="text-2xl">📱</span>
          <p className="text-sm font-bold leading-snug text-espresso">
            Stay on this page — don&apos;t close the tab or go back. We&apos;ll alert you right
            here the moment your order is ready.
          </p>
        </div>
      )}

      {children}

      <a href="/" onClick={handleBackClick} className="mt-8 inline-block text-forest underline">
        Back to menu
      </a>
    </>
  );
}
