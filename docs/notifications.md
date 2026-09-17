# Arquitectura de notificaciones — CCNSA App

## Objetivo

Incorporar avisos de estado de cuenta sin acoplar la aplicación a un proveedor específico de correo o push.

La aplicación trabaja contra un contrato `NotificationService`. En DEV, el canal **IN_APP** ya utiliza Firestore; correo y push permanecen desacoplados para una etapa posterior.

## Eventos iniciales

- `ACCOUNT_STATEMENT_READY`: nuevo estado de cuenta disponible.
- `PAYMENT_POSTED`: confirmación de pago registrado.
- `OBLIGATION_POSTED`: nueva obligación registrada.
- `OVERDUE_REMINDER`: obligación vencida o próxima a vencer.
- `GENERAL_NOTICE`: comunicación general relacionada con la cuenta.

## Canales previstos

- `IN_APP`: centro de notificaciones dentro de CCNSA App. **Activo en DEV.**
- `EMAIL`: correo electrónico. Pendiente de proveedor/backend.
- `PUSH`: notificación web/móvil. Pendiente de backend para automatización, pero **la entrega real al navegador puede validarse manualmente en DEV con Firebase Cloud Messaging sin Blaze**.

Los canales de entrega se modelan por separado del evento. Un mismo evento puede generar cero, una o varias entregas según las preferencias del socio.

## Componentes

### Dominio

`src/notifications/types.ts`

Define notificación, preferencias y resultado de entrega sin depender de Firebase.

### Contrato

`src/notifications/NotificationService.ts`

Expone operaciones para listar notificaciones, contar pendientes, marcar lectura y manejar preferencias.

### Implementación actual

`src/notifications/firestoreNotificationService.ts`

Lee notificaciones reales de Firestore, permite marcar avisos como leídos y persiste las preferencias del socio.

### Generación de eventos

Las operaciones autorizadas de socios generan la notificación canónica en el mismo batch que el evento de negocio cuando corresponde:

- al registrar un pago se puede crear `PAYMENT_POSTED`;
- al registrar una obligación vigente se puede crear `OBLIGATION_POSTED`;
- la preferencia `inApp` controla la creación del aviso in-app;
- `paymentConfirmations` permite al socio desactivar confirmaciones de pagos futuras.

Los avisos utilizan `sourceType`, `sourceId` y `deduplicationKey` para conservar su relación con el evento que los originó.

### Interfaz

`/socio/notificaciones`

Muestra avisos persistidos, estado leído/no leído y preferencias reales. Ya no usa datos mock.

## Prueba real de Web Push en DEV sin Blaze

La aplicación incluye un panel DEV para validar la entrega real de Firebase Cloud Messaging en un navegador compatible, sin Cloud Functions ni facturación.

Componentes:

- `public/firebase-messaging-sw.js`: service worker de FCM para el proyecto `ccnsa-web-dev`;
- `src/notifications/webPushDev.ts`: validación de compatibilidad, permiso, registro del service worker y obtención de token de prueba;
- `src/components/PushDevPanel.tsx`: interfaz para pegar la clave pública VAPID, activar push y copiar el token.

Procedimiento:

1. Firebase Console → Project settings → Cloud Messaging → Web Push certificates → generar un par de claves.
2. Copiar solamente la **clave pública VAPID** y pegarla en el panel DEV del portal.
3. Autorizar notificaciones del navegador y obtener el token FCM de prueba.
4. Firebase Console → Messaging → crear notificación → `Send test message` / `Enviar mensaje de prueba`.
5. Pegar el token FCM y enviar el test.
6. Con la pestaña en segundo plano, validar la notificación del sistema. Con la pestaña activa, el panel muestra el payload recibido en primer plano.

La clave VAPID utilizada por el cliente es pública. El token FCM identifica una instancia concreta del navegador y debe tratarse como dato técnico: se copia únicamente a Firebase Console para esta validación y no se publica.

Esta prueba demuestra que **el canal push funciona**, pero no conecta todavía un pago u obligación con el envío push automático. Esa automatización requiere un componente servidor confiable.

## Modelo Firestore

### `notifications/{notificationId}`

Campos:

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
- `createdByUid` para avisos generados por una operación interna autorizada

`deduplicationKey` evita generar dos veces el mismo aviso, por ejemplo `payment:<pagoId>` o `obligation:<obligacionId>`.

### `notification_preferences/{socioId}`

Campos:

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
4. Se generan entregas por canal cuando el canal existe.
5. Cada canal registra su resultado.

Esto permite cambiar de proveedor de correo o push sin alterar pagos, obligaciones ni estados de cuenta.

## Automatización pendiente

Los recordatorios periódicos, estados de cuenta mensuales automáticos y envíos confiables por correo/push requieren un proceso servidor o scheduler. No se simulan como si ya existieran. Cuando se incorpore backend deberá utilizarse un patrón outbox/worker o equivalente para evitar duplicados y mantener trazabilidad.

Mientras el proyecto permanezca en Spark, la validación de push se limita al flujo manual desde Firebase Console. No se introducen Cloud Functions ni dependencias que requieran Blaze.

## Seguridad

- Un socio solo puede leer sus notificaciones.
- Un socio puede marcar como leído únicamente sus propios avisos y no modificar título, importe, socioId ni origen.
- Las notificaciones de negocio son creadas por personal autorizado o, a futuro, por un backend confiable.
- Las preferencias pertenecen al socio autenticado.
- La bitácora de entregas no debe ser modificable por usuarios finales.
- La clave VAPID pública puede vivir en el cliente; el token FCM de prueba no debe compartirse fuera de Firebase Console.
