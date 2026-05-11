# Google OAuth Flask Login Setup

This project includes a beginner-friendly Flask backend for secure Google login.

## Files

- `app.py` creates the Flask app, sessions, CSRF protection, routes, and database tables.
- `models.py` defines the SQLAlchemy `User` table.
- `auth.py` handles Google OAuth, token verification, login, account linking, and logout.
- `templates/login.html` is the responsive Google login page.
- `templates/dashboard.html` is the protected user dashboard.
- `static/style.css` styles the Flask login/dashboard pages.
- `requirements.txt` lists Python dependencies.
- `.env.example` shows required environment variables.

## 1. Create a Virtual Environment

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
```

If `py` is not available, use:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

## 2. Install Dependencies

```powershell
pip install -r requirements.txt
```

## 3. Create `.env`

```powershell
copy .env.example .env
```

Edit `.env`:

```text
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
SECRET_KEY=use-a-long-random-secret
DATABASE_URL=sqlite:///users.db
```

## 4. Create Google OAuth Credentials

1. Go to Google Cloud Console.
2. Create or select a project.
3. Open **APIs & Services**.
4. Open **OAuth consent screen** and configure the app name, support email, and developer email.
5. Open **Credentials**.
6. Click **Create Credentials**.
7. Choose **OAuth client ID**.
8. Choose **Web application**.
9. Add this authorized redirect URI for local development:

```text
http://localhost:5000/login/callback
```

10. For production, add:

```text
https://yourdomain.com/login/callback
```

11. Copy the Client ID and Client Secret into `.env`.

## 5. Run Locally

```powershell
flask --app app run --host localhost --port 5000 --debug
```

Or:

```powershell
python app.py
```

Open:

```text
http://localhost:5000
```

## Security Notes

- The app does not store passwords.
- Google ID tokens are verified with `google-auth`.
- The OAuth `state` parameter protects the login callback from CSRF/login-forgery attacks.
- Flask-WTF protects POST routes such as logout with CSRF tokens.
- SQLAlchemy parameterizes database operations and protects against SQL injection.
- Session cookies are `HttpOnly` and `SameSite=Lax`.
- In production, set `SESSION_COOKIE_SECURE=true` and use HTTPS.
