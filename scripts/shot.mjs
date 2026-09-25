// Dev helper: screenshot the running game with system Chrome.
//   node scripts/shot.mjs "<url>" out.png [waitMs] [w] [h]
import { chromium } from "playwright-core";
const [url, out = "shot.png", wait = "6000", w = "1280", h = "800"] = process.argv.slice(2);
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-angle=metal", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const logs = [];
page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}\n${e.stack ?? ""}`));
await page.goto(url, { waitUntil: "load", timeout: 60000 });
await page.waitForFunction(() => document.body.dataset.boot === "ready", null, { timeout: 90000 }).catch(() => logs.push("[shot] boot never became ready"));
await page.waitForTimeout(+wait);
const cdp = await page.context().newCDPSession(page);
const { data } = await cdp.send("Page.captureScreenshot", { format: "png" });
(await import("node:fs")).writeFileSync(out, Buffer.from(data, "base64"));
console.log(logs.join("\n"));
await browser.close();
