import { expect, test } from '@playwright/test';
import { expectAccessible, seedWorld, signInAs } from '../support/auth.ts';
import { apiAs, overrideEntitlement } from '../support/u5.ts';

test.describe('SF-02 Quiz', () => {
  test('publishing needs 3 to 5 questions in every language; an added question with its correct answer is saved', async ({
    page,
    context,
    request,
  }) => {
    const w = await seedWorld(request);
    const created = await apiAs<{ id: string }>(
      request,
      w.A.users.tenant_admin,
      'POST',
      `/t/${w.A.tenantId}/safety/instructions`,
      { name: 'Quiz rules', allSites: true, siteIds: [] },
    );
    await signInAs(context, w.A.users.tenant_admin);
    await page.goto(`/t/${w.A.tenantId}/safety/briefings/${created.id}`);
    const languages = page.getByRole('navigation', { name: 'Languages' });
    await languages.getByRole('link', { name: /German/ }).click();
    await expect(languages.getByRole('link', { name: /German.*Quiz: 3/ })).toBeVisible();

    await page.getByRole('button', { name: 'Remove question: Question 3' }).click();
    await page.getByRole('button', { name: 'Save German' }).click();
    await expect(page.getByText('German saved.')).toBeVisible();
    await expect(languages.getByRole('link', { name: /German.*Quiz: 2/ })).toBeVisible();

    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Publish now' }).click();
    await expect(
      page.getByRole('dialog').getByText('These languages need 3 to 5 quiz questions: German.'),
    ).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();

    await page.getByRole('button', { name: 'Add question' }).click();
    const question = page.getByRole('group', { name: 'Question 3' });
    await question.getByLabel('Question', { exact: true }).fill('Wo ist der Sammelplatz?');
    await question.getByLabel('Answer 1', { exact: true }).fill('Am Tor');
    await question.getByLabel('Answer 2', { exact: true }).fill('In der Halle');
    await question.getByRole('button', { name: 'Add answer' }).click();
    await question.getByLabel('Answer 3', { exact: true }).fill('Auf dem Dach');
    await question.getByRole('radio', { name: 'Correct answer: Answer 1' }).click();
    await expectAccessible(page);
    await page.getByRole('button', { name: 'Save German' }).click();
    await expect(languages.getByRole('link', { name: /German.*Quiz: 3/ })).toBeVisible();

    const admin = w.A.users.tenant_admin;
    const base = `/t/${w.A.tenantId}/safety`;
    const { items } = await apiAs<{ items: { id: string }[] }>(
      request,
      admin,
      'GET',
      `${base}/instructions/${created.id}/versions`,
    );
    const version = await apiAs<{ content: { locale: string; questions: unknown[] }[] }>(
      request,
      admin,
      'GET',
      `${base}/versions/${items[0]?.id}`,
    );
    expect(version.content.find((c) => c.locale === 'de')?.questions.at(-1)).toMatchObject({
      prompt: 'Wo ist der Sammelplatz?',
      options: ['Am Tor', 'In der Halle', 'Auf dem Dach'],
      correct: 0,
    });

    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Publish now' }).click();
    await expect(page.getByText('Version 1 is published.')).toBeVisible();
  });

  test('without safety.quiz the editor has no questions and publishing works', async ({
    page,
    context,
    request,
  }) => {
    const w = await seedWorld(request);
    await overrideEntitlement(w, w.A, 'safety.quiz', false);
    await signInAs(context, w.A.users.tenant_admin);
    await page.goto(`/t/${w.A.tenantId}/safety/briefings`);
    await page.getByRole('button', { name: 'New briefing' }).first().click();
    await page.getByRole('dialog').getByLabel('Name').fill('Rules without quiz');
    await page.getByRole('dialog').getByRole('button', { name: 'Create and edit' }).click();

    await expect(
      page.getByText('Quizzes are not part of your package.', { exact: false }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add question' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Publish now' }).click();
    await expect(page.getByText('Version 1 is published.')).toBeVisible();
  });
});
