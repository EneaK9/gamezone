// Dev helper: open a page, wait for boot, print the result of an expression.
//   node scripts/probe.mjs "<url>" "<js expression>"
import { chromium } from "playwright-core";
const [url, expr] = process.argv.slice(2);
const b = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-angle=metal", "--ignore-gpu-blocklist"] });
const p = await b.newPage({ viewport: { width: 800, height: 600 } });
const logs = [];
p.on("console", (m) => { if (!m.text().includes("[vite]")) logs.push(m.text()); });
p.on("pageerror", (e) => logs.push("ERR " + e.message));
await p.goto(url);
await p.waitForFunction(() => document.body.dataset.boot === "ready", null, { timeout: 90000 }).catch(() => logs.push("no boot"));
await p.waitForTimeout(1500);
console.log(JSON.stringify(await p.evaluate(expr), null, 1));
console.log(logs.join("\n"));
await b.close();
