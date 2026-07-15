const path = require("node:path");
const ci = require("miniprogram-ci");

const appid = process.env.MINIPROGRAM_APPID;
const privateKeyPath = process.env.MINIPROGRAM_PRIVATE_KEY_PATH;
if (!appid || !privateKeyPath) throw new Error("缺少 MINIPROGRAM_APPID 或 MINIPROGRAM_PRIVATE_KEY_PATH");

const project = new ci.Project({
  appid,
  type: "miniProgram",
  projectPath: path.resolve(__dirname, "../couple-miniprogram"),
  privateKeyPath,
  ignores: ["node_modules/**/*"]
});

ci.preview({
  project,
  version: process.env.MINIPROGRAM_VERSION || "0.1.0-preview",
  desc: process.env.MINIPROGRAM_DESC || "GitHub Actions 手动预览",
  setting: { es6: true, minify: true },
  qrcodeFormat: "image",
  qrcodeOutputDest: path.resolve(__dirname, "../preview-qrcode.png"),
  robot: Number(process.env.MINIPROGRAM_ROBOT || 1)
}).then(() => console.log("预览二维码已生成"));
