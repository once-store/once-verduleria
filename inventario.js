import {
  supabase,
  obtenerSesionActual,
  aplicarVisibilidadSidebarPorRol,
  renderizarSelectorLocal,
  obtenerLocalFiltroActivo
} from './sesion.js'

// --- Inventario: solo lectura. Todo sale de la vista `inventario_lotes`; la base ya filtra por local
// y oculta el costo a quien no es Dueño/Encargado. La pantalla solo agrupa y muestra. ---

const $ = id => document.getElementById(id)
const vista = $('vista-inventario')

let sesion = null
let lotes = []
let ubicacionActiva = 'todos'
let textoBusqueda = ''
const abiertos = new Set()

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

// ---------- carga ----------
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
      </div>`
  }).join('')

  return `<div class="inv-detalle"><p class="inv-detalle-titulo">DETALLE DE LOTES</p>${filas}</div>`
}

// ---------- eventos ----------
document.addEventListener('click', e => {
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

$('inv-buscar').addEventListener('input', e => {
  textoBusqueda = e.target.value
  dibujarTabla()
})

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
  cargar()
}
