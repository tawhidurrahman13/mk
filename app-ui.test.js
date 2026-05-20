const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { adminPracticeExamTools } = require("./script.js");

const ROOT = __dirname;

const sampleProgress = {
  student1: {
    selectedCertification: "Pearson Network Security",
    selectedPracticeExam: "Pearson Network Security Full Length Practice Exam",
    certifications: {},
    practiceExamScore: "62",
    practiceExamAttempts: [
      {
        id: "attempt-1",
        userId: "student1",
        title: "Pearson Network Security Full Length Practice Exam",
        certification: "Pearson Network Security",
        score: 31,
        total: 50,
        percent: 62,
        completedAt: "2026-05-20T12:00:00.000Z",
        subunitResults: [
          { subunit: "ACL Design", percent: 55, correct: 5, total: 9 },
          { subunit: "Threats", percent: 86, correct: 6, total: 7 }
        ],
        questionReview: [
          { subunit: "ACL Design", isCorrect: false, answerState: "unanswered" },
          { subunit: "Threats", isCorrect: true, answerState: "answered" }
        ]
      }
    ],
    quizAttempts: []
  }
};

const sampleUsers = [
  {
    id: "student1",
    username: "student1",
    displayName: "Student One",
    email: "student1@example.com",
    role: "student",
    progress: sampleProgress.student1
  }
];

assert.equal(adminPracticeExamTools.canAccessPage("admin-grades", "student"), false, "Student must not access admin grades.");
assert.equal(adminPracticeExamTools.canAccessPage("admin-grades", "admin"), true, "Admin must access admin grades.");
assert.equal(adminPracticeExamTools.shouldShowSidebarItem("admin-grades", "student"), false, "Student sidebar hides admin grades.");
assert.equal(adminPracticeExamTools.shouldShowSidebarItem("admin-grades", "admin"), true, "Admin sidebar shows admin grades.");

const rows = adminPracticeExamTools.collectPracticeExamRows(sampleUsers);
assert.equal(rows.length, 1, "Practice exam grade rows should include saved attempts.");
assert.equal(rows[0].displayName, "Student One");
assert.equal(rows[0].examName, "Pearson Network Security Full Length Practice Exam");
assert.equal(rows[0].percent, 62);

const insight = adminPracticeExamTools.summarizeHelpNeeds([sampleProgress.student1.practiceExamAttempts[0]]);
assert.equal(insight.needsHelp, true, "Low categories should produce student-help insight.");
assert.equal(insight.weakAreas[0].subunit, "ACL Design");
assert.equal(insight.unansweredCount, 1);

const adjustedProgress = JSON.parse(JSON.stringify(sampleProgress.student1));
const adjusted = adminPracticeExamTools.adjustPracticeExamScore(adjustedProgress, "attempt-1", 88, "Reviewed by admin");
assert.equal(adjusted.ok, true, "Admin score adjustment should succeed.");
assert.equal(adjusted.progress.practiceExamAttempts[0].percent, 88);
assert.equal(adjusted.progress.practiceExamAttempts[0].manuallyAdjusted, true);
assert.equal(adjusted.progress.certifications["Pearson Network Security"].practiceExamScore, "88");

const welcomeHtml = readFile("welcome.html");
assert.match(welcomeHtml, /data-page="welcome"/, "Welcome page should render with route marker.");
assert.match(welcomeHtml, /SOC Bootcamp command center/, "Welcome page should include feature intro.");

const resourcesHtml = readFile("resources.html");
assert.match(resourcesHtml, /data-page="resources"/, "Resource page should render with route marker.");
assert.match(resourcesHtml, /Resource library/, "Resource page should include resource structure.");
assert.match(resourcesHtml, /privacy\.html/, "Resources should link to the privacy notice.");

const adminGradesHtml = readFile("admin-practice-grades.html");
assert.match(adminGradesHtml, /data-page="admin-grades"/, "Admin grades page should render with route marker.");
assert.match(adminGradesHtml, /adminPracticeGradeRows/, "Admin grades page should include grade table.");

const loginHtml = readFile("login.html");
assert.doesNotMatch(loginHtml, /Demo accounts|Quick test logins|student123/, "Login page should not show demo account section.");
assert.match(loginHtml, /privacy\.html/, "Login page should link to the privacy notice.");

const indexHtml = readFile("index.html");
assert.match(indexHtml, /data-reset-local-progress="true"/, "Reset settings button should have a working hook.");
assert.match(indexHtml, /cyberDefenseTabButton/, "Home page Cyber Defense tab should have a working hook.");
assert.match(indexHtml, /resources\.html/, "Sidebar or quick links should include resources.");

const certificationsHtml = readFile("certifications.html");
assert.match(certificationsHtml, /data-reset-local-progress="true"/, "Certification reset button should have a working hook.");

const brandPreviewHtml = readFile("brand-preview.html");
assert.doesNotMatch(brandPreviewHtml, /<button class="primary-button" type="button">Continue<\/button>/, "Brand preview Continue should route instead of being a dead button.");

const privacyHtml = readFile("privacy.html");
assert.match(privacyHtml, /SOC Bootcamp Privacy Notice/, "Privacy notice should render.");

const sourceFiles = [
  "server.js",
  "script.js",
  ".env.example",
  "AUTH_SETUP.md",
  "VERCEL_GOOGLE_SMTP_SETUP.md",
  "api/_lib/soc-auth.js"
].map(readFile).join("\n");
assert.doesNotMatch(sourceFiles, /jguartan@brooklynsteamcenter\.org/i, "Old admin email must not appear.");
assert.match(sourceFiles, /eakhter@brooklynsteamcenter\.org/i, "Correct admin email should be configured.");

console.log("PASS: admin grades helpers, role-aware sidebar rules, welcome/resources routes, and login cleanup checks passed.");

function readFile(fileName) {
  return fs.readFileSync(path.join(ROOT, fileName), "utf8");
}
