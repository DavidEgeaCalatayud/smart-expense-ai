import Constants from 'expo-constants';
import { Link } from '../../ui/Link';
import { useState } from 'react';
import { Linking, Pressable, Text, View } from '../../ui/primitives';
import notices from '../../../assets/third-party-notices.json';
import { useAppPreferences, type AppearancePreference } from '../../preferences/AppPreferences';
import { ChoiceField } from '../../components/ChoiceField';
import { ServerWorkspaceShell, serverWorkspaceStyles as s } from '../../components/ServerWorkspaceShell';
import { NotificationSettings } from './NotificationSettings';

export function SettingsScreen() {
  const preferences = useAppPreferences();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  return <ServerWorkspaceShell active="settings" title="Settings" subtitle="Make Smart Expense AI feel at home on your phone."
    isRefreshing={false} onRefresh={() => undefined}>
    <View style={s.card}>
      <Text style={s.sectionTitle}>Appearance</Text>
      <ChoiceField<AppearancePreference> label="App appearance" value={preferences.appearance} options={[{ value: 'system', label: 'Follow device' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]}
        onChange={(value) => { void preferences.setAppearance(value).catch(() => setError('Unable to save appearance')); }} />
      {error ? <Text style={s.error}>{error}</Text> : null}
    </View>
    <View style={s.card}><Text style={s.sectionTitle}>Currency</Text><Text style={s.cardValue}>EUR · Euro</Text>
      <Text style={s.body}>Your account records and reports use euros. Amounts are shown in the account currency without exchange-rate conversion.</Text></View>
    <NotificationSettings />
    <View style={s.card}><Text style={s.sectionTitle}>About</Text>
      <Text style={s.cardTitle}>Smart Expense AI</Text><Text style={s.body}>Version {Constants.expoConfig?.version ?? '0.4.0'}</Text>
      <Pressable accessibilityRole="link" style={s.secondaryButton} onPress={() => void Linking.openURL('https://github.com/DavidEgeaCalatayud/smart-expense-ai/blob/main/docs/privacy.md').catch(() => setError('Connect to open the privacy information.'))}><Text>Privacy and data handling</Text></Pressable>
      <Link href="/account" style={{ color: '#125c47', paddingVertical: 12 }}>Account, data export and deletion →</Link>
    </View>
    <Text style={s.sectionTitle}>Licences</Text>
    <Text style={s.metadata}>Open-source packages used by the mobile workspace. Select a package to read its included notice.</Text>
    {notices.map((item) => <View key={item.name} style={s.card}>
      <Pressable accessibilityRole="button" onPress={() => setNotice(notice === item.name ? null : item.name)}>
        <Text style={s.cardTitle}>{item.name}</Text><Text style={s.metadata}>{item.version} · {item.license}</Text>
      </Pressable>
      {notice === item.name ? <>
        <Text selectable style={s.body}>{item.text || 'The package publishes its licence with its source distribution.'}</Text>
        <Pressable accessibilityRole="link" style={s.secondaryButton} onPress={() => void Linking.openURL(item.url).catch(() => setError('Connect to open the package source.'))}><Text>Package source</Text></Pressable>
      </> : null}
    </View>)}
  </ServerWorkspaceShell>;
}
