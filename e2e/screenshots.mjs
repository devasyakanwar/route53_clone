// Captures README screenshots (light + dark) from a running local stack: `node screenshots.mjs`.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const OUT = fileURLToPath(new URL('../docs/screenshots/', import.meta.url));
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
for (const mode of ['light', 'dark']) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: mode });
  await context.addInitScript(m => window.localStorage.setItem('r53.visual-mode', m), mode);
  const page = await context.newPage();
  await page.goto(`${BASE}/login`);
  await page.getByPlaceholder('demo@example.com').fill('demo@example.com');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.locator('input[type=password]').fill('demo');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL('**/route53/v2/home');
  await page.goto(`${BASE}/route53/v2/hostedzones`);
  await page.getByRole('link', { name: 'example.com', exact: true }).waitFor();
  await page.waitForTimeout(600);
  await page.screenshot({ path: OUT + `hosted-zones-${mode}.png` });

  await page.getByRole('link', { name: 'example.com', exact: true }).click();
  await page.getByRole('table', { name: 'Records' }).getByRole('row').filter({ hasText: 'api.example.com' }).first().getByRole('cell').nth(2).click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: OUT + `zone-detail-${mode}.png` });

  await page.getByRole('button', { name: 'Create record' }).click();
  await page.getByRole('heading', { name: 'Quick create record' }).waitFor();
  await page.waitForTimeout(500);
  await page.screenshot({ path: OUT + `quick-create-${mode}.png` });

  await page.goto(`${BASE}/route53/v2/home`);
  await page.getByRole('heading', { name: 'Route 53 Dashboard' }).waitFor();
  await page.waitForTimeout(800);
  await page.screenshot({ path: OUT + `dashboard-${mode}.png` });

  await page.goto(`${BASE}/route53/v2/healthchecks`);
  const hcTable = page.getByRole('table', { name: 'Health checks' });
  await hcTable.getByText('api-blue', { exact: true }).waitFor();
  await hcTable.getByRole('row').filter({ has: page.getByText('api-blue', { exact: true }) }).getByRole('cell').nth(3).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: OUT + `health-checks-${mode}.png` });
  await context.close();
}
await browser.close();
console.log('Screenshots written to docs/screenshots/');
