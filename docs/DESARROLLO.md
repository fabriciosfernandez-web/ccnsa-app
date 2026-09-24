# Desarrollo y metodología — CCNSA

## Enfoque
El proyecto utiliza un **DevSecOps liviano**, equivalente a un Secure SDLC práctico: desarrollo incremental, seguridad integrada, pruebas en DEV y promoción controlada a PROD.

## Flujo de trabajo
1. Cambios pequeños y trazables.
2. Commit en rama de trabajo y PR.
3. Build y pruebas automáticas.
4. Deploy a Firebase DEV.
5. Prueba funcional por rol.
6. Revisión de permisos, auditoría e integridad.
7. Corrección y nueva validación.
8. Preflight antes de PROD.

## Principios de seguridad
- mínimo privilegio por rol;
- separación DEV/PROD;
- registros de auditoría inmutables;
- operaciones sensibles con actor identificado;
- sin borrado directo de evidencia financiera;
- Cloud Functions para acciones que no deben confiarse al cliente;
- no registrar contraseñas, tokens ni secretos.

## Componentes principales
Frontend React/TypeScript, Firebase Authentication, Cloud Firestore, Cloud Functions, Firebase Hosting y Firebase Cloud Messaging.

## Criterio de cierre de un módulo
Un módulo se considera listo para PROD cuando compila, despliega, respeta permisos, deja trazabilidad suficiente y supera una prueba funcional representativa.

## Documentación
Actualizar este archivo cuando cambie la arquitectura, metodología o controles; actualizar `MANUAL_USUARIO.md` cuando cambie el comportamiento visible para usuarios.
