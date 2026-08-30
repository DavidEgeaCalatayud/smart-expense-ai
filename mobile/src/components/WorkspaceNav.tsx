import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export type WorkspaceName = 'transactions' | 'categories' | 'budgets';

const ITEMS = [
  { key: 'transactions' as const, label: 'Transactions', href: '/' as const },
  { key: 'categories' as const, label: 'Categories', href: '/categories' as const },
  { key: 'budgets' as const, label: 'Budgets', href: '/budgets' as const },
];

export function WorkspaceNav({ active }: { active: WorkspaceName }) {
  return (
    <View style={styles.container}>
      {ITEMS.map((item) => (
        <Link key={item.key} href={item.href} asChild>
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.item,
              item.key === active && styles.activeItem,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.label, item.key === active && styles.activeLabel]}>
              {item.label}
            </Text>
          </Pressable>
        </Link>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#e8ebef',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 4,
    padding: 4,
  },
  item: {
    alignItems: 'center',
    borderRadius: 9,
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 9,
  },
  activeItem: { backgroundColor: '#ffffff' },
  pressed: { opacity: 0.75 },
  label: { fontSize: 12, fontWeight: '700', opacity: 0.65 },
  activeLabel: { opacity: 1 },
});
