# ESTADO DEL PROYECTO "once" (verdulería autoservicio)

> **Para cualquier IA (Claude, GPT) o persona:** este archivo es la fuente de verdad.
> Leelo ENTERO antes de hacer nada, trabajá desde "PRÓXIMO PASO" y, al terminar,
> actualizá "ESTADO", "PENDIENTE" y "BITÁCORA". Última actualización: 21/10/2026 [C2, sobre la versión de C1].
> **Repo público: nunca escribir acá claves, tokens, ni datos de clientes.**

---

## 1. REGLAS DE TRABAJO (valen para todas las cuentas)

**Con el dueño (Martin, no es desarrollador):**
- Entregar archivos COMPLETOS para reemplazar con Ctrl+A (nunca fragmentos).
- Explicar en lenguaje simple QUÉ cambia y POR QUÉ, antes de aplicar.
- Directo, sin disculpas, sin condescendencia. No suponer: mirar logs/datos reales.
- Sube los cambios editando en la web de GitHub (no usa git en la PC). No subir ni aplicar nada sin su OK.
- 🔔 **Recordatorios:** al empezar cada chat, recordarle al dueño los pendientes marcados con 🔔 en la sección 4. Él lo pidió expresamente.

**MODO ECONÓMICO (el dueño llega al límite de uso cada ~4 h; hay 3 cuentas trabajando casi a la vez):**
- Leer SOLO este archivo al empezar. No releer ni re-verificar lo marcado ✅.
- Hacer solo lo pedido. Nada de auditorías ni investigaciones extra sin preguntar antes.
- Verificar a fondo SOLO si toca dinero, seguridad o la base de datos. Lo demás: un chequeo corto.
- Un chat nuevo por tarea, empezando con el texto de "ARRANQUE" (sección 9). Los chats larguísimos gastan más límite.
- Respuestas cortas. No narrar cada paso ("voy a revisar…"): hacerlo y dar el resultado.
- **Antes de editar este archivo, leer SIEMPRE la versión actual del repo** (la dirección de raw de la sección 9), nunca una copia vieja pegada en un chat. Si el dueño te pasa una versión y la del repo es más nueva, fusioná las dos conservando lo de las otras cuentas. Al entregar el archivo, avisar qué líneas agregaste.
- Antes de trabajar, mirar EN CURSO y la BITÁCORA: si otra cuenta reservó o tocó lo mismo hace poco, avisar al dueño. Después, anotar la propia reserva en EN CURSO.

**Técnicas:**
- Cambios en la base: probarlos primero en una transacción que se deshace sola, después aplicar.
- Las pruebas de pantallas deben comprobar lo que SE VE (estilos reales), no solo clases o etiquetas.
- El navegador guarda el `app.js` viejo: probar en ventana privada y con las pestañas viejas cerradas.
- Para saber qué código usó el navegador: los logs de la API muestran `rpc/checkout_pedido` (nuevo) o `rpc/confirmar_metodo_pago` (viejo).

---

## 2. DATOS FIJOS

- **Tienda:** https://once-store.github.io/once-verduleria/ (GitHub Pages, rama `master`, sin build)
- **Repo:** https://github.com/once-store/once-verduleria (público)
- **Supabase:** proyecto "once", id `meekevxxjirvgsuppvij`
- **Edge Functions:** `crear-preferencia-pago` (v6) y `mp-webhook` (v1, sin verificación JWT A PROPÓSITO: Mercado Pago no puede mandarla; la seguridad es consultar el pago a MP con el token)
- **Mercado Pago:** app "once", credenciales de PRODUCCIÓN activas. El token está en el secreto `MP_ACCESS_TOKEN` de Supabase. Nunca en el repo ni en chats. El dueño cambió la acreditación de la plata a **"al instante"** (20/10); antes era a ~18 días.
- **Páginas públicas (sin login):** `index.html`, `ticket.html`, `pago-exitoso.html`, `pago-pendiente.html`, `pago-fallido.html`
- **Panel del personal (con login):** `admin-v2.html` (usa `admin.js`, refresca "Pendientes" cada 5 s), caja, armado, compras, finanzas, clientes, promociones, horario, métricas, conversaciones
- **Apertura prevista del negocio: 1/12/2026**
- **Reglas de negocio:** recargo de MP en la tabla `configuracion` (`recargo_mp_porcentaje` = 5; en revisión, ver pendiente 5). El total del pedido se redondea a múltiplos de $50. Al confirmar, el panel abre el ticket en pestaña nueva (diseño actual, no es un error).
- **Estados de pedido:** `pendiente_pago`, `pendiente_mp`, `pendiente_efectivo`, `pendiente_transferencia`, `pendiente_combinado`, `pagado`, `cancelado`
- **README.md** actualizado el 20/10: describe cómo está armado el sistema. Las prioridades viven acá.

---

## 3. ESTADO ACTUAL

### ✅ Hecho y verificado
- **Checkout atómico** (función `checkout_pedido` en la base). El navegador solo manda QUÉ pidió (lote o presentación + cantidad); la base calcula precios, promos, stock y total. Es repetible sin duplicar ítems ni stock. *Aplicado 17/10.*
- **`app.js` usa `checkout_pedido`** y está en producción. Verificado 18/10 con el pedido #93 (efectivo): 1 solo ítem, stock descontado una vez, botones "Ver ticket" y "Hacer otro pedido" funcionando.
- **Edge Function de pago v6:** recibe SOLO el `pedidoId`; el importe sale de la base + recargo; guarda el importe exacto en `pedidos.mp_monto_cobrado`; manda una sola línea "Pedido #N - once" a MP.
- **Mercado Pago en producción:** token de producción cargado. Verificado con compra real (#88, $315 = $300 + 5%, aprobada).
- **`pago-exitoso.html` nueva:** consulta el estado del pedido; cuando está `pagado` muestra "¡Pago confirmado!" con botón "Ver mi ticket" (el botón está oculto hasta entonces). Publicada.
- **Vistas internas cerradas al público [C1, 20/10]:** `clientes_saldo`, `lotes_legible`, `lotes_venta` y `sugerencias_maduracion` ya no son legibles sin login (antes mostraban DNI/WhatsApp/saldos de clientes y costos de lotes). La tienda sigue leyendo `catalogo_disponible`; el personal con login conserva la lectura. Migración `cerrar_lectura_publica_vistas_internas`, verificada tras aplicar.
- **Funciones de "Números" solo para el Dueño [C1, 20/10]:** `obtener_gastos_fijos`, `obtener_resultado_bruto_hoy`, `obtener_margen_por_categoria` y `obtener_meta_venta_hoy` rechazan a Encargado, Mostrador y Vendedor en la base (antes solo lo impedía la pantalla). Migración `solo_dueno_funciones_numeros`, probada por rol antes y verificada después.
- **Bot de WhatsApp probado de punta a punta [C1, 21/10]:** pedido #94 (2 productos por peso, `/armado`, pago por transferencia) creado, armado y registrado; los logs muestran todas las llamadas del bot respondiendo bien. El bot usa ahora la clave de servicio para carritos guardados y pedidos pendientes; `obtener_pedidos_whatsapp_pendientes` quedó **cerrada al público** (migración `cerrar_pedidos_whatsapp_pendientes_a_anon`). El código del bot vive fuera del repo, en `~/Descargas/once-bot-whatsapp` de la compu del dueño.
- **Webhook `mp-webhook` desplegado:** marca el pedido `pagado` solo si MP confirma pago aprobado, el pedido está en `pendiente_mp` y el importe coincide con `mp_monto_cobrado`. Guarda el N.º de operación en `pedidos.mp_payment_id`.

### 🟡 Hecho pero SIN probar con datos reales (el dueño lo hará "en unos días")
- El **webhook** con un pago real de MP (probado solo con simulaciones, 32 casos OK). No se sabe si MP acepta la `notification_url` ni el formato exacto del aviso.
- `pago-exitoso` con un pago real de MP.
- Flujos de **transferencia** y **pago combinado** con el `app.js` nuevo.
- **Reintento de MP** tras un link fallido (probado solo con simulación).
- **Caja, Finanzas y pago de compras [C2, 13–17/10]:** hechas y aplicadas (pantallas + base), sin probar de punta a punta con cada rol (Dueño, Encargado, Mostrador). Detalle en la BITÁCORA. Lista de chequeo armada: `docs/lista-chequeo-1-12.md`.

---


### Rediseño de apariencia (actualizado 20/10/2026)

- **Panel (`admin-v2.html`)**: rediseño visual aprobado y publicado; `admin.js` quedó intacto.
- **Compras y mermas — Compra**: el rediseño del formulario, incluido el detalle de bultos y tara, ya fue revisado por Claude y subido. Esta es la versión que está funcionando; no queda pendiente reemplazarla.
- **Números (`metricas.html`)**: boceto aceptado como dirección visual: tres tarjetas (meta diaria, semanal y mensual) con gráficos de líneas y referencias comunes de niveles. Falta revisión de Claude e implementación.
- **Pedidos por armar, Clientes, Conversaciones y Promociones**: bocetos aceptados como referencia visual. Falta revisar cada uno con Claude contra el código y los datos reales antes de implementar o publicar.
- **Compras y mermas — Merma, Depósito, Maduración y Precio**: la página actual funciona bien. También hay bocetos visuales aceptados para estas pestañas; Precio se planteó por lote y Maduración incluye un aviso cuando un lote requiere atención. Queda la línea de revisión con Claude para escuchar sus observaciones y dejar confirmado el estado de cada propuesta. Depósito y Maduración tenían pocos o ningún dato de ejemplo para evaluar el boceto.
- **Inventario (`inventario.html`/`inventario.js`)**: página nueva y diseño aceptados como propuesta. Debe permitir revisar existencias en detalle y de un vistazo, incluyendo el margen porcentual junto al precio. Falta revisión de Claude antes de subirla; luego habrá que propagar el enlace de Inventario en las copias del sidebar. **Nota [C2]:** el enlace podría propagarse desde `sesion.js` (que ya agrega el link Finanzas al menú del Dueño) en vez de editar cada copia del sidebar a mano; verificar si alcanza antes de elegir.
- **Caja (`caja.html`)**: hay un boceto inicial centrado en el efectivo físico. Claude está terminando o puede haber terminado su revisión; confirmar el resultado antes de marcarla como cerrada. El punto a resolver es cómo mostrar ventas por transferencia y otros medios, y el historial de ventas/movimientos por local para el personal y para el dueño con varios locales. El arqueo de billetes debe distinguirse del resumen de ventas. **Nota [C2]:** la Caja funcional ya está implementada y aplicada (ver BITÁCORA 13–17/10); según C2 siguen faltando las ventas por transferencia/otros medios y el historial por local (pendiente 10). **[C2, 20/10]:** no se pudo confirmar que C2 cerrara la revisión del boceto; se considera SIN REVISAR.
- **Procedimiento acordado**: los bocetos no significan que la lógica esté aprobada ni que los cambios estén publicados. Claude revisa cada propuesta contra el código y los datos reales; Martin sube los cambios después de esa revisión. En cambios solo visuales, no tocar archivos `.js` ni eliminar o renombrar `id`, `class` o `data-roles` existentes. Las páginas tienen copias independientes del sidebar, por lo que los cambios de menú deben propagarse a las páginas correspondientes.

#### Imágenes de los bocetos

Las capturas son referencias visuales; no representan pantallas conectadas a datos reales.

- [Números](docs/bocetos-visuales/numeros.jpg)
- [Pedidos por armar](docs/bocetos-visuales/pedidos-por-armar.jpg)
- [Compras — Compra](docs/bocetos-visuales/compras-compra.jpg)
- [Compras — Merma](docs/bocetos-visuales/compras-merma.jpg)
- [Compras — Depósito](docs/bocetos-visuales/compras-deposito.jpg)
- [Compras — Maduración](docs/bocetos-visuales/compras-maduracion.jpg)
- [Compras — Precio por lote](docs/bocetos-visuales/compras-precio-por-lote.jpg)
- [Inventario](docs/bocetos-visuales/inventario.jpg)
- [Caja — boceto en revisión](docs/bocetos-visuales/caja-revision.jpg)
- [Clientes](docs/bocetos-visuales/clientes.jpg)
- [Conversaciones](docs/bocetos-visuales/conversaciones.jpg)
- [Promociones](docs/bocetos-visuales/promociones.jpg)

---

## 4. PENDIENTE (por prioridad)

1. 🔔 **[ALTA] Prueba real de Mercado Pago** con otra persona (valida link, webhook y página; cada prueba cuesta la comisión de MP). Esperado: sale solo de "Pendientes" y la página pasa a "Pago confirmado". **El dueño la hará en unos días: recordársela en cada chat.** De paso, esa operación sirve para ver la comisión real con acreditación instantánea (ver pendiente 5).
2. **[MEDIA] Revisión de seguridad de la base [C1]:** HECHO: vistas internas cerradas, funciones de "Números" solo Dueño y `obtener_pedidos_whatsapp_pendientes` cerrada al público (ver BITÁCORA 20/10 y 21/10 [C1]). Las funciones de dinero de [C2] (Caja, Finanzas, pagos) se revisaron: ninguna es ejecutable por `anon` y todas chequean el rol. **Falta, por prioridad:**
   - **Pedidos y mensajes de WhatsApp falsos:** `crear_pedido_whatsapp`, `agregar_item_pedido_whatsapp` y `registrar_interaccion_whatsapp` están abiertas a `anon` porque el bot las usa con la clave pública, que está a la vista en `app.js`. Cualquiera podría crear pedidos falsos. Solución a diseñar: que el bot las llame con la clave de servicio y cerrarlas al público. Hacerlo antes de abrir.
   - **`obtener_items_pedido`:** `anon` la ejecuta y devuelve filas completas de `pedido_items` (incluye `costo_unitario_venta`) a quien tenga el UUID del pedido. Riesgo bajo; la tienda no la usa. Ver si alguien la usa; si no, cerrarla.
   - **`cancelar_pedido`:** cualquier usuario con login puede cancelar pedidos de cualquier local. Sin riesgo con un solo local; poner chequeo de local antes de abrir el segundo.
   - **Funciones `evaluar_*` (alertas):** `anon` puede ejecutarlas (solo dispararía alertas de más) y varias no tienen `search_path` fijo. Aviso menor, junto con el pendiente 8.
3. **Paso 4 (EN ESPERA por decisión del dueño):** cerrar el INSERT/DELETE público sobre `pedido_items` y el acceso público a `confirmar_metodo_pago` (función vieja). **Solo después** de probar todo (pendiente 1 y los flujos sin probar de la sección 3) y de dejar pasar varias horas desde el último cambio de `app.js` (hay pestañas abiertas con el código viejo). **VERIFICADO 21/10: el bot de WhatsApp SÍ usa `confirmar_metodo_pago` con la clave pública (`confirmarMetodoPago` en su `supabase.js`). Antes de cerrarla, pasar esa llamada al cliente de servicio (`supabaseInterno`) y probar un pago por el bot.**
4. **Combos (más adelante):** la base NO los calcula todavía. **NO activar ningún combo** hasta resolverlo (el cliente vería un total y pagaría otro).
5. **Recargo de MP (decisión en curso):** el recargo actual de 5% no cubre el costo real. Con acreditación a 18 días se observó ~7,2% (4,2% de MP + 3% de retención de IIBB). El dueño pasó la acreditación a "al instante" y quiere ver si se puede cobrar al cliente **6,5% + IVA + 3% de IIBB**; si el total da aprox. 7,2%, deja 7,2%.
   - Cuenta con los números del dueño: 6,5% + IVA (6,5 × 1,21 ≈ 7,87%) + 3% de IIBB ≈ **10,9%** de lo cobrado, no 7,2% (el 7,2% era con la acreditación lenta).
   - Como la comisión se calcula sobre el total ya con recargo, para recibir lo que vale el precio de lista el recargo debe ser `1 / (1 − costo) − 1`: ≈ 12,2% si el costo es 10,9%; ≈ 7,8% si fuera 7,2%.
   - **Primero verificar con una operación real** (detalle de la operación en MP: comisión, IVA y retenciones con acreditación instantánea). No cambiar `recargo_mp_porcentaje` hasta tener ese dato. Decidir también si un recargo de ese tamaño sobre el precio de lista es aceptable para el cliente.
6. 🔔 **`pago-pendiente.html`** dice "Te vamos a avisar apenas se acredite": no existe ningún mecanismo de aviso. Se deja así por ahora, **pero no olvidarlo** (recordárselo al dueño).
7. **A revisar:** pedidos de MP abandonados (el cliente nunca paga) retienen stock; falta vencimiento automático.
8. Avisos menores de seguridad: `search_path` en 17 funciones, extensión `pg_net` en schema público, protección de contraseñas filtradas apagada (puede requerir plan pago).
9. **[NUEVO, pedido del dueño 20/10] Precio por local.** Cada local debe poder fijar y actualizar sus propios precios. Lo más probable es que a futuro exista un precio general para todos los locales, pero cada local tiene que poder modificarlo según su zona (estratos sociales distintos), sus gastos fijos, etc.
   - Requisitos: (a) precio general opcional + precio propio por local que lo reemplaza; (b) el catálogo de cada local muestra el precio de ese local; (c) permisos: el Dueño edita todos; el Encargado puede cambiar los precios de su local (decidido 21/10).
   - Estado: no hecho. **Verificado 21/10 en la base:** no existe tabla de precios por local; el precio vive en cada lote (`lotes.precio`, con `local_id`), más `productos.precio` y `presentaciones.precio_venta`; `catalogo_disponible` no filtra por local; el checkout y el bot cobran el precio del lote.
   - **Decisión del dueño 21/10:** por ahora queda como está (un solo local, opción mínima: el precio sigue en el lote). Al abrir el segundo local se hace el proceso completo con tiempo (tabla de precio por producto y local, con el precio general como valor por defecto, tocando catálogo, checkout, bot y presentaciones a la vez, y cuidando las rebajas por maduración que se calculan sobre el precio del lote).
   - Necesita diseño antes de implementar (base primero, pantalla después, según el reparto de la sección 8). Prioridad media: no bloquea la apertura si abre con un solo local.
10. **Caja [C2]:** falta mostrar las ventas por transferencia y otros medios, y el historial por local (ver también la nota de Caja en "Rediseño de apariencia").
11. **Lista de chequeo antes del 1/12 [C2]:** ARMADA el 20/10 en `docs/lista-chequeo-1-12.md` (Mostrador, Encargado, Dueño y cruce de roles). **Falta que el dueño la ejecute** y anote los resultados. Los fallos conocidos son los del pendiente 10.
12. **Revisión de bocetos de GPT contra código y datos reales [C2]:** Números, Pedidos por armar, Clientes, Conversaciones, Promociones, Merma/Depósito/Maduración/Precio, Inventario y Caja (estado de cada uno en "Rediseño de apariencia"). Nada se sube sin esa revisión y el OK del dueño. Un boceto por chat. El boceto de Caja cuenta como sin revisar (C2 no confirmó haberlo cerrado).
13. **[NUEVO, pedido del dueño 21/10] Avisos en el panel del bot de WhatsApp (campanita) [diseño: C2].** Que el panel avise sin tener que entrar a la pantalla cuando (a) hay una conversación nueva o en curso con el bot y (b) hay un pedido nuevo en "Pedidos por armar". Se asume que el panel casi siempre está abierto. Base [C1] solo si hace falta una consulta o dato nuevo; no hay que tocar permisos.
14. **[NUEVO, pedido del dueño 21/10] Mensaje final del bot y delivery.** Hoy, al confirmar el pago, el bot dice solo "quedó registrado... ¡Gracias!". Falta decir que el pedido lo espera o que puede pasar a retirarlo (por ahora sin delivery). El dueño cree que las conversaciones serán sobre todo por **delivery** y no por consultas de productos: el delivery hay que diseñarlo (zona, costo, cómo se pide y cómo se avisa), todavía sin armar. El texto del bot está en `pedido.js` (fuera del repo).
15. **[C2] Nombre "Mercadería" y botón Caja en Compras:** `compras.html` no tenía el link a Caja en el menú (el Panel y Pedidos por armar sí). Se resolvió desde `sesion.js`: agrega el link Caja si falta (Dueño, Encargado, Mostrador) y cambia "Compras y mermas" por "Mercadería" en el menú, el atajo del Panel, el título de la pestaña y el encabezado de la página. **Verificado 21/10 con el rol Dueño:** Caja aparece en Mercadería y el nombre nuevo se ve bien. **Falta:** (a) comprobar lo mismo con Encargado y Mostrador (incluirlo al ejecutar la lista de chequeo del pendiente 11); (b) el cambio de nombre es provisorio y por JS, los HTML siguen diciendo "Compras y mermas": cuando se toquen las páginas, escribir el nombre nuevo directo y sacar `renombrarMercaderia()`. El texto del pendiente 12 y de "Rediseño de apariencia" sigue usando el nombre viejo.

---

## 5. EN CURSO (quién está trabajando en qué AHORA)

> **Antes de empezar una tarea, anotá una línea acá** ("estoy trabajando en esto"). Es una reserva provisional.
> Al terminar, cambiá el estado a **TERMINADA (falta OK del dueño)**. Cuando el dueño la acepta,
> borrá la línea de acá y agregala a la BITÁCORA (y a "Hecho y verificado" si corresponde).
> Si una línea lleva más de 12 horas sin novedades, considerala abandonada y preguntale al dueño antes de retomarla.
> Si ya hay una línea sobre el mismo archivo o tema, NO empieces: avisale al dueño.

| Cuenta | Tarea | Archivos que toca | Desde | Estado |
|---|---|---|---|---|
| GPT | Ninguna por ahora | — | — | — |
| C2 | Lista de chequeo del 1/12 (pendiente 11) | `docs/lista-chequeo-1-12.md` (solo documento) | 20/10 | TERMINADA (falta OK del dueño) |

Estados: `EN CURSO` → `TERMINADA (falta OK del dueño)` → (aceptada: pasa a la BITÁCORA).

---

## 6. PRÓXIMO PASO

**Elegir UNA tarea**, en este orden:
1. Pendiente 2 (lo que falta, prioridad media): cerrar las funciones `*_whatsapp` abiertas al público pasando el bot a la clave de servicio. Después, Paso 4 (pendiente 3) cuando el dueño lo decida.
2. Recordarle al dueño los 🔔: prueba real de MP (pendiente 1) y aviso de `pago-pendiente` (pendiente 6).
3. Para [C2] (pantallas): la lista de chequeo del 1/12 ya está armada (pendiente 11; falta que el dueño la ejecute). Seguir con la revisión de los bocetos de GPT, uno por chat (pendiente 12).
4. Cuando el dueño haga la prueba real de MP: mirar la comisión real y resolver el recargo (pendiente 5); después, destrabar el Paso 4 (pendiente 3).

---

## 7. BITÁCORA (más reciente arriba; una línea por trabajo)

- **21/10** [C2] — El dueño notó que en Compras desaparecía el botón Caja. Causa: el menú de `compras.html` no tiene el link (el Panel y `armado.html` sí; solo se leyeron esos tres). Cambio solo en `sesion.js`, ya subido por el dueño: nueva `agregarLinkCaja()` (agrega el link si falta, antes de Finanzas y Números) y `renombrarMercaderia()` ("Compras y mermas" pasa a "Mercadería", conservando el aviso amarillo de maduración). Clave pública de Supabase verificada idéntica. No se tocó base. Verificado por el dueño en pantalla (21/10, rol Dueño): Caja aparece en Mercadería y el nombre nuevo se ve en el menú, el atajo del Panel, la pestaña y el encabezado. Falta probarlo con Encargado y Mostrador (pendiente 15).
- **21/10** [C1] — Bot de WhatsApp. Se vio que el bot usa la clave pública para casi todo y que su clave de servicio estaba mal cargada en el `.env` (llevaba un `<` pegado delante, así que `/armado` no podía guardar pesos). El dueño la corrigió. Se agregó al bot un cliente interno con la clave de servicio para 5 llamadas (guardar/borrar carrito, recuperar carritos, recuperar pedidos pendientes) y el dueño lo reinició. Los logs muestran todas las llamadas del bot con respuesta correcta; con eso se cerró `obtener_pedidos_whatsapp_pendientes` al público (migración `cerrar_pedidos_whatsapp_pendientes_a_anon`, verificada: `anon` no, `authenticated` y servicio sí). Pedido #94 verificado en la base: 2 ítems, armado listo, pago por transferencia. **Hallazgo y arreglo:** el bot le dijo al cliente $1529 pero la base registró $1550, porque `confirmar_metodo_pago` redondea el total al múltiplo de $50 más cercano; `pedido.js` ahora aplica el mismo redondeo antes de avisar y, tras el pago, usa el total que devuelve la base (entregado, el dueño lo aplica en el bot). Pendiente de comprobar en una prueba nueva. Notas: el README del bot está desactualizado (dice que solo hace charla general); fuera de horario el bot no arma carritos ni crea pedidos (comportamiento intencional); si el dueño escribe a mano a un contacto, el bot lo pausa 180 minutos (se borra reiniciando o con `/bot activar <número>`).
- **20/10** [C1] — Pendiente 2, parte funciones: revisadas todas las funciones de `public`. Las de [C2] están bien (sin acceso `anon`, con chequeo de rol). Las 4 funciones de "Números" no chequeaban rol: se les agregó "solo Dueño" (migración `solo_dueno_funciones_numeros`). Probado antes en transacción con un usuario de cada rol (Dueño permitido; Encargado, Mostrador y Vendedor bloqueados) y verificado después (sin acceso `anon`, chequeo presente). Ninguna otra función, vista ni tarea programada las usaba. Anotados sin tocar: `obtener_items_pedido`, `cancelar_pedido` sin chequeo de local, `evaluar_*` abiertas a `anon` y las funciones `*_whatsapp` abiertas al público (ver pendiente 2).
- **20/10** [C2] — Chequeo de estado: C2 sin memoria del chat anterior, el boceto de Caja pasa a "sin revisar". Armada la lista de chequeo del 1/12 por rol (pendiente 11) y guardada en `docs/lista-chequeo-1-12.md`. No se tocó código ni base.
- **20/10** [C1] — Pendiente 2, parte vistas: el rol anónimo leía `clientes_saldo` (DNI, WhatsApp, límite de fiado, saldo), `lotes_legible` y `sugerencias_maduracion` (costo por lote) y `lotes_venta`. Probado primero en transacción que se deshace sola; aplicado con OK del dueño como migración `cerrar_lectura_publica_vistas_internas` (`revoke all ... from anon, public` sobre las 4 vistas). Verificado después: el anónimo queda bloqueado en las 4, sigue leyendo `catalogo_disponible` (16 filas) y con login se leen sin problema. Logs de 24 h: solo el panel de compras (`compras.js`, con login) usa `sugerencias_maduracion`. No se pudo revisar el código del bot de WhatsApp (fuera del repo). Observado, sin tocar: `pedidos`, `pedido_items` y `conversaciones_bot` aceptan INSERT público sin restricción (relacionado con el Paso 4, en espera).
- **20/10** [GPT] — Se sincronizó ESTADO.md con la versión más reciente de Martin, conservando sus actualizaciones y agregando el estado del rediseño y los enlaces a los 12 bocetos visuales ya subidos.
- **20/10** [C?] — Se fusionó la versión del repo (con la sección de rediseño de GPT) con lo informado por C2 (bitácora 13–17/10, pendientes 10 a 12, nota sobre sus funciones de dinero en el pendiente 2). Nueva regla en la sección 1: leer siempre la versión actual del repo antes de editar este archivo.
- **20/10** [C?] — Decisiones del dueño: prueba real de MP "en unos días" (recordarla); OK para cerrar lecturas públicas de vistas; Paso 4 en espera; combos más adelante; recargo de MP en evaluación con acreditación ya cambiada a "al instante"; avisos de `pago-pendiente` y menores se dejan sin olvidar; flujos sin probar "en unos días". README reescrito (reflejaba el sistema viejo). Agregado el pendiente 9 (precio por local).
- **19/10** [C1] — ESTADO.md subido al repo por el dueño. Se agregó la sección EN CURSO para reservar tareas y evitar que dos cuentas trabajen en lo mismo.
- **19/10** — Revisión de seguridad de la base (solo lectura): hallazgos anotados en pendiente 2. Se pidió este archivo para sincronizar las 3 cuentas.
- **18/10** — Verificado en producción el `app.js` nuevo (pedido #93). Las pruebas anteriores (#90, #91, #92) habían usado el `app.js` viejo por caché del navegador.
- **13–17/10** [C2] — Pantallas: Caja (apertura con fondo sugerido, gastos, retiro a resguardo, movimientos del día con anulación solo Dueño, pago a proveedor en efectivo y de a partes, cierre). Compras: panel de pago al finalizar (efectivo / transferencia / "A pagar" con vencimiento). Finanzas nueva (solo Dueño): cuentas, movimientos, pagos y vencimientos, pagos parciales, postergar vencimientos. `sesion.js`: agrega el link Finanzas al menú del Dueño.
- **13–17/10** [C2] — BASE (fuera del reparto, con OK del dueño, probado en transacción y aplicado de forma atómica): tablas `cuentas`, `movimientos_financieros`, `compromisos_pago`; caja por local (`caja_turnos.local_id`); funciones de caja, pagos y Finanzas. 8 migraciones, `20261014010900` a `20261014080000`, registradas en el historial de la base con el informe de cada prueba.
- **17/10** — Credenciales de producción de MP activadas y token cargado. Compra real #88 aprobada. Creada y desplegada `checkout_pedido` (columnas `mp_monto_cobrado` y `mp_payment_id`). Desplegadas `crear-preferencia-pago` v5/v6 y `mp-webhook`. Nueva `pago-exitoso.html` (hubo un error del botón visible; corregido). Nuevo `app.js`.

---

## 8. REPARTO DE TAREAS (PROPUESTA: falta confirmación del dueño)

| Cuenta | Se ocupa de | Archivos típicos |
|---|---|---|
| Claude cuenta 1 (la original) | Base de datos, funciones y seguridad | Migraciones SQL, Edge Functions (`crear-preferencia-pago`, `mp-webhook`) |
| Claude cuenta 2 (la nueva) | Pantallas y lógica del navegador | `app.js`, `admin.js`, `caja.js`, `compras.js`, HTML y CSS |
| GPT | Revisión independiente y diseño | No despliega: contrasta propuestas e ideas de diseño |

Reglas del reparto:
- Si un cambio toca base Y pantalla (ej. el checkout), lo diseña quien tiene la base y deja en la BITÁCORA qué cambia para la pantalla. El cambio de pantalla se entrega DESPUÉS, nunca a la vez.
- Nadie trabaja a la vez sobre el mismo archivo. Nadie aplica en producción sin el OK del dueño.
- Cada cuenta firma sus líneas de la BITÁCORA con [C1], [C2] o [GPT].

---

## 9. ARRANQUE (texto para pegar al empezar un chat nuevo, en cualquier cuenta)

```
Trabajamos en el proyecto "once". Leé https://raw.githubusercontent.com/once-store/once-verduleria/master/ESTADO.md
(si no podés abrir la dirección, te pego el contenido). Respetá las REGLAS y el MODO ECONÓMICO.
Empezá por "PRÓXIMO PASO". Hoy quiero: [escribir acá la tarea].
Al terminar, decime qué líneas agregar a PENDIENTE y BITÁCORA.
```
