-- A11: private owner-only CV storage and reviewable extraction metadata.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('private-cvs', 'private-cvs', false, 5242880,
        ARRAY['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']);

CREATE POLICY cv_objects_select ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'private-cvs' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
CREATE POLICY cv_objects_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'private-cvs' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
CREATE POLICY cv_objects_delete ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'private-cvs' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
-- No UPDATE policy: uploaded objects are immutable; replace via a new document ID.

CREATE TABLE public.cv_documents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    storage_path varchar(255) NOT NULL UNIQUE,
    media_type varchar(100) NOT NULL CHECK (media_type IN
      ('application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
    size_bytes integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 5242880),
    sha256 varchar(64) NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
    status varchar(20) NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded', 'extracted', 'reviewed')),
    extraction jsonb,
    extraction_model varchar(100),
    profile_snapshot jsonb,
    provenance jsonb,
    reviewed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT cv_owner_path CHECK (split_part(storage_path, '/', 1) = user_id::text)
);
CREATE INDEX ix_cv_documents_user_id ON public.cv_documents(user_id);
ALTER TABLE public.cv_documents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cv_documents FROM anon, authenticated;
-- Metadata/drafts are server-owned: the authenticated browser can read its own,
-- but cannot forge extraction/provenance or mark a document reviewed via PostgREST.
GRANT SELECT ON public.cv_documents TO authenticated;
CREATE POLICY cv_metadata_owner ON public.cv_documents FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));
GRANT ALL ON public.cv_documents TO service_role;

CREATE TRIGGER cv_documents_updated_at BEFORE UPDATE ON public.cv_documents
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
