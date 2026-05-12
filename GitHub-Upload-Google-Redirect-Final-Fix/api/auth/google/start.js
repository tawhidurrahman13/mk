const {
  assertMethod,
  handleError,
  makeOAuthState,
  redirect,
  sendJson
} = require("../../_lib/soc-auth");

const CANONICAL_GOOGLE_REDIRECT_URI = "https://mk-git-main-tawhidurrahman13s-projects.vercel.app/api/auth/google/callback";

module.exports = async function googleStart(req, res) {
  if (!assertMethod(req, res, "GET")) return;

  try {
    const clientId = String(process.env.GOOGLE_CLIENT_ID || "").trim();
    const clientSecret = String(process.env.GOOGLE_CLIENT_SECRET || "").trim();
    const configuredRedirectUri = String(process.env.GOOGLE_REDIRECT_URI || "").trim();
    const redirectUri = configuredRedirectUri || CANONICAL_GOOGLE_REDIRECT_URI;
    const missing = [];
    if (!clientId) missing.push("GOOGLE_CLIENT_ID");
    if (!clientSecret) missing.push("GOOGLE_CLIENT_SECRET");
    if (missing.length) {
      redirect(res, `/login.html?authError=google_not_configured&missing=${encodeURIComponent(missing.join(","))}`);
      return;
    }

    if (!clientId.endsWith(".apps.googleusercontent.com") || !/^https?:\/\/[^ ]+\/api\/auth\/google\/callback$/.test(redirectUri)) {
      redirect(res, `/login.html?authError=google_failed&reason=${encodeURIComponent("Check GOOGLE_CLIENT_ID and GOOGLE_REDIRECT_URI in Vercel. Redirect URI must be a full URL ending in /api/auth/google/callback.")}`);
      return;
    }

    const state = makeOAuthState();
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("state", state);
    url.searchParams.set("prompt", "select_account");
    redirect(res, url.toString());
  } catch (error) {
    handleError(res, error);
  }
};
