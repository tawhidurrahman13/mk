// SOC Bootcamp can run as static HTML for UI demos, or through server.js for
// real sessions, hashed passwords, Google OAuth, SMTP reset codes, and MFA.

const storageKeys = {
  accounts: "socBootcampAccounts",
  currentUser: "socBootcampCurrentUser",
  selectedCertification: "socBootcampSelectedCertification",
  lastCertification: "socBootcampLastCertification",
  selectedPracticeExam: "socBootcampSelectedPracticeExam",
  lastPracticeExam: "socBootcampLastPracticeExam",
  certificationPrepScore: "socBootcampCertificationPrepScore",
  practiceExamScore: "socBootcampPracticeExamScore",
  practiceExamAttempts: "socBootcampPracticeExamAttempts",
  questionBankScore: "socBootcampQuestionBankScore",
  kaliLastSection: "socBootcampKaliLastSection",
  kaliCompletedSections: "socBootcampKaliCompletedSections",
  kaliQuizScore: "socBootcampKaliQuizScore",
  kaliCoachStreak: "socBootcampKaliCoachStreak",
  quizOrders: "socBootcampQuizOrders",
  authRedirect: "socBootcampAuthRedirect",
  authNotice: "socBootcampAuthNotice",
  userProgress: "socBootcampUserProgress",
  mfaChallenge: "socBootcampMfaChallenge",
  resetChallenge: "socBootcampResetChallenge"
};

const RESERVED_ADMIN_USERNAME = "admin";
const RESERVED_ADMIN_PASSWORD = "akhter44";
const RESERVED_ADMIN_EMAIL = "admin@socbootcamp.local";

const demoAccounts = {
  student: {
    password: "student123",
    role: "student",
    displayName: "Student Analyst",
    email: "student@socbootcamp.local"
  },
  [RESERVED_ADMIN_USERNAME]: {
    password: RESERVED_ADMIN_PASSWORD,
    role: "admin",
    displayName: "Admin",
    email: RESERVED_ADMIN_EMAIL
  }
};

const MFA_CODE_TTL_MS = 5 * 60 * 1000;
const RESET_CODE_TTL_MS = 10 * 60 * 1000;
let serverCsrfToken = "";

const practiceExamEngine = (() => {
  function arraysMatch(first, second) {
    return Array.isArray(first)
      && Array.isArray(second)
      && first.length === second.length
      && first.every((value, index) => value === second[index]);
  }

  function getQuestionPointValue(question) {
    if (!question) {
      return 0;
    }

    if (question.type === "dropdown") {
      return Array.isArray(question.prompts) ? question.prompts.length : 0;
    }

    if (question.type === "matching") {
      return Array.isArray(question.pairs) ? question.pairs.length : 0;
    }

    if (question.type === "multi-select") {
      return Array.isArray(question.correct) ? question.correct.length : 0;
    }

    return 1;
  }

  function getEarnedPoints(question, selection) {
    if (!question || selection === null || selection === undefined) {
      return 0;
    }

    if (question.type === "dropdown") {
      const values = Array.isArray(selection.values) ? selection.values : [];
      return question.prompts.reduce((points, prompt, index) => {
        return points + (values[index] === prompt.correct ? 1 : 0);
      }, 0);
    }

    if (question.type === "matching") {
      const matches = selection.matches || {};
      return question.pairs.reduce((points, pair, index) => {
        return points + (matches[index] === pair.correct ? 1 : 0);
      }, 0);
    }

    if (question.type === "multi-select") {
      const selectedValues = Array.isArray(selection.values) ? selection.values : [];
      return selectedValues.reduce((points, selectedIndex) => {
        return points + (question.correct.includes(selectedIndex) ? 1 : 0);
      }, 0);
    }

    return selection === question.correct ? 1 : 0;
  }

  function isQuestionAnswered(question, selection) {
    if (!question || selection === null || selection === undefined) {
      return false;
    }

    if (question.type === "dropdown") {
      return Boolean(selection.values)
        && question.prompts.every((_, index) => Boolean(selection.values[index]));
    }

    if (question.type === "matching") {
      return Boolean(selection.matches)
        && question.pairs.every((_, index) => Boolean(selection.matches[index]));
    }

    if (question.type === "multi-select") {
      const requiredCount = question.requiredSelections || question.correct.length;
      return Array.isArray(selection.values) && selection.values.length === requiredCount;
    }

    return Number.isInteger(selection);
  }

  function hasQuestionResponse(question, selection) {
    if (!question || selection === null || selection === undefined) {
      return false;
    }

    if (question.type === "dropdown") {
      return Boolean(selection.values)
        && selection.values.some((value) => Boolean(value));
    }

    if (question.type === "matching") {
      return Boolean(selection.matches)
        && Object.values(selection.matches).some((value) => Boolean(value));
    }

    if (question.type === "multi-select") {
      return Array.isArray(selection.values) && selection.values.length > 0;
    }

    return Number.isInteger(selection);
  }

  function getQuestionAnswerState(question, selection) {
    if (isQuestionAnswered(question, selection)) {
      return "answered";
    }

    return hasQuestionResponse(question, selection) ? "incomplete" : "unanswered";
  }

  function isSelectionFullyCorrect(question, selection) {
    return getEarnedPoints(question, selection) === getQuestionPointValue(question);
  }

  function getPreviousIndex(currentIndex) {
    return Math.max(0, currentIndex - 1);
  }

  function getNextIndex(currentIndex, questionCount) {
    return Math.min(Math.max(0, questionCount - 1), currentIndex + 1);
  }

  function toggleFlag(flags, index) {
    const nextFlags = Array.isArray(flags) ? [...flags] : [];
    nextFlags[index] = !nextFlags[index];
    return nextFlags;
  }

  function buildReviewItems(questions, selections, flags, currentIndex) {
    return questions.map((question, index) => {
      const answerState = getQuestionAnswerState(question, selections[index]);
      return {
        number: index + 1,
        index,
        answerState,
        isAnswered: answerState === "answered",
        isIncomplete: answerState === "incomplete",
        isUnanswered: answerState === "unanswered",
        isFlagged: Boolean(flags[index]),
        isCurrent: index === currentIndex
      };
    });
  }

  function shouldRequestFullscreen({ activeExam, finished, hasRequestFullscreen }) {
    return Boolean(activeExam && !finished && hasRequestFullscreen);
  }

  return {
    arraysMatch,
    getQuestionPointValue,
    getEarnedPoints,
    isQuestionAnswered,
    hasQuestionResponse,
    getQuestionAnswerState,
    isSelectionFullyCorrect,
    getPreviousIndex,
    getNextIndex,
    toggleFlag,
    buildReviewItems,
    shouldRequestFullscreen
  };
})();

const adminPracticeExamTools = (() => {
  function isAdminRole(role) {
    return String(role || "").toLowerCase() === "admin";
  }

  function canAccessPage(page, role) {
    const adminPages = new Set(["admin", "admin-grades"]);
    return !adminPages.has(page) || isAdminRole(role);
  }

  function shouldShowSidebarItem(navKey, role) {
    const adminOnlyItems = new Set(["admin", "admin-grades"]);
    return !adminOnlyItems.has(navKey) || isAdminRole(role);
  }

  function normalizePercent(value) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return null;
    }

    return Math.max(0, Math.min(100, Math.round(numericValue)));
  }

  function collectPracticeExamRows(users, progressLookup = {}) {
    return users.flatMap((user) => {
      const userId = user.id || user.username || user.email || "unknown-user";
      const progress = user.progress || progressLookup[userId] || progressLookup[user.username] || createEmptyProgress();
      const attempts = Array.isArray(progress.practiceExamAttempts) ? progress.practiceExamAttempts : [];

      return attempts.map((attempt, index) => {
        const attemptId = attempt.id || `${userId}-practice-${index}`;
        return {
          id: attemptId,
          userId,
          username: user.username || user.displayName || user.email || userId,
          displayName: user.displayName || user.username || user.email || userId,
          email: user.email || userId,
          examName: attempt.title || attempt.examName || "Practice Exam",
          certification: attempt.certification || "General Review",
          score: Number(attempt.score || 0),
          total: Number(attempt.total || 0),
          percent: Number(attempt.manualPercent ?? attempt.percent ?? 0),
          submittedAt: attempt.completedAt || attempt.timestamp || "",
          subunitResults: Array.isArray(attempt.subunitResults) ? attempt.subunitResults : [],
          questionReview: Array.isArray(attempt.questionReview) ? attempt.questionReview : [],
          manuallyAdjusted: Boolean(attempt.manuallyAdjusted),
          adjustmentNote: attempt.adjustmentNote || "",
          rawAttempt: attempt
        };
      });
    });
  }

  function summarizeHelpNeeds(attempts) {
    const categoryMap = new Map();
    let unansweredCount = 0;
    let missedCount = 0;

    attempts.forEach((attempt) => {
      (attempt.subunitResults || []).forEach((result) => {
        const subunit = result.subunit || "General Review";
        const current = categoryMap.get(subunit) || { subunit, totalPercent: 0, count: 0, lowestPercent: 100 };
        const percent = Number(result.percent || 0);
        current.totalPercent += percent;
        current.count += 1;
        current.lowestPercent = Math.min(current.lowestPercent, percent);
        categoryMap.set(subunit, current);
      });

      (attempt.questionReview || []).forEach((question) => {
        if (question.isUnanswered || question.answerState === "unanswered") {
          unansweredCount += 1;
        }
        if (!question.isCorrect) {
          missedCount += 1;
        }
      });
    });

    const weakAreas = [...categoryMap.values()]
      .map((item) => ({
        subunit: item.subunit,
        averagePercent: item.count ? Math.round(item.totalPercent / item.count) : 0,
        lowestPercent: item.lowestPercent
      }))
      .filter((item) => item.averagePercent < 80 || item.lowestPercent < 70)
      .sort((first, second) => first.averagePercent - second.averagePercent)
      .slice(0, 4);

    return {
      weakAreas,
      unansweredCount,
      missedCount,
      needsHelp: weakAreas.length > 0 || unansweredCount > 0 || missedCount > 0
    };
  }

  function adjustPracticeExamScore(progress, attemptId, newPercent, note = "") {
    const percent = normalizePercent(newPercent);
    if (percent === null) {
      return { ok: false, reason: "Score must be 0-100." };
    }

    const attempts = Array.isArray(progress.practiceExamAttempts) ? progress.practiceExamAttempts : [];
    const attemptIndex = attempts.findIndex((attempt, index) => (attempt.id || `${attempt.userId || "user"}-practice-${index}`) === attemptId);
    if (attemptIndex < 0) {
      return { ok: false, reason: "Practice exam attempt not found." };
    }

    const attempt = attempts[attemptIndex];
    const total = Number(attempt.total || 100) || 100;
    const adjustedScore = Math.round((percent / 100) * total);
    attempts[attemptIndex] = {
      ...attempt,
      score: adjustedScore,
      percent,
      manualPercent: percent,
      manuallyAdjusted: true,
      adjustmentNote: note || "Admin manual adjustment",
      adjustedAt: new Date().toISOString()
    };

    progress.practiceExamAttempts = attempts;
    progress.practiceExamScore = String(percent);
    if (attempt.certification) {
      progress.certifications = progress.certifications || {};
      const existingRecord = progress.certifications[attempt.certification] || {};
      progress.certifications[attempt.certification] = {
        status: percent >= 80 ? "Practice Exam Passed" : "Studying",
        prepScore: "",
        questionBankScore: "",
        ...existingRecord,
        practiceExamScore: String(percent),
        manuallyAdjusted: true,
        updatedAt: new Date().toISOString()
      };
    }

    progress.updatedAt = new Date().toISOString();
    return { ok: true, progress, attempt: attempts[attemptIndex] };
  }

  return {
    isAdminRole,
    canAccessPage,
    shouldShowSidebarItem,
    normalizePercent,
    collectPracticeExamRows,
    summarizeHelpNeeds,
    adjustPracticeExamScore
  };
})();

const certificationCatalog = [
  "Pearson Cybersecurity",
  "Pearson Network Security",
  "Pearson Networking",
  "CompTIA Network Plus",
  "CompTIA Security Plus"
];

const pearsonNetworkSecurityQuestionBank = [
  {
    question: "MiTM attacks, Trojans, DDoS, and SQL injections all fall under which attack surface?",
    answers: ["Digital Attack Surface", "Physical Attack Surface", "Software Attack Surface", "Social Attack Surface"],
    correct: 0
  },
  {
    question: "Email attacks and impersonations fall under which attack surface?",
    answers: ["Social", "Hackers", "Physical", "Phishing"],
    correct: 0
  },
  {
    question: "Which of the following is not a preventative solution?",
    answers: ["Locks", "Man traps", "ID scanners", "Security cameras"],
    correct: 3
  },
  {
    question: "Which backup type is the quickest to restore?",
    answers: ["Full", "Incremental", "Differential", "All of them take the same time"],
    correct: 0
  },
  {
    question: "What does hashing provide for data communication?",
    answers: ["Origin authentication", "Data non-repudiation", "Data encryption", "Data integrity"],
    correct: 3
  },
  {
    question: "Decode DiD in terms of security.",
    answers: ["Defense is Detrimental", "Defense in Depth", "Distributed in Defense", "Deep in Defense"],
    correct: 1
  },
  {
    question: "A hospital only allows authorized healthcare personnel within one department to access patient PII. When employees move departments, that access is revoked. Which triad principle does this stem from?",
    answers: ["Confidentiality", "Integrity", "Availability", "None of the above"],
    correct: 0
  },
  {
    question: "Creating an MD5 hash for files is an example of ensuring what?",
    answers: ["Confidentiality", "Integrity", "Availability", "Least privilege"],
    correct: 1
  },
  {
    question: "How does role separation in a workspace improve server security?",
    answers: ["By placing a server on separate VLANs", "By enforcing the principle of least privilege", "By physically separating high-security servers from other servers", "By installing applications on a separate hard disk"],
    correct: 1
  },
  {
    question: "Patching existing vulnerabilities falls under which control function?",
    answers: ["Detective", "Corrective", "Technical", "Preventative"],
    correct: 1
  },
  {
    question: "Which access control model allows the owner of a resource to establish privileges to the information they own and has nonmandatory labels?",
    answers: ["DAC", "MAC", "RBAC", "ABAC"],
    correct: 0
  },
  {
    question: "You create a web server for your school. Visitors get a certificate error saying your site is not trusted. What should you do?",
    answers: ["Use a digital signature", "Generate a certificate request", "Enable public keys on your website", "Install a certificate from a trusted Certificate Authority"],
    correct: 3
  },
  {
    question: "Which access control method uses objects with labels and access set by the system?",
    answers: ["Ru-BAC", "Roll-BAC", "DAC", "MAC"],
    correct: 3
  },
  {
    question: "Which backup method saves changes on scheduled times since the last full backup?",
    answers: ["Full backup", "Incremental backup", "Differential backup", "None of the above"],
    correct: 1
  },
  {
    question: "Defense in depth is needed to ensure which three mandatory activities are present in a security system?",
    answers: ["Prevention, response, and prosecution", "Response, collection of evidence, and prosecution", "Prevention, detection, and response", "Prevention, response, and management"],
    correct: 2
  },
  {
    question: "Which access control uses metrics such as location, date, and time to allow or deny permission?",
    answers: ["ABAC", "RBAC", "DAC", "MAC"],
    correct: 0
  },
  {
    question: "Which backup restore type takes the longest?",
    answers: ["Full backups", "Incremental backups", "Differential backups", "All of them take the same time"],
    correct: 1
  },
  {
    question: "A company hashes data files to monitor whether information has been tampered with. Which triad principle does this stem from?",
    answers: ["Confidentiality", "Integrity", "Availability", "None of the above"],
    correct: 1
  },
  {
    question: "Servers, databases, and cloud providers classify under which attack surface type?",
    answers: ["Physical Attack Surface", "Digital Attack Surface", "Social Attack Surface", "Network Attack Surface"],
    correct: 1
  },
  {
    question: "What is a significant advantage of cloud-based backups?",
    answers: ["Cloud-based backups are far more secure than local backups", "The backups are geographically dispersed", "Restore time is lower than local backup and restore scenarios", "The cost is lower than local backups"],
    correct: 1
  },
  {
    question: "Which of the following is not a layer in the defense in depth model?",
    answers: ["Policies", "Network", "Transport", "Data", "Application"],
    correct: 2
  },
  {
    question: "A network admin deployed TACACS+. The system logs admin access to each device. This satisfies which A?",
    answers: ["Authorization", "Administration", "Authentication", "Accounting"],
    correct: 3
  },
  {
    question: "HTTPS uses which protocol to ensure web security?",
    answers: ["SSH", "TCP", "VPN", "SSL"],
    correct: 3
  },
  {
    question: "An administrator needs to grant users access to different servers based on job functions. Which access control model is best?",
    answers: ["Discretionary Access Control", "Role-Based Access Control", "Rule Based Access Control", "Mandatory Access Control"],
    correct: 1
  },
  {
    question: "Which of the following defines Attack Surface Analysis?",
    answers: ["It is the actual method of attack conducted in your environment", "It helps you identify what parts of the system you need to defend", "It gives a weight to potential attack points", "It can be computed by the product of the number of attack bias"],
    correct: 1
  },
  {
    question: "Which of the following is considered a detective administrative control?",
    answers: ["Audit logs", "Separation of duties", "Hiring and termination policies", "Creating an incident response plan"],
    correct: 0
  },
  {
    question: "A hacker launched a DDoS attack which took a site offline. Which triad principle does this affect?",
    answers: ["Confidentiality", "Integrity", "Availability", "None of the above"],
    correct: 2
  },
  {
    question: "Which SQL syntax indicates the beginning of a command?",
    answers: ["<", "'", "#", "--"],
    correct: 3
  },
  {
    question: "For online banking, you enter a password and then a 5-digit code sent to your phone. Which authentication type is this?",
    answers: ["Multifactor", "RADIUS", "VPN", "AAA"],
    correct: 0
  },
  {
    question: "Which character is most important to restrict when performing input validation to protect against XSS attacks?",
    answers: ["'", "!", "$", "<"],
    correct: 3
  },
  {
    question: "What are two benefits of creating VLANs?",
    answers: ["Provides segmentation and added security", "Contains collisions and dedicated bandwidth", "Allows switches to route between sub-interfaces and NAT", "Provides VPN security and DHCP"],
    correct: 0
  },
  {
    question: "Which address is not a public Class A address?",
    answers: ["8.15.147.69", "100.65.44.98", "10.15.117.68", "121.12.38.97"],
    correct: 2
  },
  {
    question: "For the routing descriptions question, which answer was marked correct?",
    answers: ["All correctly matched", "Static Routing only", "Dynamic Routing only", "Distance Vector only"],
    correct: 0
  },
  {
    question: "Which protocol is used when DHCP cannot be reached?",
    answers: ["SSL", "APIPA", "POP3", "STATIC"],
    correct: 1
  },
  {
    question: "A switch forwards all traffic to all ports.",
    answers: ["True", "False"],
    correct: 1
  },
  {
    question: "Which Windows command shows the packet path?",
    answers: ["netstat", "tracert", "traceroute", "show ip route"],
    correct: 1
  },
  {
    question: "For 128.57.85.44 /28, what is the corrected network address of the 5th subnet?",
    answers: ["128.57.85.64", "128.57.85.32", "128.57.85.48", "128.57.85.80"],
    correct: 0
  },
  {
    question: "What CIDR prefix matches the subnet mask 255.255.192.0?",
    answers: ["/16", "/17", "/18", "/19"],
    correct: 2
  },
  {
    question: "Which data-link sublayer handles upper and lower communication?",
    answers: ["OSPF", "LLC", "MAC", "RIP"],
    correct: 1
  },
  {
    question: "How many devices are on the Admin VLAN?",
    answers: ["2", "4", "6", "8"],
    correct: 2
  },
  {
    question: "What is the subnet mask for 18.65.112.14 /16?",
    answers: ["255.0.0.0", "255.255.0.0", "255.255.255.0", "255.255.255.128"],
    correct: 1
  },
  {
    question: "Real-time video announcements sent to all employees use which communication method?",
    answers: ["Multicast", "Anycast", "Unicast", "Broadcast"],
    correct: 3
  },
  {
    question: "What is the subnet mask for 89.14.168.12 /20?",
    answers: ["255.255.0.0", "255.255.192.0", "255.255.240.0", "255.255.248.0"],
    correct: 2
  },
  {
    question: "Which feature belongs to a router but not a Layer 3 switch?",
    answers: ["DHCP", "NAT", "RIP", "VPN"],
    correct: 1
  },
  {
    question: "Which command is used to view network routing tables?",
    answers: ["netstat", "netstat -a", "netstat -r", "netstat -t"],
    correct: 2
  },
  {
    question: "Information travels as what across a network?",
    answers: ["Packets", "Frames", "Segments", "Bits"],
    correct: 0
  },
  {
    question: "Which of the following are dynamic routing protocols?",
    answers: ["RIP", "OSPF", "IS-IS", "All of the above"],
    correct: 3
  },
  {
    question: "What does Teredo tunneling enable?",
    answers: ["Dynamically allocates IPv6", "Enables IPv6 through IPv4", "Translates IPv4 to IPv6", "Provides VPN security"],
    correct: 1
  },
  {
    question: "Which method is most bandwidth-efficient for multiple recipients?",
    answers: ["Unicast", "Multicast", "Broadcast", "Any of the above"],
    correct: 1
  },
  {
    question: "Which corrections are needed in the IP address class list?",
    answers: ["235.44.78.49 = Class D and 197.266.45.11 = Invalid", "162.25.114.66 = Class C and 98.56.48.133 = B", "126.23.46.77 = Class C and 235.44.78.49 = A", "No corrections are needed"],
    correct: 0
  },
  {
    question: "Which service resolves NetBIOS names to IP addresses?",
    answers: ["WINS", "ARP", "DNS", "DHCP"],
    correct: 0
  },
  {
    question: "Each hop in a traceroute is a what?",
    answers: ["Packet", "Frame", "Switch", "Router"],
    correct: 3
  },
  {
    question: "Email communication begins at which TCP/IP layer?",
    answers: ["Application", "Network", "Physical", "Transport"],
    correct: 0
  },
  {
    question: "Which communication method is used between a client and server?",
    answers: ["Unicast", "Broadcast", "Multicast", "All of the above"],
    correct: 0
  },
  {
    question: "Which data-link sublayer handles encapsulation and decapsulation?",
    answers: ["OSPF", "RIP", "MAC", "LLC"],
    correct: 2
  },
  {
    question: "What is the maximum number of RIP hops?",
    answers: ["6", "8", "15", "16"],
    correct: 2
  },
  {
    question: "Routing takes place at which TCP/IP layer?",
    answers: ["Application", "Transport", "Internet", "Interface"],
    correct: 2
  },
  {
    question: "Which option is not a remote access method?",
    answers: ["SSH", "Telnet", "RDP", "FTP"],
    correct: 3
  },
  {
    question: "Which is the best description of a VLAN?",
    answers: ["A switch port", "Physical segmentation", "Wireless LAN", "Digital segmentation using switch ports"],
    correct: 3
  },
  {
    question: "What hardware is required to connect a LAN to a WAN?",
    answers: ["Router", "Layer 2 switch", "Hub", "Stand-alone access point"],
    correct: 0
  },
  // Uploaded Network Security question bank remainder from Untitled document (2).pdf.
  {
    question: "A technician is tasked with using ACLs to secure a router. When would the technician use the 'ip access-group 101 in' configuration option or command?",
    answers: ["to apply an extended ACL to an interface", "to secure management traffic into the router", "to secure administrative access to the router", "to display all restricted traffic"],
    correct: 0
  },
  {
    question: "In which type of attack is falsified information used to redirect users to malicious Internet sites?",
    answers: ["DNS amplification and reflection", "ARP cache poisoning", "DNS cache poisoning", "domain generation"],
    correct: 2,
    explanation: "In a DNS cache poisoning attack, falsified information is used to redirect users from legitimate to malicious internet sites."
  },
  {
    question: "What is a feature of an IPS?",
    answers: ["It can stop malicious packets.", "It is deployed in offline mode.", "It has no impact on latency.", "It is primarily focused on identifying possible incidents."],
    correct: 0,
    explanation: "An advantage of an intrusion prevention systems (IPS) is that it can identify and stop malicious packets. However, because an IPS is deployed inline, it can add latency to the network."
  },
  {
    question: "What is the term used to describe a potential danger to a company's assets, data, or network functionality?",
    answers: ["vulnerability", "threat", "asset", "exploit"],
    correct: 1
  },
  {
    question: "Refer to the exhibit. Network 192.168.30.0/24 contains all of the company servers. Policy dictates that traffic from the servers to both networks 192.168.10.0 and 192.168.11.0 be limited to replies for original requests. What is the best ACL type and placement to use in this situation?",
    answers: ["standard ACL inbound on R1 vty lines", "extended ACLs inbound on R1 G0/0 and G0/1", "extended ACL inbound on R3 G0/0", "extended ACL inbound on R3 S0/0/1"],
    correct: 2,
    explanation: "Standard ACLs permit or deny packets based only on the source IPv4 address. Because all traffic types are permitted or denied, standard ACLs should be located as close to the destination as possible. Extended ACLs permit or deny packets based on the source IPv4 address and destination IPv4 address, protocol type, source and destination TCP or UDP ports and more. Because the filtering of extended ACLs is so specific, extended ACLs should be located as close as possible to the source of the traffic to be filtered. Undesirable traffic is denied close to the source network without crossing the network infrastructure."
  },
  {
    question: "What does the CLI prompt change to after entering the command ip access-list standard aaa from global configuration mode?",
    answers: ["Router(config-line)#", "Router(config-std-nacl)#", "Router(config)#", "Router(config-router)#", "Router(config-if)#"],
    correct: 1
  },
  {
    question: "Refer to the exhibit. Many employees are wasting company time accessing social media on their work computers. The company wants to stop this access. What is the best ACL type and placement to use in this situation?",
    answers: ["extended ACL outbound on R2 WAN interface towards the internet", "standard ACL outbound on R2 WAN interface towards the internet", "standard ACL outbound on R2 S0/0/0", "extended ACLs inbound on R1 G0/0 and G0/1"],
    correct: 3
  },
  {
    question: "A technician is tasked with using ACLs to secure a router. When would the technician use the 40 deny host 192.168.23.8 configuration option or command?",
    answers: ["to remove all ACLs from the router", "to create an entry in a numbered ACL", "to apply an ACL to all router interfaces", "to secure administrative access to the router"],
    correct: 1
  },
  {
    question: "What is the best description of Trojan horse malware?",
    answers: ["It is malware that can only be distributed over the Internet.", "It appears as useful software but hides malicious code.", "It is software that causes annoying but not fatal computer problems.", "It is the most easily detected form of malware."],
    correct: 1
  },
  {
    question: "What wild card mask will match networks 172.16.0.0 through 172.19.0.0?",
    answers: ["0.0.3.255", "0.252.255.255", "0.3.255.255", "0.0.255.255"],
    correct: 2,
    explanation: "The subnets 172.16.0.0 through 172.19.0.0 all share the same 14 high level bits. A wildcard mask in binary that matches 14 high order bits is 00000000.00000011.11111111.11111111. In dotted decimal this wild card mask is 0.3.255.255."
  },
  {
    question: "What is the term used to describe gray hat hackers who publicly protest organizations or governments by posting articles, videos, leaking sensitive information, and performing network attacks?",
    answers: ["white hat hackers", "grey hat hackers", "hacktivists", "state-sponsored hacker"],
    correct: 2,
    explanation: "Hacktivists are motivated by political or social protest and may leak information or conduct attacks to publicize a cause."
  },
  {
    question: "Refer to the exhibit. The company has provided IP phones to employees on the 192.168.10.0/24 network and the voice traffic will need priority over data traffic. What is the best ACL type and placement to use in this situation?",
    answers: ["extended ACL inbound on R1 G0/0", "extended ACL outbound on R2 WAN interface towards the internet", "extended ACL outbound on R2 S0/0/1", "extended ACLs inbound on R1 G0/0 and G0/1"],
    correct: 0,
    explanation: "Standard ACLs permit or deny packets based only on the source IPv4 address. Because all traffic types are permitted or denied, standard ACLs should be located as close to the destination as possible. Extended ACLs permit or deny packets based on the source IPv4 address and destination IPv4 address, protocol type, source and destination TCP or UDP ports and more. Because the filtering of extended ACLs is so specific, extended ACLs should be located as close as possible to the source of the traffic to be filtered. Undesirable traffic is denied close to the source network without crossing the network infrastructure."
  },
  {
    question: "A technician is tasked with using ACLs to secure a router. When would the technician use the no ip access-list 101 configuration option or command?",
    answers: ["to apply an ACL to all router interfaces", "to secure administrative access to the router", "to remove all ACLs from the router", "to remove a configured ACL"],
    correct: 3
  },
  {
    question: "What is the term used to describe unethical criminals who compromise computer and network security for personal gain, or for malicious reasons?",
    answers: ["hacktivists", "vulnerability broker", "black hat hackers", "script kiddies"],
    correct: 2
  },
  {
    question: "What is the term used to describe a guarantee that the message is not a forgery and does actually come from whom it states?",
    answers: ["origin authentication", "mitigation", "exploit", "data non-repudiation"],
    correct: 0
  },
  {
    question: "A technician is tasked with using ACLs to secure a router. When would the technician use the ip access-group 101 in configuration option or command?",
    answers: ["to secure administrative access to the router", "to apply an extended ACL to an interface", "to display all restricted traffic", "to secure management traffic into the router"],
    correct: 1
  },
  {
    question: "A technician is tasked with using ACLs to secure a router. When would the technician use the remark configuration option or command?",
    answers: ["to generate and send an informational message whenever the ACE is matched", "to add a text entry for documentation purposes", "to identify one specific IP address", "to restrict specific traffic access through an interface"],
    correct: 1
  },
  {
    question: "Refer to the exhibit. The company CEO demands that one ACL be created to permit email traffic to the internet and deny FTP access. What is the best ACL type and placement to use in this situation?",
    answers: ["extended ACL outbound on R2 WAN interface towards the internet", "standard ACL outbound on R2 S0/0/0", "extended ACL inbound on R2 S0/0/0", "standard ACL inbound on R2 WAN interface connecting to the internet"],
    correct: 2
  },
  {
    question: "A technician is tasked with using ACLs to secure a router. When would the technician use the established configuration option or command?",
    answers: ["to add a text entry for documentation purposes", "to display all restricted traffic", "to allow specified traffic through an interface", "to allow returning reply traffic to enter the internal network"],
    correct: 3
  },
  {
    question: "A technician is tasked with using ACLs to secure a router. When would the technician use the deny configuration option or command?",
    answers: ["to identify one specific IP address", "to display all restricted traffic", "to restrict specific traffic access through an interface", "to generate and send an informational message whenever the ACE is matched"],
    correct: 2
  },
  {
    question: "Refer to the exhibit. Only authorized remote users are allowed remote access to the company server 192.168.30.10. What is the best ACL type and placement to use in this situation?",
    answers: ["extended ACLs inbound on R1 G0/0 and G0/1", "extended ACL outbound on R2 WAN interface towards the internet", "extended ACL inbound on R2 S0/0/0", "extended ACL inbound on R2 WAN interface connected to the internet"],
    correct: 3
  },
  {
    question: "Refer to the exhibit. Employees on 192.168.11.0/24 work on critically sensitive information and are not allowed access off their network. What is the best ACL type and placement to use in this situation?",
    answers: ["standard ACL inbound on R1 vty lines", "extended ACL inbound on R1 G0/0", "standard ACL inbound on R1 G0/1", "extended ACL inbound on R3 S0/0/1"],
    correct: 2
  },
  {
    question: "A technician is tasked with using ACLs to secure a router. When would the technician use the host configuration option or command?",
    answers: ["to add a text entry for documentation purposes", "to generate and send an informational message whenever the ACE is matched", "to identify any IP address", "to identify one specific IP address"],
    correct: 3
  },
  {
    question: "What commonly motivates cybercriminals to attack networks as compared to hacktivists or state-sponsored hackers?",
    answers: ["financial gain", "political reasons", "fame seeking", "status among peers"],
    correct: 0,
    explanation: "Cybercriminals are commonly motivated by money. Hackers are known to hack for status. Cyberterrorists are motivated to commit cybercrimes for religious or political reasons."
  }

];

const incidentHandlingUnit4QuestionBank = [
  {
    question: "Which stage of the Cyber Kill Chain involves the installation of malicious software?",
    answers: ["Exploitation", "Delivery", "Command and Control", "Actions on Objectives"],
    correct: 0
  },
  {
    question: "What is a key benefit of using SIEM and SOAR together?",
    answers: ["Increased complexity", "Enhanced visibility and automation", "Dependency on manual analysis", "Isolation of SIEM and SOAR"],
    correct: 1
  },
  {
    question: "Which MITRE ATT&CK component describes procedures used by adversaries?",
    answers: ["Tactics", "Techniques", "Sub-techniques", "Procedures"],
    correct: 3
  },
  {
    question: "What compliance applies to online credit card transactions?",
    answers: ["FISMA", "FERPA", "HIPAA", "PCI-DSS"],
    correct: 3
  },
  {
    question: "An infected computer communicates with an external server for commands. Which Kill Chain stage is this?",
    answers: ["Installation", "Reconnaissance", "Delivery", "Command and Control"],
    correct: 3
  },
  {
    question: "Which Cyber Kill Chain stage involves executing malicious actions?",
    answers: ["Exploitation", "Installation", "Command and Control", "Actions on Objectives"],
    correct: 3
  },
  {
    question: "Which security alert classification is the greatest threat because it represents undetected exploits?",
    answers: ["True Positive", "False Positive", "True Negative", "False Negative"],
    correct: 3
  },
  {
    question: "What does Actions on Objectives represent in the Cyber Kill Chain?",
    answers: ["Overall attacker strategy", "Phase after an incident", "Stage where attacker achieves goals", "Reconnaissance phase"],
    correct: 2
  },
  {
    question: "Which compliance framework protects customer personal data in the EU?",
    answers: ["HIPAA", "GDPR", "FERPA", "PCI-DSS"],
    correct: 1
  },
  {
    question: "Which MITRE ATT&CK techniques best match a phishing and PowerShell attack scenario?",
    answers: ["Phishing, PowerShell, Lateral Movement", "Drive-by Compromise, Exploit Public-Facing App", "Valid Accounts, Brute Force, DDoS", "Supply Chain Compromise, Signed Binary Proxy Execution"],
    correct: 0
  },
  {
    question: "Localized worm or virus outbreak refers to which incident level?",
    answers: ["Low Level", "Middle Level", "High Level", "Interior Level"],
    correct: 1
  },
  {
    question: "What is the purpose of MITRE ATT&CK Tactics categories?",
    answers: ["Identify adversary groups", "Focus on documentation", "Describe attacker strategies", "Automate response actions"],
    correct: 2
  },
  {
    question: "What is the process of receiving, sorting, and prioritizing information?",
    answers: ["Triage", "Incident", "Handling", "Constituency"],
    correct: 0
  },
  {
    question: "How does a SIEM system contribute to incident detection?",
    answers: ["Automating response actions", "Conducting vulnerability assessments", "Collecting, analyzing, and correlating event data", "Managing access controls"],
    correct: 2
  },
  {
    question: "What is the primary focus of the Persistence stage?",
    answers: ["Maintaining long-term access", "Establishing communication", "Identifying targets", "Delivering payloads"],
    correct: 0
  },
  {
    question: "Which framework protects educational records?",
    answers: ["FISMA", "FERPA", "GDPR", "HIPAA"],
    correct: 1
  },
  {
    question: "What is the first step in incident response?",
    answers: ["Recovery", "Containment", "Eradication", "Identification"],
    correct: 3
  },
  {
    question: "How many stages are in the Cyber Kill Chain?",
    answers: ["3", "5", "7", "10"],
    correct: 2
  },
  {
    question: "A ransomware attack encrypting files belongs to which Kill Chain stage?",
    answers: ["Command and Control", "Exploitation", "Actions on Objectives", "Delivery"],
    correct: 2
  },
  {
    question: "Blocking a malicious IP and seeing traffic decrease is classified as:",
    answers: ["True Positive", "False Positive", "True Negative", "False Negative"],
    correct: 0
  },
  {
    question: "What is the advantage of integrating SOAR?",
    answers: ["Slower responses", "Manual log dependency", "Increased manual intervention", "Automation and efficiency"],
    correct: 3
  },
  {
    question: "What was the infrastructure in the Diamond Model for Stuxnet?",
    answers: ["Worm", "Israel/US", "USB Device", "Iranian nuclear facility"],
    correct: 2
  },
  {
    question: "A SIEM alert caused by a misconfiguration is classified as:",
    answers: ["True Positive", "False Positive", "True Negative", "False Negative"],
    correct: 1
  },
  {
    question: "Which framework secures federal agency systems?",
    answers: ["FISMA", "FERPA", "NIST", "HIPAA"],
    correct: 0
  },
  {
    question: "Which Cyber Kill Chain stage identifies vulnerabilities?",
    answers: ["Installation", "Exploitation", "Reconnaissance", "Command and Control"],
    correct: 2
  },
  {
    question: "How does MITRE ATT&CK improve defenses?",
    answers: ["Vulnerability assessments", "Common language for adversary behavior", "Automating responses", "Automatic eradication"],
    correct: 1
  },
  {
    question: "How does the Diamond Model contribute to threat intelligence?",
    answers: ["Focuses on documentation", "Automatically eradicates threats", "Framework to analyze adversary behavior", "Conducts vulnerability assessments"],
    correct: 2
  },
  {
    question: "In incident response, what does detection mean?",
    answers: ["Finding vulnerabilities", "Recognizing and confirming an incident", "Eliminating the threat actor", "Restoring systems"],
    correct: 1
  },
  {
    question: "What is the primary goal of containment?",
    answers: ["Identifying root cause", "Isolating and limiting impact", "Restoring systems", "Notifying stakeholders"],
    correct: 1
  },
  {
    question: "Which is a key component of an incident response plan?",
    answers: ["Updating antivirus", "Real-time monitoring", "Incident documentation and reporting", "Quarterly pentesting"],
    correct: 2
  },
  {
    question: "In the Diamond Model, what does Infrastructure represent?",
    answers: ["Victim location", "Network or systems used by attacker", "Response actions", "Financial impact"],
    correct: 1
  },
  {
    question: "What occurs during eradication?",
    answers: ["Notify law enforcement", "Remove threats and vulnerabilities", "Recover backups", "Document the incident"],
    correct: 1
  },
  {
    question: "What compliance should be considered when sharing patient data?",
    answers: ["HIPAA", "FERPA", "FISMA", "GDPR"],
    correct: 0
  },
  {
    question: "Reviewing employee LinkedIn profiles is which Kill Chain stage?",
    answers: ["Weaponization", "Reconnaissance", "Delivery", "Exploitation"],
    correct: 1
  },
  {
    question: "Analyzing and confirming a phishing email belongs to which incident response stage?",
    answers: ["Identification", "Containment", "Eradication", "Recovery"],
    correct: 0
  }
];

const riskManagementUnit5QuestionBank = [
  {
    question: "Contracting out a specialized technical component is an example of:",
    answers: ["Risk acceptance", "Risk transference", "Risk deterrence", "Risk avoidance"],
    correct: 1
  },
  {
    question: "If a breach costs $100,000 and is expected once every 5 years, the SLE is:",
    answers: ["$100,000", "$500,000", "$20,000", "$5,000"],
    correct: 0
  },
  {
    question: "Which role is most likely concerned about whether security costs are justified?",
    answers: ["CISO", "CEO", "Legal", "CFO"],
    correct: 3
  },
  {
    question: "Which phrase best aligns with the CISO viewpoint on risk?",
    answers: ["This risk is too high to ignore.", "Is this worth the cost?", "This fix could break systems.", "Are we compliant?"],
    correct: 0
  },
  {
    question: "Increasing system redundancy primarily reduces:",
    answers: ["Impact", "Likelihood", "Asset value", "Threat capability"],
    correct: 0
  },
  {
    question: "If an asset is worth $10,000 and EF is 20%, what is the SLE?",
    answers: ["$10,000", "$5,000", "$2,000", "$500"],
    correct: 2
  },
  {
    question: "Tolerating a known risk temporarily is an example of:",
    answers: ["Risk mitigation", "Risk acceptance", "Risk avoidance", "Risk transference"],
    correct: 1
  },
  {
    question: "Unlicensed open-source code in a commercial product creates risk related to:",
    answers: ["Software compliance and licensing", "Internal misuse", "Environmental factors", "External threats"],
    correct: 0
  },
  {
    question: "Which pairing best represents a complete risk scenario?",
    answers: ["Threat + vulnerability + impact", "Vulnerability + likelihood", "Asset + impact", "Threat + exploit"],
    correct: 0
  },
  {
    question: "Malware taking advantage of an unpatched web server is best described as a:",
    answers: ["Exploit", "Threat", "Impact", "Risk"],
    correct: 0
  },
  {
    question: "Customer data in risk management is classified as a:",
    answers: ["Exploit", "Vulnerability", "Asset", "Threat"],
    correct: 2
  },
  {
    question: "Which control combination best supports risk mitigation?",
    answers: ["Backups and incident response planning", "Contract termination", "Insurance and acceptance", "System shutdown and decommissioning"],
    correct: 0
  },
  {
    question: "Removing internet access from a legacy system is an example of:",
    answers: ["Risk transference", "Risk avoidance", "Risk acceptance", "Risk mitigation"],
    correct: 1
  },
  {
    question: "A competitor using stolen proprietary algorithms is most likely:",
    answers: ["Software compliance risk", "Legacy system exposure", "External risk", "Intellectual property theft"],
    correct: 3
  },
  {
    question: "In a phishing scenario, what is the primary vulnerability?",
    answers: ["Employee lack of phishing awareness", "Company customer data", "Attacker sending the email", "Financial loss"],
    correct: 0
  },
  {
    question: "Faster repair automation most directly reduces:",
    answers: ["MTBF", "MTTR", "RTO", "RPO"],
    correct: 1
  },
  {
    question: "A log monitoring system is an example of a:",
    answers: ["Preventative control", "Detective control", "Corrective control", "Recovery control"],
    correct: 1
  },
  {
    question: "Preventive controls without incident response planning most likely reduce:",
    answers: ["Elimination of risk", "Reduced exposure", "Reduced impact", "Reduced likelihood"],
    correct: 3
  },
  {
    question: "Warning banners are primarily used as a:",
    answers: ["Preventative control", "Recovery control", "Deterrent control", "Detective control"],
    correct: 2
  },
  {
    question: "Which acronym refers to maximum allowable restoration time after disruption?",
    answers: ["MTTF", "RPO", "RTO", "SLA"],
    correct: 2
  },
  {
    question: "Exploiting an old unpatchable server involves which risk types?",
    answers: ["External and internal", "Intellectual property and licensing", "Internal and compliance", "Legacy systems and external"],
    correct: 3
  },
  {
    question: "Ranking risks as high, medium, or low is an example of:",
    answers: ["Qualitative risk analysis", "Risk avoidance", "Quantitative risk analysis", "Risk transference"],
    correct: 0
  }
];

// Cybersecurity blends incident/risk material with half of Network Security for overlap review.
const pearsonCybersecurityQuestionBank = [
  ...pearsonNetworkSecurityQuestionBank.slice(0, Math.ceil(pearsonNetworkSecurityQuestionBank.length / 2)),
  ...incidentHandlingUnit4QuestionBank,
  ...riskManagementUnit5QuestionBank
];

const pearsonNetworkingQuestionBank = [
  {
    question: "A disadvantage of which topology is that if one computer goes down, it can take the entire network with it?",
    answers: ["Star", "Mesh", "Ring", "Hybrid"],
    correct: 2
  },
  {
    question: "A user interface can be provided on which OSI layer?",
    answers: ["Presentation", "Physical", "Data Link", "Application"],
    correct: 3
  },
  {
    question: "Which layer of the OSI model does the NIC operate in?",
    answers: ["Data-link layer", "Transmission layer", "Physical layer", "Application layer"],
    correct: 0
  },
  {
    question: "Which of the following is a collection of computers and networks joined together across the world?",
    answers: ["Intranet", "Internet", "Extranet", "Ethernet"],
    correct: 1
  },
  {
    question: "Which type of application architecture is used when spreadsheet software connects to a remote database?",
    answers: ["Stand-alone application", "Client-server application", "Web application", "Cloud application"],
    correct: 1
  },
  {
    question: "What type of zone allows vendors limited access to company resources?",
    answers: ["CAN", "Intranet", "Extranet", "Telecom"],
    correct: 2
  },
  {
    question: "Which OSI layer translates the data format between operating systems?",
    answers: ["Session layer", "Network layer", "Presentation layer", "Application layer"],
    correct: 2
  },
  {
    question: "What are two advantages of DSL for WAN connections?",
    answers: ["Uses standard telephone lines and is cost-effective for SOHO internet", "Higher bandwidth than cable modems and bypasses ISP requirements", "Preferred for enterprise point-to-point links and uses fiber only", "Requires no modem and no provider"],
    correct: 0
  },
  {
    question: "Which OSI layer is equivalent to the Internet layer in TCP/IP?",
    answers: ["Transport", "Session", "Application", "Datalink", "Presentation", "Network", "Physical"],
    correct: 5
  },
  {
    question: "A cable meeting 1000BaseT standards has a maximum length of:",
    answers: ["100m", "250m", "500m", "1000m"],
    correct: 0
  },
  {
    question: "Which TCP/IP layer determines how to get data to its destination?",
    answers: ["Application layer", "Transport layer", "Network layer", "Link layer"],
    correct: 2
  },
  {
    question: "Which is an advantage of a peer-to-peer network?",
    answers: ["Files cannot be centrally backed up", "Does not need an expensive server", "The server is expensive to purchase", "Security can be carried out centrally"],
    correct: 1
  },
  {
    question: "Which Layer 4 protocol is connection-oriented?",
    answers: ["Transmission Control Protocol", "User Datagram Protocol", "Remote Desktop Protocol", "Secure Socket Layer"],
    correct: 0
  },
  {
    question: "What cable should be used to directly connect two laptops?",
    answers: ["Crossover cable", "Rolled cable", "Patch cable", "Straight-through cable"],
    correct: 0
  },
  {
    question: "Which implementation provides a private portal for authorized company users?",
    answers: ["Extranet", "DMZ", "Intranet", "NAT"],
    correct: 2
  },
  {
    question: "Which tool isolates the correct cable in a patch panel?",
    answers: ["Cable tester", "Multimeter", "Toner probe", "Crimper"],
    correct: 2
  },
  {
    question: "Why would an organization use STP instead of UTP cable?",
    answers: ["To reduce attenuation", "Because it is lighter and more flexible", "Because there is high external interference", "Because it has a lower installation cost"],
    correct: 2
  },
  {
    question: "Which topology connects devices directly to each other without using a central infrastructure device?",
    answers: ["Mesh", "Bus", "Adhoc", "Ring", "Star"],
    correct: 2
  },
  {
    question: "Which network infrastructure type covers a city or metropolitan area?",
    answers: ["PAN", "WAN", "CAN", "MAN"],
    correct: 3
  },
  {
    question: "What are two characteristics of wired Ethernet topology?",
    answers: ["Uses twisted pair media and can negotiate transmission speeds", "NICs are encoded with IP addresses and use tokens to avoid collisions", "Requires fiber only and always uses static speeds", "Uses radio signals and does not need cables"],
    correct: 0
  },
  {
    question: "Which OSI layers equal the Interface layer in TCP/IP?",
    answers: ["Session and Application", "Datalink and Physical", "Transport and Presentation", "Network and Session"],
    correct: 1
  },
  {
    question: "Routed private Wi-Fi networks at one location are an example of:",
    answers: ["Internet", "Extranet", "Intranet", "Perimeter"],
    correct: 2
  },
  {
    question: "Which networking topology uses a central device with individual connections to each endpoint?",
    answers: ["Ring", "Mesh", "Bus", "Star"],
    correct: 3
  },
  {
    question: "Which topology matching is correct?",
    answers: ["Central hub = Star; token-passing nodes = Ring; multiple redundant paths = Mesh", "Central hub = Bus; token-passing nodes = Star; redundant paths = Ring", "Central hub = Mesh; token-passing nodes = Bus; redundant paths = Star", "Central hub = Ring; token-passing nodes = Mesh; redundant paths = Bus"],
    correct: 0
  },
  {
    question: "Which topology uses terminators to absorb signals?",
    answers: ["Ring", "Bus", "Mesh", "Star"],
    correct: 1
  },
  {
    question: "Which cable should connect locations that are 6 miles apart?",
    answers: ["Single-mode fiber", "Multi-mode fiber", "Cat5e", "Cat6"],
    correct: 0
  },
  {
    question: "What devices are connected in a PAN?",
    answers: ["Laptops, smartphones, and tablets", "Printers and headsets", "Wearable technology", "All of the above"],
    correct: 3
  },
  {
    question: "Which networking term match is correct?",
    answers: ["Internet = vast worldwide network; Extranet = secure collaboration between companies; Intranet = private employee-only network", "Internet = private employee-only network; Extranet = local cable type; Intranet = public worldwide network", "Internet = wireless access point; Extranet = router table; Intranet = modem type", "Internet = campus network; Extranet = personal network; Intranet = wide area network"],
    correct: 0
  },
  {
    question: "Which client-server network statement set is correct?",
    answers: ["Centralized administration is true; each computer sharing resources is false; requiring accounts on every computer is false", "Centralized administration is false; each computer sharing resources is true; requiring accounts on every computer is true", "Centralized administration is true; each computer sharing resources is true; requiring accounts on every computer is true", "Centralized administration is false; each computer sharing resources is false; requiring accounts on every computer is true"],
    correct: 0
  },
  {
    question: "Which OSI layers can be physically troubleshooted?",
    answers: ["Data Link and Physical", "Application and Presentation", "Transport and Session", "Network and Application"],
    correct: 0
  },
  {
    question: "What is the primary disadvantage of bus topology?",
    answers: ["Single point of failure", "Independent routers", "Central switch", "Multiple radio cards"],
    correct: 0
  },
  {
    question: "Which technology allows very short-range communication by tapping or bringing devices close together?",
    answers: ["PoE", "NFC", "DNS", "WLAN"],
    correct: 1
  },
  {
    question: "Which OSI layer encapsulates data with a header and trailer?",
    answers: ["Physical", "Application", "Data Link", "Presentation"],
    correct: 2
  },
  {
    question: "What are the main advantages of a star network?",
    answers: ["Processes data very fast and is easy to implement", "Cheap to set up and stores more data", "Requires additional hardware and uses tokens", "Uses terminators and avoids central devices"],
    correct: 0
  },
  {
    question: "Which server primarily stores queryable data?",
    answers: ["Web server", "Application server", "Computer server", "Database server"],
    correct: 3
  },
  {
    question: "Which OSI layer to PDU matching is correct?",
    answers: ["Network = Packets; Physical = Bits; Datalink = Frames; Application = Data; Transport = Segments", "Network = Bits; Physical = Packets; Datalink = Segments; Application = Frames; Transport = Data", "Network = Frames; Physical = Data; Datalink = Bits; Application = Packets; Transport = Segments", "Network = Data; Physical = Segments; Datalink = Packets; Application = Bits; Transport = Frames"],
    correct: 0
  },
  {
    question: "Which topology provides fault tolerance with redundant paths?",
    answers: ["Ring", "Bus", "Star", "Mesh"],
    correct: 3
  },
  {
    question: "Which kind of firewall is connected between a device and the network that connects to the internet?",
    answers: ["Hardware firewall", "Software firewall", "Stateful inspection firewall", "Microsoft firewall"],
    correct: 0
  },
  {
    question: "What is a stateless firewall?",
    answers: ["A firewall that filters traffic based on connection state", "A firewall that operates only at Layer 7", "A firewall that examines each packet in isolation", "A firewall using advanced adaptive algorithms"],
    correct: 2
  },
  {
    question: "What port does secure HTTP use?",
    answers: ["TCP port 550", "TCP port 443", "TCP port 399", "TCP port 250"],
    correct: 1
  },
  {
    question: "In which scenario would a stateful firewall be more effective than a stateless firewall?",
    answers: ["Filtering HTTP requests by source IP only", "Allowing traffic based only on ports", "Blocking malicious patterns without session context", "Preventing unauthorized access by maintaining TCP connection state"],
    correct: 3
  },
  {
    question: "What is a primary advantage of a stateful firewall over a stateless firewall?",
    answers: ["Simplicity of configuration", "Higher performance", "Ability to inspect only packet contents", "Improved security through connection tracking"],
    correct: 3
  },
  {
    question: "Which of the following was marked as not a type of firewall in the question bank?",
    answers: ["Packet-filtering firewall", "Demilitarized Zone (DMZ)", "Proxy firewall", "Intrusion Prevention System (IPS)"],
    correct: 3
  },
  {
    question: "Which layer of the OSI model do firewalls primarily operate at?",
    answers: ["Physical layer", "Data link layer", "Network layer", "Transport layer"],
    correct: 2
  },
  {
    question: "Which type of firewall examines packet contents and application data?",
    answers: ["Packet-filtering firewall", "Stateful firewall", "Proxy firewall", "Hybrid firewall"],
    correct: 2
  },
  {
    question: "What distinguishes a network-based firewall from a host-based firewall?",
    answers: ["Network-based firewalls filter only at the application layer", "Network-based firewalls are installed on individual computers", "Network-based firewalls protect only one computer", "Network-based firewalls monitor or filter traffic at network boundaries"],
    correct: 3
  },
  {
    question: "What is an advantage of using both network-based and host-based firewalls together?",
    answers: ["Increased complexity", "Slower performance", "Redundancy if one firewall fails", "Reduced security"],
    correct: 2
  },
  {
    question: "In which scenario would a host-based firewall be most effective?",
    answers: ["Protecting a corporate network edge", "Filtering traffic between departments", "Securing a single computer connected to the internet", "Controlling LAN shared resources"],
    correct: 2
  },
  {
    question: "Which best describes a network-based firewall?",
    answers: ["Installed on individual computers", "Filters traffic at the boundary between private and external networks", "Operates only at the application layer", "Encrypts all transmitted data"],
    correct: 1
  },
  {
    question: "What is an advantage of stateful firewalls over stateless firewalls?",
    answers: ["Easier configuration", "Filters based on connection context", "Uses less bandwidth", "Better legacy compatibility"],
    correct: 1
  },
  {
    question: "What does a stateful firewall use to keep track of connections?",
    answers: ["Packet headers", "Source IP addresses", "Session tables", "MAC addresses"],
    correct: 2
  },
  {
    question: "A firewall that checks packets without tracking sessions is best described as which type?",
    answers: ["Stateful firewall", "Stateless firewall", "Static firewall", "Dynamic firewall"],
    correct: 1
  },
  {
    question: "Which communication method is most bandwidth-efficient for delivering data to multiple specific recipients?",
    answers: ["Unicast", "Multicast", "Broadcast", "Any of the above"],
    correct: 1
  },
  {
    question: "Which communication method is least suitable for delivering data to a specific group of recipients?",
    answers: ["Multicast", "Unicast", "Broadcast", "Anycast"],
    correct: 2
  },
  {
    question: "Which communication method is typically used for communication between a client and a server in a network?",
    answers: ["Unicast", "Multicast", "Broadcast", "All of the above"],
    correct: 0
  },
  {
    question: "A streaming service is delivering a live concert to subscribers worldwide. Which method was marked best in the question bank?",
    answers: ["Multicast", "Broadcasting", "Anycast", "Unicast"],
    correct: 3
  },
  {
    question: "A company is conducting a live training session for employees in different branches worldwide. Which communication method is best?",
    answers: ["Unicast", "Anycast", "Broadcast", "Multicast"],
    correct: 3
  },
  {
    question: "A hospital needs to send critical patient data from a monitoring device to multiple medical staff members in real time. Which method is best?",
    answers: ["Unicast", "Multicast", "Anycast", "Broadcast"],
    correct: 1
  },
  {
    question: "A multinational corporation is deploying VoIP for employees. Which method is best for routing calls to the nearest gateway?",
    answers: ["Unicast", "Multicast", "Anycast", "Broadcast"],
    correct: 2
  },
  {
    question: "A LAN in an office needs to distribute real-time video announcements to all employees simultaneously. Which method is best?",
    answers: ["Multicast", "Anycast", "Unicast", "Broadcast"],
    correct: 3
  }
];

const comptiaSecurityPlusQuestionBank = [];

const networkSecurityPracticeExamSubunits = [
  "Threats and Attacks",
  "Secure Communications and Cryptography",
  "ACL Fundamentals and Wildcard Masks",
  "ACL Design and Placement",
  "Router Management Controls",
  "Security Monitoring and Prevention"
];

const networkingPracticeExamSubunits = [
  "Networking Fundamentals",
  "Network Infrastructures",
  "Network Hardware",
  "Protocols and Services",
  "Troubleshooting"
];

const cyberSecurityPracticeExamSubunits = [
  "Security Principles",
  "Securing the Network",
  "Securing Endpoint Devices",
  "Vulnerability Assessment and Risk Management",
  "Incident Management"
];

const securityPlusPracticeExamSubunits = [
  "Malware and Persistence",
  "Social Engineering",
  "Web Application Attacks",
  "Network Attacks",
  "Wireless and Mobile Attacks",
  "Assessment and Testing",
  "Configuration and Vulnerability Management",
  "Threat Actors and Attribution",
  "Security Plus Review"
];

function networkingPracticeQuestion(subunit, question, answers, correct = 0) {
  return {
    type: "choice",
    subunit,
    question,
    answers,
    correct
  };
}

function networkSecurityPracticeQuestion(subunit, question, answers, correct = 0, explanation = "") {
  return {
    type: "choice",
    subunit,
    question,
    answers,
    correct,
    explanation
  };
}

function networkSecurityMultiSelectQuestion(subunit, question, answers, correct = [], explanation = "") {
  return {
    type: "multi-select",
    subunit,
    question,
    answers,
    correct,
    requiredSelections: correct.length,
    explanation
  };
}

function cybersecurityPracticeQuestion(subunit, question, answers, correct = 0) {
  return networkingPracticeQuestion(subunit, question, answers, correct);
}

function securityPlusPracticeQuestion(subunit, question, answers, correct = 0) {
  return networkingPracticeQuestion(subunit, question, answers, correct);
}

function cybersecurityMultiSelectQuestion(subunit, question, answers, correct = []) {
  return {
    type: "multi-select",
    subunit,
    question,
    answers,
    correct,
    requiredSelections: correct.length
  };
}

function cybersecurityDropdownQuestion(subunit, question, prompts) {
  return networkingDropdownQuestion(subunit, question, prompts);
}

function cybersecurityMatchingQuestion(subunit, question, pairs, options = null) {
  return networkingMatchingQuestion(subunit, question, pairs, options);
}

function networkingDropdownQuestion(subunit, question, prompts) {
  return {
    type: "dropdown",
    subunit,
    question,
    prompts
  };
}

function networkingMatchingQuestion(subunit, question, pairs, options = null) {
  return {
    type: "matching",
    subunit,
    question,
    pairs,
    options: options || [...new Set(pairs.map((pair) => pair.correct))]
  };
}

const networkSecurityPracticeExamQuestionBank = [
  networkSecurityPracticeQuestion("Threats and Attacks", "The IT department is reporting that a company web server is receiving an abnormally high number of web page requests from different locations simultaneously. Which type of security attack is occurring?", ["adware", "DDoS", "phishing", "social engineering", "spyware"], 1),
  networkSecurityPracticeQuestion("Threats and Attacks", "What causes a buffer overflow?", ["launching a security countermeasure to mitigate a Trojan horse", "downloading and installing too many software updates at one time", "attempting to write more data to a memory location than that location can hold", "sending too much information to two or more interfaces of the same device, thereby causing dropped packets", "sending repeated connections such as Telnet to a particular device, thus denying other data sources"], 2),
  networkSecurityPracticeQuestion("Secure Communications and Cryptography", "Which objective of secure communications is achieved by encrypting data?", ["authentication", "availability", "confidentiality", "integrity"], 2, "When data is encrypted, it is scrambled to keep the data private and confidential so that only authorized recipients can read the message. A hash function is another way of providing confidentiality."),
  networkSecurityPracticeQuestion("Threats and Attacks", "What type of malware has the primary objective of spreading across the network?", ["worm", "virus", "Trojan horse", "botnet"], 0),
  networkSecurityPracticeQuestion("Threats and Attacks", "What commonly motivates cybercriminals to attack networks as compared to hacktivists or state-sponsored hackers?", ["financial gain", "fame seeking", "status among peers", "political reasons"], 0, "Cybercriminals are commonly motivated by money. Hackers are known to hack for status. Cyberterrorists are motivated to commit cybercrimes for religious or political reasons."),
  networkSecurityPracticeQuestion("Threats and Attacks", "Which type of hacker is motivated to protest against political and social issues?", ["hacktivist", "cybercriminal", "script kiddie", "vulnerability broker"], 0, "Hackers are categorized by motivating factors. Hacktivists are motivated by protesting political and social issues."),
  networkSecurityPracticeQuestion("Threats and Attacks", "What is a ping sweep?", ["a query and response protocol that identifies information about a domain, including the addresses that are assigned to that domain.", "a scanning technique that examines a range of TCP or UDP port numbers on a host to detect listening services.", "a software application that enables the capture of all network packets that are sent across a LAN.", "a network scanning technique that indicates the live hosts in a range of IP addresses."], 3, "A ping sweep is a tool that is used during a reconnaissance attack. Other tools that might be used during this type of attack include a ping sweep, port scan, or Internet information query. A reconnaissance attack is used to gather information about a particular network, usually in preparation for another type of network attack."),
  networkSecurityPracticeQuestion("Threats and Attacks", "In what type of attack is a cybercriminal attempting to prevent legitimate users from accessing network services?", ["address spoofing", "MITM", "session hijacking", "DoS"], 3, "In a DoS or denial-of-service attack, the goal of the attacker is to prevent legitimate users from accessing network services."),
  networkSecurityPracticeQuestion("Secure Communications and Cryptography", "Which requirement of secure communications is ensured by the implementation of MD5 or SHA hash generating algorithms?", ["nonrepudiation", "authentication", "integrity", "confidentiality"], 2, "Integrity is ensured by implementing either MD5 or SHA hash generating algorithms. Many modern networks ensure authentication with protocols, such as HMAC. Data confidentiality is ensured through symmetric encryption algorithms, including DES, 3DES, and AES. Data confidentiality can also be ensured using asymmetric algorithms, including RSA and PKI."),
  networkSecurityPracticeQuestion("Secure Communications and Cryptography", "If an asymmetric algorithm uses a public key to encrypt data, what is used to decrypt it?", ["a digital certificate", "a different public key", "a private key", "DH"], 2, "When an asymmetric algorithm is used, public and private keys are used for the encryption. Either key can be used for encryption, but the complementary matched key must be used for the decryption. For example if the public key is used for encryption, then the private key must be used for the decryption."),
  networkSecurityMultiSelectQuestion("ACL Fundamentals and Wildcard Masks", "Refer to the exhibit. Which two ACLs would permit only the two LAN networks attached to R1 to access the network that connects to R2 G0/1 interface\" (Choose two.)", ["access-list 1 permit 192.168.10.0 0.0.0.127", "access-list 2 permit host 192.168.10.9 access-list 2 permit host 192.168.10.69", "access-list 5 permit 192.168.10.0 0.0.0.63 access-list 5 permit 192.168.10.64 0.0.0.63", "access-list 3 permit 192.168.10.128 0.0.0.63", "access-list 4 permit 192.168.10.0 0.0.0.255"], [0, 2], "The permit 192.168.10.0 0.0.0.127 command ignores bit positions 1 through 7, which means that addresses 192.168.10.0 through 192.168.10.127 are allowed through. The two ACEs of permit 192.168.10.0 0.0.0.63 and permit 192.168.10.64 0.0.0.63 allow the same address range through the router."),
  networkSecurityMultiSelectQuestion("ACL Fundamentals and Wildcard Masks", "Which two packet filters could a network administrator use on an IPv4 extended ACL\" (Choose two.)", ["destination UDP port number", "computer type", "destination MAC address", "ICMP message type", "source TCP port number"], [0, 4], "Extended access lists commonly filter on source and destination IPv4 addresses and TCP or UDP port numbers. Additional filtering can be provided for protocol types."),
  networkSecurityPracticeQuestion("ACL Fundamentals and Wildcard Masks", "What type of ACL offers greater flexibility and control over network access?", ["numbered standard", "named standard", "extended", "flexible"], 2, "The two types of ACLs are standard and extended. Both types can be named or numbered, but extended ACLs offer greater flexibility."),
  networkSecurityPracticeQuestion("ACL Fundamentals and Wildcard Masks", "What is the quickest way to remove a single ACE from a named ACL?", ["Use the no keyword and the sequence number of the ACE to be removed.", "Copy the ACL into a text editor, remove the ACE, then copy the ACL back into the router.", "Create a new ACL with a different number and apply the new ACL to the router interface.", "Use the no access-list command to remove the entire ACL, then recreate it without the ACE."], 0, "Named ACL ACEs can be removed using the no command followed by the sequence number."),
  networkSecurityPracticeQuestion("ACL Fundamentals and Wildcard Masks", "Refer to the exhibit. A network administrator is configuring a standard IPv4 ACL. What is the effect after the command no access-list 10 is entered?", ["ACL 10 is removed from both the running configuration and the interface Fa0/1.", "ACL 10 is removed from the running configuration.", "ACL 10 is disabled on Fa0/1.", "ACL 10 will be disabled and removed after R1 restarts."], 1, "The R1(config)# no access-list <access-list number> command removes the ACL from the running-config immediately. However, to disable an ACL on an interface, the command R1(config-if)# no ip access-group should be entered."),
  networkSecurityPracticeQuestion("ACL Fundamentals and Wildcard Masks", "Refer to the exhibit. A network administrator has configured ACL 9 as shown. Users on the 172.31.1.0 /24 network cannot forward traffic through router CiscoVille. What is the most likely cause of the traffic failure?", ["The established keyword is not specified.", "The sequence of the ACEs is incorrect.", "The port number for the traffic has not been identified with the eq keyword.", "The permit statement specifies an incorrect wildcard mask."], 1, "When verifying an ACL, the statements are always listed in a sequential order. Even though there is an explicit permit for the traffic that is sourced from network 172.31.1.0 /24, it is being denied due to the previously implemented ACE of CiscoVille(config)# access-list 9 deny 172.31.0.0 0.0.255.255 . The sequence of the ACEs must be modified to permit the specific traffic that is sourced from network 172.31.1.0 /24 and then to deny 172.31.0.0 /16."),
  networkSecurityMultiSelectQuestion("ACL Fundamentals and Wildcard Masks", "A network administrator needs to configure a standard ACL so that only the workstation of the administrator with the IP address 192.168.15.23 can access the virtual terminal of the main router. Which two configuration commands can achieve the task\" (Choose two.)", ["Router1(config)# access-list 10 permit 192.168.15.23 0.0.0.0", "Router1(config)# access-list 10 permit 192.168.15.23 0.0.0.255", "Router1(config)# access-list 10 permit 192.168.15.23 255.255.255.255", "Router1(config)# access-list 10 permit host 192.168.15.23", "Router1(config)# access-list 10 permit 192.168.15.23 255.255.255.0"], [0, 3], "To permit or deny one specific IP address, either the wildcard mask 0.0.0.0 (used after the IP address) or the wildcard mask keyword host (used before the IP address) can be used."),
  networkSecurityPracticeQuestion("ACL Fundamentals and Wildcard Masks", "Refer to the exhibit. Which command would be used in a standard ACL to allow only devices on the network attached to R2 G0/0 interface to access the networks attached to R1?", ["access-list 1 permit 192.168.10.128 0.0.0.63", "access-list 1 permit 192.168.10.0 0.0.0.255", "access-list 1 permit 192.168.10.96 0.0.0.31", "access-list 1 permit 192.168.10.0 0.0.0.63"], 2, "Standard access lists only filter on the source IP address. In the design, the packets would be coming from the 192.168.10.96/27 network (the R2 G0/0 network). The correct ACL is access-list 1 permit 192.168.10.96 0.0.0.31 ."),
  networkSecurityMultiSelectQuestion("ACL Fundamentals and Wildcard Masks", "A network administrator is writing a standard ACL that will deny any traffic from the 172.16.0.0/16 network, but permit all other traffic. Which two commands should be used\" (Choose two.)", ["Router(config)# access-list 95 deny 172.16.0.0 255.255.0.0", "Router(config)# access-list 95 permit any", "Router(config)# access-list 95 host 172.16.0.0", "Router(config)# access-list 95 deny 172.16.0.0 0.0.255.255", "Router(config)# access-list 95 172.16.0.0 255.255.255.255", "Router(config)# access-list 95 deny any"], [1, 3], "To deny traffic from the 172.16.0.0/16 network, the access-list 95 deny 172.16.0.0 0.0.255.255 command is used. To permit all other traffic, the access-list 95 permit any statement is added."),
  networkSecurityPracticeQuestion("ACL Design and Placement", "Refer to the exhibit. An ACL was configured on R1 with the intention of denying traffic from subnet 172.16.4.0/24 into subnet 172.16.3.0/24. All other traffic into subnet 172.16.3.0/24 should be permitted. This standard ACL was then applied outbound on interface Fa0/0. Which conclusion can be drawn from this configuration?", ["The ACL should be applied outbound on all interfaces of R1.", "The ACL should be applied to the FastEthernet 0/0 interface of R1 inbound to accomplish the requirements.", "All traffic will be blocked, not just traffic from the 172.16.4.0/24 subnet.", "Only traffic from the 172.16.4.0/24 subnet is blocked, and all other traffic is allowed.", "An extended ACL must be used in this situation."], 2, "Because of the implicit deny at the end of all ACLs, the access-list 1 permit any command must be included to ensure that only traffic from the 172.16.4.0/24 subnet is blocked and that all other traffic is allowed."),
  networkSecurityPracticeQuestion("ACL Fundamentals and Wildcard Masks", "Refer to the exhibit. A network administrator needs to add an ACE to the TRAFFIC-CONTROL ACL that will deny IP traffic from the subnet 172.23.16.0/20. Which ACE will meet this requirement?", ["30 deny 172.23.16.0 0.0.15.255", "15 deny 172.23.16.0 0.0.15.255", "5 deny 172.23.16.0 0.0.15.255", "5 deny 172.23.16.0 0.0.255.255"], 1, "The only filtering criteria specified for a standard access list is the source IPv4 address. The wild card mask is written to identify what parts of the address to match, with a 0 bit, and what parts of the address should be ignored, which a 1 bit. The router will parse the ACE entries from lowest sequence number to highest. If an ACE must be added to an existing access list, the sequence number should be specified so that the ACE is in the correct place during the ACL evaluation process."),
  networkSecurityPracticeQuestion("ACL Design and Placement", "Refer to the exhibit. A network administrator configures an ACL on the router. Which statement describes the result of the configuration?", ["An SSH connection is allowed from a workstation with IP 172.16.45.16 to a device with IP 192.168.25.18.", "An SSH connection is allowed from a workstation with IP 192.168.25.18 to a device with IP 172.16.45.16.", "A Telnet connection is allowed from a workstation with IP 192.168.25.18 to a device with IP 172.16.45.16.", "A Telnet connection is allowed from a workstation with IP 172.16.45.16 to a device with IP 192.168.25.18."], 0, "In an extended ACL, the first address is the source IP address and the second one is the destination IP address. TCP port number 22 is a well-known port number reserved for SSH connections. Telnet connections use TCP port number 23."),
  networkSecurityPracticeQuestion("ACL Fundamentals and Wildcard Masks", "Refer to the exhibit. What can be determined from this output?", ["The ACL is missing the deny ip any any ACE.", "The ACL is only monitoring traffic destined for 10.23.77.101 from three specific hosts.", "Because there are no matches for line 10, the ACL is not working.", "The router has not had any Telnet packets from 10.35.80.22 that are destined for 10.23.77.101."], 3, "ACL entry 10 in MyACL matches any Telnet packets between host 10.35.80.22 and 10.23.77.101. No matches have occurred on this ACE as evidenced by the lack of a \"(xxx matches)\" ACE. The deny ip any any ACE is not required because there is an implicit deny ACE added to every access control list. When no matches exist for an ACL, it only means that no traffic has matched the conditions that exist for that particular line. The ACL is monitoring traffic that matches three specific hosts going to very specific destination devices. All other traffic is not permitted by the implicit deny ip any any ACE."),
  networkSecurityMultiSelectQuestion("ACL Design and Placement", "Refer to the exhibit. A network administrator wants to permit only host 192.168.1.1 /24 to be able to access the server 192.168.2.1 /24. Which three commands will achieve this using best ACL placement practices\" (Choose three.)", ["R2(config)# interface fastethernet 0/1", "R2(config-if)# ip access-group 101 out", "R2(config)# access-list 101 permit ip 192.168.1.0 255.255.255.0 192.168.2.0 255.255.255.0", "R2(config-if)# ip access-group 101 in", "R2(config)# access-list 101 permit ip any any", "R2(config)# interface fastethernet 0/0", "R2(config)# access-list 101 permit ip host 192.168.1.1 host 192.168.2.1"], [3, 5, 6], "An extended ACL is placed as close to the source of the traffic as possible. In this case.it is placed in an inbound direction on interface fa0/0 on R2 for traffic entering the router from host with the IP address192.168.1.1 bound for the server with the IP address192.168.2.1."),
  networkSecurityMultiSelectQuestion("ACL Design and Placement", "Consider the following access list. access-list 100 permit ip host 192.168.10.1 any access-list 100 deny icmp 192.168.10.0 0.0.0.255 any echo access-list 100 permit ip any any Which two actions are taken if the access list is placed inbound on a router Gigabit Ethernet port that has the IP address 192.168.10.254 assigned\" (Choose two.)", ["Only Layer 3 connections are allowed to be made from the router to any other network device.", "Devices on the 192.168.10.0/24 network are not allowed to reply to any ping requests.", "Devices on the 192.168.10.0/24 network can successfully ping devices on the 192.168.11.0 network.", "A Telnet or SSH session is allowed from any device on the 192.168.10.0 into the router with this access list assigned.", "Devices on the 192.168.10.0/24 network are allowed to reply to any ping requests.", "Only the network device assigned the IP address 192.168.10.1 is allowed to access the router."], [3, 4], "The first ACE allows the 192.168.10.1 device to do any TCP/IP-based transactions with any other destination. The second ACE stops devices on the 192.168.10.0/24 network from issuing any pings to any other location. Everything else is permitted by the third ACE. Therefore, a Telnet/SSH session or ping reply is allowed from a device on the 192.168.10.0/24 network."),
  networkSecurityPracticeQuestion("ACL Fundamentals and Wildcard Masks", "Refer to the exhibit. The named ACL \"Managers\" already exists on the router. What will happen when the network administrator issues the commands that are shown in the exhibit?", ["The commands are added at the end of the existing Managers ACL.", "The commands overwrite the existing Managers ACL.", "The commands are added at the beginning of the existing Managers ACL.", "The network administrator receives an error that states that the ACL already exists."], 0),
  networkSecurityPracticeQuestion("Threats and Attacks", "In which TCP attack is the cybercriminal attempting to overwhelm a target host with half-open TCP connections?", ["port scan attack", "SYN flood attack", "session hijacking attack", "reset attack"], 1, "In a TCP SYN flood attack, the attacker sends to the target host a continuous flood of TCP SYN session requests with a spoofed source IP address. The target host responds with a TCP-SYN-ACK to each of the SYN session requests and waits for a TCP ACK that will never arrive. Eventually the target is overwhelmed with half-open TCP connections."),
  networkSecurityPracticeQuestion("Threats and Attacks", "Which protocol is attacked when a cybercriminal provides an invalid gateway in order to create a man-in-the-middle attack?", ["DHCP", "DNS", "ICMP", "HTTP or HTTPS"], 0, "A cybercriminal could set up a rogue DHCP server that provides one or more of the following: \u25a0 Wrong default gateway that is used to create a man-in-the-middle attack and allow the attacker to intercept data \u25a0 Wrong DNS server that results in the user being sent to a malicious website \u25a0 Invalid default gateway IP address that results in a denial of service attack on the DHCP client"),
  networkSecurityPracticeQuestion("ACL Fundamentals and Wildcard Masks", "Refer to the exhibit. An administrator has configured a standard ACL on R1 and applied it to interface serial 0/0/0 in the outbound direction. What happens to traffic leaving interface serial 0/0/0 that does not match the configured ACL statements?", ["The traffic is dropped.", "The source IP address is checked and, if a match is not found, traffic is routed out interface serial 0/0/1.", "The resulting action is determined by the destination IP address.", "The resulting action is determined by the destination IP address and port number."], 0, "Any traffic that does not match one of the statements in an ACL has the implicit deny applied to it, which means the traffic is dropped."),
  networkSecurityMultiSelectQuestion("ACL Design and Placement", "Refer to the exhibit. The Gigabit interfaces on both routers have been configured with subinterface numbers that match the VLAN numbers connected to them. PCs on VLAN 10 should be able to print to the P1 printer on VLAN 12. PCs on VLAN 20 should print to the printers on VLAN 22. What interface and in what direction should you place a standard ACL that allows printing to P1 from data VLAN 10, but stops the PCs on VLAN 20 from using the P1 printer\" (Choose two.)", ["inbound", "R2 S0/0/1", "R1 Gi0/1.12", "outbound", "R1 S0/0/0", "R2 Gi0/1.20"], [2, 3], "A standard access list is commonly placed as close to the destination network as possible because access control expressions in a standard ACL do not include information about the destination network. The destination in this example is printer VLAN 12 which has router R1 Gigabit subinterface 0/1/.12 as its gateway. A sample standard ACL that only allows printing from data VLAN 10 (192.168.10.0/24), for example, and no other VLAN would be as follows: R1(config)# access-list 1 permit 192.168.10.0 0.0.0.255 R1(config)# access-list 1 deny any R1(config)# interface gigabitethernet 0/1.12 R1(config-if)# ip access-group 1 out"),
  networkSecurityPracticeQuestion("ACL Fundamentals and Wildcard Masks", "Which statement describes a characteristic of standard IPv4 ACLs?", ["They are configured in the interface configuration mode.", "They can be configured to filter traffic based on both source IP addresses and source ports.", "They can be created with a number but not with a name.", "They filter traffic based on source IP addresses only."], 3, "A standard IPv4 ACL can filter traffic based on source IP addresses only. Unlike an extended ACL, it cannot filter traffic based on Layer 4 ports. However, both standard and extended ACLs can be identified with either a number or a name, and both are configured in global configuration mode."),
  networkSecurityPracticeQuestion("Router Management Controls", "What is considered a best practice when configuring ACLs on vty lines?", ["Place identical restrictions on all vty lines.", "Remove the vty password since the ACL restricts access to trusted users.", "Apply the ip access-group command inbound.", "Use only extended access lists."], 0),
  networkSecurityMultiSelectQuestion("ACL Fundamentals and Wildcard Masks", "Refer to the exhibit. An administrator first configured an extended ACL as shown by the output of the show access-lists command. The administrator then edited this access-list by issuing the commands below. Router(config)# ip access-list extended 101 Router(config-ext-nacl)# no 20 Router(config-ext-nacl)# 5 permit tcp any any eq 22 Router(config-ext-nacl)# 20 deny udp any any Which two conclusions can be drawn from this new configuration\" (Choose two.)", ["TFTP packets will be permitted.", "Ping packets will be permitted.", "Telnet packets will be permitted.", "SSH packets will be permitted.", "All TCP and UDP packets will be denied."], [1, 3], "After the editing, the final configuration is as follows: Router# show access-lists Extended IP access list 101 5 permit tcp any any eq ssh 10 deny tcp any any 20 deny udp any any 30 permit icmp any any So, only SSH packets and ICMP packets will be permitted."),
  networkSecurityPracticeQuestion("ACL Design and Placement", "Which set of access control entries would allow all users on the 192.168.10.0/24 network to access a web server that is located at 172.17.80.1, but would not allow them to use Telnet?", ["access-list 103 deny tcp host 192.168.10.0 any eq 23 access-list 103 permit tcp host 192.168.10.1 eq 80", "access-list 103 permit tcp 192.168.10.0 0.0.0.255 any eq 80 access-list 103 deny tcp 192.168.10.0 0.0.0.255 any eq 23", "access-list 103 permit 192.168.10.0 0.0.0.255 host 172.17.80.1 access-list 103 deny tcp 192.168.10.0 0.0.0.255 any eq telnet", "access-list 103 permit tcp 192.168.10.0 0.0.0.255 host 172.17.80.1 eq 80 access-list 103 deny tcp 192.168.10.0 0.0.0.255 any eq 23"], 3, "For an extended ACL to meet these requirements the following need to be included in the access control entries: \u25a0 identification number in the range 100-199 or 2000-2699 \u25a0 permit or deny parameter \u25a0 protocol \u25a0 source address and wildcard \u25a0 destination address and wildcard \u25a0 port number or name"),
  networkSecurityPracticeQuestion("Threats and Attacks", "What is the term used to describe a mechanism that takes advantage of a vulnerability?", ["mitigation", "exploit", "vulnerability", "threat"], 1),
  networkSecurityPracticeQuestion("ACL Design and Placement", "Refer to the exhibit. The network administrator has an IP address of 192.168.11.10 and needs access to manage R1. What is the best ACL type and placement to use in this situation?", ["extended ACL outbound on R2 WAN interface towards the internet", "standard ACL inbound on R1 vty lines", "extended ACLs inbound on R1 G0/0 and G0/1", "extended ACL outbound on R2 S0/0/1"], 1, "Standard ACLs permit or deny packets based only on the source IPv4 address. Because all traffic types are permitted or denied, standard ACLs should be located as close to the destination as possible. Extended ACLs permit or deny packets based on the source IPv4 address and destination IPv4 address, protocol type, source and destination TCP or UDP ports and more. Because the filtering of extended ACLs is so specific, extended ACLs should be located as close as possible to the source of the traffic to be filtered. Undesirable traffic is denied close to the source network without crossing the network infrastructure."),
  networkSecurityPracticeQuestion("Router Management Controls", "A technician is tasked with using ACLs to secure a router. When would the technician use the any configuration option or command?", ["to add a text entry for documentation purposes", "to generate and send an informational message whenever the ACE is matched", "to identify any IP address", "to identify one specific IP address"], 2),
  networkSecurityPracticeQuestion("Threats and Attacks", "Which statement accurately characterizes the evolution of threats to network security?", ["Internet architects planned for network security from the beginning.", "Early Internet users often engaged in activities that would harm other users.", "Internal threats can cause even greater damage than external threats.", "Threats have become less sophisticated while the technical knowledge needed by an attacker has grown."], 2, "Internal threats can be intentional or accidental and cause greater damage than external threats because the internal user has direct access to the internal corporate network and corporate data."),
  networkSecurityPracticeQuestion("Threats and Attacks", "A user receives a phone call from a person who claims to represent IT services and then asks that user for confirmation of username and password for auditing purposes. Which security threat does this phone call represent?", ["spam", "social engineering", "DDoS", "anonymous keylogging"], 1, "Social engineering attempts to gain the confidence of an employee and convince that person to divulge confidential and sensitive information, such as usernames and passwords. DDoS attacks, spam, and keylogging are all examples of software based security threats, not social engineering."),
  networkSecurityPracticeQuestion("Threats and Attacks", "In what way are zombies used in security attacks?", ["They target specific individuals to gain corporate or personal information.", "They probe a group of machines for open ports to learn which services are running.", "They are maliciously formed code segments used to replace legitimate applications.", "They are infected machines that carry out a DDoS attack."], 3, "Zombies are infected computers that make up a botnet. The zombies are used to deploy a distributed denial of service (DDoS) attack."),
  networkSecurityPracticeQuestion("Threats and Attacks", "Which attack involves threat actors positioning themselves between a source and destination with the intent of transparently monitoring, capturing, and controlling the communication?", ["man-in-the-middle attack", "SYN flood attack", "DoS attack", "ICMP attack"], 0, "The man-in-the-middle attack is a common IP-related attack where threat actors position themselves between a source and destination to transparently monitor, capture, and control the communication."),
  networkSecurityMultiSelectQuestion("ACL Fundamentals and Wildcard Masks", "Which two keywords can be used in an access control list to replace a wildcard mask or address and wildcard mask pair\" (Choose two.)", ["host", "most", "gt", "some", "any", "all"], [0, 4], "The host keyword is used when using a specific device IP address in an ACL. For example, the deny host 192.168.5.5 command is the same is the deny 192.168.5.5 0.0.0.0 command. The any keyword is used to allow any mask through that meets the criteria. For example, the permit any command is the same as permit 0.0.0.0 255.255.255.255 command."),
  networkSecurityPracticeQuestion("ACL Fundamentals and Wildcard Masks", "Which statement describes a difference between the operation of inbound and outbound ACLs?", ["Inbound ACLs are processed before the packets are routed while outbound ACLs are processed after the routing is completed.", "In contrast to outbound ALCs, inbound ACLs can be used to filter packets with multiple criteria.", "On a network interface, more than one inbound ACL can be configured but only one outbound ACL can be configured.", "Inbound ACLs can be used in both routers and switches but outbound ACLs can be used only on routers."], 0, "With an inbound ACL, incoming packets are processed before they are routed. With an outbound ACL, packets are first routed to the outbound interface, then they are processed. Thus processing inbound is more efficient from the router perspective. The structure, filtering methods, and limitations (on an interface, only one inbound and one outbound ACL can be configured) are the same for both types of ACLs."),
  networkSecurityPracticeQuestion("ACL Fundamentals and Wildcard Masks", "What effect would the Router1(config-ext-nacl)# permit tcp 172.16.4.0 0.0.0.255 any eq www command have when implemented inbound on the f0/0 interface?", ["All TCP traffic is permitted, and all other traffic is denied.", "Traffic originating from 172.16.4.0/24 is permitted to all TCP port 80 destinations.", "All traffic from 172.16.4.0/24 is permitted anywhere on any port.", "The command is rejected by the router because it is incomplete."], 1),
  networkSecurityPracticeQuestion("ACL Fundamentals and Wildcard Masks", "Which ACE will permit a packet that originates from any network and is destined for a web server at 192.168.1.1?", ["access-list 101 permit tcp any host 192.168.1.1 eq 80", "access-list 101 permit tcp host 192.168.1.1 eq 80 any", "access-list 101 permit tcp host 192.168.1.1 any eq 80", "access-list 101 permit tcp any eq 80 host 192.168.1.1"], 0),
  networkSecurityPracticeQuestion("ACL Fundamentals and Wildcard Masks", "Refer to the exhibit. A new network policy requires an ACL denying FTP and Telnet access to a Corp file server from all interns. The address of the file server is 172.16.1.15 and all interns are assigned addresses in the 172.18.200.0/24 network. After implementing the ACL, no one in the Corp network can access any of the servers. What is the problem?", ["Inbound ACLs must be routed before they are processed.", "The ACL is implicitly denying access to all the servers.", "Named ACLs require the use of port numbers.", "The ACL is applied to the interface using the wrong direction."], 1, "Both named and numbered ACLs have an implicit deny ACE at the end of the list. This implicit deny blocks all traffic."),
  networkSecurityPracticeQuestion("Router Management Controls", "A technician is tasked with using ACLs to secure a router. When would the technician use the access-class 20 in configuration option or command?", ["to secure administrative access to the router", "to remove an ACL from an interface", "to remove a configured ACL", "to apply a standard ACL to an interface"], 0),
  networkSecurityPracticeQuestion("Secure Communications and Cryptography", "What is the term used to describe the same pre-shared key or secret key, known by both the sender and receiver to encrypt and decrypt data?", ["symmetric encryption algorithm", "data integrity", "exploit", "risk"], 0),
  networkSecurityPracticeQuestion("ACL Design and Placement", "Refer to the exhibit. Internet privileges for an employee have been revoked because of abuse but the employee still needs access to company resources. What is the best ACL type and placement to use in this situation?", ["standard ACL inbound on R2 WAN interface connecting to the internet", "standard ACL outbound on R2 WAN interface towards the internet", "standard ACL inbound on R1 G0/0", "standard ACL outbound on R1 G0/0"], 1, "- Standard ACLs permit or deny packets based only on the source IPv4 address. Because all traffic types are permitted or denied, standard ACLs should be located as close to the destination as possible. - Extended ACLs permit or deny packets based on the source IPv4 address and destination IPv4 address, protocol type, source and destination TCP or UDP ports and more. Because the filtering of extended ACLs is so specific, extended ACLs should be located as close as possible to the source of the traffic to be filtered. Undesirable traffic is denied close to the source network without crossing the network infrastructure."),
  networkSecurityPracticeQuestion("ACL Design and Placement", "Refer to the exhibit. The student on the H1 computer continues to launch an extended ping with expanded packets at the student on the H2 computer. The school network administrator wants to stop this behavior, but still allow both students access to web-based computer assignments. What would be the best plan for the network administrator?", ["Apply an inbound standard ACL on R1 Gi0/0.", "Apply an inbound extended ACL on R2 Gi0/1.", "Apply an outbound extended ACL on R1 S0/0/1.", "Apply an inbound extended ACL on R1 Gi0/0.", "Apply an outbound standard ACL on R2 S0/0/1."], 3, "This access list must be an extended ACL in order to filter on specific source and destination host addresses. Commonly, the best place for an extended ACL is closest to the source, which is H1. Traffic from H1 travels into the switch, then out of the switch into the R1 Gi0/0 interface. This Gi0/0 interface would be the best location for this type of extended ACL. The ACL would be applied on the inbound interface since the packets from H1 would be coming into the R1 router.")
];

const cyberSecurityFullPracticeExamQuestionBank = [
  cybersecurityMultiSelectQuestion("Vulnerability Assessment and Risk Management", "What are three strategies to limit the chances for attackers to exploit potential vulnerabilities?", [
    "Employ content filtering for web",
    "Elevate all accounts to admin accounts",
    "Apply PoLP",
    "Employ layered defense",
    "Restrict access to system services"
  ], [2, 3, 4]),
  cybersecurityPracticeQuestion("Securing the Network", "Which command displays both the configured DNS server info and the IP address resolution for the URL?", ["nmap", "ping", "nslookup", "traceroute"], 2),
  cybersecurityMatchingQuestion("Security Principles", "Match the following security terminology with the appropriate definition.", [
    { prompt: "Asset", correct: "People, property, or data" },
    { prompt: "Risk", correct: "The potential for loss, damage, or destruction" },
    { prompt: "Threat", correct: "An action that causes a negative impact" },
    { prompt: "Vulnerability", correct: "A weakness that potentially exposes organizations to cyber attacks" }
  ]),
  cybersecurityMatchingQuestion("Security Principles", "Match each regulation or standard to what it protects.", [
    { prompt: "GDPR", correct: "Protects the personal information of members of the European Union" },
    { prompt: "HIPAA", correct: "Protects the healthcare information of individuals" },
    { prompt: "PCI-DSS", correct: "Protects the credit card information of individuals" },
    { prompt: "FISMA", correct: "Protects information about individuals that is stored by federal agencies" },
    { prompt: "FERPA", correct: "Protects the educational records of individuals" }
  ]),
  cybersecurityPracticeQuestion("Securing the Network", "When numerous employees report difficulties accessing the company intranet due to login issues, and you observe misspellings on the site when using the URL, but the site functions normally when accessed via the IP address, what steps should you take?", [
    "Verify the accuracy of the entry for the site in the local DNS server",
    "Update the web server software to the latest version",
    "Restore a backup copy of the authentication database",
    "Take the company web portal offline immediately"
  ]),
  cybersecurityPracticeQuestion("Securing Endpoint Devices", "A security analyst uncovers that a hacker successfully obtained root access to an enterprise Linux server. The intruder entered the server as a guest, employed a program to bypass the root password, and subsequently terminated critical server processes in the capacity of the root user. Which type of endpoint attack is this?", ["DDOS", "Privilege escalation", "Brute force", "Buffer overflow"], 1),
  cybersecurityMultiSelectQuestion("Security Principles", "Which three authentication factors are valid for use in a multifactor authentication scenario?", [
    "Something you know",
    "Something you earn",
    "Something you are",
    "Something you have",
    "Something you see",
    "Something you do"
  ], [0, 2, 3]),
  cybersecurityPracticeQuestion("Securing the Network", "To prevent the specific unknown host from attaching to your home network again after experiencing a significant slowdown, what actions should you take?", [
    "Change the network SSID",
    "Create an IP access control list.",
    "Block the host IP address",
    "Implement MAC address filtering"
  ], 3),
  cybersecurityPracticeQuestion("Securing the Network", "Which wireless encryption technology requires AES to secure home wireless networks?", ["WEP", "WPA", "WPA2", "TKIP"], 2),
  cybersecurityPracticeQuestion("Securing the Network", "You need to filter the websites that are unavailable to employees on the company network. Which type of device should you deploy?", ["IPS", "IDS", "Proxy Server", "Honeypot"], 2),
  cybersecurityPracticeQuestion("Security Principles", "A company engages a team of seasoned cybercriminals with the objective of establishing a persistent and thorough presence on a competitor's network. This presence aims to facilitate the theft or sabotage of sensitive data from the competitor. Which type of attack does this scenario describe?", ["DDoS", "Man-in-the-middle", "APT", "Ransomware"], 2),
  cybersecurityMatchingQuestion("Incident Management", "Your computer gets a worm. Match each mitigation step to the correct description.", [
    { prompt: "Inoculation", correct: "Patching uninfected systems to limit the worm's access to additional targets" },
    { prompt: "Quarantine", correct: "Removing or blocking infected systems from the network" },
    { prompt: "Treatment", correct: "Cleansing and patching infected systems" },
    { prompt: "Containment", correct: "Compartmentalizing and segmenting the network to restrict the worm's spread to already infected areas" }
  ]),
  cybersecurityMultiSelectQuestion("Securing the Network", "Which two private IP addresses would be blocked to prevent security and performance issues?", [
    "203.115.48.1",
    "10.157.115.42",
    "172.18.100.56",
    "224.55.4.153"
  ], [1, 2]),
  cybersecurityMultiSelectQuestion("Security Principles", "You are employed by a community healthcare organization utilizing an electronic health record (EHR) system. Having implemented the necessary physical and technical safeguards mandated by HIPAA, you now need to demonstrate the EHR system's compliance with these measures. What are the two methods you should employ to verify the system's compliance?", [
    "Security awareness training",
    "IT auditing",
    "Automatic log-off implementation",
    "Penetration testing"
  ], [1, 2]),
  cybersecurityPracticeQuestion("Security Principles", "Which data type is protected through hard disk encryption?", ["Data in transit", "Data in use", "Data at rest", "Data in process"], 2),
  cybersecurityPracticeQuestion("Vulnerability Assessment and Risk Management", "Which activity is an example of active reconnaissance performed during a penetration test?", [
    "Gathering employee information from available web directories and social media",
    "Searching the WHOIS database for the owner and technical contact information for a domain",
    "Performing an Nmap port scan on the LAN to determine types of connected devices and open ports",
    "Using a browser to view the HTTP source code of company webpages"
  ], 2),
  cybersecurityPracticeQuestion("Securing Endpoint Devices", "After an administrator installs an operating system update on a laptop, the laptop user can no longer print to their wireless printer. What should solve the issue?", [
    "Update the firmware on the laptop",
    "Reinstall the same service pack",
    "Install a new device driver for the wireless printer",
    "Check for patches for wireless printers"
  ], 2),
  cybersecurityPracticeQuestion("Securing the Network", "You need to allow employees to access your company's secure network from their homes. Which type of security should you implement?", ["BYOD", "VPN", "IDS", "SNMP"], 1),
  cybersecurityPracticeQuestion("Securing Endpoint Devices", "How does the network security team monitor the OS version, security updates, and patches on user devices?", [
    "Asset Management",
    "Incident Management",
    "Security Policy and procedures",
    "Business Continuity Plan"
  ]),
  cybersecurityMatchingQuestion("Vulnerability Assessment and Risk Management", "Match each cyber tool from the list on the left to the correct vulnerability management process.", [
    { prompt: "Discover", correct: "NMAP" },
    { prompt: "Prioritize", correct: "CVSS" },
    { prompt: "Remediate", correct: "Patch Management Software" }
  ]),
  cybersecurityPracticeQuestion("Securing Endpoint Devices", "What is the purpose of a hypervisor?", [
    "It creates and runs virtual machines.",
    "It monitors and logs network traffic for malicious packets",
    "It provides and monitors firewall services for cloud computing.",
    "It provides and services a gateway between users and the Internet"
  ]),
  cybersecurityPracticeQuestion("Security Principles", "What does hashing provide for data communication?", ["Origin authentication", "Data non-repudiation", "Data encryption", "Data integrity"], 3),
  cybersecurityPracticeQuestion("Security Principles", "In order to do online banking, you enter a strong password and then enter the 5-digit code sent to you on your smartphone. Which type of authentication does this situation describe?", ["Multifactor", "RADIUS", "VPN", "AAA"]),
  cybersecurityDropdownQuestion("Security Principles", "True or False: choose the correct value for each ethical security analyst statement.", [
    { label: "A security analyst may use a disgruntled employee's network credentials to monitor behavior", options: ["T", "F"], correct: "F" },
    { label: "A security analyst may access employee data on a company server if authorized", options: ["T", "F"], correct: "T" },
    { label: "A security analyst may share sensitive data with unauthorized users", options: ["T", "F"], correct: "F" }
  ]),
  cybersecurityMatchingQuestion("Security Principles", "Match the appropriate control measures.", [
    { prompt: "Restore a system after an event", correct: "Corrective measures" },
    { prompt: "Discover unwanted events", correct: "Detective measures" },
    { prompt: "Avert the occurrence of an event", correct: "Preventive measures" }
  ], ["Corrective measures", "Detective measures", "Preventive measures", "Adaptive measures"]),
  cybersecurityPracticeQuestion("Securing the Network", "Your network is encountering slower-than-usual response times from a system. To assess the system's status, you execute the netstat -l command to reveal all TCP ports currently in the listening state. What does the listening state indicate about these ports?", [
    "The remote end disconnected and the ports are closing.",
    "The ports are actively connected to another system or process",
    "The state of the connection on the ports is unknown",
    "The ports are open on the system and are waiting for connections"
  ], 3),
  cybersecurityMultiSelectQuestion("Securing Endpoint Devices", "Your task involves maintaining a malware-free network. Identify two strategies that will aid in keeping your device free from malware.", [
    "Ensure that real time protection is disabled",
    "Keep your anti-malware software definitions up to date",
    "Ensure all network ports are available so all important network traffic can get through",
    "Configure full antivirus and antimalware scans to run automatically on a regular schedule",
    "Ensure that the network windows firewall is disabled so it doesn't interfere with any anti-malware software scans"
  ], [1, 3]),
  cybersecurityPracticeQuestion("Incident Management", "In your role as a security analyst, you examine the output from the SIEM. You come across an alert indicating the detection of malicious files by the IDS. Following a thorough review of user information, device data, and posture details, you conclude that it is indeed a valid incident. What do you do next?", [
    "Log the alert and watch for second occurrence",
    "Update the documentation to include the new alert information",
    "Escalate the situation immediately",
    "Prepare notes to present at the weekly cyber team meeting."
  ], 2),
  cybersecurityPracticeQuestion("Securing Endpoint Devices", "A cybersecurity analyst is looking into an unidentified executable file found on a Linux desktop computer. The analyst enters the following command in the terminal: ls -l. What is the purpose of this command?", [
    "To open a text editor",
    "To display the content of a text file",
    "To navigate to the folder that is passed as an argument to the command",
    "To display the file permissions and ownership of the executable file"
  ], 3),
  cybersecurityPracticeQuestion("Incident Management", "Which classification of security alert is the greatest threat to an organization because it represents undetected exploits?", ["True positive", "True negative", "False positive", "False negative"], 3),
  cybersecurityPracticeQuestion("Incident Management", "Your organization's SIEM alerts you that users are connecting to an unusual URL. You need to determine whether the URL is malicious and what type of threat it represents. What should you do?", [
    "Ask users why they visited the website",
    "Submit the URL to a threat intel portal for analysis",
    "Block the URL by placing it on the network block list",
    "Visit the URL to determine whether the website is legitimate"
  ], 1),
  cybersecurityPracticeQuestion("Vulnerability Assessment and Risk Management", "You are working with the senior admin team to identify potential risks. Which phase of risk management are you in?", ["Mitigating Risks", "Choosing Risk Strategies", "Measuring residual risk", "Determining a risk profile"], 3),
  cybersecurityPracticeQuestion("Securing the Network", "What should you create to prevent spoofing of the internal network?", ["A NAT rule", "A record in the host file", "A DNS record", "An ACL"]),
  cybersecurityPracticeQuestion("Securing Endpoint Devices", "As a security technician who has just completed a full scan of a Windows 10 PC, where should you navigate to view the scan results?", ["Windows Application Logs", "Windows Security", "Windows System Logs", "Windows Task Manager"], 1),
  cybersecurityMultiSelectQuestion("Vulnerability Assessment and Risk Management", "Which two fundamental metrics should be considered when determining the severity of a vulnerability in an assessment?", [
    "The time involved in choosing replacement software to replace older systems",
    "The impacts that an exploit of the vulnerability will have on the organization",
    "The age of the hardware running the software that contains the vulnerability",
    "The likelihood that an adversary can and will exploit the vulnerability"
  ], [1, 3]),
  cybersecurityPracticeQuestion("Vulnerability Assessment and Risk Management", "During a risk assessment within your company, you pinpoint risks associated with the office's web server. These risks include potential hardware and software failures, along with web service disruption from cyber-attacks. To mitigate these risks, you suggest obtaining insurance and engaging another organization to oversee maintenance of the web server. Which risk strategy is this?", ["Risk transfer", "Risk avoidance", "Risk acceptance", "Risk reduction"]),
  cybersecurityMultiSelectQuestion("Securing the Network", "While examining the company's remote access procedures, you observe the use of Telnet to connect to the corporate database server for checking inventory levels. What are the two immediate actions you should take?", [
    "Implement SSH access on the server",
    "Force users to implement secure telnet passwords.",
    "Disable telnet access on the server.",
    "Reconfigure the server to only accept HTTPS connections."
  ], [0, 2]),
  cybersecurityPracticeQuestion("Security Principles", "What action taken by an adversary serves as an example of an exploit aiming to acquire user credentials?", [
    "Obtaining a directory listing of files located on the web database server",
    "Installing a backdoor in order to enable two-way communication with the device",
    "Sending an email with a link to a fictitious web portal login page",
    "Executing a remote port scan of all of the enterprise-registered IP addresses"
  ], 2),
  cybersecurityMultiSelectQuestion("Incident Management", "Multiple employees are encountering unexpected computer crashes and numerous unwanted pop-up messages. Identify two immediate actions you should take to resolve the issue without affecting data.", [
    "Configure the network firewall to block malware from entering the internal network",
    "Deploy a policy to install and automatically update antivirus and anti-malware software.",
    "Reinstall Windows on the affected workstations",
    "Scan affected workstations and remove malware."
  ], [0, 3]),
  cybersecurityMatchingQuestion("Incident Management", "Match the following log types to the description.", [
    { prompt: "Application logs", correct: "Contain events that are received from programs running on the device" },
    { prompt: "Security logs", correct: "Record the success or failure of audit policy events" },
    { prompt: "System logs", correct: "List events generated by the operation of hardware, drivers, and processes" },
    { prompt: "Setup logs", correct: "Record information about software installation and operating system updates" }
  ]),
  cybersecurityMatchingQuestion("Incident Management", "Match each NIST IR lifecycle phase from the list to the correct description.", [
    { prompt: "Containment, Eradication, and Recovery", correct: "Mitigates the impact to the incident" },
    { prompt: "Post-Incident Activity", correct: "Reports the cause and cost of the incident and the steps to prevent future incidents" },
    { prompt: "Detection and Analysis", correct: "Evaluate incident indicators to determine whether they are legitimate attacks and alerts the organization of the incidents" },
    { prompt: "Preparation", correct: "Establishes an incident response capability to ensure that organizational assets are sufficiently secure" }
  ]),
  cybersecurityPracticeQuestion("Securing the Network", "You need to transfer configuration files to a router across an unsecured network. Which protocol should you use to encrypt the files in transit?", ["HTTP", "SSH", "Telnet", "TFTP"], 1)
];

const comptiaSecurityPlusPracticeExamQuestionBank = [
  securityPlusPracticeQuestion("Malware and Persistence", "John is analyzing strange behavior on computers in his network. He believes there is malware on the machines. The symptoms include strange behavior that persists, even if he boots the machine to a Linux Live CD. What is the most likely cause?", ["Ransomware", "Boot sector virus", "Rootkit", "Key logger"], 1),
  securityPlusPracticeQuestion("Social Engineering", "Ahmed is a sales manager with a major insurance company. He has received an email that is encouraging him to click on a link and fill out a survey. He is suspicious of the email, but it does mention a major insurance association, and that makes him think it might be legitimate. Which of the following best describes this attack?", ["Phishing", "Social engineering", "Spear phishing", "Trojan horse"], 2),
  securityPlusPracticeQuestion("Malware and Persistence", "You are a security administrator for a medium-sized bank. You have discovered a piece of software on your bank\u2019s database server that is not supposed to be there. It appears that the software will begin deleting database files if a specific employee is terminated. What best describes this?", ["Worm", "Logic bomb", "Trojan horse", "Rootkit"], 1),
  securityPlusPracticeQuestion("Web Application Attacks", "You are responsible for incident response at Acme bank. The Acme bank website has been attacked. The attacker used the login screen, but rather than enter login credentials, he or she entered some odd text: ' or '1' = '1. What is the best description for this attack?", ["Cross-site scripting", "Cross-site request forgery", "SQL injection", "ARP poisoning"], 2),
  securityPlusPracticeQuestion("Network Attacks", "Juanita is a network administrator for a small accounting firm. The users on her network are complaining of slow connectivity. When she examines the firewall logs, she observes a large number of half-open connections. What best describes this attack?", ["DDoS", "SYN flood", "Buffer overflow", "ARP poisoning"], 1),
  securityPlusPracticeQuestion("Web Application Attacks", "Frank is deeply concerned about attacks to his company\u2019s e-commerce server. He is particularly worried about cross-site scripting and SQL injection. Which of the following would best defend against these two specific attacks?", ["Encrypted web traffic", "Filtering user input", "A firewall", "An IDS"], 1),
  securityPlusPracticeQuestion("Wireless and Mobile Attacks", "You are responsible for network security at Acme Company. Users have been reporting that personal data is being stolen when using the wireless network. They all insist they only connect to the corporate wireless access point (WAP). However, logs for the WAP show that these users have not connected to it. Which of the following could best explain this situation?", ["Session hijacking", "Clickjacking", "Rogue access point", "Bluejacking"], 2),
  securityPlusPracticeQuestion("Web Application Attacks", "What type of attack depends on the attacker entering JavaScript into a text area that is intended for users to enter text that will be viewed by other users?", ["SQL injection", "Clickjacking", "Cross-site scripting", "Bluejacking"], 2),
  securityPlusPracticeQuestion("Malware and Persistence", "A sales manager at your company is complaining about slow performance on his computer. When you thoroughly investigate the issue, you find spyware on his computer. He insists that the only thing he has downloaded recently was a freeware stock trading application. What would best explain this situation?", ["Logic bomb", "Trojan horse", "Rootkit", "Macro virus"], 1),
  securityPlusPracticeQuestion("Malware and Persistence", "Your company outsourced development of an accounting application to a local programming firm. After three months of using the product, one of your accountants accidentally discovers a way to log in and bypass all security and authentication. What best describes this?", ["Logic bomb", "Trojan horse", "Backdoor", "Rootkit"], 2),
  securityPlusPracticeQuestion("Malware and Persistence", "Teresa is the security manager for a mid-sized insurance company. She receives a call from law enforcement, telling her that some computers on her network participated in a massive denial-of-service (DoS) attack. Teresa is certain that none of the employees at her company would be involved in a cybercrime. What would best explain this scenario?", ["It is a result of social engineering.", "The machines all have backdoors.", "The machines are bots.", "The machines are infected with crypto-viruses."], 2),
  securityPlusPracticeQuestion("Malware and Persistence", "Mike is a network administrator with a small financial services company. He has received a popup window that states his files are now encrypted and he must pay .5 bitcoins to get them decrypted. He tries to check the files in question, but their extensions have changed, and he cannot open them. What best describes this situation?", ["Mike\u2019s machine has a rootkit.", "Mike\u2019s machine has ransomware.", "Mike\u2019s machine has a logic bomb.", "Mike\u2019s machine has been the target of whaling."], 1),
  securityPlusPracticeQuestion("Web Application Attacks", "Terrance is examining logs for the company e-commerce web server. He discovers a number of redirects that cannot be explained. After carefully examining the website, he finds some attacker performed a watering hole attack by placing JavaScript in the website and is redirecting users to a phishing website. Which of the following techniques would be best at preventing this in the future?", ["An SPI firewall", "An active IDS/IPS", "Checking buffer boundaries", "Checking user input"], 3),
  securityPlusPracticeQuestion("Web Application Attacks", "What type of attack is based on sending more data to a target variable than the data can actually hold?", ["Bluesnarfing", "Buffer overflow", "Bluejacking", "DDoS"], 1),
  securityPlusPracticeQuestion("Assessment and Testing", "You have been asked to test your company network for security issues. The specific test you are conducting involves primarily using automated and semiautomated tools to look for known vulnerabilities with the various systems on your network. Which of the following best describes this type of test?", ["Vulnerability scan", "Penetration test", "Security audit", "Security test"], 0),
  securityPlusPracticeQuestion("Configuration and Vulnerability Management", "Jared discovers that attackers have breached his WiFi network. They have gained access via the wireless access point (WAP) administrative panel, and have logged on with the credentials the WAP shipped with. What best describes this issue?", ["Default configuration", "Race conditions", "Failure to patch", "Weak encryption"], 0),
  securityPlusPracticeQuestion("Social Engineering", "Joanne is concerned about social engineering. She is particularly concerned that this technique could be used by an attacker to obtain information about the network, including possibly even passwords. What countermeasure would be most effective in combating social engineering?", ["SPI firewall", "An IPS", "User training", "Strong policies"], 2),
  securityPlusPracticeQuestion("Network Attacks", "You are responsible for incident response at a mid-sized bank. You have discovered that someone was able to successfully breach your network and steal data from your database server. All servers are configured to forward logs to a central logging server. However, when you examine that central log, there are no entries after 2:13 a.m. two days ago. You check the servers, and they are sending logs to the right server, but they are not getting there. Which of the following would be most likely to explain this?", ["Your log server has a backdoor.", "Your log server has been hit with a buffer overflow attack.", "Your switches have been hit with ARP poisoning.", "Your IDS is malfunctioning and blocking log transmissions."], 2),
  securityPlusPracticeQuestion("Web Application Attacks", "Coleen is the web security administrator for an online auction website. A small number of users are complaining that when they visit the website and log in, they are told the service is down and to try again later. Coleen checks and she can visit the site without any problem, even from computers outside the network. She also checks the web server log and there is no record of those users ever connecting. Which of the following might best explain this?", ["Typosquatting", "SQL injection", "Cross-site scripting", "Cross-site request forgery"], 0),
  securityPlusPracticeQuestion("Threat Actors and Attribution", "Mahmoud is responsible for managing security at a large university. He has just performed a threat analysis for the network, and based on past incidents and studies of similar networks, he has determined that the most prevalent threat to his network is low-skilled attackers who wish to breach the system, simply to prove they can or for some low-level crime, such as changing a grade. Which term best describes this type of attacker?", ["Hacktivist", "Amateur", "Insider", "Script kiddie"], 3),
  securityPlusPracticeQuestion("Network Attacks", "Which of the following best describes a collection of computers that have been compromised and are being controlled from one central point?", ["Zombienet", "Botnet", "Nullnet", "Attacknet"], 1),
  securityPlusPracticeQuestion("Assessment and Testing", "John is conducting a penetration test of a client\u2019s network. He is currently gathering information from sources such as archive.org, netcraft.com, social media, and information websites. What best describes this stage?", ["Active reconnaissance", "Passive reconnaissance", "Initial exploitation", "Pivot"], 1),
  securityPlusPracticeQuestion("Malware and Persistence", "One of the salespeople in your company reports that his computer is behaving sluggishly. You check but don\u2019t see any obvious malware. However, in his temp folder you find JPEGs that look like screenshots of his desktop. Which of the following is the most likely cause?", ["He is stealing data from the company.", "There is a backdoor on his computer.", "There is spyware on his computer.", "He needs to update his Windows."], 2),
  securityPlusPracticeQuestion("Network Attacks", "What type of attack is based on entering fake entries into a target networks domain name server?", ["DNS poisoning", "ARP poisoning", "Bluesnarfing", "Bluejacking"], 0),
  securityPlusPracticeQuestion("Assessment and Testing", "Frank has been asked to conduct a penetration test of a small bookkeeping firm. For the test, he has only been given the company name, the domain name for their website, and the IP address of their gateway router. What best describes this type of test?", ["White-box test", "External test", "Black-box test", "Threat test"], 2),
  securityPlusPracticeQuestion("Assessment and Testing", "You work for a security company that performs penetration testing for clients. You are conducting a test of an e-commerce company. You discover that after compromising the web server, you can use the web server to launch a second attack into the company\u2019s internal network. What best describes this?", ["Internal attack", "White-box testing", "Black-box testing", "A pivot"], 3),
  securityPlusPracticeQuestion("Security Plus Review", "While investigating a malware outbreak on your company network, you discover something very odd. There is a file that has the same name as a Windows system DLL, and even has the same API interface, but handles input very differently, in a manner to help compromise the system, and it appears that applications have been attaching to this file, rather than the real system DLL. What best describes this?", ["Shimming", "Trojan horse", "Backdoor", "Refactoring"], 0),
  securityPlusPracticeQuestion("Assessment and Testing", "Your company has hired a penetration testing firm to test the network. For the test, you have given the company details on operating systems you use, applications you run, and network devices. What best describes this type of test?", ["White-box test", "External test", "Black-box test", "Threat test"], 0),
  securityPlusPracticeQuestion("Network Attacks", "Frank is a network administrator for a small college. He discovers that several machines on his network are infected with malware. That malware is sending a flood of packets to a target external to the network. What best describes this attack?", ["SYN flood", "DDoS", "Botnet", "Backdoor"], 1),
  securityPlusPracticeQuestion("Malware and Persistence", "John is a salesman for an automobile company. He recently downloaded a program from an unknown website, and now his client files have their file extensions changed, and he cannot open them. He has received a popup window that states his files are now encrypted and he must pay .5 bitcoins to get them decrypted. What has happened?", ["His machine has a rootkit.", "His machine has a logic bomb.", "His machine has a boot sector virus.", "His machine has ransomware."], 3),
  securityPlusPracticeQuestion("Social Engineering", "When phishing attacks are so focused that they target a specific individual, they are called what?", ["Spear phishing", "Targeted phishing", "Phishing", "Whaling"], 0),
  securityPlusPracticeQuestion("Web Application Attacks", "You are concerned about a wide range of attacks that could affect your company\u2019s web server. You have recently read about an attack wherein the attacker sends more data to the target than the target is expecting. If done properly, this could cause the target to crash. What would best prevent this type of attack?", ["An SPI firewall", "An active IDS/IPS", "Checking buffer boundaries", "Checking user input"], 2),
  securityPlusPracticeQuestion("Assessment and Testing", "You work for a large retail company that processes credit card purchases. You have been asked to test your company network for security issues. The specific test you are conducting involves primarily checking policies, documentation, and past incident reports. Which of the following best describes this type of test?", ["Vulnerability scan", "Penetration test", "Security audit", "Security test"], 2),
  securityPlusPracticeQuestion("Wireless and Mobile Attacks", "Maria is a salesperson with your company. After a recent sales trip, she discovers that many of her logins have been compromised. You carefully scan her laptop and cannot find any sign of any malware. You do notice that she had recently connected to a public WiFi at a coffee shop, and it is only since that connection that she noticed her logins had been compromised. What would most likely explain what has occurred?", ["She connected to a rogue AP.", "She downloaded a Trojan horse.", "She downloaded spyware.", "She is the victim of a buffer overflow attack."], 0),
  securityPlusPracticeQuestion("Social Engineering", "You are the manager for network operations at your company. One of the accountants sees you in the hall and thanks you for your team keeping his antivirus software up to date. When you ask him what he means, he mentions that one of your staff, named Mike, called him and remotely connected to update the antivirus. You don\u2019t have an employee named Mike. What has occurred?", ["IP spoofing", "MAC spoofing", "Man-in-the-middle attack", "Social engineering"], 3),
  securityPlusPracticeQuestion("Assessment and Testing", "You are a security administrator for a bank. You are very interested in detecting any breaches or even attempted breaches of your network, including those from internal personnel. But you don\u2019t want false positives to disrupt work. Which of the following devices would be the best choice in this scenario?", ["IPS", "WAF", "SIEM", "IDS"], 3),
  securityPlusPracticeQuestion("Assessment and Testing", "One of your users cannot recall the password for their laptop. You want to recover that password for them. You intend to use a tool/technique that is popular with hackers, and it consists of searching tables of precomputed hashes to recover the password. What best describes this?", ["Rainbow table", "Backdoor", "Social engineering", "Dictionary attack"], 0),
  securityPlusPracticeQuestion("Wireless and Mobile Attacks", "You have noticed that when in a crowded area, you sometimes get a stream of unwanted text messages. The messages end when you leave the area. What describes this attack?", ["Bluejacking", "Bluesnarfing", "Evil twin", "Rogue access point"], 0),
  securityPlusPracticeQuestion("Social Engineering", "Someone has been rummaging through your company\u2019s trash bins seeking to find documents, diagrams, or other sensitive information that has been thrown out. What is this called?", ["Dumpster diving", "Trash diving", "Social engineering", "Trash engineering"], 0),
  securityPlusPracticeQuestion("Wireless and Mobile Attacks", "You have noticed that when in a crowded area, data from your cell phone is stolen. Later investigation shows a Bluetooth connection to your phone, one that you cannot explain. What describes this attack?", ["Bluejacking", "Bluesnarfing", "Evil twin", "RAT"], 1),
  securityPlusPracticeQuestion("Malware and Persistence", "Louis is investigating a malware incident on one of the computers on his network. He has discovered unknown software that seems to be opening a port, allowing someone to remotely connect to the computer. This software seems to have been installed at the same time as a small shareware application. Which of the following best describes this malware?", ["RAT", "Backdoor", "Logic bomb", "Rootkit"], 0),
  securityPlusPracticeQuestion("Configuration and Vulnerability Management", "This is a common security issue that is extremely hard to control in large environments. It occurs when a user has more computer rights, permissions, and privileges than what is required for the tasks the user needs to perform. What best describes this scenario?", ["Excessive rights", "Excessive access", "Excessive permissions", "Excessive privileges"], 3),
  securityPlusPracticeQuestion("Malware and Persistence", "Jared is responsible for network security at his company. He has discovered behavior on one computer that certainly appears to be a virus. He has even identified a file he thinks might be the virus. However, using three separate antivirus programs, he finds that none can detect the file. Which of the following is most likely to be occurring?", ["The computer has a RAT.", "The computer has a zero-day exploit.", "The computer has a logic bomb.", "The computer has a rootkit."], 1),
  securityPlusPracticeQuestion("Configuration and Vulnerability Management", "There are some computers on your network that use Windows XP. They have to stay on Windows XP due to a specific application they are running. That application won\u2019t run on newer operating systems. What security concerns does this situation give you?", ["No special concerns; this is normal.", "The machines cannot be patched; XP is no longer supported.", "The machines cannot coordinate with an SIEM since XP won\u2019t support that.", "The machines are more vulnerable to DoS attacks."], 1),
  securityPlusPracticeQuestion("Wireless and Mobile Attacks", "Far\u00e8s has discovered that attackers have breached his wireless network. They seem to have used a brute-force attack on the WiFi-protected setup PIN to exploit the WAP and recover the WPA2 password. What is this attack called?", ["Evil twin", "Rogue WAP", "IV attack", "WPS Attack"], 3),
  securityPlusPracticeQuestion("Wireless and Mobile Attacks", "Your wireless network has been breached. It appears the attacker modified a portion of data used with the stream cipher and utilized this to expose wirelessly encrypted data. What is this attack called?", ["Evil twin", "Rogue WAP", "IV attack", "WPS Attack"], 2),
  securityPlusPracticeQuestion("Network Attacks", "John is concerned about disgruntled employees stealing company documents and exfiltrating them from the network. He is looking for a solution that will detect likely exfiltration and block it. What type of system is John looking for?", ["IPS", "SIEM", "Honeypot", "Firewall"], 0),
  securityPlusPracticeQuestion("Network Attacks", "Some users on your network use Acme Bank for their personal banking. Those users have all recently been the victim of an attack, wherein they visited a fake Acme Bank website and their logins were compromised. They all visited the bank website from your network, and all of them insist they typed in the correct URL. What is the most likely explanation for this situation?", ["Trojan horse", "IP spoofing", "Clickjacking", "DNS poisoning"], 3),
  securityPlusPracticeQuestion("Wireless and Mobile Attacks", "Users are complaining that they cannot connect to the wireless network. You discover that the WAPs are being subjected to a wireless attack designed to block their WiFi signals. Which of the following is the best label for this attack?", ["IV attack", "Jamming", "WPS attack", "Botnet"], 1),
  securityPlusPracticeQuestion("Web Application Attacks", "What type of attack involves users clicking on something different on a website than what they intended to click on?", ["Clickjacking", "Bluesnarfing", "Bluejacking", "Evil twin"], 0),
  securityPlusPracticeQuestion("Web Application Attacks", "What type of attack exploits the trust that a website has for an authenticated user to attack that website by spoofing requests from the trusted user?", ["Cross-site scripting", "Cross-site request forgery", "Bluejacking", "Evil twin"], 1),
  securityPlusPracticeQuestion("Web Application Attacks", "John is a network administrator for Acme Company. He has discovered that someone has registered a domain name that is spelled just one letter different than his company\u2019s domain. The website with the misspelled URL is a phishing site. What best describes this attack?", ["Session hijacking", "Cross-site request forgery", "Typosquatting", "Clickjacking"], 2),
  securityPlusPracticeQuestion("Wireless and Mobile Attacks", "Frank has discovered that someone was able to get information from his smartphone using a Bluetooth connection. The attacker was able to get his contact list and some emails he had received. What is this type of attack called?", ["Bluesnarfing", "Session hijacking", "Backdoor attack", "CSRF"], 0),
  securityPlusPracticeQuestion("Wireless and Mobile Attacks", "Juanita is a network administrator for Acme Company. Some users complain that they keep getting dropped from the network. When Juanita checks the logs for the wireless access point (WAP), she finds that a deauthentication packet has been sent to the WAP from the users\u2019 IP addresses. What seems to be happening here?", ["Problem with users\u2019 WiFi configuration", "Disassociation attack", "Session hijacking", "Backdoor attack"], 1),
  securityPlusPracticeQuestion("Security Plus Review", "John has discovered that an attacker is trying to get network passwords by using software that attempts a number of passwords from a list of common passwords. What type of attack is this?", ["Dictionary", "Rainbow table", "Brute force", "Session hijacking"], 0),
  securityPlusPracticeQuestion("Network Attacks", "You are a network security administrator for a bank. You discover that an attacker has exploited a flaw in OpenSSL and forced some connections to move to a weak cipher suite version of TLS, which the attacker could breach. What type of attack was this?", ["Disassociation attack", "Downgrade attack", "Session hijacking", "Brute force"], 1),
  securityPlusPracticeQuestion("Web Application Attacks", "When an attacker tries to find an input value that will produce the same hash as a password, what type of attack is this?", ["Rainbow table", "Brute force", "Session hijacking", "Collision attack"], 3),
  securityPlusPracticeQuestion("Threat Actors and Attribution", "Far\u00e8s is the network security administrator for a company that creates advanced routers and switches. He has discovered that his company\u2019s networks have been subjected to a series of advanced attacks over a period of time. What best describes this attack?", ["DDoS", "Brute force", "APT", "Disassociation attack"], 2),
  securityPlusPracticeQuestion("Assessment and Testing", "You are responsible for incident response at Acme Company. One of your jobs is to attempt to attribute attacks to a specific type of attacker. Which of the following would not be one of the attributes you consider in attributing the attack?", ["Level of sophistication", "Resources/funding", "Intent/motivation", "Amount of data stolen"], 3),
  securityPlusPracticeQuestion("Network Attacks", "John is running an IDS on his network. Users sometimes report that the IDS flags legitimate traffic as an attack. What describes this?", ["False positive", "False negative", "False trigger", "False flag"], 0),
  securityPlusPracticeQuestion("Assessment and Testing", "You are performing a penetration test of your company\u2019s network. As part of the test, you will be given a login with minimal access and will attempt to gain administrative access with this account. What is this called?", ["Privilege escalation", "Session hijacking", "Root grabbing", "Climbing"], 0),
  securityPlusPracticeQuestion("Threat Actors and Attribution", "Mary has discovered that a web application used by her company does not always handle multithreading properly, particularly when multiple threads access the same variable. This could allow an attacker who discovered this vulnerability to exploit it and crash the server. What type of error has Mary discovered?", ["Buffer overflow", "Logic bomb", "Race conditions", "Improper error handling"], 2),
  securityPlusPracticeQuestion("Malware and Persistence", "An attacker is trying to get access to your network. He is sending users on your network a link to a freeware stock-monitoring program. However, that stock-monitoring program has attached to it software that will give the attacker access to any machine that it is installed on. What type of attack is this?", ["Rootkit", "Trojan horse", "Spyware", "Boot sector virus"], 1),
  securityPlusPracticeQuestion("Configuration and Vulnerability Management", "Acme Company uses its own internal certificate server for all internal encryption. However, their certificate authority only publishes a CRL once per week. Does this pose a danger, and if so what?", ["Yes, this means a revoked certificate could be used for up to seven days.", "No, this is standard for all certificate authorities.", "Yes, this means it would be easy to fake a certificate.", "No, since this is being used only internally."], 0),
  securityPlusPracticeQuestion("Web Application Attacks", "When a program has variables, especially arrays, and does not check the boundary values before inputting data, what attack is the program vulnerable to?", ["XSS", "CSRF", "Buffer overflow", "Logic bomb"], 2),
  securityPlusPracticeQuestion("Malware and Persistence", "Which of the following best describes malware that will execute some malicious activity when a particular condition is met (i.e., if condition is met, then execute)?", ["Boot sector virus", "Logic bomb", "Buffer overflow", "Sparse infector virus"], 1),
  securityPlusPracticeQuestion("Malware and Persistence", "Gerald is a network administrator for Acme Company. Users are reporting odd behavior on their computers. He believes this may be due to malware, but the behavior is different on different computers. What might best explain this?", ["It is not malware, but hardware failure.", "It is a boot sector virus.", "It is a macro virus.", "It is a polymorphic virus."], 3),
  securityPlusPracticeQuestion("Network Attacks", "Teresa is a security officer at ACME Inc. She has discovered an attack where the attacker sent multiple broadcast messages to the network routers, spoofing an IP address of one of the network servers. This caused the network to send a flood of packets to that server and it is no longer responding. What is this attack called?", ["Smurf attack", "DDoS attack", "TCP hijacking attack", "TCP SYN flood attack"], 0),
  securityPlusPracticeQuestion("Malware and Persistence", "Which type of virus is able to alter its own code to avoid being detected by antivirus software?", ["Boot sector", "Hoax", "Polymorphic", "Stealth"], 2),
  securityPlusPracticeQuestion("Malware and Persistence", "Gerald is a network administrator for a small financial services company. Users are reporting odd behavior that appears to be caused by a virus on their machines. After isolating the machines that he believes are infected, Gerald analyzes them. He finds that all the infected machines received an email purporting to be from accounting, with an Excel spreadsheet, and the users opened the spreadsheet. What is the most likely issue on these machines?", ["A macro virus", "A boot sector virus", "A Trojan horse", "A RAT"], 0),
  securityPlusPracticeQuestion("Malware and Persistence", "Fred is on the incident response team for a major insurance company. His specialty is malware analysis. He is studying a file that is suspected of being a virus that infected the company network last month. The file seems to intermittently have bursts of malicious activity, interspersed with periods of being dormant. What best describes this malware?", ["A macro virus", "A logic bomb", "A sparse infector virus", "A polymorphic virus"], 2),
  securityPlusPracticeQuestion("Malware and Persistence", "What is the term used to describe a virus that can infect both program files and boot sectors?", ["Polymorphic", "Multipartite", "Stealth", "Multiple encrypting"], 1),
  securityPlusPracticeQuestion("Assessment and Testing", "Your company has hired an outside security firm to perform various tests of your network. During the vulnerability scan you will provide that company with logins for various systems (i.e., database server, application server, web server, etc.) to aid in their scan. What best describes this?", ["A white-box test", "A gray-box test", "A privileged scan", "An authenticated user scan"], 3),
  securityPlusPracticeQuestion("Network Attacks", "Which of the following is commonly used in a distributed denial of service (DDoS) attack?", ["Phishing", "Adware", "Botnet", "Trojan"], 2),
  securityPlusPracticeQuestion("Configuration and Vulnerability Management", "You are investigating a recent breach at Acme Company. You discover that the attacker used an old account of someone no longer at the company. The account was still active. Which of the following best describes what caused this vulnerability to exist?", ["Improperly configured accounts", "Untrained users", "Using default configuration", "Failure to patch systems"], 0),
  securityPlusPracticeQuestion("Configuration and Vulnerability Management", "Juan is responsible for incident response at a large financial institution. He discovers that the company WiFi has been breached. The attacker used the same login credentials that ship with the wireless access point (WAP). The attacker was able to use those credentials to access the WAP administrative console and make changes. Which of the following best describes what caused this vulnerability to exist?", ["Improperly configured accounts", "Untrained users", "Using default configuration", "Failure to patch systems"], 2),
  securityPlusPracticeQuestion("Web Application Attacks", "Elizabeth is investigating a network breach at her company. She discovers a program that was able to execute code within the address space of another process by using the target process to load a specific library. What best describes this attack?", ["Logic bomb", "Session hijacking", "Buffer overflow", "DLL injection"], 3),
  securityPlusPracticeQuestion("Web Application Attacks", "Zackary is a malware investigator with a cybersecurity firm. He is investigating malware that is able to compromise a target program by finding null references in the target program and dereferencing them, causing an exception to be generated. What best describes this type of attack?", ["DLL injection", "Buffer overflow", "Memory leak", "Pointer dereference"], 3),
  securityPlusPracticeQuestion("Configuration and Vulnerability Management", "Frank has just taken over as CIO of a mid-sized insurance company. One of the first things he does is order a thorough inventory of all network equipment. He discovers two routers that are not documented. He is concerned that if they are not documented, they might not be securely configured, tested, and safe. What best describes this situation?", ["Poor user training", "System sprawl", "Failure to patch systems", "Default configuration"], 1),
  securityPlusPracticeQuestion("Assessment and Testing", "What is the primary difference between an intrusive and a nonintrusive vulnerability scan?", ["An intrusive scan is a penetration test.", "A nonintrusive scan is just a document check.", "An intrusive scan could potentially disrupt operations.", "A nonintrusive scan won\u2019t find most vulnerabilities."], 2),
  securityPlusPracticeQuestion("Threat Actors and Attribution", "Daryl is investigating a recent breach of his company\u2019s web server. The attacker used sophisticated techniques and then defaced the website, leaving messages that were denouncing the company\u2019s public policies. He and his team are trying to determine the type of actor who most likely committed the breach. Based on the information provided, who was the most likely threat actor?", ["A script", "A nation-state", "Organized crime", "Hacktivists"], 3),
  securityPlusPracticeQuestion("Threat Actors and Attribution", "When investigating breaches and attempting to attribute them to specific threat actors, which of the following is not one of the indicators of an APT?", ["Long-term access to the target", "Sophisticated attacks", "The attack comes from a foreign IP address.", "The attack is sustained over time."], 2),
  securityPlusPracticeQuestion("Wireless and Mobile Attacks", "What type of attack uses a second wireless access point (WAP) that broadcasts the same SSID as a legitimate access point, in an attempt to get users to connect to the attacker\u2019s WAP?", ["Evil twin", "IP spoofing", "Trojan horse", "MAC spoofing"], 0),
  securityPlusPracticeQuestion("Threat Actors and Attribution", "You are investigating a breach of a large technical company. You discover that there have been several different attacks over a period of a year. The attacks were sustained, each lasting several weeks of continuous attack. The attacks were somewhat sophisticated and originated from a variety of IP addresses, but all the IP addresses are within your country. Which threat actor would you most suspect of being involved in this attack?", ["Nation-state", "Hacktivist", "Script kiddie", "A lone highly skilled hacker"], 0),
  securityPlusPracticeQuestion("Configuration and Vulnerability Management", "Which of the following best describes a zero-day vulnerability?", ["A vulnerability that has been known to the vendor for zero days", "A vulnerability that has not yet been breached", "A vulnerability that can be quickly exploited (i.e., in zero days)", "A vulnerability that will give the attacker brief access (i.e., zero days)"], 0),
  securityPlusPracticeQuestion("Network Attacks", "You have discovered that there are entries in your network\u2019s domain name server that point legitimate domains to unknown and potentially harmful IP addresses. What best describes this type of attack?", ["A backdoor", "An APT", "DNS poisoning", "A Trojan horse"], 2),
  securityPlusPracticeQuestion("Malware and Persistence", "What best describes an attack that attaches some malware to a legitimate program so that when the user installs the legitimate program, they inadvertently install the malware?", ["Backdoor", "Trojan horse", "RAT", "Polymorphic virus"], 1),
  securityPlusPracticeQuestion("Malware and Persistence", "Which of the following best describes software that will provide the attacker with remote access to the victim\u2019s machine, but that is wrapped with a legitimate program in an attempt to trick the victim into installing it?", ["RAT", "Backdoor", "Trojan horse", "Macro virus"], 0),
  securityPlusPracticeQuestion("Web Application Attacks", "Which of the following is an attack that seeks to attack a website, based on the website\u2019s trust of an authenticated user?", ["XSS", "CSRF", "Buffer overflow", "RAT"], 1),
  securityPlusPracticeQuestion("Malware and Persistence", "John is analyzing what he believes is a malware outbreak on his network. Many users report their machines are behaving strangely. The anomalous behavior seems to occur sporadically and John cannot find a pattern. What is the most likely cause?", ["APT", "Boot sector virus", "Sparse infector virus", "Key logger"], 2),
];

const itsNetworkingExam1QuestionBank = [
  networkingPracticeQuestion("Protocols and Services", "What are the main criteria used by firewalls to filter traffic? Choose 2.", ["Protocols and ports", "User accounts and applications", "Ports and applications", "Protocols and user accounts"]),
  networkingPracticeQuestion("Network Infrastructures", "Which wireless standards are compatible with 802.11ac? Choose 2.", ["802.11n and 802.11a", "802.11b and 802.11g", "802.11a and 802.11b", "802.11g and 802.11b"]),
  networkingPracticeQuestion("Network Infrastructures", "Which are WAN connectivity options? Choose 2.", ["Leased Line and Dial-Up", "Ethernet and Token Ring", "Ethernet and Dial-Up", "Leased Line and Token Ring"]),
  networkingPracticeQuestion("Protocols and Services", "Which protocol maps an IP address to a MAC address?", ["ARP", "DHCP", "RIP", "No change is needed"]),
  networkingPracticeQuestion("Networking Fundamentals", "Private WiFi networks at one location describe which network?", ["Intranet", "Internet", "Extranet", "Perimeter Network"]),
  networkingPracticeQuestion("Networking Fundamentals", "What is the subnet mask for 172.168.1.0 as a Class B network?", ["255.255.0.0", "255.0.0.0", "255.255.255.0", "255.255.255.255"]),
  networkingPracticeQuestion("Networking Fundamentals", "What is the network for IP address 220.100.100.100?", ["220.100.100.0/24", "220.100.100.1/24", "255.255.255.0/24", "255.255.255.1/24"]),
  networkingDropdownQuestion("Network Hardware", "Identify the cable and connector shown.", [
    { label: "Connector Type", options: ["RJ45", "RJ11", "BNC", "LC"], correct: "RJ45" },
    { label: "Cable Type", options: ["Ethernet", "Coaxial", "Single-mode fiber", "Console rollover"], correct: "Ethernet" }
  ]),
  networkingPracticeQuestion("Network Hardware", "Which are characteristics of switches? Choose 2.", ["Identify destination and send/receive simultaneously", "Cause more collisions and send frames to all computers", "Identify destination and cause more collisions", "Send frames to all computers and only transmit half-duplex"]),
  networkingDropdownQuestion("Network Hardware", "Choose the correct switch behavior for each statement.", [
    { label: "Unicast traffic is sent to one known port", options: ["Yes", "No"], correct: "Yes" },
    { label: "Unknown destination frames are flooded", options: ["Yes", "No"], correct: "Yes" },
    { label: "Broadcast traffic is sent only to the uplink", options: ["Yes", "No"], correct: "No" }
  ]),
  networkingPracticeQuestion("Networking Fundamentals", "CIDR 192.168.1.1/25 corresponds to which subnet mask?", ["255.255.255.128", "255.255.255.64", "255.255.255.32", "255.255.255.256"]),
  networkingPracticeQuestion("Network Hardware", "What is the best cable to reduce interference?", ["STP Cat5e", "UTP Cat5e", "Cat3", "UTP Cat6"]),
  networkingDropdownQuestion("Protocols and Services", "Choose the correct truth value for each TCP/IP/UDP statement.", [
    { label: "TCP is reliable", options: ["Yes", "No"], correct: "Yes" },
    { label: "IP is reliable", options: ["Yes", "No"], correct: "No" },
    { label: "UDP is unreliable", options: ["Yes", "No"], correct: "Yes" }
  ]),
  networkingPracticeQuestion("Troubleshooting", "Which Linux tool can list active incoming connections?", ["netstat", "ip addr", "host", "dig"]),
  networkingPracticeQuestion("Protocols and Services", "Which encryption protocols secure browser/server communication?", ["SSL and TLS", "HTTP and HTTPS", "TCP and UDP", "SSL and HTTP"]),
  networkingPracticeQuestion("Networking Fundamentals", "The Internet is best described as which topology?", ["Mesh", "Star", "Hybrid", "Ring"]),
  networkingDropdownQuestion("Protocols and Services", "Choose the correct truth value for each QoS statement.", [
    { label: "QoS can define traffic priority", options: ["Yes", "No"], correct: "Yes" },
    { label: "QoS directly controls total bandwidth", options: ["Yes", "No"], correct: "No" },
    { label: "QoS assigns protocols dynamically", options: ["Yes", "No"], correct: "No" }
  ]),
  networkingPracticeQuestion("Network Hardware", "A MAC address identifies a:", ["NIC", "Local broadcast domain", "LAN", "UPnP device"]),
  networkingPracticeQuestion("Protocols and Services", "Which IPv6 address type delivers packets to all interfaces in a group?", ["Multicast", "Broadcast", "Unicast", "Anycast"]),
  networkingPracticeQuestion("Network Hardware", "What is a similarity between Layer 2 and Layer 3 switches?", ["Forward packets", "High security", "Logical addressing", "Allow VLANs only"]),
  networkingPracticeQuestion("Networking Fundamentals", "Which pair contains invalid IP addresses?", ["156.296.61.14 and 6901:0gd8", "109.215.72.3 and 192.168.1.10", "172.16.0.1 and 10.0.0.5", "8.8.8.8 and 1.1.1.1"]),
  networkingPracticeQuestion("Network Infrastructures", "Which wireless encryption option is the weakest?", ["WEP", "WPA", "WPA2", "AES"]),
  networkingMatchingQuestion("Networking Fundamentals", "Drag each OSI layer name to the correct layer number.", [
    { prompt: "Layer 1", correct: "Physical" },
    { prompt: "Layer 2", correct: "Data Link" },
    { prompt: "Layer 3", correct: "Network" },
    { prompt: "Layer 4", correct: "Transport" },
    { prompt: "Layer 5", correct: "Session" },
    { prompt: "Layer 6", correct: "Presentation" },
    { prompt: "Layer 7", correct: "Application" }
  ]),
  networkingPracticeQuestion("Network Infrastructures", "What does Teredo tunneling provide?", ["IPv6 connectivity through IPv4 devices", "IPv4 to IPv6 translation only", "VPN security", "Dynamic IPv6 allocation"]),
  networkingPracticeQuestion("Network Infrastructures", "Which data transmission method uses a private tunnel?", ["VPN", "PPTP only", "L2TP only", "IPsec only"]),
  networkingPracticeQuestion("Protocols and Services", "Which DNS record maps an IP address to a fully qualified domain name?", ["PTR", "CNAME", "AAAA", "A"]),
  networkingPracticeQuestion("Troubleshooting", "Which command shows listening ports?", ["netstat", "ping", "nbtstat", "nslookup"]),
  networkingPracticeQuestion("Networking Fundamentals", "What determines the media access method?", ["Topology and protocols", "Number of hosts", "Number of domain servers", "Maximum speed only"]),
  networkingPracticeQuestion("Network Infrastructures", "What is the purpose of a perimeter network?", ["Make resources available to the Internet", "Make resources available only to the intranet", "Link CANs", "Link LANs"]),
  networkingPracticeQuestion("Network Infrastructures", "Which VPN type is used to connect a home computer to an intranet?", ["VPN, Site-to-Host", "VPN, Site-to-Site", "VLAN, Site-to-Host", "IPsec, Intranet-only"]),
  networkingMatchingQuestion("Networking Fundamentals", "Drag each PDU to the correct OSI layer.", [
    { prompt: "Transport Layer", correct: "Segments" },
    { prompt: "Network Layer", correct: "Packets" },
    { prompt: "Data Link Layer", correct: "Frames" },
    { prompt: "Physical Layer", correct: "Bits" }
  ]),
  networkingPracticeQuestion("Troubleshooting", "Which command generated the shown results for active connections?", ["netstat -a", "ping", "ipconfig", "route print"]),
  networkingPracticeQuestion("Troubleshooting", "Which command verifies server connectivity?", ["PING", "IPCONFIG", "ROUTE", "CHECK"]),
  networkingPracticeQuestion("Protocols and Services", "Which are DHCP features? Choose 2.", ["Address reservation and IP address exclusion", "Address resolution to canonical names and secure shell connections", "Network file transfer and secure shell connections", "Address resolution and network file transfer"]),
  networkingPracticeQuestion("Network Hardware", "Which cable is best for interference near heavy equipment?", ["STP Cat5e", "UTP Cat5e", "UTP Cat6", "Cat3"]),
  networkingPracticeQuestion("Networking Fundamentals", "Which is a private IP address?", ["192.168.1.10", "169.168.21.24", "11.145.12.57", "224.142.15.21"]),
  networkingPracticeQuestion("Network Hardware", "Which Layer 2 device connects multiple computers?", ["Switch", "Repeater", "Router", "Packet"]),
  networkingPracticeQuestion("Network Infrastructures", "Which network type is usually most vulnerable?", ["Wireless", "Dial-up", "Broadband", "Leased line"]),
  networkingPracticeQuestion("Protocols and Services", "Which DNS zone replication term is correct?", ["Zone transfer", "Zone synchronization", "Start of authority", "No change needed"]),
  networkingMatchingQuestion("Networking Fundamentals", "Drag each IP class to the correct address range.", [
    { prompt: "Class A", correct: "1-126" },
    { prompt: "Class B", correct: "128-191" },
    { prompt: "Class C", correct: "192-223" },
    { prompt: "Class D", correct: "224-239" }
  ]),
  networkingPracticeQuestion("Network Hardware", "Which are fiber optic characteristics? Choose 2.", ["Supports splicing and requires polish for end connectors", "Conducts electricity and requires metal conduit", "Requires metal conduit and supports tokens", "Conducts electricity and requires RJ45 connectors"]),
  networkingPracticeQuestion("Networking Fundamentals", "At which OSI layer does encryption occur?", ["Presentation", "Data Link", "Transport", "Network"]),
  networkingPracticeQuestion("Protocols and Services", "Which DNS record specifies an alias?", ["CNAME", "MX", "NS", "SOA"]),
  networkingPracticeQuestion("Network Infrastructures", "Which technology extends an internal network across public networks?", ["VPN", "Microsoft .NET Framework", "Microsoft ASP.NET", "VLAN"]),
  networkingMatchingQuestion("Protocols and Services", "Drag each protocol to its default port.", [
    { prompt: "HTTPS", correct: "443" },
    { prompt: "SMTP", correct: "25" },
    { prompt: "IMAP", correct: "143" },
    { prompt: "DNS", correct: "53" },
    { prompt: "FTP", correct: "21" }
  ]),
  networkingPracticeQuestion("Networking Fundamentals", "What is the IPv6 loopback address?", ["::1", "::0", "127.0.0.1", "192.168.0.1"]),
  networkingPracticeQuestion("Network Hardware", "Which cable type transmits data the greatest distance?", ["Single-mode fiber", "Multi-mode fiber", "Cat5e", "Cat6"])
];

const itsNetworkingExam2QuestionBank = [
  networkingPracticeQuestion("Networking Fundamentals", "Which address space is public?", ["197.16.0.0/12", "192.168.0.0/16", "10.0.0.0/8", "172.16.0.0/12"]),
  networkingPracticeQuestion("Network Hardware", "Which tool tests cable capability for 1000Mbps full-duplex?", ["Cable Tester", "Multimeter", "Toner", "Time Domain Reflectometer (TDR)"]),
  networkingPracticeQuestion("Network Infrastructures", "Which service masks internal IP addresses?", ["NAT", "WINS", "DHCP", "DNS"]),
  networkingPracticeQuestion("Network Infrastructures", "IEEE 802.11a/b/g/n are known as:", ["WiFi", "WiMAX", "Bluetooth", "No change is needed"]),
  networkingDropdownQuestion("Troubleshooting", "Choose the correct settings to fix DHCP and DNS automatic configuration.", [
    { label: "IP address setting", options: ["Obtain an IP address automatically", "Use the following IP address", "Disable DHCP", "Use APIPA only"], correct: "Obtain an IP address automatically" },
    { label: "DNS server setting", options: ["Obtain DNS server address automatically", "Use static DNS only", "Disable DNS", "Use loopback as DNS"], correct: "Obtain DNS server address automatically" }
  ]),
  networkingPracticeQuestion("Network Hardware", "Which connector is used on 100BaseT Ethernet?", ["RJ-45", "RJ-11", "TNC", "BNC"]),
  networkingPracticeQuestion("Troubleshooting", "What is the ping utility used for? Choose 2.", ["Self-test network interface and determine reachability", "Resolve hostname to IP and configure routers", "Scan for duplicate addresses and configure DHCP", "Determine reachability and configure firewalls"]),
  networkingPracticeQuestion("Troubleshooting", "Which commands are used for hop results?", ["tracert and pathping", "ping and ipconfig", "nslookup and nbtstat", "netstat and arp"]),
  networkingPracticeQuestion("Network Infrastructures", "If a router cannot determine the next hop, what should it do?", ["Forward to default route", "Send back to source", "Broadcast packet", "Store in buffer"]),
  networkingPracticeQuestion("Protocols and Services", "Which ports should be allowed for web access through a firewall?", ["Port 80 and Port 443", "Port 21 and Port 23", "Port 25 and Port 21", "Port 23 and Port 25"]),
  networkingPracticeQuestion("Troubleshooting", "What will the ipconfig command do?", ["Display client address", "Configure routers", "Display broadcast mode", "Configure DHCP clients"]),
  networkingPracticeQuestion("Network Infrastructures", "What do VPNs provide?", ["Secure connection through public networks", "Additional IPSec encryption only", "Secure connection only with private networks", "Additional security for selected computers only"]),
  networkingPracticeQuestion("Protocols and Services", "Which are application layer protocols? Choose 2.", ["FTP and SMTP", "TCP and UDP", "IP and TCP", "UDP and IP"]),
  networkingMatchingQuestion("Protocols and Services", "Drag each protocol to its default port.", [
    { prompt: "DNS", correct: "53" },
    { prompt: "FTP", correct: "21" },
    { prompt: "LDAP", correct: "389" },
    { prompt: "HTTP", correct: "80" },
    { prompt: "SSL/HTTPS", correct: "443" },
    { prompt: "RDP", correct: "3389" },
    { prompt: "IMAP", correct: "143" },
    { prompt: "POP3", correct: "110" }
  ]),
  networkingDropdownQuestion("Network Infrastructures", "Choose the correct truth value for each virtual machine reboot statement.", [
    { label: "Rebooting one VM reboots all VMs", options: ["Yes", "No"], correct: "No" },
    { label: "Rebooting the host does not affect VMs", options: ["Yes", "No"], correct: "Yes" },
    { label: "You must reboot the physical server to reboot a VM", options: ["Yes", "No"], correct: "No" }
  ]),
  networkingPracticeQuestion("Troubleshooting", "Which actions help troubleshoot an ISP customer issue? Choose 3.", ["Restart modem, perform line test, check modem status lights", "Delete host files, remote login, update OS", "Restart modem, delete host files, update OS", "Remote login, update OS, perform line test"]),
  networkingPracticeQuestion("Network Infrastructures", "Which routing type is fault-tolerant?", ["Dynamic routing", "Static routing", "Default route", "Least cost routing"]),
  networkingPracticeQuestion("Troubleshooting", "Which IP indicates DHCP failure?", ["169.254.1.13", "172.16.1.15", "192.168.1.15", "10.19.1.15"]),
  networkingPracticeQuestion("Network Infrastructures", "Which technology provides a private tunnel over a network?", ["VPN", "IPSec only", "L2TP only", "PPTP only"]),
  networkingPracticeQuestion("Networking Fundamentals", "Which is a private internal network?", ["Intranet", "Ethernet", "Internet", "Extranet"]),
  networkingPracticeQuestion("Network Hardware", "Which feature is specific to a multilayer switch?", ["Provides Layer 3 routing", "Manage client addresses", "Bridge topologies only", "Translate protocols"]),
  networkingPracticeQuestion("Network Infrastructures", "Which responsibilities are reduced after cloud migration? Choose 2.", ["Physical server security and replacing failed hardware", "Updating OS and backing up data", "Managing permissions and updating OS", "Backing up data and managing permissions"]),
  networkingDropdownQuestion("Network Hardware", "Choose the correct switch behavior for each statement.", [
    { label: "Unicast traffic is sent to one known port", options: ["Yes", "No"], correct: "Yes" },
    { label: "Unknown destination frames are flooded", options: ["Yes", "No"], correct: "Yes" },
    { label: "Broadcast traffic is sent only to the uplink", options: ["Yes", "No"], correct: "No" }
  ]),
  networkingPracticeQuestion("Networking Fundamentals", "Which are advantages of star topology? Choose 2.", ["A cable issue affects two nodes and the central point allows flexibility", "Redundant paths and no central device dependency", "Central device failure does not affect network and redundant paths", "Cable issue affects all nodes and removes flexibility"]),
  networkingPracticeQuestion("Network Infrastructures", "Which wireless encryption option is the weakest?", ["WEP", "WPA2", "WPA-AES", "WPA-PSK"]),
  networkingPracticeQuestion("Network Hardware", "Which device is best for workgroup throughput?", ["Managed switch", "Hub", "Unmanaged switch", "Router"]),
  networkingMatchingQuestion("Network Infrastructures", "Drag each VPN description to the correct VPN type.", [
    { prompt: "Remote user access", correct: "Remote Access VPN" },
    { prompt: "Connects two private networks", correct: "Site-to-Site VPN" },
    { prompt: "Legacy tunnel protocol often considered weaker", correct: "PPTP" }
  ]),
  networkingPracticeQuestion("Networking Fundamentals", "What is the IPv6 address length?", ["128", "32", "64", "256"]),
  networkingPracticeQuestion("Network Infrastructures", "A static route is set by:", ["Network administrator", "Routing protocol", "Adjacent network", "Next upstream router"]),
  networkingPracticeQuestion("Network Infrastructures", "Which port supports VLAN traffic?", ["Trunk port", "WAN port", "Virtual port", "LAN port"]),
  networkingPracticeQuestion("Networking Fundamentals", "What is the host portion of 10.245.94.21 /16?", ["94.21", "10.245.94.21", "245.94.21", "21"]),
  networkingPracticeQuestion("Protocols and Services", "Which TCP/IP statement evaluation was marked correct?", ["No change is needed", "FTP only", "HTTP only", "SNMP only"]),
  networkingPracticeQuestion("Network Infrastructures", "What is the max throughput of 802.11g?", ["54Mbps", "2.4Mbps", "2.4GHz", "54GHz"]),
  networkingPracticeQuestion("Network Infrastructures", "What should be configured on a router so private IPv4 addresses can reach the Internet?", ["NAT", "DHCP", "VPN", "WAP"]),
  networkingPracticeQuestion("Network Hardware", "Which feature reduces interference in Cat5e STP?", ["Shielding", "Crosstalk", "Twisting", "Length"]),
  networkingDropdownQuestion("Networking Fundamentals", "Choose the correct truth value for each star topology statement.", [
    { label: "A bad cable affects two interfaces", options: ["Yes", "No"], correct: "Yes" },
    { label: "Central device failure does not affect the network", options: ["Yes", "No"], correct: "No" },
    { label: "The central point allows flexibility", options: ["Yes", "No"], correct: "Yes" }
  ]),
  networkingPracticeQuestion("Protocols and Services", "Ping uses which protocol?", ["ICMP", "HTTP", "BOOTP", "SNMP"]),
  networkingPracticeQuestion("Protocols and Services", "Which server uses pointer and A records?", ["DNS Server", "NAT Server", "IDS", "IPS"]),
  networkingPracticeQuestion("Network Hardware", "What is the central device in a star topology?", ["Hub", "Bridge", "Server", "Segmenter"]),
  networkingPracticeQuestion("Protocols and Services", "Which protocol encrypts packets on the Internet?", ["HTTPS", "SNMP", "HTTP", "TFTP"]),
  networkingPracticeQuestion("Troubleshooting", "Which tool lists active incoming connections?", ["NETSTAT", "NSLOOKUP", "PING", "IPCONFIG"]),
  networkingPracticeQuestion("Troubleshooting", "Which wireless issue is caused by electromagnetic waves?", ["Interference", "Fading", "Attenuation", "Diffraction"]),
  networkingDropdownQuestion("Troubleshooting", "Choose the correct truth value for each tracert statement.", [
    { label: "Displays router addresses", options: ["Yes", "No"], correct: "Yes" },
    { label: "Determines packet loss", options: ["Yes", "No"], correct: "No" },
    { label: "Displays routers for all active connections", options: ["Yes", "No"], correct: "No" }
  ]),
  networkingDropdownQuestion("Troubleshooting", "Evaluate the trace route output.", [
    { label: "Each hop is a", options: ["Router", "Switch", "Firewall", "Client host"], correct: "Router" },
    { label: "Trace status", options: ["Successfully completed", "Failed because DNS is down", "Failed because DHCP is down", "Packet loss required"], correct: "Successfully completed" }
  ]),
  networkingPracticeQuestion("Troubleshooting", "Which tool locates a cable in a patch panel?", ["Toner", "Cable Tester", "Multimeter", "TDR"]),
  networkingPracticeQuestion("Troubleshooting", "Which actions help troubleshoot no external website access? Choose 2.", ["Check router connectivity and contact ISP", "Check valid IP addresses and bad adapters", "Contact ISP and check bad adapters only", "Disable DNS and replace the NIC"]),
  networkingPracticeQuestion("Network Hardware", "Which are wired Ethernet characteristics? Choose 2.", ["Twisted pair or fiber media and negotiates different speeds", "Adapters encoded with IP addresses and uses tokens", "Uses tokens and does not negotiate speed", "Wireless media and broadcast-only operation"])
];

const fullLengthPracticeExams = [
  {
    id: "pearson-cybersecurity-full",
    certification: "Pearson Cybersecurity",
    title: "Pearson Cybersecurity Full Length Practice Exam",
    minutes: 50,
    questionBank: cyberSecurityFullPracticeExamQuestionBank,
    bankStatus: "Official uploaded bank: CyberSecurity Full Practice Exam."
  },
  {
    id: "pearson-network-security-full",
    certification: "Pearson Network Security",
    title: "Pearson Network Security Full Length Practice Exam",
    minutes: 50,
    questionBank: networkSecurityPracticeExamQuestionBank,
    bankStatus: "Uploaded 50-question bank from Untitled document (2).pdf."
  },
  {
    id: "its-networking-exam-1-full",
    certification: "Pearson Networking",
    title: "ITS Networking Practice Exam 1",
    minutes: 50,
    questionBank: itsNetworkingExam1QuestionBank,
    bankStatus: "Official uploaded bank: ITS Networking Exam 1."
  },
  {
    id: "its-networking-exam-2-full",
    certification: "Pearson Networking",
    title: "ITS Networking Practice Exam 2",
    minutes: 50,
    questionBank: itsNetworkingExam2QuestionBank,
    bankStatus: "Official uploaded bank: ITS Networking Exam 2."
  },
  {
    id: "comptia-network-plus-full",
    certification: "CompTIA Network Plus",
    title: "CompTIA Network Plus Full Length Practice Exam",
    minutes: 50,
    questionBank: pearsonNetworkingQuestionBank,
    bankStatus: "Temporary bank: Networking pool until Network Plus documents are uploaded."
  },
  {
    id: "comptia-security-plus-full",
    certification: "CompTIA Security Plus",
    title: "CompTIA Security Plus Practice Exam",
    minutes: 90,
    questionBank: comptiaSecurityPlusPracticeExamQuestionBank,
    bankStatus: "Uploaded 90-question bank with AI-generated answer key."
  }
];

const certificationQuizzes = [
  {
    id: "pearson-cybersecurity",
    title: "Pearson Cybersecurity Quiz",
    certification: "Pearson Cybersecurity",
    difficulty: "Beginner",
    questions: pearsonCybersecurityQuestionBank
  },
  {
    id: "pearson-network-security",
    title: "Pearson Network Security Quiz",
    certification: "Pearson Network Security",
    difficulty: "Intermediate",
    questions: pearsonNetworkSecurityQuestionBank
  },
  {
    id: "pearson-networking",
    title: "Pearson Networking Quiz",
    certification: "Pearson Networking",
    difficulty: "Beginner",
    questions: pearsonNetworkingQuestionBank
  },
  {
    id: "comptia-network-plus",
    title: "CompTIA Network Plus Quiz",
    certification: "CompTIA Network Plus",
    difficulty: "Intermediate",
    questions: [
      {
        question: "Which model is often used to explain networking layers?",
        answers: ["OSI model", "Color wheel", "Keyboard map", "Invoice model"],
        correct: 0
      },
      {
        question: "Which command can show IP addressing on Linux?",
        answers: ["ip a", "mkdir", "cat /etc/passwd", "clear"],
        correct: 0
      },
      {
        question: "Which concept separates one network into smaller logical networks?",
        answers: ["Subnetting", "Screenshotting", "Zipping", "Bookmarking"],
        correct: 0
      }
    ]
  },
  {
    id: "comptia-security-plus",
    title: "CompTIA Security Plus Quiz",
    certification: "CompTIA Security Plus",
    difficulty: "Advanced",
    questions: comptiaSecurityPlusPracticeExamQuestionBank
  }
];

const guideSections = {
  intro: {
    title: "Introduction",
    html: `
      <div class="chat-message-card assistant-card">
        <strong>SOCAI Guide</strong>
        <p>Kali Linux is a security-focused Linux distribution used for authorized testing, training, and defensive validation. Treat every command as a lab action and only practice in systems you own or have permission to assess.</p>
      </div>
      <div class="chat-message-card user-card">
        <strong>Checklist</strong>
        <ul>
          <li>Use isolated labs or intentionally vulnerable machines.</li>
          <li>Document commands, results, and lessons learned.</li>
          <li>Think like a defender: every tool should teach detection and prevention.</li>
        </ul>
      </div>
    `
  },
  commands: {
    title: "Basic Commands",
    html: `
      <div class="chat-message-card assistant-card">
        <strong>SOCAI Guide</strong>
        <p>These commands help you navigate, inspect files, and understand your Kali environment before running specialized tools.</p>
      </div>
      <div class="chat-message-card user-card">
        <strong>Command Notes</strong>
        <ul class="command-list">
          <li><code>pwd</code>Show your current directory.</li>
          <li><code>ls -la</code>List files, permissions, and hidden items.</li>
          <li><code>cd</code>Move between directories.</li>
          <li><code>ip a</code>Review network interfaces and addresses.</li>
          <li><code>sudo apt update</code>Refresh package lists before installing tools.</li>
        </ul>
      </div>
    `
  },
  tools: {
    title: "Tools Overview",
    html: `
      <div class="chat-message-card assistant-card">
        <strong>SOCAI Guide</strong>
        <p>Kali includes many tools. Start with awareness and responsible workflows before deeper testing.</p>
      </div>
      <div class="chat-message-card user-card">
        <strong>Tool Overview</strong>
        <ul>
          <li><strong>Nmap:</strong> Network discovery and service enumeration in authorized environments.</li>
          <li><strong>Wireshark:</strong> Packet capture and protocol analysis.</li>
          <li><strong>Burp Suite:</strong> Web application testing through an intercepting proxy.</li>
          <li><strong>John the Ripper:</strong> Password auditing for approved recovery and policy checks.</li>
        </ul>
      </div>
    `
  },
  practice: {
    title: "Practice Exercises",
    html: `
      <div class="chat-message-card assistant-card">
        <strong>SOCAI Guide</strong>
        <p>Use these prompts to build careful, repeatable habits in a legal lab setting.</p>
      </div>
      <div class="chat-message-card user-card">
        <strong>Lab Prompts</strong>
        <ol>
          <li>Open a terminal, identify your current directory, and create a notes folder.</li>
          <li>Inspect your IP address and write down the active interface name.</li>
          <li>Run a basic scan against a local test machine that you control.</li>
          <li>Capture a short packet sample and identify at least two protocols.</li>
        </ol>
      </div>
    `
  }
};

const quizQuestions = [
  {
    question: "Which command shows the current working directory?",
    answers: ["pwd", "whoami", "ip a", "mkdir"],
    correct: 0,
    explanations: [
      "pwd is correct because it prints the current working directory, which tells you exactly where your terminal session is.",
      "whoami shows the current username, not the folder path.",
      "ip a shows network interfaces and IP addresses, not the current directory.",
      "mkdir creates a new directory, but it does not show where you are."
    ]
  },
  {
    question: "Which tool is commonly used for network discovery and service enumeration?",
    answers: ["Nmap", "Gimp", "LibreOffice", "VLC"],
    correct: 0,
    explanations: [
      "Nmap is correct because it discovers hosts, open ports, and service details in authorized networks.",
      "Gimp is an image editor, not a network discovery tool.",
      "LibreOffice is an office suite for documents and spreadsheets, not service enumeration.",
      "VLC is a media player, so it will not scan hosts or identify services."
    ]
  },
  {
    question: "What is the safest place to practice Kali Linux techniques?",
    answers: ["Any public network", "An authorized lab environment", "A random website", "A neighbor's router"],
    correct: 1,
    explanations: [
      "A public network is not safe for practice because you do not control it and likely do not have permission.",
      "An authorized lab environment is correct because it gives you permission, boundaries, and a safe place to learn.",
      "A random website is not appropriate because testing it without permission can cause harm and legal trouble.",
      "A neighbor's router is not yours to test, so it is unauthorized and unsafe."
    ]
  },
  {
    question: "Which tool helps inspect packets and protocols?",
    answers: ["Wireshark", "Calculator", "Notepad", "Calendar"],
    correct: 0,
    explanations: [
      "Wireshark is correct because it captures and analyzes packets, protocols, conversations, and packet details.",
      "Calculator can compute numbers, but it cannot inspect packet captures.",
      "Notepad can record notes, but it is not a packet analysis tool.",
      "Calendar tracks dates and events, not network traffic."
    ]
  }
];

function socaiCommand(command, category, keywords, summary, example, note = "Use only in systems, labs, and networks where you have clear permission.") {
  return {
    command,
    title: command,
    category,
    keywords,
    summary,
    example,
    note,
    answer: `${command}: ${summary} Example: ${example}`
  };
}

const socaiKnowledge = [
  socaiCommand("pwd", "Navigation", ["directory", "where am i", "current folder", "path"], "Prints the current working directory so you know exactly where your terminal is.", "pwd"),
  socaiCommand("ls -la", "Navigation", ["list", "files", "hidden", "permissions"], "Lists files, hidden files, owners, sizes, timestamps, and permissions.", "ls -la"),
  socaiCommand("cd", "Navigation", ["change directory", "folder", "move"], "Moves between directories.", "cd /var/log"),
  socaiCommand("tree", "Navigation", ["folders", "directory tree", "structure"], "Shows a visual folder tree for quick project or evidence review.", "tree -L 2"),
  socaiCommand("mkdir", "Files", ["make directory", "folder", "create"], "Creates a new directory.", "mkdir notes"),
  socaiCommand("touch", "Files", ["create file", "timestamp"], "Creates an empty file or updates a file timestamp.", "touch findings.txt"),
  socaiCommand("cp", "Files", ["copy", "duplicate"], "Copies files or folders.", "cp evidence.txt backup-evidence.txt"),
  socaiCommand("mv", "Files", ["move", "rename"], "Moves or renames files and folders.", "mv old-name.txt new-name.txt"),
  socaiCommand("rm", "Files", ["remove", "delete"], "Deletes files or folders.", "rm old-note.txt", "Be careful: deletion can be permanent. Use labs and double-check paths."),
  socaiCommand("cat", "Files", ["print file", "view file"], "Prints a file directly to the terminal.", "cat /etc/os-release"),
  socaiCommand("less", "Files", ["pager", "read file", "large file"], "Views large files one page at a time.", "less /var/log/auth.log"),
  socaiCommand("head", "Files", ["first lines", "top"], "Shows the first lines of a file.", "head -n 20 access.log"),
  socaiCommand("tail", "Files", ["last lines", "follow logs"], "Shows the last lines of a file or follows live log updates.", "tail -f /var/log/auth.log"),
  socaiCommand("nano", "Files", ["editor", "text edit"], "Opens a beginner-friendly terminal text editor.", "nano notes.txt"),
  socaiCommand("vim", "Files", ["editor", "text edit"], "Opens a powerful terminal text editor.", "vim notes.txt"),
  socaiCommand("grep", "Search", ["search text", "filter", "logs"], "Searches text using patterns and is essential for log analysis.", "grep -i \"failed\" /var/log/auth.log"),
  socaiCommand("egrep", "Search", ["extended grep", "regex"], "Runs grep with extended regular expressions.", "egrep \"error|failed|denied\" app.log"),
  socaiCommand("find", "Search", ["find files", "locate", "recursive"], "Searches for files by name, type, size, or time.", "find /var/log -name \"*.log\""),
  socaiCommand("locate", "Search", ["file database", "quick find"], "Finds files quickly from an indexed database.", "locate wordlists"),
  socaiCommand("which", "Search", ["binary path", "program location"], "Shows the path of a command binary.", "which nmap"),
  socaiCommand("whereis", "Search", ["binary", "manual", "source"], "Shows binary, source, and manual locations for a command.", "whereis python3"),
  socaiCommand("history", "Shell", ["command history", "previous commands"], "Shows commands previously run in the shell.", "history | tail"),
  socaiCommand("man", "Help", ["manual", "documentation"], "Opens the manual page for a command.", "man nmap"),
  socaiCommand("apropos", "Help", ["search manual", "help topic"], "Searches manual page descriptions for a topic.", "apropos password"),
  socaiCommand("echo", "Shell", ["print text", "variable"], "Prints text or variable values.", "echo $SHELL"),
  socaiCommand("date", "System", ["time", "timestamp"], "Shows or formats the system date and time.", "date -Is"),
  socaiCommand("whoami", "Identity", ["user", "current user"], "Shows the current username.", "whoami"),
  socaiCommand("id", "Identity", ["uid", "gid", "groups"], "Shows user ID, group ID, and group membership.", "id"),
  socaiCommand("uname -a", "System", ["kernel", "linux version", "architecture"], "Shows kernel and architecture information.", "uname -a"),
  socaiCommand("hostnamectl", "System", ["hostname", "os info"], "Shows host, OS, kernel, and machine details.", "hostnamectl"),
  socaiCommand("env", "Shell", ["environment variables"], "Lists environment variables.", "env"),
  socaiCommand("alias", "Shell", ["shortcut", "shell alias"], "Creates or lists command shortcuts.", "alias ll='ls -la'"),

  socaiCommand("chmod", "Permissions", ["permissions", "executable", "mode"], "Changes file permissions.", "chmod 600 private-key"),
  socaiCommand("chown", "Permissions", ["owner", "ownership"], "Changes file owner or group.", "sudo chown analyst:analyst notes.txt"),
  socaiCommand("sudo", "Permissions", ["admin", "root", "privilege"], "Runs a command with elevated privileges when authorized.", "sudo apt update"),
  socaiCommand("su", "Permissions", ["switch user", "root"], "Switches to another user account.", "su - analyst"),
  socaiCommand("passwd", "Identity", ["password", "change password"], "Changes a local user's password.", "passwd"),
  socaiCommand("useradd", "Identity", ["create user", "account"], "Creates a local user account.", "sudo useradd -m trainee"),
  socaiCommand("usermod", "Identity", ["modify user", "groups"], "Modifies user account settings.", "sudo usermod -aG sudo trainee"),
  socaiCommand("groups", "Identity", ["user groups", "membership"], "Shows group membership for a user.", "groups analyst"),

  socaiCommand("ps aux", "Processes", ["processes", "running programs"], "Lists running processes with owners and CPU/memory use.", "ps aux | grep ssh"),
  socaiCommand("top", "Processes", ["cpu", "memory", "live processes"], "Shows live process and resource usage.", "top"),
  socaiCommand("htop", "Processes", ["interactive top", "resource usage"], "Shows an interactive process monitor when installed.", "htop"),
  socaiCommand("kill", "Processes", ["stop process", "pid"], "Sends a signal to stop or control a process.", "kill 1234"),
  socaiCommand("systemctl", "Services", ["service", "daemon", "start stop"], "Manages systemd services.", "sudo systemctl status ssh"),
  socaiCommand("service", "Services", ["legacy service", "daemon"], "Manages services with the older service interface.", "sudo service ssh status"),
  socaiCommand("journalctl", "Logs", ["system logs", "systemd"], "Reads systemd journal logs.", "journalctl -xe"),
  socaiCommand("crontab", "Scheduling", ["cron", "scheduled task"], "Views or edits scheduled cron jobs.", "crontab -l"),

  socaiCommand("apt update", "Packages", ["package list", "repositories"], "Refreshes package lists from configured repositories.", "sudo apt update"),
  socaiCommand("apt upgrade", "Packages", ["update packages", "patch"], "Upgrades installed packages.", "sudo apt upgrade"),
  socaiCommand("apt install", "Packages", ["install tool", "package"], "Installs a package from repositories.", "sudo apt install nmap"),
  socaiCommand("apt search", "Packages", ["find package", "tool search"], "Searches available packages.", "apt search wireshark"),
  socaiCommand("apt show", "Packages", ["package details"], "Shows package metadata and description.", "apt show nmap"),
  socaiCommand("apt remove", "Packages", ["uninstall", "delete package"], "Removes an installed package.", "sudo apt remove package-name"),
  socaiCommand("dpkg -l", "Packages", ["installed packages", "debian"], "Lists installed Debian packages.", "dpkg -l | grep python"),

  socaiCommand("ip a", "Networking", ["address", "interface", "network"], "Shows network interfaces and IP addresses.", "ip a"),
  socaiCommand("ip route", "Networking", ["gateway", "routing table"], "Shows routing table and default gateway.", "ip route"),
  socaiCommand("ip link", "Networking", ["interface state", "link"], "Shows or changes network link state.", "ip link show"),
  socaiCommand("ss -tulpn", "Networking", ["listening ports", "sockets", "connections"], "Shows listening TCP/UDP sockets and related processes.", "ss -tulpn"),
  socaiCommand("netstat", "Networking", ["connections", "ports"], "Legacy command for network connections and listening ports.", "netstat -tulpn"),
  socaiCommand("ping", "Networking", ["connectivity", "icmp"], "Tests basic network reachability.", "ping -c 4 8.8.8.8"),
  socaiCommand("traceroute", "Networking", ["path", "hops", "route"], "Shows network hops toward a destination.", "traceroute example.com"),
  socaiCommand("curl", "Networking", ["http", "api", "headers"], "Sends web requests and prints responses.", "curl -I https://example.com"),
  socaiCommand("wget", "Networking", ["download", "web file"], "Downloads files from a URL.", "wget https://example.com/file.txt"),
  socaiCommand("dig", "DNS", ["dns", "records", "lookup"], "Queries DNS records.", "dig example.com A"),
  socaiCommand("nslookup", "DNS", ["dns lookup"], "Queries DNS records with a simple interface.", "nslookup example.com"),
  socaiCommand("host", "DNS", ["dns quick lookup"], "Runs quick DNS lookups.", "host example.com"),
  socaiCommand("whois", "OSINT", ["domain registration", "registrar"], "Shows domain registration information when available.", "whois example.com"),
  socaiCommand("arp -a", "Networking", ["arp table", "local devices"], "Shows cached local network MAC/IP mappings.", "arp -a"),
  socaiCommand("nmcli", "Networking", ["network manager", "wifi", "connections"], "Controls NetworkManager connections.", "nmcli device status"),
  socaiCommand("tcpdump", "Packets", ["packet capture", "pcap", "sniff"], "Captures packets from an interface for analysis.", "sudo tcpdump -i eth0 -w lab.pcap"),
  socaiCommand("wireshark", "Packets", ["gui packet analysis", "pcap"], "Opens Wireshark for visual packet capture and analysis.", "wireshark"),
  socaiCommand("tshark", "Packets", ["terminal wireshark", "pcap"], "Uses Wireshark's packet analysis engine from the terminal.", "tshark -r lab.pcap"),
  socaiCommand("nc", "Networking", ["netcat", "banner", "port test"], "Reads and writes data over network connections for testing.", "nc -vz <authorized-host> 22"),
  socaiCommand("ncat", "Networking", ["netcat nmap", "port test"], "Nmap project's improved netcat-style utility.", "ncat -vz <authorized-host> 443"),
  socaiCommand("socat", "Networking", ["relay", "socket", "forward"], "Relays data between sockets, files, or processes.", "socat - TCP:<authorized-host>:80"),
  socaiCommand("ssh", "Remote Access", ["secure shell", "remote login"], "Connects securely to an authorized remote system.", "ssh analyst@<authorized-host>"),
  socaiCommand("scp", "Remote Access", ["secure copy", "transfer"], "Copies files over SSH.", "scp notes.txt analyst@<authorized-host>:/tmp/"),
  socaiCommand("rsync", "Remote Access", ["sync", "backup"], "Synchronizes files locally or over SSH.", "rsync -av notes/ backup/"),

  socaiCommand("nmap", "Scanning", ["scan", "ports", "service enumeration"], "Discovers hosts, ports, and services in authorized networks.", "nmap -sV <authorized-host>"),
  socaiCommand("rustscan", "Scanning", ["fast scan", "ports"], "Runs fast port discovery and can hand results to Nmap.", "rustscan -a <authorized-host>"),
  socaiCommand("masscan", "Scanning", ["internet scale scan", "fast ports"], "Performs very fast port scanning for controlled, approved ranges.", "masscan <authorized-range> -p80,443", "Use only in tightly scoped authorized ranges. High-rate scans can disrupt networks."),
  socaiCommand("enum4linux", "Enumeration", ["smb", "windows", "shares"], "Enumerates SMB information from authorized Windows/Samba hosts.", "enum4linux -a <authorized-host>"),
  socaiCommand("smbclient", "Enumeration", ["smb shares", "windows share"], "Lists or connects to SMB shares.", "smbclient -L //<authorized-host>/"),
  socaiCommand("smbmap", "Enumeration", ["smb permissions", "shares"], "Maps SMB shares and permissions.", "smbmap -H <authorized-host>"),
  socaiCommand("nbtscan", "Enumeration", ["netbios", "windows names"], "Scans for NetBIOS names on a local authorized network.", "nbtscan <authorized-subnet>"),
  socaiCommand("snmpwalk", "Enumeration", ["snmp", "oids"], "Walks SNMP OIDs for authorized devices.", "snmpwalk -v2c -c public <authorized-host>"),

  socaiCommand("nikto", "Web", ["web scan", "http", "server checks"], "Checks web servers for common misconfigurations in authorized labs.", "nikto -h http://<authorized-lab>"),
  socaiCommand("whatweb", "Web", ["fingerprint", "technology"], "Fingerprints website technologies and headers.", "whatweb http://<authorized-lab>"),
  socaiCommand("wafw00f", "Web", ["waf", "firewall detection"], "Attempts to identify whether a web application firewall is present.", "wafw00f http://<authorized-lab>"),
  socaiCommand("gobuster", "Web", ["directories", "dns", "vhost", "wordlist"], "Discovers directories, DNS names, or virtual hosts in authorized web labs.", "gobuster dir -u http://<authorized-lab> -w /usr/share/wordlists/dirb/common.txt"),
  socaiCommand("dirsearch", "Web", ["directories", "content discovery"], "Finds hidden web paths using wordlists.", "dirsearch -u http://<authorized-lab>"),
  socaiCommand("ffuf", "Web", ["fuzz", "directories", "parameters"], "Fuzzes web paths, parameters, or virtual hosts in authorized labs.", "ffuf -u http://<authorized-lab>/FUZZ -w wordlist.txt"),
  socaiCommand("feroxbuster", "Web", ["recursive content discovery"], "Performs fast recursive web content discovery.", "feroxbuster -u http://<authorized-lab>"),
  socaiCommand("sqlmap", "Web", ["sql injection", "database testing"], "Automates SQL injection testing in owned or approved web labs.", "sqlmap -u \"http://<authorized-lab>/item?id=1\" --batch", "Use only on applications you own or have explicit permission to test."),
  socaiCommand("burpsuite", "Web", ["proxy", "intercept", "http"], "Opens Burp Suite for authorized web request inspection and testing.", "burpsuite"),
  socaiCommand("zaproxy", "Web", ["owasp zap", "proxy", "web testing"], "Opens OWASP ZAP for web proxying and scanning in approved labs.", "zaproxy"),
  socaiCommand("searchsploit", "Research", ["exploit db", "cve", "vulnerability research"], "Searches local Exploit-DB references for vulnerability research.", "searchsploit apache 2.4"),

  socaiCommand("iw dev", "Wireless", ["wifi interfaces", "wireless"], "Lists wireless interfaces and capabilities.", "iw dev"),
  socaiCommand("iwconfig", "Wireless", ["wifi config", "legacy wireless"], "Shows legacy wireless interface settings.", "iwconfig"),
  socaiCommand("airmon-ng", "Wireless", ["monitor mode", "wifi lab"], "Manages wireless monitor mode for authorized Wi-Fi labs.", "sudo airmon-ng check"),
  socaiCommand("airodump-ng", "Wireless", ["wifi capture", "monitor"], "Captures Wi-Fi metadata in approved lab environments.", "sudo airodump-ng wlan0mon", "Only use in Wi-Fi labs or networks where you have explicit permission."),
  socaiCommand("aircrack-ng", "Wireless", ["wifi audit", "handshake"], "Audits captured Wi-Fi handshakes in approved password policy labs.", "aircrack-ng capture.cap -w wordlist.txt", "Only audit networks and captures you are allowed to test."),

  socaiCommand("sha256sum", "Forensics", ["hash", "integrity"], "Calculates SHA-256 hashes for integrity checks.", "sha256sum evidence.bin"),
  socaiCommand("md5sum", "Forensics", ["hash", "legacy"], "Calculates MD5 hashes for legacy comparison workflows.", "md5sum file.iso"),
  socaiCommand("file", "Forensics", ["file type", "magic bytes"], "Identifies file type based on contents.", "file suspicious.bin"),
  socaiCommand("strings", "Forensics", ["extract strings", "binary"], "Extracts printable strings from binary files.", "strings suspicious.bin | less"),
  socaiCommand("xxd", "Forensics", ["hex dump", "binary"], "Creates or reverses hex dumps.", "xxd suspicious.bin | head"),
  socaiCommand("hexdump", "Forensics", ["hex view", "binary"], "Displays file bytes in hex formats.", "hexdump -C suspicious.bin | head"),
  socaiCommand("binwalk", "Forensics", ["firmware", "embedded files"], "Analyzes firmware and binaries for embedded content.", "binwalk firmware.bin"),
  socaiCommand("exiftool", "Forensics", ["metadata", "images", "documents"], "Reads and writes file metadata.", "exiftool photo.jpg"),
  socaiCommand("foremost", "Forensics", ["file carving", "recover"], "Carves files from disk images or raw data.", "foremost -i disk.img -o recovered"),
  socaiCommand("bulk_extractor", "Forensics", ["artifacts", "emails", "urls"], "Extracts artifacts like emails, URLs, and credit-card-like patterns from images.", "bulk_extractor -o output disk.img"),
  socaiCommand("volatility3", "Forensics", ["memory", "ram analysis"], "Analyzes memory images for processes, network connections, and artifacts.", "volatility3 -f memory.raw windows.pslist"),
  socaiCommand("steghide", "Forensics", ["steganography", "hidden data"], "Extracts or embeds hidden data in supported media files.", "steghide info image.jpg"),
  socaiCommand("base64", "Encoding", ["decode", "encode"], "Encodes or decodes Base64 data.", "echo SGVsbG8= | base64 -d"),
  socaiCommand("gpg", "Crypto", ["encrypt", "decrypt", "sign"], "Encrypts, decrypts, signs, and verifies data.", "gpg --verify file.sig"),
  socaiCommand("openssl", "Crypto", ["certificates", "tls", "hash"], "Performs crypto, certificate, and TLS inspection tasks.", "openssl s_client -connect example.com:443"),

  socaiCommand("john", "Passwords", ["john the ripper", "hash audit"], "Audits password hashes against wordlists in authorized recovery or policy checks.", "john --wordlist=wordlist.txt hashes.txt", "Only audit hashes you own or are explicitly authorized to test."),
  socaiCommand("hashcat", "Passwords", ["gpu cracking", "hash audit"], "Performs password hash auditing with CPU/GPU acceleration.", "hashcat --help"),
  socaiCommand("hashid", "Passwords", ["identify hash", "hash type"], "Guesses possible hash types from a hash string.", "hashid hashes.txt"),
  socaiCommand("cewl", "Passwords", ["wordlist", "custom words"], "Builds custom wordlists from authorized web content.", "cewl http://<authorized-lab> -w words.txt"),
  socaiCommand("crunch", "Passwords", ["generate wordlist"], "Generates wordlists from character rules.", "crunch 6 8 abc123 -o words.txt"),
  socaiCommand("hydra", "Passwords", ["login audit", "credential testing"], "Tests credentials against authorized services for password policy validation.", "hydra -L users.txt -P lab-passwords.txt ssh://<authorized-lab>", "Only run login tests against systems where you have written permission."),

  socaiCommand("msfconsole", "Frameworks", ["metasploit", "modules", "lab"], "Opens Metasploit Framework for structured authorized security labs.", "msfconsole -q", "Use modules only in isolated labs or approved assessments."),
  socaiCommand("msfvenom", "Frameworks", ["payload generation", "lab payload"], "Generates payloads for controlled lab demonstrations and defensive testing.", "msfvenom --list payloads", "Do not generate or deploy payloads outside authorized labs."),
  socaiCommand("yara", "Detection", ["rules", "malware detection"], "Runs YARA rules against files for detection engineering.", "yara rules.yar sample.bin"),
  socaiCommand("clamscan", "Detection", ["antivirus", "malware scan"], "Scans files with ClamAV signatures if installed.", "clamscan -r downloads/"),

  socaiCommand("last", "Logs", ["login history", "users"], "Shows successful login history.", "last"),
  socaiCommand("lastb", "Logs", ["failed logins", "auth"], "Shows failed login attempts when available.", "sudo lastb"),
  socaiCommand("who", "Identity", ["logged in users"], "Shows who is currently logged in.", "who"),
  socaiCommand("w", "Identity", ["logged in users", "activity"], "Shows logged-in users and what they are doing.", "w"),
  socaiCommand("dmesg", "Logs", ["kernel messages", "hardware"], "Shows kernel ring buffer messages.", "dmesg | tail"),
  socaiCommand("lnav", "Logs", ["log viewer", "timeline"], "Views and searches logs with timeline features when installed.", "lnav /var/log/auth.log"),

  socaiCommand("tar", "Archive", ["compress", "extract", "backup"], "Creates or extracts tar archives.", "tar -czf notes.tar.gz notes/"),
  socaiCommand("zip", "Archive", ["compress", "archive"], "Creates ZIP archives.", "zip -r notes.zip notes/"),
  socaiCommand("unzip", "Archive", ["extract zip"], "Extracts ZIP archives.", "unzip evidence.zip"),
  socaiCommand("7z", "Archive", ["7zip", "extract"], "Creates or extracts many archive formats.", "7z l archive.7z"),
  socaiCommand("mount", "Disk", ["mount filesystem", "image"], "Mounts filesystems or disk images.", "sudo mount /dev/sdb1 /mnt"),
  socaiCommand("df -h", "Disk", ["disk free", "storage"], "Shows filesystem disk usage.", "df -h"),
  socaiCommand("du -sh", "Disk", ["folder size", "disk usage"], "Shows total size of a folder.", "du -sh evidence/"),
  socaiCommand("lsblk", "Disk", ["block devices", "drives"], "Lists block devices and partitions.", "lsblk"),
  socaiCommand("fdisk -l", "Disk", ["partitions", "drives"], "Lists partition tables.", "sudo fdisk -l"),
  socaiCommand("dd", "Disk", ["image disk", "copy bytes"], "Copies bytes from one file/device to another, often for imaging.", "sudo dd if=/dev/sdb of=disk.img bs=4M status=progress", "Be extremely careful with input/output paths. A wrong dd command can destroy data."),

  socaiCommand("python3 -m http.server", "Utility", ["web server", "serve files"], "Starts a simple local web server from the current folder.", "python3 -m http.server 8000"),
  socaiCommand("python3 -m venv", "Utility", ["python environment", "venv"], "Creates an isolated Python environment.", "python3 -m venv .venv"),
  socaiCommand("pipx", "Utility", ["python tools", "install cli"], "Installs Python CLI tools in isolated environments.", "pipx install tool-name"),
  socaiCommand("git", "Development", ["version control", "repo"], "Clones and manages Git repositories.", "git clone https://github.com/example/repo.git"),
  socaiCommand("docker", "Containers", ["container", "lab"], "Runs containers for repeatable local labs when installed.", "docker ps")
];

socaiKnowledge.push(
  socaiCommand("stat", "Files", ["metadata", "file details", "timestamps"], "Shows detailed file metadata such as permissions, size, and timestamps.", "stat evidence.txt"),
  socaiCommand("wc", "Files", ["word count", "line count"], "Counts lines, words, and bytes in files.", "wc -l access.log"),
  socaiCommand("sort", "Text Processing", ["sort lines", "organize"], "Sorts lines of text.", "sort usernames.txt"),
  socaiCommand("uniq", "Text Processing", ["unique lines", "deduplicate"], "Filters repeated adjacent lines, often after sort.", "sort ips.txt | uniq -c"),
  socaiCommand("cut", "Text Processing", ["columns", "fields"], "Extracts columns or character ranges from text.", "cut -d ':' -f 1 /etc/passwd"),
  socaiCommand("awk", "Text Processing", ["parse", "columns", "fields"], "Processes structured text and prints selected fields or calculated results.", "awk '{print $1}' access.log"),
  socaiCommand("sed", "Text Processing", ["stream edit", "replace"], "Edits text streams, commonly for replacement or filtering.", "sed 's/error/ERROR/g' app.log"),
  socaiCommand("tr", "Text Processing", ["translate", "uppercase", "delete"], "Translates or deletes characters from input.", "echo hello | tr 'a-z' 'A-Z'"),
  socaiCommand("tee", "Text Processing", ["save output", "pipe"], "Sends output to the screen and a file at the same time.", "nmap -sV <authorized-host> | tee scan.txt"),
  socaiCommand("diff", "Text Processing", ["compare files", "changes"], "Compares files line by line.", "diff before.txt after.txt"),
  socaiCommand("cmp", "Text Processing", ["compare binary", "files"], "Compares files byte by byte.", "cmp file1.bin file2.bin"),
  socaiCommand("xargs", "Text Processing", ["pipe to command", "arguments"], "Builds command arguments from input streams.", "cat hosts.txt | xargs -n1 ping -c1"),
  socaiCommand("jq", "Data", ["json", "parse", "api"], "Parses, filters, and formats JSON.", "curl -s https://api.example.local | jq '.'"),
  socaiCommand("yq", "Data", ["yaml", "parse"], "Parses and edits YAML data.", "yq '.services' docker-compose.yml"),
  socaiCommand("sqlite3", "Data", ["sqlite", "database"], "Opens and queries SQLite databases.", "sqlite3 app.db '.tables'"),
  socaiCommand("psql", "Data", ["postgres", "database"], "Connects to PostgreSQL databases when authorized.", "psql -h localhost -U analyst -d labdb"),
  socaiCommand("mysql", "Data", ["mysql", "mariadb", "database"], "Connects to MySQL or MariaDB databases when authorized.", "mysql -u analyst -p"),
  socaiCommand("redis-cli", "Data", ["redis", "cache"], "Connects to Redis for approved admin or lab checks.", "redis-cli INFO"),

  socaiCommand("realpath", "Files", ["absolute path", "resolve"], "Prints the absolute resolved path for a file.", "realpath notes.txt"),
  socaiCommand("readlink", "Files", ["symlink", "link target"], "Shows where symbolic links point.", "readlink -f shortcut"),
  socaiCommand("ln -s", "Files", ["symbolic link", "symlink"], "Creates a symbolic link.", "ln -s /opt/labs current-lab"),
  socaiCommand("split", "Files", ["split file", "chunks"], "Splits large files into smaller pieces.", "split -b 10M big.log chunk-"),
  socaiCommand("shred", "Files", ["overwrite", "secure delete"], "Overwrites files before deletion on supported storage.", "shred -u temp-secret.txt", "Use carefully and only on files you are allowed to destroy."),
  socaiCommand("watch", "Shell", ["repeat command", "monitor"], "Runs a command repeatedly and shows changing output.", "watch -n 2 ss -tulpn"),
  socaiCommand("timeout", "Shell", ["limit runtime", "stop command"], "Runs a command with a maximum time limit.", "timeout 10s ping example.com"),
  socaiCommand("jobs", "Shell", ["background jobs", "shell jobs"], "Lists jobs started by the current shell.", "jobs"),
  socaiCommand("bg", "Shell", ["background", "resume job"], "Resumes a stopped shell job in the background.", "bg %1"),
  socaiCommand("fg", "Shell", ["foreground", "resume job"], "Brings a background job to the foreground.", "fg %1"),
  socaiCommand("nohup", "Shell", ["keep running", "disconnect"], "Keeps a command running after the terminal closes.", "nohup long-task.sh &"),
  socaiCommand("tmux", "Shell", ["terminal multiplexer", "sessions"], "Runs persistent terminal sessions and panes.", "tmux new -s soc-lab"),
  socaiCommand("screen", "Shell", ["terminal session", "detach"], "Runs detachable terminal sessions.", "screen -S lab"),

  socaiCommand("lsof", "Processes", ["open files", "ports", "process"], "Lists open files, sockets, and related processes.", "sudo lsof -i :443"),
  socaiCommand("fuser", "Processes", ["process using file", "port owner"], "Shows which processes are using a file or port.", "sudo fuser -v 80/tcp"),
  socaiCommand("strace", "Processes", ["syscalls", "debug"], "Traces system calls made by a process for troubleshooting.", "strace -p 1234"),
  socaiCommand("ltrace", "Processes", ["library calls", "debug"], "Traces dynamic library calls made by a process.", "ltrace ./lab-binary"),
  socaiCommand("uptime", "System", ["load average", "running time"], "Shows how long the system has been running and load averages.", "uptime"),
  socaiCommand("free -h", "System", ["memory", "ram"], "Shows memory usage in human-readable units.", "free -h"),
  socaiCommand("vmstat", "System", ["performance", "memory", "cpu"], "Shows system performance and memory statistics.", "vmstat 2"),
  socaiCommand("iostat", "System", ["disk io", "performance"], "Shows CPU and disk I/O statistics when installed.", "iostat -xz 2"),
  socaiCommand("lscpu", "System", ["cpu info", "hardware"], "Shows CPU architecture and feature details.", "lscpu"),
  socaiCommand("lsusb", "System", ["usb", "devices"], "Lists USB devices.", "lsusb"),
  socaiCommand("lspci", "System", ["pci", "hardware"], "Lists PCI devices.", "lspci"),

  socaiCommand("iptables", "Firewall", ["firewall", "packet filter", "rules"], "Views or manages legacy Linux firewall rules.", "sudo iptables -L -n -v"),
  socaiCommand("nft", "Firewall", ["nftables", "firewall"], "Views or manages nftables firewall rules.", "sudo nft list ruleset"),
  socaiCommand("ufw", "Firewall", ["ubuntu firewall", "allow deny"], "Manages uncomplicated firewall rules on systems using UFW.", "sudo ufw status verbose"),
  socaiCommand("resolvectl", "DNS", ["resolver", "dns status"], "Shows DNS resolver status on systemd-based systems.", "resolvectl status"),
  socaiCommand("tcpflow", "Packets", ["tcp streams", "reconstruct"], "Captures TCP flows and stores stream data for analysis.", "tcpflow -r lab.pcap"),
  socaiCommand("ngrep", "Packets", ["grep packets", "network text"], "Searches packet payloads for text patterns in authorized captures.", "ngrep -I lab.pcap 'password'"),
  socaiCommand("zeek", "Detection", ["network security monitoring", "logs"], "Analyzes packet captures and produces network security logs.", "zeek -r lab.pcap"),
  socaiCommand("suricata", "Detection", ["ids", "network detection"], "Runs IDS/IPS analysis against live traffic or packet captures.", "suricata -r lab.pcap -l output/"),
  socaiCommand("snort", "Detection", ["ids", "rules"], "Runs IDS analysis using Snort rules.", "snort -r lab.pcap -c snort.conf"),

  socaiCommand("dnsrecon", "DNS", ["dns enumeration", "records"], "Enumerates DNS records for authorized domains.", "dnsrecon -d example.com"),
  socaiCommand("dnsenum", "DNS", ["dns enumeration", "zone"], "Enumerates DNS information for approved domains.", "dnsenum example.com"),
  socaiCommand("fierce", "DNS", ["dns discovery", "subdomains"], "Performs DNS reconnaissance for authorized domains.", "fierce --domain example.com"),
  socaiCommand("subfinder", "OSINT", ["subdomains", "passive recon"], "Finds subdomains using passive sources.", "subfinder -d example.com"),
  socaiCommand("amass", "OSINT", ["attack surface", "subdomains"], "Maps external assets and subdomains for authorized programs.", "amass enum -passive -d example.com"),
  socaiCommand("theHarvester", "OSINT", ["emails", "domains", "public sources"], "Collects public OSINT such as emails, hosts, and domains.", "theHarvester -d example.com -b bing"),
  socaiCommand("sslscan", "TLS", ["ssl", "tls", "certificates"], "Checks TLS versions, ciphers, and certificate details.", "sslscan example.com"),
  socaiCommand("testssl.sh", "TLS", ["tls audit", "ssl"], "Audits TLS configuration from the command line.", "testssl.sh https://example.com"),
  socaiCommand("sslyze", "TLS", ["ssl scanner", "certificates"], "Scans TLS settings and certificate behavior.", "sslyze example.com"),

  socaiCommand("httpx", "Web", ["http probe", "status", "title"], "Probes web hosts for status, title, technologies, and redirects.", "httpx -l hosts.txt"),
  socaiCommand("nuclei", "Web", ["templates", "vulnerability checks"], "Runs template-based checks against authorized targets.", "nuclei -u http://<authorized-lab> -t templates/", "Only run approved templates against systems you are allowed to test."),
  socaiCommand("katana", "Web", ["crawler", "links"], "Crawls authorized web applications to discover URLs.", "katana -u http://<authorized-lab>"),
  socaiCommand("gau", "Web", ["archived urls", "wayback"], "Collects known URLs from public archives for authorized domains.", "gau example.com"),
  socaiCommand("waybackurls", "Web", ["wayback machine", "urls"], "Fetches historical URLs from the Wayback Machine for a domain.", "waybackurls example.com"),
  socaiCommand("wpscan", "Web", ["wordpress", "cms"], "Audits WordPress sites you own or are authorized to assess.", "wpscan --url http://<authorized-lab>", "Only use on WordPress sites where you have permission."),
  socaiCommand("joomscan", "Web", ["joomla", "cms"], "Checks Joomla sites in authorized labs.", "joomscan -u http://<authorized-lab>"),
  socaiCommand("commix", "Web", ["command injection testing"], "Tests for command injection in approved web labs.", "commix --url=\"http://<authorized-lab>/page?id=1\"", "Only use in intentionally vulnerable labs or approved assessments."),

  socaiCommand("ldapsearch", "Enumeration", ["ldap", "directory"], "Queries LDAP directories when authorized.", "ldapsearch -x -H ldap://<authorized-host> -b dc=example,dc=local"),
  socaiCommand("rpcclient", "Enumeration", ["smb rpc", "windows"], "Interacts with SMB RPC services for authorized enumeration.", "rpcclient -U '' <authorized-host>"),
  socaiCommand("kerbrute", "Enumeration", ["kerberos", "active directory"], "Tests Kerberos account discovery in approved Active Directory labs.", "kerbrute userenum users.txt -d lab.local --dc <authorized-dc>", "Use only in owned AD labs or explicit assessments."),
  socaiCommand("bloodhound", "Enumeration", ["active directory", "graph"], "Visualizes Active Directory relationships from approved lab data.", "bloodhound"),
  socaiCommand("neo4j", "Services", ["graph database", "bloodhound"], "Starts or manages Neo4j, often used with BloodHound labs.", "sudo systemctl start neo4j"),

  socaiCommand("flameshot", "Documentation", ["screenshot", "notes"], "Captures screenshots for reports and lab notes.", "flameshot gui"),
  socaiCommand("script", "Documentation", ["terminal recording", "transcript"], "Records terminal input/output to a file.", "script lab-session.txt"),
  socaiCommand("asciinema", "Documentation", ["terminal recording", "demo"], "Records terminal sessions for replayable demos when installed.", "asciinema rec lab.cast"),
  socaiCommand("pandoc", "Documentation", ["convert docs", "reports"], "Converts documents between formats such as Markdown and HTML/PDF.", "pandoc report.md -o report.html")
);

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))];
}

function rotateValues(values, seed) {
  if (!values.length) {
    return [];
  }

  const startIndex = seed % values.length;
  return [...values.slice(startIndex), ...values.slice(0, startIndex)];
}

function buildAnswerOptions(correctAnswer, distractors, seed) {
  const uniqueDistractors = uniqueValues(distractors).filter((answer) => answer !== correctAnswer);
  const answers = rotateValues(uniqueDistractors, seed).slice(0, 3);

  while (answers.length < 3) {
    answers.push(["Review the authorized lab scope first", "Document the finding clearly", "Use a read-only check when possible"][answers.length]);
  }

  const insertIndex = seed % 4;
  answers.splice(insertIndex, 0, correctAnswer);
  return {
    answers,
    correct: insertIndex
  };
}

function findSocaiEntryByCommand(command) {
  const normalizedCommand = String(command || "").toLowerCase();
  return socaiKnowledge.find((candidate) => candidate.command.toLowerCase() === normalizedCommand);
}

function findSocaiEntryBySummary(summary) {
  return socaiKnowledge.find((candidate) => candidate.summary === summary);
}

function findSocaiEntryByExample(example) {
  return socaiKnowledge.find((candidate) => candidate.example === example);
}

function createExplainedQuestion(questionData, correctExplanation, wrongExplanationBuilder) {
  return {
    ...questionData,
    explanations: questionData.answers.map((answer, index) => {
      if (index === questionData.correct) {
        return correctExplanation;
      }

      return wrongExplanationBuilder(answer, index);
    })
  };
}

function buildGeneratedKaliQuestion(generatedIndex) {
  const entry = socaiKnowledge[generatedIndex % socaiKnowledge.length];
  const otherEntries = socaiKnowledge.filter((candidate) => candidate.command !== entry.command);
  const templates = [
    () => {
      const options = buildAnswerOptions(entry.command, otherEntries.map((candidate) => candidate.command), generatedIndex);
      return createExplainedQuestion(
        {
          question: `Which command best matches this task: ${entry.summary}`,
          ...options
        },
        `${entry.command} is correct because it directly matches the task: ${entry.summary}`,
        (answer) => {
          const wrongEntry = findSocaiEntryByCommand(answer);
          return wrongEntry
            ? `${answer} is useful for this instead: ${wrongEntry.summary} It does not directly match the task in this question.`
            : `${answer} is a useful analyst habit, but it is not the command that completes this exact task.`;
        }
      );
    },
    () => {
      const options = buildAnswerOptions(entry.summary, otherEntries.map((candidate) => candidate.summary), generatedIndex + 7);
      return createExplainedQuestion(
        {
          question: `What does ${entry.command} do?`,
          ...options
        },
        `${entry.summary} That is why it is the right description for ${entry.command}.`,
        (answer) => {
          const wrongEntry = findSocaiEntryBySummary(answer);
          return wrongEntry
            ? `That description belongs to ${wrongEntry.command}, not ${entry.command}.`
            : `That describes a different workflow, not ${entry.command}.`;
        }
      );
    },
    () => {
      const categories = uniqueValues(socaiKnowledge.map((candidate) => candidate.category));
      const options = buildAnswerOptions(entry.category, categories, generatedIndex + 13);
      return createExplainedQuestion(
        {
          question: `Which SOCAI category does ${entry.command} belong to?`,
          ...options
        },
        `${entry.category} is correct because ${entry.command} is used for: ${entry.summary}`,
        (answer) => `${answer} is a real SOCAI category, but ${entry.command} is grouped under ${entry.category}.`
      );
    },
    () => {
      const options = buildAnswerOptions(entry.example, otherEntries.map((candidate) => candidate.example), generatedIndex + 19);
      return createExplainedQuestion(
        {
          question: `Which example correctly demonstrates ${entry.command}?`,
          ...options
        },
        `${entry.example} is correct because it demonstrates the expected way to use ${entry.command}.`,
        (answer) => {
          const wrongEntry = findSocaiEntryByExample(answer);
          return wrongEntry
            ? `${answer} demonstrates ${wrongEntry.command}, not ${entry.command}.`
            : `${answer} does not demonstrate ${entry.command}; the matching example is ${entry.example}.`;
        }
      );
    },
    () => {
      const keyword = entry.keywords[generatedIndex % entry.keywords.length] || entry.category;
      const options = buildAnswerOptions(entry.command, otherEntries.map((candidate) => candidate.command), generatedIndex + 29);
      return createExplainedQuestion(
        {
          question: `A lab note mentions "${keyword}". Which command should SOCAI suggest first?`,
          ...options
        },
        `${entry.command} is correct because SOCAI connects "${keyword}" with this command's purpose: ${entry.summary}`,
        (answer) => {
          const wrongEntry = findSocaiEntryByCommand(answer);
          return wrongEntry
            ? `${answer} is better for ${wrongEntry.category.toLowerCase()} tasks: ${wrongEntry.summary}`
            : `${answer} is not the strongest SOCAI match for the lab note keyword "${keyword}".`;
        }
      );
    }
  ];

  return templates[generatedIndex % templates.length]();
}

function getEndlessQuizQuestion(questionIndex) {
  if (questionIndex < quizQuestions.length) {
    return quizQuestions[questionIndex];
  }

  return buildGeneratedKaliQuestion(questionIndex - quizQuestions.length);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { practiceExamEngine, adminPracticeExamTools };
}

if (typeof document !== "undefined") {
document.addEventListener("DOMContentLoaded", async () => {
  // Each HTML file declares a data-page value, so this shared script can
  // initialize only the features needed on the current page.
  const page = document.body.dataset.page;
  seedDemoAccounts();
  await hydrateServerSession();

  if (redirectGuestToLogin(page)) {
    return;
  }

  if (redirectUnauthorizedAdmin(page)) {
    return;
  }

  initializeGlobalUi();
  initializeClock();
  showAuthGateNotice();
  showReturningUserToast();

  if (page === "home") {
    initializeHomePage();
  }

  if (page === "login") {
    initializeLoginPage();
  }

  if (page === "certifications") {
    initializeCertificationsPage();
  }

  if (page === "quizzes") {
    initializeQuizzesPage();
  }

  if (page === "kali") {
    initializeKaliPage();
  }

  if (page === "admin") {
    initializeAdminPage();
  }

  if (page === "admin-grades") {
    initializeAdminPracticeGradesPage();
  }

  if (page === "welcome") {
    initializeWelcomePage();
  }

  if (page === "resources") {
    initializeResourcesPage();
  }

  if (page === "tests") {
    initializeTestsPage();
  }
});
}

function initializeGlobalUi() {
  // Shared navigation, mobile sidebar, and feedback toast behavior.
  const currentPage = document.body.dataset.page;
  const navLinks = document.querySelectorAll("[data-nav]");
  const menuToggle = document.getElementById("menuToggle");
  const sidebar = document.getElementById("sidebar");
  const feedbackButton = document.getElementById("feedbackButton");

  updateGlobalAccountUser();
  configureSidebarForRole();
  initializeUtilityButtons();

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

function configureSidebarForRole() {
  const account = getCurrentUserAccount();
  document.querySelectorAll("[data-nav]").forEach((link) => {
    const shouldShow = adminPracticeExamTools.shouldShowSidebarItem(link.dataset.nav, account.role);
    link.classList.toggle("hidden", !shouldShow);
    link.setAttribute("aria-hidden", shouldShow ? "false" : "true");
  });
}

function initializeUtilityButtons() {
  const sidebar = document.getElementById("sidebar");
  const dashboardShell = document.querySelector(".dashboard-shell");
  const hideSidebarButtons = document.querySelectorAll(".hide-sidebar-button");
  hideSidebarButtons.forEach((button) => {
    button.addEventListener("click", () => {
      if (!sidebar || !dashboardShell) {
        return;
      }

      sidebar.classList.toggle("collapsed");
      dashboardShell.classList.toggle("sidebar-collapsed");
      button.setAttribute("aria-label", sidebar.classList.contains("collapsed") ? "Show sidebar" : "Hide sidebar");
    });
  });

  const utilityButtons = document.querySelectorAll(".utility-rail button");
  utilityButtons.forEach((button, index) => {
    button.classList.add("utility-button");
    if (index === 0) {
      button.setAttribute("aria-label", "Toggle sidebar");
      button.title = "Toggle sidebar";
      button.addEventListener("click", () => hideSidebarButtons[0]?.click());
    } else {
      button.setAttribute("aria-label", "Back to top");
      button.title = "Back to top";
      button.addEventListener("click", () => {
        window.scrollTo({ top: 0, behavior: "smooth" });
        showToast("Returned to the top of the dashboard.");
      });
    }
  });

  document.querySelectorAll("[data-reset-local-progress]").forEach((button) => {
    button.addEventListener("click", () => {
      localStorage.removeItem(storageKeys.selectedCertification);
      localStorage.removeItem(storageKeys.lastCertification);
      localStorage.removeItem(storageKeys.selectedPracticeExam);
      localStorage.removeItem(storageKeys.lastPracticeExam);
      showToast("Local dashboard filters reset.");
    });
  });
}

function updateGlobalAccountUser() {
  // Top-left account control: always shows who is signed in and links to login.html.
  const accountUserPill = document.getElementById("accountUserPill");
  const accountUserLabel = document.getElementById("accountUserLabel");
  if (!accountUserPill || !accountUserLabel) {
    return;
  }

  const currentUser = localStorage.getItem(storageKeys.currentUser);
  accountUserPill.classList.remove("signed-in", "admin-limited");

  if (!currentUser) {
    accountUserLabel.textContent = "Guest Account";
    return;
  }

  const account = getCurrentUserAccount();
  accountUserLabel.textContent = `${currentUser} | ${formatRole(account.role)}`;
  accountUserPill.classList.add("signed-in");
  accountUserPill.classList.toggle("admin-limited", account.role === "admin");
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
    const account = getCurrentUserAccount();
    showToast(`Welcome Back, ${currentUser} (${formatRole(account.role)})`);
  }
}

function redirectGuestToLogin(page) {
  // The bootcamp dashboard is locked until a local account is active.
  if (page === "login" || localStorage.getItem(storageKeys.currentUser)) {
    return false;
  }

  localStorage.setItem(storageKeys.authRedirect, getCurrentPageName());
  localStorage.setItem(storageKeys.authNotice, "Create an account or log in before entering SOC Bootcamp.");
  window.location.href = "login.html";
  return true;
}

function redirectUnauthorizedAdmin(page) {
  if (adminPracticeExamTools.canAccessPage(page, getCurrentUserAccount().role)) {
    return false;
  }

  localStorage.setItem(storageKeys.authNotice, "Admin pages are reserved for the admin account.");
  window.location.href = "index.html";
  return true;
}

function showAuthGateNotice() {
  const notice = localStorage.getItem(storageKeys.authNotice);
  if (!notice) {
    return;
  }

  localStorage.removeItem(storageKeys.authNotice);
  showToast(notice);
}

function getCurrentPageName() {
  const pageName = window.location.pathname.split("/").pop();
  return pageName || "index.html";
}

function isServerApiEnabled(path = "") {
  const localHosts = ["localhost", "127.0.0.1", "::1"];
  const isLocalServer = window.location.protocol !== "file:"
    && localHosts.includes(window.location.hostname)
    && window.location.port === "3000";
  const isHostedSite = window.location.protocol === "https:"
    && !localHosts.includes(window.location.hostname);

  if (isLocalServer) {
    return true;
  }

  return isHostedSite && String(path).startsWith("/api/auth/");
}

function getApiBase() {
  return "";
}

function getApiUrl(path) {
  return `${getApiBase()}${path}`;
}

async function hydrateServerSession() {
  if (!isServerApiEnabled("/api/auth/me")) {
    return;
  }

  try {
    const data = await apiFetch("/api/auth/me");
    if (data.user) {
      cacheServerUser(data.user);
    }
  } catch {
    // Browser-only fallback remains available when the Node server is not running.
  }
}

async function apiFetch(path, options = {}) {
  if (!isServerApiEnabled(path)) {
    return { offline: true };
  }

  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  if (serverCsrfToken) {
    headers["x-csrf-token"] = serverCsrfToken;
  }

  const response = await fetch(getApiUrl(path), {
    credentials: "include",
    ...options,
    headers
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Server request failed");
  }
  if (data.csrfToken) {
    serverCsrfToken = data.csrfToken;
  }
  return data;
}

function cacheServerUser(user) {
  if (!user) {
    return;
  }

  const accounts = getStoredObject(storageKeys.accounts, {});
  const accountKey = user.email || user.displayName;
  accounts[accountKey] = {
    password: "",
    role: user.role,
    email: user.email,
    displayName: user.displayName,
    provider: user.providers?.google ? "google" : "email",
    profileImage: user.profileImage || "",
    serverId: user.id
  };
  localStorage.setItem(storageKeys.accounts, JSON.stringify(accounts));
  localStorage.setItem(storageKeys.currentUser, accountKey);
  initializeUserProgress(accountKey);
}

function initializeHomePage() {
  const accountStatus = document.getElementById("homeAccountStatus");
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
      updateGlobalAccountUser();
      window.location.href = "login.html";
    });
  }

  function updateHomeAccountStatus() {
    const currentUser = localStorage.getItem(storageKeys.currentUser);
    if (!accountText || !homeLoginButton || !homeLogoutButton) {
      return;
    }

    if (currentUser) {
      const account = getCurrentUserAccount();
      const roleText = formatRole(account.role);
      accountText.textContent = `Welcome, ${currentUser} (${roleText})`;
      homeLoginButton.textContent = "Account Page";
      homeLogoutButton.classList.remove("hidden");
      if (accountStatus) {
        accountStatus.classList.toggle("admin-limited", account.role === "admin");
      }
    } else {
      accountText.textContent = "Guest analyst mode";
      homeLoginButton.textContent = "Login / Create Account";
      homeLogoutButton.classList.add("hidden");
      if (accountStatus) {
        accountStatus.classList.remove("admin-limited");
      }
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
  const usernameInputLabel = document.getElementById("usernameInputLabel");
  const usernameInput = document.getElementById("usernameInput");
  const passwordInput = document.getElementById("passwordInput");
  const emailField = document.getElementById("emailField");
  const emailInput = document.getElementById("emailInput");
  const roleSelect = document.getElementById("roleSelect");
  const rolePicker = document.getElementById("rolePicker");
  const roleHelpText = document.getElementById("roleHelpText");
  const usernameError = document.getElementById("usernameError");
  const passwordError = document.getElementById("passwordError");
  const emailError = document.getElementById("emailError");
  const welcomeState = document.getElementById("welcomeState");
  const welcomeMessage = document.getElementById("welcomeMessage");
  const logoutButton = document.getElementById("logoutButton");
  const demoLoginButtons = document.querySelectorAll(".demo-login-button");
  const accountGatedActions = document.getElementById("accountGatedActions");
  const lockedActionNote = document.getElementById("lockedActionNote");
  const oauthPanel = document.getElementById("oauthPanel");
  const googleEmailInput = document.getElementById("googleEmailInput");
  const googleSignupButton = document.getElementById("googleSignupButton");
  const googleSignupError = document.getElementById("googleSignupError");
  const mfaPanel = document.getElementById("mfaPanel");
  const mfaMessage = document.getElementById("mfaMessage");
  const mfaDemoCode = document.getElementById("mfaDemoCode");
  const mfaCodeInput = document.getElementById("mfaCodeInput");
  const mfaError = document.getElementById("mfaError");
  const verifyMfaButton = document.getElementById("verifyMfaButton");
  const cancelMfaButton = document.getElementById("cancelMfaButton");
  const resetEmailInput = document.getElementById("resetEmailInput");
  const resetPasswordInput = document.getElementById("resetPasswordInput");
  const resetCodeInput = document.getElementById("resetCodeInput");
  const resetDemoCode = document.getElementById("resetDemoCode");
  const resetError = document.getElementById("resetError");
  const sendResetCodeButton = document.getElementById("sendResetCodeButton");
  const confirmResetButton = document.getElementById("confirmResetButton");
  let authMode = "login";
  let serverMfaChallengeId = "";
  let serverResetChallengeId = "";

  if (!authForm) {
    return;
  }

  setAuthMode(localStorage.getItem(storageKeys.currentUser) ? "login" : "create");
  updateAuthVisibility();
  updateAdminScoreOverview();
  hydrateServerMfaFromQuery();

  loginTab.addEventListener("click", () => setAuthMode("login"));
  createTab.addEventListener("click", () => setAuthMode("create"));

  usernameInput.addEventListener("input", validateAuthFields);
  passwordInput.addEventListener("input", validateAuthFields);
  if (emailInput) {
    emailInput.addEventListener("input", validateAuthFields);
  }
  if (roleSelect) {
    roleSelect.addEventListener("change", () => {
      updateRoleHelpText();
      validateAuthFields();
    });
  }

  demoLoginButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setAuthMode("login");
      const account = demoAccounts[button.dataset.demoUser];
      usernameInput.value = button.dataset.demoUser;
      passwordInput.value = account.password;
      if (emailInput) {
        emailInput.value = account.email;
      }
      showToast(`${formatRole(account.role)} demo credentials loaded.`);
      validateAuthFields();
    });
  });

  if (verifyMfaButton) {
    verifyMfaButton.addEventListener("click", verifyMfaChallenge);
  }

  if (cancelMfaButton) {
    cancelMfaButton.addEventListener("click", () => {
      localStorage.removeItem(storageKeys.mfaChallenge);
      hideMfaPanel();
      showToast("MFA challenge cancelled.");
    });
  }

  if (sendResetCodeButton) {
    sendResetCodeButton.addEventListener("click", sendPasswordResetCode);
  }

  if (confirmResetButton) {
    confirmResetButton.addEventListener("click", confirmPasswordReset);
  }

  if (googleSignupButton) {
    googleSignupButton.addEventListener("click", handleGoogleSignup);
  }

  authForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const isValid = validateAuthFields();
    if (!isValid) {
      return;
    }

    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    const email = emailInput ? emailInput.value.trim().toLowerCase() : "";
    const selectedRole = roleSelect ? roleSelect.value : "student";
    const accounts = getStoredObject(storageKeys.accounts, {});

    if (await submitServerAuth({ authMode, username, password, email, selectedRole })) {
      return;
    }

    if (authMode === "create") {
      if (selectedRole === "admin") {
        if (username !== RESERVED_ADMIN_USERNAME || password !== RESERVED_ADMIN_PASSWORD) {
          usernameError.textContent = "The only Admin username is admin.";
          passwordError.textContent = "Use the reserved Admin password to activate this account.";
          return;
        }

        accounts[RESERVED_ADMIN_USERNAME] = {
          password: RESERVED_ADMIN_PASSWORD,
          role: "admin",
          email: email || demoAccounts[RESERVED_ADMIN_USERNAME].email,
          displayName: "Admin"
        };
        localStorage.setItem(storageKeys.accounts, JSON.stringify(accounts));
        beginMfaChallenge(RESERVED_ADMIN_USERNAME, "Admin account active. Enter the email MFA code to continue.");
        return;
      }

      if (username === RESERVED_ADMIN_USERNAME) {
        usernameError.textContent = "admin is reserved for the one Admin account.";
        return;
      }

      if (accounts[username]) {
        usernameError.textContent = "That username already exists. Try logging in.";
        return;
      }

      if (findAccountByEmail(email)) {
        emailError.textContent = "That email is already attached to an account.";
        return;
      }

      accounts[username] = {
        password,
        role: "student",
        email,
        displayName: username
      };
      localStorage.setItem(storageKeys.accounts, JSON.stringify(accounts));
      initializeUserProgress(username);
      beginMfaChallenge(username, "Account created. Enter the email MFA code to unlock SOC Bootcamp.");
      return;
    }

    if (!accounts[username] || accounts[username].password !== password) {
      passwordError.textContent = "Username or password is incorrect.";
      return;
    }

    if (!accounts[username].role) {
      accounts[username].role = "student";
      localStorage.setItem(storageKeys.accounts, JSON.stringify(accounts));
    }

    beginMfaChallenge(username, `Welcome, ${username}. Enter the email MFA code to continue.`);
  });

  logoutButton.addEventListener("click", async () => {
    try {
      await apiFetch("/api/auth/logout", { method: "POST", body: "{}" });
    } catch {
      // Static fallback logout continues below.
    }
    localStorage.removeItem(storageKeys.currentUser);
    showToast("Logged out.");
    updateAuthVisibility();
    updateAdminScoreOverview();
    updateGlobalAccountUser();
    setAuthMode("create");
  });

  function setAuthMode(mode) {
    authMode = mode;
    authTitle.textContent = mode === "login" ? "Login" : "Create Account";
    authSubmitButton.textContent = mode === "login" ? "Login" : "Create Account";
    if (usernameInputLabel) {
      usernameInputLabel.textContent = mode === "login" ? "Email Address or Admin ID" : "Display Name";
    }
    if (usernameInput) {
      usernameInput.placeholder = mode === "login" ? "student@socbootcamp.local" : "SOC Analyst";
    }
    loginTab.classList.toggle("active", mode === "login");
    createTab.classList.toggle("active", mode === "create");
    if (rolePicker) {
      rolePicker.classList.toggle("hidden", mode === "login");
    }
    if (emailField) {
      emailField.classList.toggle("hidden", mode === "login");
    }
    hideMfaPanel();
    updateRoleHelpText();
    clearAuthErrors();
  }

  function validateAuthFields() {
    clearAuthErrors();
    let isValid = true;
    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    const email = emailInput ? emailInput.value.trim() : "";

    if (username.length < 3) {
      usernameError.textContent = "Username must be at least 3 characters.";
      isValid = false;
    }

    if (authMode === "create" && password.length < 8) {
      passwordError.textContent = "New passwords must be at least 8 characters.";
      isValid = false;
    }

    if (authMode === "create" && !isValidEmail(email)) {
      emailError.textContent = "Enter a valid email address for reset and MFA.";
      isValid = false;
    }

    return isValid;
  }

  function updateRoleHelpText() {
    if (!roleHelpText || !roleSelect) {
      return;
    }

    if (authMode !== "create") {
      roleHelpText.textContent = "Select Create Account to choose Student or the reserved Admin type.";
      return;
    }

    if (roleSelect.value === "admin") {
      roleHelpText.innerHTML = `Admin is one account only: <strong>${RESERVED_ADMIN_USERNAME}</strong> / <strong>${RESERVED_ADMIN_PASSWORD}</strong>.`;
      return;
    }

    roleHelpText.textContent = "Student accounts can be created with any available username.";
  }

  function clearAuthErrors() {
    usernameError.textContent = "";
    passwordError.textContent = "";
    if (emailError) {
      emailError.textContent = "";
    }
  }

  async function submitServerAuth({ authMode, username, password, email, selectedRole }) {
    if (!isServerApiEnabled(authMode === "create" ? "/api/auth/signup" : "/api/auth/login")) {
      return false;
    }

    const isCreate = authMode === "create";
    const primaryEmail = isCreate ? email : normalizeLoginIdentifier(username);
    const displayName = isCreate ? username : "";

    if (!isCreate && !primaryEmail) {
      return false;
    }

    try {
      const data = await apiFetch(isCreate ? "/api/auth/signup" : "/api/auth/login", {
        method: "POST",
        body: JSON.stringify(isCreate ? {
          email: primaryEmail,
          password,
          displayName,
          role: selectedRole
        } : {
          email: primaryEmail,
          password
        })
      });
      showServerMfaChallenge(data, isCreate ? "Account created. Check your email MFA code." : "Login accepted. Check your email MFA code.");
      return true;
    } catch (error) {
      if (error.message === "Failed to fetch") {
        return false;
      }
      passwordError.textContent = error.message;
      return true;
    }
  }

  function normalizeLoginIdentifier(value) {
    const identifier = String(value || "").trim();
    if (identifier.toLowerCase() === RESERVED_ADMIN_USERNAME) {
      return RESERVED_ADMIN_EMAIL;
    }
    return identifier.toLowerCase();
  }

  function updateAuthVisibility() {
    const currentUser = localStorage.getItem(storageKeys.currentUser);
    if (currentUser) {
      const account = getCurrentUserAccount();
      authForm.classList.add("hidden");
      if (oauthPanel) {
        oauthPanel.classList.add("hidden");
      }
      welcomeState.classList.remove("hidden");
      welcomeMessage.textContent = `Welcome, ${currentUser} (${formatRole(account.role)})`;
      if (accountGatedActions) {
        accountGatedActions.classList.remove("hidden");
      }
      if (lockedActionNote) {
        lockedActionNote.classList.add("hidden");
      }
    } else {
      authForm.classList.remove("hidden");
      if (oauthPanel) {
        oauthPanel.classList.remove("hidden");
      }
      welcomeState.classList.add("hidden");
      if (accountGatedActions) {
        accountGatedActions.classList.add("hidden");
      }
      if (lockedActionNote) {
        lockedActionNote.classList.remove("hidden");
      }
    }
  }

  function showServerMfaChallenge(data, message) {
    serverMfaChallengeId = data.challengeId || "";
    localStorage.removeItem(storageKeys.mfaChallenge);
    authForm.classList.add("hidden");
    if (oauthPanel) {
      oauthPanel.classList.add("hidden");
    }
    welcomeState.classList.add("hidden");
    if (mfaPanel) {
      mfaPanel.classList.remove("hidden");
    }
    if (mfaMessage) {
      mfaMessage.textContent = `${message} Email target: ${data.email || "account email"}.`;
    }
    if (mfaDemoCode) {
      mfaDemoCode.textContent = data.devCode ? `Development email code: ${data.devCode}` : "MFA code sent by email.";
    }
    if (mfaCodeInput) {
      mfaCodeInput.value = "";
      mfaCodeInput.focus();
    }
  }

  function hydrateServerMfaFromQuery() {
    const params = new URLSearchParams(window.location.search);
    const authError = params.get("authError");
    if (authError) {
      const missing = params.get("missing");
      const reason = params.get("reason");
      const message = authError === "google_not_configured"
        ? `Google OAuth is not configured yet. Missing: ${missing || "Google environment variables"}.`
        : `Google OAuth could not finish.${reason ? ` Reason: ${reason}` : " Check the OAuth settings and try again."}`;
      if (googleSignupError) {
        googleSignupError.textContent = message;
      }
      showToast(message);
    }

    const challengeId = params.get("serverMfa");
    if (!challengeId) {
      return;
    }
    showServerMfaChallenge({
      challengeId,
      email: params.get("email") || ""
    }, params.get("oauth") === "google" ? "Google login accepted. Check your email MFA code." : "Check your email MFA code.");
  }

  function beginMfaChallenge(username, message) {
    const accounts = getStoredObject(storageKeys.accounts, {});
    const account = accounts[username];
    const code = generateVerificationCode();
    const expiresAt = new Date(Date.now() + MFA_CODE_TTL_MS).toISOString();
    const challenge = {
      username,
      code,
      email: account.email || demoAccounts[username]?.email || "demo@socbootcamp.local",
      createdAt: new Date().toISOString(),
      expiresAt
    };

    localStorage.setItem(storageKeys.mfaChallenge, JSON.stringify(challenge));
    authForm.classList.add("hidden");
    welcomeState.classList.add("hidden");
    if (mfaPanel) {
      mfaPanel.classList.remove("hidden");
    }
    if (mfaMessage) {
      mfaMessage.textContent = `${message} Demo email target: ${challenge.email}`;
    }
    if (mfaDemoCode) {
      mfaDemoCode.textContent = `Demo email code: ${code} (expires in 5 minutes)`;
    }
    if (mfaCodeInput) {
      mfaCodeInput.value = "";
      mfaCodeInput.focus();
    }
    showToast(`MFA code generated for ${challenge.email}.`);
  }

  async function verifyMfaChallenge() {
    if (serverMfaChallengeId && isServerApiEnabled("/api/auth/mfa/verify")) {
      try {
        const data = await apiFetch("/api/auth/mfa/verify", {
          method: "POST",
          body: JSON.stringify({
            challengeId: serverMfaChallengeId,
            code: mfaCodeInput.value.trim()
          })
        });
        cacheServerUser(data.user);
        showToast("MFA verified.");
        window.location.href = data.redirect || "index.html";
      } catch (error) {
        mfaError.textContent = error.message;
      }
      return;
    }

    if (serverMfaChallengeId && !isServerApiEnabled("/api/auth/mfa/verify")) {
      serverMfaChallengeId = "";
    }

    const challenge = getStoredObject(storageKeys.mfaChallenge, null);
    if (!challenge) {
      mfaError.textContent = "No MFA challenge is active.";
      return;
    }

    if (isChallengeExpired(challenge)) {
      localStorage.removeItem(storageKeys.mfaChallenge);
      mfaError.textContent = "MFA code expired. Log in again to generate a new code.";
      return;
    }

    if (!mfaCodeInput || mfaCodeInput.value.trim() !== challenge.code) {
      mfaError.textContent = "MFA code does not match the demo email code.";
      return;
    }

    localStorage.removeItem(storageKeys.mfaChallenge);
    hideMfaPanel();
    finishSuccessfulAuth(challenge.username, `MFA verified. Welcome, ${challenge.username}`);
  }

  function hideMfaPanel() {
    if (mfaPanel) {
      mfaPanel.classList.add("hidden");
    }
    if (mfaError) {
      mfaError.textContent = "";
    }
    serverMfaChallengeId = "";
  }

  async function sendPasswordResetCode() {
    if (!resetEmailInput || !resetPasswordInput || !resetCodeInput) {
      return;
    }

    resetError.textContent = "";
    const email = resetEmailInput.value.trim().toLowerCase();
    const newPassword = resetPasswordInput.value;
    if (isServerApiEnabled("/api/auth/password-reset/request")) {
      try {
        const data = await apiFetch("/api/auth/password-reset/request", {
          method: "POST",
          body: JSON.stringify({ email, newPassword })
        });
        serverResetChallengeId = data.challengeId || "";
        resetCodeInput.value = "";
        resetDemoCode.textContent = data.devCode ? `Development reset email code: ${data.devCode}` : "Reset code sent by email.";
        showToast("Password reset email sent.");
        return;
      } catch (error) {
        if (error.message !== "Failed to fetch") {
          resetError.textContent = error.message;
          return;
        }
      }
    }

    const foundAccount = findAccountByEmail(email);

    if (!isValidEmail(email)) {
      resetError.textContent = "Enter the account email address.";
      return;
    }

    if (!foundAccount) {
      resetError.textContent = "No account was found with that email.";
      return;
    }

    if (newPassword.length < 8) {
      resetError.textContent = "New password must be at least 8 characters.";
      return;
    }

    const code = generateVerificationCode();
    localStorage.setItem(storageKeys.resetChallenge, JSON.stringify({
      username: foundAccount.username,
      email,
      newPassword,
      code,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + RESET_CODE_TTL_MS).toISOString()
    }));
    resetCodeInput.value = "";
    resetDemoCode.textContent = `Demo reset email code: ${code} (expires in 10 minutes)`;
    showToast(`Password reset code generated for ${email}.`);
  }

  async function confirmPasswordReset() {
    if (serverResetChallengeId && isServerApiEnabled("/api/auth/password-reset/confirm")) {
      try {
        await apiFetch("/api/auth/password-reset/confirm", {
          method: "POST",
          body: JSON.stringify({
            challengeId: serverResetChallengeId,
            email: resetEmailInput.value.trim().toLowerCase(),
            code: resetCodeInput.value.trim(),
            newPassword: resetPasswordInput.value
          })
        });
        serverResetChallengeId = "";
        resetDemoCode.textContent = "";
        resetEmailInput.value = "";
        resetPasswordInput.value = "";
        resetCodeInput.value = "";
        showToast("Password reset complete. Log in with the new password.");
        setAuthMode("login");
      } catch (error) {
        resetError.textContent = error.message;
      }
      return;
    }

    if (serverResetChallengeId && !isServerApiEnabled("/api/auth/password-reset/confirm")) {
      serverResetChallengeId = "";
    }

    const challenge = getStoredObject(storageKeys.resetChallenge, null);
    if (!challenge) {
      resetError.textContent = "Send a reset code first.";
      return;
    }

    if (isChallengeExpired(challenge)) {
      localStorage.removeItem(storageKeys.resetChallenge);
      resetError.textContent = "Reset code expired. Send a new reset code.";
      return;
    }

    if (!resetCodeInput || resetCodeInput.value.trim() !== challenge.code) {
      resetError.textContent = "Reset code does not match the demo email code.";
      return;
    }

    const accounts = getStoredObject(storageKeys.accounts, {});
    if (!accounts[challenge.username]) {
      resetError.textContent = "Account no longer exists.";
      return;
    }

    accounts[challenge.username].password = challenge.newPassword;
    localStorage.setItem(storageKeys.accounts, JSON.stringify(accounts));
    localStorage.removeItem(storageKeys.resetChallenge);
    resetDemoCode.textContent = "";
    resetEmailInput.value = "";
    resetPasswordInput.value = "";
    resetCodeInput.value = "";
    showToast("Password reset complete. Log in with the new password.");
    setAuthMode("login");
  }

  function handleGoogleSignup() {
    if (isServerApiEnabled("/api/auth/google/start")) {
      window.location.href = getApiUrl("/api/auth/google/start");
      return;
    }

    if (!googleEmailInput || !googleSignupError) {
      return;
    }

    googleSignupError.textContent = "";
    const email = googleEmailInput.value.trim().toLowerCase();
    if (!isValidEmail(email)) {
      googleSignupError.textContent = "Enter a valid Google email address.";
      return;
    }

    const accounts = getStoredObject(storageKeys.accounts, {});
    const existingAccount = findAccountByEmail(email);
    const username = existingAccount ? existingAccount.username : createUsernameFromEmail(email);

    if (!existingAccount) {
      accounts[username] = {
        password: `google:${generateVerificationCode()}`,
        role: "student",
        email,
        displayName: username,
        provider: "google-demo"
      };
      localStorage.setItem(storageKeys.accounts, JSON.stringify(accounts));
      initializeUserProgress(username);
    }

    beginMfaChallenge(username, "Google OAuth demo sign-up accepted. Enter the email MFA code to continue.");
  }

  function finishSuccessfulAuth(username, message) {
    const redirectTarget = localStorage.getItem(storageKeys.authRedirect);
    localStorage.setItem(storageKeys.currentUser, username);
    showToast(message);
    updateAuthVisibility();
    updateAdminScoreOverview();
    updateGlobalAccountUser();
    authForm.reset();

    const account = getCurrentUserAccount();
    const adminRedirectBlocked = redirectTarget && ["admin.html", "admin-practice-grades.html"].includes(redirectTarget) && account.role !== "admin";
    const roleTarget = account.role === "admin"
      ? "admin.html"
      : (redirectTarget && !adminRedirectBlocked ? redirectTarget : "welcome.html");

    if (redirectTarget) {
      localStorage.removeItem(storageKeys.authRedirect);
    }

    setTimeout(() => {
      window.location.href = roleTarget;
    }, 700);
  }
}

function seedDemoAccounts() {
  const accounts = getStoredObject(storageKeys.accounts, {});
  let changed = false;

  if (accounts.Akhter44) {
    delete accounts.Akhter44;
    changed = true;
  }

  if (localStorage.getItem(storageKeys.currentUser) === "Akhter44") {
    localStorage.removeItem(storageKeys.currentUser);
    changed = true;
  }

  Object.keys(accounts).forEach((username) => {
    const isReservedAdmin = username === RESERVED_ADMIN_USERNAME;
    if (!isReservedAdmin && accounts[username].role === "admin") {
      accounts[username].role = "student";
      changed = true;
    }
  });

  Object.keys(demoAccounts).forEach((username) => {
    const demoAccount = demoAccounts[username];
    const isReservedAdmin = username === RESERVED_ADMIN_USERNAME;
    if (!accounts[username]) {
      accounts[username] = {
        password: demoAccount.password,
        role: demoAccount.role,
        email: demoAccount.email,
        displayName: demoAccount.displayName
      };
      changed = true;
      return;
    }

    if (isReservedAdmin && (accounts[username].password !== demoAccount.password || accounts[username].role !== "admin")) {
      accounts[username].password = demoAccount.password;
      accounts[username].role = "admin";
      changed = true;
    }

    if (!accounts[username].email) {
      accounts[username].email = demoAccount.email;
      changed = true;
    }

    if (!accounts[username].displayName) {
      accounts[username].displayName = demoAccount.displayName;
      changed = true;
    }
  });

  if (changed) {
    localStorage.setItem(storageKeys.accounts, JSON.stringify(accounts));
  }

  Object.keys(demoAccounts).forEach((username) => initializeUserProgress(username));
}

function activateDemoAccount(username) {
  seedDemoAccounts();
  if (!demoAccounts[username]) {
    return;
  }

  localStorage.setItem(storageKeys.currentUser, username);
  showToast(`${formatRole(demoAccounts[username].role)} account active.`);
}

function getCurrentUserAccount() {
  const currentUser = localStorage.getItem(storageKeys.currentUser);
  const accounts = getStoredObject(storageKeys.accounts, {});
  return accounts[currentUser] || { role: "student" };
}

function formatRole(role) {
  if (role === "admin") {
    return "Admin - Limited";
  }

  return "Student";
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function generateVerificationCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function isChallengeExpired(challenge) {
  return !challenge.expiresAt || Date.now() > new Date(challenge.expiresAt).getTime();
}

function createUsernameFromEmail(email) {
  const accounts = getStoredObject(storageKeys.accounts, {});
  const baseName = email.split("@")[0].replace(/[^a-z0-9]/gi, "").slice(0, 18) || "googleuser";
  let username = baseName;
  let suffix = 1;
  while (accounts[username]) {
    username = `${baseName}${suffix}`;
    suffix += 1;
  }
  return username;
}

function findAccountByEmail(email) {
  const accounts = getStoredObject(storageKeys.accounts, {});
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const username = Object.keys(accounts).find((accountName) => {
    return String(accounts[accountName].email || "").toLowerCase() === normalizedEmail;
  });

  return username ? { username, account: accounts[username] } : null;
}

function initializeUserProgress(username) {
  if (!username) {
    return;
  }

  const progressStore = getStoredObject(storageKeys.userProgress, {});
  if (!progressStore[username]) {
    progressStore[username] = createEmptyProgress();
    localStorage.setItem(storageKeys.userProgress, JSON.stringify(progressStore));
  }
}

function createEmptyProgress() {
  return {
    selectedCertification: "",
    selectedPracticeExam: "",
    certifications: {},
    practiceExamScore: "",
    practiceExamAttempts: [],
    quizAttempts: [],
    updatedAt: ""
  };
}

function getUserProgress(username) {
  const progressStore = getStoredObject(storageKeys.userProgress, {});
  if (!progressStore[username]) {
    progressStore[username] = createEmptyProgress();
    localStorage.setItem(storageKeys.userProgress, JSON.stringify(progressStore));
  }

  return progressStore[username];
}

function saveUserProgress(username, progress) {
  const progressStore = getStoredObject(storageKeys.userProgress, {});
  progress.updatedAt = new Date().toISOString();
  progressStore[username] = progress;
  localStorage.setItem(storageKeys.userProgress, JSON.stringify(progressStore));
}

function getCurrentUsername() {
  return localStorage.getItem(storageKeys.currentUser);
}

function getCurrentUserProgress() {
  const username = getCurrentUsername();
  return username ? getUserProgress(username) : createEmptyProgress();
}

function saveCurrentUserProgress(progress) {
  const username = getCurrentUsername();
  if (username) {
    saveUserProgress(username, progress);
  }
}

function upsertCertificationProgress(username, certificationName, updates) {
  if (!username || !certificationName) {
    return;
  }

  const progress = getUserProgress(username);
  const existingRecord = progress.certifications[certificationName] || {};
  progress.certifications[certificationName] = {
    status: "Studying",
    prepScore: "",
    questionBankScore: "",
    practiceExamScore: "",
    ...existingRecord,
    ...updates,
    updatedAt: new Date().toISOString()
  };
  progress.selectedCertification = certificationName;
  saveUserProgress(username, progress);
}

function saveQuizAttemptForCurrentUser(attempt) {
  const username = getCurrentUsername();
  if (!username) {
    return;
  }

  const progress = getUserProgress(username);
  const savedAttempt = {
    ...attempt,
    id: attempt.id || `practice-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    userId: username,
    timestamp: new Date().toISOString(),
    completedAt: new Date().toISOString()
  };
  progress.quizAttempts = [savedAttempt, ...(progress.quizAttempts || [])].slice(0, 20);
  saveUserProgress(username, progress);

  if (attempt.certification && certificationCatalog.includes(attempt.certification)) {
    upsertCertificationProgress(username, attempt.certification, {
      prepScore: String(attempt.percent),
      status: attempt.percent >= 80 ? "Exam Ready" : "Studying"
    });
  }

  apiFetch("/api/progress/quiz-attempt", {
    method: "POST",
    body: JSON.stringify(savedAttempt)
  }).catch(() => {});
}

function savePracticeExamAttemptForCurrentUser(attempt) {
  const username = getCurrentUsername();
  if (!username) {
    return;
  }

  const progress = getUserProgress(username);
  const savedAttempt = {
    ...attempt,
    userId: username,
    timestamp: new Date().toISOString(),
    completedAt: new Date().toISOString()
  };

  progress.practiceExamAttempts = [savedAttempt, ...(progress.practiceExamAttempts || [])].slice(0, 20);
  progress.practiceExamScore = String(attempt.percent);
  progress.selectedPracticeExam = attempt.title;
  saveUserProgress(username, progress);

  localStorage.setItem(storageKeys.practiceExamScore, String(attempt.percent));
  localStorage.setItem(storageKeys.selectedPracticeExam, attempt.title);
  localStorage.setItem(storageKeys.lastPracticeExam, JSON.stringify({
    name: attempt.title,
    savedAt: savedAttempt.completedAt,
    score: attempt.percent
  }));

  if (attempt.certification && certificationCatalog.includes(attempt.certification)) {
    upsertCertificationProgress(username, attempt.certification, {
      practiceExamScore: String(attempt.percent),
      status: attempt.percent >= 80 ? "Practice Exam Passed" : "Studying"
    });
  }

  apiFetch("/api/progress/selection", {
    method: "POST",
    body: JSON.stringify({
      certification: attempt.certification,
      practiceExam: attempt.title,
      practiceExamScore: attempt.percent
    })
  }).catch(() => {});

  apiFetch("/api/progress/practice-exam-attempt", {
    method: "POST",
    body: JSON.stringify(savedAttempt)
  }).catch(() => {});
}

function updateAdminScoreOverview() {
  const overview = document.getElementById("adminScoreOverview");
  if (!overview) {
    return;
  }

  const account = getCurrentUserAccount();
  const isAdmin = account.role === "admin";
  overview.classList.toggle("hidden", !isAdmin);
  if (!isAdmin) {
    return;
  }

  const certificationScore = localStorage.getItem(storageKeys.certificationPrepScore);
  const practiceExamScore = localStorage.getItem(storageKeys.practiceExamScore);
  const questionBankScore = localStorage.getItem(storageKeys.questionBankScore);
  const kaliQuizScore = localStorage.getItem(storageKeys.kaliQuizScore);
  const selectedCertification = localStorage.getItem(storageKeys.selectedCertification);
  const selectedPracticeExam = localStorage.getItem(storageKeys.selectedPracticeExam);

  setText("adminCertificationScore", formatScore(certificationScore));
  setText("adminPracticeExamScore", formatScore(practiceExamScore));
  setText("adminQuestionBankScore", formatScore(questionBankScore));
  setText("adminKaliQuizScore", kaliQuizScore || "Not saved");
  setText("adminSelectedCertification", selectedCertification || "No certification selected");
  setText("adminSelectedPracticeExam", selectedPracticeExam || "No practice exam selected");
  setText("adminOverallScore", calculateOverallScore([
    certificationScore,
    practiceExamScore,
    questionBankScore,
    extractPercent(kaliQuizScore)
  ]));
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
  const certificationScoreInput = document.getElementById("certificationScoreInput");
  const questionBankScoreInput = document.getElementById("questionBankScoreInput");
  const saveScoreCheckpointButton = document.getElementById("saveScoreCheckpointButton");
  const practiceExamScoreInput = document.getElementById("practiceExamScoreInput");
  const savePracticeExamScoreButton = document.getElementById("savePracticeExamScoreButton");
  const practiceExamRunner = document.getElementById("practiceExamRunner");
  const examRunnerTitle = document.getElementById("examRunnerTitle");
  const examRunnerMeta = document.getElementById("examRunnerMeta");
  const examRunnerTimer = document.getElementById("examRunnerTimer");
  const examRunnerLockStatus = document.getElementById("examRunnerLockStatus");
  const examRunnerBody = document.getElementById("examRunnerBody");
  const examRunnerBackButton = document.getElementById("examRunnerBackButton");
  const examRunnerNextButton = document.getElementById("examRunnerNextButton");
  const examRunnerReviewButton = document.getElementById("examRunnerReviewButton");
  const examRunnerSubmitButton = document.getElementById("examRunnerSubmitButton");
  const examRunnerExitButton = document.getElementById("examRunnerExitButton");
  let activePracticeExam = null;
  let activePracticeExamQuestions = [];
  let activePracticeExamSelections = [];
  let activePracticeExamFlags = [];
  let activePracticeExamIndex = 0;
  let practiceExamStartedAt = null;
  let practiceExamRemainingSeconds = 0;
  let practiceExamTimerId = null;
  let practiceExamViolations = [];
  let practiceExamFinished = false;
  let lastPracticeExamViolation = "";
  let pendingPracticeMatchOption = "";
  let practiceExamScratchNotes = "";
  let practiceExamScratchDrawing = "";

  updateCertificationStatus();
  updatePracticeExamStatus();
  hydrateScoreInputs();

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
        const cardCategories = (card.dataset.category || "").split(" ");
        const shouldShow = filter === "all" || cardCategories.includes(filter);
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
      launchFullPracticeExam(card.dataset.examId);
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
        launchFullPracticeExam(savedCard.dataset.examId);
      } else {
        showToast(`Resuming ${savedExam}`);
      }
    });
  }

  if (examRunnerNextButton) {
    examRunnerNextButton.addEventListener("click", () => movePracticeExamForward());
  }

  if (examRunnerBackButton) {
    examRunnerBackButton.addEventListener("click", () => movePracticeExamBackward());
  }

  if (examRunnerReviewButton) {
    examRunnerReviewButton.addEventListener("click", () => renderPracticeExamReviewPage());
  }

  if (examRunnerSubmitButton) {
    examRunnerSubmitButton.addEventListener("click", () => {
      if (activePracticeExam && window.confirm("Submit this practice exam now? You will not be able to change answers after final submission.")) {
        finishPracticeExam("Submitted by student");
      }
    });
  }

  if (examRunnerExitButton) {
    examRunnerExitButton.addEventListener("click", () => {
      if (practiceExamFinished) {
        closePracticeExamRunner();
        return;
      }

      if (activePracticeExam && window.confirm("Exit and submit your current progress?")) {
        addPracticeExamViolation("Student exited before finishing");
        finishPracticeExam("Exited early");
      }
    });
  }

  if (saveScoreCheckpointButton) {
    saveScoreCheckpointButton.addEventListener("click", () => {
      const certSaved = saveScoreFromInput(certificationScoreInput, storageKeys.certificationPrepScore);
      const questionBankSaved = saveScoreFromInput(questionBankScoreInput, storageKeys.questionBankScore);
      if (certSaved || questionBankSaved) {
        showToast("Score checkpoint saved for Admin overview.");
      }
    });
  }

  if (savePracticeExamScoreButton) {
    savePracticeExamScoreButton.addEventListener("click", () => {
      if (saveScoreFromInput(practiceExamScoreInput, storageKeys.practiceExamScore)) {
        showToast("Practice exam score saved for Admin overview.");
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
    upsertCertificationProgress(getCurrentUsername(), certificationName, { status: "Studying" });
    apiFetch("/api/progress/selection", {
      method: "POST",
      body: JSON.stringify({ certification: certificationName })
    }).catch(() => {});
    showToast("Progress Saved");
  }

  function updateCertificationStatus() {
    const progress = getCurrentUserProgress();
    const selectedCertification = progress.selectedCertification || localStorage.getItem(storageKeys.selectedCertification);
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
    const progress = getCurrentUserProgress();
    progress.selectedPracticeExam = examName;
    saveCurrentUserProgress(progress);
    apiFetch("/api/progress/selection", {
      method: "POST",
      body: JSON.stringify({ practiceExam: examName })
    }).catch(() => {});
    showToast("Practice exam saved.");
  }

  function updatePracticeExamStatus() {
    const progress = getCurrentUserProgress();
    const selectedExam = progress.selectedPracticeExam || localStorage.getItem(storageKeys.selectedPracticeExam);
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

  function hydrateScoreInputs() {
    if (certificationScoreInput) {
      certificationScoreInput.value = getCurrentUserScoreByStorageKey(storageKeys.certificationPrepScore) || localStorage.getItem(storageKeys.certificationPrepScore) || "";
    }

    if (questionBankScoreInput) {
      questionBankScoreInput.value = getCurrentUserScoreByStorageKey(storageKeys.questionBankScore) || localStorage.getItem(storageKeys.questionBankScore) || "";
    }

    if (practiceExamScoreInput) {
      practiceExamScoreInput.value = getCurrentUserScoreByStorageKey(storageKeys.practiceExamScore) || localStorage.getItem(storageKeys.practiceExamScore) || "";
    }
  }

  function launchFullPracticeExam(examId) {
    const username = getCurrentUsername();
    if (!username) {
      showToast("Create an account or log in before starting a locked practice exam.");
      return;
    }

    const exam = fullLengthPracticeExams.find((candidate) => candidate.id === examId);
    if (!exam) {
      showToast("Practice exam not found.");
      return;
    }

    const questionPool = Array.isArray(exam.questionBank) ? exam.questionBank : [];
    if (!questionPool.length) {
      showToast("This exam is ready, but its question document has not been added yet.");
      return;
    }

    activePracticeExam = exam;
    activePracticeExamQuestions = createPracticeExamQuestionSet(questionPool);
    activePracticeExamSelections = new Array(activePracticeExamQuestions.length).fill(null);
    activePracticeExamFlags = new Array(activePracticeExamQuestions.length).fill(false);
    activePracticeExamIndex = 0;
    practiceExamStartedAt = new Date();
    practiceExamRemainingSeconds = exam.minutes * 60;
    practiceExamViolations = [];
    practiceExamFinished = false;
    lastPracticeExamViolation = "";
    pendingPracticeMatchOption = "";
    practiceExamScratchNotes = "";
    practiceExamScratchDrawing = "";

    savePracticeExam(exam.title);
    updatePracticeExamStatus();
    renderPracticeExamQuestion();
    startPracticeExamTimer();
    installPracticeExamLockdown();

    if (practiceExamRunner) {
      practiceExamRunner.classList.remove("hidden");
      practiceExamRunner.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    requestPracticeExamFullscreen();
    showToast(`${exam.title} started. Lockdown mode is active.`);
  }

  function createPracticeExamQuestionSet(questionPool) {
    const order = shufflePracticeExamValues(questionPool.map((_, index) => index));
    return order.map((originalIndex) => randomizePracticeExamAnswers(questionPool[originalIndex], originalIndex));
  }

  function randomizePracticeExamAnswers(question, originalIndex) {
    if (question.type === "dropdown") {
      return {
        ...question,
        originalIndex,
        prompts: question.prompts.map((prompt) => ({
          ...prompt,
          options: shufflePracticeExamValues(prompt.options)
        }))
      };
    }

    if (question.type === "matching") {
      return {
        ...question,
        originalIndex,
        pairs: [...question.pairs],
        options: shufflePracticeExamValues(question.options)
      };
    }

    if (question.type === "multi-select") {
      let answerOrder = shufflePracticeExamValues(question.answers.map((_, index) => index));
      const originalOrder = question.answers.map((_, index) => index);

      if (answerOrder.length > 1 && practiceExamArraysMatch(answerOrder, originalOrder)) {
        answerOrder = [...answerOrder.slice(1), answerOrder[0]];
      }

      return {
        ...question,
        originalIndex,
        originalAnswers: [...question.answers],
        originalCorrect: [...question.correct],
        answers: answerOrder.map((answerIndex) => question.answers[answerIndex]),
        correct: answerOrder.reduce((selectedIndexes, originalAnswerIndex, newIndex) => {
          if (question.correct.includes(originalAnswerIndex)) {
            selectedIndexes.push(newIndex);
          }
          return selectedIndexes;
        }, [])
      };
    }

    let answerOrder = shufflePracticeExamValues(question.answers.map((_, index) => index));
    const originalOrder = question.answers.map((_, index) => index);

    if (answerOrder.length > 1 && practiceExamArraysMatch(answerOrder, originalOrder)) {
      answerOrder = [...answerOrder.slice(1), answerOrder[0]];
    }

    return {
      ...question,
      originalIndex,
      originalAnswers: [...question.answers],
      originalCorrect: question.correct,
      answers: answerOrder.map((answerIndex) => question.answers[answerIndex]),
      correct: answerOrder.indexOf(question.correct)
    };
  }

  function shufflePracticeExamValues(values) {
    const shuffled = [...values];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }
    return shuffled;
  }

  function practiceExamArraysMatch(first, second) {
    return Array.isArray(first)
      && Array.isArray(second)
      && first.length === second.length
      && first.every((value, index) => value === second[index]);
  }

  function renderPracticeExamQuestion() {
    if (!activePracticeExam || !examRunnerBody) {
      return;
    }

    const question = activePracticeExamQuestions[activePracticeExamIndex];
    const selectedAnswer = activePracticeExamSelections[activePracticeExamIndex];
    const answeredCount = activePracticeExamSelections.filter((answer, index) => {
      return isPracticeExamQuestionAnswered(activePracticeExamQuestions[index], answer);
    }).length;

    if (examRunnerTitle) {
      examRunnerTitle.textContent = activePracticeExam.title;
    }

    if (examRunnerMeta) {
      examRunnerMeta.textContent = `${activePracticeExam.certification} | ${activePracticeExam.minutes} minute limit | ${activePracticeExamQuestions.length} questions | ${activePracticeExam.bankStatus}`;
    }

    updatePracticeExamTimerDisplay();
    updatePracticeExamLockStatus();

    examRunnerBody.innerHTML = `
      <div class="exam-progress-strip">
        <span>Question ${activePracticeExamIndex + 1} of ${activePracticeExamQuestions.length}</span>
        <span>${answeredCount}/${activePracticeExamQuestions.length} answered</span>
        <span>${activePracticeExamFlags[activePracticeExamIndex] ? "Flagged for review" : "Not flagged"}</span>
      </div>
      <div class="exam-question-tools">
        <button class="flag-question-button ${activePracticeExamFlags[activePracticeExamIndex] ? "flagged" : ""}" id="practiceExamFlagButton" type="button">
          ${activePracticeExamFlags[activePracticeExamIndex] ? "Unflag Question" : "Flag Question"}
        </button>
      </div>
      <p class="question-title">${escapePracticeExamHtml(question.question)}</p>
      ${renderPracticeExamAnswerControl(question, selectedAnswer)}
      ${renderPracticeExamScratchpad()}
      <div class="lockdown-warning">
        <strong>Lockdown active.</strong>
        <p>Do not switch tabs, leave fullscreen, copy/paste, print, right-click, or use browser shortcuts. Violations are saved with the attempt.</p>
      </div>
    `;

    bindPracticeExamQuestionControls(question);
    bindPracticeExamQuestionTools();
    initializePracticeExamScratchpad();

    if (examRunnerBackButton) {
      examRunnerBackButton.classList.remove("hidden");
      examRunnerBackButton.disabled = activePracticeExamIndex === 0;
    }

    if (examRunnerNextButton) {
      examRunnerNextButton.classList.toggle("hidden", activePracticeExamIndex === activePracticeExamQuestions.length - 1);
    }

    if (examRunnerReviewButton) {
      examRunnerReviewButton.classList.toggle("hidden", activePracticeExamIndex !== activePracticeExamQuestions.length - 1);
    }

    if (examRunnerSubmitButton) {
      examRunnerSubmitButton.classList.add("hidden");
      examRunnerSubmitButton.textContent = "Submit Exam";
    }

    if (examRunnerExitButton) {
      examRunnerExitButton.classList.remove("hidden");
      examRunnerExitButton.textContent = "Exit Exam";
    }
  }

  function renderPracticeExamAnswerControl(question, selectedAnswer) {
    if (question.type === "dropdown") {
      const selectedValues = selectedAnswer && Array.isArray(selectedAnswer.values) ? selectedAnswer.values : [];
      return `
        <div class="dropdown-question-set">
          ${question.prompts.map((prompt, index) => `
            <label class="dropdown-question-row">
              <span>${escapePracticeExamHtml(prompt.label)}</span>
              <select data-dropdown-index="${index}">
                <option value="">Select answer</option>
                ${prompt.options.map((option) => `
                  <option value="${escapePracticeExamHtml(option)}" ${selectedValues[index] === option ? "selected" : ""}>${escapePracticeExamHtml(option)}</option>
                `).join("")}
              </select>
            </label>
          `).join("")}
        </div>
      `;
    }

    if (question.type === "matching") {
      const matches = selectedAnswer && selectedAnswer.matches ? selectedAnswer.matches : {};
      const usedOptions = new Set(Object.values(matches).filter(Boolean));
      const availableOptions = question.options.filter((option) => !usedOptions.has(option));
      return `
        <div class="matching-question-board">
          <div>
            <p class="panel-note">Answer choices</p>
            <div class="matching-option-bank">
              ${availableOptions.map((option) => `
                <button class="match-chip" type="button" draggable="true" data-match-option="${escapePracticeExamHtml(option)}">${escapePracticeExamHtml(option)}</button>
              `).join("") || `<span class="helper-line">All choices placed. Tap a placed choice to move it.</span>`}
            </div>
          </div>
          <div class="matching-drop-list">
            ${question.pairs.map((pair, index) => `
              <div class="matching-drop-row">
                <span>${escapePracticeExamHtml(pair.prompt)}</span>
                <button class="matching-drop-zone ${matches[index] ? "filled" : ""}" type="button" data-match-index="${index}">
                  ${matches[index] ? escapePracticeExamHtml(matches[index]) : "Drop answer here"}
                </button>
              </div>
            `).join("")}
          </div>
        </div>
        <p class="helper-line">Drag each answer box to the correct target. Tap a placed answer to remove it.</p>
      `;
    }

    if (question.type === "multi-select") {
      const selectedIndexes = selectedAnswer && Array.isArray(selectedAnswer.values) ? selectedAnswer.values : [];
      const requiredCount = question.requiredSelections || question.correct.length;
      return `
        <div class="multi-select-note">Select exactly ${requiredCount} answer${requiredCount === 1 ? "" : "s"}.</div>
        <div class="multi-answer-grid">
          ${question.answers.map((answer, index) => `
            <button class="multi-answer-button ${selectedIndexes.includes(index) ? "selected" : ""}" type="button" data-multi-answer="${index}">
              <span class="multi-check">${selectedIndexes.includes(index) ? "&#10003;" : ""}</span>
              <span>${escapePracticeExamHtml(answer)}</span>
            </button>
          `).join("")}
        </div>
      `;
    }

    return `
      <div class="answer-grid">
        ${question.answers.map((answer, index) => `
          <button class="answer-button ${selectedAnswer === index ? "selected" : ""}" type="button" data-answer="${index}">
            ${escapePracticeExamHtml(answer)}
          </button>
        `).join("")}
      </div>
    `;
  }

  function renderPracticeExamScratchpad() {
    return `
      <section class="exam-scratchpad" aria-label="Exam scratchpad">
        <div class="scratchpad-heading">
          <div>
            <p class="panel-note">Scratchpad</p>
            <h3>Notepad and Work Area</h3>
          </div>
          <span class="helper-line">Not graded</span>
        </div>
        <div class="scratchpad-grid">
          <label class="scratchpad-notes">
            Notes
            <textarea id="practiceExamNotes" rows="7" placeholder="Type notes, formulas, reminders, or elimination work here.">${escapePracticeExamHtml(practiceExamScratchNotes)}</textarea>
          </label>
          <div class="scratchpad-canvas-wrap">
            <span>Draw work</span>
            <canvas id="practiceExamScratchCanvas" width="720" height="220" aria-label="Scratch drawing canvas"></canvas>
            <div class="scratchpad-actions">
              <button class="secondary-button compact-button" id="clearPracticeExamCanvas" type="button">Clear Drawing</button>
              <button class="secondary-button compact-button" id="clearPracticeExamNotes" type="button">Clear Notes</button>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  function bindPracticeExamQuestionTools() {
    const flagButton = document.getElementById("practiceExamFlagButton");
    if (flagButton) {
      flagButton.addEventListener("click", () => {
        activePracticeExamFlags = practiceExamEngine.toggleFlag(activePracticeExamFlags, activePracticeExamIndex);
        renderPracticeExamQuestion();
      });
    }
  }

  function initializePracticeExamScratchpad() {
    const notes = document.getElementById("practiceExamNotes");
    const clearNotesButton = document.getElementById("clearPracticeExamNotes");
    const canvas = document.getElementById("practiceExamScratchCanvas");
    const clearCanvasButton = document.getElementById("clearPracticeExamCanvas");

    if (notes) {
      notes.addEventListener("input", () => {
        practiceExamScratchNotes = notes.value;
      });
    }

    if (clearNotesButton && notes) {
      clearNotesButton.addEventListener("click", () => {
        practiceExamScratchNotes = "";
        notes.value = "";
      });
    }

    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    context.lineWidth = 3;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#a855f7";

    if (practiceExamScratchDrawing) {
      const image = new Image();
      image.onload = () => {
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
      };
      image.src = practiceExamScratchDrawing;
    }

    let drawing = false;

    const getCanvasPoint = (event) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: (event.clientX - rect.left) * (canvas.width / rect.width),
        y: (event.clientY - rect.top) * (canvas.height / rect.height)
      };
    };

    const saveCanvasDrawing = () => {
      practiceExamScratchDrawing = canvas.toDataURL("image/png");
    };

    canvas.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      drawing = true;
      canvas.setPointerCapture(event.pointerId);
      const point = getCanvasPoint(event);
      context.beginPath();
      context.moveTo(point.x, point.y);
    });

    canvas.addEventListener("pointermove", (event) => {
      if (!drawing) {
        return;
      }

      event.preventDefault();
      const point = getCanvasPoint(event);
      context.lineTo(point.x, point.y);
      context.stroke();
    });

    ["pointerup", "pointerleave", "pointercancel"].forEach((eventName) => {
      canvas.addEventListener(eventName, (event) => {
        if (!drawing) {
          return;
        }

        drawing = false;
        try {
          canvas.releasePointerCapture(event.pointerId);
        } catch (error) {
          // Some browsers release pointer capture automatically on cancel.
        }
        saveCanvasDrawing();
      });
    });

    if (clearCanvasButton) {
      clearCanvasButton.addEventListener("click", () => {
        context.clearRect(0, 0, canvas.width, canvas.height);
        practiceExamScratchDrawing = "";
      });
    }
  }

  function bindPracticeExamQuestionControls(question) {
    if (question.type === "dropdown") {
      examRunnerBody.querySelectorAll("[data-dropdown-index]").forEach((select) => {
        select.addEventListener("change", () => {
          const selection = activePracticeExamSelections[activePracticeExamIndex] || { type: "dropdown", values: [] };
          selection.values[Number(select.dataset.dropdownIndex)] = select.value;
          activePracticeExamSelections[activePracticeExamIndex] = selection;
          renderPracticeExamQuestion();
        });
      });
      return;
    }

    if (question.type === "matching") {
      examRunnerBody.querySelectorAll(".match-chip").forEach((chip) => {
        chip.addEventListener("dragstart", (event) => {
          event.dataTransfer.setData("text/plain", chip.dataset.matchOption);
        });
        chip.addEventListener("click", () => {
          pendingPracticeMatchOption = chip.dataset.matchOption;
          examRunnerBody.querySelectorAll(".match-chip").forEach((button) => button.classList.remove("pending"));
          chip.classList.add("pending");
          showToast("Now tap the target row for that answer.");
        });
      });

      examRunnerBody.querySelectorAll(".matching-drop-zone").forEach((zone) => {
        zone.addEventListener("dragover", (event) => {
          event.preventDefault();
          zone.classList.add("drag-over");
        });
        zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
        zone.addEventListener("drop", (event) => {
          event.preventDefault();
          zone.classList.remove("drag-over");
          assignPracticeExamMatch(Number(zone.dataset.matchIndex), event.dataTransfer.getData("text/plain"));
        });
        zone.addEventListener("click", () => {
          const matchIndex = Number(zone.dataset.matchIndex);
          const selection = activePracticeExamSelections[activePracticeExamIndex];
          if (selection && selection.matches && selection.matches[matchIndex]) {
            removePracticeExamMatch(matchIndex);
            return;
          }

          if (pendingPracticeMatchOption) {
            assignPracticeExamMatch(matchIndex, pendingPracticeMatchOption);
            pendingPracticeMatchOption = "";
          }
        });
      });
      return;
    }

    if (question.type === "multi-select") {
      examRunnerBody.querySelectorAll("[data-multi-answer]").forEach((button) => {
        button.addEventListener("click", () => {
          const answerIndex = Number(button.dataset.multiAnswer);
          const requiredCount = question.requiredSelections || question.correct.length;
          const selection = activePracticeExamSelections[activePracticeExamIndex] || { type: "multi-select", values: [] };
          const selectedSet = new Set(selection.values || []);

          if (selectedSet.has(answerIndex)) {
            selectedSet.delete(answerIndex);
          } else if (selectedSet.size < requiredCount) {
            selectedSet.add(answerIndex);
          } else {
            showToast(`Select exactly ${requiredCount} answer${requiredCount === 1 ? "" : "s"}.`);
          }

          activePracticeExamSelections[activePracticeExamIndex] = {
            type: "multi-select",
            values: [...selectedSet].sort((first, second) => first - second)
          };
          renderPracticeExamQuestion();
        });
      });
      return;
    }

    examRunnerBody.querySelectorAll(".answer-button").forEach((button) => {
      button.addEventListener("click", () => {
        activePracticeExamSelections[activePracticeExamIndex] = Number(button.dataset.answer);
        renderPracticeExamQuestion();
      });
    });
  }

  function assignPracticeExamMatch(matchIndex, option) {
    if (!option) {
      return;
    }

    const selection = activePracticeExamSelections[activePracticeExamIndex] || { type: "matching", matches: {} };
    Object.keys(selection.matches).forEach((key) => {
      if (selection.matches[key] === option) {
        delete selection.matches[key];
      }
    });
    selection.matches[matchIndex] = option;
    activePracticeExamSelections[activePracticeExamIndex] = selection;
    renderPracticeExamQuestion();
  }

  function removePracticeExamMatch(matchIndex) {
    const selection = activePracticeExamSelections[activePracticeExamIndex];
    if (!selection || !selection.matches || !selection.matches[matchIndex]) {
      return;
    }

    delete selection.matches[matchIndex];
    activePracticeExamSelections[activePracticeExamIndex] = selection;
    renderPracticeExamQuestion();
  }

  function movePracticeExamForward() {
    if (!activePracticeExam) {
      return;
    }

    if (activePracticeExamIndex < activePracticeExamQuestions.length - 1) {
      activePracticeExamIndex = practiceExamEngine.getNextIndex(activePracticeExamIndex, activePracticeExamQuestions.length);
      renderPracticeExamQuestion();
      return;
    }

    renderPracticeExamReviewPage();
  }

  function movePracticeExamBackward() {
    if (!activePracticeExam) {
      return;
    }

    const previousIndex = practiceExamEngine.getPreviousIndex(activePracticeExamIndex);
    if (previousIndex === activePracticeExamIndex) {
      showToast("You are already on question 1.");
      return;
    }

    activePracticeExamIndex = previousIndex;
    renderPracticeExamQuestion();
  }

  function goToPracticeExamQuestion(questionIndex) {
    if (!activePracticeExam || questionIndex < 0 || questionIndex >= activePracticeExamQuestions.length) {
      return;
    }

    activePracticeExamIndex = questionIndex;
    renderPracticeExamQuestion();
  }

  function renderPracticeExamReviewPage() {
    if (!activePracticeExam || !examRunnerBody) {
      return;
    }

    const reviewItems = practiceExamEngine.buildReviewItems(
      activePracticeExamQuestions,
      activePracticeExamSelections,
      activePracticeExamFlags,
      activePracticeExamIndex
    );
    const answeredCount = reviewItems.filter((item) => item.isAnswered).length;
    const incompleteCount = reviewItems.filter((item) => item.isIncomplete).length;
    const unansweredCount = reviewItems.filter((item) => item.isUnanswered).length;
    const flaggedCount = reviewItems.filter((item) => item.isFlagged).length;

    if (examRunnerTitle) {
      examRunnerTitle.textContent = `${activePracticeExam.title} Review`;
    }

    if (examRunnerMeta) {
      examRunnerMeta.textContent = `${activePracticeExam.certification} | Review flagged and unanswered questions before final submission.`;
    }

    updatePracticeExamTimerDisplay();
    updatePracticeExamLockStatus();

    examRunnerBody.innerHTML = `
      <div class="practice-review-shell">
        <div class="review-summary-card">
          <span class="category-chip">End-of-exam review</span>
          <h3>${answeredCount}/${activePracticeExamQuestions.length} answered</h3>
          <p>${unansweredCount} question${unansweredCount === 1 ? "" : "s"} need answer${unansweredCount === 1 ? "" : "s"}, ${incompleteCount} incomplete, ${flaggedCount} manually flagged. Click any question number to return to it.</p>
        </div>
        <div class="review-question-grid" aria-label="Exam question review">
          ${reviewItems.map((item) => `
            <button class="review-question-button ${item.isCurrent ? "current" : ""} ${item.isFlagged ? "flagged" : ""} ${item.answerState}" type="button" data-review-question="${item.index}">
              <span>Question ${item.number}</span>
              <small>
                <span class="review-status-badge answer-status ${item.answerState}">${formatPracticeExamReviewAnswerState(item.answerState)}</span>
                ${item.isFlagged ? `<span class="review-status-badge manual-flag">Manual flag</span>` : ""}
              </small>
            </button>
          `).join("")}
        </div>
        ${renderPracticeExamScratchpad()}
        <div class="lockdown-warning">
          <strong>Final submission is next.</strong>
          <p>Review pages do not reveal answers. Your scratchpad is available here, but it is not included in grading.</p>
        </div>
      </div>
    `;

    examRunnerBody.querySelectorAll("[data-review-question]").forEach((button) => {
      button.addEventListener("click", () => {
        goToPracticeExamQuestion(Number(button.dataset.reviewQuestion));
      });
    });
    initializePracticeExamScratchpad();

    if (examRunnerBackButton) {
      examRunnerBackButton.classList.remove("hidden");
      examRunnerBackButton.disabled = activePracticeExamIndex === 0;
    }

    if (examRunnerNextButton) {
      examRunnerNextButton.classList.add("hidden");
    }

    if (examRunnerReviewButton) {
      examRunnerReviewButton.classList.add("hidden");
    }

    if (examRunnerSubmitButton) {
      examRunnerSubmitButton.classList.remove("hidden");
      examRunnerSubmitButton.textContent = "Submit Final Exam";
    }

    if (examRunnerExitButton) {
      examRunnerExitButton.classList.remove("hidden");
      examRunnerExitButton.textContent = "Exit Exam";
    }
  }

  function isPracticeExamQuestionAnswered(question, selection) {
    return practiceExamEngine.isQuestionAnswered(question, selection);
  }

  function formatPracticeExamReviewAnswerState(answerState) {
    if (answerState === "answered") {
      return "Answered";
    }

    if (answerState === "incomplete") {
      return "Incomplete";
    }

    return "Needs answer";
  }

  function startPracticeExamTimer() {
    window.clearInterval(practiceExamTimerId);
    practiceExamTimerId = window.setInterval(() => {
      practiceExamRemainingSeconds -= 1;
      updatePracticeExamTimerDisplay();

      if (practiceExamRemainingSeconds <= 0) {
        finishPracticeExam("Time expired");
      }
    }, 1000);
  }

  function updatePracticeExamTimerDisplay() {
    if (!examRunnerTimer) {
      return;
    }

    const safeSeconds = Math.max(0, practiceExamRemainingSeconds);
    const minutes = Math.floor(safeSeconds / 60);
    const seconds = safeSeconds % 60;
    examRunnerTimer.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    examRunnerTimer.classList.toggle("danger", safeSeconds <= 300);
  }

  function requestPracticeExamFullscreen() {
    if (!practiceExamEngine.shouldRequestFullscreen({
      activeExam: Boolean(activePracticeExam),
      finished: practiceExamFinished,
      hasRequestFullscreen: Boolean(practiceExamRunner && practiceExamRunner.requestFullscreen)
    })) {
      addPracticeExamViolation("Fullscreen API unavailable");
      return;
    }

    practiceExamRunner.requestFullscreen().catch(() => {
      addPracticeExamViolation("Fullscreen request was blocked or dismissed");
      showToast("Fullscreen was not allowed. The attempt will be flagged.");
    });
  }

  function installPracticeExamLockdown() {
    document.addEventListener("visibilitychange", handlePracticeExamVisibilityChange);
    document.addEventListener("fullscreenchange", handlePracticeExamFullscreenChange);
    document.addEventListener("contextmenu", blockPracticeExamBrowserAction);
    document.addEventListener("copy", blockPracticeExamBrowserAction);
    document.addEventListener("cut", blockPracticeExamBrowserAction);
    document.addEventListener("paste", blockPracticeExamBrowserAction);
    document.addEventListener("keydown", handlePracticeExamKeydown, true);
    window.addEventListener("blur", handlePracticeExamWindowBlur);
    window.addEventListener("beforeunload", handlePracticeExamBeforeUnload);
    window.addEventListener("beforeprint", handlePracticeExamBeforePrint);
  }

  function removePracticeExamLockdown() {
    document.removeEventListener("visibilitychange", handlePracticeExamVisibilityChange);
    document.removeEventListener("fullscreenchange", handlePracticeExamFullscreenChange);
    document.removeEventListener("contextmenu", blockPracticeExamBrowserAction);
    document.removeEventListener("copy", blockPracticeExamBrowserAction);
    document.removeEventListener("cut", blockPracticeExamBrowserAction);
    document.removeEventListener("paste", blockPracticeExamBrowserAction);
    document.removeEventListener("keydown", handlePracticeExamKeydown, true);
    window.removeEventListener("blur", handlePracticeExamWindowBlur);
    window.removeEventListener("beforeunload", handlePracticeExamBeforeUnload);
    window.removeEventListener("beforeprint", handlePracticeExamBeforePrint);
  }

  function handlePracticeExamVisibilityChange() {
    if (document.hidden) {
      addPracticeExamViolation("Browser tab or window was hidden");
    }
  }

  function handlePracticeExamFullscreenChange() {
    if (activePracticeExam && !practiceExamFinished && !document.fullscreenElement) {
      addPracticeExamViolation("Exited fullscreen mode");
      showToast("Fullscreen exit logged as a lockdown violation.");
    }
  }

  function handlePracticeExamWindowBlur() {
    addPracticeExamViolation("Browser focus was lost");
  }

  function handlePracticeExamBeforeUnload(event) {
    if (!activePracticeExam || practiceExamFinished) {
      return;
    }

    event.preventDefault();
    event.returnValue = "";
  }

  function handlePracticeExamBeforePrint(event) {
    blockPracticeExamBrowserAction(event, "Print attempt blocked");
  }

  function blockPracticeExamBrowserAction(event, reason = "Blocked browser action attempted") {
    if (!activePracticeExam || practiceExamFinished) {
      return;
    }

    event.preventDefault();
    addPracticeExamViolation(reason);
  }

  function handlePracticeExamKeydown(event) {
    if (!activePracticeExam || practiceExamFinished) {
      return;
    }

    const key = String(event.key || "").toLowerCase();
    const blockedCtrlKey = event.ctrlKey && ["c", "f", "l", "n", "p", "r", "s", "t", "u", "v", "w", "x"].includes(key);
    const blockedDevTools = event.key === "F12" || (event.ctrlKey && event.shiftKey && ["c", "i", "j"].includes(key));
    const blockedMetaKey = event.metaKey && ["c", "f", "l", "n", "p", "r", "s", "t", "v", "w", "x"].includes(key);

    if (blockedCtrlKey || blockedDevTools || blockedMetaKey) {
      event.preventDefault();
      addPracticeExamViolation(`Blocked shortcut: ${formatPracticeExamShortcut(event)}`);
    }
  }

  function formatPracticeExamShortcut(event) {
    const parts = [];
    if (event.ctrlKey) parts.push("Ctrl");
    if (event.metaKey) parts.push("Meta");
    if (event.shiftKey) parts.push("Shift");
    if (event.altKey) parts.push("Alt");
    parts.push(event.key);
    return parts.join("+");
  }

  function addPracticeExamViolation(reason) {
    if (!activePracticeExam || practiceExamFinished) {
      return;
    }

    const now = Date.now();
    const violationSignature = `${reason}:${Math.floor(now / 3000)}`;
    if (lastPracticeExamViolation === violationSignature) {
      return;
    }

    lastPracticeExamViolation = violationSignature;
    practiceExamViolations.push({
      reason,
      at: new Date().toISOString(),
      question: activePracticeExamIndex + 1
    });
    updatePracticeExamLockStatus();
  }

  function updatePracticeExamLockStatus() {
    if (!examRunnerLockStatus) {
      return;
    }

    const fullscreenActive = Boolean(document.fullscreenElement);
    const violationCount = practiceExamViolations.length;
    examRunnerLockStatus.textContent = `${fullscreenActive ? "Fullscreen" : "Windowed"} | ${violationCount} violation${violationCount === 1 ? "" : "s"}`;
    examRunnerLockStatus.classList.toggle("hot", violationCount > 0);
  }

  function finishPracticeExam(reason) {
    if (!activePracticeExam || practiceExamFinished) {
      return;
    }

    practiceExamFinished = true;
    window.clearInterval(practiceExamTimerId);
    removePracticeExamLockdown();

    const total = activePracticeExamQuestions.length;
    const answered = activePracticeExamSelections.filter((answer, index) => {
      return isPracticeExamQuestionAnswered(activePracticeExamQuestions[index], answer);
    }).length;
    const unanswered = activePracticeExamSelections.filter((answer, index) => {
      return practiceExamEngine.getQuestionAnswerState(activePracticeExamQuestions[index], answer) === "unanswered";
    }).length;
    const incomplete = activePracticeExamSelections.filter((answer, index) => {
      return practiceExamEngine.getQuestionAnswerState(activePracticeExamQuestions[index], answer) === "incomplete";
    }).length;
    const totalPoints = activePracticeExamQuestions.reduce((sum, question) => {
      return sum + practiceExamEngine.getQuestionPointValue(question);
    }, 0);
    const earnedPoints = activePracticeExamQuestions.reduce((sum, question, index) => {
      return sum + practiceExamEngine.getEarnedPoints(question, activePracticeExamSelections[index]);
    }, 0);
    const percent = totalPoints ? Math.round((earnedPoints / totalPoints) * 100) : 0;
    const timeSpentSeconds = practiceExamStartedAt
      ? Math.round((Date.now() - practiceExamStartedAt.getTime()) / 1000)
      : 0;
    const questionReview = activePracticeExamQuestions.map((question, index) => {
      const selectedIndex = activePracticeExamSelections[index];
      const pointsEarned = practiceExamEngine.getEarnedPoints(question, selectedIndex);
      const pointsPossible = practiceExamEngine.getQuestionPointValue(question);
      const answerState = practiceExamEngine.getQuestionAnswerState(question, selectedIndex);
      return {
        number: index + 1,
        subunit: question.subunit || "General Review",
        question: question.question,
        selectedAnswer: formatPracticeExamSelectedAnswer(question, selectedIndex),
        correctAnswer: formatPracticeExamCorrectAnswer(question),
        isCorrect: pointsEarned === pointsPossible,
        answerState,
        isUnanswered: answerState === "unanswered",
        pointsEarned,
        pointsPossible,
        isFlagged: Boolean(activePracticeExamFlags[index])
      };
    });
    const subunitResults = calculatePracticeExamSubunitResults(questionReview, activePracticeExam.id);

    const attempt = {
      examId: activePracticeExam.id,
      title: activePracticeExam.title,
      certification: activePracticeExam.certification,
      score: earnedPoints,
      total: totalPoints,
      questionTotal: total,
      answered,
      unanswered,
      incomplete,
      percent,
      timeLimitMinutes: activePracticeExam.minutes,
      timeSpentSeconds,
      reason,
      subunitResults,
      questionReview,
      violations: [...practiceExamViolations]
    };

    savePracticeExamAttemptForCurrentUser(attempt);
    renderPracticeExamResult(attempt);
    updatePracticeExamStatus();
    hydrateScoreInputs();

    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }

    showToast(`${activePracticeExam.title} submitted: ${percent}%`);
    activePracticeExam = null;
  }

  function isPracticeExamSelectionCorrect(question, selection) {
    return practiceExamEngine.isSelectionFullyCorrect(question, selection);
  }

  function formatPracticeExamSelectedAnswer(question, selection) {
    if (selection === null || selection === undefined) {
      return "Not answered";
    }

    if (question.type === "dropdown") {
      const values = Array.isArray(selection.values) ? selection.values : [];
      return question.prompts.map((prompt, index) => `${prompt.label}: ${values[index] || "Not answered"}`).join("; ");
    }

    if (question.type === "matching") {
      const matches = selection.matches || {};
      return question.pairs.map((pair, index) => `${pair.prompt}: ${matches[index] || "Not answered"}`).join("; ");
    }

    if (question.type === "multi-select") {
      if (!Array.isArray(selection.values) || !selection.values.length) {
        return "Not answered";
      }

      return selection.values
        .slice()
        .sort((first, second) => first - second)
        .map((index) => question.answers[index])
        .join("; ");
    }

    return question.answers[selection];
  }

  function formatPracticeExamCorrectAnswer(question) {
    if (question.type === "dropdown") {
      return question.prompts.map((prompt) => `${prompt.label}: ${prompt.correct}`).join("; ");
    }

    if (question.type === "matching") {
      return question.pairs.map((pair) => `${pair.prompt}: ${pair.correct}`).join("; ");
    }

    if (question.type === "multi-select") {
      return question.correct
        .slice()
        .sort((first, second) => first - second)
        .map((index) => question.answers[index])
        .join("; ");
    }

    return question.answers[question.correct];
  }

  function calculatePracticeExamSubunitResults(questionReview, examId = "") {
    const resultMap = new Map();
    const subunitOrderMap = {
      "pearson-cybersecurity-full": cyberSecurityPracticeExamSubunits,
      "pearson-network-security-full": networkSecurityPracticeExamSubunits,
      "its-networking-exam-1-full": networkingPracticeExamSubunits,
      "its-networking-exam-2-full": networkingPracticeExamSubunits,
      "comptia-network-plus-full": networkingPracticeExamSubunits,
      "comptia-security-plus-full": securityPlusPracticeExamSubunits
    };
    const subunitOrder = subunitOrderMap[examId] || networkingPracticeExamSubunits;

    questionReview.forEach((item) => {
      const subunit = item.subunit || "General Review";
      const current = resultMap.get(subunit) || { subunit, correct: 0, total: 0, questions: 0, percent: 0 };
      current.correct += item.pointsEarned || 0;
      current.total += item.pointsPossible || 0;
      current.questions += 1;
      current.percent = current.total ? Math.round((current.correct / current.total) * 100) : 0;
      resultMap.set(subunit, current);
    });

    const ordered = subunitOrder
      .filter((subunit) => resultMap.has(subunit))
      .map((subunit) => resultMap.get(subunit));
    const remaining = [...resultMap.values()].filter((item) => !subunitOrder.includes(item.subunit));
    return [...ordered, ...remaining];
  }

  function renderPracticeExamResult(attempt) {
    if (!examRunnerBody) {
      return;
    }

    const passed = attempt.percent >= 80;
    const subunitRows = attempt.subunitResults && attempt.subunitResults.length
      ? attempt.subunitResults.map((result) => `
          <tr>
            <td>${escapePracticeExamHtml(result.subunit)}</td>
            <td>${result.percent}%</td>
            <td>${result.correct}/${result.total}</td>
          </tr>
        `).join("")
      : "";
    const answerReview = attempt.questionReview && attempt.questionReview.length
      ? attempt.questionReview.map((item) => `
          <article class="exam-feedback-item ${item.isCorrect ? "correct" : "review"} ${item.isUnanswered ? "unanswered" : ""}">
            <span>${escapePracticeExamHtml(item.subunit)}${item.isFlagged ? " | Flagged" : ""}${item.isUnanswered ? " | Unanswered counted as 0" : ""}</span>
            <h4>Question ${item.number}: ${escapePracticeExamHtml(item.question)}</h4>
            <p><strong>Points:</strong> ${item.pointsEarned}/${item.pointsPossible}</p>
            <p><strong>Your answer:</strong> ${escapePracticeExamHtml(item.selectedAnswer)}</p>
            <p><strong>Correct answer:</strong> ${escapePracticeExamHtml(item.correctAnswer)}</p>
          </article>
        `).join("")
      : "";
    const violationSummary = attempt.violations.length
      ? attempt.violations.slice(0, 5).map((violation) => `
          <li>${escapePracticeExamHtml(violation.reason)} on question ${violation.question}</li>
        `).join("")
      : "<li>No lockdown violations recorded.</li>";

    if (examRunnerTitle) {
      examRunnerTitle.textContent = `${attempt.title} Results`;
    }

    if (examRunnerMeta) {
      examRunnerMeta.textContent = `${attempt.certification} | ${attempt.reason} | ${formatPracticeExamDuration(attempt.timeSpentSeconds)} used`;
    }

    if (examRunnerTimer) {
      examRunnerTimer.textContent = `${attempt.percent}%`;
      examRunnerTimer.classList.toggle("danger", !passed);
    }

    if (examRunnerLockStatus) {
      examRunnerLockStatus.textContent = attempt.violations.length ? `${attempt.violations.length} violation${attempt.violations.length === 1 ? "" : "s"}` : "Clean attempt";
      examRunnerLockStatus.classList.toggle("hot", attempt.violations.length > 0);
    }

    examRunnerBody.innerHTML = `
      <div class="practice-exam-result ${passed ? "passed" : "review"}">
        <span class="category-chip">${passed ? "Passed practice target" : "Review recommended"}</span>
        <h3>${attempt.score}/${attempt.total} points (${attempt.percent}%)</h3>
        <p>${attempt.answered}/${attempt.questionTotal || attempt.total} questions fully answered. ${attempt.unanswered || 0} unanswered counted as 0 points${attempt.incomplete ? `; ${attempt.incomplete} incomplete scored with partial credit where possible` : ""}. Time used: ${formatPracticeExamDuration(attempt.timeSpentSeconds)}.</p>
      </div>
      ${subunitRows ? `
        <div class="subunit-breakdown-card">
          <div class="panel-heading">
            <div>
              <p class="panel-note">Certification Subunit Breakdown</p>
              <h3>Percent Correct by Skillset</h3>
            </div>
          </div>
          <table class="subunit-breakdown-table">
            <thead>
              <tr>
                <th>Skillset Description</th>
                <th>Percent Correct</th>
                <th>Score</th>
              </tr>
            </thead>
            <tbody>${subunitRows}</tbody>
          </table>
        </div>
      ` : ""}
      <div class="lockdown-warning">
        <strong>Lockdown log</strong>
        <ul>${violationSummary}</ul>
      </div>
      ${answerReview ? `
        <div class="exam-answer-review-card">
          <p class="panel-note">Final Answer Feedback</p>
          <h3>Review appears only after exam submission</h3>
          <div class="exam-feedback-list">${answerReview}</div>
        </div>
      ` : ""}
    `;

    if (examRunnerBackButton) {
      examRunnerBackButton.classList.add("hidden");
    }

    if (examRunnerNextButton) {
      examRunnerNextButton.classList.add("hidden");
    }

    if (examRunnerReviewButton) {
      examRunnerReviewButton.classList.add("hidden");
    }

    if (examRunnerSubmitButton) {
      examRunnerSubmitButton.classList.add("hidden");
    }

    if (examRunnerExitButton) {
      examRunnerExitButton.classList.remove("hidden");
      examRunnerExitButton.textContent = "Close Result";
    }
  }

  function closePracticeExamRunner() {
    if (practiceExamRunner) {
      practiceExamRunner.classList.add("hidden");
    }

    if (examRunnerExitButton) {
      examRunnerExitButton.classList.add("hidden");
    }

    if (examRunnerBackButton) {
      examRunnerBackButton.classList.add("hidden");
    }

    if (examRunnerReviewButton) {
      examRunnerReviewButton.classList.add("hidden");
    }
  }

  function formatPracticeExamDuration(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  }

  function escapePracticeExamHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;"
    }[character]));
  }
}

function initializeQuizzesPage() {
  const quizDirectoryGrid = document.getElementById("quizDirectoryGrid");
  const quizTitle = document.getElementById("certQuizTitle");
  const quizProgress = document.getElementById("certQuizProgress");
  const quizBody = document.getElementById("certQuizBody");
  const nextButton = document.getElementById("certNextQuestionButton");
  const retryButton = document.getElementById("certRetryQuizButton");
  const attemptList = document.getElementById("quizAttemptList");
  const attemptCountNumber = document.getElementById("attemptCountNumber");
  const certCoachCard = document.querySelector(".cert-quiz-layout .dragon-coach-card");
  const certCoachMood = document.getElementById("certDragonCoachMood");
  const certCoachContent = document.getElementById("certDragonCoachContent");
  const certCoachStreakLabel = document.getElementById("certDragonCoachStreak");
  const certCoachAccuracyLabel = document.getElementById("certDragonCoachAccuracy");
  const certCoachHintButton = document.getElementById("certDragonHintButton");
  const certCoachPepButton = document.getElementById("certDragonPepButton");
  let activeQuiz = null;
  let activeQuestions = [];
  let currentQuestionIndex = 0;
  let score = 0;
  let answeredQuestions = 0;
  let certCoachStreak = 0;
  let lastSelectedAnswer = null;
  let hasAnswered = false;

  if (!quizDirectoryGrid || !quizBody) {
    return;
  }

  renderQuizDirectory();
  renderAttempts();
  renderCertCoachIdle();
  nextButton.classList.add("hidden");

  nextButton.addEventListener("click", () => {
    if (!activeQuiz) {
      return;
    }

    if (!hasAnswered) {
      showToast("Choose an answer before continuing.");
      return;
    }

    currentQuestionIndex += 1;
    if (currentQuestionIndex >= activeQuestions.length) {
      showQuizResult();
      return;
    }

    hasAnswered = false;
    renderActiveQuestion();
  });

  retryButton.addEventListener("click", () => {
    if (activeQuiz) {
      startQuiz(activeQuiz.id);
    }
  });

  if (certCoachHintButton) {
    certCoachHintButton.addEventListener("click", () => {
      if (!activeQuiz) {
        renderCertCoachIdle();
        showToast("Start a certification quiz first.");
        return;
      }

      if (hasAnswered) {
        const question = activeQuestions[currentQuestionIndex];
        if (!question) {
          renderCertCoachResult(Math.round((score / activeQuestions.length) * 100));
          return;
        }
        renderCertCoachAnswer(question, lastSelectedAnswer ?? question.correct, (lastSelectedAnswer ?? question.correct) === question.correct, "review");
        return;
      }

      const question = activeQuestions[currentQuestionIndex];
      if (question) {
        renderCertCoachHint(question);
      }
    });
  }

  if (certCoachPepButton) {
    certCoachPepButton.addEventListener("click", renderCertCoachPepTalk);
  }

  function renderQuizDirectory() {
    quizDirectoryGrid.innerHTML = certificationQuizzes.map((quiz) => `
      <article class="quiz-directory-card glass-card">
        <div class="card-topline">
          <span class="category-chip">${quiz.certification}</span>
          <span class="difficulty-badge intermediate">${quiz.difficulty}</span>
        </div>
        <h3>${quiz.title}</h3>
        <p>${quiz.questions.length} questions. Attempts save to your account and feed Admin oversight.</p>
        <button class="secondary-button quiz-start-button" type="button" data-quiz-id="${quiz.id}">Start Quiz</button>
      </article>
    `).join("");

    quizDirectoryGrid.querySelectorAll("[data-quiz-id]").forEach((button) => {
      button.addEventListener("click", () => startQuiz(button.dataset.quizId));
    });
  }

  function createRandomizedQuizSession(quiz) {
    if (!quiz || !quiz.questions.length) {
      return [];
    }

    const orderKey = `${storageKeys.quizOrders}:${quiz.id}`;
    const previousOrder = getStoredObject(orderKey, []);
    let questionOrder = shuffleValues(quiz.questions.map((_, index) => index));

    if (questionOrder.length > 1 && arraysMatch(questionOrder, previousOrder)) {
      questionOrder = [...questionOrder.slice(1), questionOrder[0]];
    }

    localStorage.setItem(orderKey, JSON.stringify(questionOrder));

    return questionOrder.map((originalIndex) => {
      return createRandomizedQuestionAnswers(quiz.questions[originalIndex], originalIndex);
    });
  }

  function createRandomizedQuestionAnswers(question, originalIndex) {
    let answerOrder = shuffleValues(question.answers.map((_, index) => index));

    if (answerOrder.length > 1 && arraysMatch(answerOrder, question.answers.map((_, index) => index))) {
      answerOrder = [...answerOrder.slice(1), answerOrder[0]];
    }

    return {
      ...question,
      originalIndex,
      originalAnswers: [...question.answers],
      originalCorrect: question.correct,
      answers: answerOrder.map((answerIndex) => question.answers[answerIndex]),
      correct: answerOrder.indexOf(question.correct)
    };
  }

  function shuffleValues(values) {
    const shuffled = [...values];

    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }

    return shuffled;
  }

  function arraysMatch(first, second) {
    return Array.isArray(first)
      && Array.isArray(second)
      && first.length === second.length
      && first.every((value, index) => value === second[index]);
  }

  function startQuiz(quizId) {
    activeQuiz = certificationQuizzes.find((quiz) => quiz.id === quizId);
    if (!activeQuiz) {
      showToast("Quiz not found.");
      return;
    }
    activeQuestions = createRandomizedQuizSession(activeQuiz);
    currentQuestionIndex = 0;
    score = 0;
    answeredQuestions = 0;
    certCoachStreak = 0;
    lastSelectedAnswer = null;
    hasAnswered = false;
    retryButton.classList.add("hidden");
    nextButton.classList.remove("hidden");
    updateCertCoachStats();
    renderActiveQuestion();
    showToast(`${activeQuiz.title} loaded with a fresh random order.`);
  }

  function renderActiveQuestion() {
    const question = activeQuestions[currentQuestionIndex];
    quizTitle.textContent = activeQuiz.title;
    quizProgress.textContent = `Question ${currentQuestionIndex + 1} of ${activeQuestions.length}`;
    quizBody.innerHTML = `
      <p class="question-title">${escapeCertificationQuizHtml(question.question)}</p>
      <div class="answer-grid">
        ${question.answers.map((answer, index) => `
          <button class="answer-button" type="button" data-answer="${index}">${escapeCertificationQuizHtml(answer)}</button>
        `).join("")}
      </div>
      <p class="feedback-text" id="certQuizFeedback"></p>
    `;
    lastSelectedAnswer = null;
    renderCertCoachIntro(question);
    setCertCoachState("thinking");
    updateCertCoachStats();

    quizBody.querySelectorAll(".answer-button").forEach((button) => {
      button.addEventListener("click", () => handleQuizAnswer(Number(button.dataset.answer)));
    });
  }

  function handleQuizAnswer(answerIndex) {
    if (hasAnswered) {
      return;
    }

    hasAnswered = true;
    lastSelectedAnswer = answerIndex;
    const question = activeQuestions[currentQuestionIndex];
    const isCorrect = answerIndex === question.correct;
    const feedback = document.getElementById("certQuizFeedback");

    quizBody.querySelectorAll(".answer-button").forEach((button) => {
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
      certCoachStreak += 1;
      feedback.textContent = "Correct. Saved analyst momentum.";
    } else {
      certCoachStreak = 0;
      feedback.textContent = `Not quite. Correct answer: ${question.answers[question.correct]}.`;
    }
    answeredQuestions = currentQuestionIndex + 1;
    setCertCoachState(isCorrect ? "happy" : "review");
    updateCertCoachStats();
    renderCertCoachAnswer(question, answerIndex, isCorrect);
  }

  function showQuizResult() {
    const percent = Math.round((score / activeQuestions.length) * 100);
    saveQuizAttemptForCurrentUser({
      quizId: activeQuiz.id,
      title: activeQuiz.title,
      certification: activeQuiz.certification,
      score,
      total: activeQuestions.length,
      percent
    });

    quizProgress.textContent = "Quiz Complete";
    quizBody.innerHTML = `
      <p class="question-title">Final Score: ${score}/${activeQuestions.length} (${percent}%)</p>
      <p class="feedback-text">Attempt saved to your user account and visible to Admin oversight.</p>
    `;
    renderCertCoachResult(percent);
    nextButton.classList.add("hidden");
    retryButton.classList.remove("hidden");
    renderAttempts();
    showToast("Certification quiz attempt saved.");
  }

  function renderCertCoachIdle() {
    if (!certCoachContent) {
      return;
    }

    setCertCoachState("idle");
    if (certCoachMood) {
      certCoachMood.textContent = "Pick a quiz";
    }
    certCoachContent.innerHTML = `
      <div class="dragon-chat-row">
        <div class="dragon-mini-face" aria-hidden="true"></div>
        <div class="dragon-chat-bubble coach-speech">
          <strong>Ready when you are.</strong>
          <p>Start any certification quiz and I will coach each question with hints, answer reactions, and quick explanations.</p>
        </div>
      </div>
      <div class="dragon-prompt-card">
        <span>Quiz only</span>
        <p>This coach appears on certification quizzes. Full-length practice exams stay separate.</p>
      </div>
    `;
    updateCertCoachStats();
  }

  function renderCertCoachIntro(question) {
    if (!certCoachContent || !activeQuiz) {
      return;
    }

    if (certCoachMood) {
      certCoachMood.textContent = pickCertCoachLine(["Find the clue", "Read the stem", "Choose carefully"]);
    }

    certCoachContent.innerHTML = `
      <div class="dragon-chat-row">
        <div class="dragon-mini-face" aria-hidden="true"></div>
        <div class="dragon-chat-bubble coach-speech">
          <strong>${escapeCertificationQuizHtml(pickCertCoachLine(["Small clue first.", "Let's narrow it down.", "Watch the wording."]))}</strong>
          <p>${escapeCertificationQuizHtml(getCertCoachNudge(question))}</p>
        </div>
      </div>
      <div class="dragon-prompt-card">
        <span>${escapeCertificationQuizHtml(activeQuiz.certification)}</span>
        <p>${escapeCertificationQuizHtml(question.question)}</p>
      </div>
    `;
  }

  function renderCertCoachHint(question) {
    if (!certCoachContent) {
      return;
    }

    setCertCoachState("hinting");
    if (certCoachMood) {
      certCoachMood.textContent = "Hint mode";
    }

    certCoachContent.innerHTML = `
      <div class="dragon-chat-row">
        <div class="dragon-mini-face hinting" aria-hidden="true"></div>
        <div class="dragon-chat-bubble coach-speech">
          <strong>${escapeCertificationQuizHtml(pickCertCoachLine(["Hint unlocked.", "Look at the key word.", "Use the concept."]))}</strong>
          <p>${escapeCertificationQuizHtml(getCertCoachHint(question))}</p>
        </div>
      </div>
    `;
  }

  function renderCertCoachAnswer(question, selectedIndex, isCorrect, mode = "answered") {
    if (!certCoachContent) {
      return;
    }

    const correctAnswer = question.answers[question.correct];
    const selectedAnswer = question.answers[selectedIndex] || correctAnswer;
    const lead = isCorrect
      ? pickCertCoachLine(["Correct.", "Nice work.", "That one lands."])
      : pickCertCoachLine(["Let's review it.", "Good learning moment.", "Close the gap here."]);
    const profile = getCertificationQuestionProfile(question);

    certCoachContent.innerHTML = `
      <div class="dragon-chat-row">
        <div class="dragon-mini-face ${isCorrect ? "happy" : "review"}" aria-hidden="true"></div>
        <div class="dragon-chat-bubble coach-speech ${isCorrect ? "success" : "review"}">
          <strong>${escapeCertificationQuizHtml(lead)}</strong>
          <p>${escapeCertificationQuizHtml(mode === "review" ? `The answer to remember is ${correctAnswer}.` : `You chose ${selectedAnswer}. The best answer is ${correctAnswer}.`)}</p>
        </div>
      </div>
      <div class="dragon-prompt-card coach-detail-card">
        <span>Concept focus</span>
        <p>${escapeCertificationQuizHtml(profile.focus)}</p>
        <span>How to reason it out</span>
        <p>${escapeCertificationQuizHtml(profile.reasoning)}</p>
        <span>Memory hook</span>
        <p>${escapeCertificationQuizHtml(profile.memoryHook)}</p>
      </div>
      <div class="dragon-answer-list">
        ${question.answers.map((answer, index) => `
          <article class="dragon-option ${index === question.correct ? "correct" : "wrong"} ${index === selectedIndex ? "selected" : ""}">
            <strong>${index === question.correct ? "Why this is right" : "Why this is not best"}: ${escapeCertificationQuizHtml(answer)}</strong>
            <p>${escapeCertificationQuizHtml(explainCertificationChoice(question, index))}</p>
          </article>
        `).join("")}
      </div>
    `;
  }

  function renderCertCoachPepTalk() {
    if (!certCoachContent) {
      return;
    }

    setCertCoachState("happy");
    if (certCoachMood) {
      certCoachMood.textContent = "Coach boost";
    }

    certCoachContent.innerHTML = `
      <div class="dragon-chat-row">
        <div class="dragon-mini-face happy" aria-hidden="true"></div>
        <div class="dragon-chat-bubble coach-speech success">
          <span class="pep-talk-rule">Reading is fundamental.</span>
          <strong>${escapeCertificationQuizHtml(pickCertCoachLine(["Keep moving.", "Build the pattern.", "You are training recall."]))}</strong>
          <p>${escapeCertificationQuizHtml(pickCertCoachLine([
            "Do not rush the answer choices. Most quiz misses come from missing one word in the question.",
            "When two answers look close, choose the one that exactly matches the concept being tested.",
            `Current streak: ${certCoachStreak}. Protect it by reading the question stem twice.`
          ]))}</p>
        </div>
      </div>
    `;
  }

  function renderCertCoachResult(percent) {
    if (!certCoachContent || !activeQuiz) {
      return;
    }

    setCertCoachState(percent >= 80 ? "happy" : "review");
    if (certCoachMood) {
      certCoachMood.textContent = percent >= 80 ? "Exam ready energy" : "Review mode";
    }

    certCoachContent.innerHTML = `
      <div class="dragon-chat-row">
        <div class="dragon-mini-face ${percent >= 80 ? "happy" : "review"}" aria-hidden="true"></div>
        <div class="dragon-chat-bubble coach-speech ${percent >= 80 ? "success" : "review"}">
          <strong>${percent >= 80 ? "Strong finish." : "Good checkpoint."}</strong>
          <p>${escapeCertificationQuizHtml(`${activeQuiz.title} saved at ${percent}%. ${percent >= 80 ? "You are trending ready." : "Retake it after reviewing the missed concepts."}`)}</p>
        </div>
      </div>
    `;
    updateCertCoachStats(percent);
  }

  function getCertCoachNudge(question) {
    const text = question.question.toLowerCase();
    if (text.includes("not")) {
      return "This is an exception question. Look for the option that does not belong.";
    }
    if (text.includes("which") || text.includes("what")) {
      return "Match the question wording to the most exact concept, protocol, control, or device.";
    }
    if (text.includes("true") || text.includes("false")) {
      return "Decide whether the statement is always true. One counterexample makes it false.";
    }
    return "Find the main concept in the question, then eliminate answers that belong to a different topic.";
  }

  function getCertCoachHint(question) {
    const correctAnswer = question.answers[question.correct];
    const text = question.question.toLowerCase();
    if (text.includes("not")) {
      return `The correct choice is the exception. Compare each option against ${correctAnswer} before answering.`;
    }
    if (text.includes("command")) {
      return "Look for the answer that is written like an actual command or command option.";
    }
    if (text.includes("protocol")) {
      return "Think about the protocol's job first, then match it to the answer choice.";
    }
    return `The correct answer starts with "${String(correctAnswer).charAt(0)}" and matches the exact wording of the question.`;
  }

  function explainCertificationChoice(question, answerIndex) {
    const answer = question.answers[answerIndex];
    const correctAnswer = question.answers[question.correct];
    const lowerQuestion = question.question.toLowerCase();
    const profile = getCertificationQuestionProfile(question);
    const answerContrast = getCertificationAnswerContrast(answer);

    if (answerIndex === question.correct) {
      if (lowerQuestion.includes("not")) {
        return `${answer} is correct because this is an exception question. The question is asking for the answer that does not fit the normal pattern, and this option is the one that breaks that pattern. ${profile.memoryHook}`;
      }
      if (lowerQuestion.includes("true") || lowerQuestion.includes("false")) {
        return `${answer} is correct because it matches the truth value of the statement. ${profile.reasoning}`;
      }
      return `${answer} is correct because it directly matches the concept being tested. ${profile.reasoning} ${profile.memoryHook}`;
    }

    if (lowerQuestion.includes("not")) {
      return `${answer} may relate to the topic, but it is not the exception this question is looking for. Compare it against ${correctAnswer}: ${correctAnswer} is the option that best satisfies the "not" wording. ${answerContrast}`;
    }

    return `${answer} does not match the question as closely as ${correctAnswer}. ${answerContrast} The key clue is: ${profile.focus}`;
  }

  function getCertificationQuestionProfile(question) {
    const text = question.question.toLowerCase();
    const correctAnswer = question.answers[question.correct];

    if (text.includes("attack surface")) {
      return {
        focus: "Attack surface classification: decide whether the risk comes from technology, people, or physical access.",
        reasoning: "Digital attack surface covers systems, servers, databases, cloud services, applications, and technical attacks. Social attack surface centers on people, email, impersonation, and trust abuse.",
        memoryHook: "Digital equals systems and software; social equals people and messages; physical equals buildings and devices."
      };
    }

    if (text.includes("cia triad") || text.includes("confidentiality") || text.includes("availability")) {
      return {
        focus: "CIA triad matching: decide whether the question is about privacy, accuracy, or access.",
        reasoning: "Confidentiality keeps information private, integrity keeps information accurate and unchanged, and availability keeps systems and data reachable when needed.",
        memoryHook: "Confidentiality hides, integrity verifies, availability stays online."
      };
    }

    if (text.includes("hash") || text.includes("tampered") || correctAnswer.toLowerCase().includes("integrity")) {
      return {
        focus: "CIA triad integrity: proving data stayed accurate and unchanged.",
        reasoning: "Hashing creates a fingerprint of data. If the data changes, the hash changes too, so hashing is mainly used to detect tampering.",
        memoryHook: "Integrity asks: did the data stay the same?"
      };
    }

    if (text.includes("backup") || text.includes("restore")) {
      return {
        focus: "Backup behavior: know what each backup captures and how restoration works.",
        reasoning: "Full backups are fastest to restore because all data is in one backup set. Incremental backups can take longer because several backup sets may need to be restored in order.",
        memoryHook: "Full is bigger but simpler to restore; incremental is smaller but can be slower to rebuild."
      };
    }

    if (text.includes("kill chain") || text.includes("reconnaissance") || text.includes("command and control") || text.includes("actions on objectives") || text.includes("persistence")) {
      return {
        focus: "Attack lifecycle: place the attacker action in the correct phase.",
        reasoning: "Reconnaissance identifies targets, Delivery gets the payload to the victim, Exploitation runs the attack, Installation establishes malware, Command and Control communicates with attacker infrastructure, and Actions on Objectives is where the attacker reaches the goal.",
        memoryHook: "Find, deliver, exploit, install, command, complete."
      };
    }

    if (text.includes("incident response") || text.includes("containment") || text.includes("eradication") || text.includes("identification") || text.includes("triage")) {
      return {
        focus: "Incident handling order: identify the issue, limit damage, remove the cause, recover systems, and document lessons.",
        reasoning: "Identification confirms what is happening, containment limits spread, eradication removes threats and weaknesses, and recovery restores normal operations.",
        memoryHook: "Identify, contain, eradicate, recover."
      };
    }

    if (text.includes("siem") || text.includes("soar")) {
      return {
        focus: "SOC platform roles: separate detection visibility from response automation.",
        reasoning: "SIEM collects, analyzes, and correlates event data for detection. SOAR adds workflow automation and response efficiency, especially when paired with SIEM alerts.",
        memoryHook: "SIEM sees and correlates; SOAR acts and automates."
      };
    }

    if (text.includes("mfa") || text.includes("multi-factor") || text.includes("password") || text.includes("authentic")) {
      return {
        focus: "Identity protection: stop account takeover by requiring proof beyond a password.",
        reasoning: "MFA helps when passwords are weak, guessed, stolen, or reused because the attacker still needs another factor. Digital signatures prove software authenticity by verifying who signed the update and whether it changed.",
        memoryHook: "MFA adds proof; signatures prove origin and integrity."
      };
    }

    if (text.includes("zero trust")) {
      return {
        focus: "Zero Trust access: never assume a user or device is safe just because it is inside the network.",
        reasoning: "Zero Trust relies on continuous verification, least privilege, strong identity checks, and limiting access to only what is needed.",
        memoryHook: "Never trust by location; always verify by identity and context."
      };
    }

    if (text.includes("ransomware") || text.includes("phishing")) {
      return {
        focus: "User-driven attacks: reduce the chance of the click and contain the device quickly if infection happens.",
        reasoning: "Training helps users recognize phishing before ransomware executes. If ransomware is already visible, isolating the affected device limits spread before recovery or deeper investigation.",
        memoryHook: "Before infection: train users. During infection: isolate first."
      };
    }

    if (text.includes("social engineering") || text.includes("posing as") || text.includes("it support") || text.includes("whaling") || text.includes("spear phishing") || text.includes("vishing") || text.includes("smishing")) {
      return {
        focus: "Social engineering: identify attacks that manipulate people rather than directly attacking code.",
        reasoning: "Impersonation, phishing, spear phishing, whaling, vishing, and smishing all rely on trust, urgency, or deception to make a person reveal information or take an unsafe action.",
        memoryHook: "If the attacker tricks a person, think social engineering."
      };
    }

    if (text.includes("trojan") || text.includes("worm") || text.includes("rootkit") || text.includes("keylogger") || text.includes("malware")) {
      return {
        focus: "Malware type recognition: match the behavior to the malware family.",
        reasoning: "A Trojan pretends to be legitimate software, a worm spreads itself, a rootkit hides privileged access, and a keylogger records keystrokes.",
        memoryHook: "Trojan disguises, worm spreads, rootkit hides, keylogger records."
      };
    }

    if (text.includes("pharming") || text.includes("dns spoofing")) {
      return {
        focus: "DNS redirection attacks: identify when users are silently sent to the wrong site.",
        reasoning: "Pharming uses DNS manipulation or spoofing to redirect users to malicious websites, even when they think they are visiting a legitimate destination.",
        memoryHook: "Pharming poisons where the name points."
      };
    }

    if (text.includes("dns poisoning") || text.includes("malicious website") || text.includes("malicious ip") || text.includes("c2")) {
      return {
        focus: "Malicious traffic clues: identify redirection or command-and-control behavior.",
        reasoning: "DNS poisoning can redirect users to malicious sites. Outbound traffic to a known malicious IP often indicates a compromised host calling back to attacker command-and-control infrastructure.",
        memoryHook: "Bad DNS redirects; bad outbound traffic may be C2."
      };
    }

    if (text.includes("edr") || text.includes("ueba") || text.includes("dlp") || text.includes("hids") || text.includes("ips") || text.includes("packet capture")) {
      return {
        focus: "Security tool purpose: match the tool to what it detects or investigates.",
        reasoning: "EDR focuses on endpoint behavior, UEBA detects unusual user/entity behavior, DLP protects sensitive data from leaving, IPS blocks suspicious network traffic, and packet capture helps reconstruct what happened during an investigation.",
        memoryHook: "Endpoint, behavior, data, prevention, packets."
      };
    }

    if (text.includes("wireshark") || text.includes("nessus") || text.includes("splunk") || text.includes("metasploit") || text.includes("network traffic")) {
      return {
        focus: "Security tool selection: match the tool to the investigation task.",
        reasoning: "Wireshark analyzes packet-level network traffic, Nessus scans for vulnerabilities, Splunk can search and analyze logs, and Metasploit is commonly associated with exploit testing in authorized labs.",
        memoryHook: "Packets Wireshark, vulnerabilities Nessus, logs Splunk, exploits Metasploit."
      };
    }

    if (text.includes("encryption") || text.includes("encrypt") || text.includes("s/mime") || text.includes("digital signatures")) {
      return {
        focus: "Cryptography purpose: decide whether the need is confidentiality, integrity, or authenticity.",
        reasoning: "Encryption protects data at rest and in transit. S/MIME protects email confidentiality and integrity. Digital signatures verify authenticity and integrity for software or messages.",
        memoryHook: "Encrypt hides; sign proves; S/MIME protects email."
      };
    }

    if (text.includes("cloud storage") || text.includes("cloud data") || text.includes("misconfigured cloud")) {
      return {
        focus: "Cloud data exposure: fix permissions first, then add monitoring and encryption as supporting controls.",
        reasoning: "A public or misconfigured storage bucket should be corrected by restricting public access and enforcing identity-based permissions so only approved users and services can reach it.",
        memoryHook: "For cloud buckets: close public access, then verify identity."
      };
    }

    if (text.includes("honeypot") || text.includes("ddos") || text.includes("rogue device") || text.includes("segmentation")) {
      return {
        focus: "Defensive response: pick the action that limits impact or gathers useful attacker information.",
        reasoning: "Honeypots distract attackers and collect intelligence. DDoS mitigation services absorb attack traffic. Segmentation can isolate rogue or compromised devices without shutting down the whole network.",
        memoryHook: "Divert, absorb, isolate."
      };
    }

    if (text.includes("mitre") || text.includes("att&ck") || text.includes("diamond model")) {
      return {
        focus: "Threat intelligence frameworks: match the model to what it explains.",
        reasoning: "MITRE ATT&CK gives a shared language for adversary behavior, including tactics, techniques, and procedures. The Diamond Model connects adversary, capability, infrastructure, and victim.",
        memoryHook: "ATT&CK names behavior; Diamond connects the actors and evidence."
      };
    }

    if (text.includes("hipaa") || text.includes("ferpa") || text.includes("gdpr") || text.includes("pci") || text.includes("fisma") || text.includes("compliance")) {
      return {
        focus: "Compliance matching: identify the data type or organization first.",
        reasoning: "HIPAA protects health data, FERPA protects education records, GDPR protects EU personal data, PCI-DSS protects payment card transactions, and FISMA applies to federal agency systems.",
        memoryHook: "Health HIPAA, education FERPA, EU GDPR, cards PCI, federal FISMA."
      };
    }

    if (text.includes("risk") || text.includes("sle") || text.includes("ef") || text.includes("mttr") || text.includes("rto") || text.includes("rpo") || text.includes("qualitative") || text.includes("quantitative")) {
      return {
        focus: "Risk management: decide whether the question is about treatment, measurement, impact, or recovery timing.",
        reasoning: "Acceptance tolerates risk, avoidance removes the risky activity, mitigation reduces likelihood or impact, and transference shifts risk to another party. SLE measures single-loss impact, while RTO/MTTR focus on restoration and repair timing.",
        memoryHook: "Accept, avoid, mitigate, transfer; measure impact and recovery time separately."
      };
    }

    if (text.includes("business impact analysis") || text.includes("bia")) {
      return {
        focus: "Business impact analysis: identify what matters most to the business during disruption.",
        reasoning: "A BIA identifies critical business functions and estimates how outages or disruptions would affect operations, priorities, recovery needs, and acceptable downtime.",
        memoryHook: "BIA asks: what breaks the business if it stops?"
      };
    }

    if (text.includes("man-in-the-middle") || text.includes("mitm") || text.includes("intercepts and modifies")) {
      return {
        focus: "Interception attacks: determine whether the attacker is secretly between two communicating parties.",
        reasoning: "A man-in-the-middle attack occurs when an attacker intercepts, relays, or modifies communication between systems that believe they are talking directly.",
        memoryHook: "MITM means the attacker is in the middle of the conversation."
      };
    }

    if (text.includes("access control") || text.includes("least privilege") || /\b(dac|mac|rbac|abac)\b/.test(text)) {
      return {
        focus: "Access control model selection: match permissions to owners, labels, roles, or attributes.",
        reasoning: "DAC lets owners control access, MAC uses mandatory labels, RBAC grants access by job role, and ABAC uses attributes like time, location, device, or department.",
        memoryHook: "DAC-owner, MAC-label, RBAC-role, ABAC-attributes."
      };
    }

    if (text.includes("defense in depth") || text.includes("prevent") || text.includes("detective") || text.includes("control")) {
      return {
        focus: "Security controls and defense in depth: layer prevention, detection, and response.",
        reasoning: "Control questions usually ask what the control does: prevent an event, detect an event, correct a weakness, or support policy and oversight.",
        memoryHook: "Prevent stops, detect spots, correct fixes, respond contains."
      };
    }

    if (text.includes("certificate") || text.includes("https") || text.includes("ssl")) {
      return {
        focus: "Web trust and encryption: certificates and SSL/TLS help browsers trust encrypted web sessions.",
        reasoning: "Trusted Certificate Authorities validate certificates. HTTPS relies on SSL/TLS-style secure transport to protect web communication.",
        memoryHook: "Certificates prove trust; HTTPS protects the web session."
      };
    }

    if (text.includes("osi") || text.includes("layer") || text.includes("pdu") || text.includes("encapsulates")) {
      return {
        focus: "OSI model mapping: identify the layer name, the device or service at that layer, and the data unit it handles.",
        reasoning: "Physical handles bits, Data Link handles frames and local network hardware, Network handles packets and routing, Transport handles segments and end-to-end delivery, and Application is closest to the user or application service.",
        memoryHook: "Bits, frames, packets, segments, data: move upward from wire to user."
      };
    }

    if (text.includes("topology") || text.includes("star") || text.includes("bus") || text.includes("ring") || text.includes("mesh")) {
      return {
        focus: "Topology recognition: look for the way devices connect and where failure points exist.",
        reasoning: "Star uses a central device, bus uses one shared line with terminators, ring passes traffic around a loop, and mesh creates redundant paths for fault tolerance.",
        memoryHook: "Star has a center, bus has a line, ring has a loop, mesh has many paths."
      };
    }

    if (text.includes("firewall") || text.includes("stateful") || text.includes("stateless") || text.includes("session table")) {
      return {
        focus: "Firewall behavior: decide whether the firewall is checking individual packets, connection state, host traffic, or network boundaries.",
        reasoning: "Stateless firewalls inspect packets without session memory. Stateful firewalls track sessions in tables. Host-based firewalls protect one machine, while network-based firewalls protect the edge or boundary.",
        memoryHook: "Stateful remembers the conversation; stateless checks one packet at a time."
      };
    }

    if (text.includes("unicast") || text.includes("multicast") || text.includes("broadcast") || text.includes("anycast")) {
      return {
        focus: "Traffic delivery method: count who should receive the message.",
        reasoning: "Unicast is one-to-one, multicast is one-to-many for subscribed receivers, broadcast is one-to-all inside a local domain, and anycast routes to the nearest available service endpoint.",
        memoryHook: "Uni one, multi group, broad everyone, any nearest."
      };
    }

    if (text.includes("sql") || text.includes("xss") || text.includes("input validation")) {
      return {
        focus: "Web attack prevention: recognize injection syntax and block dangerous input.",
        reasoning: "SQL injection and XSS depend on special characters being interpreted as code or markup. Validation restricts characters that can change how input is processed.",
        memoryHook: "If input can become code, validate and encode it."
      };
    }

    if (text.includes("vlan") || text.includes("subnet") || text.includes("cidr") || text.includes("router") || text.includes("routing") || text.includes("traceroute") || text.includes("tracert")) {
      return {
        focus: "Networking fundamentals: segmentation, addressing, routing, and path discovery.",
        reasoning: "VLANs segment networks, subnets divide address space, routers connect networks, and traceroute/tracert shows the routed path through hops.",
        memoryHook: "Switches segment locally; routers move between networks."
      };
    }

    if (text.includes("protocol") || text.includes("tcp/ip") || text.includes("dhcp") || text.includes("apipa") || text.includes("netbios")) {
      return {
        focus: "Protocol purpose: match each protocol or service to the job it performs.",
        reasoning: "Protocol questions test function. DHCP assigns addresses, APIPA self-assigns when DHCP is unavailable, and WINS resolves NetBIOS names.",
        memoryHook: "Name the job first, then pick the protocol that does that job."
      };
    }

    if (text.includes("remote access")) {
      return {
        focus: "Remote access tools: identify services used to log in or manage remote systems.",
        reasoning: "SSH, Telnet, and RDP are remote access methods. FTP transfers files, so it is not primarily remote login.",
        memoryHook: "Remote access controls a system; file transfer moves files."
      };
    }

    return {
      focus: "Certification concept matching: identify the main term in the question and pair it with the most exact answer.",
      reasoning: `The correct answer is ${correctAnswer} because it best matches the wording and topic of the question.`,
      memoryHook: "Eliminate answers that belong to a different domain before choosing between close options."
    };
  }

  function getCertificationAnswerContrast(answer) {
    const value = String(answer).toLowerCase();

    if (value.includes("confidentiality")) return "Confidentiality is about keeping data private from unauthorized users.";
    if (value.includes("integrity")) return "Integrity is about data accuracy and tamper detection.";
    if (value.includes("availability")) return "Availability is about systems and data staying reachable when needed.";
    if (value === "dac" || value.includes("discretionary")) return "DAC is owner-controlled access.";
    if (value === "mac" || value.includes("mandatory")) return "MAC is system-enforced access using labels.";
    if (value === "rbac" || value.includes("role-based")) return "RBAC maps access to job roles.";
    if (value === "abac") return "ABAC uses attributes like time, location, and device context.";
    if (value.includes("full")) return "A full backup captures everything and is usually simplest to restore.";
    if (value.includes("incremental")) return "An incremental backup captures changes since the last backup and may require several sets to restore.";
    if (value.includes("differential")) return "A differential backup captures changes since the last full backup.";
    if (value.includes("router")) return "A router connects different networks and appears as a hop in routed paths.";
    if (value.includes("switch")) return "A switch mainly forwards traffic inside a local network or VLAN.";
    if (value.includes("star")) return "Star topology depends on a central device with separate links to endpoints.";
    if (value.includes("bus")) return "Bus topology uses a shared backbone and terminators, so the backbone can become a failure point.";
    if (value.includes("ring")) return "Ring topology moves traffic around a loop, so a break can disrupt the path.";
    if (value.includes("mesh")) return "Mesh topology uses multiple paths, which improves fault tolerance.";
    if (value.includes("stateful")) return "Stateful firewalls track connection context in session tables.";
    if (value.includes("stateless")) return "Stateless firewalls inspect each packet by itself without remembering sessions.";
    if (value.includes("proxy firewall")) return "Proxy firewalls can inspect application-level traffic by acting between clients and services.";
    if (value.includes("broadcast")) return "Broadcast sends traffic to every host in the broadcast domain.";
    if (value.includes("multicast")) return "Multicast sends traffic to subscribed receivers efficiently.";
    if (value.includes("unicast")) return "Unicast is one-to-one communication.";
    if (value.includes("anycast")) return "Anycast routes a request to the nearest or best available service endpoint.";
    if (value.includes("ssl") || value.includes("tls")) return "SSL/TLS-style transport protects web sessions used by HTTPS.";
    if (value.includes("apipa")) return "APIPA is used when a host cannot reach DHCP and self-assigns an address.";
    if (value.includes("triage")) return "Triage means sorting and prioritizing information so the most urgent work is handled first.";
    if (value.includes("siem")) return "SIEM tools collect and correlate logs or events to support detection.";
    if (value.includes("soar")) return "SOAR tools automate response workflows and reduce manual effort.";
    if (value.includes("containment")) return "Containment limits spread and reduces the impact of an active incident.";
    if (value.includes("eradication")) return "Eradication removes the threat and the weakness it used.";
    if (value.includes("reconnaissance")) return "Reconnaissance is the target research and information-gathering phase.";
    if (value.includes("command and control")) return "Command and Control is attacker communication with a compromised system.";
    if (value.includes("risk acceptance")) return "Risk acceptance means choosing to tolerate a known risk.";
    if (value.includes("risk avoidance")) return "Risk avoidance removes the risky activity or exposure.";
    if (value.includes("risk transference")) return "Risk transference shifts some risk impact to a third party, such as insurance or outsourcing.";
    if (value.includes("risk mitigation")) return "Risk mitigation reduces likelihood or impact with controls.";
    if (value.includes("rto")) return "RTO is the maximum acceptable time to restore service.";
    if (value.includes("mttr")) return "MTTR is the average time needed to repair or recover a failed service.";
    if (value.includes("mfa") || value.includes("multi-factor")) return "MFA adds another identity proof beyond the password, which helps stop account takeover.";
    if (value.includes("ueba")) return "UEBA looks for unusual user and entity behavior, making it strong for insider-threat detection.";
    if (value.includes("edr")) return "EDR monitors endpoint behavior and helps detect or respond to endpoint threats.";
    if (value.includes("dlp")) return "DLP focuses on preventing sensitive data from leaving approved places.";
    if (value.includes("ngfw")) return "An NGFW can inspect application-layer content and apply deeper firewall controls.";
    if (value.includes("honeypot")) return "A honeypot diverts attackers and gathers intelligence about their behavior.";
    if (value.includes("s/mime")) return "S/MIME protects email confidentiality and integrity.";
    if (value.includes("digital signatures")) return "Digital signatures prove authenticity and help verify content was not altered.";
    if (value.includes("input validation")) return "Input validation blocks dangerous input patterns before they become injection attacks.";
    if (value.includes("segmentation")) return "Segmentation isolates systems so one rogue or compromised device cannot easily reach everything else.";
    if (value.includes("iso 27001")) return "ISO 27001 is a structured information security management framework.";
    if (value.includes("cobit")) return "COBIT is governance-focused and is not the best fit when the question asks for an information security management framework.";
    if (value.includes("trojan")) return "A Trojan disguises itself as legitimate software.";
    if (value.includes("worm")) return "A worm spreads itself across systems or networks.";
    if (value.includes("rootkit")) return "A rootkit hides privileged access and can be difficult to detect.";
    if (value.includes("keylogger")) return "A keylogger records keystrokes to capture sensitive input.";
    if (value.includes("pharming")) return "Pharming uses DNS manipulation to redirect users to malicious sites.";
    if (value.includes("whaling")) return "Whaling is phishing that specifically targets executives or senior leaders.";
    if (value.includes("zero trust") || value.includes("continuous authentication")) return "Zero Trust relies on continuous verification and least privilege instead of automatic internal trust.";
    if (value.includes("business impact") || value.includes("bia")) return "A BIA identifies critical functions and estimates disruption impact.";
    if (value.includes("hashing")) return "Hashing verifies integrity because a changed file produces a different digest.";
    if (value.includes("man-in-the-middle") || value.includes("mitm")) return "A MITM attack places the attacker between communicating parties to intercept or modify traffic.";
    if (value.includes("wireshark")) return "Wireshark is used to inspect packet-level network traffic.";
    if (value.includes("nessus")) return "Nessus is mainly used for vulnerability scanning.";
    if (value.includes("splunk")) return "Splunk is commonly used to search and analyze logs or security events.";
    if (value.includes("metasploit")) return "Metasploit is commonly used for authorized exploit testing, not packet inspection.";

    return "This option is a distractor unless it exactly matches the keyword and concept in the question.";
  }

  function updateCertCoachStats(accuracyOverride) {
    if (certCoachStreakLabel) {
      certCoachStreakLabel.textContent = String(certCoachStreak);
    }

    if (certCoachAccuracyLabel) {
      const accuracy = typeof accuracyOverride === "number"
        ? accuracyOverride
        : answeredQuestions > 0
          ? Math.round((score / answeredQuestions) * 100)
          : 0;
      certCoachAccuracyLabel.textContent = `${accuracy}%`;
    }
  }

  function setCertCoachState(state) {
    if (certCoachCard) {
      certCoachCard.dataset.coachState = state;
    }
  }

  function pickCertCoachLine(lines) {
    return lines[(currentQuestionIndex + score + certCoachStreak) % lines.length];
  }

  function escapeCertificationQuizHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;"
    }[character]));
  }

  function renderAttempts() {
    if (!attemptList || !attemptCountNumber) {
      return;
    }

    const progress = getCurrentUserProgress();
    const attempts = progress.quizAttempts || [];
    attemptCountNumber.textContent = String(attempts.length);
    attemptList.innerHTML = attempts.length ? attempts.slice(0, 6).map((attempt) => `
      <article class="attempt-item">
        <strong>${attempt.title}</strong>
        <span>${attempt.score}/${attempt.total} (${attempt.percent}%)</span>
        <p>${new Date(attempt.completedAt).toLocaleString()}</p>
      </article>
    `).join("") : `<p class="helper-line">No quiz attempts saved yet.</p>`;
  }
}

function initializeAdminPage() {
  const userRows = document.getElementById("adminUserRows");
  const userSelect = document.getElementById("adminUserSelect");
  const certificationSelect = document.getElementById("adminCertificationSelect");
  const prepScoreInput = document.getElementById("adminPrepScoreInput");
  const questionScoreInput = document.getElementById("adminQuestionScoreInput");
  const examScoreInput = document.getElementById("adminExamScoreInput");
  const statusSelect = document.getElementById("adminStatusSelect");
  const scoreForm = document.getElementById("adminScoreForm");

  if (!userRows || !scoreForm) {
    return;
  }

  let serverAdminUsers = [];
  let serverAdminCertifications = [...certificationCatalog];

  renderAdminDashboard();
  loadServerAdminDashboard();
  userSelect.addEventListener("change", hydrateAdminForm);
  certificationSelect.addEventListener("change", hydrateAdminForm);

  scoreForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const username = userSelect.value;
    const certificationName = certificationSelect.value;
    const prepScore = normalizeScoreInput(prepScoreInput.value);
    const questionScore = normalizeScoreInput(questionScoreInput.value);
    const examScore = normalizeScoreInput(examScoreInput.value);

    if ([prepScore, questionScore, examScore].includes(null)) {
      showToast("Admin scores must be blank or 0-100.");
      return;
    }

    if (serverAdminUsers.length) {
      try {
        await apiFetch("/api/admin/scores", {
          method: "POST",
          body: JSON.stringify({
            userId: username,
            certification: certificationName,
            prepScore,
            questionBankScore: questionScore,
            practiceExamScore: examScore,
            status: statusSelect.value
          })
        });
        showToast("Server admin score updated.");
        await loadServerAdminDashboard();
      } catch (error) {
        showToast(error.message || "Admin score update failed.");
      }
      return;
    }

    upsertCertificationProgress(username, certificationName, {
      prepScore,
      questionBankScore: questionScore,
      practiceExamScore: examScore,
      status: statusSelect.value
    });
    showToast(`Updated ${username}'s ${certificationName} record.`);
    renderAdminDashboard();
  });

  async function loadServerAdminDashboard() {
    try {
      const data = await apiFetch("/api/admin/users");
      serverAdminUsers = data.users || [];
      serverAdminCertifications = data.certifications || certificationCatalog;
      renderServerAdminDashboard();
    } catch {
      // The static/localStorage admin view remains available without the Node server.
    }
  }

  function renderServerAdminDashboard() {
    if (!serverAdminUsers.length) {
      return;
    }

    userSelect.innerHTML = serverAdminUsers.map((user) => {
      const label = `${user.displayName || user.email} (${user.email})`;
      return `<option value="${user.id}">${label}</option>`;
    }).join("");
    certificationSelect.innerHTML = serverAdminCertifications.map((certification) => `<option value="${certification}">${certification}</option>`).join("");

    userRows.innerHTML = serverAdminUsers.map((user) => {
      const progress = user.progress || createEmptyProgress();
      const entries = Object.entries(progress.certifications || {});
      const latestCert = entries[0] || [progress.selectedCertification || "None", {}];
      const latestAttempt = (progress.quizAttempts || [])[0];
      const record = latestCert[1] || {};
      return `
        <tr>
          <td>${user.displayName || user.email}</td>
          <td>${user.email}</td>
          <td>${formatRole(user.role)}</td>
          <td>${latestCert[0] || "None"}</td>
          <td>${record.status || "Not Started"}</td>
          <td>Prep: ${formatScore(record.prepScore)} | QB: ${formatScore(record.questionBankScore)} | Exam: ${formatScore(record.practiceExamScore || progress.practiceExamScore)}</td>
          <td>${latestAttempt ? `${latestAttempt.title}: ${latestAttempt.percent}%` : "No attempts"}</td>
        </tr>
      `;
    }).join("");

    hydrateAdminForm();
  }

  function renderAdminDashboard() {
    const accounts = getStoredObject(storageKeys.accounts, {});
    const progressStore = getStoredObject(storageKeys.userProgress, {});
    userSelect.innerHTML = Object.keys(accounts).map((username) => `<option value="${username}">${username}</option>`).join("");
    certificationSelect.innerHTML = certificationCatalog.map((certification) => `<option value="${certification}">${certification}</option>`).join("");

    userRows.innerHTML = Object.keys(accounts).map((username) => {
      const account = accounts[username];
      const progress = progressStore[username] || createEmptyProgress();
      const certEntries = Object.entries(progress.certifications || {});
      const latestCert = certEntries[0] || [progress.selectedCertification || "None", {}];
      const latestAttempt = (progress.quizAttempts || [])[0];
      const record = latestCert[1] || {};
      return `
        <tr>
          <td>${username}</td>
          <td>${account.email || "No email"}</td>
          <td>${formatRole(account.role)}</td>
          <td>${latestCert[0] || "None"}</td>
          <td>${record.status || "Not Started"}</td>
          <td>Prep: ${formatScore(record.prepScore)} | QB: ${formatScore(record.questionBankScore)} | Exam: ${formatScore(record.practiceExamScore || progress.practiceExamScore)}</td>
          <td>${latestAttempt ? `${latestAttempt.title}: ${latestAttempt.percent}%` : "No attempts"}</td>
        </tr>
      `;
    }).join("");

    hydrateAdminForm();
  }

  function hydrateAdminForm() {
    if (serverAdminUsers.length) {
      const user = serverAdminUsers.find((candidate) => candidate.id === userSelect.value);
      const certificationName = certificationSelect.value;
      const progress = user?.progress || createEmptyProgress();
      const record = progress.certifications?.[certificationName] || {};
      prepScoreInput.value = record.prepScore || "";
      questionScoreInput.value = record.questionBankScore || "";
      examScoreInput.value = record.practiceExamScore || progress.practiceExamScore || "";
      statusSelect.value = record.status || "Not Started";
      return;
    }

    const username = userSelect.value;
    const certificationName = certificationSelect.value;
    const progress = getUserProgress(username);
    const record = progress.certifications[certificationName] || {};
    prepScoreInput.value = record.prepScore || "";
    questionScoreInput.value = record.questionBankScore || "";
    examScoreInput.value = record.practiceExamScore || progress.practiceExamScore || "";
    statusSelect.value = record.status || "Not Started";
  }
}

function initializeAdminPracticeGradesPage() {
  const gradeRows = document.getElementById("adminPracticeGradeRows");
  const helpGrid = document.getElementById("adminStudentHelpGrid");
  const userSelect = document.getElementById("gradeUserSelect");
  const attemptSelect = document.getElementById("gradeAttemptSelect");
  const percentInput = document.getElementById("gradePercentInput");
  const noteInput = document.getElementById("gradeNoteInput");
  const editForm = document.getElementById("practiceGradeEditForm");
  const emptyState = document.getElementById("practiceGradesEmptyState");

  if (!gradeRows || !editForm) {
    return;
  }

  let adminUsers = getLocalAdminUsers();
  let gradeRowsData = adminPracticeExamTools.collectPracticeExamRows(adminUsers);
  renderAdminPracticeGrades();
  loadServerPracticeGrades();

  userSelect.addEventListener("change", () => {
    hydratePracticeGradeAttemptOptions();
  });

  attemptSelect.addEventListener("change", () => {
    hydratePracticeGradeForm();
  });

  editForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const userId = userSelect.value;
    const attemptId = attemptSelect.value;
    const percent = adminPracticeExamTools.normalizePercent(percentInput.value);
    if (percent === null) {
      showToast("Enter a practice exam score from 0 to 100.");
      return;
    }

    if (adminUsers.some((user) => user.id === userId && user.serverBacked)) {
      try {
        await apiFetch("/api/admin/practice-exam-score", {
          method: "POST",
          body: JSON.stringify({
            userId,
            attemptId,
            percent,
            note: noteInput.value.trim()
          })
        });
        showToast("Server practice exam score adjusted.");
        await loadServerPracticeGrades();
      } catch (error) {
        showToast(error.message || "Practice exam score update failed.");
      }
      return;
    }

    const progressStore = getStoredObject(storageKeys.userProgress, {});
    const progress = progressStore[userId] || createEmptyProgress();
    const result = adminPracticeExamTools.adjustPracticeExamScore(progress, attemptId, percent, noteInput.value.trim());
    if (!result.ok) {
      showToast(result.reason);
      return;
    }

    progressStore[userId] = result.progress;
    localStorage.setItem(storageKeys.userProgress, JSON.stringify(progressStore));
    showToast("Local practice exam score adjusted.");
    adminUsers = getLocalAdminUsers();
    gradeRowsData = adminPracticeExamTools.collectPracticeExamRows(adminUsers);
    renderAdminPracticeGrades();
  });

  async function loadServerPracticeGrades() {
    try {
      const data = await apiFetch("/api/admin/users");
      if (!data.users || !data.users.length) {
        return;
      }

      adminUsers = data.users.map((user) => ({ ...user, serverBacked: true }));
      gradeRowsData = adminPracticeExamTools.collectPracticeExamRows(adminUsers);
      renderAdminPracticeGrades();
    } catch {
      // Static/localStorage mode remains available when the Node server is offline.
    }
  }

  function renderAdminPracticeGrades() {
    const hasRows = gradeRowsData.length > 0;
    gradeRows.innerHTML = hasRows ? gradeRowsData.map((row) => `
      <tr>
        <td>${escapeAdminHtml(row.displayName)}</td>
        <td>${escapeAdminHtml(row.email)}</td>
        <td>${escapeAdminHtml(row.examName)}</td>
        <td>${row.score}/${row.total}</td>
        <td>${row.percent}%${row.manuallyAdjusted ? ` <span class="badge hot">Adjusted</span>` : ""}</td>
        <td>${row.submittedAt ? new Date(row.submittedAt).toLocaleString() : "Not recorded"}</td>
        <td>${renderSubunitSummary(row.subunitResults)}</td>
      </tr>
    `).join("") : "";

    if (emptyState) {
      emptyState.classList.toggle("hidden", hasRows);
    }

    renderStudentHelpInsights();
    hydratePracticeGradeUserOptions();
  }

  function renderStudentHelpInsights() {
    if (!helpGrid) {
      return;
    }

    const userCards = adminUsers.map((user) => {
      const attempts = gradeRowsData.filter((row) => row.userId === (user.id || user.username || user.email));
      const insight = adminPracticeExamTools.summarizeHelpNeeds(attempts.map((row) => row.rawAttempt));
      const weakAreas = insight.weakAreas.length
        ? insight.weakAreas.map((area) => `<li>${escapeAdminHtml(area.subunit)}: ${area.averagePercent}% avg</li>`).join("")
        : "<li>No weak category detected yet.</li>";
      return `
        <article class="insight-card">
          <span class="badge ${insight.needsHelp ? "hot" : "electric"}">${insight.needsHelp ? "Needs support" : "On track"}</span>
          <h3>${escapeAdminHtml(user.displayName || user.username || user.email || "Learner")}</h3>
          <p>${escapeAdminHtml(user.email || user.id || "No email")}</p>
          <ul>${weakAreas}</ul>
          <p class="helper-line">${insight.missedCount} missed question${insight.missedCount === 1 ? "" : "s"} tracked; ${insight.unansweredCount} unanswered response${insight.unansweredCount === 1 ? "" : "s"}.</p>
        </article>
      `;
    });

    helpGrid.innerHTML = userCards.join("") || `<p class="helper-line">No student help insights available yet.</p>`;
  }

  function hydratePracticeGradeUserOptions() {
    if (!userSelect || !attemptSelect) {
      return;
    }

    const usersWithAttempts = adminUsers.filter((user) => {
      const userId = user.id || user.username || user.email;
      return gradeRowsData.some((row) => row.userId === userId);
    });
    userSelect.innerHTML = usersWithAttempts.map((user) => {
      const userId = user.id || user.username || user.email;
      const label = user.displayName || user.username || user.email || userId;
      return `<option value="${escapeAdminHtml(userId)}">${escapeAdminHtml(label)}</option>`;
    }).join("");
    hydratePracticeGradeAttemptOptions();
  }

  function hydratePracticeGradeAttemptOptions() {
    const userRows = gradeRowsData.filter((row) => row.userId === userSelect.value);
    attemptSelect.innerHTML = userRows.map((row) => `
      <option value="${escapeAdminHtml(row.id)}">${escapeAdminHtml(row.examName)} - ${row.percent}%</option>
    `).join("");
    hydratePracticeGradeForm();
  }

  function hydratePracticeGradeForm() {
    const row = gradeRowsData.find((candidate) => candidate.userId === userSelect.value && candidate.id === attemptSelect.value);
    percentInput.value = row ? row.percent : "";
    noteInput.value = row?.adjustmentNote || "";
  }

  function renderSubunitSummary(results) {
    if (!results || !results.length) {
      return "No category breakdown";
    }

    return results.slice(0, 3).map((result) => `${escapeAdminHtml(result.subunit)} ${Number(result.percent || 0)}%`).join("<br>");
  }
}

function getLocalAdminUsers() {
  const accounts = getStoredObject(storageKeys.accounts, {});
  const progressStore = getStoredObject(storageKeys.userProgress, {});
  return Object.keys(accounts).map((username) => ({
    id: username,
    username,
    displayName: accounts[username].displayName || username,
    email: accounts[username].email || username,
    role: accounts[username].role || "student",
    progress: progressStore[username] || createEmptyProgress()
  }));
}

function escapeAdminHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[character]));
}

function initializeWelcomePage() {
  const welcomeName = document.getElementById("welcomeUserName");
  const nextAction = document.getElementById("welcomeNextAction");
  const username = getCurrentUsername();
  const account = getCurrentUserAccount();

  if (welcomeName) {
    welcomeName.textContent = username ? `Welcome, ${account.displayName || username}` : "Welcome to SOC Bootcamp";
  }

  if (nextAction) {
    nextAction.href = account.role === "admin" ? "admin.html" : "certifications.html";
    nextAction.textContent = account.role === "admin" ? "Open Admin Dashboard" : "Start Certification Prep";
  }
}

function initializeResourcesPage() {
  document.querySelectorAll("[data-resource-toast]").forEach((button) => {
    button.addEventListener("click", () => {
      showToast(button.dataset.resourceToast || "Resource placeholder saved for future content.");
    });
  });
}

function initializeTestsPage() {
  const runButton = document.getElementById("runQaTestsButton");
  const results = document.getElementById("qaTestResults");
  if (!runButton || !results) {
    return;
  }

  runButton.addEventListener("click", () => {
    const checks = [
      {
        name: "Admin account is reserved",
        pass: demoAccounts[RESERVED_ADMIN_USERNAME].role === "admin"
          && demoAccounts[RESERVED_ADMIN_USERNAME].password === RESERVED_ADMIN_PASSWORD
      },
      {
        name: "Email lookup finds demo student",
        pass: findAccountByEmail("student@socbootcamp.local")?.username === "student"
      },
      {
        name: "Only the five approved certifications are available",
        pass: certificationCatalog.length === 5 && certificationCatalog.every((name) => [
          "Pearson Cybersecurity",
          "Pearson Network Security",
          "Pearson Networking",
          "CompTIA Network Plus",
          "CompTIA Security Plus"
        ].includes(name))
      },
      {
        name: "Quiz directory has questions",
        pass: certificationQuizzes.every((quiz) => quiz.questions.length > 0)
      },
      {
        name: "Score validator accepts 0-100 and rejects invalid",
        pass: normalizeScoreInput("88") === "88" && normalizeScoreInput("150") === null
      },
      {
        name: "MFA expiration helper rejects old codes",
        pass: isChallengeExpired({ expiresAt: new Date(Date.now() - 1000).toISOString() })
      },
      {
        name: "Google demo username generator supports email signup",
        pass: createUsernameFromEmail("codex.user@gmail.com").startsWith("codexuser")
      }
    ];

    results.innerHTML = checks.map((check) => `
      <article class="attempt-item ${check.pass ? "test-pass" : "test-fail"}">
        <strong>${check.pass ? "PASS" : "FAIL"}: ${check.name}</strong>
      </article>
    `).join("");

    showToast(`${checks.filter((check) => check.pass).length}/${checks.length} QA checks passed.`);
  });
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
  const kaliGuideTabButton = document.getElementById("kaliGuideTabButton");
  const kaliQuizTabButton = document.getElementById("kaliQuizTabButton");
  const socaiTabButton = document.getElementById("socaiTabButton");
  const kaliGuideLayout = document.querySelector(".kali-chat-layout");
  const kaliQuizSection = document.getElementById("kaliQuizSection");
  let activeSection = localStorage.getItem(storageKeys.kaliLastSection) || "intro";

  renderGuideSection(activeSection);
  updateCompletedUi();
  initializeQuiz();
  initializeSocai();

  if (kaliGuideTabButton && kaliGuideLayout) {
    kaliGuideTabButton.addEventListener("click", () => {
      setKaliPracticeTab(kaliGuideTabButton);
      kaliGuideLayout.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  if (kaliQuizTabButton && kaliQuizSection) {
    kaliQuizTabButton.addEventListener("click", () => {
      setKaliPracticeTab(kaliQuizTabButton);
      kaliQuizSection.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  if (socaiTabButton) {
    socaiTabButton.addEventListener("click", () => {
      setKaliPracticeTab(socaiTabButton);
    });
  }

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

  function setKaliPracticeTab(activeButton) {
    document.querySelectorAll(".practice-tab").forEach((button) => {
      button.classList.toggle("active", button === activeButton);
    });
  }

  function initializeQuiz() {
    const quizBody = document.getElementById("quizBody");
    const nextQuestionButton = document.getElementById("nextQuestionButton");
    const retryQuizButton = document.getElementById("retryQuizButton");
    const quizProgressLabel = document.getElementById("quizProgressLabel");
    const dragonCoachContent = document.getElementById("dragonCoachContent");
    const dragonCoachMood = document.getElementById("dragonCoachMood");
    const dragonCoachCard = document.querySelector(".dragon-coach-card");
    const dragonHintButton = document.getElementById("dragonHintButton");
    const dragonPepButton = document.getElementById("dragonPepButton");
    const dragonCoachStreak = document.getElementById("dragonCoachStreak");
    const dragonCoachAccuracy = document.getElementById("dragonCoachAccuracy");
    let currentQuestionIndex = 0;
    let score = 0;
    let answeredQuestions = 0;
    let coachStreak = Number(localStorage.getItem(storageKeys.kaliCoachStreak) || 0);
    let hasAnswered = false;
    let currentQuestion = getEndlessQuizQuestion(currentQuestionIndex);

    if (!quizBody || !nextQuestionButton || !retryQuizButton || !quizProgressLabel) {
      return;
    }

    updateSavedScoreLabel();
    retryQuizButton.textContent = "Restart Endless Quiz";
    retryQuizButton.classList.remove("hidden");
    renderQuestion();

    nextQuestionButton.addEventListener("click", () => {
      if (!hasAnswered) {
        showToast("Choose an answer before continuing.");
        return;
      }

      currentQuestionIndex += 1;
      hasAnswered = false;
      renderQuestion();
    });

    retryQuizButton.addEventListener("click", () => {
      currentQuestionIndex = 0;
      score = 0;
      answeredQuestions = 0;
      coachStreak = 0;
      hasAnswered = false;
      localStorage.setItem(storageKeys.kaliCoachStreak, String(coachStreak));
      updateSavedScoreLabel();
      updateCoachStats();
      renderQuestion();
      showToast("Endless quiz restarted.");
    });

    if (dragonHintButton) {
      dragonHintButton.addEventListener("click", () => {
        if (hasAnswered) {
          renderDragonCoachAnswer(currentQuestion, currentQuestion.correct, true, "review");
          return;
        }

        renderDragonCoachHint(currentQuestion);
      });
    }

    if (dragonPepButton) {
      dragonPepButton.addEventListener("click", () => {
        renderDragonCoachPepTalk();
      });
    }

    function renderQuestion() {
      currentQuestion = getEndlessQuizQuestion(currentQuestionIndex);
      quizProgressLabel.textContent = `Question ${currentQuestionIndex + 1} • Endless Mode`;
      nextQuestionButton.textContent = "Next Question";
      quizProgressLabel.textContent = `Question ${currentQuestionIndex + 1} - Endless Mode`;
      quizBody.innerHTML = `
        <p class="question-title">${escapeQuizHtml(currentQuestion.question)}</p>
        <div class="answer-grid">
          ${currentQuestion.answers.map((answer, index) => `
            <button class="answer-button" type="button" data-answer="${index}">${escapeQuizHtml(answer)}</button>
          `).join("")}
        </div>
        <p class="feedback-text" id="quizFeedback"></p>
        <p class="micro-copy">Endless quiz mode generates new Kali questions from the SOCAI command library after the starter questions.</p>
      `;
      renderDragonCoachIntro(currentQuestion);
      setCoachState("thinking");
      updateCoachStats();

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
      const feedback = document.getElementById("quizFeedback");
      const isCorrect = answerIndex === currentQuestion.correct;

      answerButtons.forEach((button) => {
        const buttonAnswer = Number(button.dataset.answer);
        button.disabled = true;

        if (buttonAnswer === currentQuestion.correct) {
          button.classList.add("correct");
        }

        if (buttonAnswer === answerIndex && !isCorrect) {
          button.classList.add("incorrect");
        }
      });

      if (isCorrect) {
        score += 1;
        coachStreak += 1;
        feedback.textContent = "Correct. Strong analyst instincts.";
      } else {
        coachStreak = 0;
        feedback.textContent = `Not quite. Correct answer: ${currentQuestion.answers[currentQuestion.correct]}.`;
      }

      localStorage.setItem(storageKeys.kaliCoachStreak, String(coachStreak));
      setCoachState(isCorrect ? "happy" : "review");
      renderDragonCoachAnswer(currentQuestion, answerIndex, isCorrect);

      const answered = currentQuestionIndex + 1;
      answeredQuestions = answered;
      const percent = Math.round((score / answered) * 100);
      const scoreText = `${score}/${answered} (${percent}%)`;
      localStorage.setItem(storageKeys.kaliQuizScore, scoreText);
      updateSavedScoreLabel();
      updateCoachStats(percent);

      if (answered % 10 === 0) {
        saveQuizAttemptForCurrentUser({
          quizId: "kali-linux-guide-endless",
          title: "Kali Linux Endless Quiz",
          certification: "Kali Linux Guide",
          score,
          total: answered,
          percent
        });
        showToast("Endless quiz checkpoint saved.");
      }
    }

    function updateSavedScoreLabel() {
      const savedScore = localStorage.getItem(storageKeys.kaliQuizScore);
      savedScoreLabel.textContent = savedScore ? `Endless Score: ${savedScore}` : "Endless Score: none";
    }

    function renderDragonCoachIntro(question) {
      if (!dragonCoachContent) {
        return;
      }

      if (dragonCoachMood) {
        dragonCoachMood.textContent = pickCoachLine([
          "Read the question first",
          "Look for the key clue",
          "Choose carefully"
        ]);
      }

      dragonCoachContent.innerHTML = `
        <div class="dragon-chat-row">
          <div class="dragon-mini-face" aria-hidden="true"></div>
          <div class="dragon-chat-bubble coach-speech">
            <strong>${escapeQuizHtml(pickCoachLine([
              "I spotted the clue.",
              "Let's hunt the best answer.",
              "Tiny hint: match the command to the job."
            ]))}</strong>
            <p>${escapeQuizHtml(getCoachQuestionNudge(question))}</p>
          </div>
        </div>
        <div class="dragon-prompt-card">
          <span>Current mission</span>
          <p>${escapeQuizHtml(question.question)}</p>
        </div>
      `;
    }

    function renderDragonCoachAnswer(question, selectedIndex, isCorrect, mode = "answered") {
      if (!dragonCoachContent) {
        return;
      }

      const correctAnswer = question.answers[question.correct];
      const selectedAnswer = question.answers[selectedIndex];
      const coachLead = isCorrect
        ? pickCoachLine(["Clean hit.", "You nailed it.", "That answer had the right scent."])
        : pickCoachLine(["Close enough to learn from.", "Let's sharpen that one.", "No panic, we fix the pattern."]);
      const explanations = question.explanations || question.answers.map((answer, index) => (
        index === question.correct
          ? `${answer} is the best answer for this question.`
          : `${answer} is not the best fit for what the question asks.`
      ));

      if (dragonCoachMood) {
        dragonCoachMood.textContent = isCorrect ? "Correct breakdown" : "Review breakdown";
      }

      dragonCoachContent.innerHTML = `
        <div class="dragon-chat-row">
          <div class="dragon-mini-face ${isCorrect ? "happy" : "review"}" aria-hidden="true"></div>
          <div class="dragon-chat-bubble coach-speech ${isCorrect ? "success" : "review"}">
            <strong>${escapeQuizHtml(coachLead)}</strong>
            <p>${escapeQuizHtml(mode === "review" ? `The answer to remember is ${correctAnswer}.` : `You chose ${selectedAnswer}. The best answer is ${correctAnswer}.`)}</p>
          </div>
        </div>
        <div class="dragon-answer-list">
          ${question.answers.map((answer, index) => `
            <article class="dragon-option ${index === question.correct ? "correct" : "wrong"} ${index === selectedIndex ? "selected" : ""}">
              <strong>${index === question.correct ? "Right answer" : "Why this is wrong"}: ${escapeQuizHtml(answer)}</strong>
              <p>${escapeQuizHtml(explanations[index])}</p>
            </article>
          `).join("")}
        </div>
      `;
    }

    function renderDragonCoachHint(question) {
      if (!dragonCoachContent) {
        return;
      }

      setCoachState("hinting");
      if (dragonCoachMood) {
        dragonCoachMood.textContent = "Hint mode";
      }

      dragonCoachContent.innerHTML = `
        <div class="dragon-chat-row">
          <div class="dragon-mini-face hinting" aria-hidden="true"></div>
          <div class="dragon-chat-bubble coach-speech">
            <strong>${escapeQuizHtml(pickCoachLine(["Tiny clue.", "Look here.", "Use this hint."]))}</strong>
            <p>${escapeQuizHtml(getCoachHint(question))}</p>
          </div>
        </div>
        <div class="dragon-prompt-card">
          <span>Coach rule</span>
          <p>Match the action in the question to the command or concept that does that exact job.</p>
        </div>
      `;
    }

    function renderDragonCoachPepTalk() {
      if (!dragonCoachContent) {
        return;
      }

      setCoachState("happy");
      if (dragonCoachMood) {
        dragonCoachMood.textContent = "Coach boost";
      }

      dragonCoachContent.innerHTML = `
        <div class="dragon-chat-row">
        <div class="dragon-mini-face happy" aria-hidden="true"></div>
        <div class="dragon-chat-bubble coach-speech success">
            <span class="pep-talk-rule">Reading is fundamental.</span>
            <strong>${escapeQuizHtml(pickCoachLine(["Stay sharp.", "You are building analyst instincts.", "One question at a time."]))}</strong>
            <p>${escapeQuizHtml(pickCoachLine([
              "Even wrong answers are useful if you understand why they were wrong.",
              "Read the command, read the task, then choose the smallest tool that solves it.",
              `Current streak: ${coachStreak}. Keep the chain alive by slowing down for the clue word.`
            ]))}</p>
          </div>
        </div>
      `;
    }

    function getCoachQuestionNudge(question) {
      const text = `${question.question} ${question.answers.join(" ")}`.toLowerCase();

      if (text.includes("authorized") || text.includes("safe")) {
        return "This is a permission question. The safest option is the one with clear authorization and boundaries.";
      }

      if (text.includes("what does")) {
        return "This asks for purpose. Ignore answer choices that describe a different command's job.";
      }

      if (text.includes("category")) {
        return "This asks for a SOCAI category. Think about where the command would live in your toolkit.";
      }

      if (text.includes("example")) {
        return "This asks for syntax. Look for the example that actually starts with or demonstrates the named command.";
      }

      return "Find the clue word in the question, then choose the command that does that exact job.";
    }

    function getCoachHint(question) {
      const correctAnswer = question.answers[question.correct];
      const correctExplanation = question.explanations?.[question.correct] || "";
      const firstWord = String(correctAnswer).split(" ")[0];

      if (question.question.toLowerCase().includes("example")) {
        return `The right option should demonstrate ${firstWord} directly. Watch for examples that belong to another command.`;
      }

      if (question.question.toLowerCase().includes("category")) {
        return `Think about what ${firstWord} is normally used for, then match it to that toolkit category.`;
      }

      if (correctExplanation) {
        return correctExplanation.replace(correctAnswer, `${firstWord}...`);
      }

      return `The answer starts with "${firstWord.charAt(0)}" and matches the exact job in the question.`;
    }

    function updateCoachStats(accuracyOverride) {
      if (dragonCoachStreak) {
        dragonCoachStreak.textContent = String(coachStreak);
      }

      if (dragonCoachAccuracy) {
        const accuracy = typeof accuracyOverride === "number"
          ? accuracyOverride
          : answeredQuestions > 0
            ? Math.round((score / answeredQuestions) * 100)
            : 0;
        dragonCoachAccuracy.textContent = `${accuracy}%`;
      }
    }

    function setCoachState(state) {
      if (dragonCoachCard) {
        dragonCoachCard.dataset.coachState = state;
      }
    }

    function pickCoachLine(lines) {
      return lines[(currentQuestionIndex + coachStreak + score) % lines.length];
    }

    function escapeQuizHtml(value) {
      return String(value ?? "").replace(/[&<>"']/g, (character) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\"": "&quot;",
        "'": "&#39;"
      }[character]));
    }
  }

  function initializeSocai() {
    const socaiForm = document.getElementById("socaiForm");
    const socaiInput = document.getElementById("socaiInput");
    const socaiMessages = document.getElementById("socaiMessages");
    const socaiTabButton = document.getElementById("socaiTabButton");
    const socaiCard = document.getElementById("socaiCard");
    const socaiCommandCount = document.getElementById("socaiCommandCount");
    const suggestionButtons = document.querySelectorAll(".socai-suggestions button");

    if (!socaiForm || !socaiInput || !socaiMessages) {
      return;
    }

    if (socaiCommandCount) {
      socaiCommandCount.textContent = `${socaiKnowledge.length} Commands Loaded`;
    }

    if (socaiTabButton && socaiCard) {
      socaiTabButton.addEventListener("click", () => {
        socaiCard.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }

    suggestionButtons.forEach((button) => {
      button.addEventListener("click", () => {
        socaiInput.value = button.dataset.query || button.textContent;
        socaiInput.focus();
        if (typeof socaiForm.requestSubmit === "function") {
          socaiForm.requestSubmit();
        } else {
          socaiForm.dispatchEvent(new Event("submit", { cancelable: true }));
        }
      });
    });

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

      messageElement.className = `socai-message ${className}`;
      authorElement.textContent = author;
      messageElement.appendChild(authorElement);

      if (typeof message === "string") {
        const bodyElement = document.createElement("p");
        bodyElement.textContent = message;
        messageElement.appendChild(bodyElement);
      } else {
        renderSocaiResult(messageElement, message);
      }

      socaiMessages.appendChild(messageElement);
    }

    function buildSocaiAnswer(query) {
      const normalizedQuery = normalizeSocaiText(query);
      const tokens = normalizedQuery.split(" ").filter((token) => token.length > 1);
      const asksForAllCommands = /\b(all|list|show|every|commands)\b/.test(normalizedQuery)
        && /\b(commands|tools|cheatsheet|cheat sheet)\b/.test(normalizedQuery);

      if (asksForAllCommands) {
        return {
          intro: `SOCAI currently has ${socaiKnowledge.length} Kali/Linux commands loaded. Here is a starter view; search by category or exact command to narrow it down.`,
          entries: socaiKnowledge.slice(0, 12),
          footer: "Loaded categories include Navigation, Files, Search, Permissions, Processes, Services, Packages, Networking, DNS, Packets, Scanning, Enumeration, Web, Wireless, Forensics, Passwords, Detection, Logs, Archive, Disk, Utility, and Frameworks."
        };
      }

      const rankedMatches = socaiKnowledge
        .map((entry) => ({
          entry,
          score: scoreSocaiEntry(entry, normalizedQuery, tokens)
        }))
        .filter((result) => result.score > 0)
        .sort((a, b) => b.score - a.score || a.entry.command.localeCompare(b.entry.command))
        .slice(0, 6)
        .map((result) => result.entry);

      if (rankedMatches.length) {
        return {
          intro: `I found ${rankedMatches.length} command match${rankedMatches.length === 1 ? "" : "es"} for "${query}". Use these only in authorized labs and defensive workflows.`,
          entries: rankedMatches,
          footer: "Try asking by exact command, task, or category: DNS, packet capture, web testing, forensics, passwords, logs, permissions, services, or packages."
        };
      }

      const outlineTitles = Object.values(guideSections).map((section) => section.title).join(", ");
      return {
        intro: `I could not find an exact command match for "${query}" yet.`,
        entries: [],
        footer: `Current guide areas are: ${outlineTitles}. Try a command like nmap, grep, tcpdump, gobuster, john, systemctl, curl, dig, or ask for a category like "network commands".`
      };
    }

    function normalizeSocaiText(value) {
      return String(value || "")
        .toLowerCase()
        .replace(/[^a-z0-9+._/-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    function scoreSocaiEntry(entry, normalizedQuery, tokens) {
      const command = normalizeSocaiText(entry.command);
      const baseCommand = command.split(" ")[0];
      const category = normalizeSocaiText(entry.category);
      const haystack = normalizeSocaiText([
        entry.command,
        entry.category,
        entry.summary,
        entry.example,
        entry.note,
        ...entry.keywords
      ].join(" "));
      let score = 0;

      if (normalizedQuery === command || normalizedQuery === baseCommand) {
        score += 40;
      }
      if (normalizedQuery.includes(command) || normalizedQuery.includes(baseCommand)) {
        score += 24;
      }
      if (command.includes(normalizedQuery) && normalizedQuery.length >= 2) {
        score += 18;
      }
      if (normalizedQuery.includes(category)) {
        score += 14;
      }

      entry.keywords.forEach((keyword) => {
        const normalizedKeyword = normalizeSocaiText(keyword);
        if (normalizedKeyword && normalizedQuery.includes(normalizedKeyword)) {
          score += 12;
        }
      });

      tokens.forEach((token) => {
        if (token === baseCommand) score += 18;
        if (category.includes(token)) score += 8;
        if (haystack.includes(token)) score += 3;
      });

      return score;
    }

    function renderSocaiResult(messageElement, result) {
      const intro = document.createElement("p");
      intro.textContent = result.intro;
      messageElement.appendChild(intro);

      if (result.entries.length) {
        const resultList = document.createElement("div");
        resultList.className = "socai-command-results";

        result.entries.forEach((entry) => {
          const card = document.createElement("article");
          card.className = "socai-command-card";

          const heading = document.createElement("div");
          heading.className = "socai-command-heading";

          const command = document.createElement("code");
          command.textContent = entry.command;

          const category = document.createElement("span");
          category.className = "badge electric";
          category.textContent = entry.category;

          const summary = document.createElement("p");
          summary.textContent = entry.summary;

          const example = document.createElement("code");
          example.className = "socai-example";
          example.textContent = entry.example;

          const note = document.createElement("p");
          note.className = "socai-note";
          note.textContent = entry.note;

          const breakdown = createSocaiBreakdown(entry);

          heading.append(command, category);
          card.append(heading, summary, example, note, breakdown);
          resultList.appendChild(card);
        });

        messageElement.appendChild(resultList);
      }

      const footer = document.createElement("p");
      footer.className = "socai-note";
      footer.textContent = result.footer;
      messageElement.appendChild(footer);
    }

    function createSocaiBreakdown(entry) {
      const breakdown = document.createElement("div");
      const title = document.createElement("strong");
      const list = document.createElement("div");
      const exampleRead = explainSocaiExample(entry);

      breakdown.className = "socai-command-breakdown";
      title.textContent = "Command Breakdown";
      list.className = "socai-breakdown-list";

      [
        ["Purpose", entry.summary],
        ["Best used for", `${entry.category} tasks in an authorized lab, training range, or defensive workflow.`],
        ["How to read it", exampleRead],
        ["Safety check", entry.note]
      ].forEach(([label, value]) => {
        const row = document.createElement("p");
        const rowLabel = document.createElement("span");
        const rowText = document.createElement("span");

        rowLabel.textContent = label;
        rowText.textContent = value;
        row.append(rowLabel, rowText);
        list.appendChild(row);
      });

      breakdown.append(title, list);
      return breakdown;
    }

    function explainSocaiExample(entry) {
      const commandName = entry.command.split(" ")[0];
      const exampleParts = entry.example.split(/\s+/).filter(Boolean);
      const startsWithSudo = exampleParts[0] === "sudo";
      const flags = exampleParts.filter((part) => part.startsWith("-"));
      const placeholders = exampleParts.filter((part) => part.includes("<") && part.includes(">"));
      const pieces = [];

      pieces.push(`${commandName} is the tool being used.`);

      if (startsWithSudo) {
        pieces.push("sudo means the example needs elevated permission, so only run it when you are allowed to administer the system.");
      }

      if (flags.length) {
        pieces.push(`${flags.join(", ")} are options that change how the command runs.`);
      }

      if (placeholders.length) {
        pieces.push(`${placeholders.join(", ")} should be replaced with your authorized host, domain, file, subnet, or lab target.`);
      }

      if (!flags.length && !placeholders.length && !startsWithSudo) {
        pieces.push("The example is intentionally simple, so you can run or study the basic form first.");
      }

      return pieces.join(" ");
    }
  }
}

function saveScoreFromInput(input, storageKey) {
  if (!input) {
    return false;
  }

  if (input.value.trim() === "") {
    return false;
  }

  const numericValue = Number(input.value);
  if (!Number.isFinite(numericValue) || numericValue < 0 || numericValue > 100) {
    showToast("Enter a score from 0 to 100.");
    return false;
  }

  localStorage.setItem(storageKey, String(Math.round(numericValue)));
  saveScoreForCurrentUser(storageKey, String(Math.round(numericValue)));
  return true;
}

function normalizeScoreInput(value) {
  if (String(value).trim() === "") {
    return "";
  }

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue < 0 || numericValue > 100) {
    return null;
  }

  return String(Math.round(numericValue));
}

function saveScoreForCurrentUser(storageKey, score) {
  const username = getCurrentUsername();
  if (!username) {
    return;
  }

  const progress = getUserProgress(username);
  const certificationName = progress.selectedCertification || localStorage.getItem(storageKeys.selectedCertification) || "General Certification";

  if (storageKey === storageKeys.practiceExamScore) {
    progress.practiceExamScore = score;
    if (certificationName) {
      upsertCertificationProgress(username, certificationName, { practiceExamScore: score });
    } else {
      saveUserProgress(username, progress);
    }
    apiFetch("/api/progress/scores", {
      method: "POST",
      body: JSON.stringify({ certification: certificationName, practiceExamScore: score })
    }).catch(() => {});
    return;
  }

  const updates = {};
  if (storageKey === storageKeys.certificationPrepScore) {
    updates.prepScore = score;
    updates.status = Number(score) >= 80 ? "Exam Ready" : "Studying";
  }

  if (storageKey === storageKeys.questionBankScore) {
    updates.questionBankScore = score;
  }

  upsertCertificationProgress(username, certificationName, updates);
  apiFetch("/api/progress/scores", {
    method: "POST",
    body: JSON.stringify({ certification: certificationName, ...updates })
  }).catch(() => {});
}

function getCurrentUserScoreByStorageKey(storageKey) {
  const progress = getCurrentUserProgress();
  const certificationName = progress.selectedCertification || localStorage.getItem(storageKeys.selectedCertification);
  const certRecord = certificationName ? progress.certifications[certificationName] : null;

  if (storageKey === storageKeys.practiceExamScore) {
    return progress.practiceExamScore || certRecord?.practiceExamScore || "";
  }

  if (storageKey === storageKeys.certificationPrepScore) {
    return certRecord?.prepScore || "";
  }

  if (storageKey === storageKeys.questionBankScore) {
    return certRecord?.questionBankScore || "";
  }

  return "";
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = value;
  }
}

function formatScore(score) {
  return score ? `${score}%` : "Not saved";
}

function extractPercent(scoreText) {
  if (!scoreText) {
    return "";
  }

  const match = scoreText.match(/\((\d+)%\)/);
  return match ? match[1] : "";
}

function calculateOverallScore(scores) {
  const numericScores = scores
    .filter((score) => score !== null && score !== "")
    .map((score) => Number(score))
    .filter((score) => Number.isFinite(score));

  if (!numericScores.length) {
    return "Not enough data";
  }

  const total = numericScores.reduce((sum, score) => sum + score, 0);
  return `${Math.round(total / numericScores.length)}%`;
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
