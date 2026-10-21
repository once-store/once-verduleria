# Lista de chequeo antes del 1/12/2026 (Caja, Finanzas y pago de compras)

> Armada por [C2] el 20/10/2026 a partir de la BITÁCORA (sin abrir el código). La ejecuta el dueño.
> Marcar cada ítem con ✅ o ❌. Si algo falla, anotar qué se vio y pasarlo a C2 (pantallas) o C1 (base).

**Antes de empezar:** ventana privada, pestañas viejas cerradas, un usuario de prueba por rol.

## Mostrador
- [ ] Abre caja: propone el fondo sugerido y deja abrir.
- [ ] Registra un gasto en efectivo: aparece en "movimientos del día".
- [ ] Hace un retiro a resguardo: baja el efectivo esperado.
- [ ] NO ve Finanzas en el menú.
- [ ] NO puede anular un movimiento.
- [ ] Cierra caja: el arqueo coincide con lo esperado.

## Encargado
- [ ] Mismas pruebas de caja que Mostrador, solo sobre SU local.
- [ ] Compras: finaliza una compra pagando en efectivo (baja de caja).
- [ ] Compras: finaliza una compra por transferencia (no toca la caja).
- [ ] Compras: finaliza una compra "A pagar" con vencimiento (queda como compromiso).
- [ ] Paga a un proveedor en efectivo y de a partes: el saldo baja bien.
- [ ] NO ve Finanzas ni puede anular movimientos.

## Dueño
- [ ] Ve Finanzas en el menú. Cuentas y movimientos muestran los datos de las pruebas anteriores.
- [ ] Pagos y vencimientos: aparece el compromiso "A pagar" de arriba.
- [ ] Hace un pago parcial: queda saldo pendiente.
- [ ] Posterga un vencimiento: cambia la fecha.
- [ ] Anula un movimiento de caja (solo el Dueño puede): se revierte el efectivo.
- [ ] Ve la caja de cada local por separado.

## Cruce de roles (seguridad, toca dinero)
- [ ] Sin login no se puede abrir Finanzas ni caja.
- [ ] Mostrador pegando la dirección de Finanzas a mano no ve datos.

## Fallos ya conocidos (no marcar como error nuevo)
- Caja no muestra ventas por transferencia y otros medios ni el historial por local (pendiente 10).
