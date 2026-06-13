
DROP FUNCTION IF EXISTS public.list_my_chats();

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS attachment_path text,
  ADD COLUMN IF NOT EXISTS attachment_mime text,
  ADD COLUMN IF NOT EXISTS attachment_size bigint,
  ADD COLUMN IF NOT EXISTS attachment_name_ciphertext text,
  ADD COLUMN IF NOT EXISTS attachment_key_ciphertext text,
  ADD COLUMN IF NOT EXISTS attachment_key_nonce text;

CREATE TABLE IF NOT EXISTS public.device_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  platform text NOT NULL DEFAULT 'android',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.device_tokens TO authenticated;
GRANT ALL ON public.device_tokens TO service_role;

ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users manage own device tokens" ON public.device_tokens;
CREATE POLICY "users manage own device tokens"
ON public.device_tokens FOR ALL TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "users upload own attachments" ON storage.objects;
CREATE POLICY "users upload own attachments"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'attachments'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "users read own attachments" ON storage.objects;
CREATE POLICY "users read own attachments"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'attachments'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.attachment_path = storage.objects.name
        AND public.is_chat_member(m.chat_id, auth.uid())
    )
  )
);

DROP POLICY IF EXISTS "users delete own attachments" ON storage.objects;
CREATE POLICY "users delete own attachments"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'attachments' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE OR REPLACE FUNCTION public.list_my_chats()
RETURNS TABLE(
  chat_id uuid, is_group boolean, last_message_at timestamptz,
  other_user_id uuid, other_username text, other_display_name text,
  other_avatar_color text, other_last_seen_at timestamptz, other_public_key text,
  last_message_body text, last_message_ciphertext text, last_message_nonce text,
  last_message_sender uuid, last_message_created_at timestamptz,
  last_message_attachment_mime text
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
    SELECT DISTINCT ON (chat_id) chat_id, body, ciphertext, nonce, sender_id, created_at, attachment_mime
    FROM public.messages
    WHERE chat_id IN (SELECT id FROM me_chats)
    ORDER BY chat_id, created_at DESC
  )
  SELECT
    mc.id, mc.is_group, mc.last_message_at,
    o.other_user_id, o.username, o.display_name, o.avatar_color, o.last_seen_at, o.public_key,
    lm.body, lm.ciphertext, lm.nonce, lm.sender_id, lm.created_at, lm.attachment_mime
  FROM me_chats mc
  LEFT JOIN others o ON o.chat_id = mc.id
  LEFT JOIN last_msgs lm ON lm.chat_id = mc.id
  ORDER BY mc.last_message_at DESC;
$$;

REVOKE EXECUTE ON FUNCTION public.list_my_chats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_chats() TO authenticated;
