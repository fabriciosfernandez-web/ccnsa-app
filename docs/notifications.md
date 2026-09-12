# Arquitectura de notificaciones — CCNSA App

## Objetivo

Incorporar avisos de estado de cuenta sin acoplar la aplicación a Firebase ni a un proveedor de correo o push.

La aplicación trabaja contra un contrato `NotificationService`. Durante la Fase 1 se usa una implementación mock en memoria. Más adelante se podrá sustituir por una implementación Firestore sin cambiar las páginas consumidoras.

## Eventos iniciales

- `ACCOUNT_STATEMENT_READY`: nuevo estado de cuenta disponible.
- `PAYMENT_POSTED`: confirmación de pago registrado.
- `OVERDUE_REMINDER`: obligación vencida o próxima a vencer.
- `GENERAL_NOTICE`: comunicación general relacionada con la cuenta.

## Canales previstos

- `IN_APP`: centro de notificaciones dentro de CCNSA App.
- `EMAIL`: correo electrónico.
- `PUSH`: notificación web/móvil en una fase posterior.

Los canales de entrega se modelan por separado del evento. Un mismo evento puede generar cero, una o varias entregas según las preferencias del socio.

## Componentes

### Dominio

`src/notifications/types.ts`

Define notificación, preferencias y resultado de entrega sin depender de Firebase.

### Contrato

`src/notifications/NotificationService.ts`

Expone operaciones para listar notificaciones, contar pendientes, marcar lectura y manejar preferencias.

### Implementación actual

`src/notifications/mockNotificationService.ts`

Permite desarrollar y probar la experiencia visual sin proyecto Firebase ni servicios externos.

### Interfaz

`/socio/notificaciones`

Muestra avisos y preferencias de demostración.

## Modelo previsto en Firestore

### `notifications/{notificationId}`

Campos sugeridos:

- `socioId`
- `kind`
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

`deduplicationKey` evita generar dos veces el mismo aviso, por ejemplo `statement:SOCIO-001:2026-09`.

### `notification_preferences/{socioId}`

Campos sugeridos:

- `inApp`
- `email`
- `push`
- `overdueReminders`
- `paymentConfirmations`
- `monthlyStatements`
- `updatedAt`

### `notification_deliveries/{deliveryId}`

Bitácora técnica de cada intento de entrega:

- `notificationId`
- `channel`
- `status`: `PENDING | SENT | FAILED | SKIPPED`
- `attemptedAt`
- `providerMessageId` opcional
- `errorCode` opcional

## Regla de diseño importante

Crear una notificación y enviarla no son la misma operación.

1. Ocurre un evento de negocio, por ejemplo se registra un pago.
2. Se crea la notificación canónica.
3. Se consultan preferencias.
4. Se generan entregas por canal.
5. Cada canal registra su resultado.

Esto permite cambiar de proveedor de correo o push sin alterar pagos, obligaciones ni estados de cuenta.

## Automatización futura

La interfaz y el dominio pueden desarrollarse en Spark. Sin embargo, los recordatorios periódicos y el envío automático confiable de correos/push requieren un proceso servidor o scheduler confiable. Si se mantiene Spark, la primera versión puede limitarse a notificaciones in-app creadas por operaciones autorizadas y dejar correo/push como adaptadores pendientes. Si se adopta backend posteriormente, deberá utilizar un patrón outbox/worker o equivalente para evitar duplicados y mantener trazabilidad.

## Seguridad

- Un socio solo puede leer sus notificaciones.
- Un socio puede marcar como leído únicamente sus propios avisos y no modificar título, importe, socioId ni origen.
- Las notificaciones de negocio deben ser creadas por personal autorizado o por un backend confiable.
- Las preferencias pertenecen al socio autenticado.
- La bitácora de entregas no debe ser modificable por usuarios finales.
