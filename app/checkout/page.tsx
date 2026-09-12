'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useCart } from '@/components/CartProvider';
import { formatKsh } from '@/lib/format';

export default function CheckoutPage() {
  const { lines, total, clear } = useCart();
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!/^0[17]\d{8}$/.test(phone.trim())) {
      setError('Enter a valid phone number, e.g. 07XX XXX XXX.');
      return;
    }
    if (lines.length === 0) {
      setError('Your cart is empty.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: phone.trim(),
          name: name.trim() || null,
          items: lines.map((l) => ({
            menu_item_id: l.menu_item_id,
            size: l.size,
            quantity: l.quantity,
            modifier_ids: l.modifiers.map((m) => m.id),
          })),
        }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error ?? 'Something went wrong. Please try again.');
      }

      const order = await res.json();
      clear();
      router.push(`/order/${order.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-cream px-4 pb-10 pt-6">
      <h1 className="font-display text-2xl text-ink">Checkout</h1>
      <p className="mt-1 text-sm text-espresso/80">
        Test mode — this confirms your order without taking payment yet.
      </p>

      <div className="mt-5 space-y-3">
        <h2 className="text-sm font-medium text-espresso">Order summary</h2>
        {lines.map((line) => (
          <div key={line.key} className="rounded-xl border border-espresso/15 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium text-ink">
                  {line.quantity}× {line.name}
                  {line.size ? ` (${line.size})` : ''}
                </p>
                {line.modifiers.length > 0 && (
                  <p className="mt-0.5 text-sm text-espresso">
                    {line.modifiers
                      .map((m) => (m.price > 0 ? `${m.name} (+${formatKsh(m.price)})` : m.name))
                      .join(', ')}
                  </p>
                )}
              </div>
              <span className="whitespace-nowrap font-medium text-ink">
                {formatKsh(
                  (line.unit_price + line.modifiers.reduce((s, m) => s + m.price, 0)) * line.quantity
                )}
              </span>
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label className="mb-1.5 block text-sm text-espresso" htmlFor="phone">
            Phone number
          </label>
          <input
            id="phone"
            type="tel"
            inputMode="numeric"
            placeholder="07XX XXX XXX"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded-lg border border-espresso/20 bg-white px-4 py-3 text-ink"
            required
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm text-espresso" htmlFor="name">
            First name <span className="text-espresso/50">(optional — so we can call you)</span>
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-espresso/20 bg-white px-4 py-3 text-ink"
          />
        </div>

        {error && <p className="text-sm text-red-700">{error}</p>}

        <div className="flex items-center justify-between border-t border-espresso/10 pt-4">
          <span className="text-espresso">Total</span>
          <span className="font-display text-lg text-ink">{formatKsh(total)}</span>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-full bg-forest py-3.5 font-medium text-cream disabled:opacity-60"
        >
          {submitting ? 'Confirming…' : 'Confirm order (test)'}
        </button>
      </form>
    </div>
  );
}
