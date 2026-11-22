const fs = require("fs");
const path = require("path");

const vm = require("vm");
const sandbox = { console, Buffer, Blob, URL, setTimeout, clearTimeout, Uint8Array, ArrayBuffer };
sandbox.window = sandbox;
sandbox.self = sandbox;
sandbox.global = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, "../assets/vendor/pptxgen.bundle.js"), "utf8"), sandbox);
const PptxGenJS = sandbox.PptxGenJS;
if (typeof PptxGenJS !== "function") throw new Error("PptxGenJS 未导出");

const pptx = new PptxGenJS();
pptx.layout = "LAYOUT_WIDE";
pptx.theme = { headFontFace: "Microsoft YaHei", bodyFontFace: "Microsoft YaHei", lang: "zh-CN" };
pptx.defineSlideMaster({
  title: "WY_MASTER",
  background: { color: "F7F5EF" },
  objects: [
    { rect: { x: 0, y: 0, w: "100%", h: 0.14, fill: { color: "2E6B4F" }, line: { color: "2E6B4F" } } },
    { text: { text: "文芽作文 · 班级讲评", options: { x: 0.5, y: 7.05, w: 6, h: 0.3, fontSize: 10, color: "7A8B80" } } }
  ]
});
const T = { color: "1F3428", fontFace: "Microsoft YaHei" };
let s = pptx.addSlide({ masterName: "WY_MASTER" });
s.addText("作文讲评", { x: 0.9, y: 2.2, w: 11.5, h: 1, fontSize: 40, bold: true, color: "2E6B4F", fontFace: "Microsoft YaHei" });
s.addText("那一刻我长大了", { x: 0.9, y: 3.3, w: 11.5, h: 0.7, fontSize: 24, color: T.color, fontFace: T.fontFace });
s = pptx.addSlide({ masterName: "WY_MASTER" });
s.addText("共性问题 1 / 1", { x: 0.8, y: 0.5, w: 11, h: 0.4, fontSize: 13, color: "8A968E", fontFace: T.fontFace });
s.addText("开头把题目抄一遍", { x: 0.8, y: 1, w: 11.5, h: 0.9, fontSize: 30, bold: true, color: "993C1D", fontFace: T.fontFace });
s.addShape(pptx.ShapeType.roundRect, { x: 0.8, y: 4.2, w: 11.7, h: 2, rectRadius: 0.08, fill: { color: "E1F5EE" }, line: { color: "9FE1CB", pt: 1 } });
s.addText("改成直接进场景", { x: 1.1, y: 4.4, w: 10, h: 0.5, fontSize: 18, color: "085041", fontFace: T.fontFace });

pptx.write({ outputType: "nodebuffer" }).then((buf) => {
  if (!buf || !Buffer.isBuffer(buf)) throw new Error("write 没返回 Buffer");
  const sig = buf.slice(0, 2).toString();
  if (sig !== "PK") throw new Error("不是 zip 文件: " + sig);
  const txt = buf.toString("latin1");
  const checks = {
    "content types": txt.includes("[Content_Types].xml"),
    "presentation": txt.includes("ppt/presentation.xml"),
    "slide1": txt.includes("ppt/slides/slide1.xml"),
    "slide2": txt.includes("ppt/slides/slide2.xml"),
    "master": txt.includes("ppt/slideMasters/slideMaster1.xml"),
    "chinese text": txt.includes("那一刻我长大了") || buf.includes(Buffer.from("那一刻我长大了", "utf8"))
  };
  console.log("size", buf.length, "bytes");
  Object.keys(checks).forEach(k => console.log((checks[k] ? "PASS" : "FAIL"), k));
  if (Object.values(checks).some(v => !v)) process.exitCode = 1;
}).catch(e => { console.error("FAIL write", e.message); process.exitCode = 1; });
