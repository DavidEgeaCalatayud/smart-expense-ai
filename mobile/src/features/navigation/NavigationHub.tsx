import Ionicons from '../../ui/Icon';
import type { Href } from 'expo-router';
import { Link } from '../../ui/Link';
import { Pressable, StyleSheet, Text, View } from '../../ui/primitives';
import { ServerWorkspaceShell, serverWorkspaceStyles as s } from '../../components/ServerWorkspaceShell';
import { useOnlineSync } from '../../sync/OnlineSyncProvider';

const insights = [
  ['Inteligencia', 'Patrones, gastos inusuales y suscripciones', '/intelligence', 'sparkles-outline'],
  ['Predicciones', 'Previsión de fin de mes y próximos pagos', '/predictions', 'trending-up-outline'],
  ['Análisis histórico', 'Entiende cómo han cambiado tus finanzas', '/historical', 'time-outline'],
  ['Sugerencias de categoría', 'Encuentra una categoría para tu próximo movimiento', '/suggestions', 'pricetags-outline'],
  ['Asistente financiero', 'Haz preguntas sobre tus finanzas', '/assistant', 'chatbubble-ellipses-outline'],
  ['Análisis avanzados', 'Explora los análisis incluidos en tu plan', '/advanced-insights', 'analytics-outline'],
] as const;
const more = [
  ['Resumen financiero', 'Ingresos, gastos y evolución de tu actividad', '/dashboard', 'home-outline'],
  ['Pagos automáticos', 'Detecta Wallet y avisos bancarios, confirma movimientos y ajusta saldos', '/payment-detection', 'notifications-outline'],
  ['Presupuestos', 'Define límites y sigue tu progreso mensual', '/budgets', 'wallet-outline'],
  ['Categorías', 'Organiza tus ingresos y gastos', '/categories', 'grid-outline'],
  ['Importar CSV', 'Importa un extracto bancario revisándolo antes', '/imports', 'cloud-upload-outline'],
  ['Predicciones', 'Previsión y próximas suscripciones', '/predictions', 'trending-up-outline'],
  ['Análisis histórico', 'Tendencias mensuales y patrones de gasto', '/historical', 'time-outline'],
  ['Asistente financiero', 'Pregunta sobre tus finanzas', '/assistant', 'chatbubble-ellipses-outline'],
  ['Informes', 'Resúmenes mensuales y exportación CSV', '/reports', 'document-text-outline'],
  ['Cuenta y seguridad', 'Contraseña, privacidad, bloqueo y notificaciones', '/account', 'shield-checkmark-outline'],
  ['Ajustes', 'Apariencia, moneda e información de la app', '/settings', 'settings-outline'],
] as const;
export function NavigationHub({ area }: { area: 'insights' | 'more' }) {
  const { syncNow, isSyncing } = useOnlineSync();
  return <ServerWorkspaceShell active={area} title={area === 'insights' ? 'Análisis' : 'Más'}
    subtitle={area === 'insights' ? 'Una visión más clara de dónde va tu dinero.' : 'Tus herramientas, preferencias y cuenta.'}
    isRefreshing={isSyncing} onRefresh={() => void syncNow().catch(() => undefined)}>
    {(area === 'insights' ? insights : more).map(([title, description, href, icon]) =>
      <Link key={href} href={href as Href} asChild><Pressable accessibilityRole="button" style={StyleSheet.flatten([s.card, { flexDirection: 'row', alignItems: 'center', gap: 14 }])}>
        <Ionicons name={icon} size={26} color="#125c47" />
        <View style={{ flex: 1, gap: 4 }}><Text style={s.cardTitle}>{title}</Text><Text style={s.metadata}>{description}</Text></View>
        <Ionicons name="chevron-forward" size={18} color="#596575" />
      </Pressable></Link>)}
    {area === 'more' ? <View style={s.card}>
      <Text style={s.cardTitle}>Añade un gasto sin buscar</Text>
      <Text style={s.body}>En la pantalla de inicio de Android, mantén pulsado un espacio vacío, abre Widgets y elige Smart Expense AI. También puedes mantener pulsado el icono de la app para usar los accesos rápidos de gasto e ingreso.</Text>
      <Link href="/transactions?quickAdd=expense" asChild><Pressable accessibilityRole="button" style={s.primaryButton}><Text style={s.primaryButtonText}>Añadir gasto rápido</Text></Pressable></Link>
    </View> : null}
  </ServerWorkspaceShell>;
}
