// Dev helper: boot the game, click Begin, run scripted inputs, take screenshots.
//   node scripts/play.mjs <out-prefix> [script.json]
import { chromium } from "playwright-core";
import fs from "node:fs";
const [prefix = "/tmp/play", scriptPath] = process.argv.slice(2);
const steps = scriptPath ? JSON.parse(fs.readFileSync(scriptPath, "utf8")) : [{ wait: 3000 }, { shot: "a" }];
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-angle=metal", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const logs = [];
page.on("console", (m) => { if (!/vite|aoMap|deprecated/.test(m.text())) logs.push(`[${m.type()}] ${m.text()}`); });
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}\n${e.stack ?? ""}`));
await page.goto(steps[0].url ?? "http://localhost:5173/", { waitUntil: "load", timeout: 60000 });
await page.waitForFunction(() => document.body.dataset.boot === "ready", null, { timeout: 120000 });
await page.waitForTimeout(1500);
const cdp = await page.context().newCDPSession(page);
const shot = async (name) => {
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(`${prefix}-${name}.png`, Buffer.from(data, "base64"));
};
for (const s of steps) {
  if (s.click) await page.click(s.click).catch((e) => logs.push(`[click fail] ${s.click} ${e.message}`));
  if (s.eval) { const r = await page.evaluate(s.eval).catch((e) => `ERR ${e.message}`); if (r !== undefined) logs.push(`[eval] ${JSON.stringify(r)}`); }
  if (s.down) await page.keyboard.down(s.down);
  if (s.up) await page.keyboard.up(s.up);
  if (s.press) await page.keyboard.press(s.press);
  if (s.type) await page.keyboard.type(s.type, { delay: 20 });
  if (s.mouse) { await page.mouse.move(720, 450); await page.mouse.down({ button: s.mouse }); await page.waitForTimeout(80); await page.mouse.up({ button: s.mouse }); }
  if (s.wait) await page.waitForTimeout(s.wait);
  if (s.shot) await shot(s.shot);
}
console.log(logs.slice(0, 60).join("\n"));
await browser.close();
