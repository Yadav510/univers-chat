/**
 * Offline layer.
 *
 * - Local cache of encrypted rows (chat list, messages, chat peers) so the app
 *   renders instantly and fully works with no network. Only ciphertext is
 *   cached; decryption happens in-memory with the device-local private key.
 * - An outbox of messages composed while offline, flushed automatically as
 *   soon as connectivity returns.
 */
import { useEffect, useState } from "react";

const PREFIX = "univers.v1.";

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* quota — ignore */
  }
}

/* ---------------- caches ---------------- */

export function cacheGet<T>(key: string): T | null {
  return read<T | null>("cache." + key, null);
}

export function cacheSet(key: string, value: unknown) {
  write("cache." + key, value);
}

/* ---------------- outbox ---------------- */

export type OutboxItem = {
  id: string;
  chat_id: string;
  sender_id: string;
  ciphertext: string;
  nonce: string | null;
  reply_to_id: string | null;
  created_at: string;
  /** plaintext kept only in local storage so the bubble is readable offline */
  preview: string;
};

const OUTBOX = "outbox";

export function outboxAll(): OutboxItem[] {
  return read<OutboxItem[]>(OUTBOX, []);
}

export function outboxFor(chatId: string): OutboxItem[] {
  return outboxAll().filter((i) => i.chat_id === chatId);
}

export function outboxAdd(item: OutboxItem) {
  write(OUTBOX, [...outboxAll(), item]);
  emitOutboxChange();
}

export function outboxRemove(id: string) {
  write(
    OUTBOX,
    outboxAll().filter((i) => i.id !== id),
  );
  emitOutboxChange();
}

const OUTBOX_EVENT = "univers:outbox";

function emitOutboxChange() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(OUTBOX_EVENT));
  }
}

export function onOutboxChange(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(OUTBOX_EVENT, cb);
  return () => window.removeEventListener(OUTBOX_EVENT, cb);
}

/* ---------------- connectivity ---------------- */

export function useOnline() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return online;
}

/** Re-render whenever the outbox changes. */
export function useOutbox(chatId: string) {
  const [items, setItems] = useState<OutboxItem[]>([]);

  useEffect(() => {
    const sync = () => setItems(outboxFor(chatId));
    sync();
    return onOutboxChange(sync);
  }, [chatId]);

  return items;
}
