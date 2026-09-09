import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, Text, View } from '../ui/primitives';
import { localDate } from '../features/transactions/validation';
import { serverWorkspaceStyles as s } from './ServerWorkspaceShell';
export function DateField({ label, value, onChange, disabled = false, optional = false }: {
  label: string; value?: string; onChange(value: string | undefined): void; disabled?: boolean; optional?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const date = new Date(`${value ?? localDate()}T12:00:00`);
  const change = (selected?: Date) => { setOpen(false); if (selected) onChange(localDate(selected)); };
  const choose = () => {
    if (Platform.OS === 'android') DateTimePickerAndroid.open({ value: date, mode: 'date', onChange: (event, selected) => { if (event.type === 'set') change(selected); } });
    else setOpen(true);
  };
  return <View style={{ gap: 6 }}><Text style={s.metadata}>{label}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} style={s.input} onPress={choose}>
      <Text>{value ? date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Any date'} ▣</Text>
    </Pressable>
    {optional && value ? <Pressable accessibilityRole="button" accessibilityLabel={`Clear ${label.toLowerCase()}`} onPress={() => onChange(undefined)} style={{ paddingVertical: 10 }}><Text style={{ color: '#125c47' }}>Clear date</Text></Pressable> : null}
    {open ? <DateTimePicker value={date} mode="date" onChange={(_, selected) => change(selected)} /> : null}
  </View>;
}
