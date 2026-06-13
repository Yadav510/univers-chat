/**
 * Real browser notifications via the Notification API.
 * No service-worker / VAPID setup needed for foreground delivery.
 */

export type NotifPermission = "default" | "granted" | "denied" | "unsupported";

export function notifSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function notifPermission(): NotifPermission {
  if (!notifSupported()) return "unsupported";
  return Notification.permission as NotifPermission;
}

export async function requestNotifPermission(): Promise<NotifPermission> {
  if (!notifSupported()) return "unsupported";
  if (Notification.permission === "granted" || Notification.permission === "denied") {
    return Notification.permission as NotifPermission;
  }
  const res = await Notification.requestPermission();
  return res as NotifPermission;
}

export function showNotification(
  title: string,
  body: string,
  opts: { tag?: string; onClick?: () => void } = {},
) {
  if (!notifSupported() || Notification.permission !== "granted") return;
  // Don't notify if the tab is currently focused.
  if (typeof document !== "undefined" && document.visibilityState === "visible") return;
  try {
    const n = new Notification(title, {
      body,
      tag: opts.tag,
      icon: "/favicon.ico",
      badge: "/favicon.ico",
    });
    if (opts.onClick) {
      n.onclick = () => {
        window.focus();
        opts.onClick?.();
        n.close();
      };
    }
  } catch {
    /* ignore */
  }
}
