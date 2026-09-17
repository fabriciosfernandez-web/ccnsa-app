# CCNSA App

Aplicación web de gestión institucional para el Centro Cultural CCNSA.

## Estado actual

El proyecto se encuentra en desarrollo sobre Firebase DEV. La planilla `Lista de miembros 2026` continúa siendo la fuente productiva hasta completar validación funcional, seguridad, pruebas end-to-end y migración controlada.

### Módulos disponibles en DEV

- Gestión de socios, obligaciones, pagos y aplicaciones.
- Tarifas, generación y reglas especiales de cobro.
- Finanzas: ingresos, egresos, balance y exportación.
- Actividades con subcontabilidad vinculada al libro financiero.
- Auditoría centralizada.
- Portal del socio y estado de cuenta PDF institucional.
- Notificaciones in-app persistidas en Firestore para pagos y nuevas obligaciones.
- Herramientas de preflight y migración 2026, todavía sin ejecución productiva.

## Estructura organizacional y permisos

CCNSA se organiza institucionalmente por comités. La aplicación separa esa estructura de los permisos técnicos:

- `TESORERIA` se mantiene como rol técnico por compatibilidad, pero se presenta al usuario como **Comité de Finanzas**.
- `users/{uid}` puede incluir `comites` para expresar pertenencia organizacional.
- `ADMIN`, `CONSULTA` y `SOCIO` continúan siendo perfiles técnicos de autorización.
- Firestore Security Rules siguen siendo la fuente de verdad para accesos y escrituras.

Esta separación permite incorporar otros comités sin convertir cada comité en un rol rígido del sistema.

## Notificaciones

El centro `/socio/notificaciones` ya utiliza Firestore:

- un pago registrado por personal autorizado puede generar `PAYMENT_POSTED`;
- una nueva obligación vigente puede generar `OBLIGATION_POSTED`;
- el socio puede marcar sus avisos como leídos y guardar preferencias;
- correo y push permanecen deshabilitados hasta contar con un backend/proveedor confiable;
- recordatorios periódicos y estados de cuenta programados requieren scheduler/backend y no se simulan en el cliente.

Ver `docs/notifications.md` para el diseño completo.

## Entornos

- DEV: `ccnsa-web-dev`
- PROD: reservado como `ccnsa-web-prod`; todavía no debe utilizarse hasta cerrar DEV.

El proyecto mantiene separación explícita de configuración para evitar cruces accidentales entre entornos. Ver `docs/environments.md`.

## Migración 2026

La migración desde Google Sheets se trabaja con snapshot y preflight determinísticos. La planilla productiva permanece en modo lectura desde esta aplicación durante el desarrollo. No ejecutar la migración real hasta completar la validación funcional y de seguridad.

## Desarrollo local

```bash
npm install
npm run dev
```

Build de verificación:

```bash
npm run build
```

Las variables Firebase están documentadas en `.env.example`.
