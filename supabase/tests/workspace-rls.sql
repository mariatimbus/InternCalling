BEGIN;
INSERT INTO auth.users(id,email) VALUES
 ('d4000000-0000-4000-8000-000000000001','workspace-owner@example.invalid'),
 ('d4000000-0000-4000-8000-000000000002','workspace-other@example.invalid');
INSERT INTO public.profile_entries(id,user_id,section,position,"values") VALUES
 ('d4000000-0000-4000-8000-000000000003','d4000000-0000-4000-8000-000000000001','projects',1,'{"name":"Private project"}');
INSERT INTO public.cv_documents(id,user_id,storage_path,media_type,size_bytes,sha256) VALUES
 ('d4000000-0000-4000-8000-000000000004','d4000000-0000-4000-8000-000000000001',
 'd4000000-0000-4000-8000-000000000001/d4000000-0000-4000-8000-000000000004/resume.pdf','application/pdf',10,repeat('a',64));
INSERT INTO public.profile_resumes(user_id,document_id) VALUES
 ('d4000000-0000-4000-8000-000000000001','d4000000-0000-4000-8000-000000000004');
INSERT INTO public.profile_workflows(user_id,kind,payload) VALUES
 ('d4000000-0000-4000-8000-000000000001','tailor-draft','{"private":"Approved content"}');
DO $$ BEGIN
 BEGIN
  INSERT INTO public.profile_resumes(user_id,document_id) VALUES
   ('d4000000-0000-4000-8000-000000000002','d4000000-0000-4000-8000-000000000004');
  RAISE EXCEPTION 'Cross-owner PDF pointer accepted';
 EXCEPTION WHEN foreign_key_violation THEN NULL; END;
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','d4000000-0000-4000-8000-000000000001',true);
DO $$ DECLARE name text; count_rows integer; BEGIN
 FOREACH name IN ARRAY ARRAY['profile_entries','profile_resumes','profile_workflows'] LOOP
  EXECUTE format('SELECT count(*) FROM public.%I',name) INTO count_rows;
  IF count_rows <> 1 THEN RAISE EXCEPTION 'Owner cannot see %',name; END IF;
  BEGIN
   EXECUTE format('DELETE FROM public.%I',name);
   RAISE EXCEPTION 'Browser can delete %',name;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
   EXECUTE format('UPDATE public.%I SET revision=900',name);
   RAISE EXCEPTION 'Browser can forge revisions in %',name;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 END LOOP;
 BEGIN
  INSERT INTO public.profile_workflows(user_id,kind,payload) VALUES
   (auth.uid(),'tailor-approval','{}');
  RAISE EXCEPTION 'Browser can forge approval';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub','d4000000-0000-4000-8000-000000000002',true);
DO $$ BEGIN
 IF EXISTS(SELECT FROM public.profile_entries) OR EXISTS(SELECT FROM public.profile_resumes)
 OR EXISTS(SELECT FROM public.profile_workflows) THEN RAISE EXCEPTION 'Cross-owner private state visible'; END IF;
END $$;
SET LOCAL ROLE anon;
DO $$ DECLARE name text; BEGIN
 FOREACH name IN ARRAY ARRAY['profile_entries','profile_resumes','profile_workflows'] LOOP
  BEGIN
   EXECUTE format('SELECT * FROM public.%I',name);
   RAISE EXCEPTION 'Anonymous can read %',name;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 END LOOP;
END $$;
ROLLBACK;
