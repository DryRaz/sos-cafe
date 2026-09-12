import type { Metadata } from 'next';
import { CartProvider } from '@/components/CartProvider';
import CartBar from '@/components/CartBar';
import './globals.css';

export const metadata: Metadata = {
  title: 'SOS Caffè — Kilgoris Coffee Spot',
  description: 'Order ahead at SOS Caffè, Kilgoris.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Caveat:wght@600&family=Inter:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-cream font-sans text-ink">
        <CartProvider>
          <header className="bg-forest px-4 pb-4 pt-5 text-cream">
            <div className="flex items-center gap-2.5">
              <LeafMark />
              <div>
                <h1 className="font-display text-xl tracking-wide">SOS CAFFÈ</h1>
                <p className="text-xs text-cream/70">Coffee · Community · Mission</p>
              </div>
            </div>
          </header>
          {children}
          <CartBar />
        </CartProvider>
      </body>
    </html>
  );
}

function LeafMark() {
  return (
    <svg width="26" height="26" viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <path
        d="M20 4C11 4 5 11 5 20c0 9 6 16 15 16s15-7 15-16c0-3-1-6-2-8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path d="M13 22c2-6 8-9 14-8-1 6-6 10-12 10-1 0-1.5-1-2-2z" fill="currentColor" />
    </svg>
  );
}
