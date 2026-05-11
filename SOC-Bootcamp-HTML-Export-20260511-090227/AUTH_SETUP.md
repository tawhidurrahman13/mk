# SOC Bootcamp Auth Setup

SOC Bootcamp is still a plain HTML/CSS/JavaScript frontend, but `server.js` adds the backend needed for real authentication features:

- Email/password signup and login
- Secure password hashing with Node `crypto.scrypt`
- Session cookies and CSRF tokens for admin writes
- Role-based redirects
- Google OAuth / OpenID Connect callback route
- Gmail SMTP email delivery for MFA and password reset
- Expiring, single-use MFA and reset codes
- JSON-file persistence in `data/auth-store.json`

## Run Locally

```powershell
cd C:\Users\Akhter\Documents\Codex\2026-04-27\create-a-fully-functional-multi-page\mk
copy .env.example .env
npm start
```

Open:

```text
http://localhost:3000/login.html
```

If `node` on PATH is blocked inside Codex Desktop, use the bundled runtime directly:

```powershell
& 'C:\Users\Akhter\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' server.js
```

You can also run syntax checks with:

```powershell
npm run check
```

Run the local auth/admin QA test with:

```powershell
npm test
```

## Google OAuth

Create an OAuth client in Google Cloud Console:

1. Create/select a Google Cloud project.
2. Configure the OAuth consent screen.
3. Create an OAuth 2.0 Client ID for a Web application.
4. Add this redirect URI:

```text
http://localhost:3000/api/auth/google/callback
```

Set these in `.env`:

```text
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
```

The server validates the Google ID token with Google tokeninfo, checks audience/issuer, links by email if the account already exists, and preserves the existing role.

## Gmail SMTP

Use a Gmail app password. Do not use your normal Gmail password.

Set these in `.env`:

```text
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-gmail-address@gmail.com
SMTP_PASS=your-gmail-app-password
EMAIL_FROM=your-gmail-address@gmail.com
```

If SMTP variables are missing in development, the server logs the code to the terminal and returns a dev code to the frontend for local testing.

## Required Environment Variables

```text
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_REDIRECT_URI
AUTH_SECRET or SESSION_SECRET
SMTP_HOST
SMTP_PORT
SMTP_USER
SMTP_PASS
EMAIL_FROM
```

Optional local admin seed:

```text
ADMIN_EMAIL=akhter44@socbootcamp.local
ADMIN_PASSWORD=Akhter44
```

## Security Notes

- Use HTTPS in production so cookies can be marked `Secure`.
- Replace local JSON storage with a real database before public deployment.
- Use a long random `AUTH_SECRET`.
- Keep `.env` private.
- Gmail SMTP is suitable for demos and small internal use; production should use a transactional email provider.
