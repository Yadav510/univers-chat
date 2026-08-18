import { supabase } from "@/integrations/supabase/client";
import { outboxAll, outboxRemove } from "@/lib/offline";

export const SENT_EVENT = "univers:sent";

let flushing = false;

/**
 * Push every queued (offline-composed) message to the server.
 * Safe to call often — it no-ops while a flush is already running or offline.
 */
export async function flushOutbox(): Promise<void> {
  if (typeof window === "undefined") return;
  if (flushing || !navigator.onLine) return;
  const queue = outboxAll();
  if (queue.length === 0) return;

  flushing = true;
  try {
    for (const item of queue) {
      const { data, error } = await supabase
        .from("messages")
        .insert({
          chat_id: item.chat_id,
          sender_id: item.sender_id,
          body: null,
          ciphertext: item.ciphertext,
          nonce: item.nonce,
          reply_to_id: item.reply_to_id,
        })
        .select()
        .single();

      // Network error → keep it queued and retry later.
      if (error) {
        if (isPermanent(error.code)) outboxRemove(item.id);
        break;
      }

      window.dispatchEvent(new CustomEvent(SENT_EVENT, { detail: data }));
      outboxRemove(item.id);
    }
  } finally {
    flushing = false;
  }
}

function isPermanent(code?: string) {
  // RLS / constraint violations will never succeed on retry.
  return !!code && (code.startsWith("42") || code.startsWith("23"));
}

/** Start background flushing: on load, on reconnect, and periodically. */
export function startSync() {
  if (typeof window === "undefined") return () => {};
  const run = () => void flushOutbox();
  run();
  window.addEventListener("online", run);
  const id = window.setInterval(run, 15_000);
  return () => {
    window.removeEventListener("online", run);
    window.clearInterval(id);
  };
}
