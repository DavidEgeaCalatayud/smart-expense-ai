import Ionicons from '../ui/Icon';
import { Link, usePathname, useRouter } from 'expo-router';
import { Fragment, useEffect, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, View } from '../ui/primitives';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type WorkspaceName = 'transactions' | 'categories' | 'budgets' | 'dashboard' | 'intelligence'
  | 'historical' | 'predictions' | 'suggestions' | 'assistant' | 'reports' | 'advanced-insights'
  | 'account' | 'imports' | 'insights' | 'more' | 'settings';
const INSIGHTS = ['intelligence', 'historical', 'predictions', 'suggestions', 'assistant', 'advanced-insights', 'insights'];
const TABS = [
  { label: 'Home', href: '/' as const, icon: 'home-outline' as const },
  { label: 'Activity', href: '/transactions' as const, icon: 'card-outline' as const },
  { label: 'Insights', href: '/insights' as const, icon: 'sparkles-outline' as const },
  { label: 'More', href: '/more' as const, icon: 'menu-outline' as const },
];
export function navigationArea(pathname: string): number {
  const path = pathname.replace(/^\//, '');
  if (!path || path === 'dashboard') return 0;
  if (path === 'transactions') return 1;
  if (INSIGHTS.includes(path)) return 2;
  return 3;
}

export function BottomNavigation() {
  const pathname = usePathname();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [keyboard, setKeyboard] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboard(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboard(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  if (keyboard) return null;
  return <View style={[styles.tabs, { paddingBottom: Math.max(insets.bottom, 8) }]}>
    {TABS.map((tab, index) => {
      const active = navigationArea(pathname) === index;
      return <Fragment key={tab.label}>
        {index === 2 ? <Pressable accessibilityRole="button" accessibilityLabel="Add transaction" testID="quick-add"
          onPress={() => router.push('/transactions?quickAdd=expense')} style={[styles.tab, { justifyContent: 'center', flex: 0.85 }]}>
          <View style={{ backgroundColor: '#125c47', borderRadius: 24, width: 46, height: 46, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="add" color="#fff" size={30} /></View>
        </Pressable> : null}
        <Pressable accessibilityRole="tab" accessibilityLabel={tab.label}
        accessibilityState={{ selected: active }} testID={`tab-${tab.label.toLowerCase()}`}
        onPress={() => router.replace(tab.href)} style={styles.tab}>
        <View style={[styles.icon, active && styles.selected]}>
          <Ionicons name={tab.icon} size={23} color={active ? '#125c47' : '#596575'} />
        </View>
        <Text style={[styles.label, active && styles.selectedLabel]}>{tab.label}</Text>
      </Pressable></Fragment>;
    })}
  </View>;
}

// Secondary screens return to their area; the four primary destinations stay fixed below the stack.
export function WorkspaceNav({ active }: { active: WorkspaceName }) {
  if (['dashboard', 'transactions', 'insights', 'more'].includes(active)) return null;
  const insight = INSIGHTS.includes(active);
  return <Link href={insight ? '/insights' : '/more'} asChild>
    <Pressable accessibilityRole="button" style={styles.back}>
      <Ionicons name="chevron-back" size={20} color="#125c47" />
      <Text style={styles.selectedLabel}>{insight ? 'All insights' : 'More'}</Text>
    </Pressable>
  </Link>;
}
const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', backgroundColor: '#fff', paddingTop: 8, borderTopWidth: 1, borderTopColor: '#e7ece9' },
  tab: { flex: 1, alignItems: 'center', gap: 3, minHeight: 54 },
  icon: { width: 58, height: 30, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  selected: { backgroundColor: '#dff3e9' },
  label: { color: '#596575', fontSize: 12, fontWeight: '600' },
  selectedLabel: { color: '#125c47', fontWeight: '700' },
  back: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', minHeight: 44, gap: 4 },
});
