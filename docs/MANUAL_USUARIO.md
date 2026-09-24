# Manual de usuario — CCNSA

## 1. Acceso
Ingresá con la cuenta habilitada por CCNSA. El sistema muestra las funciones según el rol asignado.

## 2. Roles
- **SOCIO:** inicio, estado de cuenta, actividades, notificaciones y perfil.
- **TESORERIA:** socios y cuotas, finanzas, actividades, generación de cargos y auditoría operativa/financiera.
- **CONSULTA:** acceso de solo lectura para control.
- **ADMIN:** acceso completo, incluyendo usuarios, configuración, auditoría completa y herramientas DEV.

## 3. Operaciones principales
### Socios y cuotas
Consultar socios, obligaciones, pagos y saldos. ADMIN puede crear socios. ADMIN y TESORERIA pueden registrar pagos/obligaciones y conciliar saldos.

### Finanzas
Registrar ingresos/egresos manuales, consultar movimientos y anular movimientos mediante corrección auditable cuando corresponda.

### Actividades
Crear y administrar actividades, cupos, inscripciones, asistencia y movimientos vinculados a Finanzas.

### Tarifas y reglas
ADMIN configura tarifas, reglas y excepciones. ADMIN/TESORERIA pueden ejecutar las generaciones habilitadas.

### Auditoría
ADMIN y CONSULTA ven la pista completa. TESORERIA ve eventos financieros/operativos y sus propios accesos.

### Portal del socio
El socio puede consultar su cuenta, actividades, notificaciones y datos de perfil. Los datos institucionales no se editan desde el portal.

## 4. Buenas prácticas
No borrar ni alterar registros financieros por fuera de los flujos previstos. Usar las funciones de corrección/anulación auditables y trabajar en DEV antes de promover cambios a PROD.
