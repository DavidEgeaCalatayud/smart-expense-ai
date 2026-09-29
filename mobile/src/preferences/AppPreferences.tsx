import * as SecureStore from 'expo-secure-store';
import { createContext, type PropsWithChildren, useContext, useEffect, useState } from 'react';
import { Appearance, useColorScheme } from 'react-native';

export { themedColor, type ThemeColorRole } from './themeColors';

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
