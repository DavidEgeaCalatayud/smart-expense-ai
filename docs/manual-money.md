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

El histórico se reconstruye reproduciendo cronológicamente las observaciones de cada cuenta. La API consolida múltiples cambios del mismo día en un único total diario final.

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

Una edición offline de saldo, inclusión patrimonial o archivado produce una observación local pendiente y una mutación de la cuenta. El servidor valida versión/propiedad y replica posteriormente la cuenta y su observación canónica a los demás clientes.

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

1. Desplegar backend y ejecutar las migraciones Alembic hasta `0017_financial_account_state_history`.
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
