import { Link } from "@tanstack/react-router";

type TabKey = "chats" | "new" | "me";

export function AppTabBar({ active }: { active: TabKey }) {
  return (
    <nav
      aria-label="Main navigation"
      className="sticky bottom-0 z-20 border-t border-black/[0.08] bg-panel/95 px-4 pt-2 backdrop-blur-xl"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 10px)" }}
    >
      <div className="grid h-14 grid-cols-3 items-center gap-2">
        <TabLink to="/chats" label="Chats" active={active === "chats"} icon={<ChatsIcon />} />
        <TabLink to="/new-chat" label="New" active={active === "new"} icon={<NewIcon />} />
        <TabLink to="/me" label="You" active={active === "me"} icon={<UserIcon />} />
      </div>
    </nav>
  );
}

function TabLink({
  to,
  label,
  active,
  icon,
}: {
  to: "/chats" | "/new-chat" | "/me";
  label: string;
  active: boolean;
  icon: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      aria-current={active ? "page" : undefined}
      className={`press flex h-12 min-w-0 flex-col items-center justify-center gap-0.5 rounded-2xl text-[11px] font-semibold transition ${
        active
          ? "bg-primary text-primary-foreground"
          : "text-panel-foreground/55 hover:bg-black/[0.04]"
      }`}
    >
      {icon}
      <span className="truncate">{label}</span>
    </Link>
  );
}

function ChatsIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 7.5A4.5 4.5 0 0 1 9.5 3h5A4.5 4.5 0 0 1 19 7.5v4A4.5 4.5 0 0 1 14.5 16h-3.2L7 20v-4.25a4.5 4.5 0 0 1-2-3.75v-4.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M9 8h6M9 11.5h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function NewIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 8v8M8 12h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="8.5" r="3.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M5 20c1.2-4 3.7-6 7-6s5.8 2 7 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}