-- Saved Jobs searches, optionally emailed as daily alerts of new matching internships.
CREATE TABLE public.saved_searches (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
 name varchar(80) NOT NULL CHECK (length(btrim(name)) > 0),
 search varchar(200),
 location varchar(255),
 degree_level varchar(10) CHECK (degree_level IN ('bachelor','master','both')),
 study_year smallint CHECK (study_year BETWEEN 1 AND 6),
 alert boolean NOT NULL DEFAULT false,
 last_alerted_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT uq_saved_search_user_name UNIQUE (user_id, name)
);
CREATE INDEX ix_saved_searches_user ON public.saved_searches(user_id);
CREATE INDEX ix_saved_searches_alert ON public.saved_searches(alert) WHERE alert;
ALTER TABLE public.saved_searches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.saved_searches FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_searches TO authenticated;
GRANT ALL ON public.saved_searches TO service_role;
CREATE POLICY "Users can view their own saved searches" ON public.saved_searches
 FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "Users can create their own saved searches" ON public.saved_searches
 FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "Users can update their own saved searches" ON public.saved_searches
 FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "Users can delete their own saved searches" ON public.saved_searches
 FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);
