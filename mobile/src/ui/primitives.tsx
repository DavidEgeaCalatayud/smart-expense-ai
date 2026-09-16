import { forwardRef } from 'react';
import * as Native from 'react-native';
import { SafeAreaView as NativeSafeAreaView, type SafeAreaViewProps } from 'react-native-safe-area-context';
import { themedColor, useAppPreferences } from '../preferences/AppPreferences';

export { ActivityIndicator, Alert, AppState, Keyboard, KeyboardAvoidingView, Modal, Platform, RefreshControl, StyleSheet, Switch, Linking } from 'react-native';
function mapStyle<T extends Native.ViewStyle | Native.TextStyle>(style: Native.StyleProp<T>, dark: boolean): T {
  const original = Native.StyleSheet.flatten(style) ?? {};
  if (!dark) return original as T;
  const mapped = { ...original } as Record<string, unknown>;
  for (const key of Object.keys(mapped)) if (key.toLowerCase().includes('color')) mapped[key] = themedColor(mapped[key], dark, key === 'backgroundColor');
  return mapped as T;
}
export const View = forwardRef<Native.View, Native.ViewProps>(function View(props, ref) {
  const { dark } = useAppPreferences(); return <Native.View {...props} ref={ref} style={mapStyle(props.style, dark)} />;
});
export const Text = forwardRef<Native.Text, Native.TextProps>(function Text(props, ref) {
  const { dark } = useAppPreferences(); return <Native.Text {...props} ref={ref} style={mapStyle([{ color: dark ? '#e7f1eb' : '#111827' }, props.style], dark)} />;
});
export const TextInput = forwardRef<Native.TextInput, Native.TextInputProps>(function TextInput(props, ref) {
  const { dark } = useAppPreferences(); return <Native.TextInput placeholderTextColor={dark ? '#acbfb3' : '#667467'} {...props} ref={ref} style={mapStyle([{ color: dark ? '#e7f1eb' : '#111827' }, props.style], dark)} />;
});
export const ScrollView = forwardRef<Native.ScrollView, Native.ScrollViewProps>(function ScrollView(props, ref) {
  const { dark } = useAppPreferences(); return <Native.ScrollView {...props} ref={ref} style={mapStyle(props.style, dark)} contentContainerStyle={mapStyle(props.contentContainerStyle, dark)} />;
});
export const Pressable = forwardRef<Native.View, Native.PressableProps>(function Pressable(props, ref) {
  const { dark } = useAppPreferences(); const style = props.style;
  return <Native.Pressable {...props} ref={ref} style={(state) => mapStyle(typeof style === 'function' ? style(state) : style, dark)} />;
});
export const SafeAreaView = forwardRef<Native.View, SafeAreaViewProps>(function SafeAreaView(props, ref) {
  const { dark } = useAppPreferences(); return <NativeSafeAreaView {...props} ref={ref} style={mapStyle(props.style, dark)} />;
});
export function FlatList<T>(props: Native.FlatListProps<T>) {
  const { dark } = useAppPreferences(); return <Native.FlatList<T> {...props} style={mapStyle(props.style, dark)} contentContainerStyle={mapStyle(props.contentContainerStyle, dark)} />;
}
