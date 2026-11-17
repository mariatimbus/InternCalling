BEGIN;
INSERT INTO auth.users (id, email) VALUES
 ('c3000000-0000-4000-8000-000000000001','cv-owner@example.invalid'),
 ('c3000000-0000-4000-8000-000000000002','cv-other@example.invalid');
DO $$ BEGIN
 IF (SELECT public FROM storage.buckets WHERE id = 'private-cvs') IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'CV bucket must be private'; END IF;
END $$;
INSERT INTO public.cv_documents (id,user_id,storage_path,media_type,size_bytes,sha256) VALUES
 ('c3000000-0000-4000-8000-000000000003','c3000000-0000-4000-8000-000000000001',
 'c3000000-0000-4000-8000-000000000001/c3000000-0000-4000-8000-000000000003/resume.pdf',
 'application/pdf',10,repeat('a',64));
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','c3000000-0000-4000-8000-000000000001',true);
INSERT INTO storage.objects (bucket_id,name) VALUES ('private-cvs',
 'c3000000-0000-4000-8000-000000000001/c3000000-0000-4000-8000-000000000003/resume.pdf');
DO $$ BEGIN
 IF (SELECT count(*) FROM public.cv_documents) <> 1 THEN RAISE EXCEPTION 'Owner metadata invisible'; END IF;
 IF (SELECT count(*) FROM storage.objects WHERE bucket_id='private-cvs') <> 1 THEN RAISE EXCEPTION 'Owner CV invisible'; END IF;
 BEGIN
  UPDATE public.cv_documents SET status='reviewed';
  RAISE EXCEPTION 'Client can forge review metadata';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub','c3000000-0000-4000-8000-000000000002',true);
DO $$ BEGIN
 IF (SELECT count(*) FROM public.cv_documents) <> 0 THEN RAISE EXCEPTION 'Cross-user metadata visible'; END IF;
 IF (SELECT count(*) FROM storage.objects WHERE bucket_id='private-cvs') <> 0 THEN RAISE EXCEPTION 'Cross-user CV visible'; END IF;
 DELETE FROM storage.objects WHERE bucket_id='private-cvs';
 IF FOUND THEN RAISE EXCEPTION 'Cross-user deletion allowed'; END IF;
 BEGIN
  INSERT INTO storage.objects (bucket_id,name) VALUES ('private-cvs',
  'c3000000-0000-4000-8000-000000000001/forbidden/resume.pdf');
  RAISE EXCEPTION 'Cross-user upload allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SET LOCAL ROLE anon;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id='private-cvs')
 THEN RAISE EXCEPTION 'Anonymous CV visible'; END IF;
 BEGIN
  PERFORM * FROM public.cv_documents;
  RAISE EXCEPTION 'Anonymous metadata access allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;
