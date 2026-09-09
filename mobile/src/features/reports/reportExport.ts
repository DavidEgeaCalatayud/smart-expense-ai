import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import type { ServerDerivedApi } from '../../api/serverDerivedApi';
import { runSessionWork } from '../../auth/sessionWork';

export async function shareMonthlyReport(api: ServerDerivedApi, month: string): Promise<void> {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Choose a valid month.');
  if (!(await Sharing.isAvailableAsync())) throw new Error('File sharing is unavailable on this device.');
  await runSessionWork(async () => {
    // The server performs entitlement checks and CSV escaping. No credentials
    // are placed in a download URL or handed to another application.
    const csv = await api.getMonthlyReportCsv(month);
    const file = new File(Paths.cache, `smart-expense-report-${month}-${Date.now()}.csv`);
    try {
      file.write(csv);
      await Sharing.shareAsync(file.uri, { mimeType: 'text/csv',
        dialogTitle: 'Share monthly report', UTI: 'public.comma-separated-values-text' });
    } finally {
      if (file.exists) file.delete();
    }
  });
}
