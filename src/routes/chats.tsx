import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { Avatar } from "@/components/Avatar";
import { AppTabBar } from "@/components/AppTabBar";
import { formatChatTime } from "@/lib/format";
import { useEnsureKeypair } from "@/lib/use-keypair";
import { registerPushForUser } from "@/lib/push";
import {
  decryptText,
  deriveSharedKey,
  importPublicKey,
} from "@/lib/crypto";
import {
  notifPermission,
  requestNotifPermission,
  showNotification,
} from "@/lib/notifications";
import { toast } from "sonner";

export const Route = createFileRoute("/chats")({
  head: () => ({ meta: [{ title: "Messages — Univers." }] }),
  component: ChatsPage,
});

type ChatRow = {
  chat_id: string;
  is_group: boolean;
  last_message_at: string;
  other_user_id: string | null;
  other_username: string | null;
  other_display_name: string | null;
  other_avatar_color: string | null;
  other_last_seen_at: string | null;
  other_public_key: string | null;
  last_message_body: string | null;
  last_message_ciphertext: string | null;
  last_message_nonce: string | null;
  last_message_sender: string | null;
  last_message_created_at: string | null;
};

function ChatsPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { privateKey } = useEnsureKeypair(user?.id);
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [notifState, setNotifState] = useState(notifPermission());

  // Redirect if not signed in
  useEffect(() => {
    if (!loading && !user) navigate({ to: "/", replace: true });
  }, [loading, user, navigate]);

  // Register push token on Android (no-op in browser)
  useEffect(() => {
    if (user) void registerPushForUser(user.id);
  }, [user]);


  // Heartbeat presence — refresh last_seen_at every 30s.
  useEffect(() => {
    if (!user) return;
    const tick = () => {
      void supabase
        .from("profiles")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("id", user.id);
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [user]);

  const { data: me } = useQuery({
    enabled: !!user,
    queryKey: ["me", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_color")
        .eq("id", user!.id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: chats = [] } = useQuery({
    enabled: !!user,
    queryKey: ["my-chats", user?.id],
    queryFn: async (): Promise<ChatRow[]> => {
      const { data, error } = await supabase.rpc("list_my_chats");
      if (error) throw error;
      return (data ?? []) as ChatRow[];
    },
  });

  // Decrypt last-message previews per chat (so the list shows real text).
  const [previews, setPreviews] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!privateKey) {
      setPreviews({});
      return;
    }
    let cancelled = false;
    (async () => {
      const next: Record<string, string> = {};
      for (const c of chats) {
        if (c.last_message_ciphertext && c.last_message_nonce && c.other_public_key) {
          try {
            const pub = await importPublicKey(c.other_public_key);
            const key = await deriveSharedKey(privateKey, pub);
            next[c.chat_id] = await decryptText(
              key,
              c.last_message_ciphertext,
              c.last_message_nonce,
            );
          } catch {
            next[c.chat_id] = "🔒 Encrypted message";
          }
        } else if (c.last_message_body) {
          next[c.chat_id] = c.last_message_body;
        }
      }
      if (!cancelled) setPreviews(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [chats, privateKey]);

  // Realtime: refetch chat list + fire notifications when a message hits
  // a chat I'm in (RLS already filters this to me).
  // Use refs for chats/privateKey so we don't resubscribe on every refetch.
  const chatsRef = useRef<ChatRow[]>(chats);
  const keyRef = useRef<CryptoKey | null>(privateKey);
  useEffect(() => { chatsRef.current = chats; }, [chats]);
  useEffect(() => { keyRef.current = privateKey; }, [privateKey]);

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel("home-chats")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        async (payload) => {
          queryClient.invalidateQueries({ queryKey: ["my-chats", user.id] });
          const msg = payload.new as {
            chat_id: string; sender_id: string; body: string | null;
            ciphertext: string | null; nonce: string | null;
          };
          if (msg.sender_id === user.id) return;
          const chat = chatsRef.current.find((c) => c.chat_id === msg.chat_id);
          const name = chat?.other_display_name ?? "New message";
          let preview = msg.body ?? "🔒 New message";
          const pk = keyRef.current;
          if (pk && msg.ciphertext && msg.nonce && chat?.other_public_key) {
            try {
              const pub = await importPublicKey(chat.other_public_key);
              const key = await deriveSharedKey(pk, pub);
              preview = await decryptText(key, msg.ciphertext, msg.nonce);
            } catch { /* keep fallback */ }
          }
          showNotification(name, preview, {
            tag: `chat-${msg.chat_id}`,
            onClick: () => navigate({ to: "/chat/$chatId", params: { chatId: msg.chat_id } }),
          });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, queryClient, navigate]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return chats.filter((c) => matchesSearch(c, term, previews[c.chat_id]));
  }, [chats, search, previews]);

  const activeNow = useMemo(() => {
    const now = Date.now();
    return chats.filter((c) => {
      if (!c.other_last_seen_at) return false;
      return now - new Date(c.other_last_seen_at).getTime() < 2 * 60_000; // 2 min
    });
  }, [chats]);

  async function enableNotifications() {
    const res = await requestNotifPermission();
    setNotifState(res);
    if (res === "granted") toast.success("Notifications on");
    else if (res === "denied") toast.error("Notifications blocked in browser settings");
  }

  return (
    <div className="min-h-dvh w-full bg-background flex justify-center">
      <div
        className="relative w-full max-w-[420px] min-h-dvh flex flex-col"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        {/* ====== Dark green header ====== */}
        <header className="px-5 pt-4 pb-5 text-foreground">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <h1 className="wordmark text-[32px] truncate">Messages</h1>
              <span className="inline-flex h-6 items-center justify-center rounded-full bg-primary px-2 text-[11px] font-bold text-primary-foreground">
                {chats.length}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {notifState !== "granted" && notifState !== "unsupported" && (
                <button
                  onClick={enableNotifications}
                  aria-label="Enable notifications"
                  title="Enable notifications"
                  className="press grid h-10 w-10 place-items-center rounded-full bg-white/10 text-foreground"
                >
                  <BellIcon />
                </button>
              )}
              <Link to="/me" aria-label="Your profile" className="press">
                {me ? (
                  <Avatar
                    name={me.display_name}
                    color={me.avatar_color}
                    size={40}
                    ring="mint"
                  />
                ) : (
                  <div className="h-10 w-10 rounded-full bg-white/10" />
                )}
              </Link>
            </div>
          </div>

          {/* Status / online-now row */}
          <div className="mt-5">
            <div className="flex items-center justify-between mb-2.5 px-0.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/50">
                Status
              </span>
              <span className="text-[11px] text-foreground/40">
                {activeNow.length} active now
              </span>
            </div>
            <div className="no-scrollbar flex gap-3 overflow-x-auto pb-1">
              <StoryItem
                label="You"
                color={me?.avatar_color ?? "#2DE682"}
                name={me?.display_name ?? "You"}
                online
                onClick={() => navigate({ to: "/me" })}
                isMe
              />
              {chats.map((c) =>
                c.other_user_id && c.other_display_name && c.other_avatar_color ? (
                  <StoryItem
                    key={c.other_user_id}
                    label={c.other_display_name.split(" ")[0]}
                    color={c.other_avatar_color}
                    name={c.other_display_name}
                    online={isOnline(c.other_last_seen_at)}
                    onClick={() =>
                      navigate({
                        to: "/chat/$chatId",
                        params: { chatId: c.chat_id },
                      })
                    }
                  />
                ) : null,
              )}
            </div>
          </div>
        </header>

        {/* ====== Cream chat panel ====== */}
        <section
          className="flex flex-1 flex-col rounded-t-[28px] bg-panel text-panel-foreground"
          style={{ boxShadow: "var(--shadow-panel)" }}
        >
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <span className="text-[13px] font-semibold text-panel-foreground/55">
              {search.trim()
                ? `${filtered.length} result${filtered.length === 1 ? "" : "s"}`
                : "All conversations"}
            </span>
            <span className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-panel-foreground/45">
              <LockMini />
              end-to-end
            </span>
          </div>

          {/* Chat list */}
          <ul className="flex-1 overflow-y-auto pb-[100px]">
            {filtered.length === 0 ? (
              <EmptyState searching={search.trim().length > 0} />
            ) : (
              filtered.map((c) => (
                <ChatRowItem
                  key={c.chat_id}
                  chat={c}
                  meId={user?.id}
                  preview={previews[c.chat_id]}
                />
              ))
            )}
          </ul>

          {/* Long pill search bar pinned above the tab bar */}
          <div
            className="pointer-events-none absolute inset-x-0 z-10"
            style={{ bottom: "calc(64px + env(safe-area-inset-bottom))" }}
          >
            <div className="px-4 pb-3">
              <label
                className="pointer-events-auto flex h-12 w-full items-center gap-2.5 rounded-full bg-white/[0.06] px-4 backdrop-blur-md"
                style={{ boxShadow: "0 8px 24px -8px rgba(0,0,0,0.18)" }}
              >
                <span className="shrink-0 text-panel-foreground/60">
                  <SearchIcon />
                </span>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search conversations, names, messages"
                  className="min-w-0 flex-1 bg-transparent text-[14px] text-panel-foreground placeholder:text-panel-foreground/45 focus:outline-none"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    aria-label="Clear"
                    className="press grid h-6 w-6 place-items-center rounded-full bg-white/10 text-panel-foreground/70"
                  >
                    <CloseIcon />
                  </button>
                )}
              </label>
            </div>
          </div>

          <AppTabBar active="chats" />
        </section>
      </div>
    </div>
  );
}

/* ============== Sub-components ============== */

function StoryItem({
  label,
  color,
  name,
  onClick,
  online = false,
  isMe = false,
}: {
  label: string;
  color: string;
  name: string;
  onClick: () => void;
  online?: boolean;
  isMe?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="press flex w-[64px] shrink-0 flex-col items-center gap-1.5"
    >
      <span
        className={`relative rounded-full p-[2.5px] ${
          online ? "ring-2 ring-primary" : "ring-2 ring-white/15"
        }`}
      >
        <Avatar name={name} color={color} size={52} />
        {online && !isMe && (
          <span className="absolute bottom-0.5 right-0.5 h-3 w-3 rounded-full border-2 border-background bg-primary online-dot" />
        )}
      </span>
      <span className="truncate w-full text-center text-[10.5px] text-foreground/85">
        {isMe ? "You" : label}
      </span>
    </button>
  );
}

function ChatRowItem({
  chat,
  meId,
  preview,
}: {
  chat: ChatRow;
  meId?: string;
  preview?: string;
}) {
  const name = chat.other_display_name ?? "Unknown";
  const color = chat.other_avatar_color ?? "#2DE682";
  const displayPreview =
    preview ??
    (chat.last_message_ciphertext
      ? "🔒 Encrypted message"
      : chat.last_message_body ?? "Say hi 👋");
  const sentByMe = chat.last_message_sender && chat.last_message_sender === meId;
  const time = formatChatTime(chat.last_message_created_at ?? chat.last_message_at);
  const online = isOnline(chat.other_last_seen_at);

  return (
    <li className="hairline-b">
      <Link
        to="/chat/$chatId"
        params={{ chatId: chat.chat_id }}
        className="press flex w-full items-center gap-3 px-5 py-3.5"
      >
        <div className="relative shrink-0">
          <Avatar name={name} color={color} size={50} />
          {online && (
            <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-background bg-primary online-dot" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[15px] font-semibold text-panel-foreground">
              {name}
            </span>
            <span className="shrink-0 text-[11px] text-panel-foreground/45">{time}</span>
          </div>
          <div className="mt-0.5 flex items-center justify-between gap-2">
            <span className="truncate text-[13px] text-panel-foreground/55">
              {sentByMe ? "You: " : ""}
              {displayPreview}
            </span>
            {!sentByMe && chat.last_message_created_at ? (
              <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden />
            ) : null}
          </div>
        </div>
      </Link>
    </li>
  );
}

function matchesSearch(chat: ChatRow, term: string, preview?: string) {
  if (!term) return true;
  return [chat.other_display_name, chat.other_username, preview]
    .filter(Boolean)
    .some((value) => value!.toLowerCase().includes(term));
}

function isOnline(lastSeen: string | null) {
  if (!lastSeen) return false;
  return Date.now() - new Date(lastSeen).getTime() < 2 * 60_000;
}

function EmptyState({ searching }: { searching: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center px-8 py-16 text-center">
      <div className="grid h-16 w-16 place-items-center rounded-2xl bg-primary/15 text-primary">
        <ComposeIcon />
      </div>
      <h3 className="mt-4 text-[16px] font-semibold text-panel-foreground">
        {searching ? "No matching chats" : "No conversations yet"}
      </h3>
      <p className="mt-1.5 max-w-[260px] text-[13px] text-panel-foreground/55">
        {searching
          ? "Try another name, username, or message."
          : "Tap New to find someone by username and start chatting."}
      </p>
    </div>
  );
}

/* ============== Icons ============== */
function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M16 16l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
function ComposeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M4 20h4l10-10-4-4L4 16v4z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}
function BellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2H4.5L6 16z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M10 20a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
function CloseIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}
function LockMini() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
      <rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M8 11V8a4 4 0 018 0v3" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
