'use client';

import Link from 'next/link';
import { useCart } from '@/components/CartProvider';
import { formatKsh } from '@/lib/format';

export default function CartPage() {
  const { lines, updateQuantity, removeLine, total } = useCart();

  return (
    <div className="min-h-screen bg-cream px-4 pb-32 pt-6">
      <h1 className="font-display text-2xl text-ink">Your order</h1>

      {lines.length === 0 ? (
        <div className="mt-10 text-center text-espresso/70">
          <p>Your cart is empty.</p>
          <Link href="/" className="mt-3 inline-block text-forest underline">
            Browse the menu
          </Link>
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          {lines.map((line) => (
            <div key={line.key} className="rounded-xl border border-espresso/15 bg-white p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-ink">
                    {line.name}
                    {line.size ? ` · ${line.size}` : ''}
                  </p>
                  {line.modifiers.length > 0 && (
                    <p className="mt-0.5 text-sm text-espresso">
                      {line.modifiers.map((m) => m.name).join(', ')}
                    </p>
                  )}
                </div>
                <button onClick={() => removeLine(line.key)} className="text-sm text-espresso/60">
                  Remove
                </button>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => updateQuantity(line.key, line.quantity - 1)}
                    className="h-8 w-8 rounded-full border border-espresso/20"
                    aria-label="Decrease quantity"
                  >
                    −
                  </button>
                  <span className="w-5 text-center">{line.quantity}</span>
                  <button
                    onClick={() => updateQuantity(line.key, line.quantity + 1)}
                    className="h-8 w-8 rounded-full border border-espresso/20"
                    aria-label="Increase quantity"
                  >
                    +
                  </button>
                </div>
                <span className="font-medium text-ink">
                  {formatKsh(
                    (line.unit_price + line.modifiers.reduce((s, m) => s + m.price, 0)) * line.quantity
                  )}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {lines.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 border-t border-espresso/10 bg-cream p-4">
          <div className="mx-auto flex max-w-md items-center justify-between">
            <span className="text-espresso">Total</span>
            <span className="font-display text-lg text-ink">{formatKsh(total)}</span>
          </div>
          <Link
            href="/checkout"
            className="mx-auto mt-3 flex max-w-md items-center justify-center rounded-full bg-forest py-3.5 font-medium text-cream"
          >
            Checkout
          </Link>
        </div>
      )}
    </div>
  );
}
