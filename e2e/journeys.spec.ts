import { expect, test, type Page } from '@playwright/test';

const ACCOUNTS = {
  'Alex Chen': { email: 'alex.chen@example.com', password: 'Editor#2026' },
  'Jordan Lee': { email: 'jordan.lee@example.com', password: 'Viewer#2026' }
};

async function signIn(page: Page, name: keyof typeof ACCOUNTS = 'Alex Chen') {
  await page.request.post('http://localhost:4300/api/dev/reset');
  await page.goto('/signin');
  await page.getByLabel('Email').fill(ACCOUNTS[name].email);
  await page.getByLabel('Password', { exact: true }).fill(ACCOUNTS[name].password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
}

test('Sign in with email and password; wrong password is rejected; session survives reload', async ({ page }) => {
  await page.request.post('http://localhost:4300/api/dev/reset');
  await page.goto('/topics');
  await expect(page).toHaveURL(/\/signin$/);
  await page.getByLabel('Email').fill('alex.chen@example.com');
  await page.getByLabel('Password', { exact: true }).fill('not-the-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Email or password is incorrect.');

  // "Use" fills the test account; after sign-in we land on the page we asked for
  await page.getByRole('button', { name: "Fill in Alex Chen's test credentials" }).click();
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Topics' })).toBeVisible();

  // The session survives a reload
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Topics' })).toBeVisible();
});

test('Overview → Topic detail → Support notes → note drawer → back', async ({ page }) => {
  await signIn(page);

  // Overview → topic (lands on the largest subtopic)
  await page.getByRole('link', { name: /^Wires and funding methods: 2,940 support notes/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Wire transfers & real estate' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('Wires and funding methods');

  // Topic → notes list, same count as the subtopic card
  await page.getByRole('link', { name: /See all 1,120 notes/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Support notes' })).toBeVisible();
  await expect(page.getByText(/of 1,120 support notes/)).toBeVisible();

  // Filter by status, then go to page 2
  await page.getByLabel('Classification').selectOption('Classified');
  await expect(page.getByText(/Status: Classified/)).toBeVisible();
  await page.getByRole('button', { name: 'Page 2' }).click();
  await expect(page.getByRole('button', { name: 'Page 2' })).toHaveAttribute('aria-current', 'page');

  // Open a note; the drawer shows the same ID as the row
  const firstId = await page.locator('table tbody tr').first().getByRole('button').first().innerText();
  await page.locator('table tbody tr').first().getByRole('button').first().click();
  const drawer = page.getByRole('dialog');
  await expect(drawer.getByRole('heading', { name: firstId })).toBeVisible();
  await expect(drawer).toContainText('Wires and funding methods › Wire transfers & real estate');
  await expect(drawer).toContainText('Handling status');

  // Report incorrect classification
  await drawer.getByRole('button', { name: 'Report incorrect classification' }).click();
  await drawer.getByLabel("What's wrong?").selectOption('Wrong topic');
  await drawer.getByRole('button', { name: 'Submit report' }).click();
  await expect(drawer.getByText(/Report submitted \(RPT-/)).toBeVisible();

  // Close with Escape: filters and page are kept
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(page.getByText(/Status: Classified/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Page 2' })).toHaveAttribute('aria-current', 'page');

  // Back to the originating topic
  await page.getByRole('link', { name: /Back to Wire transfers & real estate/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Wire transfers & real estate' })).toBeVisible();
});

test('Generate AI insights → open a source note → back; filters change → outdated → regenerate', async ({ page }) => {
  await signIn(page);
  await page.goto('/topics/wires/wire-re');
  const panel = page.getByRole('region', { name: 'AI Topic Insights' });

  await panel.getByRole('button', { name: 'Generate AI Insights' }).click();
  await expect(panel.getByRole('heading', { name: 'Recurring issues' })).toBeVisible({ timeout: 20_000 });
  await expect(panel.getByText(/% of 400 sampled notes/).first()).toBeVisible();

  // Source note opens the drawer; closing returns focus to the source chip
  const source = panel.getByRole('button', { name: /Open source note SN-/ }).first();
  await source.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Close note' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(source).toBeFocused();

  // Change the date range → the result is out of date
  await page.getByLabel('Date range').selectOption('90d');
  await expect(panel.getByText('Filters changed. These insights are out of date.')).toBeVisible();
  await panel.getByRole('button', { name: 'Generate new insights' }).click();
  await expect(panel.getByText('Filters changed. These insights are out of date.')).toBeHidden({ timeout: 20_000 });
  await expect(panel.getByRole('heading', { name: 'Recurring issues' })).toBeVisible();

  // View all supporting notes → filtered notes list
  await panel.getByRole('link', { name: /View all .* supporting notes/ }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Support notes' })).toBeVisible();
  await expect(page.getByText(/AI finding:/)).toBeVisible();
});

test('Viewer is limited to their team and sees no editing actions', async ({ page }) => {
  await signIn(page, 'Jordan Lee');
  await expect(page.getByText('Money Movement · Oct 9 – Nov 7, 2026 · taxonomy v7').first()).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Team' })).toHaveCount(0);
  await page.goto('/topics/tax/tax-1099');
  await expect(page.getByRole('heading', { name: /don't have access/ })).toBeVisible();
});

test('Emerging topic → review → add to draft → review changes → publish → activate', async ({ page }) => {
  await signIn(page);
  await page.getByRole('link', { name: /Emerging topics/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Emerging topics' })).toBeVisible();

  await page.getByText('Review candidate', { exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Bond ladder setup questions' })).toBeVisible();
  await page.getByRole('button', { name: 'Add to draft taxonomy' }).click();
  await expect(page.getByText(/added to draft/i).first()).toBeVisible();

  await page.getByRole('link', { name: 'Review changes' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: /Review changes for v8/ })).toBeVisible();
  await expect(page.getByText('Bond ladder setup questions').first()).toBeVisible();

  await page.getByRole('button', { name: 'Publish v8' }).click();
  const confirm = page.getByRole('dialog', { name: 'Publish taxonomy v8?' });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Publish v8' }).click();

  await expect(page.getByRole('button', { name: 'Activate v8' })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Activate v8' }).click();
  await page.getByRole('dialog', { name: 'Activate v8?' }).getByRole('button', { name: 'Activate v8' }).click();
  await expect(page.getByText(/Active taxonomy v8/)).toBeVisible({ timeout: 10_000 });
});

test('Failed background task → inspect error → retry', async ({ page }) => {
  await signIn(page);
  await page.goto('/emerging');
  await page.getByRole('button', { name: 'Inspect error' }).click();
  await expect(page.getByText(/EMB-504/)).toBeVisible();
  await page.getByRole('button', { name: /Retry/ }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: /Start reprocessing|Retry|Reprocess/ }).last().click();
  await expect(page.getByText(/Reprocessed 37 notes/).first()).toBeVisible({ timeout: 20_000 });
});
