from datetime import datetime, timezone

from flask_login import UserMixin
from flask_sqlalchemy import SQLAlchemy


# SQLAlchemy is initialized in app.py so this models file can stay import-safe.
db = SQLAlchemy()


class User(UserMixin, db.Model):
    """Application user created from a verified Google account.

    Important security note:
    This model intentionally has no password column. Authentication is handled
    by Google's OAuth 2.0 / OpenID Connect flow, and this app stores only the
    Google identity fields needed to recognize a returning user.
    """

    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(160), nullable=False)
    email = db.Column(db.String(255), unique=True, index=True, nullable=False)
    google_id = db.Column(db.String(255), unique=True, index=True, nullable=False)
    profile_image = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    last_login = db.Column(db.DateTime(timezone=True), nullable=True)

    def update_login_profile(self, *, name: str, email: str, profile_image: str | None) -> None:
        """Refresh profile fields from Google on every successful login."""

        self.name = name or self.name
        self.email = email
        self.profile_image = profile_image
        self.last_login = datetime.now(timezone.utc)
