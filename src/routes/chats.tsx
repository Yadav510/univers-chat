import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { Avatar } from "@/components/Avatar";
import { formatChatTime } from "@/lib/format";

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
  last_message_body: string | null;
  last_message_sender: string | null;
  last_message_created_at: string | null;
};

const TABS = ["All", "Unread", "Pinned"] as const;
type Tab = (typeof TABS)[number];

function ChatsPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("All");

  // Redirect if not signed in
  useEffect(() => {
    if (!loading && !user) navigate({ to: "/", replace: true });
  }, [loading, user, navigate]);

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

  // Realtime: refetch chat list whenever a new message hits any chat I'm in.
  // RLS already restricts what comes back.
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel("home-chats")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["my-chats", user.id] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user, queryClient]);

  const filtered = useMemo(() => {
    if (tab === "Unread") {
      // We don't track unread server-side yet. Approximate: chats whose last message
      // wasn't sent by me and was within the last 24 h.
      return chats.filter(
        (c) =>
          c.last_message_sender &&
          c.last_message_sender !== user?.id &&
          c.last_message_created_at &&
          Date.now() - new Date(c.last_message_created_at).getTime() <
            24 * 60 * 60 * 1000,
      );
    }
    if (tab === "Pinned") return [];
    return chats;
  }, [chats, tab, user?.id]);

  const tabCounts: Record<Tab, number> = {
    All: chats.length,
    Unread: chats.filter(
      (c) =>
        c.last_message_sender &&
        c.last_message_sender !== user?.id &&
        c.last_message_created_at &&
        Date.now() - new Date(c.last_message_created_at).getTime() <
          24 * 60 * 60 * 1000,
    ).length,
    Pinned: 0,
  };

  return (
    <div className="min-h-dvh w-full bg-background flex justify-center">
      <div
        className="relative w-full max-w-[420px] min-h-dvh flex flex-col"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        {/* ====== Dark green header ====== */}
        <header className="px-5 pt-4 pb-5 text-foreground">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2.5">
                <h1 className="wordmark text-[34px] truncate">Messages</h1>
                <span className="inline-flex h-7 items-center justify-center rounded-full bg-primary px-2.5 text-[12px] font-bold text-primary-foreground">
                  {chats.length}
                </span>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <IconBtn label="Search">
                  <SearchIcon />
                </IconBtn>
                <Link
                  to="/new-chat"
                  className="press flex h-9 w-9 items-center justify-center rounded-full bg-white/10"
                  aria-label="New chat"
                >
                  <ProfileAddIcon />
                </Link>
              </div>
            </div>
            <Link
              to="/me"
              aria-label="Your profile"
              className="press shrink-0"
            >
              {me ? (
                <Avatar
                  name={me.display_name}
                  color={me.avatar_color}
                  size={42}
                  ring="mint"
                />
              ) : (
                <div className="h-[42px] w-[42px] rounded-full bg-white/10" />
              )}
            </Link>
          </div>

          {/* Stories row — placeholder when no chats yet */}
          <div className="no-scrollbar mt-5 flex gap-3 overflow-x-auto pb-1">
            <StoryItem
              label="You"
              color={me?.avatar_color ?? "#2DE682"}
              name={me?.display_name ?? "You"}
              onClick={() => navigate({ to: "/me" })}
              isMe
            />
            {chats.slice(0, 8).map((c) =>
              c.other_user_id && c.other_display_name && c.other_avatar_color ? (
                <StoryItem
                  key={c.other_user_id}
                  label={c.other_display_name.split(" ")[0]}
                  color={c.other_avatar_color}
                  name={c.other_display_name}
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
        </header>

        {/* ====== Cream chat panel ====== */}
        <section
          className="flex flex-1 flex-col rounded-t-[28px] bg-panel text-panel-foreground"
          style={{ boxShadow: "var(--shadow-panel)" }}
        >
          {/* Tabs */}
          <div className="no-scrollbar flex gap-2 overflow-x-auto px-5 pt-5 pb-3">
            {TABS.map((t) => {
              const active = t === tab;
              return (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`press flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold transition ${
                    active
                      ? "bg-primary text-primary-foreground"
                      : "bg-black/5 text-panel-foreground/70"
                  }`}
                >
                  <span>{t}</span>
                  <span
                    className={`text-[11px] font-bold ${
                      active ? "text-primary-foreground/70" : "text-panel-foreground/40"
                    }`}
                  >
                    {tabCounts[t]}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Chat list */}
          <ul className="flex-1 overflow-y-auto pb-24">
            {filtered.length === 0 ? (
              <EmptyState tab={tab} />
            ) : (
              filtered.map((c) => <ChatRowItem key={c.chat_id} chat={c} meId={user?.id} />)
            )}
          </ul>
        </section>

        {/* FAB */}
        <Link
          to="/new-chat"
          aria-label="New conversation"
          className="press absolute bottom-6 right-5 z-10 grid h-14 w-14 place-items-center rounded-full bg-primary text-primary-foreground glow-mint"
          style={{ marginBottom: "env(safe-area-inset-bottom)" }}
        >
          <ComposeIcon />
        </Link>
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
  isMe = false,
}: {
  label: string;
  color: string;
  name: string;
  onClick: () => void;
  isMe?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="press flex w-[64px] shrink-0 flex-col items-center gap-1.5"
    >
      <span className="rounded-full p-[2.5px] ring-2 ring-primary">
        <Avatar name={name} color={color} size={52} />
      </span>
      <span className="truncate w-full text-center text-[10.5px] text-foreground/85">
        {isMe ? "You" : label}
      </span>
    </button>
  );
}

function ChatRowItem({ chat, meId }: { chat: ChatRow; meId?: string }) {
  const name = chat.other_display_name ?? "Unknown";
  const color = chat.other_avatar_color ?? "#2DE682";
  const preview = chat.last_message_body ?? "Say hi 👋";
  const sentByMe = chat.last_message_sender && chat.last_message_sender === meId;
  const time = formatChatTime(chat.last_message_created_at ?? chat.last_message_at);

  return (
    <li className="hairline-b">
      <Link
        to="/chat/$chatId"
        params={{ chatId: chat.chat_id }}
        className="press flex w-full items-center gap-3 px-5 py-3.5"
      >
        <Avatar name={name} color={color} size={50} />
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
              {preview}
            </span>
            {!sentByMe && chat.last_message_body ? (
              <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden />
            ) : null}
          </div>
        </div>
      </Link>
    </li>
  );
}

function EmptyState({ tab }: { tab: Tab }) {
  return (
    <div className="flex flex-col items-center justify-center px-8 py-16 text-center">
      <div className="grid h-16 w-16 place-items-center rounded-2xl bg-primary/15 text-primary">
        <ComposeIcon />
      </div>
      <h3 className="mt-4 text-[16px] font-semibold text-panel-foreground">
        {tab === "All" ? "No conversations yet" : `No ${tab.toLowerCase()} chats`}
      </h3>
      <p className="mt-1.5 max-w-[260px] text-[13px] text-panel-foreground/55">
        {tab === "All"
          ? "Tap the green button to find someone by username and start chatting."
          : "Conversations matching this filter will appear here."}
      </p>
    </div>
  );
}

function IconBtn({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <button
      aria-label={label}
      className="press flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-foreground"
    >
      {children}
    </button>
  );
}

/* ============== Icons ============== */
function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M16 16l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
function ProfileAddIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <circle cx="10" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M3 19c1.2-3.5 4-5 7-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M18 13v6M15 16h6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
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
