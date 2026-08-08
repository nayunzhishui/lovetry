const { spawnSync } = require("node:child_process");

const result = spawnSync(process.execPath, ["--test", "tests/*.test.js"], {
  cwd: process.cwd(),
  env: { ...process.env, TZ: "UTC" },
  shell: process.platform === "win32",
  stdio: "inherit"
});

if (result.error) throw result.error;
process.exit(result.status === null ? 1 : result.status);
