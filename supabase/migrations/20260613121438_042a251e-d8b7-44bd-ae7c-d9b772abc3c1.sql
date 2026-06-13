
-- 1) Lock down direct INSERTs into chats and chat_members.
-- All chat/member creation must go through the SECURITY DEFINER RPC
-- get_or_create_direct_chat which performs proper authorization.
DROP POLICY IF EXISTS "Authenticated users can create chats" ON public.chats;
DROP POLICY IF EXISTS "Users can add themselves as chat members" ON public.chat_members;

-- 2) Restrict profile column visibility.
-- Keep row-level read access for search/listings, but hide sensitive
-- columns (bio, last_seen_at) from other users via column-level grants.
REVOKE SELECT ON public.profiles FROM anon, authenticated;
GRANT SELECT (id, username, display_name, avatar_color, public_key, created_at)
  ON public.profiles TO authenticated;

-- Owner-only access to private columns via SECURITY DEFINER RPC.
CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS public.profiles
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.profiles WHERE id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.get_my_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;

-- 3) Tighten EXECUTE on SECURITY DEFINER RPCs: revoke from anon.
REVOKE ALL ON FUNCTION public.get_or_create_direct_chat(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_or_create_direct_chat(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.list_my_chats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_chats() TO authenticated;

REVOKE ALL ON FUNCTION public.is_chat_member(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- 4) Realtime: deny Broadcast/Presence channel access entirely.
-- The app only uses postgres_changes which enforce RLS on the source
-- tables (messages, chats) directly — broadcast/presence are unused,
-- so block any attempt to subscribe to arbitrary channel topics.
DROP POLICY IF EXISTS "deny realtime channel reads" ON realtime.messages;
CREATE POLICY "deny realtime channel reads"
  ON realtime.messages FOR SELECT
  TO authenticated, anon
  USING (false);

DROP POLICY IF EXISTS "deny realtime channel writes" ON realtime.messages;
CREATE POLICY "deny realtime channel writes"
  ON realtime.messages FOR INSERT
  TO authenticated, anon
  WITH CHECK (false);
