const { assertMethod, sendJson } = require("../_lib/soc-auth");

module.exports = async function me(req, res) {
  if (!assertMethod(req, res, "GET")) return;
  sendJson(res, 200, { user: null });
};
