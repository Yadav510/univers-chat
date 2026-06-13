import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { Avatar } from "@/components/Avatar";
import { AppTabBar } from "@/components/AppTabBar";
import { toast } from "sonner";

export const Route = createFileRoute("/new-chat")({
  head: () => ({ meta: [{ title: "New chat — Univers." }] }),
  component: NewChatPage,
});

type Profile = {
  id: string;
  username: string;
  display_name: string;
  avatar_color: string;
};

function NewChatPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [starting, setStarting] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/", replace: true });
  }, [loading, user, navigate]);

  const { data: results = [], isFetching } = useQuery({
    enabled: !!user && q.trim().length > 0,
    queryKey: ["user-search", q, user?.id],
    queryFn: async (): Promise<Profile[]> => {
      const term = q.trim().replace(/[%_]/g, "");
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_color")
        .or(`username.ilike.%${term}%,display_name.ilike.%${term}%`)
        .neq("id", user!.id)
        .order("username")
        .limit(25);
      if (error) throw error;
      return data ?? [];
    },
  });

  async function startChat(otherId: string) {
    if (starting) return;
    setStarting(otherId);
    const { data, error } = await supabase.rpc("get_or_create_direct_chat", {
      _other_user_id: otherId,
    });
    setStarting(null);
    if (error || !data) {
      toast.error(error?.message ?? "Could not start chat");
      return;
    }
    navigate({ to: "/chat/$chatId", params: { chatId: data as string }, replace: true });
  }

  return (
    <div className="min-h-dvh w-full bg-background flex justify-center">
      <div
        className="relative w-full max-w-[420px] min-h-dvh flex flex-col bg-panel text-panel-foreground"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <header className="hairline-b flex items-center gap-3 px-3 py-2.5">
          <Link
            to="/chats"
            className="press flex h-9 w-9 items-center justify-center rounded-full"
            aria-label="Back"
          >
            <ChevronLeft />
          </Link>
          <h1 className="text-[17px] font-semibold">New chat</h1>
        </header>

        <div className="px-4 pt-3">
          <div className="flex h-12 items-center gap-2 rounded-2xl border border-black/10 bg-white px-3.5">
            <SearchIcon />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by username or name"
              className="flex-1 bg-transparent text-[14.5px] text-panel-foreground placeholder:text-panel-foreground/40 focus:outline-none"
            />
            {q && (
              <button
                onClick={() => setQ("")}
                className="press text-panel-foreground/40"
                aria-label="Clear"
              >
                <CloseIcon />
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pt-4">
          {q.trim().length === 0 ? (
            <Hint>Type a username or name to find people.</Hint>
          ) : isFetching ? (
            <Hint>Searching…</Hint>
          ) : results.length === 0 ? (
            <Hint>No one matches “{q.trim()}”. Have your friend sign up and try again.</Hint>
          ) : (
            <ul>
              {results.map((p) => (
                <li key={p.id} className="hairline-b">
                  <button
                    disabled={starting === p.id}
                    onClick={() => startChat(p.id)}
                    className="press flex w-full items-center gap-3 px-5 py-3 text-left"
                  >
                    <Avatar name={p.display_name} color={p.avatar_color} size={46} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[15px] font-semibold">{p.display_name}</div>
                      <div className="truncate text-[12.5px] text-panel-foreground/55">
                        @{p.username}
                      </div>
                    </div>
                    <span className="rounded-full bg-primary/15 px-3 py-1 text-[12px] font-semibold text-primary-deep">
                      {starting === p.id ? "…" : "Chat"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <AppTabBar active="new" />
      </div>
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-8 py-10 text-center text-[13px] text-panel-foreground/55">
      {children}
    </div>
  );
}

function ChevronLeft() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M16 16l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M6 6l12 12M6 18L18 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
