CREATE TABLE public.posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  url text NOT NULL,
  nickname text,
  caption text,
  thumbnail_url text,
  current_views bigint NOT NULL DEFAULT 0,
  likes bigint,
  comments bigint,
  shares bigint,
  status text NOT NULL DEFAULT 'active',
  failure_count int NOT NULL DEFAULT 0,
  last_error text,
  last_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.posts TO authenticated;
GRANT ALL ON public.posts TO service_role;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own posts" ON public.posts FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  target_views bigint NOT NULL,
  hit_at timestamptz,
  notified boolean NOT NULL DEFAULT false,
  UNIQUE (post_id, target_views)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.milestones TO authenticated;
GRANT ALL ON public.milestones TO service_role;
ALTER TABLE public.milestones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own milestones" ON public.milestones FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.view_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  views bigint NOT NULL,
  likes bigint, comments bigint, shares bigint,
  checked_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.view_snapshots (post_id, checked_at);
GRANT SELECT, INSERT, DELETE ON public.view_snapshots TO authenticated;
GRANT ALL ON public.view_snapshots TO service_role;
ALTER TABLE public.view_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own snapshots" ON public.view_snapshots FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  message text NOT NULL,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own notifications" ON public.notifications FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.user_settings (
  user_id uuid PRIMARY KEY DEFAULT auth.uid(),
  ntfy_topic text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.user_settings TO authenticated;
GRANT ALL ON public.user_settings TO service_role;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own settings" ON public.user_settings FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);