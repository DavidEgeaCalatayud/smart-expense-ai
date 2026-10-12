import type { ComponentProps } from 'react';
import { StyleSheet, View } from './primitives';
import { uiTokens } from './tokens';

export function Card({ style, ...props }: ComponentProps<typeof View>) {
  return <View {...props} style={[styles.card, style]} />;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: uiTokens.color.surface,
    borderRadius: uiTokens.radius.lg,
    padding: 16,
  },
});
