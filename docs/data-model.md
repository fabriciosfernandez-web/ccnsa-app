# Modelo de datos inicial — CCNSA App

## Principios

1. **Obligaciones y pagos son entidades distintas.** La deuda se calcula como obligaciones exigibles menos pagos aplicados; no se representa mediante una celda mensual vacía o completada.
2. **La planilla 2026 no es la base operativa de la aplicación.** Se utilizará como fuente de migración y conciliación antes de pasar a Firestore.
3. **Los roles no se confían al navegador.** El perfil de acceso vive en `users/{uid}` y las reglas de Firestore aplican el aislamiento.
4. **Los datos sensibles se minimizan.** No se guardan contraseñas en Firestore y no se incluyen secretos en el repositorio.
5. **Las operaciones financieras deben ser trazables.** Las escrituras sensibles tendrán registro de auditoría; en Spark el log es generado por el cliente autorizado y, si en el futuro se adopta backend confiable, deberá reforzarse del lado servidor.

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
- `nombreCompleto`
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

Campos iniciales:
- `socioId`
- `concepto`: membresía, cuota mensual, ingreso, deuda anterior u otro
- `periodo`: por ejemplo `2026-08`
- `importe`
- `fechaVencimiento`
- `estado`: `PENDIENTE | PARCIAL | PAGADA | ANULADA | EXENTA`
- `createdAt`
- `updatedAt`

### `pagos/{pagoId}`
Pagos efectivamente registrados.

Campos iniciales:
- `socioId`
- `fechaPago`
- `importe`
- `medioPago`
- `referencia` opcional
- `estado`: `REGISTRADO | ANULADO`
- `registradoPorUid`
- `createdAt`
- `updatedAt`

La aplicación de un pago a una o varias obligaciones se diseñará en el siguiente hito para admitir pagos parciales y anticipados sin perder trazabilidad.

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

### `audit_log/{logId}`
Bitácora append-only para operaciones sensibles.

Campos mínimos:
- `actorUid`
- `action`
- `entityType`
- `entityId`
- `timestamp`
- `summary`

## Roles iniciales

| Rol | Alcance |
| --- | --- |
| `SOCIO` | Lectura exclusivamente de su perfil institucional, obligaciones y pagos vinculados. |
| `TESORERIA` | Consulta de socios y gestión de obligaciones, pagos y movimientos financieros. |
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
