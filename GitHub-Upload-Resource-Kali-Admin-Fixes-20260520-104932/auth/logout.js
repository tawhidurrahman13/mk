const { assertMethod, sendJson } = require("../_lib/soc-auth");

module.exports = async function logout(req, res) {
  if (!assertMethod(req, res, "POST")) return;
  sendJson(res, 200, { ok: true });
};
