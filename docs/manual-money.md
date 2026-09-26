# Mi dinero: cuentas manuales y patrimonio

`Mi dinero` reúne saldos que el usuario mantiene manualmente en bancos, brokers, wallets, efectivo u otros lugares. La primera versión no solicita credenciales bancarias ni conecta con Open Banking.

## Alcance

Cada cuenta financiera guarda:

- nombre e institución opcional;
- tipo: corriente, ahorro, broker, wallet, efectivo u otro;
- finalidad: día a día, ahorro, emergencia, oportunidades, inversión u otra;
- saldo actual en EUR;
- si debe incluirse en el patrimonio;
- estado activo/archivado.

Las transacciones y las cuentas financieras son conceptos independientes en esta versión. Las transacciones explican flujos de ingresos y gastos; `FinancialAccount` representa el stock de dinero que el usuario declara tener en un momento dado. Smart Expense AI no descuenta automáticamente una transacción del saldo de una cuenta.

## Exactitud monetaria

El backend usa `NUMERIC`/`Decimal`, la API transmite importes monetarios como cadenas decimales y Android almacena unidades menores enteras. No se utilizan números de coma flotante para persistir dinero.

La primera versión admite exclusivamente EUR.

## Historial patrimonial

Un saldo no se sobrescribe sin conservar una observación. `FinancialAccountBalanceSnapshot` registra:

- saldo;
- `includeInNetWorth`;
- `archived`;
- fecha/hora de la observación;
- procedencia (`manual`, preparada para futuras fuentes de importación).

También se crea una nueva observación cuando cambia `includeInNetWorth` o cuando una cuenta se archiva. Por ello, modificar hoy la inclusión de una cuenta no reescribe el patrimonio del pasado.

Ejemplo:

- enero: Bankinter 1.000 EUR + Trade Republic 2.000 EUR = 3.000 EUR;
- junio: Bankinter se archiva;
- enero-mayo permanecen en 3.000 EUR;
- desde junio el total pasa a 2.000 EUR.

El histórico se reconstruye reproduciendo cronológicamente las observaciones de cada cuenta. La API consolida múltiples cambios del mismo día en un único total diario final. Cuando no existe una observación anterior al inicio de la ventana solicitada, la variación comienza en la primera observación real disponible y no se inventa un punto de patrimonio cero.

La variación del patrimonio incluye altas y bajas de cuentas, depósitos, retiradas, transferencias y cambios manuales de saldo. **No equivale a rentabilidad de inversión.**

## Resumen patrimonial

`GET /api/v2/net-worth/summary` devuelve, calculado en backend:

- patrimonio total;
- disponible;
- reservado;
- invertido;
- desglose por finalidad.

`GET /api/v2/net-worth/history?months=N` devuelve el histórico diario y la variación monetaria/porcentual del periodo.

## Android offline-first

Android conserva cuentas y observaciones en SQLite cifrado con SQLCipher. Las cuentas son entidades mutables de `sync-v1`; las observaciones históricas son server-authored/read-only para el cliente una vez sincronizadas.

Cada cambio offline de saldo, inclusión patrimonial o archivado crea una observación local pendiente con su propio identificador y `recordedAt`. Si el usuario modifica varias veces la misma cuenta antes de recuperar conexión, Android sigue coalesciendo el **estado final de la cuenta** en una sola mutación para no encadenar versiones desconocidas, pero conserva todas las observaciones intermedias dentro de `balanceObservations`.

Ejemplo:

- 20/09 sin conexión: 1.100 EUR;
- 22/09 sin conexión: 1.200 EUR;
- 24/09 sin conexión: 1.500 EUR;
- al recuperar conexión se envía una única cuenta final de 1.500 EUR junto con las tres observaciones fechadas.

El payload conserva además `historyBase`, el estado patrimonial conocido antes del primer cambio del lote. Esto permite distinguir un cambio final real de una secuencia que vuelve al punto de partida, por ejemplo `1.000 → 1.200 → 1.000`. En ese segundo caso el servidor no necesita inventar un snapshot final adicional, pero sí registra las dos observaciones históricas.

El servidor mantiene el control de concurrencia sobre la cuenta final. Sólo si la mutación queda `applied` o es un reintento `duplicate` se reconcilian las observaciones intermedias. Los identificadores de snapshot hacen esta reconciliación idempotente: un reintento de red no duplica puntos históricos. Si la versión base está obsoleta, la mutación entra en conflicto y el lote histórico no se escribe hasta que el usuario resuelva el conflicto.

La versión de esquema móvil que introduce el estado patrimonial temporal es la v4.

## Dashboard

El Dashboard incluye un bloque de patrimonio con:

- total actual;
- variación de los últimos 12 meses calculada por backend;
- disponible, reservado e invertido;
- acceso directo a `Mi dinero`.

## Financial Assistant

El asistente no calcula por sí mismo importes, porcentajes ni variaciones. Dispone de herramientas de backend para:

- resumen patrimonial actual;
- histórico y cambio de un periodo;
- ranking de cuentas, concentración, porcentaje invertido y capital de oportunidades.

Las respuestas deben indicar cuando sea relevante que los datos proceden de saldos introducidos manualmente y no de conexiones bancarias en tiempo real.

## Insights patrimoniales

Advanced Insights puede derivar de los datos almacenados:

- meses de liquidez respecto al gasto mensual reciente;
- porcentaje del patrimonio invertido;
- cobertura del fondo de emergencia;
- cambio patrimonial de 12 meses;
- capital para oportunidades;
- concentración en la cuenta con mayor saldo.

La cobertura usa el promedio de gastos almacenados de los últimos tres meses de referencia. Estos indicadores son resúmenes deterministas de datos del usuario, no asesoramiento financiero.

## Privacidad

Las cuentas y sus observaciones forman parte de los datos financieros del usuario y deben incluirse en la exportación de privacidad. La eliminación de la cuenta de usuario elimina también estos registros mediante las relaciones existentes de propiedad/cascada.

## Orden de despliegue

1. Desplegar backend y ejecutar las migraciones Alembic hasta la revisión `0017_fin_account_state_history` (archivo `0017_financial_account_state_history.py`).
2. Verificar API web y sincronización.
3. Distribuir después la versión Android con esquema SQLite v4.

Este orden evita que un cliente móvil nuevo reciba payloads históricos que una API antigua todavía no conoce.

## Fuera del alcance de esta V1

- Open Banking o conexión automática con entidades;
- multimoneda;
- conciliación bancaria;
- vincular obligatoriamente cada transacción con una cuenta;
- modelar subcuentas específicas de una entidad.

Si se quiere separar efectivo e inversión de un mismo proveedor, pueden crearse dos cuentas manuales, por ejemplo `Trade Republic · Efectivo` y `Trade Republic · Inversiones`.
