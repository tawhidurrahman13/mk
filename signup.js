const {
  assertMethod,
  createMfaChallenge,
  createSiteUser,
  enforceSingleAdminAccount,
  findSiteUserByEmail,
  handleError,
  hashPassword,
  isAdminEmail,
  isReservedAdminPassword,
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
    const requestedRole = String(body.role || "student").trim().toLowerCase();
    const wantsAdmin = requestedRole === "admin" || isAdminEmail(email);

    if (!isValidEmail(email)) {
      sendJson(res, 400, { error: "Enter a valid email address." });
      return;
    }
    if (password.length < 8) {
      sendJson(res, 400, { error: "Password must be at least 8 characters." });
      return;
    }
    if (wantsAdmin && (!isAdminEmail(email) || displayName.toLowerCase() !== "admin" || !isReservedAdminPassword(password))) {
      sendJson(res, 403, { error: "Admin signup is reserved for username admin, email eakhter@brooklynsteamcenter.org, and the configured admin password." });
      return;
    }

    await enforceSingleAdminAccount();
    const existing = await findSiteUserByEmail(email);
    let user;
    if (existing?.password_hash) {
      sendJson(res, 409, { error: "An account already exists with that email. Log in instead." });
      return;
    }

    if (existing) {
      user = await updateSiteUser(existing.id, {
        password_hash: hashPassword(password),
        display_name: wantsAdmin ? "Admin" : existing.display_name || displayName,
        role: wantsAdmin ? "admin" : "student"
      });
    } else {
      user = await createSiteUser({
        email,
        display_name: wantsAdmin ? "Admin" : displayName,
        password_hash: hashPassword(password),
        role: wantsAdmin ? "admin" : "student"
      });
    }
    await enforceSingleAdminAccount();
    if (wantsAdmin) {
      user = await findSiteUserByEmail(email);
    }

    const challenge = await createMfaChallenge(user, "signup");
    sendJson(res, 200, challenge);
  } catch (error) {
    handleError(res, error);
  }
};
