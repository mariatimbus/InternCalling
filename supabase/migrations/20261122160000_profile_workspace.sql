-- Private, typed-at-the-API profile collections and durable review/tailoring state.
-- The browser cannot write these tables directly; FastAPI enforces ownership/CAS.
CREATE TABLE public.profile_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  section text NOT NULL CHECK (section IN ('experience','projects','certificates','honours','languages','publications')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  position integer NOT NULL CHECK (position > 0),
  normalized_name varchar(255),
  "values" jsonb NOT NULL CHECK (jsonb_typeof("values") = 'object' AND octet_length("values"::text) <= 65536),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,section,position), UNIQUE(user_id,section,normalized_name)
);
CREATE INDEX profile_entries_owner ON public.profile_entries(user_id);
CREATE UNIQUE INDEX cv_documents_id_owner ON public.cv_documents(id,user_id);
CREATE TABLE public.profile_resumes (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  document_id uuid,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  FOREIGN KEY(document_id,user_id) REFERENCES public.cv_documents(id,user_id) ON DELETE CASCADE
);
INSERT INTO public.profile_resumes(user_id,document_id)
SELECT DISTINCT ON (user_id) user_id,id FROM public.cv_documents
WHERE media_type='application/pdf' ORDER BY user_id,created_at DESC,id;
CREATE TABLE public.profile_workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kind varchar(40) NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object' AND octet_length(payload::text)<=16777216),
  request_key uuid, request_hash varchar(64),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,request_key)
);
CREATE INDEX profile_workflows_owner ON public.profile_workflows(user_id,kind);
ALTER TABLE public.profile_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_resumes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_workflows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.profile_entries,public.profile_resumes,public.profile_workflows FROM anon,authenticated;
GRANT SELECT ON public.profile_entries,public.profile_resumes,public.profile_workflows TO authenticated;
GRANT ALL ON public.profile_entries,public.profile_resumes,public.profile_workflows TO service_role;
CREATE POLICY profile_entries_owner_read ON public.profile_entries FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE POLICY profile_resumes_owner_read ON public.profile_resumes FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE POLICY profile_workflows_owner_read ON public.profile_workflows FOR SELECT TO authenticated USING(user_id=auth.uid());
