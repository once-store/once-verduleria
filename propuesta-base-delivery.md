# Propuesta de base para el delivery (pendiente 24) — BORRADOR, NADA APLICADO

Autor: [C3], 15/11/2026. Para revisión del dueño y de C1 (base). Sigue el diseño del pendiente 24 de `ESTADO.md` y lo que se vio en las pruebas del bot. Las funciones y tablas de abajo **no se ejecutaron**: son un borrador.

Procedimiento (ESTADO, sección 1): anotar la reserva en EN CURSO, probar todo en una transacción que se deshace sola, comparar un pedido SIN envío antes y después (tiene que dar EXACTAMENTE lo mismo), y recién con el OK del dueño aplicar.

## 1. Qué problema resuelve
- El total definitivo ignora el envío: `cargar_pesos_reales_pedido` y `confirmar_metodo_pago` reconstruyen `monto_total` solo desde los ítems.
- El aviso "pago confirmado" dice "podés pasar a retirarlo" aunque sea delivery.
- No existe dónde guardar dirección, ubicación, costo, estado de entrega ni repartidor.
- La tarifa está fija en el código del bot (prototipo).

## 2. Objetos nuevos
```sql
-- Tarifa: se regula desde configuracion (valores de arranque, a confirmar por el dueño)
insert into configuracion (clave, valor) values
  ('envio_factor_ajuste', '1.2'), ('envio_precio_km', '700'), ('envio_minimo', '700'),
  ('envio_redondeo', '100'), ('envio_km_max_automatico', '8'), ('envio_comision_pct', '10')
on conflict (clave) do nothing;

alter table locales add column if not exists latitud numeric, add column if not exists longitud numeric;

create table repartidores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  whatsapp text,
  activo boolean not null default true,
  cobra_por_entrega boolean not null default true
);

create table entregas (                       -- 1 a 1 con pedidos
  pedido_id uuid primary key references pedidos(id),
  repartidor_id uuid references repartidores(id),
  estado text not null default 'pendiente'
    check (estado in ('pendiente','en_camino','entregado','no_entregado','cancelado')),
  lat numeric, lng numeric,
  referencia text,                            -- texto del mapa o dirección escrita
  telefono_contacto text,                     -- el teléfono de WhatsApp llega como @lid: ver sección 6
  km_calles numeric,                          -- distancia real por calles (Mapbox)
  km_tarifa numeric,                          -- km ajustados con los que se cobró
  costo_envio numeric not null default 0,
  costo_manual boolean not null default false,
  tarifa jsonb,                               -- valores de configuracion usados en ese momento
  comision_pct numeric, pago_repartidor numeric,
  creado_en timestamptz not null default now(),
  en_camino_en timestamptz, entregado_en timestamptz
);
alter table entregas enable row level security;   -- sin políticas públicas; lectura solo staff
```

```sql
create function _envio_pedido(p_pedido_id uuid) returns numeric
language sql stable security definer set search_path to 'public' as $$
  select coalesce((select costo_envio from entregas where pedido_id = p_pedido_id), 0)
$$;

-- El bot manda solo los km por calles; el precio lo decide la base.
create function calcular_costo_envio(p_km_calles numeric)
returns table(km_tarifa numeric, costo numeric)
language plpgsql stable security definer set search_path to 'public' as $$
declare f numeric; pk numeric; mn numeric; rd numeric; mx numeric;
begin
  select valor::numeric into f  from configuracion where clave='envio_factor_ajuste';
  select valor::numeric into pk from configuracion where clave='envio_precio_km';
  select valor::numeric into mn from configuracion where clave='envio_minimo';
  select valor::numeric into rd from configuracion where clave='envio_redondeo';
  select valor::numeric into mx from configuracion where clave='envio_km_max_automatico';
  km_tarifa := p_km_calles * f;
  costo := case when km_tarifa > mx then null
                else greatest(mn, round(km_tarifa * pk / rd) * rd) end;   -- null = cotizar a mano
  return next;
end $$;

-- Lo llama el bot (clave de servicio) justo después de crear_pedido_whatsapp.
create function registrar_envio_pedido(p_pedido_id uuid, p_lat numeric, p_lng numeric,
  p_referencia text, p_km_calles numeric, p_telefono_contacto text default null)
returns numeric language plpgsql security definer set search_path to 'public' as $$
declare v_costo numeric; v_km numeric;
begin
  -- valida: pedido de WhatsApp, todavía en pendiente_pago y sin envío cargado
  perform 1 from pedidos where id = p_pedido_id and origen = 'whatsapp' and estado = 'pendiente_pago';
  if not found then raise exception 'Pedido no válido para delivery'; end if;
  select km_tarifa, costo into v_km, v_costo from calcular_costo_envio(p_km_calles);
  insert into entregas (pedido_id, lat, lng, referencia, telefono_contacto, km_calles, km_tarifa, costo_envio, costo_manual)
  values (p_pedido_id, p_lat, p_lng, p_referencia, p_telefono_contacto, p_km_calles, v_km, coalesce(v_costo,0), v_costo is null);
  return coalesce(v_costo, 0);
end $$;
```
Pendientes de escribir en la versión final (mismo estilo): `fijar_costo_envio(p_pedido_id, p_costo)` (staff, para el costo "a mano"), `marcar_entrega(p_pedido_id, p_estado, p_repartidor_id)` y `obtener_para_repartir()` (lista para el panel).

## 3. Funciones existentes a tocar (cambios mínimos, siempre compatibles hacia atrás)
| Función | Cambio |
|---|---|
| `cargar_pesos_reales_pedido` | `v_total := v_total + _envio_pedido(p_pedido_id)` antes del `update pedidos set ... monto_total = v_total` (devuelve el total con envío). |
| `confirmar_metodo_pago` | Después de calcular `v_total` desde los ítems: `v_total := v_total + _envio_pedido(p_pedido_id)`, antes del redondeo de efectivo. |
| `checkout_pedido` (web) | Igual que arriba en la rama `pendiente_pago`. En `pendiente_mp` NO: reutiliza el total guardado, que ya lo incluye (no sumar dos veces). Para la tienda `_envio_pedido` da 0. |
| `_aviso_pago_whatsapp` | `tipo` = `'pago_confirmado_delivery'` si el pedido tiene fila en `entregas`, si no `'pago_confirmado'`. El texto lo pone el bot. |
| `cancelar_pedido` | Si hay fila en `entregas`, pasarla a `'cancelado'`. |
| `cargar_pedido_a_cuenta`, `evaluar_piso_venta_diaria`, `obtener_meta_venta_hoy`, `obtener_ticket` | Leer su definición antes de proponer el cambio exacto: sumar o restar el envío según corresponda (las ventas no deben inflarse con el envío; el ticket lo muestra como línea aparte). |

Pantalla [C2, después de la base]: el resumen "Vendido" de `admin.js` suma `monto_total`; hay que restarle el envío.

## 4. Flujo de estados de la entrega
- `marcar_entrega('en_camino')`: guarda la hora y encola el aviso `en_camino` en `avisos_bot` (el bot pone el texto "tu pedido está en camino, esperá en la puerta").
- `marcar_entrega('entregado')`: guarda la hora y calcula `pago_repartidor = costo_envio × (1 − comisión)`. **Si el pedido estaba en `pendiente_efectivo`, también lo pasa a `pagado` en el mismo paso** (un solo toque, atómico). Transferencia y Mercado Pago se confirman antes de salir.
- El pago al repartidor se liquida después con `registrar_salida` (fuera de esta etapa).

## 5. Pruebas antes de aplicar (en una transacción que se deshace)
1. Pedido sin envío (web y WhatsApp): mismos montos, ítems y estados antes y después.
2. Pedido de WhatsApp con envío: armado → total con envío → método de pago → `monto_total` correcto en efectivo (redondeo a $50), transferencia y MP.
3. Reintento desde `pendiente_mp`: el envío no se suma dos veces.
4. Cancelación: stock repuesto y entrega cancelada.
5. Permisos: sin sesión no se puede leer ni escribir `entregas`.

## 6. Decisiones del dueño que faltan
1. Valores finales de tarifa (hoy: factor 1,2, $700 por km, mínimo $700, redondeo $100, tope automático 8 km, comisión 10%). Falta probar destinos de 4 a 8 km.
2. **Dónde se llama a Mapbox.** Diseño del ESTADO: Edge Function (el bot y el panel no dependen del proveedor). Camino rápido para el 1/12: el bot llama a Mapbox desde la PC (token en el `.env`) y manda a la base solo los km; la Edge Function queda para después. Recomiendo el camino rápido si no llegamos.
3. Teléfono del cliente: el bot recibe un identificador interno (`@lid`). Opciones: pedir un número de contacto solo en los pedidos de delivery (queda en `entregas.telefono_contacto`), o que el bot haga de intermediario.
4. Mostrar el envío al cliente como precio, sin los km (los km ajustados no son una distancia real).
