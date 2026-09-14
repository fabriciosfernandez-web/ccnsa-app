# Modelo de datos — CCNSA App

## Principios

1. **Obligaciones y pagos son entidades distintas.** La deuda se calcula a partir de obligaciones, pagos y sus aplicaciones; no se representa mediante una celda mensual vacía o completada.
2. **La planilla 2026 no es la base operativa de la aplicación.** Se utilizará como fuente de migración y conciliación antes de pasar a Firestore.
3. **Los roles no se confían al navegador.** El perfil de acceso vive en `users/{uid}` y las reglas de Firestore aplican el aislamiento.
4. **Los datos sensibles se minimizan.** No se guardan contraseñas en Firestore y no se incluyen secretos en el repositorio.
5. **Las operaciones financieras deben ser trazables.** Las escrituras sensibles generan auditoría y las aplicaciones de pagos son append-only.
6. **Las notificaciones se desacoplan de los canales de entrega.** El evento de negocio, la notificación y su eventual entrega por correo/push se modelan como conceptos separados.

## Colecciones

### `users/{uid}`
Perfil de autorización vinculado a Firebase Authentication.

Campos iniciales:
- `displayName`: string
- `role`: `SOCIO | TESORERIA | ADMIN | CONSULTA`
- `socioId`: string opcional; obligatorio para rol `SOCIO`
- `active`: boolean
- `createdAt`: timestamp
- `updatedAt`: timestamp

### `socios/{socioId}`
Maestro de socios.

Campos iniciales:
- `nombre`
- `documento` o identificador institucional cuando corresponda
- `categoria`
- `estado`
- `fechaIngreso`
- `email`
- `telefono` opcional
- `createdAt`
- `updatedAt`

La relación de autenticación se mantiene en `users`, no mediante contraseña almacenada en `socios`.

### `obligaciones/{obligacionId}`
Importes que el socio debe abonar.

Campos:
- `socioId`
- `concepto`: membresía, cuota mensual, ingreso, deuda anterior u otro
- `periodo`: por ejemplo `2026-08`
- `importe`
- `fechaVencimiento` opcional
- `estado`: `PENDIENTE | PARCIAL | PAGADA | ANULADA | EXENTA`
- `createdAt`
- `updatedAt`

`PENDIENTE`, `PARCIAL` y `PAGADA` se presentan en la interfaz a partir del importe aplicado. `ANULADA` y `EXENTA` son estados administrativos explícitos.

### `pagos/{pagoId}`
Pagos efectivamente registrados.

Campos:
- `socioId`
- `fecha`
- `importe`
- `medioPago`
- `referencia` opcional
- `estado`: `REGISTRADO | ANULADO`
- `createdAt`

Un pago puede quedar total o parcialmente sin aplicar. Ese remanente representa **saldo a favor** del socio.

### `aplicaciones_pago/{aplicacionId}`
Vínculo trazable entre un pago y una obligación.

Campos:
- `socioId`
- `pagoId`
- `obligacionId`
- `importe`
- `actorUid`
- `createdAt`

Reglas funcionales de la Fase 2:
- un pago nuevo se imputa automáticamente a las obligaciones pendientes más antiguas;
- una obligación nueva consume automáticamente saldos a favor existentes;
- un pago puede cubrir parcialmente una obligación;
- un pago puede cubrir varias obligaciones;
- un pago mayor que la deuda deja remanente como saldo a favor;
- las aplicaciones son append-only para mantener trazabilidad.

En la arquitectura Spark inicial la aplicación se calcula en el cliente autorizado y se registra en un batch de Firestore. Antes de una operación productiva de mayor escala debe reforzarse con backend transaccional confiable.

### `ingresos/{ingresoId}` y `egresos/{egresoId}`
Movimientos financieros generales no derivados automáticamente de cuotas, según corresponda.

Campos comunes:
- `fecha`
- `concepto`
- `categoria`
- `importe`
- `referencia` opcional
- `registradoPorUid`
- `createdAt`
- `updatedAt`

### `actividades/{actividadId}`
Maestro de actividades o eventos, por ejemplo retiros, San Juan o Club de Damas.

Campos iniciales:
- `nombre`
- `tipo`
- `fechaInicio`
- `fechaFin` opcional
- `estado`
- `createdAt`
- `updatedAt`

### `movimientos_actividad/{movimientoId}`
Ingresos o egresos asociados a una actividad.

Campos iniciales:
- `actividadId`
- `tipo`: `INGRESO | EGRESO`
- `fecha`
- `concepto`
- `importe`
- `registradoPorUid`
- `createdAt`

### `configuracion/{configId}`
Parámetros con vigencia, por ejemplo aranceles por categoría y concepto. Los valores no se repetirán en cada fila de socio.

### `notifications/{notificationId}`
Aviso canónico vinculado a un socio. El hecho de que exista una notificación no implica que ya haya sido entregada por correo o push.

Campos iniciales:
- `socioId`
- `kind`: `ACCOUNT_STATEMENT_READY | PAYMENT_POSTED | OVERDUE_REMINDER | GENERAL_NOTICE`
- `title`
- `message`
- `status`: `UNREAD | READ`
- `createdAt`
- `readAt` opcional
- `accountPeriod` opcional
- `amount` opcional
- `currency` opcional
- `actionUrl` opcional
- `sourceType` opcional
- `sourceId` opcional
- `deduplicationKey`

### `notification_preferences/{socioId}`
Preferencias de recepción del socio.

Campos iniciales:
- `socioId`
- `inApp`
- `email`
- `push`
- `overdueReminders`
- `paymentConfirmations`
- `monthlyStatements`
- `updatedAt`

### `notification_deliveries/{deliveryId}`
Bitácora técnica de intentos de entrega por canal. En la arquitectura inicial no se escribirá desde el navegador.

Campos iniciales:
- `notificationId`
- `channel`: `IN_APP | EMAIL | PUSH`
- `status`: `PENDING | SENT | FAILED | SKIPPED`
- `attemptedAt` opcional
- `providerMessageId` opcional
- `errorCode` opcional

La arquitectura funcional completa está documentada en `docs/notifications.md`.

### `audit_log/{logId}`
Bitácora append-only para operaciones sensibles.

Campos mínimos:
- `actorUid`
- `action`
- `entity`
- `entityId`
- `socioId` cuando corresponda
- `createdAt`
- datos resumidos de la operación, sin secretos

## Cálculo del estado de cuenta

Para un socio:

- `totalCargos` = suma de obligaciones no anuladas ni exentas;
- `totalPagos` = suma de pagos no anulados;
- `importeAplicado` de una obligación = suma de `aplicaciones_pago` vinculadas;
- `saldoPendiente` = importe de la obligación menos aplicaciones;
- `saldoFavor` = suma de pagos menos sus aplicaciones;
- `saldoNeto` = saldo pendiente menos saldo a favor.

El saldo a favor no se pierde: se conserva en el pago original y se consume cuando aparecen nuevas obligaciones.

## Roles iniciales

| Rol | Alcance |
| --- | --- |
| `SOCIO` | Lectura exclusivamente de su perfil institucional, obligaciones, pagos, aplicaciones y notificaciones vinculadas; puede marcar sus propias notificaciones como leídas y administrar sus preferencias. |
| `TESORERIA` | Consulta de socios y gestión de obligaciones, pagos y movimientos financieros; puede generar notificaciones de negocio. |
| `ADMIN` | Administración completa, incluidos usuarios, socios y configuración. |
| `CONSULTA` | Acceso interno de solo lectura para control/auditoría. |

## Migración

La migración desde la planilla `Lista de miembros 2026` se hará en una fase separada:

1. extracción en modo lectura;
2. normalización a estructuras temporales;
3. detección de inconsistencias y duplicados;
4. carga a un entorno de desarrollo con datos de prueba o copia controlada;
5. conciliación de totales contra la planilla;
6. recién entonces carga productiva.
