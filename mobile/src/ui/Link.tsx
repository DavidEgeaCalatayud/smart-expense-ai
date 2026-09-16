import { Link as RouterLink } from 'expo-router';
import type { ComponentProps } from 'react';
import { StyleSheet, type ColorValue } from 'react-native';
import { themedColor, useAppPreferences } from '../preferences/AppPreferences';

export function Link(props: ComponentProps<typeof RouterLink>) {
  const { dark } = useAppPreferences();
  if (props.asChild) return <RouterLink {...props} />;
  const style = StyleSheet.flatten(props.style);
  return <RouterLink {...props} style={[style, { color: themedColor(style?.color ?? '#125c47', dark) as ColorValue }]} />;
}
