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

type RawMessage = {
  id: string;
  chat_id: string;
  sender_id: string;
  body: string | null;
  ciphertext: string | null;
  nonce: string | null;
  created_at: string;
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
  attachment: Attachment | null;
};

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
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/", replace: true });
  }, [authLoading, user, navigate]);

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
        .select("id, display_name, username, avatar_color, public_key")
        .eq("id", otherId)
        .single();
      if (pErr) throw pErr;
      return {
        user_id: prof.id,
        display_name: prof.display_name,
        username: prof.username,
        avatar_color: prof.avatar_color,
        public_key: prof.public_key,
      };
    },
  });

  const [sharedKey, setSharedKey] = useState<CryptoKey | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!privateKey || !other?.public_key) {
        setSharedKey(null);
        return;
      }
      try {
        const pub = await importPublicKey(other.public_key);
        const key = await deriveSharedKey(privateKey, pub);
        if (!cancelled) setSharedKey(key);
      } catch (err) {
        console.error("[e2ee] failed to derive shared key", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [privateKey, other?.public_key]);

  const { data: rawMessages = [] } = useQuery({
    enabled: !!user,
    queryKey: ["messages", chatId],
    queryFn: async (): Promise<RawMessage[]> => {
      const { data, error } = await supabase
        .from("messages")
        .select(
          "id, chat_id, sender_id, body, ciphertext, nonce, created_at, attachment_path, attachment_mime, attachment_size, attachment_name_ciphertext, attachment_key_ciphertext, attachment_key_nonce",
        )
        .eq("chat_id", chatId)
        .order("created_at", { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as RawMessage[];
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
          try {
            text = await decryptText(sharedKey, m.ciphertext, m.nonce);
            encrypted = true;
          } catch {
            text = "🔒 Encrypted message";
          }
        } else if (m.ciphertext && !sharedKey) {
          text = "🔒 Encrypted message";
        }
        const attachment: Attachment | null =
          m.attachment_path && m.attachment_mime && m.attachment_key_ciphertext && m.attachment_key_nonce
            ? {
                path: m.attachment_path,
                mime: m.attachment_mime,
                size: m.attachment_size ?? 0,
                nameCiphertext: m.attachment_name_ciphertext,
                keyCiphertext: m.attachment_key_ciphertext,
                keyNonce: m.attachment_key_nonce,
              }
            : null;
        out.push({
          id: m.id,
          chat_id: m.chat_id,
          sender_id: m.sender_id,
          text,
          created_at: m.created_at,
          encrypted: encrypted || !!attachment,
          attachment,
        });
      }
      if (!cancelled) setMessages(out);
    })();
    return () => {
      cancelled = true;
    };
  }, [rawMessages, sharedKey]);

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`chat:${chatId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `chat_id=eq.${chatId}` },
        async (payload) => {
          const msg = payload.new as RawMessage;
          queryClient.setQueryData<RawMessage[]>(["messages", chatId], (prev = []) => {
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
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
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [chatId, user, other, sharedKey, queryClient, navigate]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const items = useMemo(() => groupForRender(messages), [messages]);

  async function sendText(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || sending || !user) return;
    setSending(true);
    setDraft("");
    try {
      if (!sharedKey) {
        toast.error("Secure channel not ready yet — try again in a moment.");
        setDraft(body);
        return;
      }
      const { ciphertext, nonce } = await encryptText(sharedKey, body);
      const { error } = await supabase.from("messages").insert({
        chat_id: chatId,
        sender_id: user.id,
        body: null,
        ciphertext,
        nonce,
      });
      if (error) {
        toast.error("Couldn't send: " + error.message);
        setDraft(body);
      }
    } finally {
      setSending(false);
    }
  }

  async function sendFile(file: File) {
    if (!user || !sharedKey) {
      toast.error("Secure channel not ready yet.");
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      toast.error("Max file size is 25MB.");
      return;
    }
    const toastId = toast.loading(`Encrypting ${file.name}…`);
    try {
      const bytes = await file.arrayBuffer();
      const fileKey = await generateFileKey();
      const { ciphertext, nonce } = await encryptBytes(fileKey, bytes);
      const wrapped = await wrapFileKey(sharedKey, fileKey);
      const nameEnc = await encryptText(sharedKey, file.name);

      const path = `${user.id}/${crypto.randomUUID()}.bin`;
      const ctBlob = new Blob([ciphertext], { type: "application/octet-stream" });
      const { error: upErr } = await supabase.storage
        .from("attachments")
        .upload(path, ctBlob, { contentType: "application/octet-stream" });
      if (upErr) throw upErr;

      const { error: mErr } = await supabase.from("messages").insert({
        chat_id: chatId,
        sender_id: user.id,
        body: null,
        ciphertext: nonce, // store file-bytes nonce in `nonce`? No — keep separate.
        nonce: null,
        attachment_path: path,
        attachment_mime: file.type || "application/octet-stream",
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

  const e2eeReady = !!sharedKey;

  return (
    <div className="min-h-dvh w-full bg-background flex justify-center">
      <div
        className="relative w-full max-w-[420px] min-h-dvh flex flex-col bg-panel text-panel-foreground"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <header className="hairline-b flex items-center gap-3 bg-panel px-3 py-2.5">
          <Link to="/chats" className="press flex h-9 w-9 items-center justify-center rounded-full" aria-label="Back">
            <ChevronLeft />
          </Link>
          {other ? (
            <>
              <Avatar name={other.display_name} color={other.avatar_color} size={40} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-semibold">{other.display_name}</div>
                <div className="flex items-center gap-1 text-[11px] text-panel-foreground/55">
                  <LockMini />
                  <span>{e2eeReady ? "end-to-end encrypted" : "establishing secure channel…"}</span>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 text-[14px] text-panel-foreground/55">Loading…</div>
          )}
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4" style={{ scrollBehavior: "smooth" }}>
          {items.length === 0 ? (
            <div className="flex h-full items-center justify-center text-center">
              <div className="px-8">
                <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary/15 text-primary">
                  <LockMini />
                </div>
                <p className="mt-3 text-[13px] text-panel-foreground/60">No messages yet. Say hi 👋</p>
                <p className="mt-1 text-[11px] text-panel-foreground/40">
                  {e2eeReady ? "Messages and files are end-to-end encrypted." : "Setting up secure channel…"}
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
                  sharedKey={sharedKey}
                />
              ),
            )
          )}
        </div>

        <form
          onSubmit={sendText}
          className="hairline-b sticky bottom-0 flex items-end gap-2 bg-panel px-3 py-2.5"
          style={{ paddingBottom: "max(env(safe-area-inset-bottom), 10px)" }}
        >
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void sendFile(f);
              e.currentTarget.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Attach file"
            disabled={!e2eeReady}
            className="press grid h-11 w-11 shrink-0 place-items-center rounded-full border border-black/10 bg-white text-panel-foreground disabled:opacity-40"
          >
            <PaperclipIcon />
          </button>
          <div className="flex flex-1 items-end gap-2 rounded-[22px] border border-black/10 bg-white px-3 py-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void sendText(e);
                }
              }}
              placeholder={other ? `Message ${other.display_name.split(" ")[0]}…` : "Message…"}
              rows={1}
              className="max-h-32 min-h-[24px] flex-1 resize-none bg-transparent text-[14.5px] leading-snug placeholder:text-panel-foreground/35 focus:outline-none"
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

type RenderItem = { kind: "date"; label: string } | { kind: "msg"; msg: Message; showTail: boolean };

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
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (same(d, now)) return "Today";
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (same(d, y)) return "Yesterday";
  return d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function DateSeparator({ label }: { label: string }) {
  return (
    <div className="my-3 flex justify-center">
      <span className="rounded-full bg-black/[0.06] px-3 py-1 text-[11px] font-medium text-panel-foreground/55">{label}</span>
    </div>
  );
}

function Bubble({
  msg, mine, showTail, sharedKey,
}: { msg: Message; mine: boolean; showTail: boolean; sharedKey: CryptoKey | null }) {
  const mineCls = "bg-primary text-primary-foreground rounded-[20px] rounded-br-[6px]";
  const theirsCls = "bg-white text-panel-foreground border border-black/5 rounded-[20px] rounded-bl-[6px]";
  return (
    <div className={`mb-1 flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className={`anim-msg-in inline-block max-w-[78%] px-3.5 py-2 text-[14.5px] leading-snug whitespace-pre-wrap break-words ${mine ? mineCls : theirsCls}`}>
        {msg.attachment && <AttachmentView att={msg.attachment} sharedKey={sharedKey} mine={mine} />}
        {msg.text && <div>{msg.text}</div>}
        {showTail && (
          <span className={`mt-1 flex items-center gap-1 text-[10px] ${mine ? "text-primary-foreground/70" : "text-panel-foreground/45"}`}>
            {msg.encrypted && <LockMini />}
            {formatChatTime(msg.created_at)}
          </span>
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
    setLoading(true);
    setError(null);
    try {
      // attachment_key_ciphertext is packed as "<wrappedCt>.<wrappedNonce>.<fileNonce>"
      const parts = att.keyCiphertext.split(".");
      const wrappedCt = parts[0];
      const wrappedNonce = parts[1] ?? att.keyNonce;
      const fileNonce = parts[2] ?? "";
      const fileKey = await unwrapFileKey(sharedKey, wrappedCt, wrappedNonce);

      const { data, error: dErr } = await supabase.storage.from("attachments").download(att.path);
      if (dErr) throw dErr;
      const ctBytes = await data.arrayBuffer();
      const plain = await decryptBytes(fileKey, ctBytes, fileNonce);
      const blob = new Blob([plain], { type: att.mime });
      setUrl(URL.createObjectURL(blob));

      if (att.nameCiphertext) {
        const [nCt, nNonce] = att.nameCiphertext.split(".");
        if (nCt && nNonce) {
          try { setFileName(await decryptText(sharedKey, nCt, nNonce)); } catch { /* */ }
        }
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (isImage) void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [sharedKey]);

  if (error) {
    return <div className={`mb-1 text-[12px] ${mine ? "text-primary-foreground/80" : "text-red-600"}`}>⚠️ {error}</div>;
  }

  if (isImage) {
    return url ? (
      <a href={url} download={fileName} className="block mb-1">
        <img src={url} alt={fileName} className="max-h-72 rounded-xl object-cover" />
      </a>
    ) : (
      <div className={`mb-1 h-40 w-56 rounded-xl ${mine ? "bg-primary-foreground/15" : "bg-black/5"} animate-pulse`} />
    );
  }

  return (
    <div className={`mb-1 flex items-center gap-2 rounded-xl border ${mine ? "border-primary-foreground/30" : "border-black/10"} p-2 pr-3`}>
      <div className={`grid h-9 w-9 place-items-center rounded-lg ${mine ? "bg-primary-foreground/15" : "bg-black/[0.06]"}`}>
        <FileIcon />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium">{fileName}</div>
        <div className={`text-[11px] ${mine ? "text-primary-foreground/70" : "text-panel-foreground/50"}`}>
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
function LockMini() { return (<svg width="10" height="10" viewBox="0 0 24 24" fill="none"><rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="2"/><path d="M8 11V8a4 4 0 018 0v3" stroke="currentColor" strokeWidth="2"/></svg>); }
function SendIcon() { return (<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M5 12l14-7-5 14-2-6-7-1z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/></svg>); }
function PaperclipIcon() { return (<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M21 11l-9 9a5 5 0 01-7-7l9-9a3.5 3.5 0 015 5L9.5 18.5a2 2 0 01-3-3L15 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>); }
function FileIcon() { return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9l-6-6z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/><path d="M14 3v6h6" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/></svg>); }
