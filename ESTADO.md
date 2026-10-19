# ESTADO DEL PROYECTO "once" (verdulería autoservicio)

> **Para cualquier IA (Claude, GPT) o persona:** este archivo es la fuente de verdad.
> Leelo ENTERO antes de hacer nada, trabajá desde "PRÓXIMO PASO" y, al terminar,
> actualizá "ESTADO", "PENDIENTE" y "BITÁCORA". Última actualización: 19/10/2026 [C1].
> **Repo público: nunca escribir acá claves, tokens, ni datos de clientes.**

---

## 1. REGLAS DE TRABAJO (valen para todas las cuentas)

**Con el dueño (Martin, no es desarrollador):**
- Entregar archivos COMPLETOS para reemplazar con Ctrl+A (nunca fragmentos).
- Explicar en lenguaje simple QUÉ cambia y POR QUÉ, antes de aplicar.
- Directo, sin disculpas, sin condescendencia. No suponer: mirar logs/datos reales.
- Sube los cambios editando en la web de GitHub (no usa git en la PC). No subir ni aplicar nada sin su OK.

**MODO ECONÓMICO (el dueño llega al límite de uso cada ~4 h; hay 3 cuentas trabajando casi a la vez):**
- Leer SOLO este archivo al empezar. No releer ni re-verificar lo marcado ✅.
- Hacer solo lo pedido. Nada de auditorías ni investigaciones extra sin preguntar antes.
- Verificar a fondo SOLO si toca dinero, seguridad o la base de datos. Lo demás: un chequeo corto.
- Un chat nuevo por tarea, empezando con el texto de "ARRANQUE" (sección 9). Los chats larguísimos gastan más límite.
- Respuestas cortas. No narrar cada paso ("voy a revisar…"): hacerlo y dar el resultado.
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
- **Mercado Pago:** app "once", credenciales de PRODUCCIÓN activas. El token está en el secreto `MP_ACCESS_TOKEN` de Supabase. Nunca en el repo ni en chats.
- **Páginas públicas (sin login):** `index.html`, `ticket.html`, `pago-exitoso.html`, `pago-pendiente.html`, `pago-fallido.html`
- **Panel del personal (con login):** `admin-v2.html` (usa `admin.js`, refresca "Pendientes" cada 5 s), caja, armado, compras, finanzas, clientes, promociones, horario, métricas, conversaciones
- **Apertura prevista del negocio: 1/12/2026**
- **Reglas de negocio:** recargo de MP en la tabla `configuracion` (`recargo_mp_porcentaje` = 5). El total del pedido se redondea a múltiplos de $50. Al confirmar, el panel abre el ticket en pestaña nueva (diseño actual, no es un error).
- **Estados de pedido:** `pendiente_pago`, `pendiente_mp`, `pendiente_efectivo`, `pendiente_transferencia`, `pendiente_combinado`, `pagado`, `cancelado`

---

## 3. ESTADO ACTUAL

### ✅ Hecho y verificado
- **Checkout atómico** (función `checkout_pedido` en la base). El navegador solo manda QUÉ pidió (lote o presentación + cantidad); la base calcula precios, promos, stock y total. Es repetible sin duplicar ítems ni stock. *Aplicado 17/10.*
- **`app.js` usa `checkout_pedido`** y está en producción. Verificado 18/10 con el pedido #93 (efectivo): 1 solo ítem, stock descontado una vez, botones "Ver ticket" y "Hacer otro pedido" funcionando.
- **Edge Function de pago v6:** recibe SOLO el `pedidoId`; el importe sale de la base + recargo; guarda el importe exacto en `pedidos.mp_monto_cobrado`; manda una sola línea "Pedido #N - once" a MP.
- **Mercado Pago en producción:** token de producción cargado. Verificado con compra real (#88, $315 = $300 + 5%, aprobada).
- **`pago-exitoso.html` nueva:** consulta el estado del pedido; cuando está `pagado` muestra "¡Pago confirmado!" con botón "Ver mi ticket" (el botón está oculto hasta entonces). Publicada.
- **Webhook `mp-webhook` desplegado:** marca el pedido `pagado` solo si MP confirma pago aprobado, el pedido está en `pendiente_mp` y el importe coincide con `mp_monto_cobrado`. Guarda el N.º de operación en `pedidos.mp_payment_id`.

### 🟡 Hecho pero SIN probar con datos reales
- El **webhook** con un pago real de MP (probado solo con simulaciones, 32 casos OK). No se sabe si MP acepta la `notification_url` ni el formato exacto del aviso.
- `pago-exitoso` con un pago real de MP.
- Flujos de **transferencia** y **pago combinado** con el `app.js` nuevo.
- **Reintento de MP** tras un link fallido (probado solo con simulación).

---

## 4. PENDIENTE (por prioridad)

1. **[ALTA] Prueba real de Mercado Pago** con otra persona (valida link, webhook y página; cada prueba cuesta la comisión de MP). Esperado: sale solo de "Pendientes" y la página pasa a "Pago confirmado".
2. **[ALTA] Revisión de seguridad de la base:** hay permisos de lectura pública para cerrar en vistas internas (SQL ya probado en transacción que se deshace; **falta OK del dueño para aplicarlo**) y revisar el acceso a funciones de dinero. Detalle fuera del repo por ser público.
3. **Paso 4:** cerrar el INSERT/DELETE público sobre `pedido_items` y el acceso público a `confirmar_metodo_pago` (función vieja). **Solo después** de probar todo y de dejar pasar varias horas desde el último cambio de `app.js` (hay pestañas abiertas con el código viejo).
4. **Combos:** la base NO los calcula todavía. **NO activar ningún combo** hasta resolverlo (el cliente vería un total y pagaría otro).
5. **Decisión del dueño:** el recargo de 5% no cubre el costo real de MP (observado ~7,2%: 4,2% de MP + 3% de retención de IIBB). Y la plata de MP se acredita a ~18 días en su cuenta: si necesita cobro inmediato, evalúa quitar MP y dejar transferencia con confirmación manual.
6. `pago-pendiente.html` dice "Te vamos a avisar apenas se acredite": no existe ningún mecanismo de aviso.
7. **A revisar:** pedidos de MP abandonados (el cliente nunca paga) retienen stock; falta vencimiento automático.
8. Avisos menores de seguridad: `search_path` en 17 funciones, extensión `pg_net` en schema público, protección de contraseñas filtradas apagada (puede requerir plan pago).

---

## 5. EN CURSO (quién está trabajando en qué AHORA)

> **Antes de empezar una tarea, anotá una línea acá** ("estoy trabajando en esto"). Es una reserva provisional.
> Al terminar, cambiá el estado a **TERMINADA (falta OK del dueño)**. Cuando el dueño la acepta,
> borrá la línea de acá y agregala a la BITÁCORA (y a "Hecho y verificado" si corresponde).
> Si una línea lleva más de 12 horas sin novedades, considerala abandonada y preguntale al dueño antes de retomarla.
> Si ya hay una línea sobre el mismo archivo o tema, NO empieces: avisale al dueño.

| Cuenta | Tarea | Archivos que toca | Desde | Estado |
|---|---|---|---|---|
| (ninguna por ahora) | | | | |

Estados: `EN CURSO` → `TERMINADA (falta OK del dueño)` → (aceptada: pasa a la BITÁCORA).

---

## 6. PRÓXIMO PASO

**Elegir UNA tarea**, en este orden, según lo que el dueño pueda hacer ahora:
- Si tiene una persona para pagar: pendiente 1 (prueba real de MP).
- Si no: pendiente 2 (aplicar el cierre de vistas, tras el OK del dueño) y dejar el pendiente 3 preparado.

---

## 7. BITÁCORA (más reciente arriba; una línea por trabajo)

- **19/10** [C1] — ESTADO.md subido al repo por el dueño. Se agregó la sección EN CURSO para reservar tareas y evitar que dos cuentas trabajen en lo mismo.
- **19/10** — Revisión de seguridad de la base (solo lectura): hallazgos anotados en pendiente 2. Se pidió este archivo para sincronizar las 3 cuentas.
- **18/10** — Verificado en producción el `app.js` nuevo (pedido #93). Las pruebas anteriores (#90, #91, #92) habían usado el `app.js` viejo por caché del navegador.
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
