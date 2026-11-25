# Posting-based eligibility

Matching and eligibility use original employer text, independently of optional English display translations. No schema migration or hosted data update is required. Public response fields and eligibility statuses are unchanged.

- A Master/MSc or PhD/doctoral title restricts accepted degrees. A Bachelor profile fails those requirements. Explicit alternatives in the title or standalone acceptance of Bachelor candidates in the description broaden the accepted list. Scrum Master, Master Data and Mastercard are not educational requirements; a PhD candidate's prior Bachelor degree is not an alternative.
- Explicit graduation years, lists and bounded ranges restrict the student's graduation year. Bare-year `before` and `after` are exclusive; `by`, `no later than` and `no earlier than` are inclusive. Posting dates, internship start years and preferred dates do not gate eligibility. Unsupported exclusions and contradictory statements remain unclassified rather than being inverted into accepted years.
- The office's city or country alone never rejects a candidate. Explicit requirements to already/currently reside in a named place can reject a confirmed different location, including remote roles. Relocation alternatives do not impose current residency. Missing profile location remains unknown.

A failed hard requirement sets the match score to zero and excludes the posting from recommendations. The requirement and employer evidence remain visible in match/eligibility results. Missing degree or graduation details remain unknown, not a confirmed failure.

Extraction is deterministic and conservative, not general natural-language understanding. Ambiguous or unsupported wording may need source review; it must not be treated as proof of eligibility. Location comparison uses comma-separated place names, without a geocoding service or inferred residence.

Regression coverage: `apps/api/tests/test_posting_eligibility.py`, `test_matching.py` and `test_matching_api.py`. English display preparation and deployment requirements are documented in [english-catalog.md](english-catalog.md).
