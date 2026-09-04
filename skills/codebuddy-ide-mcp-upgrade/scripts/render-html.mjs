import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { Marked } from "marked";

const [,, src, out, title] = process.argv;
const md = readFileSync(src, "utf8");

const marked = new Marked({ gfm: true, breaks: false });
const body = marked.parse(md);

// 给标题加 id，便于目录锚点
const bodyWithIds = body.replace(/<h([23])>([\s\S]*?)<\/h\1>/g, (m, lv, inner) => {
  const text = inner.replace(/<[^>]+>/g, "").trim();
  const id = "h-" + text.replace(/[^\w一-龥]+/g, "-").replace(/^-|-$/g, "");
  return `<h${lv} id="${id}">${inner}</h${lv}>`;
});

// 内联本地图片为 data URI：产物要放进资料库（或任何远端）时，相对路径图片会 404，
// 第三方外链也会被当外源拦截。这里统一转成 base64，保证 HTML 单文件自包含。
const MIME = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml",
};
const bodyInlined = bodyWithIds.replace(
  /(<img[^>]*\ssrc=")([^"]+)(")/g,
  (m, pre, srcVal, post) => {
    if (/^(https?:)?\/\//i.test(srcVal) || srcVal.startsWith("data:")) return m;
    const abs = path.resolve(path.dirname(src), decodeURIComponent(srcVal));
    const ext = path.extname(abs).toLowerCase();
    if (!existsSync(abs) || !MIME[ext]) {
      console.warn("⚠️ 跳过内联（文件不存在或类型不支持）:", srcVal);
      return m;
    }
    const b64 = readFileSync(abs).toString("base64");
    console.log(`  · 内联图片 ${srcVal} (${(b64.length / 1024).toFixed(0)} KiB base64)`);
    return `${pre}data:${MIME[ext]};base64,${b64}${post}`;
  }
);

// 从 h2/h3 生成目录
const toc = [];
for (const m of bodyInlined.matchAll(/<h([23]) id="([^"]+)">([\s\S]*?)<\/h\1>/g)) {
  toc.push({ level: Number(m[1]), id: m[2], text: m[3].replace(/<[^>]+>/g, "").trim() });
}
const tocHtml = toc
  .map((t) => `<a class="toc-${t.level}" href="#${t.id}">${t.text}</a>`)
  .join("\n");

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  :root{
    --bg:#ffffff; --fg:#1f2328; --muted:#5b6570; --line:#e3e6ea;
    --accent:#0b62d6; --code-bg:#f5f7f9; --quote-bg:#f7f9fb;
    --warn-bg:#fff8e6; --warn-line:#e0a800;
  }
  *{box-sizing:border-box}
  body{
    margin:0; background:var(--bg); color:var(--fg);
    font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Helvetica Neue","Segoe UI",sans-serif;
    font-size:15px; line-height:1.75;
  }
  .layout{display:flex; max-width:1240px; margin:0 auto}
  nav{
    width:250px; flex:0 0 250px; padding:28px 16px 60px 24px;
    position:sticky; top:0; height:100vh; overflow-y:auto;
    border-right:1px solid var(--line);
  }
  nav .nav-title{font-size:12px; font-weight:700; color:var(--muted);
    text-transform:uppercase; letter-spacing:.08em; margin-bottom:12px}
  nav a{display:block; color:var(--muted); text-decoration:none;
    font-size:13px; padding:4px 8px; border-radius:4px; line-height:1.5}
  nav a:hover{background:var(--code-bg); color:var(--accent)}
  nav a.toc-2{font-weight:600; color:var(--fg); margin-top:8px}
  nav a.toc-3{padding-left:20px; font-size:12.5px}
  main{flex:1; min-width:0; padding:36px 48px 96px}
  h1{font-size:27px; line-height:1.4; margin:0 0 8px; padding-bottom:16px;
    border-bottom:2px solid var(--line)}
  h2{font-size:21px; margin:44px 0 14px; padding-bottom:8px;
    border-bottom:1px solid var(--line)}
  h3{font-size:17px; margin:30px 0 10px}
  h4{font-size:15px; margin:22px 0 8px; color:var(--muted)}
  p{margin:12px 0}
  ul,ol{padding-left:24px; margin:12px 0}
  li{margin:5px 0}
  code{background:var(--code-bg); padding:2px 6px; border-radius:4px;
    font-family:"SFMono-Regular",Consolas,Menlo,monospace; font-size:13px}
  pre{background:var(--code-bg); border:1px solid var(--line); border-radius:8px;
    padding:14px 16px; overflow-x:auto; margin:16px 0}
  pre code{background:none; padding:0; font-size:12.5px; line-height:1.6}
  blockquote{margin:16px 0; padding:10px 16px; background:var(--quote-bg);
    border-left:4px solid var(--accent); border-radius:0 6px 6px 0; color:var(--muted)}
  blockquote p{margin:6px 0}
  table{border-collapse:collapse; width:100%; margin:18px 0; font-size:14px}
  th,td{border:1px solid var(--line); padding:9px 12px; text-align:left; vertical-align:top}
  th{background:var(--code-bg); font-weight:600}
  tr:nth-child(even) td{background:#fbfcfd}
  hr{border:0; border-top:1px solid var(--line); margin:36px 0}
  a{color:var(--accent)}
  strong{font-weight:650}
  @media print{
    nav{display:none}
    main{padding:0; max-width:none}
    body{font-size:11pt}
    h2{page-break-after:avoid} table,pre{page-break-inside:avoid}
  }
  @media (max-width:900px){
    nav{display:none} main{padding:24px 20px 60px}
  }
</style>
</head>
<body>
<div class="layout">
  <nav>
    <div class="nav-title">目录</div>
${tocHtml}
  </nav>
  <main>
${bodyInlined}
  </main>
</div>
</body>
</html>`;

writeFileSync(out, html, "utf8");
console.log("✓ 已生成", out, `(${(html.length / 1024).toFixed(1)} KiB, 目录 ${toc.length} 项)`);
