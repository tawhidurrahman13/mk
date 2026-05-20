const crypto = require("node:crypto");
const tls = require("node:tls");

const AUTH_SECRET = process.env.AUTH_SECRET || process.env.SESSION_SECRET || "";
const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "";
const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || process.env.SOC_ADMIN_EMAIL || "eakhter@brooklynsteamcenter.org").trim().toLowerCase();
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || process.env.SOC_ADMIN_PASSWORD || "akhter44");
const CANONICAL_GOOGLE_REDIRECT_URI = "https://mk-git-main-tawhidurrahman13s-projects.vercel.app/api/auth/google/callback";

function sendJson(res, statusCode, payload, headers = {}) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  Object.entries(headers).forEach(([key, value]) => res.setHeader(key, value));
  res.end(JSON.stringify(payload));
}

function redirect(res, location, headers = {}) {
  res.statusCode = 302;
  Object.entries(headers).forEach(([key, value]) => res.setHeader(key, value));
  res.setHeader("Location", location);
  res.end();
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  return JSON.parse(raw);
}

function assertMethod(req, res, method) {
  if (req.method === method) return true;
  sendJson(res, 405, { error: `Use ${method} for this endpoint.` });
  return false;
}

function requireServerConfig() {
  const missing = [];
  if (!AUTH_SECRET) missing.push("AUTH_SECRET");
  if (!SUPABASE_URL) missing.push("SUPABASE_URL");
  if (!SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (missing.length) {
    const error = new Error(`Missing server environment variables: ${missing.join(", ")}`);
    error.statusCode = 500;
    throw error;
  }
}

function normalizeEmail(email) {
  const normalized = String(email || "").trim().toLowerCase();
  if ((normalized === "admin" || normalized === "eakhter@brooklynsteamcenter.org") && ADMIN_EMAIL) {
    return ADMIN_EMAIL;
  }
  return normalized;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ""));
}

function isAdminEmail(email) {
  return Boolean(ADMIN_EMAIL && normalizeEmail(email) === ADMIN_EMAIL);
}

function isReservedAdminPassword(password) {
  return String(password || "") === ADMIN_PASSWORD;
}

async function supabaseRequest(table, options = {}) {
  requireServerConfig();
  const query = options.query ? `?${options.query}` : "";
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}${query}`, {
    method: options.method || "GET",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(options.prefer ? { Prefer: options.prefer } : {}),
      ...(options.headers || {})
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = data?.message || data?.error || "Supabase request failed.";
    const error = new Error(message);
    error.statusCode = response.status;
    throw error;
  }

  return data;
}

async function findSiteUserByEmail(email) {
  const normalized = encodeURIComponent(normalizeEmail(email));
  const rows = await supabaseRequest("site_users", {
    query: `email=eq.${normalized}&select=*`
  });
  return rows[0] || null;
}

async function findSiteUserByGoogleId(googleId) {
  const rows = await supabaseRequest("site_users", {
    query: `google_id=eq.${encodeURIComponent(googleId)}&select=*`
  });
  return rows[0] || null;
}

async function createSiteUser(user) {
  const rows = await supabaseRequest("site_users", {
    method: "POST",
    prefer: "return=representation",
    body: user
  });
  return rows[0];
}

async function updateSiteUser(id, patch) {
  const rows = await supabaseRequest("site_users", {
    method: "PATCH",
    query: `id=eq.${encodeURIComponent(id)}`,
    prefer: "return=representation",
    body: { ...patch, updated_at: new Date().toISOString() }
  });
  return rows[0];
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const iterations = 310000;
  const hash = crypto.pbkdf2Sync(password, salt, iterations, 32, "sha256").toString("hex");
  return `pbkdf2_sha256$${iterations}$${salt}$${hash}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash) return false;
  const [algorithm, iterationsText, salt, expected] = storedHash.split("$");
  if (algorithm !== "pbkdf2_sha256" || !iterationsText || !salt || !expected) return false;
  const hash = crypto.pbkdf2Sync(password, salt, Number(iterationsText), 32, "sha256").toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(expected, "hex"));
}

function hashCode(code) {
  return crypto.createHmac("sha256", AUTH_SECRET).update(String(code)).digest("hex");
}

function generateCode() {
  return String(crypto.randomInt(100000, 1000000));
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    role: user.role || "student",
    displayName: user.display_name || user.email,
    profileImage: user.profile_image || "",
    providers: {
      google: Boolean(user.google_id),
      email: Boolean(user.password_hash)
    }
  };
}

async function createMfaChallenge(user, purpose = "login") {
  const code = generateCode();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const rows = await supabaseRequest("email_mfa_challenges", {
    method: "POST",
    prefer: "return=representation",
    body: {
      site_user_id: user.id,
      email: user.email,
      code_hash: hashCode(code),
      purpose,
      expires_at: expiresAt
    }
  });

  await sendMfaEmail(user.email, code, purpose);
  return {
    challengeId: rows[0].id,
    email: user.email
  };
}

async function verifyMfaChallenge(challengeId, code) {
  const rows = await supabaseRequest("email_mfa_challenges", {
    query: `id=eq.${encodeURIComponent(challengeId)}&select=*`
  });
  const challenge = rows[0];

  if (!challenge) {
    const error = new Error("MFA challenge was not found.");
    error.statusCode = 404;
    throw error;
  }
  if (challenge.used_at) {
    const error = new Error("MFA code was already used.");
    error.statusCode = 400;
    throw error;
  }
  if (new Date(challenge.expires_at).getTime() < Date.now()) {
    const error = new Error("MFA code expired. Try signing in again.");
    error.statusCode = 400;
    throw error;
  }
  if (challenge.code_hash !== hashCode(code)) {
    const error = new Error("MFA code does not match.");
    error.statusCode = 400;
    throw error;
  }

  await supabaseRequest("email_mfa_challenges", {
    method: "PATCH",
    query: `id=eq.${encodeURIComponent(challenge.id)}`,
    body: { used_at: new Date().toISOString() }
  });

  const users = await supabaseRequest("site_users", {
    query: `id=eq.${encodeURIComponent(challenge.site_user_id)}&select=*`
  });
  const user = users[0];
  if (!user) {
    const error = new Error("User account was not found.");
    error.statusCode = 404;
    throw error;
  }

  await updateSiteUser(user.id, { last_login: new Date().toISOString() });
  return user;
}

async function createPasswordResetChallenge(user, newPassword) {
  const code = generateCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const rows = await supabaseRequest("password_reset_challenges", {
    method: "POST",
    prefer: "return=representation",
    body: {
      site_user_id: user.id,
      email: user.email,
      code_hash: hashCode(code),
      pending_password_hash: hashPassword(newPassword),
      expires_at: expiresAt
    }
  });

  await sendPasswordResetEmail(user.email, code);
  return {
    challengeId: rows[0].id,
    email: user.email
  };
}

async function confirmPasswordReset(challengeId, email, code) {
  const rows = await supabaseRequest("password_reset_challenges", {
    query: `id=eq.${encodeURIComponent(challengeId)}&email=eq.${encodeURIComponent(normalizeEmail(email))}&select=*`
  });
  const challenge = rows[0];

  if (!challenge) {
    const error = new Error("Reset challenge was not found.");
    error.statusCode = 404;
    throw error;
  }
  if (challenge.used_at) {
    const error = new Error("Reset code was already used.");
    error.statusCode = 400;
    throw error;
  }
  if (new Date(challenge.expires_at).getTime() < Date.now()) {
    const error = new Error("Reset code expired. Send a new code.");
    error.statusCode = 400;
    throw error;
  }
  if (challenge.code_hash !== hashCode(code)) {
    const error = new Error("Reset code does not match.");
    error.statusCode = 400;
    throw error;
  }

  await updateSiteUser(challenge.site_user_id, { password_hash: challenge.pending_password_hash });
  await supabaseRequest("password_reset_challenges", {
    method: "PATCH",
    query: `id=eq.${encodeURIComponent(challenge.id)}`,
    body: { used_at: new Date().toISOString() }
  });
}

function getBaseUrl(req) {
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const protocol = req.headers["x-forwarded-proto"] || "https";
  return `${protocol}://${host}`;
}

function makeOAuthState() {
  if (!AUTH_SECRET) {
    const error = new Error("Missing AUTH_SECRET. Add AUTH_SECRET in Vercel Environment Variables and redeploy.");
    error.statusCode = 500;
    throw error;
  }

  const nonce = crypto.randomBytes(18).toString("hex");
  const expires = Date.now() + 10 * 60 * 1000;
  const payload = `${nonce}.${expires}`;
  const signature = crypto.createHmac("sha256", AUTH_SECRET).update(payload).digest("hex");
  return `${payload}.${signature}`;
}

function verifyOAuthState(state) {
  if (!AUTH_SECRET || !state) return false;
  const parts = String(state).split(".");
  if (parts.length !== 3) return false;
  const [nonce, expires, signature] = parts;
  if (Number(expires) < Date.now()) return false;
  const payload = `${nonce}.${expires}`;
  const expected = crypto.createHmac("sha256", AUTH_SECRET).update(payload).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

function isAuthSecretConfigured() {
  return Boolean(AUTH_SECRET);
}

function cookieHeader(name, value, maxAgeSeconds = 600) {
  return `${name}=${encodeURIComponent(value)}; Max-Age=${maxAgeSeconds}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

async function exchangeGoogleCode(req, code) {
  const clientId = String(process.env.GOOGLE_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.GOOGLE_CLIENT_SECRET || "").trim();
  const redirectUri = String(process.env.GOOGLE_REDIRECT_URI || "").trim() || CANONICAL_GOOGLE_REDIRECT_URI;
  const missing = [];
  if (!clientId) missing.push("GOOGLE_CLIENT_ID");
  if (!clientSecret) missing.push("GOOGLE_CLIENT_SECRET");
  if (!redirectUri) missing.push("GOOGLE_REDIRECT_URI");
  if (missing.length) {
    const error = new Error(`Missing Google OAuth variables: ${missing.join(", ")}`);
    error.statusCode = 500;
    throw error;
  }

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code"
    })
  });
  const tokenData = await tokenResponse.json();
  if (!tokenResponse.ok) {
    const error = new Error(tokenData.error_description || tokenData.error || "Google token exchange failed.");
    error.statusCode = 400;
    throw error;
  }

  const infoResponse = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(tokenData.id_token)}`);
  const profile = await infoResponse.json();
  if (!infoResponse.ok || profile.aud !== clientId || profile.email_verified !== "true") {
    const error = new Error("Google account verification failed.");
    error.statusCode = 400;
    throw error;
  }

  return {
    googleId: profile.sub,
    email: normalizeEmail(profile.email),
    displayName: profile.name || profile.email,
    profileImage: profile.picture || ""
  };
}

async function sendMfaEmail(email, code, purpose) {
  const subject = purpose === "google" ? "SOC Bootcamp Google sign-in code" : "SOC Bootcamp MFA code";
  await sendEmail({
    to: email,
    subject,
    text: `Your SOC Bootcamp verification code is ${code}. It expires in 5 minutes.`,
    html: `<p>Your SOC Bootcamp verification code is <strong>${code}</strong>.</p><p>It expires in 5 minutes.</p>`
  });
}

async function sendPasswordResetEmail(email, code) {
  await sendEmail({
    to: email,
    subject: "SOC Bootcamp password reset code",
    text: `Your SOC Bootcamp password reset code is ${code}. It expires in 10 minutes.`,
    html: `<p>Your SOC Bootcamp password reset code is <strong>${code}</strong>.</p><p>It expires in 10 minutes.</p>`
  });
}

async function sendEmail(message) {
  const host = String(process.env.SMTP_HOST || "smtp.gmail.com").trim();
  const port = Number(String(process.env.SMTP_PORT || 465).trim());
  const user = String(process.env.SMTP_USER || "").trim();
  const pass = String(process.env.SMTP_PASS || "").trim().replace(/\s+/g, "");
  const from = String(process.env.EMAIL_FROM || user).trim();
  const missing = [];
  if (!host) missing.push("SMTP_HOST");
  if (!user) missing.push("SMTP_USER");
  if (!pass) missing.push("SMTP_PASS");
  if (!from) missing.push("EMAIL_FROM");
  if (missing.length) {
    const error = new Error(`SMTP is not configured. Missing: ${missing.join(", ")}`);
    error.statusCode = 500;
    throw error;
  }
  if (port !== 465) {
    const error = new Error("This lightweight SMTP sender expects Gmail SMTP_PORT=465.");
    error.statusCode = 500;
    throw error;
  }
  if (/\s/.test(host)) {
    const error = new Error("SMTP_HOST contains spaces or hidden new lines. Set it to smtp.gmail.com exactly.");
    error.statusCode = 500;
    throw error;
  }

  const socket = tls.connect(port, host, { servername: host });
  socket.setEncoding("utf8");
  const smtp = createSmtpClient(socket);
  await smtp.expect(220);
  await smtp.command(`EHLO ${host}`, 250);
  await smtp.command("AUTH LOGIN", 334);
  await smtp.command(Buffer.from(user).toString("base64"), 334);
  await smtp.command(Buffer.from(pass).toString("base64"), 235);
  await smtp.command(`MAIL FROM:<${extractEmail(from)}>`, 250);
  await smtp.command(`RCPT TO:<${message.to}>`, 250);
  await smtp.command("DATA", 354);
  await smtp.command(formatEmail(from, message), 250, true);
  await smtp.command("QUIT", 221).catch(() => {});
  socket.end();
}

function createSmtpClient(socket) {
  let buffer = "";
  const waiters = [];
  socket.on("data", (chunk) => {
    buffer += chunk;
    flushWaiters();
  });
  socket.on("error", (error) => {
    while (waiters.length) waiters.shift().reject(error);
  });

  function flushWaiters() {
    while (waiters.length) {
      const line = readSmtpResponse();
      if (!line) return;
      waiters.shift().resolve(line);
    }
  }

  function readSmtpResponse() {
    const lines = buffer.split("\r\n");
    let endLine = -1;
    let byteEnd = 0;

    for (let index = 0; index < lines.length - 1; index += 1) {
      byteEnd += Buffer.byteLength(lines[index] + "\r\n");
      if (/^\d{3} /.test(lines[index])) {
        endLine = index;
        break;
      }
    }

    if (endLine === -1) return null;
    const response = buffer.slice(0, byteEnd);
    buffer = buffer.slice(byteEnd);
    return response;
  }

  function expect(code) {
    return new Promise((resolve, reject) => {
      waiters.push({
        resolve(response) {
          if (!response.startsWith(String(code))) {
            reject(new Error(`SMTP expected ${code}, received ${response.trim()}`));
            return;
          }
          resolve(response);
        },
        reject
      });
      flushWaiters();
    });
  }

  return {
    expect,
    async command(commandText, expectedCode, isData = false) {
      socket.write(isData ? `${commandText}\r\n.\r\n` : `${commandText}\r\n`);
      return expect(expectedCode);
    }
  };
}

function extractEmail(value) {
  const match = String(value).match(/<([^>]+)>/);
  return match ? match[1] : String(value);
}

function formatEmail(from, message) {
  const headers = [
    `From: ${from}`,
    `To: ${message.to}`,
    `Subject: ${message.subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=UTF-8"
  ];
  return `${headers.join("\r\n")}\r\n\r\n${message.html || message.text}`;
}

function handleError(res, error) {
  console.error("[soc-auth]", error.statusCode || 500, error.message || "Server request failed");
  sendJson(res, error.statusCode || 500, { error: error.message || "Server request failed" });
}

module.exports = {
  assertMethod,
  confirmPasswordReset,
  cookieHeader,
  createMfaChallenge,
  createPasswordResetChallenge,
  createSiteUser,
  exchangeGoogleCode,
  findSiteUserByEmail,
  findSiteUserByGoogleId,
  getBaseUrl,
  handleError,
  hashPassword,
  isAdminEmail,
  isAuthSecretConfigured,
  isReservedAdminPassword,
  isValidEmail,
  makeOAuthState,
  normalizeEmail,
  publicUser,
  readJson,
  redirect,
  sendJson,
  updateSiteUser,
  verifyMfaChallenge,
  verifyOAuthState,
  verifyPassword
};
