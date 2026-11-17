-- Additive profile v2. Missing student facts stay NULL; existing RLS/grants apply.
CREATE TYPE public.study_year AS ENUM ('first', 'second', 'third', 'fourth', 'fifth', 'sixth');
ALTER TABLE public.profiles
    ADD COLUMN study_year public.study_year,
    ADD COLUMN interests jsonb,
    ADD COLUMN preferred_tech_domains jsonb,
    ADD COLUMN preferred_locations jsonb,
    ADD COLUMN remote_preferred boolean;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_interests_array CHECK (
    interests IS NULL OR CASE WHEN jsonb_typeof(interests) = 'array' THEN
        jsonb_array_length(interests) <= 50
        AND NOT jsonb_path_exists(interests, '$[*] ? (@.type() != "string" || @ == "")')
    ELSE false END
);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_preferred_tech_domains_array CHECK (
    preferred_tech_domains IS NULL OR CASE WHEN jsonb_typeof(preferred_tech_domains) = 'array' THEN
        jsonb_array_length(preferred_tech_domains) <= 50
        AND NOT jsonb_path_exists(preferred_tech_domains, '$[*] ? (@.type() != "string" || @ == "")')
    ELSE false END
);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_preferred_locations_array CHECK (
    preferred_locations IS NULL OR CASE WHEN jsonb_typeof(preferred_locations) = 'array' THEN
        jsonb_array_length(preferred_locations) <= 50
        AND NOT jsonb_path_exists(preferred_locations, '$[*] ? (@.type() != "string" || @ == "")')
    ELSE false END
);
