import {
  supabase,
  obtenerSesionActual,
  aplicarVisibilidadSidebarPorRol,
  renderizarSelectorLocal,
  obtenerLocalFiltroActivo
} from './sesion.js'

// --- Inventario. Lectura: vista `inventario_lotes` (ya filtra por local y oculta el costo a Mostrador).
// Control de stock: solo Dueño y Encargado, vía la función de base `registrar_control_lote`
// (la base valida rol, local, stock vigente y motivo; la pantalla solo ayuda a cargar). ---

const $ = id => document.getElementById(id)
const vista = $('vista-inventario')

let sesion = null
let lotes = []
let ubicacionActiva = 'todos'
let textoBusqueda = ''
const abiertos = new Set()

// Control de stock
let modoControl = false
let taraCajon = 3
let tolerancia = 5
const controles = new Map() // lote_id -> { bruto, cajones, motivo }
let confirmando = false

// ---------- utilidades ----------
function escapar(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function normalizar(texto) {
  return String(texto ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

function fmtPrecio(n) {
  return `$${(Number(n) || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 })}`
}

function fmtCantidad(n) {
  return (Number(n) || 0).toLocaleString('es-AR', { maximumFractionDigits: 3 })
}

function redondear3(n) {
  return Math.round(n * 1000) / 1000
}

function unidad(tipo) {
  return tipo === 'peso' ? 'kg' : 'un.'
}

function textoTipo(tipo) {
  return tipo === 'peso' ? 'Por peso · kg' : 'Por unidad · un.'
}

function fmtFechaCorta(iso) {
  if (!iso) return '—'
  const [, m, d] = String(iso).split('-')
  return `${d}/${m}`
}

function esSalon(l) { return l.ubicacion === 'salon' }
function esDeposito(l) { return l.ubicacion === 'deposito' }

function textoUbicacion(l) {
  if (esSalon(l)) return 'Salón'
  if (esDeposito(l)) return 'Depósito'
  return escapar(l.ubicacion || 'Sin ubicación')
}

function mostrarError(mensaje) {
  const el = $('inv-error')
  el.textContent = mensaje
  el.classList.remove('oculto')
}

function mostrarOk(mensaje) {
  const el = $('inv-ok')
  if (!mensaje) { el.classList.add('oculto'); return }
  el.textContent = mensaje
  el.classList.remove('oculto')
}

function puedeControlar() {
  return sesion && (sesion.rol === 'dueno' || sesion.rol === 'encargado')
}

// Acepta "14,5" o "14.5". Devuelve null si está vacío o no es válido.
function leerNumero(texto) {
  const t = String(texto ?? '').trim().replace(',', '.')
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 ? n : null
}

// ---------- carga ----------
async function cargarConfiguracion() {
  const { data, error } = await supabase
    .from('configuracion').select('clave, valor')
    .in('clave', ['tara_cajon_kg', 'control_tolerancia_pct'])
  if (error || !data) return // se quedan los valores por defecto (3 kg y 5 %)
  for (const fila of data) {
    const n = Number(fila.valor)
    if (!Number.isFinite(n)) continue
    if (fila.clave === 'tara_cajon_kg') taraCajon = n
    if (fila.clave === 'control_tolerancia_pct') tolerancia = n
  }
}

async function cargar() {
  $('inv-error').classList.add('oculto')
  let consulta = supabase.from('inventario_lotes').select('*').order('producto').order('fecha_ingreso')
  // El filtro de local solo aplica al Dueño; los demás roles ya vienen limitados por la base.
  const filtro = sesion.rol === 'dueno' ? obtenerLocalFiltroActivo() : null
  if (filtro) consulta = consulta.eq('local_id', filtro)

  const { data, error } = await consulta
  if (error) {
    console.error(error)
    mostrarError(`No se pudo cargar el inventario: ${error.message}`)
    $('inv-kpis').innerHTML = ''
    return
  }
  lotes = data || []
  // Si un lote ya no existe (se agotó), se descarta lo que se había cargado para él.
  const vigentes = new Set(lotes.map(l => l.lote_id ?? l.id))
  for (const id of [...controles.keys()]) if (!vigentes.has(id)) controles.delete(id)
  dibujar()
}

// ---------- agrupar ----------
function agruparPorProducto(lista) {
  const mapa = new Map()
  for (const l of lista) {
    if (!mapa.has(l.producto_id)) {
      mapa.set(l.producto_id, { id: l.producto_id, nombre: l.producto, tipo: l.tipo, lotes: [] })
    }
    mapa.get(l.producto_id).lotes.push(l)
  }
  return [...mapa.values()]
}

function sumar(lista) {
  return lista.reduce((acc, l) => acc + (Number(l.cantidad_restante) || 0), 0)
}

function idLote(l) { return l.lote_id ?? l.id }

// ---------- dibujo ----------
function dibujar() {
  dibujarKpis()
  dibujarTabla()
  const hayCostos = lotes.some(l => l.costo_unitario !== null && l.costo_unitario !== undefined)
  $('inv-aviso-costos').classList.toggle('oculto', !hayCostos)
}

function dibujarKpis() {
  const productos = new Set(lotes.map(l => l.producto_id)).size
  const enSalon = lotes.filter(esSalon).length
  const enDeposito = lotes.filter(esDeposito).length
  const kpi = (icono, titulo, valor) => `
    <div class="inv-kpi">
      <span class="inv-kpi-icono"><i class="bi ${icono}"></i></span>
      <div><small>${titulo}</small><strong>${valor}</strong></div>
    </div>`
  $('inv-kpis').innerHTML = [
    kpi('bi-box-seam', 'Productos con stock', `${productos} ${productos === 1 ? 'producto' : 'productos'}`),
    kpi('bi-shop', 'Lotes en salón', `${enSalon} ${enSalon === 1 ? 'lote' : 'lotes'}`),
    kpi('bi-building', 'Lotes en depósito', `${enDeposito} ${enDeposito === 1 ? 'lote' : 'lotes'}`)
  ].join('')
}

function lotesVisibles() {
  const q = normalizar(textoBusqueda)
  return lotes.filter(l => {
    if (ubicacionActiva === 'salon' && !esSalon(l)) return false
    if (ubicacionActiva === 'deposito' && !esDeposito(l)) return false
    if (q && !normalizar(l.producto).includes(q)) return false
    return true
  })
}

function dibujarTabla() {
  const productos = agruparPorProducto(lotesVisibles())
  $('inv-contador').textContent = `${productos.length} ${productos.length === 1 ? 'producto' : 'productos'} con existencia`

  if (!productos.length) {
    $('inv-tabla').innerHTML = `<p class="inv-vacio">${
      lotes.length ? 'No hay productos que coincidan con la búsqueda.' : 'No hay stock cargado en este local.'
    }</p>`
    actualizarBarraControl()
    return
  }

  const filas = productos.map(p => {
    const u = unidad(p.tipo)
    const salon = p.lotes.filter(esSalon)
    const deposito = p.lotes.filter(esDeposito)
    const abierto = abiertos.has(p.id)
    return `
      <div class="inv-prod ${abierto ? 'abierto' : ''}">
        <button type="button" class="inv-prod-resumen" data-producto="${escapar(p.id)}" aria-expanded="${abierto}">
          <span class="inv-prod-nombre"><strong>${escapar(p.nombre)}</strong><small>${textoTipo(p.tipo)}</small></span>
          <strong>${fmtCantidad(sumar(p.lotes))} ${u}</strong>
          <span>${salon.length ? `${fmtCantidad(sumar(salon))} ${u}` : '—'}</span>
          <span>${deposito.length ? `${fmtCantidad(sumar(deposito))} ${u}` : '—'}</span>
          <span class="inv-muted">${p.lotes.length} ${p.lotes.length === 1 ? 'lote' : 'lotes'}</span>
          <span class="inv-chev"><i class="bi ${abierto ? 'bi-chevron-up' : 'bi-chevron-down'}"></i></span>
        </button>
        ${abierto ? dibujarDetalle(p) : ''}
      </div>`
  }).join('')

  $('inv-tabla').innerHTML = `
    <div class="inv-tabla-wrap">
      <div class="inv-fila-cabecera">
        <span>PRODUCTO</span><span>TOTAL</span><span>SALÓN</span><span>DEPÓSITO</span><span>LOTES</span><span></span>
      </div>
      ${filas}
    </div>`

  if (modoControl) {
    document.querySelectorAll('.inv-control').forEach(panel => actualizarPanel(panel.dataset.lote))
  }
  actualizarBarraControl()
}

function dibujarDetalle(p) {
  const u = unidad(p.tipo)
  const variosLocales = new Set(lotes.map(l => l.local_id)).size > 1
  const filas = p.lotes.map(l => {
    const conCosto = l.costo_unitario !== null && l.costo_unitario !== undefined
    const costo = Number(l.costo_unitario)
    const precio = Number(l.precio)
    const enOferta = l.precio_original !== null && l.precio_original !== undefined && Number(l.precio_original) > precio

    let columnaCosto = ''
    let columnaMargen = ''
    if (conCosto) {
      columnaCosto = `<div><small>COSTO</small>${fmtPrecio(costo)} / ${u}</div>`
      if (costo > 0) {
        const margen = Math.round(((precio - costo) / costo) * 100)
        const clase = margen < 0 ? 'inv-neg' : margen > 0 ? 'inv-pos' : 'inv-cero'
        const signo = margen < 0 ? '−' : margen > 0 ? '+' : ''
        columnaMargen = `<div><span class="inv-margen ${clase}">${signo}${Math.abs(margen)}%</span><small>Margen s/ costo</small></div>`
      } else {
        columnaMargen = '<div><span class="inv-margen inv-cero">—</span><small>Margen s/ costo</small></div>'
      }
    }

    const etiqueta = enOferta
      ? `<span class="inv-etiqueta inv-etiqueta-oferta">EN OFERTA</span><small>Precio regular: <span class="inv-tachado">${fmtPrecio(l.precio_original)} / ${u}</span></small>`
      : `<span class="inv-etiqueta inv-etiqueta-regular">REGULAR</span><small>Precio sin rebaja</small>`
    const estado = esSalon(l)
      ? '<span class="inv-estado">En venta</span>'
      : '<span class="inv-estado inv-estado-dep">No está en venta</span>'

    return `
      <div class="inv-lote ${conCosto ? '' : 'inv-sin-costo'}">
        <div><strong>${escapar(l.codigo)}</strong><small>${textoUbicacion(l)}${variosLocales ? ' · ' + escapar(l.local_nombre || 'Local') : ''} · ingresó ${fmtFechaCorta(l.fecha_ingreso)}</small></div>
        <div>${fmtCantidad(l.cantidad_restante)} ${u}<small>disponibles</small></div>
        ${columnaCosto}
        <div><small>PRECIO ACTUAL</small>${fmtPrecio(precio)} / ${u}</div>
        ${columnaMargen}
        <div>${etiqueta}${estado}</div>
        ${modoControl ? dibujarPanelControl(l, p.tipo) : ''}
      </div>`
  }).join('')

  return `<div class="inv-detalle"><p class="inv-detalle-titulo">DETALLE DE LOTES</p>${filas}</div>`
}

// ---------- control de stock ----------
function estadoControl(id) {
  if (!controles.has(id)) controles.set(id, { bruto: '', cajones: '1', motivo: '' })
  return controles.get(id)
}

function dibujarPanelControl(l, tipo) {
  const id = idLote(l)
  const est = estadoControl(id)
  const esPeso = tipo === 'peso'
  return `
    <div class="inv-control" data-lote="${escapar(id)}">
      <label>${esPeso ? 'PESO EN BALANZA (kg)' : 'CANTIDAD CONTADA (un.)'}
        <input type="text" inputmode="decimal" autocomplete="off" data-campo="bruto" value="${escapar(est.bruto)}">
      </label>
      ${esPeso ? `<label>CAJONES
        <input type="text" inputmode="numeric" autocomplete="off" data-campo="cajones" value="${escapar(est.cajones)}">
      </label>` : ''}
      <div class="inv-control-calc" data-calc="resumen"></div>
      <label data-bloque="motivo" hidden>MOTIVO
        <input type="text" autocomplete="off" maxlength="120" data-campo="motivo" value="${escapar(est.motivo)}">
      </label>
      <button type="button" class="inv-btn-confirmar" data-confirmar="${escapar(id)}" disabled>Confirmar</button>
      <p class="inv-control-error" data-calc="error"></p>
    </div>`
}

function buscarLote(id) {
  return lotes.find(l => idLote(l) === id)
}

// Cálculo en vivo. Es solo ayuda visual: la base vuelve a calcular y validar todo.
function calcular(l, est) {
  const bruto = leerNumero(est.bruto)
  if (bruto === null) return null
  const esPeso = l.tipo === 'peso'
  const cajones = esPeso ? (leerNumero(est.cajones) ?? 0) : 0
  const tara = esPeso ? redondear3(cajones * taraCajon) : 0
  const neto = redondear3(bruto - tara)
  const restante = Number(l.cantidad_restante)
  const dif = redondear3(neto - restante)
  const pct = restante > 0 ? (Math.abs(dif) / restante) * 100 : 0
  const pideMotivo = dif !== 0 && (dif > 0 || pct > tolerancia)
  const error = neto < 0 ? 'La tara es mayor que el peso.' : null
  const motivoOk = !pideMotivo || est.motivo.trim() !== ''
  return { bruto, cajones, tara, neto, dif, pct, pideMotivo, error, listo: !error && motivoOk }
}

function actualizarPanel(id) {
  const panel = document.querySelector(`.inv-control[data-lote="${CSS.escape(id)}"]`)
  const l = buscarLote(id)
  if (!panel || !l) return
  const est = estadoControl(id)
  const c = calcular(l, est)
  const u = unidad(l.tipo)
  const resumen = panel.querySelector('[data-calc="resumen"]')
  const bloqueMotivo = panel.querySelector('[data-bloque="motivo"]')
  const boton = panel.querySelector('[data-confirmar]')
  const error = panel.querySelector('[data-calc="error"]')

  if (!c) {
    resumen.innerHTML = `Sistema: <b>${fmtCantidad(l.cantidad_restante)} ${u}</b>`
    bloqueMotivo.hidden = true
    boton.disabled = true
    error.textContent = ''
    return
  }

  const clase = c.dif < 0 ? 'inv-dif-neg' : c.dif > 0 ? 'inv-dif-pos' : 'inv-dif-cero'
  const signo = c.dif < 0 ? '−' : c.dif > 0 ? '+' : ''
  const partes = [`Sistema: <b>${fmtCantidad(l.cantidad_restante)} ${u}</b>`]
  if (l.tipo === 'peso') partes.push(`Tara: <b>${fmtCantidad(c.tara)} kg</b>`)
  partes.push(`Contado: <b>${fmtCantidad(c.neto)} ${u}</b>`)
  partes.push(`Diferencia: <b class="${clase}">${signo}${fmtCantidad(Math.abs(c.dif))} ${u}${c.dif !== 0 ? ` (${c.pct.toLocaleString('es-AR', { maximumFractionDigits: 1 })}%)` : ''}</b>`)
  resumen.innerHTML = partes.join(' · ')

  bloqueMotivo.hidden = !c.pideMotivo
  boton.disabled = !c.listo || confirmando
  error.textContent = c.error || ''
}

function lotesListos() {
  const listos = []
  for (const l of lotes) {
    const est = controles.get(idLote(l))
    if (!est) continue
    const c = calcular(l, est)
    if (c && c.listo) listos.push({ l, c, est })
  }
  return listos
}

function actualizarBarraControl() {
  $('inv-control-barra').classList.toggle('oculto', !modoControl)
  const boton = $('inv-btn-control')
  boton.classList.toggle('activo', modoControl)
  boton.querySelector('span').textContent = modoControl ? 'Salir del control' : 'Hacer control'
  if (!modoControl) return
  const n = lotesListos().length
  $('inv-control-resumen').textContent = n
    ? `${n} ${n === 1 ? 'lote cargado' : 'lotes cargados'} para confirmar`
    : 'Cargá el peso de un lote para ver la diferencia.'
  $('inv-btn-confirmar-todos').disabled = n === 0 || confirmando
}

async function enviarControl(l, c, est) {
  const { error } = await supabase.rpc('registrar_control_lote', {
    p_lote_id: idLote(l),
    p_cantidad_vista: Number(l.cantidad_restante),
    p_peso_bruto: c.bruto,
    p_tara: c.tara,
    p_motivo: est.motivo.trim() || null
  })
  return error ? error.message : null
}

async function confirmarUno(id) {
  const l = buscarLote(id)
  if (!l || confirmando) return
  const c = calcular(l, estadoControl(id))
  if (!c || !c.listo) return
  confirmando = true
  mostrarOk('')
  const mensaje = await enviarControl(l, c, estadoControl(id))
  confirmando = false
  if (mensaje) {
    const panel = document.querySelector(`.inv-control[data-lote="${CSS.escape(id)}"]`)
    if (panel) panel.querySelector('[data-calc="error"]').textContent = mensaje
    if (mensaje.includes('cambió')) { controles.delete(id); await cargar() }
    actualizarBarraControl()
    return
  }
  controles.delete(id)
  mostrarOk(`Control guardado: ${l.codigo} ${c.dif === 0 ? 'sin diferencia' : `ajustado ${c.dif > 0 ? '+' : '−'}${fmtCantidad(Math.abs(c.dif))} ${unidad(l.tipo)}`}.`)
  await cargar()
}

async function confirmarTodos() {
  if (confirmando) return
  const listos = lotesListos()
  if (!listos.length) return
  confirmando = true
  $('inv-btn-confirmar-todos').disabled = true
  mostrarOk('')
  const resultados = []
  for (const { l, c, est } of listos) {
    const mensaje = await enviarControl(l, c, est)
    if (mensaje) {
      resultados.push(`${l.codigo}: no se guardó (${mensaje})`)
      if (mensaje.includes('cambió')) controles.delete(idLote(l))
    } else {
      controles.delete(idLote(l))
      resultados.push(`${l.codigo}: ${c.dif === 0 ? 'sin diferencia' : `ajustado ${c.dif > 0 ? '+' : '−'}${fmtCantidad(Math.abs(c.dif))} ${unidad(l.tipo)}`}`)
    }
  }
  confirmando = false
  mostrarOk(`Resultado del control:\n${resultados.join('\n')}`)
  await cargar()
}

function alternarControl() {
  modoControl = !modoControl
  mostrarOk('')
  if (modoControl) {
    // Se abren todos los productos para ver sus lotes.
    for (const p of agruparPorProducto(lotesVisibles())) abiertos.add(p.id)
  }
  dibujarTabla()
}

// ---------- eventos ----------
document.addEventListener('click', e => {
  const confirmar = e.target.closest('[data-confirmar]')
  if (confirmar) { confirmarUno(confirmar.dataset.confirmar); return }

  const fila = e.target.closest('[data-producto]')
  if (fila) {
    const id = fila.dataset.producto
    if (abiertos.has(id)) abiertos.delete(id)
    else abiertos.add(id)
    dibujarTabla()
    return
  }
  const filtro = e.target.closest('[data-ubicacion]')
  if (filtro) {
    ubicacionActiva = filtro.dataset.ubicacion
    document.querySelectorAll('.inv-filtro-btn').forEach(b => b.classList.toggle('activa', b === filtro))
    dibujarTabla()
  }
})

// Se actualiza solo el panel que se está tocando, para no perder el foco del campo.
document.addEventListener('input', e => {
  const campo = e.target.dataset?.campo
  const panel = e.target.closest?.('.inv-control')
  if (!campo || !panel) return
  estadoControl(panel.dataset.lote)[campo] = e.target.value
  actualizarPanel(panel.dataset.lote)
  actualizarBarraControl()
})

$('inv-buscar').addEventListener('input', e => {
  textoBusqueda = e.target.value
  dibujarTabla()
})

$('inv-btn-control').addEventListener('click', alternarControl)
$('inv-btn-confirmar-todos').addEventListener('click', confirmarTodos)

$('btn-salir').addEventListener('click', async () => {
  await supabase.auth.signOut()
  window.location.href = 'admin-v2.html'
})

// ---------- arranque ----------
sesion = await obtenerSesionActual({ forzarRecarga: true })
if (!sesion || !sesion.rol) {
  window.location.href = 'admin-v2.html'
} else {
  aplicarVisibilidadSidebarPorRol(sesion.rol)
  vista.classList.remove('oculto')
  renderizarSelectorLocal($('contenedor-selector-local'), sesion.rol)
  if (puedeControlar()) {
    $('inv-btn-control').classList.remove('oculto')
    await cargarConfiguracion()
  }
  cargar()
}
