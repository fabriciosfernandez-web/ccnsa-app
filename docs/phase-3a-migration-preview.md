# Fase 3A — Preconciliación de `Lista de miembros 2026`

## Objetivo

Construir una vista de diagnóstico **solo lectura** para comprobar que la información de la pestaña `2026` puede transformarse al modelo normalizado de CCNSA antes de escribir datos productivos en Firestore.

## Principios de seguridad

- No se escriben datos en Firestore.
- No se modifica Google Sheets.
- La aplicación solicita `https://www.googleapis.com/auth/spreadsheets.readonly` únicamente cuando un ADMIN inicia el análisis.
- No se consultan las columnas E:F de la hoja, donde existe información de acceso histórica.
- No se almacena el contenido de la planilla en GitHub.
- La rama y los fixtures del repositorio no contienen datos personales productivos.

## Rangos leídos

- `2026!A:D`: fecha de ingreso, rango, número y nombre.
- `2026!G:Z`: aporte de ingreso, membresía, meses, sumatorias, deudas y parámetros auxiliares.
- `2026!I:T`: formato de celdas mensuales para inventariar colores.

## Reglas de preclasificación

La categoría se propone de forma conservadora usando las tarifas auxiliares detectadas en la propia hoja:

- solo importes compatibles con aporte soltero -> `SOLTERO`;
- solo importes compatibles con aporte casado -> `CASADO`;
- ambas tarifas, importes atípicos o ausencia de evidencia -> `REVISAR`.

No se interpreta automáticamente ningún color como pago, mora o exoneración en esta fase. La leyenda debe validarse antes de construir el snapshot de migración.

## Controles mostrados

1. cantidad de socios detectados;
2. propuesta SOLTERO/CASADO/REVISAR;
3. suma de importes mensuales;
4. comparación meses vs. `Sumatoria Anual`;
5. deuda 2026 y deuda 2025;
6. tarifas base detectadas;
7. inventario de colores, separando celdas con valor y vacías;
8. observaciones por socio.

## No objetivos de 3A

- crear usuarios de Authentication;
- crear documentos `socios`;
- migrar obligaciones o pagos;
- interpretar de forma irreversible el color de una celda;
- reemplazar o modificar la planilla productiva.

## Paso siguiente

Fase 3B construirá un snapshot normalizado y una conciliación determinística. Solo tras aprobar sus totales y excepciones se habilitará una importación explícita a Firestore.
