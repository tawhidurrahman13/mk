# SOC Bootcamp FERPA-Oriented Security Checklist

This is an engineering checklist for safer handling of student education records and PII. It is not legal advice. A school/district privacy, legal, or compliance reviewer must approve production use with real student data.

## Implemented In This Update

- Replaced the reserved admin email with `eakhter@brooklynsteamcenter.org` across local auth, Vercel auth helpers, and setup docs.
- Removed student email exposure from the Google OAuth MFA redirect URL.
- Masked account email display in MFA messages and top-level account labels where possible.
- Added CSRF validation to authenticated student-data write endpoints:
  - `/api/progress/selection`
  - `/api/progress/scores`
  - `/api/progress/quiz-attempt`
  - `/api/progress/practice-exam-attempt`
  - `/api/auth/logout`
- Added admin audit log records for:
  - viewing all users
  - reading audit logs
  - editing certification scores
  - editing practice exam scores
- Added a protected local audit endpoint: `/api/admin/audit-logs`.
- Added security headers for the Node server and Vercel auth responses, including `no-store`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, and production HSTS.
- Reduced development email logging so MFA/reset recipients and codes are not printed to server logs.
- Added a public `privacy.html` notice for student-record handling and AI/third-party restrictions.
- Added a Supabase `audit_logs` table with admin-only RLS policies in the schema.

## Access Control Checklist

- Students should only access their own records and submissions.
- Admin-only pages must be hidden in the sidebar and blocked by route checks.
- Every API endpoint that reads or writes student records must check authentication server-side.
- Every API endpoint that lets an admin view or edit student records must check the admin role server-side.
- Any `userId` sent by a browser must be ignored for student writes unless the user is an admin.
- Admin score edits should be auditable and include actor, action, target user, timestamp, and minimal metadata.

## Data Handling Checklist

- Use HTTPS/TLS in production.
- Store passwords only as salted hashes.
- Keep MFA/reset codes hashed, expiring, and single-use.
- Avoid putting student names, emails, IDs, grades, answers, challenge IDs, or reset codes in URLs.
- Do not log student PII, MFA codes, reset codes, raw answers, grades, or full request bodies.
- Keep analytics/debug tooling away from real student data unless approved by the school.
- Use Supabase RLS policies and service-role keys only on server-side functions.
- Do not expose service-role keys, SMTP passwords, OAuth secrets, or auth secrets in frontend code.

## Privacy/Data Minimization Checklist

- Collect only what the app needs: account identity, role, progress, quiz attempts, practice exam results, and admin adjustments.
- Use placeholders in development and tests.
- Do not use real student names, emails, IDs, or education records in AI prompts, screenshots, support tickets, or examples unless legally approved.
- Use aggregated category breakdowns for support views when the full answer detail is not needed.
- Keep data retention/deletion rules documented before production use.

## Infrastructure Required Before Production

- Deploy only on HTTPS.
- Configure strong `AUTH_SECRET` / `SESSION_SECRET` values.
- Configure `ADMIN_EMAIL=eakhter@brooklynsteamcenter.org`.
- Configure Gmail SMTP or an approved school email provider through environment variables only.
- Store student records in Supabase with RLS enabled and reviewed.
- Keep `SUPABASE_SERVICE_ROLE_KEY` server-only.
- Enable database backups, access monitoring, and retention/deletion procedures.
- Confirm whether Supabase, Google OAuth, Gmail SMTP, Vercel, and any AI tooling are approved vendors for the school use case.

## Risks Still Requiring Human Review

- Static/browser-only mode uses `localStorage` for demo progress and accounts. Do not use static mode for real student records.
- The app still displays student emails to admins because admins need identity matching. Confirm whether this is the minimum necessary identifier.
- Production retention, deletion, amendment, parent/student access, and disclosure workflows require school policy decisions.
- AI features must not receive real student PII or education records unless the school has approved the vendor and workflow.
- At-rest encryption depends on the hosting/database platform configuration and should be verified in Supabase/Vercel settings.
