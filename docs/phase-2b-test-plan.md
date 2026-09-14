# Fase 2B — Plan de pruebas

## Objetivo
Validar tarifas mensuales por categoría y generación controlada de obligaciones sin incorporar todavía datos productivos.

## Precondiciones
- Usar únicamente socios ficticios.
- Tener al menos un socio ACTIVO de categoría SOLTERO y uno CASADO.
- Desplegar las reglas de Firestore del PR antes de probar la escritura de `tarifas_cuotas`.

## Casos

### 1. Crear tarifa por categoría
1. Ingresar como ADMIN.
2. Crear una tarifa ficticia SOLTERO vigente desde el período actual.
3. Crear otra tarifa ficticia CASADO con un importe diferente.
4. Verificar que ambas aparezcan como ACTIVA.

Resultado esperado: las tarifas quedan registradas sin crear todavía obligaciones.

### 2. Generación mensual
1. Elegir el período actual.
2. Ejecutar **Generar cuotas del período**.
3. Abrir `Socios y cuotas`.

Resultado esperado: cada socio ACTIVO recibe solamente la obligación correspondiente a su categoría.

### 3. Idempotencia
1. Volver a ejecutar la generación para el mismo período sin cambiar las tarifas.

Resultado esperado: no se crean duplicados; el resultado informa obligaciones omitidas por existir previamente.

### 4. Saldo a favor
1. Registrar un pago anticipado en un socio ficticio y dejar saldo disponible.
2. Generar la cuota del período siguiente.

Resultado esperado: la nueva obligación consume automáticamente el saldo a favor y muestra el importe aplicado.

### 5. Vigencia
1. Crear una tarifa cuya `vigenciaDesde` sea un período futuro.
2. Generar un período anterior a su vigencia.

Resultado esperado: esa tarifa no genera obligaciones.

### 6. Desactivación
1. Desactivar una tarifa como ADMIN.
2. Generar un período en el que hubiera sido aplicable.

Resultado esperado: la tarifa desactivada no genera obligaciones.

### 7. Roles
- ADMIN: puede crear/desactivar tarifas y generar cuotas.
- TESORERIA: puede leer tarifas y generar cuotas, pero no modificarlas.
- CONSULTA: solo lectura; no puede generar ni modificar.
- SOCIO: no tiene acceso al módulo interno de tarifas.

## Nota de arquitectura
En Spark la generación no se ejecuta como cron de servidor. Esta fase usa una ejecución iniciada por ADMIN/TESORERIA, idempotente a nivel funcional mediante `socioId + tarifaId + periodo`. Una automatización horaria/mensual de servidor se evaluará cuando exista backend transaccional y un plan que soporte esa infraestructura.
