# SOC Bootcamp Vercel Google + Gmail SMTP Setup

Use these steps after pushing the latest code to GitHub and redeploying Vercel.

## 1. Run the Supabase MFA SQL

Open Supabase, then go to:

`SQL Editor -> New query`

Paste and run:

`supabase_auth_mfa_extension.sql`

This creates the server-side tables used by Vercel for users, MFA codes, and password reset codes.

## 2. Add Vercel Environment Variables

Open Vercel, then go to:

`Project -> Settings -> Environment Variables`

Add these variables for Production, Preview, and Development:

```env
AUTH_SECRET=make_this_a_long_random_secret
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=https://your-vercel-domain.vercel.app/api/auth/google/callback
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=your_gmail_address@gmail.com
SMTP_PASS=your_gmail_app_password
EMAIL_FROM=SOC Bootcamp <your_gmail_address@gmail.com>
ADMIN_EMAIL=eakhter@brooklynsteamcenter.org
ADMIN_PASSWORD=akhter44
```

Keep `SUPABASE_SERVICE_ROLE_KEY`, `SMTP_PASS`, `GOOGLE_CLIENT_SECRET`, and `AUTH_SECRET` private.

## 3. Create a Gmail App Password

Use a Gmail account with 2-Step Verification turned on.

Go to:

`Google Account -> Security -> 2-Step Verification -> App passwords`

Create an app password for SOC Bootcamp, then paste that app password into `SMTP_PASS`.

Use Gmail SMTP port `465`.

## 4. Configure Google OAuth

In Google Cloud Console:

1. Create or open a project.
2. Go to `APIs & Services -> OAuth consent screen`.
3. Configure the app name and support email.
4. Go to `Credentials`.
5. Create an `OAuth client ID`.
6. Choose `Web application`.
7. Add this authorized redirect URI:

```text
https://your-vercel-domain.vercel.app/api/auth/google/callback
```

For local backend testing, also add:

```text
http://localhost:3000/api/auth/google/callback
```

Copy the client ID and client secret into Vercel.

## 5. Redeploy

After adding environment variables:

`Vercel -> Project -> Deployments -> latest deployment -> ... -> Redeploy`

Uncheck `Use existing Build Cache`.

## 6. Test

1. Open the Vercel site.
2. Click `Continue with Google`.
3. Pick the Google account already signed into Chrome.
4. Check that Gmail receives a 6-digit MFA code.
5. Enter the MFA code on the login page.
6. Confirm the dashboard opens.
