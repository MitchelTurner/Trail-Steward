import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 360, height: 800 } });

test('home lists the topics without sideways scrolling', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('link', { name: 'Start: prepare for a funding application' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'See trails on the map' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Jurisdiction & Land Management' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Governance' })).toBeVisible();
  const fits = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
  );
  expect(fits).toBe(true);
});

test('a checklist keeps two finished steps after reload', async ({ page }) => {
  await page.goto('/start/funding-application');
  await page.getByRole('combobox').selectOption('Sitka');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('checkbox', { name: 'Tongass National Forest (Forest Service)' }).check();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('radio', { name: 'In a community or agency plan' }).check();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('radio', { name: 'Yes', exact: true }).check();
  await page.getByRole('button', { name: 'See my checklist' }).click();
  await expect(page).toHaveURL(/\/c\//);
  const boxes = page.getByRole('checkbox');
  const saved = page.waitForResponse(
    (response) =>
      response.url().includes('/api/checklists/') &&
      response.request().method() === 'PATCH' &&
      response.ok(),
  );
  await boxes.nth(0).check();
  await boxes.nth(1).check();
  await saved;
  await expect(page.getByText('Saved')).toBeVisible();
  await page.reload();
  await expect(boxes.nth(0)).toBeChecked();
  await expect(boxes.nth(1)).toBeChecked();
});

test('the map opens a trail and takes a problem report', async ({ page }) => {
  await page.goto('/map');
  await expect(page.getByRole('heading', { name: 'Trail map' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Map of trails' })).toBeVisible();
  await page.getByRole('listitem').getByRole('link', { name: 'Harbor path' }).click();
  await expect(page.getByRole('heading', { name: 'Harbor path' })).toBeVisible();
  await expect(page.getByText('Harbor bridge · Bridge')).toBeVisible();
  await expect(page.getByText('November 18, 2026 — Harbor cleanup')).toBeVisible();
  await page.getByLabel('Short title').fill('Washout');
  await page.getByLabel('What is wrong').fill('The bridge approach is gone.');
  await page.getByRole('button', { name: 'Send report' }).click();
  await expect(page.getByText('Thanks. An editor will see this on the review board.')).toBeVisible();
  await page.getByLabel('What should change').fill('The line should follow the dock.');
  await page.getByRole('button', { name: 'Send request' }).click();
  await expect(page.getByText('Thanks. An editor will see this request.')).toBeVisible();
  const fits = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
  );
  expect(fits).toBe(true);
});

test('an editor publishes a trail from the form', async ({ page }) => {
  const signedIn = await page.request.post('/api/auth/verify', {
    data: { token: 'map-editor-token-value' },
  });
  expect(signedIn.ok()).toBeTruthy();
  await page.goto('/admin/issues');
  await expect(page.getByRole('heading', { name: 'Issues' })).toBeVisible();
  await expect(page.getByText('Washout · Open').first()).toBeVisible();
  await page.goto('/admin/board');
  await expect(page.getByRole('heading', { name: 'Maintenance board' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Harbor path' })).toBeVisible();
  const packet = await page.request.get('/api/trails/harbor-path/packet');
  expect(packet.ok()).toBeTruthy();
  expect(packet.headers()['content-type']).toContain('application/pdf');
  await page.goto('/admin/changes');
  await expect(page.getByText('The line should follow the dock.').first()).toBeVisible();
  await page.goto('/admin/trails/new');
  await page.getByLabel('Name').fill('Playwright creek');
  await page.getByLabel(/^Line/).fill('-135.40, 57.10\n-135.35, 57.12');
  await page.getByLabel('Status').selectOption('PUBLISHED');
  await page.getByRole('button', { name: 'Save trail' }).click();
  await expect(page).toHaveURL(/\/admin\/trails\/edit\/playwright-creek$/);
  await page.getByLabel('Place name').fill('Creek bridge');
  await page.getByLabel('Point (longitude, latitude)').fill('-135.38, 57.11');
  await page.getByRole('button', { name: 'Add place' }).click();
  await expect(page.getByText('Creek bridge · Trailhead')).toBeVisible();
  await page.goto('/map');
  await expect(
    page.getByRole('listitem').getByRole('link', { name: 'Playwright creek' }),
  ).toBeVisible();
  await page.goto('/admin/trails/edit/playwright-creek');
  page.once('dialog', (dialog) => {
    void dialog.accept();
  });
  await page.getByRole('button', { name: 'Remove trail' }).click();
  await expect(page).toHaveURL(/\/admin\/trails$/);
});

test('the directory opens an organization', async ({ page }) => {
  await page.goto('/orgs');
  await page.getByRole('link', { name: 'USDA Forest Service' }).click();
  await expect(page.getByRole('heading', { name: 'USDA Forest Service' })).toBeVisible();
  const fits = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
  );
  expect(fits).toBe(true);
});
