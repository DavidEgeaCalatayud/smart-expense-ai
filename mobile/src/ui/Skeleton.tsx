import { StyleSheet, View } from './primitives';
import { uiTokens } from './tokens';

export function Skeleton({ height = 18, width = '100%' }: { height?: number; width?: number | `${number}%` }) {
  return <View style={[styles.base, { height, width }]} />;
}

export function CardSkeleton() {
  return (
    <View style={styles.card}>
      <Skeleton width="42%" />
      <Skeleton height={30} width="66%" />
      <Skeleton width="84%" />
    </View>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: 8, backgroundColor: '#e4e9e6', opacity: 0.85 },
  card: {
    backgroundColor: uiTokens.color.surface,
    borderRadius: uiTokens.radius.lg,
    padding: 16,
    gap: 12,
  },
});
