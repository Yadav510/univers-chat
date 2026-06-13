
-- ============================================================
-- PROFILES
-- ============================================================
CREATE TABLE public.profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username      TEXT NOT NULL UNIQUE CHECK (char_length(username) BETWEEN 3 AND 24 AND username ~ '^[a-zA-Z0-9_]+$'),
  display_name  TEXT NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 60),
  bio           TEXT CHECK (bio IS NULL OR char_length(bio) <= 160),
  avatar_color  TEXT NOT NULL DEFAULT '#2DE682',
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX profiles_username_lower_idx ON public.profiles (lower(username));

GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read all profiles"
  ON public.profiles FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- ============================================================
-- CHATS
-- ============================================================
CREATE TABLE public.chats (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  is_group        BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.chats TO authenticated;
GRANT ALL ON public.chats TO service_role;
ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- CHAT MEMBERS
-- ============================================================
CREATE TABLE public.chat_members (
  chat_id   UUID NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (chat_id, user_id)
);
CREATE INDEX chat_members_user_idx ON public.chat_members(user_id);

GRANT SELECT, INSERT, DELETE ON public.chat_members TO authenticated;
GRANT ALL ON public.chat_members TO service_role;
ALTER TABLE public.chat_members ENABLE ROW LEVEL SECURITY;

-- Security definer helper so RLS policies don't recursively self-query
CREATE OR REPLACE FUNCTION public.is_chat_member(_chat_id UUID, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_members
    WHERE chat_id = _chat_id AND user_id = _user_id
  );
$$;

CREATE POLICY "Members can view their chats"
  ON public.chats FOR SELECT TO authenticated
  USING (public.is_chat_member(id, auth.uid()));

CREATE POLICY "Authenticated users can create chats"
  ON public.chats FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Members can view chat membership"
  ON public.chat_members FOR SELECT TO authenticated
  USING (public.is_chat_member(chat_id, auth.uid()));

CREATE POLICY "Users can add themselves as chat members"
  ON public.chat_members FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- ============================================================
-- MESSAGES
-- ============================================================
CREATE TABLE public.messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id    UUID NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  sender_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body       TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX messages_chat_created_idx ON public.messages(chat_id, created_at DESC);

GRANT SELECT, INSERT ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read messages in their chats"
  ON public.messages FOR SELECT TO authenticated
  USING (public.is_chat_member(chat_id, auth.uid()));

CREATE POLICY "Members can send messages in their chats"
  ON public.messages FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid() AND public.is_chat_member(chat_id, auth.uid()));

-- Bump chats.last_message_at on new message
CREATE OR REPLACE FUNCTION public.touch_chat_last_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.chats SET last_message_at = NEW.created_at WHERE id = NEW.chat_id;
  RETURN NEW;
END; $$;

CREATE TRIGGER messages_touch_chat
AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.touch_chat_last_message();

-- ============================================================
-- Auto-create profile on signup using user_metadata
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_username     TEXT;
  v_display_name TEXT;
  v_bio          TEXT;
  v_color        TEXT;
BEGIN
  v_username     := COALESCE(NEW.raw_user_meta_data->>'username', 'user_' || substr(replace(NEW.id::text, '-', ''), 1, 8));
  v_display_name := COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1));
  v_bio          := NEW.raw_user_meta_data->>'bio';
  v_color        := COALESCE(NEW.raw_user_meta_data->>'avatar_color', '#2DE682');

  INSERT INTO public.profiles (id, username, display_name, bio, avatar_color)
  VALUES (NEW.id, v_username, v_display_name, v_bio, v_color)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- get_or_create_direct_chat(other_user_id)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_or_create_direct_chat(_other_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me   UUID := auth.uid();
  v_chat UUID;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF v_me = _other_user_id THEN RAISE EXCEPTION 'Cannot chat with yourself'; END IF;

  SELECT c.id INTO v_chat
  FROM public.chats c
  JOIN public.chat_members m1 ON m1.chat_id = c.id AND m1.user_id = v_me
  JOIN public.chat_members m2 ON m2.chat_id = c.id AND m2.user_id = _other_user_id
  WHERE c.is_group = false
  LIMIT 1;

  IF v_chat IS NOT NULL THEN RETURN v_chat; END IF;

  INSERT INTO public.chats (is_group) VALUES (false) RETURNING id INTO v_chat;
  INSERT INTO public.chat_members (chat_id, user_id) VALUES (v_chat, v_me), (v_chat, _other_user_id);
  RETURN v_chat;
END; $$;

GRANT EXECUTE ON FUNCTION public.get_or_create_direct_chat(UUID) TO authenticated;

-- ============================================================
-- list_my_chats() — chat list with other-member info + last message
-- ============================================================
CREATE OR REPLACE FUNCTION public.list_my_chats()
RETURNS TABLE (
  chat_id            UUID,
  is_group           BOOLEAN,
  last_message_at    TIMESTAMPTZ,
  other_user_id      UUID,
  other_username     TEXT,
  other_display_name TEXT,
  other_avatar_color TEXT,
  other_last_seen_at TIMESTAMPTZ,
  last_message_body  TEXT,
  last_message_sender UUID,
  last_message_created_at TIMESTAMPTZ
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me_chats AS (
    SELECT c.id, c.is_group, c.last_message_at
    FROM public.chats c
    JOIN public.chat_members m ON m.chat_id = c.id
    WHERE m.user_id = auth.uid()
  ),
  others AS (
    SELECT mc.id AS chat_id, p.id AS other_user_id, p.username, p.display_name, p.avatar_color, p.last_seen_at
    FROM me_chats mc
    JOIN public.chat_members om ON om.chat_id = mc.id AND om.user_id <> auth.uid()
    JOIN public.profiles p ON p.id = om.user_id
  ),
  last_msgs AS (
    SELECT DISTINCT ON (chat_id) chat_id, body, sender_id, created_at
    FROM public.messages
    WHERE chat_id IN (SELECT id FROM me_chats)
    ORDER BY chat_id, created_at DESC
  )
  SELECT
    mc.id, mc.is_group, mc.last_message_at,
    o.other_user_id, o.username, o.display_name, o.avatar_color, o.last_seen_at,
    lm.body, lm.sender_id, lm.created_at
  FROM me_chats mc
  LEFT JOIN others o ON o.chat_id = mc.id
  LEFT JOIN last_msgs lm ON lm.chat_id = mc.id
  ORDER BY mc.last_message_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.list_my_chats() TO authenticated;

-- ============================================================
-- Realtime
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chats;
