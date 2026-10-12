import { expect, test } from '@playwright/test';


test('password change keeps the current session active and rotates credentials', async ({ page }) => {
  const unique = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const email = `playwright-security-${unique}@example.com`;
  const oldPassword = 'playwright-security-old-password';
  const newPassword = 'playwright-security-new-password';

  await page.goto('/register');
  await page.getByLabel('Nombre').fill('Playwright Security');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(oldPassword);
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page.getByRole('heading', { name: 'Tu visión financiera' })).toBeVisible();

  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();

  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(oldPassword);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Tu visión financiera' })).toBeVisible();

  await page.getByRole('link', { name: 'Seguridad' }).click();
  await expect(page.getByRole('heading', { name: 'Seguridad' })).toBeVisible();
  await page.getByLabel('Contraseña actual').fill(oldPassword);
  await page.getByLabel('Nueva contraseña').fill(newPassword);
  await page.getByRole('button', { name: 'Actualizar contraseña' }).click();

  await expect(page.getByRole('status')).toContainText(
    'Contraseña actualizada. Las sesiones anteriores se han cerrado.',
  );

  // Force a new authenticated page load so this verifies the rotated cookie,
  // rather than merely observing UI state that existed before the password change.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Seguridad' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();

  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();

  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(oldPassword);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();

  await page.getByLabel('Contraseña').fill(newPassword);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Tu visión financiera' })).toBeVisible();
});
