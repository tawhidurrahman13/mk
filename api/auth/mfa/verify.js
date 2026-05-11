const {
  assertMethod,
  handleError,
  publicUser,
  readJson,
  sendJson,
  verifyMfaChallenge
} = require("../../_lib/soc-auth");

module.exports = async function verifyMfa(req, res) {
  if (!assertMethod(req, res, "POST")) return;

  try {
    const body = await readJson(req);
    const user = await verifyMfaChallenge(body.challengeId, body.code);
    sendJson(res, 200, {
      user: publicUser(user),
      redirect: user.role === "admin" ? "admin.html" : "index.html"
    });
  } catch (error) {
    handleError(res, error);
  }
};
