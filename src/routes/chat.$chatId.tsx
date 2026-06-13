import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { Avatar } from "@/components/Avatar";
import { formatChatTime } from "@/lib/format";
import { toast } from "sonner";
import { useEnsureKeypair } from "@/lib/use-keypair";
import {
  decryptBytes,
  decryptText,
  deriveSharedKey,
  encryptBytes,
  encryptText,
  generateFileKey,
  importPublicKey,
  unwrapFileKey,
  wrapFileKey,
} from "@/lib/crypto";
import { showNotification } from "@/lib/notifications";

export const Route = createFileRoute("/chat/$chatId")({
  head: () => ({ meta: [{ title: "Chat — Univers." }] }),
  component: ChatPage,
});

const REACTION_PALETTE = ["❤️", "😂", "🔥", "👍", "🎉", "😮", "😢"];

type RawMessage = {
  id: string;
  chat_id: string;
  sender_id: string;
  body: string | null;
  ciphertext: string | null;
  nonce: string | null;
  created_at: string;
  reply_to_id: string | null;
  attachment_path: string | null;
  attachment_mime: string | null;
  attachment_size: number | null;
  attachment_name_ciphertext: string | null;
  attachment_key_ciphertext: string | null;
  attachment_key_nonce: string | null;
};

type Attachment = {
  path: string;
  mime: string;
  size: number;
  nameCiphertext: string | null;
  keyCiphertext: string;
  keyNonce: string;
};

type Message = {
  id: string;
  chat_id: string;
  sender_id: string;
  text: string;
  created_at: string;
  encrypted: boolean;
  reply_to_id: string | null;
  attachment: Attachment | null;
};

type Reaction = { id: string; message_id: string; user_id: string; emoji: string };
type ReadReceipt = { message_id: string; user_id: string; read_at: string };

type Member = {
  user_id: string;
  display_name: string;
  username: string;
  avatar_color: string;
  public_key: string | null;
};

function ChatPage() {
  const { chatId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, loading: authLoading } = useAuth();
  const { privateKey } = useEnsureKeypair(user?.id);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimer = useRef<number | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [reactPickerFor, setReactPickerFor] = useState<string | null>(null);
  const [otherTyping, setOtherTyping] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/", replace: true });
  }, [authLoading, user, navigate]);

  const { data: other } = useQuery({
    enabled: !!user,
    queryKey: ["chat-other", chatId, user?.id],
    queryFn: async (): Promise<Member | null> => {
      const { data: members, error: mErr } = await supabase
        .from("chat_members").select("user_id").eq("chat_id", chatId);
      if (mErr) throw mErr;
      const otherId = members?.find((m) => m.user_id !== user!.id)?.user_id;
      if (!otherId) return null;
      const { data: prof, error: pErr } = await supabase
        .from("profiles")
        .select("id, display_name, username, avatar_color, public_key")
        .eq("id", otherId).single();
      if (pErr) throw pErr;
      return {
        user_id: prof.id, display_name: prof.display_name, username: prof.username,
        avatar_color: prof.avatar_color, public_key: prof.public_key,
      };
    },
  });

  const [sharedKey, setSharedKey] = useState<CryptoKey | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!privateKey || !other?.public_key) { setSharedKey(null); return; }
      try {
        const pub = await importPublicKey(other.public_key);
        const key = await deriveSharedKey(privateKey, pub);
        if (!cancelled) setSharedKey(key);
      } catch (err) { console.error("[e2ee] derive failed", err); }
    })();
    return () => { cancelled = true; };
  }, [privateKey, other?.public_key]);

  const { data: rawMessages = [] } = useQuery({
    enabled: !!user,
    queryKey: ["messages", chatId],
    queryFn: async (): Promise<RawMessage[]> => {
      const { data, error } = await supabase
        .from("messages")
        .select("id, chat_id, sender_id, body, ciphertext, nonce, created_at, reply_to_id, attachment_path, attachment_mime, attachment_size, attachment_name_ciphertext, attachment_key_ciphertext, attachment_key_nonce")
        .eq("chat_id", chatId).order("created_at", { ascending: true }).limit(500);
      if (error) throw error;
      return (data ?? []) as RawMessage[];
    },
  });

  const { data: reactions = [] } = useQuery({
    enabled: !!user,
    queryKey: ["reactions", chatId],
    queryFn: async (): Promise<Reaction[]> => {
      const { data, error } = await supabase
        .from("message_reactions").select("id, message_id, user_id, emoji").eq("chat_id", chatId);
      if (error) throw error;
      return (data ?? []) as Reaction[];
    },
  });

  const { data: reads = [] } = useQuery({
    enabled: !!user,
    queryKey: ["reads", chatId],
    queryFn: async (): Promise<ReadReceipt[]> => {
      const { data, error } = await supabase
        .from("message_reads").select("message_id, user_id, read_at").eq("chat_id", chatId);
      if (error) throw error;
      return (data ?? []) as ReadReceipt[];
    },
  });

  const [messages, setMessages] = useState<Message[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const out: Message[] = [];
      for (const m of rawMessages) {
        let text = m.body ?? "";
        let encrypted = false;
        if (m.ciphertext && m.nonce && sharedKey) {
          try { text = await decryptText(sharedKey, m.ciphertext, m.nonce); encrypted = true; }
          catch { text = "🔒 Encrypted message"; }
        } else if (m.ciphertext && !sharedKey) { text = "🔒 Encrypted message"; }
        const attachment: Attachment | null =
          m.attachment_path && m.attachment_mime && m.attachment_key_ciphertext && m.attachment_key_nonce
            ? { path: m.attachment_path, mime: m.attachment_mime, size: m.attachment_size ?? 0,
                nameCiphertext: m.attachment_name_ciphertext, keyCiphertext: m.attachment_key_ciphertext,
                keyNonce: m.attachment_key_nonce } : null;
        out.push({
          id: m.id, chat_id: m.chat_id, sender_id: m.sender_id, text,
          created_at: m.created_at, encrypted: encrypted || !!attachment,
          reply_to_id: m.reply_to_id, attachment,
        });
      }
      if (!cancelled) setMessages(out);
    })();
    return () => { cancelled = true; };
  }, [rawMessages, sharedKey]);

  // Mark visible messages from other as read
  useEffect(() => {
    if (!user || messages.length === 0) return;
    const unread = messages.filter((m) =>
      m.sender_id !== user.id && !reads.some((r) => r.message_id === m.id && r.user_id === user.id),
    );
    if (unread.length === 0) return;
    void supabase.from("message_reads").insert(
      unread.map((m) => ({ message_id: m.id, user_id: user.id, chat_id: chatId })),
    ).then(({ error }) => { if (!error) queryClient.invalidateQueries({ queryKey: ["reads", chatId] }); });
  }, [messages, reads, user, chatId, queryClient]);

  // Realtime: messages + reactions + typing + reads
  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel(`chat:${chatId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `chat_id=eq.${chatId}` },
        async (payload) => {
          const msg = payload.new as RawMessage;
          queryClient.setQueryData<RawMessage[]>(["messages", chatId], (prev = []) =>
            prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]);
          if (msg.sender_id !== user.id && other) {
            let preview = msg.body ?? (msg.attachment_path ? "📎 Attachment" : "🔒 New message");
            if (msg.ciphertext && msg.nonce && sharedKey) {
              try { preview = await decryptText(sharedKey, msg.ciphertext, msg.nonce); } catch { /* */ }
            }
            showNotification(other.display_name, preview, {
              tag: `chat-${chatId}`,
              onClick: () => navigate({ to: "/chat/$chatId", params: { chatId } }),
            });
          }
        })
      .on("postgres_changes", { event: "*", schema: "public", table: "message_reactions", filter: `chat_id=eq.${chatId}` },
        () => queryClient.invalidateQueries({ queryKey: ["reactions", chatId] }))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "message_reads", filter: `chat_id=eq.${chatId}` },
        () => queryClient.invalidateQueries({ queryKey: ["reads", chatId] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "typing_status", filter: `chat_id=eq.${chatId}` },
        (payload) => {
          const row = (payload.new ?? payload.old) as { user_id: string; updated_at?: string } | null;
          if (!row || row.user_id === user.id) return;
          if (payload.eventType === "DELETE") { setOtherTyping(false); return; }
          const updated = new Date(row.updated_at!).getTime();
          if (Date.now() - updated < 6_000) setOtherTyping(true);
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, user?.id, sharedKey, other?.user_id]);

  // Auto-clear typing indicator after 6s of silence
  useEffect(() => {
    if (!otherTyping) return;
    const t = window.setTimeout(() => setOtherTyping(false), 6_000);
    return () => clearTimeout(t);
  }, [otherTyping]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, otherTyping]);

  const items = useMemo(() => groupForRender(messages), [messages]);
  const messageMap = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);

  function broadcastTyping() {
    if (!user) return;
    if (typingTimer.current) window.clearTimeout(typingTimer.current);
    void supabase.from("typing_status").upsert(
      { chat_id: chatId, user_id: user.id, updated_at: new Date().toISOString() },
      { onConflict: "chat_id,user_id" },
    );
    typingTimer.current = window.setTimeout(() => {
      void supabase.from("typing_status").delete()
        .eq("chat_id", chatId).eq("user_id", user.id);
    }, 4_000);
  }

  async function sendText(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || sending || !user) return;
    setSending(true); setDraft(""); const reply = replyTo; setReplyTo(null);
    try {
      if (!sharedKey) { toast.error("Secure channel not ready"); setDraft(body); setReplyTo(reply); return; }
      const { ciphertext, nonce } = await encryptText(sharedKey, body);
      const { error } = await supabase.from("messages").insert({
        chat_id: chatId, sender_id: user.id, body: null,
        ciphertext, nonce, reply_to_id: reply?.id ?? null,
      });
      if (error) { toast.error("Couldn't send: " + error.message); setDraft(body); setReplyTo(reply); }
      else {
        void supabase.from("typing_status").delete().eq("chat_id", chatId).eq("user_id", user.id);
      }
    } finally { setSending(false); }
  }

  async function sendFile(file: File) {
    if (!user || !sharedKey) { toast.error("Secure channel not ready"); return; }
    if (file.size > 25 * 1024 * 1024) { toast.error("Max file size is 25MB"); return; }
    const toastId = toast.loading(`Encrypting ${file.name}…`);
    try {
      const bytes = await file.arrayBuffer();
      const fileKey = await generateFileKey();
      const { ciphertext, nonce } = await encryptBytes(fileKey, bytes);
      const wrapped = await wrapFileKey(sharedKey, fileKey);
      const nameEnc = await encryptText(sharedKey, file.name);
      const path = `${user.id}/${crypto.randomUUID()}.bin`;
      const { error: upErr } = await supabase.storage.from("attachments")
        .upload(path, new Blob([ciphertext], { type: "application/octet-stream" }),
          { contentType: "application/octet-stream" });
      if (upErr) throw upErr;
      const reply = replyTo; setReplyTo(null);
      const { error: mErr } = await supabase.from("messages").insert({
        chat_id: chatId, sender_id: user.id, body: null, ciphertext: nonce, nonce: null,
        reply_to_id: reply?.id ?? null,
        attachment_path: path, attachment_mime: file.type || "application/octet-stream",
        attachment_size: file.size,
        attachment_name_ciphertext: nameEnc.ciphertext + "." + nameEnc.nonce,
        attachment_key_ciphertext: wrapped.ciphertext + "." + wrapped.nonce + "." + nonce,
        attachment_key_nonce: wrapped.nonce,
      });
      if (mErr) throw mErr;
      toast.success("Sent", { id: toastId });
    } catch (err) {
      console.error(err);
      toast.error("Couldn't send file: " + (err as Error).message, { id: toastId });
    }
  }

  async function toggleReaction(messageId: string, emoji: string) {
    if (!user) return;
    setReactPickerFor(null);
    const mine = reactions.find((r) => r.message_id === messageId && r.user_id === user.id && r.emoji === emoji);
    if (mine) {
      await supabase.from("message_reactions").delete().eq("id", mine.id);
    } else {
      await supabase.from("message_reactions").insert({
        message_id: messageId, chat_id: chatId, user_id: user.id, emoji,
      });
    }
    queryClient.invalidateQueries({ queryKey: ["reactions", chatId] });
  }

  const e2eeReady = !!sharedKey;
  const lastMineReadByOther = useMemo(() => {
    if (!user || !other) return null;
    const mineMsgs = messages.filter((m) => m.sender_id === user.id);
    for (let i = mineMsgs.length - 1; i >= 0; i--) {
      const m = mineMsgs[i];
      if (reads.some((r) => r.message_id === m.id && r.user_id === other.user_id)) return m.id;
    }
    return null;
  }, [messages, reads, user, other]);

  return (
    <div className="min-h-dvh w-full bg-background flex justify-center">
      <div
        className="relative w-full max-w-[440px] min-h-dvh flex flex-col bg-background"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        {/* Aurora glow header */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-48 aurora opacity-70" aria-hidden />

        <header className="relative hairline-b flex items-center gap-3 px-3 py-3 backdrop-blur-xl">
          <Link to="/chats" className="press grid h-10 w-10 place-items-center rounded-full bg-white/5" aria-label="Back">
            <ChevronLeft />
          </Link>
          {other ? (
            <>
              <Avatar name={other.display_name} color={other.avatar_color} size={42} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-semibold tracking-tight">{other.display_name}</div>
                <div className="flex items-center gap-1.5 text-[11px] text-foreground/55">
                  <span className="grid h-3.5 w-3.5 place-items-center rounded-full bg-primary/20 text-primary">
                    <LockMini />
                  </span>
                  <span>{otherTyping ? "typing…" : e2eeReady ? "end-to-end encrypted" : "securing…"}</span>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 text-[14px] text-foreground/55">Loading…</div>
          )}
        </header>

        <div ref={scrollRef} className="relative flex-1 overflow-y-auto px-3 py-4" style={{ scrollBehavior: "smooth" }}>
          {items.length === 0 ? (
            <EmptyChat ready={e2eeReady} />
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
                  sharedKey={sharedKey}
                  replyTarget={it.msg.reply_to_id ? messageMap.get(it.msg.reply_to_id) ?? null : null}
                  reactions={reactions.filter((r) => r.message_id === it.msg.id)}
                  meId={user?.id}
                  pickerOpen={reactPickerFor === it.msg.id}
                  onTogglePicker={() => setReactPickerFor((cur) => (cur === it.msg.id ? null : it.msg.id))}
                  onReact={(emoji) => toggleReaction(it.msg.id, emoji)}
                  onReply={() => setReplyTo(it.msg)}
                  showReadCheck={lastMineReadByOther === it.msg.id}
                />
              ),
            )
          )}
          {otherTyping && <TypingBubble name={other?.display_name ?? "…"} color={other?.avatar_color ?? "#4f46e5"} />}
        </div>

        {replyTo && (
          <div className="mx-3 mb-2 flex items-start gap-2 rounded-2xl border border-primary/40 bg-primary/10 px-3 py-2">
            <div className="h-full w-1 self-stretch rounded-full bg-primary" />
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-primary">
                Replying to {replyTo.sender_id === user?.id ? "yourself" : other?.display_name ?? "them"}
              </div>
              <div className="truncate text-[12px] text-foreground/70">
                {replyTo.attachment ? "📎 attachment" : replyTo.text}
              </div>
            </div>
            <button onClick={() => setReplyTo(null)} className="press grid h-7 w-7 place-items-center rounded-full bg-white/10" aria-label="Cancel reply">
              <CloseMini />
            </button>
          </div>
        )}

        <form
          onSubmit={sendText}
          className="hairline-t sticky bottom-0 flex items-end gap-2 bg-background/95 px-3 py-3 backdrop-blur-xl"
          style={{ paddingBottom: "max(env(safe-area-inset-bottom), 12px)" }}
        >
          <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => {
            const f = e.target.files?.[0]; if (f) void sendFile(f); e.currentTarget.value = "";
          }} />
          <button
            type="button" onClick={() => fileInputRef.current?.click()} aria-label="Attach"
            disabled={!e2eeReady}
            className="press grid h-11 w-11 shrink-0 place-items-center rounded-full border border-white/10 bg-white/5 text-foreground disabled:opacity-40"
          >
            <PaperclipIcon />
          </button>
          <div className="flex flex-1 items-end gap-2 rounded-[22px] border border-white/10 bg-white/[0.04] px-4 py-2">
            <textarea
              value={draft}
              onChange={(e) => { setDraft(e.target.value); broadcastTyping(); }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendText(e); }
              }}
              placeholder={other ? `Message ${other.display_name.split(" ")[0]}…` : "Message…"}
              rows={1}
              className="max-h-32 min-h-[24px] flex-1 resize-none bg-transparent text-[14.5px] leading-snug text-foreground placeholder:text-foreground/35 focus:outline-none"
              style={{ fieldSizing: "content" as never }}
            />
          </div>
          <button
            type="submit" disabled={!draft.trim() || sending} aria-label="Send"
            className="press grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground glow-primary disabled:opacity-40 transition"
          >
            <SendIcon />
          </button>
        </form>
      </div>
    </div>
  );
}

/* ============ helpers ============ */

type RenderItem = { kind: "date"; label: string } | { kind: "msg"; msg: Message; showTail: boolean };

function groupForRender(messages: Message[]): RenderItem[] {
  const out: RenderItem[] = [];
  let lastDay = "";
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    const day = dayLabel(m.created_at);
    if (day !== lastDay) { out.push({ kind: "date", label: day }); lastDay = day; }
    const next = messages[i + 1];
    const showTail = !next || next.sender_id !== m.sender_id;
    out.push({ kind: "msg", msg: m, showTail });
  }
  return out;
}

function dayLabel(iso: string): string {
  const d = new Date(iso); const now = new Date();
  const same = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (same(d, now)) return "Today";
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (same(d, y)) return "Yesterday";
  return d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function DateSeparator({ label }: { label: string }) {
  return (
    <div className="my-4 flex justify-center">
      <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-foreground/55">
        {label}
      </span>
    </div>
  );
}

function EmptyChat({ ready }: { ready: boolean }) {
  return (
    <div className="flex h-full items-center justify-center text-center">
      <div className="px-8">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-primary/20 text-primary glow-primary">
          <LockMini big />
        </div>
        <p className="mt-4 text-[14px] font-semibold">Say hi 👋</p>
        <p className="mt-1 text-[12px] text-foreground/55">
          {ready ? "Messages, files & reactions are end-to-end encrypted." : "Setting up secure channel…"}
        </p>
      </div>
    </div>
  );
}

function TypingBubble({ name, color }: { name: string; color: string }) {
  return (
    <div className="mb-1 flex items-end gap-2">
      <Avatar name={name} color={color} size={24} />
      <div className="anim-msg-in inline-flex items-center gap-1 rounded-2xl rounded-bl-[6px] bg-bubble-theirs px-4 py-2.5">
        <span className="block h-1.5 w-1.5 rounded-full bg-foreground/60 typing-dot" />
        <span className="block h-1.5 w-1.5 rounded-full bg-foreground/60 typing-dot" style={{ animationDelay: "150ms" }} />
        <span className="block h-1.5 w-1.5 rounded-full bg-foreground/60 typing-dot" style={{ animationDelay: "300ms" }} />
      </div>
    </div>
  );
}

function Bubble({
  msg, mine, showTail, sharedKey, replyTarget,
  reactions, meId, pickerOpen, onTogglePicker, onReact, onReply, showReadCheck,
}: {
  msg: Message; mine: boolean; showTail: boolean; sharedKey: CryptoKey | null;
  replyTarget: Message | null;
  reactions: Reaction[]; meId?: string;
  pickerOpen: boolean;
  onTogglePicker: () => void;
  onReact: (emoji: string) => void;
  onReply: () => void;
  showReadCheck: boolean;
}) {
  const mineCls = "bg-bubble-mine text-bubble-mine-foreground rounded-[20px] rounded-br-[6px] glow-primary";
  const theirsCls = "bg-bubble-theirs text-bubble-theirs-foreground border border-white/5 rounded-[20px] rounded-bl-[6px]";

  // Aggregate reactions by emoji
  const agg = useMemo(() => {
    const m = new Map<string, { count: number; mine: boolean }>();
    for (const r of reactions) {
      const cur = m.get(r.emoji) ?? { count: 0, mine: false };
      cur.count++; if (r.user_id === meId) cur.mine = true;
      m.set(r.emoji, cur);
    }
    return Array.from(m.entries());
  }, [reactions, meId]);

  return (
    <div className={`group mb-1 flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className={`relative inline-block max-w-[80%] ${mine ? "items-end" : "items-start"}`}>
        <div className={`anim-msg-in inline-block px-3.5 py-2 text-[14.5px] leading-snug whitespace-pre-wrap break-words ${mine ? mineCls : theirsCls}`}>
          {replyTarget && (
            <div className={`mb-1.5 rounded-xl border-l-2 px-2 py-1 text-[12px] ${mine ? "border-white/60 bg-white/15" : "border-primary bg-primary/15"}`}>
              <div className={`text-[10px] font-semibold uppercase tracking-wide ${mine ? "text-white/80" : "text-primary"}`}>
                {replyTarget.sender_id === meId ? "You" : "Reply"}
              </div>
              <div className="truncate opacity-80">{replyTarget.attachment ? "📎 attachment" : replyTarget.text}</div>
            </div>
          )}
          {msg.attachment && <AttachmentView att={msg.attachment} sharedKey={sharedKey} mine={mine} />}
          {msg.text && <div>{msg.text}</div>}
          {showTail && (
            <span className={`mt-1 flex items-center gap-1 text-[10px] ${mine ? "text-bubble-mine-foreground/70" : "text-foreground/45"}`}>
              {msg.encrypted && <LockMini />}
              {formatChatTime(msg.created_at)}
              {mine && showReadCheck && <span className="ml-1">✓✓</span>}
              {mine && !showReadCheck && <span className="ml-1">✓</span>}
            </span>
          )}
        </div>

        {/* Reaction chips */}
        {agg.length > 0 && (
          <div className={`mt-1 flex flex-wrap gap-1 ${mine ? "justify-end" : "justify-start"}`}>
            {agg.map(([emoji, { count, mine: didMine }]) => (
              <button
                key={emoji} onClick={() => onReact(emoji)}
                className={`press flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] backdrop-blur-md ${
                  didMine ? "border-primary bg-primary/25 text-foreground" : "border-white/10 bg-white/5 text-foreground/80"
                }`}
              >
                <span>{emoji}</span>
                {count > 1 && <span className="font-semibold">{count}</span>}
              </button>
            ))}
          </div>
        )}

        {/* Action rail (always visible inline so it works on mobile too) */}
        <div className={`mt-1 flex items-center gap-1 opacity-60 ${mine ? "justify-end" : "justify-start"}`}>
          <button onClick={onReply} aria-label="Reply" className="press grid h-6 w-6 place-items-center rounded-full bg-white/5 hover:bg-white/10 text-foreground/70">
            <ReplyIcon />
          </button>
          <button onClick={onTogglePicker} aria-label="React" className="press grid h-6 w-6 place-items-center rounded-full bg-white/5 hover:bg-white/10 text-foreground/70">
            <SmileIcon />
          </button>
        </div>

        {pickerOpen && (
          <div className={`absolute z-10 mt-1 flex gap-1 rounded-full border border-white/10 bg-surface-elevated/95 px-2 py-1.5 shadow-xl backdrop-blur-xl ${mine ? "right-0" : "left-0"}`}>
            {REACTION_PALETTE.map((e) => (
              <button key={e} onClick={() => onReact(e)} className="press grid h-8 w-8 place-items-center rounded-full text-[18px] hover:bg-white/10">
                {e}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AttachmentView({
  att, sharedKey, mine,
}: { att: Attachment; sharedKey: CryptoKey | null; mine: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("attachment");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const isImage = att.mime.startsWith("image/");

  async function load() {
    if (!sharedKey || url) return;
    setLoading(true); setError(null);
    try {
      const parts = att.keyCiphertext.split(".");
      const wrappedCt = parts[0]; const wrappedNonce = parts[1] ?? att.keyNonce; const fileNonce = parts[2] ?? "";
      const fileKey = await unwrapFileKey(sharedKey, wrappedCt, wrappedNonce);
      const { data, error: dErr } = await supabase.storage.from("attachments").download(att.path);
      if (dErr) throw dErr;
      const ctBytes = await data.arrayBuffer();
      const plain = await decryptBytes(fileKey, ctBytes, fileNonce);
      setUrl(URL.createObjectURL(new Blob([plain], { type: att.mime })));
      if (att.nameCiphertext) {
        const [nCt, nNonce] = att.nameCiphertext.split(".");
        if (nCt && nNonce) { try { setFileName(await decryptText(sharedKey, nCt, nNonce)); } catch { /* */ } }
      }
    } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }

  useEffect(() => { if (isImage) void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [sharedKey]);

  if (error) {
    return <div className={`mb-1 text-[12px] ${mine ? "text-white/80" : "text-destructive"}`}>⚠️ {error}</div>;
  }
  if (isImage) {
    return url ? (
      <a href={url} download={fileName} className="block mb-1">
        <img src={url} alt={fileName} className="max-h-72 rounded-xl object-cover" />
      </a>
    ) : (
      <div className={`mb-1 h-40 w-56 rounded-xl ${mine ? "bg-white/15" : "bg-white/10"} animate-pulse`} />
    );
  }
  return (
    <div className={`mb-1 flex items-center gap-2 rounded-xl border p-2 pr-3 ${mine ? "border-white/30" : "border-white/10"}`}>
      <div className={`grid h-9 w-9 place-items-center rounded-lg ${mine ? "bg-white/15" : "bg-white/10"}`}>
        <FileIcon />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium">{fileName}</div>
        <div className={`text-[11px] ${mine ? "text-white/70" : "text-foreground/50"}`}>
          {(att.size / 1024).toFixed(0)} KB · encrypted
        </div>
      </div>
      {url ? (
        <a href={url} download={fileName} className="text-[12px] font-semibold underline">Open</a>
      ) : (
        <button type="button" onClick={load} disabled={loading} className="text-[12px] font-semibold underline disabled:opacity-50">
          {loading ? "…" : "Decrypt"}
        </button>
      )}
    </div>
  );
}

function ChevronLeft() { return (<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>); }
function LockMini({ big = false }: { big?: boolean } = {}) {
  const s = big ? 22 : 10;
  return (<svg width={s} height={s} viewBox="0 0 24 24" fill="none"><rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="2"/><path d="M8 11V8a4 4 0 018 0v3" stroke="currentColor" strokeWidth="2"/></svg>);
}
function SendIcon() { return (<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M5 12l14-7-5 14-2-6-7-1z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/></svg>); }
function PaperclipIcon() { return (<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M21 11l-9 9a5 5 0 01-7-7l9-9a3.5 3.5 0 015 5L9.5 18.5a2 2 0 01-3-3L15 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>); }
function FileIcon() { return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9l-6-6z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/><path d="M14 3v6h6" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/></svg>); }
function ReplyIcon() { return (<svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M9 14l-5-5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M4 9h11a5 5 0 015 5v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>); }
function SmileIcon() { return (<svg width="12" height="12" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8"/><path d="M8 14s1.5 2 4 2 4-2 4-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><circle cx="9" cy="10" r="0.8" fill="currentColor"/><circle cx="15" cy="10" r="0.8" fill="currentColor"/></svg>); }
function CloseMini() { return (<svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>); }
