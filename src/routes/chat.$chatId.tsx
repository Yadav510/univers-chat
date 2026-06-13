import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { Avatar } from "@/components/Avatar";
import { formatChatTime } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/chat/$chatId")({
  head: () => ({ meta: [{ title: "Chat — Univers." }] }),
  component: ChatPage,
});

type Message = {
  id: string;
  chat_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

type Member = {
  user_id: string;
  display_name: string;
  username: string;
  avatar_color: string;
  last_seen_at: string;
};

function ChatPage() {
  const { chatId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, loading: authLoading } = useAuth();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/", replace: true });
  }, [authLoading, user, navigate]);

  // Other member (1:1 chats)
  const { data: other } = useQuery({
    enabled: !!user,
    queryKey: ["chat-other", chatId, user?.id],
    queryFn: async (): Promise<Member | null> => {
      const { data: members, error: mErr } = await supabase
        .from("chat_members")
        .select("user_id")
        .eq("chat_id", chatId);
      if (mErr) throw mErr;
      const otherId = members?.find((m) => m.user_id !== user!.id)?.user_id;
      if (!otherId) return null;
      const { data: prof, error: pErr } = await supabase
        .from("profiles")
        .select("id, display_name, username, avatar_color, last_seen_at")
        .eq("id", otherId)
        .single();
      if (pErr) throw pErr;
      return {
        user_id: prof.id,
        display_name: prof.display_name,
        username: prof.username,
        avatar_color: prof.avatar_color,
        last_seen_at: prof.last_seen_at,
      };
    },
  });

  // Messages
  const { data: messages = [] } = useQuery({
    enabled: !!user,
    queryKey: ["messages", chatId],
    queryFn: async (): Promise<Message[]> => {
      const { data, error } = await supabase
        .from("messages")
        .select("id, chat_id, sender_id, body, created_at")
        .eq("chat_id", chatId)
        .order("created_at", { ascending: true })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Realtime: live new messages
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`chat:${chatId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `chat_id=eq.${chatId}`,
        },
        (payload) => {
          const msg = payload.new as Message;
          queryClient.setQueryData<Message[]>(["messages", chatId], (prev = []) => {
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [chatId, user, queryClient]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  // Group consecutive messages by sender + render date separators
  const items = useMemo(() => groupForRender(messages), [messages]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || sending || !user) return;
    setSending(true);
    setDraft("");
    const { error } = await supabase.from("messages").insert({
      chat_id: chatId,
      sender_id: user.id,
      body,
    });
    setSending(false);
    if (error) {
      toast.error("Couldn't send: " + error.message);
      setDraft(body);
    }
  }

  return (
    <div className="min-h-dvh w-full bg-background flex justify-center">
      <div
        className="relative w-full max-w-[420px] min-h-dvh flex flex-col bg-panel text-panel-foreground"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        {/* Header */}
        <header className="hairline-b flex items-center gap-3 bg-panel px-3 py-2.5">
          <Link
            to="/chats"
            className="press flex h-9 w-9 items-center justify-center rounded-full text-panel-foreground"
            aria-label="Back"
          >
            <ChevronLeft />
          </Link>
          {other ? (
            <>
              <Avatar name={other.display_name} color={other.avatar_color} size={40} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-semibold">{other.display_name}</div>
                <div className="flex items-center gap-1 text-[11px] text-panel-foreground/55">
                  <LockMini />
                  <span>end-to-end secure</span>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 text-[14px] text-panel-foreground/55">Loading…</div>
          )}
        </header>

        {/* Messages */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-4 py-4"
          style={{ scrollBehavior: "smooth" }}
        >
          {items.length === 0 ? (
            <div className="flex h-full items-center justify-center text-center">
              <div className="px-8">
                <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary/15 text-primary">
                  <LockMini />
                </div>
                <p className="mt-3 text-[13px] text-panel-foreground/60">
                  No messages yet. Say hi 👋
                </p>
              </div>
            </div>
          ) : (
            items.map((it) =>
              it.kind === "date" ? (
                <DateSeparator key={`d-${it.label}`} label={it.label} />
              ) : (
                <Bubble
                  key={it.msg.id}
                  msg={it.msg}
                  mine={it.msg.sender_id === user?.id}
                  showTail={it.showTail}
                />
              ),
            )
          )}
        </div>

        {/* Composer */}
        <form
          onSubmit={send}
          className="hairline-b sticky bottom-0 flex items-end gap-2 bg-panel px-3 py-2.5"
          style={{ paddingBottom: "max(env(safe-area-inset-bottom), 10px)" }}
        >
          <div className="flex flex-1 items-end gap-2 rounded-[22px] border border-black/10 bg-white px-3 py-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send(e);
                }
              }}
              placeholder={other ? `Message ${other.display_name.split(" ")[0]}…` : "Message…"}
              rows={1}
              className="max-h-32 min-h-[24px] flex-1 resize-none bg-transparent text-[14.5px] leading-snug text-panel-foreground placeholder:text-panel-foreground/35 focus:outline-none"
              style={{ fieldSizing: "content" as never }}
            />
          </div>
          <button
            type="submit"
            disabled={!draft.trim() || sending}
            aria-label="Send"
            className="press grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground disabled:opacity-40 transition"
          >
            <SendIcon />
          </button>
        </form>
      </div>
    </div>
  );
}

/* ============ helpers ============ */

type RenderItem =
  | { kind: "date"; label: string }
  | { kind: "msg"; msg: Message; showTail: boolean };

function groupForRender(messages: Message[]): RenderItem[] {
  const out: RenderItem[] = [];
  let lastDay = "";
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    const day = dayLabel(m.created_at);
    if (day !== lastDay) {
      out.push({ kind: "date", label: day });
      lastDay = day;
    }
    const next = messages[i + 1];
    const showTail = !next || next.sender_id !== m.sender_id;
    out.push({ kind: "msg", msg: m, showTail });
  }
  return out;
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const same = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (same(d, now)) return "Today";
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (same(d, y)) return "Yesterday";
  return d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function DateSeparator({ label }: { label: string }) {
  return (
    <div className="my-3 flex justify-center">
      <span className="rounded-full bg-black/[0.06] px-3 py-1 text-[11px] font-medium text-panel-foreground/55">
        {label}
      </span>
    </div>
  );
}

function Bubble({
  msg,
  mine,
  showTail,
}: {
  msg: Message;
  mine: boolean;
  showTail: boolean;
}) {
  const base =
    "anim-msg-in inline-block max-w-[78%] px-3.5 py-2 text-[14.5px] leading-snug whitespace-pre-wrap break-words";
  const mineCls =
    "bg-primary text-primary-foreground rounded-[20px] rounded-br-[6px]";
  const theirsCls =
    "bg-white text-panel-foreground border border-black/5 rounded-[20px] rounded-bl-[6px]";

  return (
    <div className={`mb-1 flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className={`${base} ${mine ? mineCls : theirsCls}`}>
        {msg.body}
        {showTail && (
          <span
            className={`mt-1 block text-[10px] ${
              mine ? "text-primary-foreground/70" : "text-panel-foreground/45"
            }`}
          >
            {formatChatTime(msg.created_at)}
          </span>
        )}
      </div>
    </div>
  );
}

/* ============ icons ============ */
function ChevronLeft() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
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
function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M5 12l14-7-5 14-2-6-7-1z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}
