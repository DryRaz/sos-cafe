'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const DISMISS_KEY = 'sos-install-dismissed';

export default function PWAProvider() {
  const pathname = usePathname();
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [hidden, setHidden] = useState(true);

  // Register the service worker.
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISS_KEY) === '1';
    } catch {}
    if (standalone || dismissed) return;

    const ua = navigator.userAgent;
    const ios = /iphone|ipad|ipod/i.test(ua) && !/crios|fxios/i.test(ua);
    setIsIos(ios);
    if (ios) setHidden(false);

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as InstallEvent);
      setHidden(false);
    };
    const onInstalled = () => setHidden(true);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  // Never distract during checkout / order tracking.
  const quietPage = pathname === '/checkout' || pathname.startsWith('/order/');
  if (hidden || quietPage || (!installEvent && !isIos)) return null;

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {}
    setHidden(true);
  }

  async function install() {
    if (!installEvent) return;
    await installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    setInstallEvent(null);
    if (outcome === 'accepted') setHidden(true);
    else dismiss();
  }

  return (
    <div className="mx-4 mt-3 flex items-center gap-3 rounded-2xl border border-gold/60 bg-white px-4 py-3 text-sm shadow-sm">
      <div className="flex-1 text-ink">
        {installEvent ? (
          <span className="font-medium">Install SOS Caffè on your phone for faster ordering.</span>
        ) : (
          <span className="font-medium">
            To install: tap <b>Share</b>, then <b>Add to Home Screen</b>.
          </span>
        )}
      </div>
      {installEvent && (
        <button
          onClick={install}
          className="rounded-full bg-forest px-4 py-2 text-sm font-semibold text-cream"
        >
          Install
        </button>
      )}
      <button onClick={dismiss} aria-label="Dismiss" className="px-1 text-lg text-espresso/60">
        ×
      </button>
    </div>
  );
}
