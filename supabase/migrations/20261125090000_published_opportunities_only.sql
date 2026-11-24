-- Browser keys may read only published postings. The old policy (USING true) let anyone
-- with the publishable key read hidden rows through PostgREST: postings held for review,
-- withdrawn or expired. The API reads with its own role and is unaffected.
DROP POLICY IF EXISTS "Opportunities are readable" ON public.opportunities;
CREATE POLICY "Published opportunities are readable"
ON public.opportunities
FOR SELECT
TO anon, authenticated
USING (is_active);
