# CCNSA App

Sistema web de gestión de socios, cuotas, pagos, finanzas y actividades del CCNSA.

## Estado del proyecto

La rama `feature/firebase-bootstrap` contiene la **Fase 1: base técnica**. En esta etapa no se utilizan datos personales ni financieros productivos y no se modifica la planilla institucional existente.

Incluye:

- React + Vite + TypeScript.
- Firebase Authentication preparado para correo/contraseña.
- Firestore como base operativa prevista.
- Roles `SOCIO`, `TESORERIA`, `ADMIN` y `CONSULTA`.
- Rutas protegidas y separación inicial entre portal del socio y panel interno.
- Reglas de Firestore con criterio de mínimo privilegio y denegación por defecto.
- Configuración para Firebase Hosting.
- Modelo de datos inicial documentado en `docs/data-model.md`.
- Configuración de Firebase mediante variables de entorno; no hay secretos ni credenciales reales en Git.

## Requisitos

- Node.js compatible con la versión de Vite declarada en `package.json`.
- Un proyecto Firebase de desarrollo.
- Authentication con proveedor Email/Password habilitado.
- Cloud Firestore creado en modo producción.

## Instalación local

```bash
npm install
cp .env.example .env.local
npm run dev
```

En Windows PowerShell podés reemplazar el segundo comando por:

```powershell
Copy-Item .env.example .env.local
```

Luego completá `.env.local` con el `firebaseConfig` de la aplicación web del proyecto Firebase. La configuración web de Firebase identifica el proyecto cliente; no debe confundirse con una clave privada de cuenta de servicio. **Nunca subas cuentas de servicio, claves privadas o tokens al repositorio.**

## Verificaciones

```bash
npm run typecheck
npm run build
```

## Modelo inicial de autorización

Cada usuario autenticado debe tener un documento `users/{uid}` en Firestore con una estructura similar a:

```json
{
  "displayName": "Usuario de prueba",
  "role": "SOCIO",
  "socioId": "SOCIO-TEST-001",
  "active": true
}
```

Para usuarios internos, `role` puede ser `TESORERIA`, `ADMIN` o `CONSULTA`; `socioId` no es necesario.

Los perfiles y roles deben ser creados o modificados únicamente por administración. Un usuario no puede asignarse privilegios a sí mismo mediante las reglas incluidas.

## Estructura

```text
src/
├── auth/          # sesión, perfil y autorización por roles
├── layouts/       # estructura visual autenticada
├── lib/           # inicialización de Firebase
├── pages/         # login y dashboards iniciales
├── App.tsx        # rutas
└── main.tsx       # entrada React

docs/
└── data-model.md

firestore.rules
firestore.indexes.json
firebase.json
```

## Criterios de diseño

- Firestore será la fuente operativa de verdad; Google Sheets quedará como soporte de migración, conciliación, reportes o exportaciones.
- Obligaciones y pagos se modelan por separado para poder representar deuda, exenciones, pagos parciales y anticipos sin ambigüedad.
- Las colecciones financieras no se exponen directamente a un socio salvo los registros vinculados a su propio `socioId`.
- `CONSULTA` es un rol de solo lectura.
- La bitácora `audit_log` es append-only desde las reglas. En una futura arquitectura con backend confiable podrá reforzarse para que el log no dependa del cliente.
- La primera versión evita Cloud Functions y Firebase Storage para mantener compatibilidad con una arquitectura inicial orientada al plan Spark.

## Próximos hitos

1. Ejecutar instalación, typecheck y build en un entorno de desarrollo.
2. Vincular el proyecto Firebase `CCNSA App Dev` mediante `.env.local`.
3. Crear usuarios ficticios para cada rol y probar aislamiento de acceso.
4. Implementar CRUD de socios, obligaciones y pagos.
5. Diseñar aplicación de pagos a obligaciones y cálculo de saldo.
6. Preparar migración controlada de `Lista de miembros 2026`, con conciliación antes de cualquier carga productiva.
