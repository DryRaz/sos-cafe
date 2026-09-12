'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCart } from './CartProvider';
import { formatKsh } from '@/lib/format';

export default function CartBar() {
  const { count, total } = useCart();
  const pathname = usePathname();

  const hideOn =
    pathname === '/cart' ||
    pathname === '/checkout' ||
    pathname.startsWith('/order/') ||
    pathname === '/login' ||
    pathname.startsWith('/kitchen');
  if (count === 0 || hideOn) return null;

  return (
    <Link
      href="/cart"
      className="fixed bottom-4 left-4 right-4 z-40 flex items-center justify-between rounded-full bg-forest px-5 py-4 text-cream shadow-lg"
    >
      <span className="text-sm font-medium">
        {count} item{count > 1 ? 's' : ''} · {formatKsh(total)}
      </span>
      <span className="text-sm font-medium">View cart →</span>
    </Link>
  );
}
