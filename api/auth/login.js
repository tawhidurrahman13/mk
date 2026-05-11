const {
  assertMethod,
  createMfaChallenge,
  findSiteUserByEmail,
  handleError,
  normalizeEmail,
  readJson,
  sendJson,
  verifyPassword
} = require("../_lib/soc-auth");

module.exports = async function login(req, res) {
  if (!assertMethod(req, res, "POST")) return;

  try {
    const body = await readJson(req);
    const email = normalizeEmail(body.email);
    const password = String(body.password || "");
    const user = await findSiteUserByEmail(email);

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
