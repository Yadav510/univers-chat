import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { Avatar } from "@/components/Avatar";
import { AppTabBar } from "@/components/AppTabBar";
import { toast } from "sonner";

export const Route = createFileRoute("/me")({
  head: () => ({ meta: [{ title: "You — Univers." }] }),
  component: MePage,
});

function MePage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/", replace: true });
  }, [loading, user, navigate]);

  const { data: profile } = useQuery({
    enabled: !!user,
    queryKey: ["me-profile", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, display_name, bio, avatar_color, created_at")
        .eq("id", user!.id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error(error.message);
      return;
    }
    navigate({ to: "/", replace: true });
  }

  return (
    <div className="min-h-dvh w-full bg-background flex justify-center">
      <div
        className="relative w-full max-w-[420px] min-h-dvh flex flex-col"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <header className="flex items-center gap-3 px-3 py-2.5 text-foreground">
          <Link
            to="/chats"
            className="press flex h-9 w-9 items-center justify-center rounded-full bg-white/10"
            aria-label="Back"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
          <h1 className="text-[17px] font-semibold">You</h1>
        </header>

        {/* Identity card */}
        <div className="flex flex-col items-center px-6 pt-6 pb-8 text-foreground">
          {profile ? (
            <Avatar name={profile.display_name} color={profile.avatar_color} size={96} ring="mint" />
          ) : (
            <div className="h-24 w-24 rounded-full bg-white/10" />
          )}
          <h2 className="mt-4 text-[22px] font-bold tracking-tight">
            {profile?.display_name ?? "…"}
          </h2>
          <p className="mt-0.5 text-[13px] text-white/55">
            @{profile?.username ?? "…"}
          </p>
          {profile?.bio && (
            <p className="mt-3 max-w-[280px] text-center text-[13px] text-white/70">
              {profile.bio}
            </p>
          )}
        </div>

        {/* Cream panel with settings */}
        <section className="flex flex-1 flex-col rounded-t-[28px] bg-panel text-panel-foreground" style={{ boxShadow: "var(--shadow-panel)" }}>
          <div className="px-5 py-5">
            <SectionLabel>Account</SectionLabel>
            <SettingsCard>
              <Row label="Email" value={user?.email ?? "—"} />
              <Row label="Member since" value={profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : "—"} />
            </SettingsCard>

            <button
              onClick={signOut}
              className="press mt-6 h-12 w-full rounded-2xl bg-destructive/10 text-[14px] font-semibold text-destructive transition"
            >
              Sign out
            </button>

            <p className="mt-5 text-center text-[11px] text-panel-foreground/45">
              Univers. · Private messaging
            </p>
          </div>
          <div className="mt-auto">
            <AppTabBar active="me" />
          </div>
        </section>
      </div>
    </div>
  );
}

function SectionLabel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`text-[11px] font-semibold uppercase tracking-[0.16em] text-panel-foreground/45 ${className}`}>
      {children}
    </span>
  );
}

function SettingsCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-2 overflow-hidden rounded-2xl border border-black/[0.06] bg-white">
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="hairline-b flex items-center justify-between px-4 py-3.5 last:border-b-0">
      <span className="text-[13.5px] text-panel-foreground/65">{label}</span>
      <span className="truncate text-[13.5px] font-medium text-panel-foreground max-w-[60%]">{value}</span>
    </div>
  );
}

