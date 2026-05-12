const crypto = require("node:crypto");

const {
  assertMethod,
  getBaseUrl,
  sendJson
} = require("../../_lib/soc-auth");

const CANONICAL_GOOGLE_REDIRECT_URI = "https://mk-git-main-tawhidurrahman13s-projects.vercel.app/api/auth/google/callback";

function maskClientId(clientId) {
  if (!clientId) return "";
  const [prefix, domain] = clientId.split(".");
  return `${prefix.slice(0, 10)}...${domain || ""}`;
}

function secretFingerprint(secret) {
  if (!secret) return "";
  return crypto.createHash("sha256").update(secret).digest("hex").slice(0, 12);
}

module.exports = async function googleDiagnostics(req, res) {
  if (!assertMethod(req, res, "GET")) return;

  const clientId = String(process.env.GOOGLE_CLIENT_ID || "").trim();
  const clientSecretRaw = String(process.env.GOOGLE_CLIENT_SECRET || "");
  const clientSecret = clientSecretRaw.trim();
  const redirectUri = String(process.env.GOOGLE_REDIRECT_URI || "").trim() || CANONICAL_GOOGLE_REDIRECT_URI;
  const authSecret = String(process.env.AUTH_SECRET || process.env.SESSION_SECRET || "").trim();
  const requestBaseUrl = getBaseUrl(req);

  const checks = [
    {
      name: "GOOGLE_CLIENT_ID is present",
      ok: Boolean(clientId),
      fix: "Add GOOGLE_CLIENT_ID in Vercel Environment Variables."
    },
    {
      name: "GOOGLE_CLIENT_ID looks like a web OAuth client ID",
      ok: clientId.endsWith(".apps.googleusercontent.com"),
      fix: "Copy the Client ID from Google Auth Platform -> Clients -> your Web application client."
    },
    {
      name: "GOOGLE_CLIENT_SECRET is present",
      ok: Boolean(clientSecret),
      fix: "Add GOOGLE_CLIENT_SECRET in Vercel Environment Variables."
    },
    {
      name: "GOOGLE_CLIENT_SECRET is not accidentally the Client ID",
      ok: Boolean(clientSecret) && !clientSecret.includes(".apps.googleusercontent.com") && clientSecret !== clientId,
      fix: "Replace GOOGLE_CLIENT_SECRET with the Client secret from the same Google OAuth client, not the Client ID."
    },
    {
      name: "GOOGLE_CLIENT_SECRET has no pasted key name or quotes",
      ok: Boolean(clientSecret)
        && !clientSecret.includes("GOOGLE_CLIENT_SECRET")
        && !/^['"]|['"]$/.test(clientSecret),
      fix: "Paste only the secret value, with no GOOGLE_CLIENT_SECRET= prefix and no quote marks."
    },
    {
      name: "GOOGLE_REDIRECT_URI points to the callback route",
      ok: /^https:\/\/[^ ]+\/api\/auth\/google\/callback$/.test(redirectUri),
      fix: "Set GOOGLE_REDIRECT_URI to https://mk-git-main-tawhidurrahman13s-projects.vercel.app/api/auth/google/callback."
    },
    {
      name: "AUTH_SECRET is present",
      ok: authSecret.length >= 24,
      fix: "Add a long AUTH_SECRET in Vercel and redeploy."
    }
  ];

  sendJson(res, 200, {
    summary: checks.every((check) => check.ok) ? "basic_checks_passed" : "needs_attention",
    deployedClientId: maskClientId(clientId),
    deployedClientIdFull: clientId,
    redirectUri,
    requestBaseUrl,
    clientSecretConfigured: Boolean(clientSecret),
    clientSecretLength: clientSecret.length,
    clientSecretFingerprint: secretFingerprint(clientSecret),
    checks
  });
};
