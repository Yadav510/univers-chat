CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_username     TEXT;
  v_display_name TEXT;
  v_bio          TEXT;
  v_color        TEXT;
  v_try          TEXT;
  v_n            INT := 0;
BEGIN
  v_username     := COALESCE(NULLIF(NEW.raw_user_meta_data->>'username',''), 'user_' || substr(replace(NEW.id::text,'-',''),1,8));
  v_display_name := COALESCE(NULLIF(NEW.raw_user_meta_data->>'display_name',''), split_part(NEW.email,'@',1), 'User');
  v_bio          := NEW.raw_user_meta_data->>'bio';
  v_color        := COALESCE(NULLIF(NEW.raw_user_meta_data->>'avatar_color',''), '#2DE682');

  -- enforce constraint shape
  v_username := regexp_replace(v_username, '[^a-zA-Z0-9_]', '', 'g');
  IF length(v_username) < 3 THEN
    v_username := 'user_' || substr(replace(NEW.id::text,'-',''),1,8);
  END IF;
  v_username := substr(v_username, 1, 24);

  v_try := v_username;
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = v_try) LOOP
    v_n := v_n + 1;
    v_try := substr(v_username, 1, 20) || lpad(v_n::text, 3, '0');
    IF v_n > 200 THEN
      v_try := 'user_' || substr(replace(gen_random_uuid()::text,'-',''),1,10);
      EXIT;
    END IF;
  END LOOP;

  INSERT INTO public.profiles (id, username, display_name, bio, avatar_color)
  VALUES (NEW.id, v_try, v_display_name, v_bio, v_color)
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;