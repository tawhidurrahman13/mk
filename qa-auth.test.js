const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const ROOT = __dirname;
const TEST_PORT = 3100;
const TEST_STORE = path.join(ROOT, "data", "auth-store-qa.json");
const BASE_URL = `http://localhost:${TEST_PORT}`;

async function main() {
  fs.rmSync(TEST_STORE, { force: true });
  const server = spawn(process.execPath, ["server.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(TEST_PORT),
      HOST: "localhost",
      AUTH_SECRET: "qa-secret-change-me",
      SESSION_SECRET: "qa-session-change-me",
      AUTH_DATA_FILE: TEST_STORE,
      ADMIN_EMAIL: "admin@socbootcamp.local",
      ADMIN_PASSWORD: "akhter44",
      GOOGLE_CLIENT_ID: "",
      GOOGLE_CLIENT_SECRET: "",
      GOOGLE_REDIRECT_URI: `http://localhost:${TEST_PORT}/api/auth/google/callback`,
      SMTP_HOST: "",
      SMTP_PORT: "",
      SMTP_USER: "",
      SMTP_PASS: "",
      EMAIL_FROM: ""
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stderr = "";
  server.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  try {
    await waitForServer();

    const googleStart = await fetch(`${BASE_URL}/api/auth/google/start`, { redirect: "manual" });
    assert.equal(googleStart.status, 302);
    assert.match(googleStart.headers.get("location") || "", /google_not_configured|accounts\.google\.com/);

    const qaEmail = `qa-${Date.now()}@example.com`;
    const signup = await postJson("/api/auth/signup", {
      email: qaEmail,
      password: "Testing123!",
      displayName: "QA Student"
    });
    assert.equal(signup.status, 200);
    assert.ok(signup.body.challengeId);
    assert.ok(signup.body.devCode);

    const studentMfa = await postJson("/api/auth/mfa/verify", {
      challengeId: signup.body.challengeId,
      code: signup.body.devCode
    });
    assert.equal(studentMfa.status, 200);
    assert.equal(studentMfa.body.user.role, "student");
    assert.equal(studentMfa.body.redirect, "welcome.html");
    const studentCookie = getCookie(studentMfa.response);

    const practiceAttempt = await postJson("/api/progress/practice-exam-attempt", {
      title: "Pearson Network Security Full Length Practice Exam",
      certification: "Pearson Network Security",
      score: 37,
      total: 50,
      percent: 74,
      subunitResults: [
        { subunit: "ACL Design", percent: 55, correct: 5, total: 9 },
        { subunit: "Threats", percent: 86, correct: 6, total: 7 }
      ],
      questionReview: [
        { subunit: "ACL Design", isCorrect: false, answerState: "unanswered" }
      ]
    }, studentCookie);
    assert.equal(practiceAttempt.status, 200);
    assert.equal(practiceAttempt.body.progress.practiceExamAttempts.length, 1);

    const reset = await postJson("/api/auth/password-reset/request", { email: qaEmail });
    assert.equal(reset.status, 200);
    assert.ok(reset.body.challengeId);
    assert.ok(reset.body.devCode);

    const resetConfirm = await postJson("/api/auth/password-reset/confirm", {
      challengeId: reset.body.challengeId,
      email: qaEmail,
      code: reset.body.devCode,
      newPassword: "Testing1234!"
    });
    assert.equal(resetConfirm.status, 200);

    const relogin = await postJson("/api/auth/login", {
      email: qaEmail,
      password: "Testing1234!"
    });
    assert.equal(relogin.status, 200);
    assert.ok(relogin.body.challengeId);

    const adminLogin = await postJson("/api/auth/login", {
      email: "admin",
      password: "akhter44"
    });
    assert.equal(adminLogin.status, 200);
    assert.ok(adminLogin.body.challengeId);
    assert.ok(adminLogin.body.devCode);

    const adminMfa = await postJson("/api/auth/mfa/verify", {
      challengeId: adminLogin.body.challengeId,
      code: adminLogin.body.devCode
    });
    assert.equal(adminMfa.status, 200);
    assert.equal(adminMfa.body.user.role, "admin");
    assert.equal(adminMfa.body.redirect, "admin.html");
    const adminCookie = getCookie(adminMfa.response);

    const users = await getJson("/api/admin/users", adminCookie);
    assert.equal(users.status, 200);
    assert.deepEqual(users.body.certifications, [
      "Pearson Cybersecurity",
      "Pearson Network Security",
      "Pearson Networking",
      "CompTIA Network Plus",
      "CompTIA Security Plus"
    ]);
    const qaUser = users.body.users.find((user) => user.email === qaEmail);
    assert.ok(qaUser);
    assert.equal(qaUser.progress.practiceExamAttempts.length, 1);

    const scoreUpdate = await postJson("/api/admin/scores", {
      userId: qaUser.id,
      certification: "Pearson Cybersecurity",
      prepScore: "91",
      questionBankScore: "88",
      practiceExamScore: "94",
      status: "Exam Ready"
    }, adminCookie, users.body.csrfToken);
    assert.equal(scoreUpdate.status, 200);
    assert.equal(scoreUpdate.body.progress.certifications["Pearson Cybersecurity"].prepScore, "91");
    assert.equal(scoreUpdate.body.progress.certifications["Pearson Cybersecurity"].status, "Exam Ready");

    const attemptId = qaUser.progress.practiceExamAttempts[0].id;
    const practiceScoreUpdate = await postJson("/api/admin/practice-exam-score", {
      userId: qaUser.id,
      attemptId,
      percent: "89",
      note: "Manual review correction"
    }, adminCookie, users.body.csrfToken);
    assert.equal(practiceScoreUpdate.status, 200);
    assert.equal(practiceScoreUpdate.body.attempt.percent, 89);
    assert.equal(practiceScoreUpdate.body.attempt.manuallyAdjusted, true);

    console.log("PASS: auth, MFA, password reset, Google route, admin score editing, practice exam grade editing, and certification catalog checks passed.");
  } finally {
    server.kill();
    if (stderr.trim()) {
      console.error(stderr.trim());
    }
  }
}

async function waitForServer() {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 5000) {
    try {
      const response = await fetch(`${BASE_URL}/api/auth/me`);
      if (response.ok) return;
    } catch {
      await sleep(100);
    }
  }
  throw new Error("Server did not start within 5 seconds");
}

async function getJson(pathname, cookie = "") {
  const response = await fetch(`${BASE_URL}${pathname}`, {
    headers: cookie ? { Cookie: cookie } : {}
  });
  return { status: response.status, body: await response.json(), response };
}

async function postJson(pathname, body, cookie = "", csrfToken = "") {
  const headers = { "Content-Type": "application/json" };
  if (cookie) headers.Cookie = cookie;
  if (csrfToken) headers["x-csrf-token"] = csrfToken;
  const response = await fetch(`${BASE_URL}${pathname}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
  return { status: response.status, body: await response.json(), response };
}

function getCookie(response) {
  const cookie = response.headers.get("set-cookie");
  assert.ok(cookie);
  return cookie.split(";")[0];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
