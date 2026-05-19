const http = require("node:http");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const net = require("node:net");
const tls = require("node:tls");

loadDotEnv();

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "localhost";
const ROOT = __dirname;
const DATA_FILE = process.env.AUTH_DATA_FILE
  ? path.resolve(process.env.AUTH_DATA_FILE)
  : path.join(ROOT, "data", "auth-store.json");
const DATA_DIR = path.dirname(DATA_FILE);
const AUTH_SECRET = process.env.AUTH_SECRET || process.env.SESSION_SECRET || "dev-only-change-me";
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const SESSION_COOKIE = "soc_session";
const MFA_TTL_MS = Number(process.env.MFA_CODE_TTL_MINUTES || 5) * 60 * 1000;
const RESET_TTL_MS = Number(process.env.PASSWORD_RESET_TTL_MINUTES || 10) * 60 * 1000;
const RATE_WINDOW_MS = 15 * 60 * 1000;
const rateLimits = new Map();

const CERTIFICATIONS = [
  "Pearson Cybersecurity",
  "Pearson Network Security",
  "Pearson Networking",
  "CompTIA Network Plus",
  "CompTIA Security Plus"
];

const RESERVED_ADMIN_USERNAME = "admin";
const RESERVED_ADMIN_EMAIL = "admin@socbootcamp.local";
const RESERVED_ADMIN_PASSWORD = "akhter44";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

async function main() {
  await ensureStore();

  const server = http.createServer(async (req, res) => {
    try {
      applyCorsHeaders(req, res);
      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }
      await handleRequest(req, res);
    } catch (error) {
      console.error("[server:error]", error);
      sendJson(res, 500, { error: "Internal server error" });
    }
  });

  server.listen(PORT, HOST, () => {
    console.log(`SOC Bootcamp server running at http://${HOST}:${PORT}/login.html`);
  });
}

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);

  if (url.pathname.startsWith("/api/")) {
    await routeApi(req, res, url);
    return;
  }

  await serveStatic(res, url.pathname);
}

async function routeApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/auth/me") {
    const session = await getSession(req);
    if (!session) {
      sendJson(res, 200, { user: null });
      return;
    }

    const store = await readStore();
    const user = store.users[session.userId];
    sendJson(res, 200, { user: publicUser(user), csrfToken: session.csrf });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/signup") {
    await handleSignup(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    await handleLogin(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/mfa/verify") {
    await handleMfaVerify(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/logout") {
    await handleLogout(req, res);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/auth/google/start") {
    await handleGoogleStart(req, res);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/auth/google/callback") {
    await handleGoogleCallback(req, res, url);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/password-reset/request") {
    await handleResetRequest(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/password-reset/confirm") {
    await handleResetConfirm(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/progress/selection") {
    await handleProgressSelection(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/progress/scores") {
    await handleProgressScores(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/progress/quiz-attempt") {
    await handleQuizAttempt(req, res);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/users") {
    await handleAdminUsers(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/admin/scores") {
    await handleAdminScoreUpdate(req, res);
    return;
  }

  sendJson(res, 404, { error: "API route not found" });
}

async function handleSignup(req, res) {
  const body = await readJsonBody(req);
  const email = normalizeEmail(body.email);
  const password = String(body.password || "");
  const displayName = String(body.displayName || "").trim() || email.split("@")[0];

  if (!isValidEmail(email)) {
    sendJson(res, 400, { error: "Valid email is required" });
    return;
  }

  if (password.length < 8) {
    sendJson(res, 400, { error: "Password must be at least 8 characters" });
    return;
  }

  if (isRateLimited(`signup:${req.socket.remoteAddress}`, 12)) {
    sendJson(res, 429, { error: "Too many signup attempts. Try again later." });
    return;
  }

  const store = await readStore();
  if (findUserByEmail(store, email)) {
    sendJson(res, 409, { error: "An account already exists for that email" });
    return;
  }

  const user = createUser({ email, displayName, role: "student", password });
  store.users[user.id] = user;
  store.progress[user.id] = createEmptyProgress();
  await writeStore(store);

  const challenge = await createEmailChallenge(store, user, "mfa", "SOC Bootcamp MFA Code");
  await writeStore(store);
  sendJson(res, 200, challengeResponse(challenge));
}

async function handleLogin(req, res) {
  const body = await readJsonBody(req);
  const identifier = String(body.email || body.username || "").trim();
  const normalizedIdentifier = normalizeEmail(identifier);
  const email = [RESERVED_ADMIN_USERNAME, RESERVED_ADMIN_EMAIL].includes(normalizedIdentifier)
    ? getReservedAdminEmail()
    : normalizedIdentifier;
  const password = String(body.password || "");

  if (isRateLimited(`login:${email}:${req.socket.remoteAddress}`, 8)) {
    sendJson(res, 429, { error: "Too many login attempts. Try again later." });
    return;
  }

  const store = await readStore();
  const user = findUserByEmail(store, email);
  if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
    sendJson(res, 401, { error: "Email or password is incorrect" });
    return;
  }

  const challenge = await createEmailChallenge(store, user, "mfa", "SOC Bootcamp MFA Code");
  await writeStore(store);
  sendJson(res, 200, challengeResponse(challenge));
}

async function handleMfaVerify(req, res) {
  const body = await readJsonBody(req);
  const challengeId = String(body.challengeId || "");
  const code = String(body.code || "").trim();
  const store = await readStore();
  const challenge = store.mfaChallenges[challengeId];

  if (!challenge || challenge.used || Date.now() > new Date(challenge.expiresAt).getTime()) {
    sendJson(res, 400, { error: "MFA code is invalid or expired" });
    return;
  }

  if (isRateLimited(`mfa:${challengeId}`, 6)) {
    sendJson(res, 429, { error: "Too many MFA attempts. Request a new code." });
    return;
  }

  if (!verifyCode(code, challenge.codeHash)) {
    sendJson(res, 401, { error: "MFA code does not match" });
    return;
  }

  challenge.used = true;
  const session = createSession(challenge.userId);
  store.sessions[session.id] = session;
  await writeStore(store);

  const user = store.users[challenge.userId];
  setSessionCookie(res, session.id);
  sendJson(res, 200, {
    user: publicUser(user),
    csrfToken: session.csrf,
    redirect: user.role === "admin" ? "admin.html" : "index.html"
  });
}

async function handleLogout(req, res) {
  const cookies = parseCookies(req.headers.cookie || "");
  const sessionId = cookies[SESSION_COOKIE];
  if (sessionId) {
    const store = await readStore();
    delete store.sessions[sessionId];
    await writeStore(store);
  }
  clearSessionCookie(res);
  sendJson(res, 200, { ok: true });
}

async function handleGoogleStart(req, res) {
  const required = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI"];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length) {
    redirect(res, `/login.html?authError=google_not_configured&missing=${encodeURIComponent(missing.join(","))}`);
    return;
  }

  const store = await readStore();
  const state = randomToken(24);
  store.oauthStates[state] = {
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString()
  };
  await writeStore(store);

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", process.env.GOOGLE_REDIRECT_URI);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("prompt", "select_account");
  redirect(res, authUrl.toString());
}

async function handleGoogleCallback(req, res, url) {
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const store = await readStore();
  const savedState = store.oauthStates[state];
  delete store.oauthStates[state];

  if (!code || !savedState || Date.now() > new Date(savedState.expiresAt).getTime()) {
    await writeStore(store);
    redirect(res, "/login.html?authError=invalid_google_state");
    return;
  }

  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI,
        grant_type: "authorization_code"
      })
    });

    if (!tokenResponse.ok) {
      throw new Error(`Token exchange failed: ${tokenResponse.status}`);
    }

    const tokens = await tokenResponse.json();
    const infoResponse = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(tokens.id_token)}`);
    if (!infoResponse.ok) {
      throw new Error(`ID token validation failed: ${infoResponse.status}`);
    }

    const profile = await infoResponse.json();
    if (profile.aud !== process.env.GOOGLE_CLIENT_ID || !["accounts.google.com", "https://accounts.google.com"].includes(profile.iss)) {
      throw new Error("Google token audience or issuer mismatch");
    }

    const email = normalizeEmail(profile.email);
    let user = findUserByEmail(store, email);
    if (!user) {
      user = createUser({
        email,
        displayName: profile.name || email.split("@")[0],
        role: "student",
        provider: "google",
        googleProfile: profile
      });
      store.users[user.id] = user;
      store.progress[user.id] = createEmptyProgress();
    } else {
      user.providers.google = {
        providerId: profile.sub,
        email,
        displayName: profile.name || user.displayName,
        profileImage: profile.picture || "",
        linkedAt: new Date().toISOString()
      };
      user.displayName = user.displayName || profile.name || email.split("@")[0];
      user.profileImage = user.profileImage || profile.picture || "";
    }

    const challenge = await createEmailChallenge(store, user, "mfa", "SOC Bootcamp Google Login MFA Code");
    await writeStore(store);
    redirect(res, `/login.html?serverMfa=${encodeURIComponent(challenge.id)}&email=${encodeURIComponent(user.email)}&oauth=google`);
  } catch (error) {
    console.error("[oauth:error]", error);
    await writeStore(store);
    redirect(res, "/login.html?authError=google_oauth_failed");
  }
}

async function handleResetRequest(req, res) {
  const body = await readJsonBody(req);
  const email = normalizeEmail(body.email);

  if (!isValidEmail(email)) {
    sendJson(res, 400, { error: "Valid email is required" });
    return;
  }

  if (isRateLimited(`reset:${email}:${req.socket.remoteAddress}`, 5)) {
    sendJson(res, 429, { error: "Too many password reset attempts. Try later." });
    return;
  }

  const store = await readStore();
  const user = findUserByEmail(store, email);
  if (!user) {
    sendJson(res, 200, { ok: true, message: "If that account exists, a reset code was sent." });
    return;
  }

  const code = secureNumericCode();
  const challenge = {
    id: randomToken(18),
    userId: user.id,
    email,
    codeHash: hashCode(code),
    used: false,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + RESET_TTL_MS).toISOString()
  };
  store.resetChallenges[challenge.id] = challenge;
  const delivery = await sendEmail({
    to: email,
    subject: "SOC Bootcamp Password Reset Code",
    text: `Your SOC Bootcamp password reset code is ${code}. It expires in ${Math.round(RESET_TTL_MS / 60000)} minutes.`
  });
  await writeStore(store);
  sendJson(res, 200, {
    ok: true,
    challengeId: challenge.id,
    email,
    devCode: delivery.devCode ? code : undefined,
    message: "If that account exists, a reset code was sent."
  });
}

async function handleResetConfirm(req, res) {
  const body = await readJsonBody(req);
  const challengeId = String(body.challengeId || "");
  const email = normalizeEmail(body.email);
  const code = String(body.code || "").trim();
  const newPassword = String(body.newPassword || "");

  if (!isValidEmail(email) || newPassword.length < 8) {
    sendJson(res, 400, { error: "Valid email and an 8+ character password are required" });
    return;
  }

  const store = await readStore();
  const challenge = store.resetChallenges[challengeId];
  if (!challenge || challenge.used || challenge.email !== email || Date.now() > new Date(challenge.expiresAt).getTime()) {
    sendJson(res, 400, { error: "Reset code is invalid or expired" });
    return;
  }

  if (!verifyCode(code, challenge.codeHash)) {
    sendJson(res, 401, { error: "Reset code does not match" });
    return;
  }

  const user = store.users[challenge.userId];
  user.passwordHash = hashPassword(newPassword);
  challenge.used = true;
  await writeStore(store);
  sendJson(res, 200, { ok: true });
}

async function handleProgressSelection(req, res) {
  const auth = await requireSession(req, res);
  if (!auth) return;
  const body = await readJsonBody(req);
  const certification = String(body.certification || "");
  if (certification && !CERTIFICATIONS.includes(certification)) {
    sendJson(res, 400, { error: "Unknown certification" });
    return;
  }
  const store = await readStore();
  const progress = store.progress[auth.user.id] || createEmptyProgress();
  progress.selectedCertification = certification || progress.selectedCertification;
  progress.selectedPracticeExam = String(body.practiceExam || progress.selectedPracticeExam || "");
  progress.updatedAt = new Date().toISOString();
  store.progress[auth.user.id] = progress;
  await writeStore(store);
  sendJson(res, 200, { progress });
}

async function handleProgressScores(req, res) {
  const auth = await requireSession(req, res);
  if (!auth) return;
  const body = await readJsonBody(req);
  const certification = String(body.certification || body.certificationName || "");
  if (!CERTIFICATIONS.includes(certification)) {
    sendJson(res, 400, { error: "Unknown certification" });
    return;
  }
  const updates = scoreUpdatesFromBody(body);
  const store = await readStore();
  upsertProgressRecord(store, auth.user.id, certification, updates);
  await writeStore(store);
  sendJson(res, 200, { progress: store.progress[auth.user.id] });
}

async function handleQuizAttempt(req, res) {
  const auth = await requireSession(req, res);
  if (!auth) return;
  const body = await readJsonBody(req);
  const certification = String(body.certification || "");
  if (!CERTIFICATIONS.includes(certification) && certification !== "Kali Linux Guide") {
    sendJson(res, 400, { error: "Unknown certification" });
    return;
  }
  const store = await readStore();
  const progress = store.progress[auth.user.id] || createEmptyProgress();
  const attempt = {
    id: randomToken(10),
    userId: auth.user.id,
    quizId: String(body.quizId || ""),
    title: String(body.title || "Certification Quiz"),
    certification,
    score: Number(body.score || 0),
    total: Number(body.total || 0),
    percent: Number(body.percent || 0),
    timestamp: new Date().toISOString()
  };
  progress.quizAttempts = [attempt, ...(progress.quizAttempts || [])].slice(0, 50);
  store.progress[auth.user.id] = progress;
  await writeStore(store);
  sendJson(res, 200, { attempt, progress });
}

async function handleAdminUsers(req, res) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const store = await readStore();
  const users = Object.values(store.users).map((user) => ({
    ...publicUser(user),
    progress: store.progress[user.id] || createEmptyProgress()
  }));
  sendJson(res, 200, { users, certifications: CERTIFICATIONS, csrfToken: auth.session.csrf });
}

async function handleAdminScoreUpdate(req, res) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  if (!validateCsrf(req, auth.session)) {
    sendJson(res, 403, { error: "CSRF validation failed" });
    return;
  }
  const body = await readJsonBody(req);
  const userId = String(body.userId || "");
  const certification = String(body.certification || "");
  if (!CERTIFICATIONS.includes(certification)) {
    sendJson(res, 400, { error: "Unknown certification" });
    return;
  }
  const store = await readStore();
  if (!store.users[userId]) {
    sendJson(res, 404, { error: "User not found" });
    return;
  }
  upsertProgressRecord(store, userId, certification, {
    ...scoreUpdatesFromBody(body),
    status: normalizeStatus(body.status)
  });
  await writeStore(store);
  sendJson(res, 200, { progress: store.progress[userId] });
}

function scoreUpdatesFromBody(body) {
  return {
    prepScore: normalizeScore(body.prepScore),
    questionBankScore: normalizeScore(body.questionBankScore),
    practiceExamScore: normalizeScore(body.practiceExamScore),
    status: body.status ? normalizeStatus(body.status) : undefined
  };
}

function upsertProgressRecord(store, userId, certification, updates) {
  const progress = store.progress[userId] || createEmptyProgress();
  const existing = progress.certifications[certification] || {};
  progress.certifications[certification] = {
    status: "Studying",
    prepScore: "",
    questionBankScore: "",
    practiceExamScore: "",
    ...existing,
    ...removeUndefined(updates),
    updatedAt: new Date().toISOString()
  };
  progress.selectedCertification = certification;
  progress.updatedAt = new Date().toISOString();
  store.progress[userId] = progress;
}

async function requireSession(req, res) {
  const session = await getSession(req);
  if (!session) {
    sendJson(res, 401, { error: "Authentication required" });
    return null;
  }
  const store = await readStore();
  const user = store.users[session.userId];
  if (!user) {
    sendJson(res, 401, { error: "Invalid session" });
    return null;
  }
  return { session, user, store };
}

async function requireAdmin(req, res) {
  const auth = await requireSession(req, res);
  if (!auth) return null;
  if (auth.user.role !== "admin") {
    sendJson(res, 403, { error: "Admin access required" });
    return null;
  }
  return auth;
}

async function getSession(req) {
  const cookies = parseCookies(req.headers.cookie || "");
  const sessionId = cookies[SESSION_COOKIE];
  if (!sessionId) return null;
  const store = await readStore();
  const session = store.sessions[sessionId];
  if (!session || Date.now() > new Date(session.expiresAt).getTime()) {
    if (session) {
      delete store.sessions[sessionId];
      await writeStore(store);
    }
    return null;
  }
  return session;
}

function createSession(userId) {
  return {
    id: randomToken(32),
    userId,
    csrf: randomToken(24),
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString()
  };
}

async function createEmailChallenge(store, user, purpose, subject) {
  const code = secureNumericCode();
  const challenge = {
    id: randomToken(18),
    userId: user.id,
    email: user.email,
    purpose,
    codeHash: hashCode(code),
    used: false,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + MFA_TTL_MS).toISOString()
  };
  store.mfaChallenges[challenge.id] = challenge;
  const delivery = await sendEmail({
    to: user.email,
    subject,
    text: `Your SOC Bootcamp verification code is ${code}. It expires in ${Math.round(MFA_TTL_MS / 60000)} minutes.`
  });
  Object.defineProperty(challenge, "devCode", {
    value: delivery.devCode ? code : undefined,
    enumerable: false
  });
  return challenge;
}

function challengeResponse(challenge) {
  return {
    mfaRequired: true,
    challengeId: challenge.id,
    email: challenge.email,
    expiresAt: challenge.expiresAt,
    devCode: challenge.devCode
  };
}

async function sendEmail({ to, subject, text }) {
  const config = smtpConfig();
  if (!config.ready) {
    console.warn(`[email:dev] ${subject} -> ${to}: ${text}`);
    return { sent: false, devCode: true };
  }

  try {
    await smtpSend(config, {
      from: process.env.EMAIL_FROM,
      to,
      subject,
      text
    });
    return { sent: true };
  } catch (error) {
    console.error("[smtp:error]", error);
    throw new Error("Email delivery failed");
  }
}

function smtpConfig() {
  const required = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "EMAIL_FROM"];
  const missing = required.filter((name) => !process.env[name]);
  return {
    ready: missing.length === 0,
    missing,
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  };
}

async function smtpSend(config, message) {
  const socket = config.port === 465
    ? tls.connect({ host: config.host, port: config.port, servername: config.host })
    : net.connect({ host: config.host, port: config.port });

  const smtp = createSmtpSession(socket);
  await smtp.expect(220);
  await smtp.command(`EHLO ${HOST}`, 250);

  if (config.port !== 465) {
    await smtp.command("STARTTLS", 220);
    const secureSocket = tls.connect({ socket, servername: config.host });
    smtp.replaceSocket(secureSocket);
    await smtp.command(`EHLO ${HOST}`, 250);
  }

  await smtp.command("AUTH LOGIN", 334);
  await smtp.command(Buffer.from(config.user).toString("base64"), 334);
  await smtp.command(Buffer.from(config.pass).toString("base64"), 235);
  await smtp.command(`MAIL FROM:<${message.from}>`, 250);
  await smtp.command(`RCPT TO:<${message.to}>`, 250);
  await smtp.command("DATA", 354);
  await smtp.command(formatEmailMessage(message), 250, true);
  await smtp.command("QUIT", 221);
  smtp.end();
}

function createSmtpSession(initialSocket) {
  let socket = initialSocket;
  let buffer = "";
  let waiters = [];

  const onData = (chunk) => {
    buffer += chunk.toString("utf8");
    flush();
  };
  socket.on("data", onData);

  function flush() {
    if (!waiters.length) return;
    const lines = buffer.split(/\r?\n/).filter(Boolean);
    if (!lines.length) return;
    const last = lines[lines.length - 1];
    const match = last.match(/^(\d{3})\s/);
    if (!match) return;
    const waiter = waiters.shift();
    const response = buffer;
    buffer = "";
    waiter.resolve({ code: Number(match[1]), response });
  }

  return {
    replaceSocket(nextSocket) {
      socket.removeListener("data", onData);
      socket = nextSocket;
      buffer = "";
      socket.on("data", onData);
    },
    expect(expectedCode) {
      return new Promise((resolve, reject) => {
        waiters.push({
          resolve: ({ code, response }) => code === expectedCode ? resolve(response) : reject(new Error(response))
        });
        flush();
      });
    },
    async command(commandText, expectedCode, isData = false) {
      socket.write(isData ? `${commandText}\r\n.\r\n` : `${commandText}\r\n`);
      return this.expect(expectedCode);
    },
    end() {
      socket.end();
    }
  };
}

function formatEmailMessage({ from, to, subject, text }) {
  const escapedText = text.replace(/^\./gm, "..");
  return [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "",
    escapedText
  ].join("\r\n");
}

async function serveStatic(res, pathname) {
  const cleanPath = decodeURIComponent(pathname === "/" ? "/login.html" : pathname);
  const filePath = path.normalize(path.join(ROOT, cleanPath));
  if (!filePath.startsWith(ROOT)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  try {
    const stats = await fsp.stat(filePath);
    if (!stats.isFile()) {
      sendText(res, 404, "Not found");
      return;
    }
    const extension = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME_TYPES[extension] || "application/octet-stream" });
    fs.createReadStream(filePath).pipe(res);
  } catch {
    sendText(res, 404, "Not found");
  }
}

async function ensureStore() {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  let store;
  try {
    store = JSON.parse(await fsp.readFile(DATA_FILE, "utf8"));
  } catch {
    store = emptyStore();
  }

  seedRequiredUsers(store);
  await writeStore(store);
}

function emptyStore() {
  return {
    users: {},
    progress: {},
    sessions: {},
    mfaChallenges: {},
    resetChallenges: {},
    oauthStates: {}
  };
}

function seedRequiredUsers(store) {
  const adminEmail = getReservedAdminEmail();
  const adminPassword = getReservedAdminPassword();

  Object.values(store.users).forEach((user) => {
    if (user.email !== adminEmail && user.role === "admin") {
      user.role = "student";
      user.updatedAt = new Date().toISOString();
    }
  });

  const admin = findUserByEmail(store, adminEmail);
  if (!admin) {
    const user = createUser({
      email: adminEmail,
      displayName: "Admin",
      role: "admin",
      password: adminPassword
    });
    user.legacyUsername = RESERVED_ADMIN_USERNAME;
    store.users[user.id] = user;
    store.progress[user.id] = createEmptyProgress();
  } else {
    admin.role = "admin";
    admin.displayName = "Admin";
    admin.legacyUsername = RESERVED_ADMIN_USERNAME;
    admin.passwordHash = hashPassword(adminPassword);
    admin.updatedAt = new Date().toISOString();
  }

  const studentEmail = "student@socbootcamp.local";
  if (!findUserByEmail(store, studentEmail)) {
    const user = createUser({
      email: studentEmail,
      displayName: "Student Analyst",
      role: "student",
      password: "student123"
    });
    store.users[user.id] = user;
    store.progress[user.id] = createEmptyProgress();
  }
}

function getReservedAdminEmail() {
  return normalizeEmail(process.env.ADMIN_EMAIL || RESERVED_ADMIN_EMAIL);
}

function getReservedAdminPassword() {
  return process.env.ADMIN_PASSWORD || RESERVED_ADMIN_PASSWORD;
}

async function readStore() {
  return JSON.parse(await fsp.readFile(DATA_FILE, "utf8"));
}

async function writeStore(store) {
  await fsp.writeFile(DATA_FILE, JSON.stringify(store, null, 2));
}

function createUser({ email, displayName, role, password, provider, googleProfile }) {
  const user = {
    id: crypto.randomUUID(),
    email: normalizeEmail(email),
    displayName: displayName || normalizeEmail(email).split("@")[0],
    role: role || "student",
    profileImage: googleProfile?.picture || "",
    providers: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (password) {
    user.passwordHash = hashPassword(password);
  }

  if (provider === "google" && googleProfile) {
    user.providers.google = {
      providerId: googleProfile.sub,
      email: user.email,
      displayName: googleProfile.name || user.displayName,
      profileImage: googleProfile.picture || "",
      linkedAt: new Date().toISOString()
    };
  }

  return user;
}

function createEmptyProgress() {
  return {
    selectedCertification: "",
    selectedPracticeExam: "",
    certifications: {},
    quizAttempts: [],
    updatedAt: ""
  };
}

function hashPassword(password) {
  const salt = randomToken(16);
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [scheme, salt, hash] = String(stored || "").split(":");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return expected.length === candidate.length && crypto.timingSafeEqual(candidate, expected);
}

function hashCode(code) {
  const salt = randomToken(12);
  const digest = crypto.createHmac("sha256", AUTH_SECRET).update(`${salt}:${code}`).digest("hex");
  return `${salt}:${digest}`;
}

function verifyCode(code, stored) {
  const [salt, digest] = String(stored || "").split(":");
  if (!salt || !digest) return false;
  const candidate = crypto.createHmac("sha256", AUTH_SECRET).update(`${salt}:${code}`).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(digest));
}

function findUserByEmail(store, email) {
  const normalized = normalizeEmail(email);
  return Object.values(store.users).find((user) => user.email === normalized);
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    profileImage: user.profileImage || "",
    providers: user.providers || {}
  };
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ""));
}

function normalizeScore(value) {
  if (value === undefined || value === null || value === "") return "";
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100) return "";
  return String(Math.round(numeric));
}

function normalizeStatus(status) {
  const allowed = ["Not Started", "Studying", "Practice Ready", "Exam Ready", "Certified", "Failed"];
  return allowed.includes(status) ? status : "Studying";
}

function removeUndefined(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));
}

function secureNumericCode() {
  return String(crypto.randomInt(100000, 1000000));
}

function randomToken(bytes) {
  return crypto.randomBytes(bytes).toString("base64url");
}

function isRateLimited(key, limit) {
  const now = Date.now();
  const record = rateLimits.get(key) || { count: 0, resetAt: now + RATE_WINDOW_MS };
  if (now > record.resetAt) {
    record.count = 0;
    record.resetAt = now + RATE_WINDOW_MS;
  }
  record.count += 1;
  rateLimits.set(key, record);
  return record.count > limit;
}

async function readJsonBody(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 1_000_000) throw new Error("Request body too large");
  }
  return body ? JSON.parse(body) : {};
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function sendText(res, status, text) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

function redirect(res, location) {
  res.writeHead(302, { Location: location });
  res.end();
}

function parseCookies(cookieHeader) {
  return Object.fromEntries(cookieHeader.split(";").filter(Boolean).map((cookie) => {
    const [name, ...value] = cookie.trim().split("=");
    return [name, decodeURIComponent(value.join("="))];
  }));
}

function setSessionCookie(res, sessionId) {
  const secure = IS_PRODUCTION ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200${secure}`);
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

function validateCsrf(req, session) {
  return req.headers["x-csrf-token"] && req.headers["x-csrf-token"] === session.csrf;
}

function applyCorsHeaders(req, res) {
  const origin = req.headers.origin;
  if (!origin || !isAllowedDevOrigin(origin)) {
    return;
  }

  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-csrf-token");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Vary", "Origin");
}

function isAllowedDevOrigin(origin) {
  return origin === "null" || /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin);
}

function loadDotEnv() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (!match) return;
    const key = match[1].trim();
    const value = match[2].trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
