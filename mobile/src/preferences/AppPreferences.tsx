import * as SecureStore from 'expo-secure-store';
import { createContext, type PropsWithChildren, useContext, useEffect, useState } from 'react';
import { Appearance, useColorScheme } from 'react-native';

export type AppearancePreference = 'system' | 'light' | 'dark';
const KEY = 'smart-expense-ai.appearance';
const Context = createContext({ appearance: 'system' as AppearancePreference, dark: false,
  setAppearance: async (_value: AppearancePreference): Promise<void> => undefined });
export function AppPreferencesProvider({ children }: PropsWithChildren) {
  const system = useColorScheme();
  const [appearance, setValue] = useState<AppearancePreference>('system');
  useEffect(() => {
    let active = true;
    void SecureStore.getItemAsync(KEY).then((value) => {
      if (active && (value === 'system' || value === 'light' || value === 'dark')) { Appearance.setColorScheme(value === 'system' ? 'unspecified' : value); setValue(value); }
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  const setAppearance = async (value: AppearancePreference) => { await SecureStore.setItemAsync(KEY, value); Appearance.setColorScheme(value === 'system' ? 'unspecified' : value); setValue(value); };
  return <Context.Provider value={{ appearance, dark: appearance === 'dark' || (appearance === 'system' && system === 'dark'), setAppearance }}>{children}</Context.Provider>;
}
export function useAppPreferences() { return useContext(Context); }

export function themedColor(value: unknown, dark: boolean, background = false): unknown {
  if (!dark || typeof value !== 'string') return value;
  const map: Record<string, string> = background ? {
    '#f6f7f9': '#0d1715', '#ffffff': '#162620', '#fff': '#162620', '#e8ebef': '#243a31',
    '#dff3e9': '#234c3b', '#e1f4e9': '#234c3b', '#e7ece9': '#294136', '#fff7ed': '#3b2d1d',
  } : {
    '#000': '#e7f1eb', '#000000': '#e7f1eb', '#111827': '#e7f1eb', '#125c47': '#a0e2bf',
    '#17765a': '#9be0bf', '#596575': '#acbfb3', '#b42318': '#ffab9f', '#c9ced6': '#496555', '#d9dde3': '#496555', '#e7ece9': '#294136',
  };
  return map[value.toLowerCase()] ?? value;
}
