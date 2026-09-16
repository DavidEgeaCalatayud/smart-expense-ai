import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { getSharedMobileApiClient } from '../../api/client';
import { runSessionWork } from '../../auth/sessionWork';

export async function sharePrivacyExport(): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new Error('File sharing is unavailable on this device.');
  await runSessionWork(async () => {
    const json = await getSharedMobileApiClient().requestText('/api/v2/auth/privacy-export');
    const file = new File(Paths.cache, `smart-expense-privacy-${Date.now()}.json`);
    try {
      file.write(json);
      await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Save your privacy export', UTI: 'public.json' });
    } finally { if (file.exists) file.delete(); }
  });
}

export function validatePasswordChange(current: string, password: string, confirmation: string) {
  if (!current) throw new Error('Enter your current password');
  if (password.length < 12 || password.length > 128) throw new Error('Use between 12 and 128 characters for your new password');
  if (password === current) throw new Error('Choose a different password');
  if (password !== confirmation) throw new Error('The new passwords do not match');
}
