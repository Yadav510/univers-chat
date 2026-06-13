/**
 * Push notification registration for the installed Android app (Capacitor + FCM).
 * No-op when running in a normal browser (which doesn't expose Capacitor.Push).
 *
 * Flow:
 *  1. App boots → call `registerPushForUser(userId)`.
 *  2. On Android, Capacitor asks for permission, gets an FCM token from Firebase,
 *     and we upsert it into `device_tokens` so server code can target this device.
 */
import { supabase } from "@/integrations/supabase/client";

type Capacitor = { isNativePlatform?: () => boolean };
type PushPluginRegistrationToken = { value: string };
type PushPlugin = {
  checkPermissions: () => Promise<{ receive: string }>;
  requestPermissions: () => Promise<{ receive: string }>;
  register: () => Promise<void>;
  addListener: (event: string, cb: (data: unknown) => void) => Promise<unknown> | unknown;
};

function getCapacitor(): Capacitor | null {
  const w = window as unknown as { Capacitor?: Capacitor };
  return w.Capacitor ?? null;
}

async function loadPushPlugin(): Promise<PushPlugin | null> {
  try {
    // dynamic import so the web bundle doesn't require this package
    const mod = await import("@capacitor/push-notifications");
    return (mod as unknown as { PushNotifications: PushPlugin }).PushNotifications;
  } catch {
    return null;
  }
}

export async function registerPushForUser(userId: string): Promise<void> {
  const cap = getCapacitor();
  if (!cap?.isNativePlatform?.()) return; // browser → skip
  const Push = await loadPushPlugin();
  if (!Push) return;

  let perm = await Push.checkPermissions();
  if (perm.receive !== "granted") perm = await Push.requestPermissions();
  if (perm.receive !== "granted") return;

  await Push.addListener("registration", async (raw: unknown) => {
    const token = (raw as PushPluginRegistrationToken).value;
    if (!token) return;
    await supabase
      .from("device_tokens")
      .upsert(
        { user_id: userId, token, platform: "android", updated_at: new Date().toISOString() },
        { onConflict: "token" },
      );
  });

  await Push.addListener("registrationError", (err: unknown) => {
    console.error("[push] registration error", err);
  });

  await Push.register();
}
