const {
  assertMethod,
  createMfaChallenge,
  createSiteUser,
  findSiteUserByEmail,
  handleError,
  hashPassword,
  isAdminEmail,
  isValidEmail,
  normalizeEmail,
  readJson,
  sendJson,
  updateSiteUser
} = require("../_lib/soc-auth");

module.exports = async function signup(req, res) {
  if (!assertMethod(req, res, "POST")) return;

  try {
    const body = await readJson(req);
    const email = normalizeEmail(body.email);
    const password = String(body.password || "");
    const displayName = String(body.displayName || email.split("@")[0] || "SOC Analyst").trim();

    if (!isValidEmail(email)) {
      sendJson(res, 400, { error: "Enter a valid email address." });
      return;
    }
    if (password.length < 8) {
      sendJson(res, 400, { error: "Password must be at least 8 characters." });
      return;
    }

    const existing = await findSiteUserByEmail(email);
    let user;
    if (existing?.password_hash) {
      sendJson(res, 409, { error: "An account already exists with that email. Log in instead." });
      return;
    }

    if (existing) {
      user = await updateSiteUser(existing.id, {
        password_hash: hashPassword(password),
        display_name: existing.display_name || displayName,
        role: isAdminEmail(email) ? "admin" : existing.role || "student"
      });
    } else {
      user = await createSiteUser({
        email,
        display_name: displayName,
        password_hash: hashPassword(password),
        role: isAdminEmail(email) ? "admin" : "student"
      });
    }

    const challenge = await createMfaChallenge(user, "signup");
    sendJson(res, 200, challenge);
  } catch (error) {
    handleError(res, error);
  }
};
