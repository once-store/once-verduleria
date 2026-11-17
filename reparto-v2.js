import { supabase, obtenerSesionActual } from './sesion.js'

// Pantalla del repartidor. Lee la lista con la función `obtener_para_repartir` y marca cada
// entrega con `marcar_entrega` (la base decide el estado y, en efectivo, pasa el pedido a "pagado"
// recién al entregar). El cierre del día usa `obtener_entregas_hoy`.
const ROLES_OK = ['dueno', 'encargado', 'mostrador']
const REFRESCO_MS = 15000

const $ = (id) => document.getElementById(id)
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const num = (v) => Number(v) || 0
const money = (n) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(num(n))
const cant = (it) => `${num(it.cantidad).toLocaleString('es-AR')} ${it.tipo === 'peso' ? 'kg' : 'un.'}`

let pedidos = []
let hoy = null // null = todavía no cargó; [] = sin entregas; 'error' = función no disponible
let actual = null
let tab = 'list'
let ocupado = false
let sesion = null

// ---------- Datos ----------
function cobro(p) {
  const ef = num(p.monto_efectivo)
  const tr = num(p.monto_transferencia)
  if (p.estado === 'pendiente_efectivo') return { ef: ef || num(p.monto_total), tr: 0 }
  if (p.estado === 'pendiente_transferencia') return { ef: 0, tr: tr || num(p.monto_total) }
  if (p.estado === 'pendiente_combinado') return { ef, tr }
  return { ef: 0, tr: 0 }
}
const hayCobro = (p) => { const c = cobro(p); return c.ef + c.tr > 0 }

function textoCobro(p) {
  const c = cobro(p)
  if (c.ef && c.tr) return `${money(c.ef)} en efectivo + ${money(c.tr)} por transferencia`
  if (c.ef) return `${money(c.ef)} en efectivo`
  return `${money(c.tr)} por transferencia`
}

const telefonoLimpio = (p) => {
  const d = String(p.telefono_contacto || '').replace(/\D/g, '')
  return d.length === 10 ? d : null
}
const mapaGoogle = (p) => (Number.isFinite(Number(p.lat)) && p.lat !== null && p.lng !== null
  ? `https://www.google.com/maps/dir/?api=1&destination=${Number(p.lat)},${Number(p.lng)}&travelmode=driving` : null)
const mapaWaze = (p) => (p.lat !== null && p.lng !== null
  ? `https://waze.com/ul?ll=${Number(p.lat)},${Number(p.lng)}&navigate=yes` : null)

const enCamino = (p) => p.entrega_estado === 'en_camino'
const siguiente = () => pedidos.find(enCamino) || pedidos[0] || null

async function cargar() {
  const { data, error } = await supabase.rpc('obtener_para_repartir')
  if (error) {
    toast('No se pudo actualizar la lista: ' + error.message)
    return false
  }
  pedidos = Array.isArray(data) ? data : []

  const r = await supabase.rpc('obtener_entregas_hoy')
  hoy = r.error ? 'error' : (Array.isArray(r.data) ? r.data : [])
  return true
}

// ---------- Pantallas ----------
function tarjeta(p, i) {
  const c = cobro(p)
  const etiqueta = p.entrega_estado === 'no_entregado'
    ? '<span class="paytag wait">No se pudo entregar</span>'
    : hayCobro(p)
      ? `<span class="paytag charge">Cobrar ${money(c.ef + c.tr)}</span>`
      : '<span class="paytag">✓ Ya pagó</span>'
  const productos = (p.items || []).slice(0, 2).map((x) => esc(x.nombre)).join(' · ')
  const mas = (p.items || []).length > 2 ? ` · +${p.items.length - 2}` : ''
  return `<button class="order ${p === siguiente() ? 'current' : ''}" data-id="${esc(p.pedido_id)}">
    <div class="orderhead">
      <div class="stop ${p.entrega_estado === 'no_entregado' ? 'issue' : ''}">${String(i + 1).padStart(2, '0')}</div>
      <div class="identity"><div class="number">#${esc(p.numero_corto)}</div>
        <div class="customer">${enCamino(p) ? '🛵 En camino · ' : ''}${esc(p.referencia || 'Ubicación en el mapa')}</div></div>
      <div class="amount">${money(p.monto_total)}</div>
    </div>
    <div class="orderfoot"><span class="items">${productos}${mas}</span>${etiqueta}</div>
  </button>`
}

function pintarLista() {
  const porCobrar = pedidos.reduce((a, p) => { const c = cobro(p); return a + c.ef + c.tr }, 0)
  $('screen-list').innerHTML = `
    <div class="intro"><div><h2>La vuelta de hoy</h2><p>${pedidos.length} para entregar</p></div><span class="daypill">EN VIVO</span></div>
    <div class="summary">
      <div class="metric"><b>${pedidos.length}</b><span>PARA ENTREGAR</span></div>
      <div class="metric"><b>${money(porCobrar)}</b><span>POR COBRAR</span></div>
    </div>
    ${pedidos.length ? pedidos.map(tarjeta).join('') : '<div class="empty">No hay pedidos para repartir ahora. Cuando armes un pedido con delivery, aparece acá.</div>'}
    <p class="smallnote">Salen los pedidos de WhatsApp con delivery, ya armados y con el pago hecho o por cobrar al entregar. Se actualiza solo cada 15 segundos.</p>`
}

function pintarSiguiente() {
  const p = siguiente()
  if (!p) {
    $('screen-next').innerHTML = '<div class="intro"><div><h2>Siguiente parada</h2><p>Sin entregas pendientes</p></div></div><div class="empty">¡Vuelta terminada! No quedan pedidos para entregar.</div>'
    return
  }
  const g = mapaGoogle(p)
  const w = mapaWaze(p)
  $('screen-next').innerHTML = `
    <div class="intro"><div><h2>Siguiente parada</h2><p>${pedidos.length} en total</p></div><span class="daypill">${enCamino(p) ? 'EN CAMINO' : 'POR SALIR'}</span></div>
    <div class="routeinfo"><div class="stop">${pedidos.indexOf(p) + 1}</div>
      <div style="flex:1;min-width:0"><b>Pedido #${esc(p.numero_corto)}</b><small>${esc(p.referencia || 'Ubicación en el mapa')}</small></div>
      <b>${money(p.monto_total)}</b></div>
    ${hayCobro(p) ? `<div class="collect">Cobrar ${money(cobro(p).ef + cobro(p).tr)}<small>${esc(textoCobro(p))}</small></div>` : ''}
    <a class="btn ${g ? '' : 'off'}" ${g ? `href="${esc(g)}" target="_blank" rel="noopener"` : ''}>↗ Abrir en Google Maps</a>
    <div class="mapbuttons">
      <a class="btn secondary ${w ? '' : 'off'}" ${w ? `href="${esc(w)}" target="_blank" rel="noopener"` : ''}>Abrir en Waze</a>
      <button class="btn secondary" data-id="${esc(p.pedido_id)}" data-ir="detalle">Ver entrega →</button>
    </div>
    <p class="smallnote">El orden es el de llegada de los pedidos. El mapa con la ruta completa llega en una próxima etapa.</p>`
}

function pintarDetalle() {
  const p = pedidos.find((x) => x.pedido_id === actual)
  if (!p) { mostrar('list'); return }
  const tel = telefonoLimpio(p)
  const g = mapaGoogle(p)
  const w = mapaWaze(p)
  const c = cobro(p)
  const total = c.ef + c.tr
  $('screen-detail').innerHTML = `
    <button class="back" id="volver">← Volver a la vuelta</button>
    <div class="details-head"><div class="stop ${p.entrega_estado === 'no_entregado' ? 'issue' : ''}">${pedidos.indexOf(p) + 1}</div>
      <div class="identity"><div class="number">#${esc(p.numero_corto)}</div><div class="customer">${enCamino(p) ? '🛵 En camino' : p.entrega_estado === 'no_entregado' ? 'No se pudo entregar' : 'Por salir'}</div></div>
      <div class="amount">${money(p.monto_total)}</div></div>
    <div class="address"><span>⌖</span><div><strong>${esc(p.referencia || 'Ubicación en el mapa')}</strong><small>La Rioja${num(p.costo_envio) ? ` · envío ${money(p.costo_envio)} incluido` : ''}</small></div></div>
    <div class="mapbuttons"><a class="btn ${g ? '' : 'off'}" style="margin:0" ${g ? `href="${esc(g)}" target="_blank" rel="noopener"` : ''}>↗ Google Maps</a>
      <a class="btn secondary ${w ? '' : 'off'}" style="margin:0" ${w ? `href="${esc(w)}" target="_blank" rel="noopener"` : ''}>Waze</a></div>
    <div class="detailbox" style="margin-top:10px"><h3>Pedido · ${(p.items || []).length} productos</h3>
      ${(p.items || []).map((x) => `<div class="itemrow"><span>${esc(x.nombre)}</span><span>${esc(cant(x))}</span></div>`).join('')}
      ${num(p.costo_envio) ? `<div class="itemrow"><span>Envío</span><span>${money(p.costo_envio)}</span></div>` : ''}
      <div class="totalrow"><span>Total del pedido</span><span>${money(p.monto_total)}</span></div>
      ${total ? `<div class="collect">Cobrar ${money(total)}<small>${esc(textoCobro(p))}</small></div>` : '<div class="paytag" style="margin-top:8px;display:inline-block">✓ Ya pagó</div>'}
    </div>
    <div class="contactrow">
      <a class="btn secondary ${tel ? '' : 'off'}" ${tel ? `href="tel:+549${tel}"` : ''}>☎ Llamar</a>
      <a class="btn secondary ${tel ? '' : 'off'}" ${tel ? `href="https://wa.me/549${tel}" target="_blank" rel="noopener"` : ''}>◉ WhatsApp</a>
    </div>
    ${tel ? '' : '<p class="smallnote">Este cliente no dejó un teléfono de contacto. Escribile desde el chat del bot.</p>'}
    <div class="actionstack">
      ${enCamino(p) ? '' : '<button class="btn secondary" data-marcar="en_camino">🛵 Salí con este pedido</button>'}
      <button class="btn" data-marcar="entregado">Entregado${total ? ' · cobré ' + money(total) : ''}</button>
      <button class="btn warn" data-marcar="no_entregado">No estaba / Problema</button>
    </div>
    <p class="smallnote">Al marcar "Salí" el cliente recibe un aviso de WhatsApp. En efectivo, el pedido pasa a pagado al marcarlo entregado.</p>`
}

function pintarCierre() {
  if (hoy === 'error') {
    $('screen-close').innerHTML = '<div class="intro"><div><h2>Cierre del día</h2></div></div><div class="empty">El resumen del día todavía no está disponible.</div>'
    return
  }
  const lista = hoy || []
  const hechas = lista.filter((e) => e.entrega_estado === 'entregado')
  const abiertas = lista.filter((e) => e.entrega_estado === 'pendiente' || e.entrega_estado === 'en_camino')
  const problemas = lista.filter((e) => e.entrega_estado === 'no_entregado')
  const efectivo = hechas.filter((e) => ['efectivo', 'combinado'].includes(e.metodo_pago)).reduce((a, e) => a + num(e.monto_efectivo), 0)
  const transf = hechas.filter((e) => String(e.estado).startsWith('pendiente')).reduce((a, e) => a + num(e.monto_transferencia), 0)
  const parte = hechas.reduce((a, e) => a + num(e.pago_repartidor), 0)
  $('screen-close').innerHTML = `
    <div class="intro"><div><h2>Cierre del día</h2><p>Entregas de hoy</p></div><span class="daypill">HOY</span></div>
    <div class="closehero"><div class="eyebrow">Entregas hechas</div><strong>${hechas.length} <span style="font-size:18px">/ ${lista.length}</span></strong>
      <span>${abiertas.length} pendientes${problemas.length ? ' · ' + problemas.length + ' con problema' : ''}</span></div>
    <div class="closegrid">
      <div class="closecard"><span>EFECTIVO PARA ENTREGAR EN CAJA</span><strong>${money(efectivo)}</strong></div>
      <div class="closecard"><span>TRANSFERENCIAS POR CONFIRMAR</span><strong>${money(transf)}</strong></div>
      <div class="closecard"><span>TU PARTE DE LOS ENVÍOS</span><strong>${money(parte)}</strong></div>
      <div class="closecard"><span>ENTREGAS CON PROBLEMA</span><strong>${problemas.length}</strong></div>
    </div>
    <p class="smallnote">El efectivo cobrado se entrega en la caja del local. Las transferencias las confirma el local en el panel.</p>`
}

const TITULOS = { login: 'Reparto', list: 'Para repartir', next: 'Siguiente parada', detail: 'Detalle de entrega', close: 'Cierre del día' }

function mostrar(pantalla) {
  tab = pantalla
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'))
  $('screen-' + pantalla).classList.add('active')
  document.querySelectorAll('.navbtn').forEach((b) => b.classList.toggle('active', b.dataset.tab === (pantalla === 'detail' ? 'list' : pantalla)))
  $('title').textContent = TITULOS[pantalla]
  if (pantalla === 'list') pintarLista()
  if (pantalla === 'next') pintarSiguiente()
  if (pantalla === 'detail') pintarDetalle()
  if (pantalla === 'close') pintarCierre()
  $('main').scrollTop = 0
}

function repintar() {
  if (tab === 'list') pintarLista()
  else if (tab === 'next') pintarSiguiente()
  else if (tab === 'detail') pintarDetalle()
  else if (tab === 'close') pintarCierre()
}

// ---------- Acciones ----------
let temporizadorToast
function toast(texto) {
  const el = $('toast')
  el.textContent = texto
  el.style.display = 'block'
  clearTimeout(temporizadorToast)
  temporizadorToast = setTimeout(() => { el.style.display = 'none' }, 3200)
}

async function marcar(estado) {
  const p = pedidos.find((x) => x.pedido_id === actual)
  if (!p || ocupado) return
  const total = cobro(p).ef + cobro(p).tr
  if (estado === 'entregado') {
    const msg = total
      ? `¿Confirmás que entregaste el pedido #${p.numero_corto} y cobraste ${money(total)}?`
      : `¿Confirmás que entregaste el pedido #${p.numero_corto}?`
    if (!window.confirm(msg)) return
  }
  if (estado === 'no_entregado' && !window.confirm(`¿Marcar el pedido #${p.numero_corto} como no entregado?`)) return

  ocupado = true
  document.querySelectorAll('[data-marcar]').forEach((b) => { b.disabled = true })
  const { error } = await supabase.rpc('marcar_entrega', { p_pedido_id: p.pedido_id, p_estado: estado })
  ocupado = false
  if (error) {
    toast('No se pudo guardar: ' + error.message)
    document.querySelectorAll('[data-marcar]').forEach((b) => { b.disabled = false })
    return
  }
  if (estado === 'en_camino') toast(`Pedido #${p.numero_corto} en camino. Le avisamos al cliente.`)
  else if (estado === 'entregado') toast(p.estado === 'pendiente_efectivo' ? `Pedido #${p.numero_corto} entregado y cobrado.` : `Pedido #${p.numero_corto} entregado.`)
  else toast(`Pedido #${p.numero_corto} marcado como no entregado.`)
  await cargar()
  if (estado === 'en_camino') mostrar('detail')
  else mostrar('list')
}

// ---------- Sesión ----------
function pantallaLogin(mensaje = '') {
  $('btn-salir').hidden = true
  $('nav').classList.add('off')
  $('screen-login').innerHTML = `
    <div class="login"><h2>Entrar al reparto</h2><p>Usá el mismo usuario y contraseña del panel de once.</p>
      <label for="correo">Correo</label><input id="correo" type="email" autocomplete="username" inputmode="email">
      <label for="clave">Contraseña</label><input id="clave" type="password" autocomplete="current-password">
      <button class="btn" id="entrar">Entrar</button><div class="err" id="login-error">${esc(mensaje)}</div></div>`
  mostrar('login')
}

async function entrar() {
  const email = $('correo').value.trim()
  const password = $('clave').value
  if (!email || !password) { $('login-error').textContent = 'Escribí tu correo y tu contraseña.'; return }
  $('entrar').disabled = true
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    $('entrar').disabled = false
    $('login-error').textContent = 'No se pudo entrar: revisá el correo y la contraseña.'
    return
  }
  await iniciar()
}

async function iniciar() {
  sesion = await obtenerSesionActual({ forzarRecarga: true })
  if (!sesion) { pantallaLogin(); return }
  if (!ROLES_OK.includes(sesion.rol)) {
    await supabase.auth.signOut()
    pantallaLogin('Tu usuario no tiene permiso para repartir.')
    return
  }
  $('btn-salir').hidden = false
  $('nav').classList.remove('off')
  await cargar()
  mostrar('list')
}

// ---------- Eventos ----------
$('app').addEventListener('click', (e) => {
  const t = e.target
  if (t.closest('#entrar')) { entrar(); return }
  const tarjetaEl = t.closest('.order')
  if (tarjetaEl) { actual = tarjetaEl.dataset.id; mostrar('detail'); return }
  const ir = t.closest('[data-ir="detalle"]')
  if (ir) { actual = ir.dataset.id; mostrar('detail'); return }
  if (t.closest('#volver')) { mostrar('list'); return }
  const m = t.closest('[data-marcar]')
  if (m) { marcar(m.dataset.marcar); return }
  const nav = t.closest('.navbtn')
  if (nav) { mostrar(nav.dataset.tab) }
})

$('app').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.closest('.login')) entrar()
})

$('btn-salir').addEventListener('click', async () => {
  await supabase.auth.signOut()
  sesion = null
  pantallaLogin()
})

$('btn-tema').addEventListener('click', () => {
  const r = document.documentElement
  const oscuro = r.dataset.theme ? r.dataset.theme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches
  r.dataset.theme = oscuro ? 'light' : 'dark'
  $('btn-tema').textContent = oscuro ? '☼' : '☾'
})

setInterval(async () => {
  if (!sesion || ocupado || document.visibilityState !== 'visible') return
  if (await cargar()) repintar()
}, REFRESCO_MS)

iniciar()
