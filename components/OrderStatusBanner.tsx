'use client';

import { useEffect, useRef, useState } from 'react';
import type { OrderStatus } from '@/lib/types';

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

// Two short beeps synthesized with the Web Audio API — no audio file to host,
// and it still works even if the tab has no <audio> element.
function playChime() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;
    [880, 1175].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = now + i * 0.18;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.35, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.4);
    });
  } catch {
    // Audio isn't critical to the notification — fail silently.
  }
}

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
      playChime();
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([200, 100, 200]);
      }
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
