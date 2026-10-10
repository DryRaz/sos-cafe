'use client';

import { useEffect, useRef, useState } from 'react';
import type { FormEvent, MouseEvent, ReactNode } from 'react';
import type { OrderStatus } from '@/lib/types';
import { playReadyChime, vibrate } from '@/lib/notify';
import { formatKsh } from '@/lib/format';

const STATUS_COPY: Record<OrderStatus, { title: string; subtitle: string }> = {
  awaiting_payment: {
    title: 'Waiting for payment',
    subtitle: 'Pay with M-Pesa and enter your confirmation code to send your order to the kitchen.',
  },
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
  failed: {
    title: 'Payment not completed',
    subtitle: 'Pay with M-Pesa and enter your confirmation code to send your order to the kitchen.',
  },
  expired: {
    title: 'Payment not completed',
    subtitle: 'Pay with M-Pesa and enter your confirmation code to send your order to the kitchen.',
  },
};

const PENDING_STATUSES: OrderStatus[] = ['awaiting_payment', 'paid', 'preparing', 'ready'];

export default function OrderStatusBanner({
  orderId,
  initialStatus,
  totalAmount,
  tillNumber,
  children,
}: {
  orderId: string;
  initialStatus: OrderStatus;
  totalAmount: number;
  tillNumber: string | null;
  children?: ReactNode;
}) {
  const [status, setStatus] = useState<OrderStatus>(initialStatus);
  const [paymentOpen, setPaymentOpen] = useState(true);
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [tillCopied, setTillCopied] = useState(false);
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

  const isActive = PENDING_STATUSES.includes(status);
  const needsPayment = status === 'awaiting_payment' || status === 'failed' || status === 'expired';

  async function handleConfirmPayment(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/confirm-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error ?? 'Could not confirm your payment. Please try again.');
      }
      setStatus('paid');
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Could not confirm your payment. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCopyTill() {
    if (!tillNumber) return;
    try {
      await navigator.clipboard.writeText(tillNumber);
      setTillCopied(true);
      setTimeout(() => setTillCopied(false), 2000);
    } catch {
      // Clipboard blocked — the number is on screen to type in by hand.
    }
  }

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

      {needsPayment && !paymentOpen && (
        <button
          onClick={() => setPaymentOpen(true)}
          className="mt-3 w-full rounded-full bg-forest py-3 font-medium text-cream"
        >
          Pay with M-Pesa
        </button>
      )}

      {needsPayment && paymentOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/60 px-4 pb-4 sm:items-center">
          <form
            onSubmit={handleConfirmPayment}
            className="w-full max-w-md rounded-2xl bg-cream p-5 text-left shadow-xl"
          >
            <p className="font-display text-xl text-forest">Pay with M-Pesa</p>
            <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-espresso">
              <li>Open M-Pesa on your phone</li>
              <li>
                Go to <strong>Lipa na M-Pesa</strong> → <strong>Buy Goods and Services</strong>
              </li>
              <li>Enter the Till number and amount below, then your PIN</li>
              <li>Copy the confirmation code from the M-Pesa SMS and paste it here</li>
            </ol>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-espresso/15 bg-white p-3">
                <p className="text-xs text-espresso/70">Till number</p>
                {tillNumber ? (
                  <button
                    type="button"
                    onClick={handleCopyTill}
                    className="mt-0.5 font-display text-2xl tracking-wider text-ink"
                  >
                    {tillNumber}
                  </button>
                ) : (
                  <p className="mt-0.5 text-sm text-ink">Ask at the counter</p>
                )}
                {tillNumber && (
                  <p className="text-xs text-forest">{tillCopied ? 'Copied!' : 'Tap to copy'}</p>
                )}
              </div>
              <div className="rounded-xl border border-espresso/15 bg-white p-3">
                <p className="text-xs text-espresso/70">Amount</p>
                <p className="mt-0.5 font-display text-2xl text-ink">{formatKsh(totalAmount)}</p>
              </div>
            </div>

            <label className="mt-4 block text-sm text-espresso" htmlFor="mpesa-code">
              M-Pesa confirmation code
            </label>
            <input
              id="mpesa-code"
              type="text"
              autoComplete="off"
              autoCapitalize="characters"
              placeholder="e.g. SJK3ABC12D"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-espresso/20 bg-white px-4 py-3 uppercase tracking-wider text-ink"
              required
            />
            {submitError && <p className="mt-2 text-sm text-red-700">{submitError}</p>}

            <button
              type="submit"
              disabled={submitting || code.trim().length === 0}
              className="mt-4 w-full rounded-full bg-forest py-3.5 font-medium text-cream disabled:opacity-60"
            >
              {submitting ? 'Confirming…' : 'Confirm payment'}
            </button>
            <button
              type="button"
              onClick={() => setPaymentOpen(false)}
              className="mt-2 w-full py-2 text-sm text-espresso/70 underline"
            >
              I&apos;ll do it in a moment
            </button>
          </form>
        </div>
      )}

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
