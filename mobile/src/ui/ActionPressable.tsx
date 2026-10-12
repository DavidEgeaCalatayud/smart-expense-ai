import * as Haptics from 'expo-haptics';
import { type ComponentProps } from 'react';
import { Pressable } from './primitives';

type Props = ComponentProps<typeof Pressable> & {
  haptic?: 'selection' | 'success' | 'warning' | 'none';
};

export function ActionPressable({ haptic = 'selection', onPress, style, ...props }: Props) {
  return (
    <Pressable
      {...props}
      onPress={(event) => {
        if (haptic !== 'none') {
          const feedback = haptic === 'success'
            ? Haptics.NotificationFeedbackType.Success
            : haptic === 'warning'
              ? Haptics.NotificationFeedbackType.Warning
              : null;
          if (feedback) {
            void Haptics.notificationAsync(feedback).catch(() => undefined);
          } else {
            void Haptics.selectionAsync().catch(() => undefined);
          }
        }
        onPress?.(event);
      }}
      style={style}
    />
  );
}
