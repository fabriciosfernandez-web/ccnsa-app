# Fase 2C — Plan de pruebas

## Objetivo
Validar conceptos no mensuales, excepciones individuales y cambios de categoría con vigencia sin utilizar datos productivos.

## Preparación
- Usar únicamente socios ficticios del entorno DEV.
- Mantener el PR en Draft hasta completar las pruebas.
- Desplegar `firestore.rules` de esta rama antes de probar las nuevas colecciones.

## Casos

### 1. Regla anual
1. Crear una regla `Membresía prueba`, tipo `ANUAL`, categoría `TODOS`, importe ficticio.
2. Generar el año actual.
3. Verificar una obligación por socio activo.
4. Repetir la generación.
5. Esperado: cero duplicados y mensaje de obligaciones omitidas.

### 2. Aporte de ingreso
1. Crear una regla `Ingreso prueba`, tipo `INGRESO`.
2. Generar el aporte para un socio ficticio.
3. Repetir el proceso.
4. Esperado: una sola obligación para la combinación socio + regla.

### 3. Exoneración mensual
1. Registrar excepción `EXENTO`, ámbito `MENSUAL`, para un socio y un período futuro.
2. Generar las cuotas mensuales de ese período.
3. Esperado: obligación creada con estado `EXENTA`, saldo pendiente cero y sin consumir saldo a favor.

### 4. Importe fijo mensual
1. Registrar excepción `IMPORTE_FIJO`, ámbito `MENSUAL`, con un importe menor a la tarifa general.
2. Generar el período.
3. Esperado: obligación por el importe especial y trazabilidad mediante `excepcionId`.

### 5. Excepción anual
1. Registrar una excepción `EXENTO` o `IMPORTE_FIJO`, ámbito `ANUAL`.
2. Generar anualidad.
3. Esperado: la obligación respeta la excepción.

### 6. Cambio de categoría
1. Seleccionar un socio `SOLTERO` y registrar cambio a `CASADO` con vigencia en un período futuro.
2. Generar un período anterior a la vigencia: debe usar la tarifa de `SOLTERO`.
3. Generar el período de vigencia o uno posterior: debe usar la tarifa de `CASADO`.
4. Verificar documento en `categoria_historial` y evento en `audit_log`.

### 7. Seguridad por rol
- ADMIN: configura reglas, excepciones y cambios de categoría; también genera cargos.
- TESORERIA: puede generar cargos especiales, pero no modificar configuración.
- CONSULTA: solo lectura.
- SOCIO: no puede acceder a las colecciones de configuración ni al panel administrativo.

## Criterio de aprobación
La Fase 2C se aprueba si todos los casos anteriores funcionan sin duplicados, sin exposición cruzada de datos y manteniendo auditabilidad de cada cambio.