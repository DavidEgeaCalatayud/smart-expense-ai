import { useAppLock } from '../security/AppLockProvider';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View , SafeAreaView } from '../ui/primitives';
import { serverWorkspaceStyles as s } from './ServerWorkspaceShell';

export function ChoiceField<T extends string>({ label, value, options, onChange, disabled = false }: {
  label: string; value: T; options: { value: T; label: string }[]; onChange(value: T): void; disabled?: boolean;
}) {
  const { locked } = useAppLock();
  const [open, setOpen] = useState(false);
  return <View style={{ gap: 6 }}>
    <Text style={s.metadata}>{label}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled}
      style={s.input} onPress={() => setOpen(true)}>
      <Text style={s.body}>{options.find((option) => option.value === value)?.label ?? 'Choose…'} ▾</Text>
    </Pressable>
    <Modal visible={open && !locked} animationType="slide" onRequestClose={() => setOpen(false)}>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#f6f7f9' }}>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }} keyboardShouldPersistTaps="handled">
          <Text style={s.sectionTitle}>{label}</Text>
          {options.map((option) => <Pressable key={option.value} accessibilityRole="radio"
            accessibilityState={{ checked: value === option.value }} style={s.card}
            onPress={() => { onChange(option.value); setOpen(false); }}>
            <Text style={s.body}>{option.label}{value === option.value ? ' ✓' : ''}</Text>
          </Pressable>)}
          <Pressable accessibilityRole="button" style={s.secondaryButton} onPress={() => setOpen(false)}>
            <Text style={s.secondaryButtonText}>Cancel</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  </View>;
}
