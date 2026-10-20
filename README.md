# once · verdulería

PWA de autoservicio para la verdulería dentro del minimarket "once" (barrio Alunai, La Rioja). Apertura prevista: 1/12/2026.

> **Estado, pendientes y reglas de trabajo: ver [ESTADO.md](ESTADO.md)** (es la fuente de verdad y se actualiza seguido). Este README describe cómo está armado el sistema.
> **Repo público: nunca subir claves, tokens ni datos de clientes.**

## Cómo funciona

### Cliente (`index.html` / `app.js`)

- **Catálogo**: lee la vista `catalogo_disponible` de Supabase, que muestra cada producto con el precio del **lote más urgente que esté en salón**. Si un producto no tiene ningún lote activo en salón, no aparece: el stock y el precio viven en `lotes`, no en `productos`.
- **Presentaciones**: un producto puede comprarse de una forma y venderse de varias (ej. huevo: se compra por cajón y se vende por unidad, media docena, docena, maple o cajón). El catálogo muestra una tarjeta por presentación; el stock del lote siempre se guarda en la unidad base.
- **Oferta por volumen**: si un lote tiene descuento activo (`precio` por debajo de `precio_original`), el catálogo muestra el precio original + una cinta "-XX%" + "Llevando 2kg: $X". El cobro real cambia según el peso: **menos de 2kg se cobra al precio original, 2kg o más al precio con descuento** (constante `UMBRAL_KG_OFERTA` en `app.js`, hoy 2kg para todos los productos).
- **Carrito** en memoria (se pierde si recargás la página; es lo esperado en esta etapa).
- **Checkout**: al pagar, `app.js` llama a la función de base `checkout_pedido`. El navegador solo manda **qué** pidió (lote o presentación + cantidad); **la base calcula** precios, promociones, stock y total (redondeado a múltiplos de $50). Es repetible sin duplicar ítems ni descontar stock dos veces.
- **Métodos de pago**:
  - **Efectivo, transferencia y pago combinado** (parte efectivo + parte transferencia): el pedido queda en estado `pendiente_*` hasta que alguien lo confirma a mano en el panel.
  - **Mercado Pago** (Checkout Pro): la Edge Function `crear-preferencia-pago` recibe solo el `pedidoId`, toma el importe de la base y le suma el recargo guardado en `configuracion.recargo_mp_porcentaje`. La Edge Function `mp-webhook` marca el pedido como `pagado` solo si Mercado Pago confirma el pago y el importe coincide. Páginas de retorno: `pago-exitoso.html`, `pago-pendiente.html`, `pago-fallido.html`.
- **Ticket** (`ticket.html`): comprobante informal, sin validez fiscal. Se abre solo con el id exacto del pedido.
- Instalable como app (manifest + service worker). El service worker está **desactivado a propósito** (`SERVICE_WORKER_ACTIVO = false` en `app.js`) mientras se itera seguido; las páginas desregistran cualquier service worker viejo que encuentren.

### Panel del personal (con login)

`admin-v2.html` (con `admin.js`) es el panel principal: pedidos pendientes de confirmar (se refresca cada 5 s), resumen del día y accesos al resto. `admin.html` es la versión vieja, pendiente de borrar.

Pantallas:

- `caja.html`: caja por local. Apertura con fondo sugerido, gastos, retiro a resguardo, movimientos del día (la anulación es solo del Dueño), pago a proveedores en efectivo (también de a partes) y cierre.
- `armado.html`: pedidos por armar (WhatsApp/online); se carga el peso real de cada ítem.
- `compras.html`: compras (cada compra crea un **lote** y sus cajones), mermas, depósito, maduración y precio por lote. Al finalizar una compra hay un panel de pago: efectivo, transferencia o "A pagar" con vencimiento.
- `cajon.html`: ficha de un cajón físico (la que abre el QR).
- `clientes.html`: clientes y cuenta corriente (fiado). Solo uso interno, invisible en el catálogo.
- `promociones.html`: promociones de marketing (ver `ESTADO.md` sobre combos: todavía no activar).
- `horario.html`: horario del local.
- `metricas.html`: meta del día, resultado, margen real, gastos fijos.
- `finanzas.html` (solo Dueño): cuentas, movimientos, pagos y vencimientos de compras, con pagos parciales y postergación de vencimientos.
- `conversaciones.html`: registro de las conversaciones del bot de WhatsApp.
- **Alertas**: campanita en el panel. Reglas calculadas en la base: stock crítico, margen negativo, merma alta, producto sin ventas, piso de venta diaria, jornada sin ventas y clima de zonas productoras.

**Roles**: Dueño, Encargado, Mostrador y Vendedor. `sesion.js` lee el rol y el local del usuario y esconde lo que no corresponde, pero el control real está en la base (RLS y chequeos de rol dentro de las funciones).

### Bot de WhatsApp

Vive **fuera de este repo** (carpeta aparte en la PC del dueño; usa whatsapp-web.js y un modelo de IA en la nube). Toma pedidos, los deja en armado y pregunta el método de pago al cliente. Está pendiente armar un repo propio para su código, con `.gitignore` (nunca subir `.env` ni `.wwebjs_auth`).

## Maduración: cómo funciona la memoria de etapas

Cada producto puede tener un `perfil_maduracion` (A, B, C, D, E1, E2; ver tabla `reglas_maduracion`), que define, según los días transcurridos desde que entró el lote, qué % de descuento sugerir o si conviene retirarlo. Detalles importantes:

- El % de descuento de cada etapa es siempre **contra el precio original del lote** (`precio_original`), nunca contra el precio actual, así no se pisan descuentos unos sobre otros.
- Cada lote guarda `etapa_madurez_confirmada`: la última etapa para la que el admin ya definió un precio. La sugerencia **no vuelve a aparecer** para una etapa ya confirmada, aunque el precio puesto no coincida con el sugerido; solo vuelve cuando el lote avanza a una etapa posterior.
- Guardar un precio desde la pestaña Maduración o Precio actualiza esta memoria (vía `confirmar_precio_maduracion`). Un update directo a la tabla `lotes` en Supabase no la actualiza: tenerlo en cuenta si se edita un lote a mano.
- `avance_madurez_pct` de cada lote (0 / 50 / 90, según el botón elegido al cargar la compra) adelanta el reloj: un lote que entra "para vender ya" llega antes a sus etapas de descuento que uno que entra "recién llega".
- La etapa "retirar" nunca actúa sola: muestra un cartel y el admin registra la merma a mano.

## Base de datos (Supabase, proyecto "once")

- **Tablas principales**: `productos`, `presentaciones`, `lotes`, `cajones`, `compras`, `proveedores`, `mermas`, `pedidos`, `pedido_items`, `clientes`, `cuenta_corriente_movimientos`, `promociones`, `reglas_maduracion`, `alertas`, `configuracion`, `horario_local`, `locales`, `usuarios_perfil`, `caja_turnos`, `cuentas`, `movimientos_financieros`, `compromisos_pago`.
- **Vistas**: `catalogo_disponible` (pública), `lotes_venta` (sin costos), `sugerencias_maduracion`, `clientes_saldo`, `vista_margen_productos`.
- **Funciones clave**: `checkout_pedido` (la usa `app.js`), `confirmar_metodo_pago` (versión vieja del flujo: se va a cerrar su acceso público, ver `ESTADO.md`), `cancelar_pedido`, `registrar_compra`, `registrar_merma`, `confirmar_precio_maduracion`, `obtener_ticket`.
- `productos.stock` quedó vestigial de una versión anterior: no lo actualiza nada, ignorarlo.
- **Seguridad**: las tablas tienen RLS por rol y las funciones sensibles chequean el rol adentro. Los hallazgos y arreglos de seguridad no se documentan en este repo por ser público.

## Cómo probarla ahora mismo, sin instalar nada

Es HTML/CSS/JS puro, sin build.

```bash
cd once-verduleria
python3 -m http.server 8000
```

Y entrar a `http://localhost:8000` desde el navegador. Cuidado: el navegador guarda el `app.js` viejo; probar en ventana privada.

## Qué falta

Las prioridades vivas (pruebas de Mercado Pago, seguridad, recargo, etc.) están en [ESTADO.md](ESTADO.md). Ideas y trabajo a futuro:

- [ ] **Precio por local**: cada local debe poder tener su propio precio (zonas y estratos distintos, gastos fijos distintos), aunque a futuro pueda existir también un precio general.
- [ ] **Pantalla de Inventario** (stock por local y por ubicación salón/depósito): no está en el repo todavía.
- [ ] **Delivery**: diseño en curso; apagado hasta que el dueño decida abrirlo.
- [ ] **Combos entre productos distintos** (ej. "2kg banana + 2kg naranja = $X"): la base no los calcula todavía; no activar ninguno hasta resolverlo.
- [ ] **Balanza conectada** (Web Serial API) para productos por peso. Diseño acordado, pendiente de hardware real:
  - Cada puesto = una PC/tablet con su balanza enchufada (Web Serial solo lee el puerto físico de esa misma máquina).
  - Cada balanza tiene un QR fijo ("Balanza 1", "Balanza 2"...). El cliente, con la PWA abierta, escanea el de una balanza y su celular "escucha" el peso que esa balanza publica.
  - La misma PC de cada puesto sirve como terminal de compra directa para quien prefiera no usar su teléfono.
  - Cada balanza tiene un solo modo activo por vez: "compartida" (publica para celulares, default) o "compra directa". Quien escanee el QR con la balanza en uso ve un aviso de "en uso", no un peso.
  - El protocolo para leer cada balanza depende de la marca: no se puede definir sin tenerla en mano.
- [ ] Umbral de kg de la oferta por volumen editable por producto (hoy fijo en `UMBRAL_KG_OFERTA = 2` dentro de `app.js`).
- [ ] Perfil B de maduración (lechuga, acelga): pasa directo de precio normal a "retirar", sin etapa de remate intermedia. Evaluar si conviene agregarla.
- [ ] Íconos de `icons/`: son placeholder (sirven de base, no son un logo final).
- [ ] Facturación electrónica (AFIP/ARCA): hay un gancho preparado (`pedidos.requiere_factura`), sin ninguna integración real.
- [ ] Repo propio para el bot de WhatsApp.

## Credenciales

- `app.js`, `admin.js`, `compras.js` y el resto de las pantallas llevan el Project URL y la **anon key** de Supabase: son públicas por diseño.
- La `service_role key`, el token de Mercado Pago (`MP_ACCESS_TOKEN`) y cualquier otra clave secreta **no están en este repo**: viven como secretos de Supabase (Edge Functions) o en el `.env` local del bot. Nunca subirlas ni pegarlas en chats.
