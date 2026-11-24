# Resumes page

`/resumes` is an authenticated workspace route. It owns private PDF management and optional extraction/review; `/profile` contains no PDF picker, upload controls or parsing flow. Manual profile, skills, collection editing and completion behavior remain in Profile.

The library uses the existing `ResumePdfController` and same-origin profile-service adapter. View/download accesses stay session-authenticated, object URLs are released on unmount, replacements use the confirmed ID/revision, and deletion requires confirmation. Failed actions preserve the last confirmed metadata. No files or metadata are persisted in browser storage.

The desktop table follows the supplied reference with Resume, Target job title, Last modified, Created and a row action menu. Mobile shows the filename, uploaded date and actions without horizontal scrolling. The picker appears only after Add/Replace; importing profile information is a separate disclosure.

## Current backend limits

The existing API retains one active PDF and returns the generic filename `resume.pdf`. It has no multi-file slots, saved display names, primary-file selection, target job title or analysis-completion status. The page displays the actual saved count, the confirmed server filename, an Uploaded badge and Not specified for the target title. Both date columns refer to the immutable file's upload timestamp. Replacing a file creates a new document identity.

Supporting five independent saved resumes and naming/targeting them requires a separately reviewed persistence/API change. This frontend move makes no schema, bucket, RLS or hosted-data changes and does not delete the user's existing PDF.

## Verification

Unit regressions cover Profile without PDF controls, the account gate, confirmed table metadata, unavailable status, the inline picker and pending mutations. E2E exercises guest redirection, desktop/mobile navigation, real fixture upload, refresh, private view, replacement with a new persisted ID, deletion and continued Profile editing.
