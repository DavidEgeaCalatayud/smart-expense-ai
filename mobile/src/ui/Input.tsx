import type { ComponentProps } from 'react';
import { StyleSheet, TextInput } from './primitives';
import { uiTokens } from './tokens';

export function Input({ style, ...props }: ComponentProps<typeof TextInput>) {
  return <TextInput {...props} style={[styles.input, style]} />;
}

const styles = StyleSheet.create({
  input: {
    minHeight: 50,
    backgroundColor: uiTokens.color.surface,
    borderColor: uiTokens.color.border,
    borderRadius: uiTokens.radius.md,
    borderWidth: 1,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
});
