import { supabase, obtenerSesionActual } from './sesion.js'

// Pantalla del repartidor. Lee la lista con `obtener_para_repartir` y marca cada entrega con
// `marcar_entrega` (la base decide el estado y, en efectivo, pasa el pedido a "pagado" recién al
// entregar). El cierre del día usa `obtener_entregas_hoy`.
const ROLES_OK = ['dueno', 'encargado', 'mostrador']
const REFRESCO_MS = 15000

const $ = (id) => document.getElementById(id)
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const num = (v) => Number(v) || 0
const miles = (n) => new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(num(n))
const money = (n) => '$' + miles(n)
// Precio "de feria": el signo $ chico y levantado, cifras grandes.
const peso = (n) => `<span class="m"><span class="cur">$</span>${miles(n)}</span>`
const cant = (it) => `${num(it.cantidad).toLocaleString('es-AR')} ${it.tipo === 'peso' ? 'kg' : 'un.'}`
const icono = (id) => `<svg class="i" aria-hidden="true"><use href="#i-${id}"/></svg>`

let pedidos = []
let hoy = null // null = todavía no cargó; [] = sin entregas; 'error' = función no disponible
let actual = null
let tab = 'list'
let ocupado = false
let sesion = null
let ultimaCarga = null
// Mapa (se carga recién al abrir la pestaña Mapa)
let local = null // { lat, lng } del local, para que el recorrido salga de ahí
let tokenMapa = null // token público de Mapbox; se lee de la base al entrar, no está en ningún archivo
let mapaCtl = null
let mapaEstado = 'sin-iniciar' // 'cargando' | 'ok' | 'error'
let rutaInfo = null
let seleccion = null // pedido elegido tocando un marcador

// ---------- Datos ----------
function cobro(p) {
  const ef = num(p.monto_efectivo)
  const tr = num(p.monto_transferencia)
  if (p.estado === 'pendiente_efectivo') return { ef: ef || num(p.monto_total), tr: 0 }
  if (p.estado === 'pendiente_transferencia') return { ef: 0, tr: tr || num(p.monto_total) }
  if (p.estado === 'pendiente_combinado') return { ef, tr }
  return { ef: 0, tr: 0 }
}
const totalCobro = (p) => { const c = cobro(p); return c.ef + c.tr }

function textoCobro(p) {
  const c = cobro(p)
  if (c.ef && c.tr) return `${money(c.ef)} en efectivo + ${money(c.tr)} por transferencia`
  if (c.ef) return 'En efectivo'
  return 'Por transferencia'
}

const telefonoLimpio = (p) => {
  const d = String(p.telefono_contacto || '').replace(/\D/g, '')
  return d.length === 10 ? d : null
}
const tieneMapa = (p) => p.lat !== null && p.lat !== undefined && p.lng !== null && p.lng !== undefined && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng))
const mapaGoogle = (p) => (tieneMapa(p) ? `https://www.google.com/maps/dir/?api=1&destination=${Number(p.lat)},${Number(p.lng)}&travelmode=driving` : null)
const mapaWaze = (p) => (tieneMapa(p) ? `https://waze.com/ul?ll=${Number(p.lat)},${Number(p.lng)}&navigate=yes` : null)

const enCamino = (p) => p.entrega_estado === 'en_camino'
const siguiente = () => pedidos.find(enCamino) || pedidos[0] || null
const lugar = (p) => p.referencia || 'Ubicación en el mapa'

async function cargar() {
  const { data, error } = await supabase.rpc('obtener_para_repartir')
  if (error) {
    toast('No se pudo actualizar la lista: ' + error.message)
    return false
  }
  pedidos = Array.isArray(data) ? data : []
  ultimaCarga = new Date()

  const r = await supabase.rpc('obtener_entregas_hoy')
  hoy = r.error ? 'error' : (Array.isArray(r.data) ? r.data : [])
  return true
}

async function cargarTokenMapa() {
  const { data, error } = await supabase.rpc('obtener_token_mapa')
  tokenMapa = !error && typeof data === 'string' ? data : null
}

async function cargarLocal() {
  const { data, error } = await supabase.from('locales').select('latitud, longitud').not('latitud', 'is', null).not('longitud', 'is', null).order('creado_en').limit(1)
  if (!error && data && data.length) local = { lat: Number(data[0].latitud), lng: Number(data[0].longitud) }
}

function hora(d) {
  return d ? d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }) : ''
}

// ---------- Pantallas ----------
function fila(p, i) {
  const esSig = p === siguiente()
  const cobrar = totalCobro(p) > 0
  const estado = p.entrega_estado === 'no_entregado'
    ? '<span class="status warn">No se pudo entregar</span>'
    : cobrar
      ? `<span class="status cobrar">Cobrar ${esc(money(totalCobro(p)))}</span>`
      : '<span class="status">Pagado</span>'
  const productos = (p.items || []).slice(0, 3).map((x) => esc(x.nombre)).join(', ')
  const mas = (p.items || []).length > 3 ? ` y ${p.items.length - 3} más` : ''
  return `<button class="order ${esSig ? 'cur' : ''}" data-id="${esc(p.pedido_id)}">
    <span class="stop ${p.entrega_estado === 'no_entregado' ? 'issue' : ''}">${i + 1}</span>
    <span class="who"><span class="num">#${esc(p.numero_corto)}${enCamino(p) ? '<span class="chip">En camino</span>' : esSig ? '<span class="chip">Siguiente</span>' : ''}</span>
      <span class="ref" style="display:-webkit-box">${esc(lugar(p))}</span>
      <span class="items" style="display:block">${productos}${mas}</span></span>
    <span class="right">${peso(p.monto_total)}${estado}</span>
  </button>`
}

function pintarLista() {
  const porCobrar = pedidos.reduce((a, p) => a + totalCobro(p), 0)
  $('screen-list').innerHTML = pedidos.length
    ? `<div class="strip"><span><b>${pedidos.length}</b> ${pedidos.length === 1 ? 'pedido para entregar' : 'pedidos para entregar'}</span><span>Por cobrar ${peso(porCobrar)}</span></div>
       <div class="rows">${pedidos.map(fila).join('')}</div>
       <p class="fresh">Actualizado a las ${esc(hora(ultimaCarga))} · se renueva solo</p>`
    : `<div class="empty"><b>No hay pedidos para repartir</b>Cuando armes un pedido de WhatsApp con delivery y esté listo para salir, aparece acá. Los pedidos con pago pendiente en efectivo aparecen con el monto a cobrar.</div>
       <p class="fresh">Actualizado a las ${esc(hora(ultimaCarga))}</p>`
}

function botonesMapa(p) {
  const g = mapaGoogle(p)
  const w = mapaWaze(p)
  return `<a class="btn ${g ? '' : 'off'}" ${g ? `href="${esc(g)}" target="_blank" rel="noopener"` : 'aria-disabled="true"'}>${icono('ext')}Abrir en Google Maps</a>
    <a class="btn line ${w ? '' : 'off'}" ${w ? `href="${esc(w)}" target="_blank" rel="noopener"` : 'aria-disabled="true"'}>${icono('ext')}Abrir en Waze</a>`
}

const tokenValido = () => typeof tokenMapa === 'string' && /^pk\./.test(tokenMapa)
const esOscuro = () => (document.documentElement.dataset.theme
  ? document.documentElement.dataset.theme === 'dark'
  : window.matchMedia('(prefers-color-scheme: dark)').matches)

function avisoMapa(texto) {
  const el = $('mapa-aviso')
  if (!el) return
  el.textContent = texto
  el.hidden = !texto
}

function paradasConMapa() {
  return pedidos.map((p, i) => ({ id: p.pedido_id, numero: i + 1, lat: Number(p.lat), lng: Number(p.lng), sig: p === siguiente(), ok: tieneMapa(p) })).filter((x) => x.ok)
}

function actualizarMapa() {
  if (!mapaCtl) return
  const elegido = pedidos.find((x) => x.pedido_id === seleccion) || siguiente()
  mapaCtl.actualizar({ local, paradas: paradasConMapa(), seleccionada: elegido ? elegido.pedido_id : null })
}

async function asegurarMapa() {
  if (mapaEstado !== 'sin-iniciar') return
  if (!tokenValido()) {
    mapaEstado = 'error'
    avisoMapa('El mapa todavía no está activado. Mientras tanto, usá los botones de Google Maps y Waze.')
    return
  }
  mapaEstado = 'cargando'
  avisoMapa('Cargando mapa…')
  try {
    const { crearMapa } = await import('./mapa-reparto.js')
    mapaCtl = await crearMapa($('mapa'), {
      token: tokenMapa,
      oscuro: esOscuro(),
      onSeleccionar: (id) => { seleccion = id; pintarSiguiente() },
      onRuta: (r) => { rutaInfo = r; pintarPanelMapa() },
      onError: (m) => toast(m),
    })
    mapaEstado = 'ok'
    avisoMapa('')
    actualizarMapa()
  } catch (e) {
    mapaEstado = 'error'
    avisoMapa('No se pudo cargar el mapa: ' + e.message + '. Usá los botones de Google Maps y Waze.')
  }
}

function pintarPanelMapa() {
  const panel = $('mapa-panel')
  if (!panel) return
  const p = pedidos.find((x) => x.pedido_id === seleccion) || siguiente()
  if (!p) {
    panel.innerHTML = '<div class="empty"><b>Vuelta terminada</b>No quedan pedidos para entregar. Si entra uno nuevo, aparece acá.</div>'
    return
  }
  const sinUbicacion = pedidos.length - paradasConMapa().length
  const info = rutaInfo && !rutaInfo.aprox
    ? `Recorrido completo: ${rutaInfo.km.toLocaleString('es-AR', { maximumFractionDigits: 1 })} km · unos ${Math.max(1, Math.round(rutaInfo.min))} min de manejo`
    : rutaInfo && rutaInfo.aprox ? 'Recorrido aproximado: no se pudo trazar por las calles' : ''
  panel.innerHTML = `
    ${info ? `<p class="ruta-info">${esc(info)}</p>` : ''}
    <div class="next-card">
      <span class="stop" style="background:var(--accent);border-color:var(--accent);color:var(--on-accent)">${pedidos.indexOf(p) + 1}</span>
      <span class="who"><span class="num">Pedido #${esc(p.numero_corto)}</span><span class="ref" style="display:-webkit-box">${esc(lugar(p))}</span></span>
      <span class="right">${peso(p.monto_total)}</span>
    </div>
    ${totalCobro(p) ? `<div class="cobrar-box"><span>Cobrar al entregar · ${esc(textoCobro(p))}</span>${peso(totalCobro(p))}</div>` : '<div class="paid-box">' + icono('check') + 'Ya está pagado</div>'}
    <div class="next-actions">
      ${botonesMapa(p)}
      <button class="btn line" data-id="${esc(p.pedido_id)}" data-ir="detalle">Ver el pedido</button>
    </div>
    ${sinUbicacion ? `<p class="note">${sinUbicacion === 1 ? '1 pedido no tiene ubicación' : sinUbicacion + ' pedidos no tienen ubicación'} y no se ve en el mapa (el cliente escribió la dirección). Está en la lista.</p>` : ''}
    <p class="note">El orden de las paradas es el de llegada de los pedidos. Tocá un número en el mapa para ver ese pedido.</p>`
}

function pintarSiguiente() {
  if (!$('mapa-panel')) {
    $('screen-next').innerHTML = '<div class="mapa-wrap"><div id="mapa" class="mapa" role="region" aria-label="Mapa de la vuelta"></div><div id="mapa-aviso" class="mapa-aviso" hidden></div></div><div id="mapa-panel"></div>'
    if (mapaEstado === 'error' || mapaEstado === 'cargando') mapaEstado = 'sin-iniciar'
  }
  pintarPanelMapa()
  asegurarMapa()
  actualizarMapa()
}

function pintarDetalle() {
  const p = pedidos.find((x) => x.pedido_id === actual)
  if (!p) { mostrar('list'); return }
  const tel = telefonoLimpio(p)
  const total = totalCobro(p)
  const estadoTxt = enCamino(p) ? 'En camino' : p.entrega_estado === 'no_entregado' ? 'No se pudo entregar la última vez' : 'Todavía no salió'
  $('screen-detail').innerHTML = `
    <button class="back" id="volver">${icono('back')}Volver a la lista</button>
    <div class="head">
      <span class="stop ${p.entrega_estado === 'no_entregado' ? 'issue' : ''}">${pedidos.indexOf(p) + 1}</span>
      <span class="who"><span class="num">#${esc(p.numero_corto)}</span><span class="items" style="display:block">${esc(estadoTxt)}</span></span>
      <span class="right">${peso(p.monto_total)}</span>
    </div>
    ${total
      ? `<div class="cobrar-box" style="margin-top:0"><span>Cobrar al entregar · ${esc(textoCobro(p))}</span>${peso(total)}</div>`
      : `<div class="paid-box" style="margin-top:0">${icono('check')}Ya está pagado, no cobres nada</div>`}
    <div class="where">${icono('pin')}<div><b>${esc(lugar(p))}</b><small>La Rioja${num(p.costo_envio) ? ` · envío ${esc(money(p.costo_envio))} incluido` : ''}</small></div></div>
    <div class="block"><div class="pair" style="margin-top:2px">
      <a class="btn ${mapaGoogle(p) ? '' : 'off'}" ${mapaGoogle(p) ? `href="${esc(mapaGoogle(p))}" target="_blank" rel="noopener"` : 'aria-disabled="true"'}>${icono('ext')}Maps</a>
      <a class="btn line ${mapaWaze(p) ? '' : 'off'}" ${mapaWaze(p) ? `href="${esc(mapaWaze(p))}" target="_blank" rel="noopener"` : 'aria-disabled="true"'}>${icono('ext')}Waze</a></div></div>
    <div class="block"><h3>${(p.items || []).length === 1 ? '1 producto' : (p.items || []).length + ' productos'}</h3>
      ${(p.items || []).map((x) => `<div class="line-item"><span>${esc(x.nombre)}</span><span>${esc(cant(x))}</span></div>`).join('')}
      ${num(p.costo_envio) ? `<div class="line-item"><span>Envío</span><span>${esc(money(p.costo_envio))}</span></div>` : ''}
      <div class="total"><span>Total del pedido</span>${peso(p.monto_total)}</div></div>
    <div class="contact pair">
      <a class="btn line ${tel ? '' : 'off'}" ${tel ? `href="tel:+549${tel}"` : 'aria-disabled="true"'}>${icono('phone')}Llamar</a>
      <a class="btn line ${tel ? '' : 'off'}" ${tel ? `href="https://wa.me/549${tel}" target="_blank" rel="noopener"` : 'aria-disabled="true"'}>${icono('chat')}WhatsApp</a>
    </div>
    ${tel ? '' : '<p class="note">Este cliente no dejó un teléfono de contacto. Escribile desde el chat del bot.</p>'}
    <div class="actionbar">
      <button class="btn" data-marcar="entregado">${icono('check')}Entregado${total ? ' y cobré ' + esc(money(total)) : ''}</button>
      <div class="pair">
        ${enCamino(p) ? '<span></span>' : `<button class="btn line" data-marcar="en_camino">${icono('moto')}Salí</button>`}
        <button class="btn danger" data-marcar="no_entregado">No estaba</button>
      </div>
    </div>`
}

function pintarCierre() {
  if (hoy === 'error') {
    $('screen-close').innerHTML = '<div class="empty"><b>Resumen del día no disponible</b>No se pudo leer el resumen de hoy. Probá de nuevo en un rato.</div>'
    return
  }
  const lista = hoy || []
  const hechas = lista.filter((e) => e.entrega_estado === 'entregado')
  const abiertas = lista.filter((e) => e.entrega_estado === 'pendiente' || e.entrega_estado === 'en_camino')
  const problemas = lista.filter((e) => e.entrega_estado === 'no_entregado')
  const efectivo = hechas.filter((e) => ['efectivo', 'combinado'].includes(e.metodo_pago)).reduce((a, e) => a + num(e.monto_efectivo), 0)
  const transf = hechas.filter((e) => String(e.estado).startsWith('pendiente')).reduce((a, e) => a + num(e.monto_transferencia), 0)
  const parte = hechas.reduce((a, e) => a + num(e.pago_repartidor), 0)
  $('screen-close').innerHTML = lista.length
    ? `<dl class="ledger">
        <div class="key"><dt>Efectivo para entregar en caja</dt><dd>${peso(efectivo)}</dd></div>
        <div><dt>Entregas hechas</dt><dd>${hechas.length} de ${lista.length}</dd></div>
        <div><dt>Pendientes</dt><dd>${abiertas.length}</dd></div>
        <div><dt>Con problema</dt><dd>${problemas.length}</dd></div>
        <div><dt>Transferencias por confirmar</dt><dd>${peso(transf)}</dd></div>
        <div><dt>Tu parte de los envíos</dt><dd>${peso(parte)}</dd></div>
      </dl>
      <p class="note">El efectivo cobrado se entrega en la caja del local. Las transferencias las confirma el local en el panel.</p>`
    : '<div class="empty"><b>Todavía no hay entregas hoy</b>Cuando entregues el primer pedido, acá ves el efectivo que tenés que dejar en caja y lo que te corresponde por los envíos.</div>'
}

const TITULOS = { login: 'Reparto', list: 'Para repartir', next: 'Mapa', detail: 'Entrega', close: 'Cierre del día' }

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
  if (pantalla === 'next' && mapaCtl) setTimeout(() => mapaCtl.redimensionar(), 0)
  $('main').scrollTop = 0
}

function repintar() {
  const y = $('main').scrollTop
  if (tab === 'list') pintarLista()
  else if (tab === 'next') pintarSiguiente()
  else if (tab === 'detail') pintarDetalle()
  else if (tab === 'close') pintarCierre()
  $('main').scrollTop = y
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
  const total = totalCobro(p)
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
    <div class="login"><h2>Entrar al reparto</h2><p>Usá el mismo correo y contraseña del panel de once.</p>
      <label for="correo">Correo</label><input id="correo" type="email" autocomplete="username" inputmode="email">
      <label for="clave">Contraseña</label><input id="clave" type="password" autocomplete="current-password">
      <button class="btn" id="entrar">Entrar</button><div class="err" id="login-error" role="alert">${esc(mensaje)}</div></div>`
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
  await cargarLocal()
  await cargarTokenMapa()
  await cargar()
  mostrar('list')
}

// ---------- Eventos ----------
$('app').addEventListener('click', (e) => {
  const t = e.target
  if (t.closest('#entrar')) { entrar(); return }
  const filaEl = t.closest('.order')
  if (filaEl) { actual = filaEl.dataset.id; mostrar('detail'); return }
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

function iconoTema(oscuro) {
  $('btn-tema').innerHTML = icono(oscuro ? 'sun' : 'moon')
}
iconoTema(document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && window.matchMedia('(prefers-color-scheme: dark)').matches))

$('btn-tema').addEventListener('click', () => {
  const r = document.documentElement
  const oscuro = r.dataset.theme ? r.dataset.theme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches
  r.dataset.theme = oscuro ? 'light' : 'dark'
  iconoTema(!oscuro)
  if (mapaCtl) mapaCtl.setOscuro(!oscuro)
})

setInterval(async () => {
  if (!sesion || ocupado || document.visibilityState !== 'visible') return
  if (await cargar()) repintar()
}, REFRESCO_MS)

iniciar()
