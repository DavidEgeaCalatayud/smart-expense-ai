export type AppLanguage = 'es' | 'en';

const messages = {
  es: {
    money: 'Mi dinero',
    activity: 'Actividad',
    insights: 'Análisis',
    more: 'Más',
    budgets: 'Presupuestos',
    categories: 'Categorías',
    importCsv: 'Importar CSV',
    predictions: 'Predicciones',
    historical: 'Análisis histórico',
    assistant: 'Asistente financiero',
    reports: 'Informes',
    accountSecurity: 'Cuenta y seguridad',
    settings: 'Ajustes',
    signOut: 'Cerrar sesión',
    save: 'Guardar',
    cancel: 'Cancelar',
  },
  en: {
    money: 'My money',
    activity: 'Activity',
    insights: 'Insights',
    more: 'More',
    budgets: 'Budgets',
    categories: 'Categories',
    importCsv: 'Import CSV',
    predictions: 'Predictions',
    historical: 'Historical analysis',
    assistant: 'Financial assistant',
    reports: 'Reports',
    accountSecurity: 'Account & security',
    settings: 'Settings',
    signOut: 'Sign out',
    save: 'Save',
    cancel: 'Cancel',
  },
} as const;

export const DEFAULT_LANGUAGE: AppLanguage = 'es';

export function t(key: keyof typeof messages.es, language: AppLanguage = DEFAULT_LANGUAGE): string {
  return messages[language][key];
}
