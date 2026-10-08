import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * The local walkthrough from PLAN.md §10: sign in → create a public zone (2 records) → add one record of each
 * required type in a single Quick create batch → edit one → bulk-delete them → delete the zone → sign out → sign in.
 */

const ZONE = `smoke-${Date.now()}.example`;

const RECORDS: { name: string; type: string; value: string }[] = [
  { name: 'www', type: 'A', value: '192.0.2.10' },
  { name: 'v6', type: 'AAAA', value: '2001:db8::1' },
  { name: 'blog', type: 'CNAME', value: 'www.example.net' },
  { name: '', type: 'TXT', value: '"v=spf1 -all"' },
  { name: '', type: 'MX', value: '10 mail.example.net' },
  { name: 'sub', type: 'NS', value: 'ns-1.awsdns-01.org' },
  { name: 'ptr', type: 'PTR', value: 'host.example.net' },
  { name: '_sip._tcp', type: 'SRV', value: '1 10 5060 sip.example.net' },
  { name: '', type: 'CAA', value: '0 issue "amazon.com"' },
];

async function signIn(page: Page) {
  await page.goto('/route53/v2/hostedzones');
  await expect(page).toHaveURL(/\/login/);
  await page.getByPlaceholder('demo@example.com').fill('demo@example.com');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.locator('input[type=password]').fill('demo');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/route53\/v2\/hostedzones$/);
}

async function chooseOption(scope: Locator, page: Page, selectLabel: string, option: RegExp) {
  await scope.getByRole('button', { name: selectLabel }).click();
  await page.getByRole('option', { name: option }).first().click();
}

test.beforeEach(async ({ page }) => {
  // Show up to 25 records per page so every created record is visible at once.
  await page.addInitScript(() => {
    window.localStorage.setItem('r53.records-table', JSON.stringify({ pageSize: 25 }));
  });
});

test('hosted zone and record lifecycle', async ({ page }) => {
  await signIn(page);

  // Session survives a reload.
  await page.reload();
  await expect(page.getByRole('heading', { name: /Hosted zones/ })).toBeVisible();

  // Create a public hosted zone.
  await page.getByRole('button', { name: 'Create hosted zone' }).first().click();
  await page.getByLabel('Domain name').fill('bad..name');
  await page.getByRole('button', { name: 'Create hosted zone' }).click();
  await expect(page.getByText("can't contain empty labels")).toBeVisible();
  await page.getByLabel('Domain name').fill(ZONE);
  await page.getByLabel('Description').fill('Created by the smoke test');
  await page.getByRole('button', { name: 'Create hosted zone' }).click();

  await expect(page.getByText(`${ZONE} was successfully created.`)).toBeVisible();
  await expect(page.getByRole('heading', { name: ZONE, level: 1 })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Records (2)' })).toBeVisible();
  await expect(page.getByText(/^ns-\d+\.awsdns-\d{2}\.com\.$/).first()).toBeVisible();

  // Quick create: one record of every required type in a single atomic batch.
  await page.getByRole('button', { name: 'Create record' }).click();
  await expect(page.getByRole('heading', { name: 'Quick create record' })).toBeVisible();
  for (let i = 0; i < RECORDS.length; i++) {
    if (i > 0) await page.getByRole('button', { name: 'Add another record' }).click();
    const row = page.getByTestId(`record-row-${i}`);
    const rec = RECORDS[i];
    if (rec.name) await row.getByLabel('Record name', { exact: true }).fill(rec.name);
    if (rec.type !== 'A') await chooseOption(row, page, 'Record type', new RegExp(`^${rec.type} –`));
    await row.getByLabel('Value', { exact: true }).fill(rec.value);
  }

  // A bad value is caught inline before anything is sent.
  await page.getByTestId('record-row-0').getByLabel('Value', { exact: true }).fill('999.1.1.1');
  await page.getByRole('button', { name: 'Create records' }).click();
  await expect(page.getByText('999.1.1.1 is not a valid IPv4 address')).toBeVisible();
  await page.getByTestId('record-row-0').getByLabel('Value', { exact: true }).fill('192.0.2.10');

  await page.getByRole('button', { name: 'Create records' }).click();
  await expect(page.getByText(`9 records for ${ZONE} were successfully created.`)).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Records (11)' })).toBeVisible();
  await expect(page.getByText('Change status: INSYNC')).toBeVisible({ timeout: 15_000 });

  // The split panel shows the selected record; edit it (UPSERT).
  const table = page.getByRole('table', { name: 'Records' });
  await table.getByRole('row').filter({ hasText: `www.${ZONE}` }).getByRole('cell').nth(2).click();
  await expect(page.getByRole('heading', { name: 'Record details' })).toBeVisible();
  await page.getByRole('button', { name: 'Edit record' }).click();
  await expect(page.getByRole('heading', { name: 'Edit record' })).toBeVisible();
  await expect(page.getByLabel('Record name', { exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Set TTL to 1h' }).click();
  await page.getByLabel('Value', { exact: true }).fill('192.0.2.10\n192.0.2.11');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText(`Record www.${ZONE} was successfully updated.`)).toBeVisible();
  const wwwRow = table.getByRole('row').filter({ hasText: `www.${ZONE}` });
  await expect(wwwRow).toContainText('3600');
  await expect(wwwRow).toContainText('192.0.2.11');

  // A zone with records can't be deleted.
  await page.getByRole('button', { name: 'Delete zone' }).click();
  await expect(page.getByText('Before you delete a hosted zone, you must delete all records')).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Delete' })).toBeDisabled();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();

  // NS/SOA can't be deleted: selecting them disables Delete.
  await page.getByRole('checkbox', { name: 'Select all records' }).check({ force: true });
  await expect(page.getByRole('button', { name: /^Delete records?$/ })).toBeDisabled();
  for (const type of ['NS', 'SOA']) {
    await table
      .getByRole('row')
      .filter({ has: page.getByRole('cell', { name: type, exact: true }) })
      .filter({ hasText: 'awsdns' })
      .first()
      .getByRole('checkbox')
      .uncheck({ force: true });
  }
  // Bulk delete the 9 custom records in one batch.
  await expect(page.getByRole('heading', { name: /Records \(9\/11\)/ })).toBeVisible();
  await page.getByRole('button', { name: 'Delete records' }).click();
  await expect(page.getByRole('dialog').getByRole('row')).toHaveCount(10); // header + 9
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText(`9 records for ${ZONE} were successfully deleted.`)).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Records (2)' })).toBeVisible();

  // Delete the now-empty zone with the typed confirmation.
  await page.getByRole('button', { name: 'Delete zone' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Delete' })).toBeDisabled();
  await dialog.getByPlaceholder('delete').fill('delete');
  await dialog.getByRole('button', { name: 'Delete' }).click();
  await expect(page).toHaveURL(/\/route53\/v2\/hostedzones$/);
  await expect(page.getByText(`${ZONE} was successfully deleted.`)).toBeVisible();
  await expect(page.getByRole('link', { name: ZONE })).toHaveCount(0);

  // Sign out, then back in: the seeded data is still there.
  await page.getByRole('button', { name: 'Account' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login/);
  await signIn(page);
  await expect(page.getByRole('link', { name: 'example.com', exact: true })).toBeVisible();
});

test('every side navigation link routes somewhere', async ({ page }) => {
  await signIn(page);
  for (const [section, link] of [
    [null, 'Profiles'],
    ['Traffic flow', 'Traffic policies'],
    ['Resolver', 'Inbound endpoints'],
    ['DNS Firewall', 'Domain lists'],
  ] as const) {
    const nav = page.getByRole('navigation', { name: 'Side navigation' });
    if (section) {
      const toggle = nav.getByRole('button', { name: section });
      if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
    }
    await nav.getByRole('link', { name: link, exact: true }).click();
    await expect(page.getByText('This feature is coming soon.')).toBeVisible();
    await expect(nav.getByRole('link', { name: link, exact: true })).toHaveAttribute('aria-current', 'page');
  }
});

test('filter, info panel and keyboard shortcuts', async ({ page }) => {
  await signIn(page);
  await page.getByLabel('Information').first().click();
  await expect(page.getByRole('heading', { name: 'Hosted zones', level: 2 })).toBeVisible();

  await page.keyboard.press('/');
  await page.keyboard.type('mycompany');
  await page.keyboard.press('Enter');
  await expect(page.getByText('1 match', { exact: true }).first()).toBeVisible();
  await expect(page).toHaveURL(/filter=/);
  await page.reload();
  await expect(page.getByText('1 match', { exact: true }).first()).toBeVisible();

  await page.locator('body').click({ position: { x: 700, y: 600 } });
  await page.keyboard.press('?');
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.press('c');
  await expect(page).toHaveURL(/\/hostedzones\/create$/);
});

test('dashboard summarizes resources', async ({ page }) => {
  await signIn(page);
  await page.getByRole('navigation', { name: 'Side navigation' }).getByRole('link', { name: 'Dashboard', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Route 53 Dashboard' })).toBeVisible();
  for (const section of ['DNS management', 'Traffic management', 'Availability monitoring', 'Domain registration']) {
    await expect(page.getByRole('heading', { name: section })).toBeVisible();
  }
  await page.getByPlaceholder('Enter a domain name').fill('my-new-site.com');
  await page.getByRole('button', { name: 'Check', exact: true }).click();
  await expect(page.getByText("Domain registration isn't available in this clone")).toBeVisible();
  await page.getByRole('link', { name: /Health checks$/ }).first().click();
  await expect(page).toHaveURL(/\/healthchecks$/);
});

test('health check lifecycle', async ({ page }) => {
  const name = `smoke-hc-${Date.now()}`;
  await signIn(page);
  await page.goto('/route53/v2/healthchecks');
  await expect(page.getByRole('heading', { name: /Health checks/ }).first()).toBeVisible();

  await page.getByRole('button', { name: 'Create health check' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('Enter a name for the health check.')).toBeVisible();
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByRole('textbox', { name: 'IP address' }).fill('198.51.100.80');
  await page.getByRole('textbox', { name: 'Path' }).fill('health');
  await expect(page.getByText('http://198.51.100.80:80/health')).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('heading', { name: 'Get notified when health check fails' }).first()).toBeVisible();
  await page.getByRole('radio', { name: 'Yes' }).check({ force: true });
  await page.getByRole('radio', { name: 'New SNS topic' }).check({ force: true });
  await page.getByPlaceholder('my-health-check-alerts').fill('smoke-alerts');
  await page.getByPlaceholder('ops@example.com, oncall@example.com').fill('not-an-email');
  await page.getByRole('button', { name: 'Create health check' }).click();
  await expect(page.getByText('not-an-email is not a valid email address.')).toBeVisible();
  await page.getByPlaceholder('ops@example.com, oncall@example.com').fill('ops@example.com');
  await page.getByRole('button', { name: 'Create health check' }).click();

  await expect(page.getByText(`Health check ${name} was successfully created.`)).toBeVisible();
  const row = page.getByRole('table', { name: 'Health checks' }).getByRole('row').filter({ has: page.getByText(name, { exact: true }) });
  await expect(row).toContainText('Unknown');
  await expect(row).toContainText('1 of 1 in');
  await expect(row).toContainText('Healthy', { timeout: 30_000 });

  // Edit via the split panel.
  await row.getByRole('cell').nth(3).click();
  await expect(page.getByRole('tab', { name: 'Monitoring' })).toBeVisible();
  await page.getByRole('tab', { name: 'Health checkers' }).click();
  await expect(page.getByText('Success: HTTP Status Code 200, OK').first()).toBeVisible();
  await page.getByRole('button', { name: 'Edit health check' }).last().click();
  await expect(page.getByRole('heading', { name: 'Edit health check' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Protocol/ }).first()).toBeDisabled();
  await page.getByRole('textbox', { name: 'IP address' }).fill('203.0.113.80');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText(`Health check ${name} was successfully updated.`)).toBeVisible();
  await expect(row).toContainText('Unhealthy');

  // Delete with typed confirmation.
  await row.getByRole('checkbox').check({ force: true });
  await page.getByRole('button', { name: 'Delete health check' }).click();
  await page.getByRole('dialog').getByPlaceholder('delete').fill('delete');
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText(`Health check ${name} was successfully deleted.`)).toBeVisible();
  await expect(row).toHaveCount(0);
});

test('bulk delete and export hosted zones', async ({ page }) => {
  const stamp = Date.now();
  const names = [`bulk-a-${stamp}.example`, `bulk-b-${stamp}.example`];
  await signIn(page);
  for (const name of names) {
    const res = await page.request.post('/api/v1/hostedzones', { data: { name, private_zone: false } });
    expect(res.status()).toBe(201);
  }
  await page.reload();
  for (const name of names) {
    await page.getByRole('checkbox', { name: `Select ${name}` }).check({ force: true });
  }
  await expect(page.getByRole('button', { name: 'View details' })).toBeDisabled();

  await page.getByRole('button', { name: 'Export' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Export selected (2) as JSON' }).click();
  const file = await (await download).path();
  const json = JSON.parse(require('node:fs').readFileSync(file, 'utf8'));
  expect(json.HostedZones.map((z: { Name: string }) => z.Name)).toEqual(names.map(n => n + '.'));

  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Delete 2 hosted zones?' })).toBeVisible();
  await page.getByRole('dialog').getByPlaceholder('delete').fill('delete');
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('2 hosted zones were successfully deleted.')).toBeVisible();
  for (const name of names) await expect(page.getByRole('link', { name })).toHaveCount(0);
});
