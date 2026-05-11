const {
  assertMethod,
  createPasswordResetChallenge,
  findSiteUserByEmail,
  handleError,
  isValidEmail,
  normalizeEmail,
  readJson,
  sendJson
} = require("../../_lib/soc-auth");

module.exports = async function requestPasswordReset(req, res) {
  if (!assertMethod(req, res, "POST")) return;

  try {
    const body = await readJson(req);
    const email = normalizeEmail(body.email);
    const newPassword = String(body.newPassword || "");

    if (!isValidEmail(email)) {
      sendJson(res, 400, { error: "Enter a valid email address." });
      return;
    }
    if (newPassword.length < 8) {
      sendJson(res, 400, { error: "New password must be at least 8 characters." });
      return;
    }

    const user = await findSiteUserByEmail(email);
    if (!user) {
      sendJson(res, 404, { error: "No account was found with that email." });
      return;
    }

    const challenge = await createPasswordResetChallenge(user, newPassword);
    sendJson(res, 200, challenge);
  } catch (error) {
    handleError(res, error);
  }
};
