import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { themedColor, useAppPreferences } from '../preferences/AppPreferences';
export default function Icon(props: ComponentProps<typeof Ionicons>) {
  const { dark } = useAppPreferences();
  return <Ionicons {...props} color={themedColor(props.color ?? '#125c47', dark) as ComponentProps<typeof Ionicons>['color']} />;
}
