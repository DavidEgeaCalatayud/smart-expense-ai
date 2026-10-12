import type { StyleProp, ViewStyle } from 'react-native';
import { ActivityIndicator, StyleSheet, Text } from './primitives';
import { ActionPressable } from './ActionPressable';
import { uiTokens } from './tokens';

export function Button({
  label,
  variant = 'primary',
  loading = false,
  disabled = false,
  haptic = 'selection',
  onPress,
  style,
  accessibilityLabel,
}: {
  label: string;
  variant?: 'primary' | 'secondary' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  haptic?: 'selection' | 'success' | 'warning' | 'none';
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const blocked = disabled || loading;
  return (
    <ActionPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: blocked, busy: loading }}
      disabled={blocked}
      haptic={haptic}
      onPress={onPress}
      style={[styles.base, styles[variant], blocked && styles.disabled, style]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'secondary' ? uiTokens.color.text : '#ffffff'} />
      ) : (
        <Text style={[styles.label, variant === 'secondary' && styles.secondaryLabel]}>{label}</Text>
      )}
    </ActionPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: uiTokens.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: uiTokens.radius.md,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  primary: { backgroundColor: uiTokens.color.text },
  secondary: { backgroundColor: uiTokens.color.surface, borderWidth: 1, borderColor: uiTokens.color.border },
  danger: { backgroundColor: uiTokens.color.danger },
  label: { color: '#ffffff', fontSize: 14, fontWeight: '800' },
  secondaryLabel: { color: uiTokens.color.text },
  disabled: { opacity: 0.5 },
});
