From d19ce1ff7a662388e6f1d737c5cfc8ffd97a6315 Mon Sep 17 00:00:00 2001
From: Claude <noreply@anthropic.com>
Date: Fri, 16 Oct 2026 10:13:12 +0300
Subject: [PATCH] Repeat the kitchen new-order alarm every 2 minutes per
 pending order

Each order still in 'paid' status (not yet started) now gets its own
repeating 2-minute alarm until the barista moves it to 'preparing'.
Other orders that are still pending keep alarming independently.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01L9wmAvmTS4seerpvhGkj7z
---
 app/kitchen/page.tsx | 47 ++++++++++++++++++++++++++++++++++++++++++++
 1 file changed, 47 insertions(+)

diff --git a/app/kitchen/page.tsx b/app/kitchen/page.tsx
index 1d27b1d..d685d76 100644
--- a/app/kitchen/page.tsx
+++ b/app/kitchen/page.tsx
@@ -76,6 +76,12 @@ export default function KitchenPage() {
   const [pastryError, setPastryError] = useState<string | null>(null);
   const alertTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
   const originalTitleRef = useRef('');
+  // One repeating timer per order that's waiting to be started ('paid' status).
+  // Each order gets its own clock, started the moment it's first seen pending,
+  // so the alarm for order #5 keeps firing every 2 minutes independently of
+  // order #6's — and stops the instant that specific order moves to
+  // 'preparing', regardless of what's happening with any other order.
+  const pendingAlarmTimersRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
 
   const loadOrders = useCallback(async () => {
     const { data, error } = await supabaseBrowser
@@ -140,6 +146,47 @@ export default function KitchenPage() {
     };
   }, []);
 
+  // Keep one repeating alarm per order that's still 'paid' (i.e. the barista
+  // hasn't hit "Start preparing" yet). Runs every time the order list changes
+  // so it stays in sync with reality: a new pending order gets its own timer,
+  // and an order that starts preparing (or disappears — served, cancelled)
+  // has its timer stopped immediately, without touching any other order's.
+  useEffect(() => {
+    const timers = pendingAlarmTimersRef.current;
+    const pendingOrders = orders.filter((o) => o.status === 'paid');
+    const pendingIds = new Set(pendingOrders.map((o) => o.id));
+
+    pendingOrders.forEach((order) => {
+      if (timers.has(order.id)) return;
+      const interval = setInterval(() => {
+        playNewOrderChime();
+        vibrate([150, 80, 150, 80, 150, 520, 150, 80, 150, 80, 150, 520, 150, 80, 150, 80, 150]);
+        if (document.hidden) {
+          document.title = `🔔 Order #${order.order_number} still waiting — ${originalTitleRef.current}`;
+        }
+      }, 2 * 60 * 1000);
+      timers.set(order.id, interval);
+    });
+
+    timers.forEach((interval, orderId) => {
+      if (!pendingIds.has(orderId)) {
+        clearInterval(interval);
+        timers.delete(orderId);
+      }
+    });
+  }, [orders]);
+
+  // Belt-and-braces: clear every outstanding repeat timer if the dashboard
+  // itself unmounts (e.g. staff navigates away), so nothing keeps firing
+  // against a component that no longer exists.
+  useEffect(() => {
+    const timers = pendingAlarmTimersRef.current;
+    return () => {
+      timers.forEach((interval) => clearInterval(interval));
+      timers.clear();
+    };
+  }, []);
+
   useEffect(() => {
     if (session === null) router.replace('/login');
   }, [session, router]);
-- 
2.43.0
