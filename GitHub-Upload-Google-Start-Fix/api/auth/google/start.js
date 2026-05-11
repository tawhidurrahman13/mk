const {
  assertMethod,
  getBaseUrl,
  handleError,
  makeOAuthState,
  redirect,
  sendJson
} = require("../../_lib/soc-auth");

module.exports = async function googleStart(req, res) {
  if (!assertMethod(req, res, "GET")) return;

  try {
    const clientId = process.env.GOOGLE_CLIENT_ID || "";
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET || "";
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${getBaseUrl(req)}/api/auth/google/callback`;
    const missing = [];
    if (!clientId) missing.push("GOOGLE_CLIENT_ID");
    if (!clientSecret) missing.push("GOOGLE_CLIENT_SECRET");
    if (missing.length) {
      redirect(res, `/login.html?authError=google_not_configured&missing=${encodeURIComponent(missing.join(","))}`);
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
