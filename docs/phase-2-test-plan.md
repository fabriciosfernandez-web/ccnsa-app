# Plan de prueba — Fase 2 financiera

Usar exclusivamente datos ficticios en `CCNSA Web Dev`.

## Casos mínimos

1. **Pago exacto**
   - Crear obligación por Gs. 37.000.
   - Registrar pago por Gs. 37.000.
   - Resultado esperado: obligación `PAGADA`, pendiente Gs. 0, saldo a favor Gs. 0.

2. **Pago parcial**
   - Crear obligación por Gs. 37.000.
   - Registrar pago por Gs. 20.000.
   - Resultado esperado: obligación `PARCIAL`, aplicado Gs. 20.000, pendiente Gs. 17.000.

3. **Un pago cubre varias obligaciones**
   - Crear dos obligaciones de Gs. 37.000.
   - Registrar pago por Gs. 60.000.
   - Resultado esperado: la obligación más antigua queda pagada y la siguiente parcial por Gs. 23.000.

4. **Anticipo / saldo a favor**
   - Con deuda pendiente Gs. 17.000, registrar pago por Gs. 50.000.
   - Resultado esperado: deuda en cero y saldo a favor Gs. 33.000.

5. **Nueva obligación consume saldo a favor**
   - Con saldo a favor Gs. 33.000, crear obligación nueva por Gs. 37.000.
   - Resultado esperado: se aplican Gs. 33.000 automáticamente y quedan Gs. 4.000 pendientes.

6. **Aislamiento SOCIO**
   - Ingresar con usuario SOCIO vinculado.
   - Confirmar que solo lee sus obligaciones, pagos y aplicaciones.
   - Confirmar que no puede acceder a rutas administrativas.

7. **Conciliación de registros previos**
   - Usar un socio con una obligación histórica de Gs. 37.000 y un pago histórico de Gs. 37.000 sin aplicaciones.
   - Confirmar que el panel ADMIN muestra la opción `Conciliar registros previos`.
   - Ejecutar la conciliación.
   - Resultado esperado: se crea una aplicación por Gs. 37.000, la obligación queda `PAGADA`, el pago queda sin saldo disponible y el saldo neto es Gs. 0.
   - Confirmar que el Portal del Socio muestra `Al día` cuando el saldo neto es cero.

## Criterio para merge

- GitHub Actions compila sin errores.
- Los siete casos se ejecutan correctamente.
- Firestore Rules de la rama se despliegan al proyecto de desarrollo antes de las pruebas funcionales.
- No se cargan datos reales ni se migra la planilla productiva en esta fase.
