const {
  assertMethod,
  createMfaChallenge,
  createSiteUser,
  enforceSingleAdminAccount,
  exchangeGoogleCode,
  findSiteUserByEmail,
  findSiteUserByGoogleId,
  getBaseUrl,
  handleError,
  isAdminEmail,
  isAuthSecretConfigured,
  redirect,
  updateSiteUser,
  verifyOAuthState
} = require("../../_lib/soc-auth");

module.exports = async function googleCallback(req, res) {
  if (!assertMethod(req, res, "GET")) return;

  try {
    const url = new URL(req.url, getBaseUrl(req));
    const error = url.searchParams.get("error");
    if (error) {
      redirect(res, `/login.html?authError=google_failed&reason=${encodeURIComponent(error)}`);
      return;
    }

    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!isAuthSecretConfigured()) {
      redirect(res, "/login.html?authError=google_not_configured&missing=AUTH_SECRET");
      return;
    }
    if (!code) {
      redirect(res, "/login.html?authError=google_failed&reason=missing_google_code");
      return;
    }
    if (!state) {
      redirect(res, "/login.html?authError=google_failed&reason=missing_oauth_state");
      return;
    }
    if (!verifyOAuthState(state)) {
      redirect(res, "/login.html?authError=google_failed&reason=invalid_state");
      return;
    }

    const profile = await exchangeGoogleCode(req, code);
    await enforceSingleAdminAccount();
    const existingByGoogle = await findSiteUserByGoogleId(profile.googleId);
    const existingByEmail = existingByGoogle || await findSiteUserByEmail(profile.email);
    const isReservedAdmin = isAdminEmail(profile.email);
    const patch = {
      google_id: profile.googleId,
      email: profile.email,
      display_name: isReservedAdmin ? "Admin" : profile.displayName,
      profile_image: profile.profileImage,
      role: isReservedAdmin ? "admin" : "student"
    };

    let user = existingByEmail
      ? await updateSiteUser(existingByEmail.id, patch)
      : await createSiteUser(patch);
    await enforceSingleAdminAccount();
    if (isReservedAdmin) {
      user = await findSiteUserByEmail(profile.email);
    }

    const challenge = await createMfaChallenge(user, "google");
    redirect(res, `/login.html?serverMfa=${encodeURIComponent(challenge.challengeId)}&oauth=google`);
  } catch (error) {
    console.error("[google-callback]", error.message || "callback_failed");
    redirect(res, `/login.html?authError=google_failed&reason=${encodeURIComponent(error.message || "callback_failed")}`);
  }
};
