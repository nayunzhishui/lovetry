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

const css = fs.readFileSync(path.join(__dirname, "../couple-miniprogram/miniprogram/app.wxss"), "utf8");
const darkStart = css.indexOf("@media (prefers-color-scheme: dark)");
const lightSection = css.slice(0, darkStart);
const darkSection = css.slice(darkStart);

function tokenReader(section, label) {
  return (name) => {
    const match = new RegExp(`${name}\\s*:\\s*(#[0-9a-fA-F]{6})`).exec(section);
    assert.ok(match, `${label}主题缺少 ${name}`);
    return match[1];
  };
}

test("深色主题关键语义色满足小号文字 4.5 比 1 对比度", () => {
  const token = tokenReader(darkSection, "深色");
  const background = token("--paper");
  for (const name of ["--cobalt", "--coral", "--sage", "--amber-deep", "--danger", "--ink-soft"]) {
    assert.ok(contrast(token(name), background) >= 4.5, `${name} 对比度不足`);
  }
});

// 语义配对色：前景 / 背景成对使用，明暗两套都必须满足 4.5:1
const TOKEN_PAIRS = [
  ["--chip-active-ink", "--chip-active-bg"],
  ["--sage-soft-ink", "--sage-soft-bg"],
  ["--amber-deep", "--amber-soft-bg"]
];

test("亮色主题语义配对色满足 4.5 比 1 对比度", () => {
  const token = tokenReader(lightSection, "亮色");
  for (const [ink, background] of TOKEN_PAIRS) {
    assert.ok(contrast(token(ink), token(background)) >= 4.5, `亮色 ${ink} / ${background} 对比度不足`);
  }
});

test("深色主题语义配对色满足 4.5 比 1 对比度", () => {
  const token = tokenReader(darkSection, "深色");
  for (const [ink, background] of [...TOKEN_PAIRS, ["--danger", "--danger-soft-bg"]]) {
    assert.ok(contrast(token(ink), token(background)) >= 4.5, `深色 ${ink} / ${background} 对比度不足`);
  }
});

test("旧色板别名 --brass / --moss 已删除", () => {
  assert.ok(!css.includes("--brass"), "app.wxss 仍残留 --brass");
  assert.ok(!css.includes("--moss"), "app.wxss 仍残留 --moss");
});
