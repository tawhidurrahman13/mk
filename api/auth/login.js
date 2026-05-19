const {
  assertMethod,
  createSiteUser,
  createMfaChallenge,
  findSiteUserByEmail,
  handleError,
  hashPassword,
  isAdminEmail,
  isReservedAdminPassword,
  normalizeEmail,
  readJson,
  sendJson,
  updateSiteUser,
  verifyPassword
} = require("../_lib/soc-auth");

module.exports = async function login(req, res) {
  if (!assertMethod(req, res, "POST")) return;

  try {
    const body = await readJson(req);
    const email = normalizeEmail(body.email);
    const password = String(body.password || "");
    let user = await findSiteUserByEmail(email);

    if (isAdminEmail(email)) {
      if (!isReservedAdminPassword(password)) {
        sendJson(res, 401, { error: "Email or password is incorrect." });
        return;
      }

      if (!user) {
        user = await createSiteUser({
          email,
          display_name: "Admin",
          password_hash: hashPassword(password),
          role: "admin"
        });
      } else if (user.role !== "admin" || !verifyPassword(password, user.password_hash)) {
        user = await updateSiteUser(user.id, {
          display_name: user.display_name || "Admin",
          password_hash: hashPassword(password),
          role: "admin"
        });
      }
    }

    if (!user || !verifyPassword(password, user.password_hash)) {
      sendJson(res, 401, { error: "Email or password is incorrect." });
      return;
    }

    const challenge = await createMfaChallenge(user, "login");
    sendJson(res, 200, challenge);
  } catch (error) {
    handleError(res, error);
  }
};
