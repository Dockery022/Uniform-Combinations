// Headless screenshot of the combo builder for visual checks.
// Usage: node tools/screenshot.mjs [url] [out.png]   (start the app first: npm start)
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');
const url = process.argv[2] || 'http://localhost:8080/';
const out = process.argv[3] || 'screenshot.png';

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(8000); // models, HDRI and first frames
await page.screenshot({ path: out });
await browser.close();
console.log(`saved ${out}`);
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
