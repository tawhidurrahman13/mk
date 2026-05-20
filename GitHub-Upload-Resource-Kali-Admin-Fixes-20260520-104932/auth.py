import os
import secrets
from datetime import datetime, timezone
from urllib.parse import urlencode

import requests
from flask import Blueprint, current_app, flash, redirect, render_template, request, session, url_for
from flask_login import current_user, login_required, login_user, logout_user
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

from models import User, db


auth_bp = Blueprint("auth", __name__)

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_ISSUERS = {"accounts.google.com", "https://accounts.google.com"}
OAUTH_SCOPES = "openid email profile"


def google_client_id() -> str:
    return current_app.config["GOOGLE_CLIENT_ID"]


def google_client_secret() -> str:
    return current_app.config["GOOGLE_CLIENT_SECRET"]


def google_oauth_configured() -> bool:
    """Return True only when real Google OAuth credentials are present."""

    placeholder_values = {
        "",
        "your_google_client_id",
        "your_google_client_secret",
    }
    return google_client_id() not in placeholder_values and google_client_secret() not in placeholder_values


def oauth_redirect_uri() -> str:
    """Build the callback URL used by Google.

    For local development this resolves to:
    http://localhost:5000/login/callback

    In production, configure your host/domain and register:
    https://yourdomain.com/login/callback
    """

    configured_uri = current_app.config.get("GOOGLE_REDIRECT_URI")
    if configured_uri:
        return configured_uri
    return url_for("auth.login_callback", _external=True)


@auth_bp.route("/login")
def login():
    """Render the public login page.

    If someone is already logged in, send them straight to the dashboard.
    """

    if current_user.is_authenticated:
        return redirect(url_for("dashboard"))
    return render_template("login.html")


@auth_bp.route("/login/google")
def login_google():
    """Start Google OAuth 2.0 / OpenID Connect sign-in."""

    if not google_oauth_configured():
        flash("Google OAuth is not configured yet. Add credentials to your .env file.", "error")
        return redirect(url_for("auth.login"))

    # The state value protects the callback from CSRF/login-forgery attacks.
    state = secrets.token_urlsafe(32)
    session["oauth_state"] = state

    params = {
        "client_id": google_client_id(),
        "redirect_uri": oauth_redirect_uri(),
        "response_type": "code",
        "scope": OAUTH_SCOPES,
        "state": state,
        "prompt": "select_account",
    }
    return redirect(f"{GOOGLE_AUTH_URL}?{urlencode(params)}")


@auth_bp.route("/login/callback")
def login_callback():
    """Handle Google's OAuth callback and create/update the local user."""

    returned_state = request.args.get("state", "")
    expected_state = session.pop("oauth_state", "")
    if not expected_state or not secrets.compare_digest(returned_state, expected_state):
        flash("Invalid Google login state. Please try again.", "error")
        return redirect(url_for("auth.login"))

    error = request.args.get("error")
    if error:
        flash(f"Google login was cancelled or failed: {error}", "error")
        return redirect(url_for("auth.login"))

    code = request.args.get("code")
    if not code:
        flash("Google did not return an authorization code.", "error")
        return redirect(url_for("auth.login"))

    try:
        token_payload = exchange_code_for_tokens(code)
        google_profile = verify_google_id_token(token_payload["id_token"])
    except (KeyError, ValueError, requests.RequestException) as exc:
        current_app.logger.exception("Google OAuth verification failed: %s", exc)
        flash("Google login could not be verified securely. Please try again.", "error")
        return redirect(url_for("auth.login"))

    user = upsert_google_user(google_profile)
    login_user(user)
    flash("Signed in with Google.", "success")
    return redirect(url_for("dashboard"))


@auth_bp.route("/logout", methods=["POST"])
@login_required
def logout():
    """Log the user out.

    This route is POST-only and CSRF-protected by Flask-WTF.
    """

    logout_user()
    session.clear()
    flash("You have been logged out.", "success")
    return redirect(url_for("auth.login"))


def exchange_code_for_tokens(code: str) -> dict:
    """Exchange Google's one-time authorization code for tokens."""

    response = requests.post(
        GOOGLE_TOKEN_URL,
        data={
            "code": code,
            "client_id": google_client_id(),
            "client_secret": google_client_secret(),
            "redirect_uri": oauth_redirect_uri(),
            "grant_type": "authorization_code",
        },
        timeout=10,
    )
    response.raise_for_status()
    return response.json()


def verify_google_id_token(raw_id_token: str) -> dict:
    """Cryptographically verify Google's ID token.

    google-auth checks the signature, expiry, issuer, and audience. We also
    enforce verified email because the email becomes our primary identifier.
    """

    profile = id_token.verify_oauth2_token(
        raw_id_token,
        google_requests.Request(),
        google_client_id(),
    )

    if profile.get("iss") not in GOOGLE_ISSUERS:
        raise ValueError("Unexpected Google token issuer")

    if not profile.get("email_verified"):
        raise ValueError("Google account email is not verified")

    required = ["sub", "email"]
    if any(not profile.get(field) for field in required):
        raise ValueError("Google profile is missing required identity fields")

    return profile


def upsert_google_user(profile: dict) -> User:
    """Create a new user or update the returning Google user."""

    google_id = profile["sub"]
    email = profile["email"].lower()
    name = profile.get("name") or email.split("@")[0]
    profile_image = profile.get("picture")

    user = User.query.filter_by(google_id=google_id).first()

    # If the same email already exists, link it to this Google identity instead
    # of creating a duplicate account.
    if user is None:
        user = User.query.filter_by(email=email).first()
        if user:
            user.google_id = google_id

    if user is None:
        user = User(
            name=name,
            email=email,
            google_id=google_id,
            profile_image=profile_image,
            created_at=datetime.now(timezone.utc),
        )
        db.session.add(user)

    user.update_login_profile(name=name, email=email, profile_image=profile_image)
    db.session.commit()
    return user
