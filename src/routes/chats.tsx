import { createFileRoute } from "@tanstack/react-router";
import { PhoneFrame } from "@/components/PhoneFrame";
import { Avatar } from "@/components/Avatar";
import { CHATS, PINNED, type ChatPreview } from "@/lib/mock-data";

export const Route = createFileRoute("/chats")({
  head: () => ({ meta: [{ title: "Chats — Univers." }] }),
  component: ChatsPage,
});

function ChatsPage() {
  const unreadCount = CHATS.reduce((n, c) => n + (c.unread > 0 ? 1 : 0), 0);
  const encryptedCount = CHATS.length;

  return (
    <PhoneFrame>
      {/* Header */}
      <header className="px-4 pt-4 pb-3">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="wordmark text-[30px] text-foreground">
              Univers<span className="text-primary">.</span>
            </h1>
            <p className="mt-1 text-[12px] text-text-tertiary">
              {encryptedCount} encrypted conversations
              {unreadCount > 0 ? ` · ${unreadCount} unread` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <IconBtn label="Search">
              <SearchIcon />
            </IconBtn>
            <IconBtn label="Compose">
              <ComposeIcon />
            </IconBtn>
          </div>
        </div>
      </header>

      {/* Pinned */}
      <section className="pt-2">
        <SectionLabel className="px-4">Pinned</SectionLabel>
        <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto px-4 pb-1">
          {PINNED.map((p) => (
            <div
              key={p.id}
              className="press flex w-[88px] shrink-0 flex-col items-center gap-2 rounded-[20px] border bg-accent/40 px-2 py-3"
              style={{
                borderColor: "color-mix(in oklab, var(--primary) 25%, transparent)",
              }}
            >
              <Avatar
                initials={p.initials}
                color={p.color}
                size={44}
                radius={14}
                online={p.online}
              />
              <span className="truncate w-full text-center text-[11px] font-medium text-text-secondary">
                {p.name}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Recent */}
      <section className="mt-5 flex-1 flex flex-col">
        <SectionLabel className="px-4">Recent</SectionLabel>
        <ul className="mt-1 flex-1 overflow-y-auto">
          {CHATS.map((chat) => (
            <ChatRow key={chat.id} chat={chat} />
          ))}
          <li className="py-6 text-center text-[11px] text-text-tertiary flex items-center justify-center gap-1.5">
            <LockMini /> all chats end-to-end encrypted
          </li>
        </ul>
      </section>

      {/* FAB */}
      <button
        className="press absolute right-5 bottom-24 z-10 grid h-[56px] w-[56px] place-items-center rounded-[20px] bg-primary text-primary-foreground glow-violet"
        aria-label="New message"
      >
        <PencilPlusIcon />
      </button>

      {/* Bottom Tab Bar */}
      <nav
        className="hairline-t mt-auto flex items-center justify-around bg-background/95 backdrop-blur-xl px-2"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 8px)" }}
      >
        <TabItem active label="Chats" icon={<ChatIcon />} />
        <TabItem label="Calls" icon={<PhoneIcon />} />
        <TabItem label="Tools" icon={<ToolsIcon />} />
        <TabItem label="You" icon={<UserIcon />} />
      </nav>
    </PhoneFrame>
  );
}

/* ---------------- Row ---------------- */

function ChatRow({ chat }: { chat: ChatPreview }) {
  const { contact, lastMessage, time, unread, isTyping, lastMessageKind } = chat;

  return (
    <li className="hairline-b">
      <button className="press flex w-full items-center gap-3 px-4 py-3 text-left">
        <Avatar
          initials={contact.initials}
          color={contact.color}
          size={48}
          radius={16}
          online={contact.online}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[14.5px] font-semibold text-foreground tracking-tight">
              {contact.name}
            </span>
            <span className="shrink-0 text-[11px] text-text-tertiary">{time}</span>
          </div>
          <div className="mt-0.5 flex items-center justify-between gap-2">
            <span
              className={`truncate text-[13px] ${
                isTyping
                  ? "text-primary-soft italic"
                  : lastMessageKind === "missed-call"
                    ? "text-destructive"
                    : "text-text-secondary"
              } flex items-center gap-1.5`}
            >
              {lastMessageKind === "voice" && <MicMini />}
              {lastMessageKind === "file" && <ClipMini />}
              {lastMessageKind === "missed-call" && <MissedCallMini />}
              {lastMessage}
            </span>
            {unread > 0 ? (
              <span className="grid min-w-[20px] h-[20px] place-items-center rounded-[7px] bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
                {unread}
              </span>
            ) : null}
          </div>
        </div>
      </button>
    </li>
  );
}

/* ---------------- Reusable bits ---------------- */

function SectionLabel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`text-[11px] font-medium uppercase tracking-[0.16em] text-text-tertiary ${className}`}
    >
      {children}
    </span>
  );
}

function IconBtn({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <button
      aria-label={label}
      className="press grid h-9 w-9 place-items-center rounded-xl bg-white/[0.05] text-foreground hover:bg-white/[0.08] transition"
    >
      {children}
    </button>
  );
}

function TabItem({
  label,
  icon,
  active = false,
}: {
  label: string;
  icon: React.ReactNode;
  active?: boolean;
}) {
  return (
    <button
      className={`press flex flex-1 flex-col items-center gap-1 py-2.5 ${
        active ? "text-primary" : "text-white/25"
      }`}
    >
      <span className="grid h-6 w-6 place-items-center">{icon}</span>
      <span className="text-[10px] font-medium tracking-tight">{label}</span>
    </button>
  );
}

/* ---------------- Icons (inline SVG) ---------------- */

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M16 16l4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
function ComposeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path
        d="M4 20h4l10-10-4-4L4 16v4z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M14 6l4 4" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}
function PencilPlusIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path
        d="M4 20h4l10-10-4-4L4 16v4z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function ChatIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path
        d="M5 5h14a1 1 0 011 1v9a1 1 0 01-1 1h-7l-4 3v-3H5a1 1 0 01-1-1V6a1 1 0 011-1z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function PhoneIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path
        d="M5 4h3l2 5-2 1a11 11 0 005 5l1-2 5 2v3a2 2 0 01-2 2A15 15 0 013 6a2 2 0 012-2z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function ToolsIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path
        d="M14 4l6 6-3 3-3-3-6 6-3-3 6-6-3-3 3-3 3 3z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function UserIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M4 20c1.5-4 5-5 8-5s6.5 1 8 5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
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
function MicMini() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
      <rect x="9" y="3" width="6" height="12" rx="3" stroke="currentColor" strokeWidth="1.8" />
      <path d="M5 11a7 7 0 0014 0M12 18v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
function ClipMini() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
      <path
        d="M21 11l-8.5 8.5a5 5 0 11-7-7L14 4a3.5 3.5 0 015 5l-8.5 8.5a2 2 0 11-3-3L15 7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function MissedCallMini() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
      <path d="M16 8l-5 5-3-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 17a18 18 0 0118 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
