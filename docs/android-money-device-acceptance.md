# Android V1 — aceptación física de Mi dinero y pagos automáticos

Este documento define la batería que debe ejecutarse sobre el **APK permanente exacto** de la V1 en un Android físico. El emulador y los tests unitarios reducen riesgo, pero no sustituyen notificaciones reales de Google Wallet, Bankinter, Bizum ni el ciclo de vida de Android en hardware.

Usa una cuenta de prueba sin datos personales reales innecesarios. No publiques capturas con identificadores bancarios, nombres de terceros, tokens, enlaces de recuperación ni números completos de tarjeta. Registra únicamente los últimos cuatro dígitos cuando hagan falta para distinguir tarjetas.

## 1. Mi dinero

Parte de una cuenta limpia y sincronizada.

1. Crea `Trade Republic` con 1.000,00 EUR desde el catálogo. Debe ser `Broker` y su finalidad efectiva debe permanecer en `Inversión`; el importe debe sumar únicamente en `Invertido`.
2. Crea `Bankinter` con 200,00 EUR. Deben existir dos cuentas activas y el patrimonio total debe ser 1.200,00 EUR.
3. Edita nombre/metadatos de Bankinter sin alterar su saldo. Verifica que Trade Republic no cambia de institución, logo, tipo ni finalidad.
4. Actualiza Bankinter de 200,00 a 250,00 EUR. El total debe pasar a 1.250,00 EUR y el punto anterior debe seguir formando parte del histórico.
5. Desactiva `Incluir en patrimonio` para Bankinter. El saldo de la cuenta debe seguir visible, pero el patrimonio debe pasar a 1.000,00 EUR; el histórico anterior no debe reescribirse.
6. Reactiva `Incluir en patrimonio`. El patrimonio debe volver a 1.250,00 EUR sin borrar los puntos previos.
7. Crea una segunda cuenta `Bankinter Ahorro` con 50,00 EUR. Ambas cuentas Bankinter deben coexistir como entidades independientes; no se permite reemplazo por institución.
8. Archiva únicamente `Bankinter Ahorro`. Deben quedar dos cuentas activas y su historial debe conservarse.
9. Vuelve a editar Trade Republic e intenta seleccionar otra finalidad. Al ser broker, la finalidad efectiva debe seguir siendo `Inversión`.
10. Comprueba `Evolución del patrimonio` tras sincronizar y también después de cerrar/reabrir la app.

Marca como pasados: `moneyCreateEditBalance`, `moneyExcludeFromNetWorth`, `moneyArchivePreservesHistory`, `moneyBrokerAlwaysInvested`, `moneyDuplicateInstitutionAccounts` y `manualMoneyOfflineHistory` solo cuando se cumplan todos los invariantes anteriores.

## 2. Pagos automáticos con notificaciones reales

Configura dos cuentas Bankinter independientes y, cuando sea posible, dos tarjetas distintas en Google Wallet. Empieza en `Confirmar antes de guardar`; usa `Automático con confianza alta` únicamente después de verificar el emparejamiento de cuenta.

Prueba y registra estos casos:

- **Google Wallet → banco**: una compra pagada con Wallet debe producir un único movimiento canónico aunque posteriormente llegue la notificación bancaria.
- **Bankinter directa**: una compra notificada solo por Bankinter debe reconocer importe, comercio y últimos cuatro dígitos cuando estén presentes.
- **Bizum enviado**: debe clasificarse como salida/transferencia enviada y reducir saldo solo tras confirmación o automatismo válido.
- **Bizum recibido**: debe clasificarse como entrada y aumentar saldo.
- **Compra rechazada**: debe quedar como rechazada y no crear gasto ni reducir saldo.
- **Retención/preautorización**: debe permanecer en revisión y no descontar saldo automáticamente.
- **Devolución/reembolso**: debe crear movimiento de entrada y aumentar saldo una sola vez.
- **Wallet + banco, misma compra**: debe quedar un movimiento financiero, no dos.
- **Dos tarjetas en Wallet**: una asociación aprendida para `••••1234` no puede aplicarse a `••••5678`.
- **Dos cuentas Bankinter**: una notificación sin pista suficiente de tarjeta debe quedar ambigua/revisión; no se puede elegir una cuenta al azar.

Si aparece un formato de notificación no reconocido, conserva de forma privada el nombre de la app, título/texto estrictamente necesarios y últimos cuatro dígitos enmascarados para añadir un fixture de regresión. Nunca guardes OTP, PIN, contraseña, token ni número completo de tarjeta.

Marca como pasados: `paymentGoogleWalletThenBank`, `paymentDirectBankinter`, `paymentBizumSentReceived`, `paymentRejected`, `paymentHold`, `paymentRefund`, `paymentWalletBankDeduplication`, `paymentTwoWalletCards` y `paymentTwoBankinterAccounts`.

## 3. Robustez del listener y del ciclo de vida Android

1. Concede acceso al `NotificationListenerService`, activa detección y verifica una notificación de prueba real.
2. Revoca el acceso desde Ajustes Android. La app debe mostrar que el permiso falta y no debe inventar eventos.
3. Vuelve a concederlo y verifica que la captura vuelve a funcionar sin reinstalar.
4. Reinicia completamente el teléfono. Después del arranque, abre la app y comprueba el estado del permiso y que no se dupliquen eventos ya procesados.
5. Cierra la app desde recientes o mata su proceso **sin usar “Forzar detención” de Ajustes**, porque Android pone el paquete en estado detenido y puede impedir deliberadamente que el listener/servicios reciban trabajo hasta un nuevo lanzamiento. Genera una notificación financiera válida y, al reabrir, verifica que cualquier candidato realmente entregado por Android se procese como máximo una vez.
6. Deja la app en segundo plano y repite una operación; comprueba el mismo invariante de no duplicación.
7. Activa modo avión. Modifica saldos/cuentas y crea una operación offline. Para la prueba de persistencia sí fuerza la muerte del proceso y reabre todavía offline; los cambios deben persistir aunque el backend no esté disponible.
8. Recupera conexión. Debe sincronizar sin duplicar observaciones. Provoca después un `stale_version` real desde web/otro cliente y resuelve explícitamente el conflicto.

Marca `notificationPermissionRevokeRestore`, `notificationListenerSurvivesReboot`, `forceStopBackgroundNoDuplicates`, `airplaneModeOfflineSyncAndConflict`, `offlineForceStopAndReopen`, `reconnectWithoutDuplicates`, `backgroundThenForegroundSync` y `conflictResolution` solo con evidencia del dispositivo.

## 4. Revisión visual final

Ejecuta la revisión en claro y oscuro, con tamaño de fuente normal y, al menos, un tamaño mayor del sistema.

- Pantalla inicial `Mi dinero`: hero, desglose Disponible/Reservado/Invertido, cuadrícula de finalidades y tarjetas de cuenta.
- Formularios de alta/edición/actualización de saldo con teclado abierto: ningún botón crítico debe quedar inaccesible.
- Selector completo de entidades con scroll largo y búsqueda. Verifica expresamente Trade Republic, Bankinter, MyInvestor, Trading 212, Quantfury, eToro y Collectr.
- Logos correctos y fallback por iniciales si una imagen no carga; nunca debe aparecer el logo de otra entidad.
- Pantallas estrechas/pequeñas y scroll prolongado: no debe haber solapamientos, texto cortado que impida comprender un importe, ni controles fuera de alcance.
- `Pagos automáticos`: chips de cuenta, importes, estados de rechazado/retención/duplicado y botones de confirmar/ignorar deben mantener contraste suficiente en ambos temas.

Marca `visualLightDark`, `visualBankCatalogAndLogos` y `visualKeyboardSmallScreenLongScroll` únicamente después de revisar la interfaz renderizada en el dispositivo.

## 5. Cierre y evidencia

Copia `docs/android-physical-acceptance.template.json`, rellena identidad exacta del build, hashes, dispositivo y fecha, y cambia a `passed` solo los pasos realmente ejecutados. El cierre V1 requiere que todos los pasos obligatorios estén en `passed` y que el verificador acepte los bytes originales:

```bash
python scripts/verify-release-acceptance.py \
  --artifacts dist/android-distribution \
  --acceptance path/to/completed-physical-acceptance.json
```

Un fallo o formato real de notificación desconocido bloquea la aceptación hasta corregirlo y repetir el caso contra un nuevo build certificado.
