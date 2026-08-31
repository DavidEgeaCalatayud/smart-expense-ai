import { Link } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

export type WorkspaceName =
  | 'transactions'
  | 'categories'
  | 'budgets'
  | 'dashboard'
  | 'intelligence'
  | 'historical'
  | 'predictions'
  | 'assistant';

const ITEMS = [
  { key: 'transactions' as const, label: 'Transactions', href: '/' as const },
  { key: 'categories' as const, label: 'Categories', href: '/categories' as const },
  { key: 'budgets' as const, label: 'Budgets', href: '/budgets' as const },
  { key: 'dashboard' as const, label: 'Dashboard', href: '/dashboard' as const },
  { key: 'intelligence' as const, label: 'Intelligence', href: '/intelligence' as const },
  { key: 'historical' as const, label: 'Historical', href: '/historical' as const },
  { key: 'predictions' as const, label: 'Predictions', href: '/predictions' as const },
  { key: 'assistant' as const, label: 'Assistant', href: '/assistant' as const },
];

export function WorkspaceNav({ active }: { active: WorkspaceName }) {
  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        contentContainerStyle={styles.content}
        showsHorizontalScrollIndicator={false}
      >
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
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#e8ebef',
    borderRadius: 12,
    overflow: 'hidden',
  },
  content: { gap: 4, padding: 4 },
  item: {
    alignItems: 'center',
    borderRadius: 9,
    minWidth: 92,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  activeItem: { backgroundColor: '#ffffff' },
  pressed: { opacity: 0.75 },
  label: { fontSize: 12, fontWeight: '700', opacity: 0.65 },
  activeLabel: { opacity: 1 },
});
