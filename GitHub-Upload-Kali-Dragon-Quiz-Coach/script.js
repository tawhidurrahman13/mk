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
  questionBankScore: "socBootcampQuestionBankScore",
  kaliLastSection: "socBootcampKaliLastSection",
  kaliCompletedSections: "socBootcampKaliCompletedSections",
  kaliQuizScore: "socBootcampKaliQuizScore",
  authRedirect: "socBootcampAuthRedirect",
  authNotice: "socBootcampAuthNotice",
  userProgress: "socBootcampUserProgress",
  mfaChallenge: "socBootcampMfaChallenge",
  resetChallenge: "socBootcampResetChallenge"
};

const demoAccounts = {
  student: {
    password: "student123",
    role: "student",
    displayName: "Student Analyst",
    email: "student@socbootcamp.local"
  },
  Akhter44: {
    password: "Akhter44",
    role: "admin",
    displayName: "Akhter44",
    email: "akhter44@socbootcamp.local"
  }
};

const MFA_CODE_TTL_MS = 5 * 60 * 1000;
const RESET_CODE_TTL_MS = 10 * 60 * 1000;
let serverCsrfToken = "";

const certificationCatalog = [
  "Pearson Cybersecurity",
  "Pearson Network Security",
  "Pearson Networking",
  "CompTIA Network Plus",
  "CompTIA Security Plus"
];

const certificationQuizzes = [
  {
    id: "pearson-cybersecurity",
    title: "Pearson Cybersecurity Quiz",
    certification: "Pearson Cybersecurity",
    difficulty: "Beginner",
    questions: [
      {
        question: "What is the main goal of cybersecurity in a SOC?",
        answers: ["Protect systems and data", "Design logos", "Increase screen brightness", "Disable all alerts"],
        correct: 0
      },
      {
        question: "Which activity happens first during alert triage?",
        answers: ["Review the alert context", "Delete the alert", "Ignore the timestamp", "Disable logging"],
        correct: 0
      },
      {
        question: "Which term describes a weakness attackers could exploit?",
        answers: ["Vulnerability", "Theme", "Bookmark", "Shortcut"],
        correct: 0
      }
    ]
  },
  {
    id: "pearson-network-security",
    title: "Pearson Network Security Quiz",
    certification: "Pearson Network Security",
    difficulty: "Intermediate",
    questions: [
      {
        question: "Which control filters network traffic based on rules?",
        answers: ["Firewall", "Text editor", "Media player", "Calendar"],
        correct: 0
      },
      {
        question: "What does network segmentation reduce?",
        answers: ["Blast radius", "Password length", "Screen size", "Patch notes"],
        correct: 0
      },
      {
        question: "Which tool is commonly used to inspect packets?",
        answers: ["Wireshark", "Calculator", "Notepad", "Paint"],
        correct: 0
      }
    ]
  },
  {
    id: "pearson-networking",
    title: "Pearson Networking Quiz",
    certification: "Pearson Networking",
    difficulty: "Beginner",
    questions: [
      {
        question: "Which protocol resolves names to IP addresses?",
        answers: ["DNS", "RDP", "SMTP", "SSH"],
        correct: 0
      },
      {
        question: "Which device forwards packets between networks?",
        answers: ["Router", "Keyboard", "Monitor", "Printer"],
        correct: 0
      },
      {
        question: "Which port is commonly used for HTTPS?",
        answers: ["443", "22", "53", "25"],
        correct: 0
      }
    ]
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
    questions: [
      {
        question: "Which authentication method uses more than one proof of identity?",
        answers: ["MFA", "DNS", "NAT", "ARP"],
        correct: 0
      },
      {
        question: "Which principle gives users only the access they need?",
        answers: ["Least privilege", "Maximum privilege", "Open sharing", "Guest mode"],
        correct: 0
      },
      {
        question: "Which process restores service after a security event?",
        answers: ["Incident response", "Icon sorting", "Font scaling", "Color matching"],
        correct: 0
      }
    ]
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

  if (page === "tests") {
    initializeTestsPage();
  }
});

function initializeGlobalUi() {
  // Shared navigation, mobile sidebar, and feedback toast behavior.
  const currentPage = document.body.dataset.page;
  const navLinks = document.querySelectorAll("[data-nav]");
  const menuToggle = document.getElementById("menuToggle");
  const sidebar = document.getElementById("sidebar");
  const feedbackButton = document.getElementById("feedbackButton");

  updateGlobalAccountUser();

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
  if (page !== "admin") {
    return false;
  }

  const account = getCurrentUserAccount();
  if (account.role === "admin") {
    return false;
  }

  localStorage.setItem(storageKeys.authNotice, "Admin dashboard is reserved for Akhter44.");
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
        if (username !== "Akhter44" || password !== "Akhter44") {
          usernameError.textContent = "The only Admin username is Akhter44.";
          passwordError.textContent = "Use the reserved Admin password to activate this account.";
          return;
        }

        accounts.Akhter44 = {
          password: "Akhter44",
          role: "admin",
          email: email || demoAccounts.Akhter44.email,
          displayName: "Akhter44"
        };
        localStorage.setItem(storageKeys.accounts, JSON.stringify(accounts));
        beginMfaChallenge("Akhter44", "Admin account active. Enter the email MFA code to continue.");
        return;
      }

      if (username === "Akhter44") {
        usernameError.textContent = "Akhter44 is reserved for the one Admin account.";
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
      roleHelpText.innerHTML = "Admin is one account only: <strong>Akhter44</strong> / <strong>Akhter44</strong>.";
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
    if (identifier.toLowerCase() === "akhter44") {
      return "akhter44@socbootcamp.local";
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
    const roleTarget = account.role === "admin" ? "admin.html" : (redirectTarget && redirectTarget !== "admin.html" ? redirectTarget : "index.html");

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

  Object.keys(accounts).forEach((username) => {
    const isReservedAdmin = username === "Akhter44";
    if (!isReservedAdmin && accounts[username].role === "admin") {
      accounts[username].role = "student";
      changed = true;
    }
  });

  Object.keys(demoAccounts).forEach((username) => {
    const demoAccount = demoAccounts[username];
    const isReservedAdmin = username === "Akhter44";
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
  let activeQuiz = null;
  let currentQuestionIndex = 0;
  let score = 0;
  let hasAnswered = false;

  if (!quizDirectoryGrid || !quizBody) {
    return;
  }

  renderQuizDirectory();
  renderAttempts();
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
    if (currentQuestionIndex >= activeQuiz.questions.length) {
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

  function startQuiz(quizId) {
    activeQuiz = certificationQuizzes.find((quiz) => quiz.id === quizId);
    currentQuestionIndex = 0;
    score = 0;
    hasAnswered = false;
    retryButton.classList.add("hidden");
    nextButton.classList.remove("hidden");
    renderActiveQuestion();
    showToast(`${activeQuiz.title} loaded.`);
  }

  function renderActiveQuestion() {
    const question = activeQuiz.questions[currentQuestionIndex];
    quizTitle.textContent = activeQuiz.title;
    quizProgress.textContent = `Question ${currentQuestionIndex + 1} of ${activeQuiz.questions.length}`;
    quizBody.innerHTML = `
      <p class="question-title">${question.question}</p>
      <div class="answer-grid">
        ${question.answers.map((answer, index) => `
          <button class="answer-button" type="button" data-answer="${index}">${answer}</button>
        `).join("")}
      </div>
      <p class="feedback-text" id="certQuizFeedback"></p>
    `;

    quizBody.querySelectorAll(".answer-button").forEach((button) => {
      button.addEventListener("click", () => handleQuizAnswer(Number(button.dataset.answer)));
    });
  }

  function handleQuizAnswer(answerIndex) {
    if (hasAnswered) {
      return;
    }

    hasAnswered = true;
    const question = activeQuiz.questions[currentQuestionIndex];
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
      feedback.textContent = "Correct. Saved analyst momentum.";
    } else {
      feedback.textContent = `Not quite. Correct answer: ${question.answers[question.correct]}.`;
    }
  }

  function showQuizResult() {
    const percent = Math.round((score / activeQuiz.questions.length) * 100);
    saveQuizAttemptForCurrentUser({
      quizId: activeQuiz.id,
      title: activeQuiz.title,
      certification: activeQuiz.certification,
      score,
      total: activeQuiz.questions.length,
      percent
    });

    quizProgress.textContent = "Quiz Complete";
    quizBody.innerHTML = `
      <p class="question-title">Final Score: ${score}/${activeQuiz.questions.length} (${percent}%)</p>
      <p class="feedback-text">Attempt saved to your user account and visible to Admin oversight.</p>
    `;
    nextButton.classList.add("hidden");
    retryButton.classList.remove("hidden");
    renderAttempts();
    showToast("Certification quiz attempt saved.");
  }

  function renderAttempts() {
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
        pass: demoAccounts.Akhter44.role === "admin" && demoAccounts.Akhter44.password === "Akhter44"
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
    const dragonCoachContent = document.getElementById("dragonCoachContent");
    const dragonCoachMood = document.getElementById("dragonCoachMood");
    let currentQuestionIndex = 0;
    let score = 0;
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
      hasAnswered = false;
      updateSavedScoreLabel();
      renderQuestion();
      showToast("Endless quiz restarted.");
    });

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
        feedback.textContent = "Correct. Strong analyst instincts.";
      } else {
        feedback.textContent = `Not quite. Correct answer: ${currentQuestion.answers[currentQuestion.correct]}.`;
      }

      renderDragonCoachAnswer(currentQuestion, answerIndex, isCorrect);

      const answered = currentQuestionIndex + 1;
      const percent = Math.round((score / answered) * 100);
      const scoreText = `${score}/${answered} (${percent}%)`;
      localStorage.setItem(storageKeys.kaliQuizScore, scoreText);
      updateSavedScoreLabel();

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
        dragonCoachMood.textContent = "Ready to explain";
      }

      dragonCoachContent.innerHTML = `
        <div class="dragon-chat-bubble">
          <strong>Little Dragon is watching the choices.</strong>
          <p>Pick an answer and I will break down every option, including why the right answer is right and why each other answer misses the question.</p>
        </div>
        <div class="dragon-prompt-card">
          <span>Current question</span>
          <p>${escapeQuizHtml(question.question)}</p>
        </div>
      `;
    }

    function renderDragonCoachAnswer(question, selectedIndex, isCorrect) {
      if (!dragonCoachContent) {
        return;
      }

      const correctAnswer = question.answers[question.correct];
      const selectedAnswer = question.answers[selectedIndex];
      const explanations = question.explanations || question.answers.map((answer, index) => (
        index === question.correct
          ? `${answer} is the best answer for this question.`
          : `${answer} is not the best fit for what the question asks.`
      ));

      if (dragonCoachMood) {
        dragonCoachMood.textContent = isCorrect ? "Correct breakdown" : "Review breakdown";
      }

      dragonCoachContent.innerHTML = `
        <div class="dragon-chat-bubble ${isCorrect ? "success" : "review"}">
          <strong>${isCorrect ? "Correct answer." : "Good attempt. Let's review it."}</strong>
          <p>You chose ${escapeQuizHtml(selectedAnswer)}. The best answer is ${escapeQuizHtml(correctAnswer)}.</p>
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

          heading.append(command, category);
          card.append(heading, summary, example, note);
          resultList.appendChild(card);
        });

        messageElement.appendChild(resultList);
      }

      const footer = document.createElement("p");
      footer.className = "socai-note";
      footer.textContent = result.footer;
      messageElement.appendChild(footer);
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
