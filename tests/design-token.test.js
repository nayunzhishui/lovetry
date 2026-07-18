const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function luminance(hex) {
  const channels = hex.slice(1).match(/../g).map((value) => Number.parseInt(value, 16) / 255);
  const [red, green, blue] = channels.map((value) => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(foreground, background) {
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

test("深色主题关键语义色满足小号文字 4.5 比 1 对比度", () => {
  const css = fs.readFileSync(path.join(__dirname, "../couple-miniprogram/miniprogram/app.wxss"), "utf8");
  const dark = css.slice(css.indexOf("@media (prefers-color-scheme: dark)"));
  const token = (name) => {
    const match = new RegExp(`${name}\\s*:\\s*(#[0-9a-fA-F]{6})`).exec(dark);
    assert.ok(match, `深色主题缺少 ${name}`);
    return match[1];
  };
  const background = token("--paper");
  for (const name of ["--cobalt", "--coral", "--moss", "--amber-deep", "--danger", "--ink-soft"]) {
    assert.ok(contrast(token(name), background) >= 4.5, `${name} 对比度不足`);
  }
});
