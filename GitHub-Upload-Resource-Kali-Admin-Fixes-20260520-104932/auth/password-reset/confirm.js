const {
  assertMethod,
  confirmPasswordReset,
  handleError,
  normalizeEmail,
  readJson,
  sendJson
} = require("../../_lib/soc-auth");

module.exports = async function confirmPasswordResetEndpoint(req, res) {
  if (!assertMethod(req, res, "POST")) return;

  try {
    const body = await readJson(req);
    await confirmPasswordReset(body.challengeId, normalizeEmail(body.email), body.code);
    sendJson(res, 200, { ok: true });
  } catch (error) {
    handleError(res, error);
  }
};
