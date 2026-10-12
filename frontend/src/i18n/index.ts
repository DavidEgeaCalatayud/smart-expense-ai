export type AppLanguage = 'es' | 'en';

const messages = {
  es: {
    dashboard: 'Resumen',
    money: 'Mi dinero',
    transactions: 'Movimientos',
    categories: 'Categorías',
    budgets: 'Presupuestos',
    importCsv: 'Importar CSV',
    reports: 'Informes',
    insights: 'Análisis',
    predictions: 'Predicciones',
    intelligence: 'Inteligencia',
    assistant: 'Asistente',
    security: 'Seguridad',
    signOut: 'Cerrar sesión',
  },
  en: {
    dashboard: 'Dashboard',
    money: 'My money',
    transactions: 'Transactions',
    categories: 'Categories',
    budgets: 'Budgets',
    importCsv: 'Import CSV',
    reports: 'Reports',
    insights: 'Insights',
    predictions: 'Predictions',
    intelligence: 'Intelligence',
    assistant: 'Assistant',
    security: 'Security',
    signOut: 'Sign out',
  },
} as const;

export const DEFAULT_LANGUAGE: AppLanguage = 'es';
export function t(key: keyof typeof messages.es, language: AppLanguage = DEFAULT_LANGUAGE): string {
  return messages[language][key];
}
