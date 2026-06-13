
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS public_key TEXT;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS ciphertext TEXT;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS nonce TEXT;
ALTER TABLE public.messages ALTER COLUMN body DROP NOT NULL;

DROP FUNCTION IF EXISTS public.list_my_chats();

CREATE FUNCTION public.list_my_chats()
RETURNS TABLE(
  chat_id uuid, is_group boolean, last_message_at timestamptz,
  other_user_id uuid, other_username text, other_display_name text,
  other_avatar_color text, other_last_seen_at timestamptz, other_public_key text,
  last_message_body text, last_message_ciphertext text, last_message_nonce text,
  last_message_sender uuid, last_message_created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH me_chats AS (
    SELECT c.id, c.is_group, c.last_message_at
    FROM public.chats c
    JOIN public.chat_members m ON m.chat_id = c.id
    WHERE m.user_id = auth.uid()
  ),
  others AS (
    SELECT mc.id AS chat_id, p.id AS other_user_id, p.username, p.display_name,
           p.avatar_color, p.last_seen_at, p.public_key
    FROM me_chats mc
    JOIN public.chat_members om ON om.chat_id = mc.id AND om.user_id <> auth.uid()
    JOIN public.profiles p ON p.id = om.user_id
  ),
  last_msgs AS (
    SELECT DISTINCT ON (chat_id) chat_id, body, ciphertext, nonce, sender_id, created_at
    FROM public.messages
    WHERE chat_id IN (SELECT id FROM me_chats)
    ORDER BY chat_id, created_at DESC
  )
  SELECT
    mc.id, mc.is_group, mc.last_message_at,
    o.other_user_id, o.username, o.display_name, o.avatar_color, o.last_seen_at, o.public_key,
    lm.body, lm.ciphertext, lm.nonce, lm.sender_id, lm.created_at
  FROM me_chats mc
  LEFT JOIN others o ON o.chat_id = mc.id
  LEFT JOIN last_msgs lm ON lm.chat_id = mc.id
  ORDER BY mc.last_message_at DESC;
$$;
