const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const self = path.relative(root, __filename).replace(/\\/g, "/");
const textExtensions = new Set([
  ".js", ".json", ".md", ".yml", ".yaml", ".wxml", ".wxss", ".html", ".css", ".txt", ".env", ".sh", ".cmd"
]);

const rules = [
  {
    name: "private key material",
    pattern: new RegExp(["-----BEGIN ", "(?:RSA |EC |OPENSSH )?", "PRIVATE KEY-----"].join(""), "i")
  },
  {
    name: "OpenAI-style API key",
    pattern: /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}\b/
  },
  {
    name: "GitHub personal/access token",
    pattern: /\b(?:ghp|github_pat)_[A-Za-z0-9_]{20,}\b/
  },
  {
    name: "AWS access key",
    pattern: /\bAKIA[0-9A-Z]{16}\b/
  }
];

function trackedFiles() {
  return execFileSync("git", ["ls-files", "-z"], { cwd: root })
    .toString("utf8")
    .split("\0")
    .filter(Boolean);
}

function shouldScan(relativePath) {
  if (relativePath === self) return false;
  const basename = path.basename(relativePath);
  if (["package-lock.json", "npm-shrinkwrap.json"].includes(basename)) return false;
  if (basename.startsWith(".env")) return true;
  return textExtensions.has(path.extname(relativePath).toLowerCase());
}

const findings = [];
for (const relativePath of trackedFiles().filter(shouldScan)) {
  let content;
  try {
    content = fs.readFileSync(path.join(root, relativePath), "utf8");
  } catch (error) {
    continue;
  }
  for (const rule of rules) {
    if (rule.pattern.test(content)) findings.push(`${relativePath}: ${rule.name}`);
  }
}

if (findings.length) {
  console.error("检测到疑似真实密钥材料：");
  findings.forEach((finding) => console.error(`- ${finding}`));
  process.exit(1);
}

console.log("Secret scan 通过：未在 Git 跟踪文本文件中发现高置信度密钥模式。");
