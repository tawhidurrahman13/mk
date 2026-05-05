// SOC Bootcamp uses browser localStorage so the demo works from plain HTML files.
// This is beginner-friendly client-side storage, not real production authentication.

const storageKeys = {
  accounts: "socBootcampAccounts",
  currentUser: "socBootcampCurrentUser",
  selectedCertification: "socBootcampSelectedCertification",
  lastCertification: "socBootcampLastCertification",
  selectedPracticeExam: "socBootcampSelectedPracticeExam",
  lastPracticeExam: "socBootcampLastPracticeExam",
  kaliLastSection: "socBootcampKaliLastSection",
  kaliCompletedSections: "socBootcampKaliCompletedSections",
  kaliQuizScore: "socBootcampKaliQuizScore"
};

const guideSections = {
  intro: {
    title: "Introduction",
    html: `
      <p>Kali Linux is a security-focused Linux distribution used for authorized testing, training, and defensive validation. In this bootcamp, treat every command as a lab action and only practice in systems you own or have permission to assess.</p>
      <ul>
        <li>Use isolated labs or intentionally vulnerable machines.</li>
        <li>Document commands, results, and lessons learned.</li>
        <li>Think like a defender: every tool should teach detection and prevention.</li>
      </ul>
    `
  },
  commands: {
    title: "Basic Commands",
    html: `
      <p>These commands help you navigate, inspect files, and understand your Kali environment before running specialized tools.</p>
      <ul class="command-list">
        <li><code>pwd</code>Show your current directory.</li>
        <li><code>ls -la</code>List files, permissions, and hidden items.</li>
        <li><code>cd</code>Move between directories.</li>
        <li><code>ip a</code>Review network interfaces and addresses.</li>
        <li><code>sudo apt update</code>Refresh package lists before installing tools.</li>
      </ul>
    `
  },
  tools: {
    title: "Tools Overview",
    html: `
      <p>Kali includes many tools. Start with awareness and responsible workflows before deeper testing.</p>
      <ul>
        <li><strong>Nmap:</strong> Network discovery and service enumeration in authorized environments.</li>
        <li><strong>Wireshark:</strong> Packet capture and protocol analysis.</li>
        <li><strong>Burp Suite:</strong> Web application testing through an intercepting proxy.</li>
        <li><strong>John the Ripper:</strong> Password auditing for approved recovery and policy checks.</li>
      </ul>
    `
  },
  practice: {
    title: "Practice Exercises",
    html: `
      <p>Use these prompts to build careful, repeatable habits in a legal lab setting.</p>
      <ol>
        <li>Open a terminal, identify your current directory, and create a notes folder.</li>
        <li>Inspect your IP address and write down the active interface name.</li>
        <li>Run a basic scan against a local test machine that you control.</li>
        <li>Capture a short packet sample and identify at least two protocols.</li>
      </ol>
    `
  }
};

const quizQuestions = [
  {
    question: "Which command shows the current working directory?",
    answers: ["pwd", "whoami", "ip a", "mkdir"],
    correct: 0
  },
  {
    question: "Which tool is commonly used for network discovery and service enumeration?",
    answers: ["Nmap", "Gimp", "LibreOffice", "VLC"],
    correct: 0
  },
  {
    question: "What is the safest place to practice Kali Linux techniques?",
    answers: ["Any public network", "An authorized lab environment", "A random website", "A neighbor's router"],
    correct: 1
  },
  {
    question: "Which tool helps inspect packets and protocols?",
    answers: ["Wireshark", "Calculator", "Notepad", "Calendar"],
    correct: 0
  }
];

const socaiKnowledge = [
  {
    keywords: ["pwd", "directory", "where am i", "current folder"],
    title: "pwd",
    answer: "Use pwd to print the current working directory. It helps you confirm where your terminal is before creating files, running tools, or saving evidence notes."
  },
  {
    keywords: ["ls", "list", "files", "hidden", "permissions"],
    title: "ls -la",
    answer: "Use ls -la to list files, hidden files, owners, groups, sizes, timestamps, and permissions. It is one of the first commands to run when orienting yourself in a lab folder."
  },
  {
    keywords: ["ip", "address", "interface", "network"],
    title: "ip a",
    answer: "Use ip a to review network interfaces and assigned IP addresses. In SOC practice, this helps you identify the active lab interface before scanning or packet capture."
  },
  {
    keywords: ["nmap", "scan", "ports", "enumeration"],
    title: "Nmap",
    answer: "Nmap is used for authorized network discovery and service enumeration. Keep scans inside lab systems you own or have permission to test."
  },
  {
    keywords: ["wireshark", "packet", "capture", "protocol"],
    title: "Wireshark",
    answer: "Wireshark captures and analyzes packets. It is useful for learning protocols, validating traffic, and understanding what a defender might see."
  },
  {
    keywords: ["burp", "proxy", "web", "http"],
    title: "Burp Suite",
    answer: "Burp Suite is an intercepting proxy for authorized web application testing. It helps inspect requests and responses during web security labs."
  },
  {
    keywords: ["practice", "exercise", "lab", "steps"],
    title: "Practice Exercises",
    answer: "Start with safe lab habits: create notes, identify your IP address, run commands only in authorized environments, and record what each command taught you."
  }
];

document.addEventListener("DOMContentLoaded", () => {
  // Each HTML file declares a data-page value, so this shared script can
  // initialize only the features needed on the current page.
  initializeGlobalUi();
  initializeClock();
  showReturningUserToast();

  const page = document.body.dataset.page;
  if (page === "home") {
    initializeHomePage();
  }

  if (page === "login") {
    initializeLoginPage();
  }

  if (page === "certifications") {
    initializeCertificationsPage();
  }

  if (page === "kali") {
    initializeKaliPage();
  }
});

function initializeGlobalUi() {
  // Shared navigation, mobile sidebar, and feedback toast behavior.
  const currentPage = document.body.dataset.page;
  const navLinks = document.querySelectorAll("[data-nav]");
  const menuToggle = document.getElementById("menuToggle");
  const sidebar = document.getElementById("sidebar");
  const feedbackButton = document.getElementById("feedbackButton");

  navLinks.forEach((link) => {
    if (link.dataset.nav === currentPage) {
      link.classList.add("active");
    }
  });

  if (menuToggle && sidebar) {
    menuToggle.addEventListener("click", () => {
      sidebar.classList.toggle("open");
    });
  }

  if (feedbackButton) {
    feedbackButton.addEventListener("click", () => {
      showToast("Feedback terminal armed. In a real deployment, this opens a feedback form.");
    });
  }
}

function initializeClock() {
  const clockPill = document.getElementById("clockPill");
  if (!clockPill) {
    return;
  }

  const updateClock = () => {
    const now = new Date();
    clockPill.textContent = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  updateClock();
  setInterval(updateClock, 30000);
}

function showReturningUserToast() {
  const currentUser = localStorage.getItem(storageKeys.currentUser);
  if (currentUser) {
    showToast(`Welcome Back, ${currentUser}`);
  }
}

function initializeHomePage() {
  const accountText = document.getElementById("homeAccountText");
  const homeLoginButton = document.getElementById("homeLoginButton");
  const homeLogoutButton = document.getElementById("homeLogoutButton");
  const startLearningButton = document.getElementById("startLearningButton");

  updateHomeAccountStatus();

  if (startLearningButton) {
    startLearningButton.addEventListener("click", () => {
      window.location.href = "certifications.html";
    });
  }

  if (homeLogoutButton) {
    homeLogoutButton.addEventListener("click", () => {
      localStorage.removeItem(storageKeys.currentUser);
      showToast("Logged out.");
      updateHomeAccountStatus();
    });
  }

  function updateHomeAccountStatus() {
    const currentUser = localStorage.getItem(storageKeys.currentUser);
    if (!accountText || !homeLoginButton || !homeLogoutButton) {
      return;
    }

    if (currentUser) {
      accountText.textContent = `Welcome, ${currentUser}`;
      homeLoginButton.textContent = "Account Page";
      homeLogoutButton.classList.remove("hidden");
    } else {
      accountText.textContent = "Guest analyst mode";
      homeLoginButton.textContent = "Login / Create Account";
      homeLogoutButton.classList.add("hidden");
    }
  }
}

function initializeLoginPage() {
  // Demo-only auth: accounts are saved locally in this browser.
  const authForm = document.getElementById("authForm");
  const authTitle = document.getElementById("authTitle");
  const authSubmitButton = document.getElementById("authSubmitButton");
  const loginTab = document.getElementById("loginTab");
  const createTab = document.getElementById("createTab");
  const usernameInput = document.getElementById("usernameInput");
  const passwordInput = document.getElementById("passwordInput");
  const usernameError = document.getElementById("usernameError");
  const passwordError = document.getElementById("passwordError");
  const welcomeState = document.getElementById("welcomeState");
  const welcomeMessage = document.getElementById("welcomeMessage");
  const logoutButton = document.getElementById("logoutButton");
  let authMode = "login";

  if (!authForm) {
    return;
  }

  updateAuthVisibility();

  loginTab.addEventListener("click", () => setAuthMode("login"));
  createTab.addEventListener("click", () => setAuthMode("create"));

  usernameInput.addEventListener("input", validateAuthFields);
  passwordInput.addEventListener("input", validateAuthFields);

  authForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const isValid = validateAuthFields();
    if (!isValid) {
      return;
    }

    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    const accounts = getStoredObject(storageKeys.accounts, {});

    if (authMode === "create") {
      if (accounts[username]) {
        usernameError.textContent = "That username already exists. Try logging in.";
        return;
      }

      accounts[username] = { password };
      localStorage.setItem(storageKeys.accounts, JSON.stringify(accounts));
      localStorage.setItem(storageKeys.currentUser, username);
      showToast("Account created. Welcome to SOC Bootcamp.");
      updateAuthVisibility();
      authForm.reset();
      return;
    }

    if (!accounts[username] || accounts[username].password !== password) {
      passwordError.textContent = "Username or password is incorrect.";
      return;
    }

    localStorage.setItem(storageKeys.currentUser, username);
    showToast(`Welcome, ${username}`);
    updateAuthVisibility();
    authForm.reset();
  });

  logoutButton.addEventListener("click", () => {
    localStorage.removeItem(storageKeys.currentUser);
    showToast("Logged out.");
    updateAuthVisibility();
  });

  function setAuthMode(mode) {
    authMode = mode;
    authTitle.textContent = mode === "login" ? "Login" : "Create Account";
    authSubmitButton.textContent = mode === "login" ? "Login" : "Create Account";
    loginTab.classList.toggle("active", mode === "login");
    createTab.classList.toggle("active", mode === "create");
    clearAuthErrors();
  }

  function validateAuthFields() {
    clearAuthErrors();
    let isValid = true;
    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    if (username.length < 3) {
      usernameError.textContent = "Username must be at least 3 characters.";
      isValid = false;
    }

    if (password.length < 6) {
      passwordError.textContent = "Password must be at least 6 characters.";
      isValid = false;
    }

    return isValid;
  }

  function clearAuthErrors() {
    usernameError.textContent = "";
    passwordError.textContent = "";
  }

  function updateAuthVisibility() {
    const currentUser = localStorage.getItem(storageKeys.currentUser);
    if (currentUser) {
      authForm.classList.add("hidden");
      welcomeState.classList.remove("hidden");
      welcomeMessage.textContent = `Welcome, ${currentUser}`;
    } else {
      authForm.classList.remove("hidden");
      welcomeState.classList.add("hidden");
    }
  }
}

function initializeCertificationsPage() {
  // Certification progress is persistent, so learners can leave and resume.
  const modeButtons = document.querySelectorAll("[data-cert-mode]");
  const certTrackControls = document.getElementById("certTrackControls");
  const certGrid = document.getElementById("certGrid");
  const practiceExamMode = document.getElementById("practiceExamMode");
  const filterButtons = document.querySelectorAll("[data-filter]");
  const certCards = document.querySelectorAll(".cert-card");
  const startButtons = document.querySelectorAll(".start-prep-button");
  const examCards = document.querySelectorAll(".exam-card");
  const examButtons = document.querySelectorAll(".start-exam-button");
  const currentStudyText = document.getElementById("currentStudyText");
  const lastAccessedText = document.getElementById("lastAccessedText");
  const resumeButton = document.getElementById("resumeCertificationButton");
  const currentExamText = document.getElementById("currentExamText");
  const lastExamText = document.getElementById("lastExamText");
  const resumeExamButton = document.getElementById("resumeExamButton");

  updateCertificationStatus();
  updatePracticeExamStatus();

  modeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const mode = button.dataset.certMode;
      modeButtons.forEach((modeButton) => modeButton.classList.remove("active"));
      button.classList.add("active");

      const showingExams = mode === "exams";
      certTrackControls.classList.toggle("hidden", showingExams);
      certGrid.classList.toggle("hidden", showingExams);
      practiceExamMode.classList.toggle("hidden", !showingExams);
    });
  });

  filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const filter = button.dataset.filter;
      filterButtons.forEach((filterButton) => filterButton.classList.remove("active"));
      button.classList.add("active");

      certCards.forEach((card) => {
        const shouldShow = filter === "all" || card.dataset.category === filter;
        card.classList.toggle("hidden-by-filter", !shouldShow);
      });
    });
  });

  startButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const card = button.closest(".cert-card");
      saveCertification(card.dataset.cert);
      updateCertificationStatus();
      card.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  });

  resumeButton.addEventListener("click", () => {
    const savedCertification = localStorage.getItem(storageKeys.selectedCertification);
    if (!savedCertification) {
      showToast("No saved certification yet. Choose a track to begin.");
      return;
    }

    updateCertificationStatus();
    const savedCard = Array.from(certCards).find((card) => card.dataset.cert === savedCertification);
    if (savedCard) {
      filterButtons.forEach((filterButton) => {
        const isAllFilter = filterButton.dataset.filter === "all";
        filterButton.classList.toggle("active", isAllFilter);
      });
      certCards.forEach((card) => card.classList.remove("hidden-by-filter"));
      savedCard.scrollIntoView({ behavior: "smooth", block: "center" });
      showToast(`Resuming ${savedCertification}`);
    }
  });

  examButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const card = button.closest(".exam-card");
      savePracticeExam(card.dataset.exam);
      updatePracticeExamStatus();
      card.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  });

  if (resumeExamButton) {
    resumeExamButton.addEventListener("click", () => {
      const savedExam = localStorage.getItem(storageKeys.selectedPracticeExam);
      if (!savedExam) {
        showToast("No practice exam selected yet.");
        return;
      }

      const savedCard = Array.from(examCards).find((card) => card.dataset.exam === savedExam);
      if (savedCard) {
        savedCard.scrollIntoView({ behavior: "smooth", block: "center" });
        showToast(`Resuming ${savedExam}`);
      }
    });
  }

  function saveCertification(certificationName) {
    const lastAccessed = {
      name: certificationName,
      savedAt: new Date().toISOString()
    };

    localStorage.setItem(storageKeys.selectedCertification, certificationName);
    localStorage.setItem(storageKeys.lastCertification, JSON.stringify(lastAccessed));
    showToast("Progress Saved");
  }

  function updateCertificationStatus() {
    const selectedCertification = localStorage.getItem(storageKeys.selectedCertification);
    const lastAccessed = getStoredObject(storageKeys.lastCertification, null);

    certCards.forEach((card) => {
      card.classList.toggle("selected", card.dataset.cert === selectedCertification);
    });

    if (selectedCertification) {
      currentStudyText.textContent = `You are currently studying: ${selectedCertification}`;
      resumeButton.disabled = false;
    } else {
      currentStudyText.textContent = "No certification selected yet.";
      resumeButton.disabled = true;
    }

    if (lastAccessed && lastAccessed.name) {
      lastAccessedText.textContent = `Last Accessed Certification: ${lastAccessed.name}`;
    } else {
      lastAccessedText.textContent = "Last Accessed Certification: none";
    }
  }

  function savePracticeExam(examName) {
    const lastExam = {
      name: examName,
      savedAt: new Date().toISOString()
    };

    localStorage.setItem(storageKeys.selectedPracticeExam, examName);
    localStorage.setItem(storageKeys.lastPracticeExam, JSON.stringify(lastExam));
    showToast("Practice exam saved.");
  }

  function updatePracticeExamStatus() {
    const selectedExam = localStorage.getItem(storageKeys.selectedPracticeExam);
    const lastExam = getStoredObject(storageKeys.lastPracticeExam, null);

    examCards.forEach((card) => {
      card.classList.toggle("selected", card.dataset.exam === selectedExam);
    });

    if (currentExamText) {
      currentExamText.textContent = selectedExam ? `Current practice exam: ${selectedExam}` : "No practice exam selected yet.";
    }

    if (lastExamText) {
      lastExamText.textContent = lastExam && lastExam.name ? `Last Practice Exam: ${lastExam.name}` : "Last Practice Exam: none";
    }

    if (resumeExamButton) {
      resumeExamButton.disabled = !selectedExam;
    }
  }
}

function initializeKaliPage() {
  // Guide sections, completion state, and quiz scores are saved independently.
  const sectionButtons = document.querySelectorAll(".guide-section-button");
  const guideTitle = document.getElementById("guideTitle");
  const guideContent = document.getElementById("guideContent");
  const markCompleteButton = document.getElementById("markCompleteButton");
  const progressFill = document.getElementById("guideProgressFill");
  const progressLabel = document.getElementById("progressLabel");
  const savedScoreLabel = document.getElementById("savedScoreLabel");
  let activeSection = localStorage.getItem(storageKeys.kaliLastSection) || "intro";

  renderGuideSection(activeSection);
  updateCompletedUi();
  initializeQuiz();
  initializeSocai();

  sectionButtons.forEach((button) => {
    button.addEventListener("click", () => {
      renderGuideSection(button.dataset.section);
      showToast("Guide section saved.");
    });
  });

  markCompleteButton.addEventListener("click", () => {
    const completedSections = getStoredObject(storageKeys.kaliCompletedSections, []);
    if (!completedSections.includes(activeSection)) {
      completedSections.push(activeSection);
      localStorage.setItem(storageKeys.kaliCompletedSections, JSON.stringify(completedSections));
      showToast("Progress Saved");
    } else {
      showToast("Section already marked complete.");
    }
    updateCompletedUi();
  });

  function renderGuideSection(sectionKey) {
    activeSection = sectionKey;
    const selectedSection = guideSections[sectionKey];
    localStorage.setItem(storageKeys.kaliLastSection, sectionKey);

    guideTitle.textContent = selectedSection.title;
    guideContent.innerHTML = selectedSection.html;

    sectionButtons.forEach((button) => {
      button.classList.toggle("active", button.dataset.section === sectionKey);
    });
  }

  function updateCompletedUi() {
    const completedSections = getStoredObject(storageKeys.kaliCompletedSections, []);
    const totalSections = Object.keys(guideSections).length;
    const progressPercent = Math.round((completedSections.length / totalSections) * 100);

    sectionButtons.forEach((button) => {
      button.classList.toggle("completed", completedSections.includes(button.dataset.section));
    });

    progressFill.style.width = `${progressPercent}%`;
    progressLabel.textContent = `${progressPercent}% Complete`;
  }

  function initializeQuiz() {
    const quizBody = document.getElementById("quizBody");
    const nextQuestionButton = document.getElementById("nextQuestionButton");
    const retryQuizButton = document.getElementById("retryQuizButton");
    const quizProgressLabel = document.getElementById("quizProgressLabel");
    let currentQuestionIndex = 0;
    let score = 0;
    let hasAnswered = false;

    updateSavedScoreLabel();
    renderQuestion();

    nextQuestionButton.addEventListener("click", () => {
      if (!hasAnswered) {
        showToast("Choose an answer before continuing.");
        return;
      }

      currentQuestionIndex += 1;
      if (currentQuestionIndex >= quizQuestions.length) {
        showFinalScore();
        return;
      }

      hasAnswered = false;
      renderQuestion();
    });

    retryQuizButton.addEventListener("click", () => {
      currentQuestionIndex = 0;
      score = 0;
      hasAnswered = false;
      retryQuizButton.classList.add("hidden");
      nextQuestionButton.classList.remove("hidden");
      renderQuestion();
    });

    function renderQuestion() {
      const question = quizQuestions[currentQuestionIndex];
      quizProgressLabel.textContent = `Question ${currentQuestionIndex + 1} of ${quizQuestions.length}`;
      quizBody.innerHTML = `
        <p class="question-title">${question.question}</p>
        <div class="answer-grid">
          ${question.answers.map((answer, index) => `
            <button class="answer-button" type="button" data-answer="${index}">${answer}</button>
          `).join("")}
        </div>
        <p class="feedback-text" id="quizFeedback"></p>
      `;

      const answerButtons = quizBody.querySelectorAll(".answer-button");
      answerButtons.forEach((button) => {
        button.addEventListener("click", () => handleAnswer(Number(button.dataset.answer), answerButtons));
      });
    }

    function handleAnswer(answerIndex, answerButtons) {
      if (hasAnswered) {
        return;
      }

      hasAnswered = true;
      const question = quizQuestions[currentQuestionIndex];
      const feedback = document.getElementById("quizFeedback");
      const isCorrect = answerIndex === question.correct;

      answerButtons.forEach((button) => {
        const buttonAnswer = Number(button.dataset.answer);
        button.disabled = true;

        if (buttonAnswer === question.correct) {
          button.classList.add("correct");
        }

        if (buttonAnswer === answerIndex && !isCorrect) {
          button.classList.add("incorrect");
        }
      });

      if (isCorrect) {
        score += 1;
        feedback.textContent = "Correct. Strong analyst instincts.";
      } else {
        feedback.textContent = `Not quite. Correct answer: ${question.answers[question.correct]}.`;
      }
    }

    function showFinalScore() {
      const percent = Math.round((score / quizQuestions.length) * 100);
      const scoreText = `${score}/${quizQuestions.length} (${percent}%)`;

      localStorage.setItem(storageKeys.kaliQuizScore, scoreText);
      updateSavedScoreLabel();
      showToast("Quiz score saved.");

      quizProgressLabel.textContent = "Quiz Complete";
      quizBody.innerHTML = `
        <p class="question-title">Final Score: ${scoreText}</p>
        <p class="feedback-text">Score saved locally. Retry anytime to sharpen the signal.</p>
      `;
      nextQuestionButton.classList.add("hidden");
      retryQuizButton.classList.remove("hidden");
    }

    function updateSavedScoreLabel() {
      const savedScore = localStorage.getItem(storageKeys.kaliQuizScore);
      savedScoreLabel.textContent = savedScore ? `Quiz Score: ${savedScore}` : "Quiz Score: none";
    }
  }

  function initializeSocai() {
    const socaiForm = document.getElementById("socaiForm");
    const socaiInput = document.getElementById("socaiInput");
    const socaiMessages = document.getElementById("socaiMessages");
    const socaiTabButton = document.getElementById("socaiTabButton");
    const socaiCard = document.getElementById("socaiCard");

    if (!socaiForm || !socaiInput || !socaiMessages) {
      return;
    }

    if (socaiTabButton && socaiCard) {
      socaiTabButton.addEventListener("click", () => {
        socaiCard.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }

    socaiForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const query = socaiInput.value.trim();
      if (!query) {
        showToast("Ask SOCAI about a Kali command or outline topic.");
        return;
      }

      addSocaiMessage("You", query, "user-message");
      addSocaiMessage("SOCAI", buildSocaiAnswer(query), "ai-message");
      socaiInput.value = "";
      socaiMessages.scrollTop = socaiMessages.scrollHeight;
    });

    function addSocaiMessage(author, message, className) {
      const messageElement = document.createElement("div");
      const authorElement = document.createElement("strong");
      const bodyElement = document.createElement("p");

      messageElement.className = `socai-message ${className}`;
      authorElement.textContent = author;
      bodyElement.textContent = message;
      messageElement.append(authorElement, bodyElement);
      socaiMessages.appendChild(messageElement);
    }

    function buildSocaiAnswer(query) {
      const normalizedQuery = query.toLowerCase();
      const match = socaiKnowledge.find((entry) => {
        return entry.keywords.some((keyword) => normalizedQuery.includes(keyword));
      });

      if (match) {
        return `${match.title}: ${match.answer}`;
      }

      const outlineTitles = Object.values(guideSections).map((section) => section.title).join(", ");
      return `I do not have that exact topic in the SOCAI outline yet. Current searchable areas are: ${outlineTitles}. Add more SOCAI knowledge entries in script.js when you are ready to feed the information.`;
    }
  }
}

function getStoredObject(key, fallback) {
  const rawValue = localStorage.getItem(key);
  if (!rawValue) {
    return fallback;
  }

  try {
    return JSON.parse(rawValue);
  } catch (error) {
    return fallback;
  }
}

function showToast(message) {
  const toastStack = document.getElementById("toastStack");
  if (!toastStack) {
    return;
  }

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  toastStack.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3200);
}
