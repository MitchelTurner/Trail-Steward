import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 360, height: 800 } });

test('home lists the topics without sideways scrolling', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('link', { name: 'Start: prepare for a funding application' }),
  ).toBeVisible();
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

test('the directory opens an organization', async ({ page }) => {
  await page.goto('/orgs');
  await page.getByRole('link', { name: 'USDA Forest Service' }).click();
  await expect(page.getByRole('heading', { name: 'USDA Forest Service' })).toBeVisible();
  const fits = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
  );
  expect(fits).toBe(true);
});
