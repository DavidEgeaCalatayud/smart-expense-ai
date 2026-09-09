import { Pressable, Text, View } from '../ui/primitives';
import { serverWorkspaceStyles as s } from './ServerWorkspaceShell';

export function currentMonth(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function MonthSelector({ month, onChange }: { month: string; onChange: (month: string) => void }) {
  const move = (delta: number) => {
    const [year = 2026, number = 1] = month.split('-').map(Number);
    const date = new Date(year, number - 1 + delta, 1);
    onChange(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
  };
  return <View style={[s.row, { alignItems: 'center', justifyContent: 'space-between' }]}>
    <Pressable accessibilityRole="button" accessibilityLabel="Previous month"
      onPress={() => move(-1)} style={s.secondaryButton}><Text>Previous</Text></Pressable>
    <Text accessibilityRole="header" style={s.cardTitle}>{month}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="Next month"
      onPress={() => move(1)} style={s.secondaryButton}><Text>Next</Text></Pressable>
  </View>;
}
