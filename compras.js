import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = 'https://meekevxxjirvgsuppvij.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1lZWtldnh4amlydmdzdXBwdmlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU1MjQwMjMsImV4cCI6MjEwMTEwMDAyM30.MGajznwLTreSKal-1-aFcYsEHTTGC6geruLvRryQ88M'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

const vistaCompras = document.getElementById('vista-compras')

// Esta página vive protegida por la sesión que ya abriste en admin-v2.html.
// Si entrás acá directo sin haber iniciado sesión, te manda de vuelta.
const { data: { session } } = await supabase.auth.getSession()
if (!session) {
  window.location.href = 'admin-v2.html'
} else {
  vistaCompras.classList.remove('oculto')
  cargarProductosParaCompraYMerma()
}

function formatoMoneda(n) {
  return '$' + Math.round(n).toLocaleString('es-AR')
}

document.getElementById('btn-salir').addEventListener('click', async () => {
  await supabase.auth.signOut()
  window.location.href = 'admin-v2.html'
})

// --- Pestañas ---
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('activa'))
    btn.classList.add('activa')
    document.getElementById('panel-compra').classList.toggle('oculto', btn.dataset.tab !== 'compra')
    document.getElementById('panel-merma').classList.toggle('oculto', btn.dataset.tab !== 'merma')
    document.getElementById('panel-deposito').classList.toggle('oculto', btn.dataset.tab !== 'deposito')
    document.getElementById('panel-maduracion').classList.toggle('oculto', btn.dataset.tab !== 'maduracion')
    document.getElementById('panel-precio').classList.toggle('oculto', btn.dataset.tab !== 'precio')
    if (btn.dataset.tab === 'deposito') cargarDeposito()
    if (btn.dataset.tab === 'maduracion') cargarMaduracion()
    if (btn.dataset.tab === 'precio') cargarLotesParaPrecio()
  })
})

// --- Estado del producto al llegar (select, dentro de la fila) ---
const elEstado = document.getElementById('compra-estado')

function resetearMadurez() {
  elEstado.value = '0'
}

const elUbicacion = document.getElementById('compra-ubicacion')

// --- Cajones: una compra puede venir repartida en más de un cajón físico.
// Cada cajón tiene su propio peso bruto (lo que lees en la balanza) y una
// tara (el peso del cajón vacío, 3kg por defecto para uno de madera) — el
// neto se calcula solo y es lo que se usa como cantidad real del lote.
// Para productos por unidad (no por peso) no hay tara: cantidad = bruto. ---
let cajones = [{ bruto: null, tara: 3 }]
const elCantCajones = document.getElementById('cant-cajones')
const elPesosCajones = document.getElementById('pesos-cajones')
const elBloqueCajones = document.getElementById('bloque-cajones')
const elCompraCantidadOut = document.getElementById('compra-cantidad-out')

function esPorPeso() {
  const p = productoSeleccionado(selectCompraProducto.value)
  return p?.tipo === 'peso'
}

function cantidadNeta() {
  const pres = presentacionSeleccionada()
  if (pres) {
    const cant = Number(document.getElementById('compra-cantidad-presentacion').value) || 0
    return cant * Number(pres.cantidad_unidades)
  }
  return cajones.reduce((acc, c) => {
    const bruto = Number(c.bruto) || 0
    const tara = esPorPeso() ? (Number(c.tara) || 0) : 0
    return acc + Math.max(0, bruto - tara)
  }, 0)
}

function renderCajones() {
  elCantCajones.textContent = cajones.length
  const porPeso = esPorPeso()

  elPesosCajones.innerHTML = cajones.map((c, i) => `
    <div class="fila-cajon-detalle">
      <span>Cajón ${i + 1}</span>
      <div>
        <label>${porPeso ? 'Bruto (kg)' : 'Cantidad'}</label>
        <input type="number" min="0" step="0.01" inputmode="decimal" class="input-bruto-cajon" data-i="${i}" value="${c.bruto ?? ''}">
      </div>
      ${porPeso ? `
      <div>
        <label>Tara (kg)</label>
        <input type="number" min="0" step="0.1" inputmode="decimal" class="input-tara-cajon" data-i="${i}" value="${c.tara ?? 0}">
      </div>
      <div>
        <label>Neto</label>
        <div style="font-weight:700; padding:8px 0;">${Math.max(0, (Number(c.bruto) || 0) - (Number(c.tara) || 0))} kg</div>
      </div>` : '<div></div><div></div>'}
    </div>
  `).join('')

  elPesosCajones.querySelectorAll('.input-bruto-cajon').forEach(inp => {
    inp.addEventListener('input', () => {
      cajones[Number(inp.dataset.i)].bruto = inp.value === '' ? null : Number(inp.value)
      renderCajones()
      actualizarCantidadYPvu()
    })
  })
  elPesosCajones.querySelectorAll('.input-tara-cajon').forEach(inp => {
    inp.addEventListener('input', () => {
      cajones[Number(inp.dataset.i)].tara = inp.value === '' ? 0 : Number(inp.value)
      renderCajones()
      actualizarCantidadYPvu()
    })
  })

  elCompraCantidadOut.textContent = `${cantidadNeta()} ${porPeso ? 'kg' : 'u'}`
}

document.getElementById('btn-agregar-cajon').addEventListener('click', () => {
  if (cajones.length >= 12) return
  cajones.push({ bruto: null, tara: esPorPeso() ? 3 : 0 })
  renderCajones()
})

document.getElementById('btn-toggle-cajones').addEventListener('click', () => {
  elBloqueCajones.classList.toggle('oculto')
})

function resetearCajones() {
  cajones = [{ bruto: null, tara: esPorPeso() ? 3 : 0 }]
  elBloqueCajones.classList.add('oculto')
  renderCajones()
}

// --- Resumen de lo cargado en esta compra/boleta (se pierde al recargar la
// página o al tocar "Finalizar esta compra"; es para no perder el hilo
// mientras cargás muchos productos seguidos de un mismo remito) ---
let comprasSesion = []
const elResumenSesion = document.getElementById('resumen-sesion-compra')
const elListaSesion = document.getElementById('lista-sesion-compra')
const elTotalSesion = document.getElementById('total-sesion-compra')
const btnFinalizarCarga = document.getElementById('btn-finalizar-carga')

function renderComprasSesion() {
  if (comprasSesion.length === 0) {
    elResumenSesion.classList.add('oculto')
    return
  }
  elResumenSesion.classList.remove('oculto')
  elListaSesion.innerHTML = comprasSesion.map((c, i) => `
    <div class="t-fila" style="display:flex; justify-content:space-between; align-items:baseline; padding:6px 0; border-bottom:1px solid var(--borde);">
      <span>
        <strong>${i + 1}.</strong> ${c.nombre} — ${c.cantidad} ${c.unidad}
        <br><span class="muted" style="font-size:13px;">${formatoMoneda(c.costoUnitario)} por ${c.unidad === 'kg' ? 'kilo' : 'unidad'}</span>
        ${c.codigos ? c.codigos.map(cod => `<div class="codigo-cajon">L${cod.numeroGuia} · ${cod.codigoLote} (${cod.peso} ${c.unidad})</div>`).join('') : ''}
      </span>
      <span style="font-weight:700;">${formatoMoneda(c.costoTotal)}</span>
    </div>
  `).join('')
  const total = comprasSesion.reduce((acc, c) => acc + c.costoTotal, 0)
  elTotalSesion.textContent = formatoMoneda(total)
}

btnFinalizarCarga.addEventListener('click', () => {
  if (!confirm(`¿Cerrar esta compra con ${comprasSesion.length} producto(s) por un total de ${elTotalSesion.textContent}?`)) return
  comprasSesion = []
  selectCompraProveedor.value = ''
  desbloquearProveedor()
  renderComprasSesion()
})

// --- Productos (compartido entre compra y merma) ---
let productosCompraMerma = []
let presentacionesCompra = []

const selectCompraProducto = document.getElementById('compra-producto')
const selectMermaProducto = document.getElementById('merma-producto')
const elCompraStockActual = document.getElementById('compra-stock-actual')
const elCompraMargen = document.getElementById('compra-margen')
const elCompraError = document.getElementById('compra-error')
const elMermaError = document.getElementById('merma-error')
const elLabelPresentacion = document.getElementById('label-compra-presentacion')
const elSelectPresentacion = document.getElementById('compra-presentacion')
const elCantidadPresentacion = document.getElementById('compra-cantidad-presentacion')

async function cargarProductosParaCompraYMerma() {
  const { data, error } = await supabase
    .from('productos')
    .select('id, nombre, tipo, precio, margen_objetivo_pct')
    .order('nombre')

  if (error) {
    console.error(error)
    return
  }

  productosCompraMerma = data
  const opciones = data.map(p => `<option value="${p.id}">${p.nombre}</option>`).join('')
  selectCompraProducto.innerHTML = opciones
  selectMermaProducto.innerHTML = opciones
  document.getElementById('precio-producto').innerHTML = opciones

  const { data: presentaciones, error: errorPresentaciones } = await supabase
    .from('presentaciones')
    .select('id, producto_id, nombre, cantidad_unidades')
    .eq('usar_en_compra', true)
    .eq('activa', true)
    .order('orden')

  if (errorPresentaciones) {
    console.error(errorPresentaciones)
  } else {
    presentacionesCompra = presentaciones
  }

  actualizarInfoProductoCompra()
}

function productoSeleccionado(id) {
  return productosCompraMerma.find(p => p.id === id)
}

// Si el producto elegido tiene presentaciones de compra (ej. Huevo por Maple
// o Cajón), muestra el selector "Comprás en" con su propio campo de cantidad,
// y esconde el desglose de cajones (bruto/tara no aplica: el tamaño de la
// presentación ya es un dato fijo y conocido).
function actualizarSelectorPresentacion(productoId) {
  const opciones = presentacionesCompra.filter(pr => pr.producto_id === productoId)

  if (opciones.length === 0) {
    elLabelPresentacion.classList.add('oculto')
    elSelectPresentacion.innerHTML = ''
    return
  }

  elSelectPresentacion.innerHTML = ['<option value="">Unidad suelta</option>']
    .concat(opciones.map(pr => `<option value="${pr.id}" data-cantidad="${pr.cantidad_unidades}">${pr.nombre} (${pr.cantidad_unidades})</option>`))
    .join('')
  elLabelPresentacion.classList.remove('oculto')
  actualizarModoPresentacion()
}

function presentacionSeleccionada() {
  return presentacionesCompra.find(pr => pr.id === elSelectPresentacion.value)
}

function actualizarModoPresentacion() {
  const pres = presentacionSeleccionada()
  if (pres) elBloqueCajones.classList.add('oculto')
  resetearCajones()
  actualizarCantidadYPvu()
}

elSelectPresentacion.addEventListener('change', actualizarModoPresentacion)
elCantidadPresentacion.addEventListener('input', actualizarCantidadYPvu)

// Stock vendible actual del producto elegido (suma de sus lotes en salón)
async function actualizarInfoProductoCompra() {
  const p = productoSeleccionado(selectCompraProducto.value)
  if (!p) return

  elCompraMargen.value = p.margen_objetivo_pct ?? ''
  actualizarSelectorPresentacion(p.id)
  resetearCajones()
  actualizarCantidadYPvu()

  const { data, error } = await supabase
    .from('lotes')
    .select('cantidad_restante')
    .eq('producto_id', p.id)
    .eq('ubicacion', 'salon')
    .gt('cantidad_restante', 0)

  if (error) {
    console.error(error)
    return
  }

  const total = data.reduce((a, l) => a + Number(l.cantidad_restante), 0)
  const unidad = p.tipo === 'peso' ? 'kg' : 'unidades'
  elCompraStockActual.textContent = `En salón: ${total} ${unidad}`
  elCompraStockActual.classList.remove('oculto')
}

selectCompraProducto.addEventListener('change', actualizarInfoProductoCompra)

// --- Alta de producto nuevo, sin salir de esta pantalla ---
const elFormNuevoProducto = document.getElementById('form-nuevo-producto')
const elNuevoProductoError = document.getElementById('nuevo-producto-error')

document.getElementById('btn-mostrar-nuevo-producto').addEventListener('click', () => {
  elFormNuevoProducto.classList.remove('oculto')
})

document.getElementById('btn-cancelar-nuevo-producto').addEventListener('click', () => {
  elFormNuevoProducto.classList.add('oculto')
  elNuevoProductoError.classList.add('oculto')
  document.getElementById('nuevo-producto-nombre').value = ''
  document.getElementById('nuevo-producto-precio').value = ''
  document.getElementById('nuevo-producto-tipo').checked = false
  document.getElementById('nuevo-producto-perfil').value = ''
})

document.getElementById('btn-crear-producto').addEventListener('click', async () => {
  elNuevoProductoError.classList.add('oculto')

  const nombre = document.getElementById('nuevo-producto-nombre').value.trim()
  const precio = Number(document.getElementById('nuevo-producto-precio').value)
  const tipo = document.getElementById('nuevo-producto-tipo').checked ? 'unidad' : 'peso'
  const perfilMaduracion = document.getElementById('nuevo-producto-perfil').value || null

  if (!nombre) {
    elNuevoProductoError.textContent = 'Ponele un nombre al producto.'
    elNuevoProductoError.classList.remove('oculto')
    return
  }
  if (!precio || precio <= 0) {
    elNuevoProductoError.textContent = 'Ponele un precio inicial mayor a cero.'
    elNuevoProductoError.classList.remove('oculto')
    return
  }

  const boton = document.getElementById('btn-crear-producto')
  boton.disabled = true

  const { data, error } = await supabase
    .from('productos')
    .insert({ nombre, tipo, precio, disponible: true, perfil_maduracion: perfilMaduracion })
    .select('id')
    .single()

  boton.disabled = false

  if (error) {
    elNuevoProductoError.textContent = error.message.includes('duplicate')
      ? 'Ya existe un producto con ese nombre.'
      : 'No se pudo crear el producto. Probá de nuevo.'
    elNuevoProductoError.classList.remove('oculto')
    console.error(error)
    return
  }

  await cargarProductosParaCompraYMerma()
  selectCompraProducto.value = data.id
  actualizarInfoProductoCompra()
  document.getElementById('btn-cancelar-nuevo-producto').click()
})

// --- Proveedores: lista desplegable + alta rápida, igual que productos ---
let proveedoresCargados = []
const selectCompraProveedor = document.getElementById('compra-proveedor')

async function cargarProveedores() {
  const { data, error } = await supabase
    .from('proveedores')
    .select('id, nombre')
    .eq('activo', true)
    .order('nombre')

  if (error) {
    console.error(error)
    return
  }
  proveedoresCargados = data || []
  const seleccionActual = selectCompraProveedor.value
  selectCompraProveedor.innerHTML =
    '<option value="">— Sin especificar —</option>' +
    proveedoresCargados.map(p => `<option value="${p.id}">${p.nombre}</option>`).join('')
  if (seleccionActual) selectCompraProveedor.value = seleccionActual
}
cargarProveedores()

const elFormNuevoProveedor = document.getElementById('form-nuevo-proveedor')
const elNuevoProveedorError = document.getElementById('nuevo-proveedor-error')

document.getElementById('btn-mostrar-nuevo-proveedor').addEventListener('click', () => {
  elFormNuevoProveedor.classList.remove('oculto')
})

document.getElementById('btn-cancelar-nuevo-proveedor').addEventListener('click', () => {
  elFormNuevoProveedor.classList.add('oculto')
  elNuevoProveedorError.classList.add('oculto')
  document.getElementById('nuevo-proveedor-nombre').value = ''
})

document.getElementById('btn-crear-proveedor').addEventListener('click', async () => {
  elNuevoProveedorError.classList.add('oculto')
  const nombre = document.getElementById('nuevo-proveedor-nombre').value.trim()
  if (!nombre) {
    elNuevoProveedorError.textContent = 'Ponele un nombre al proveedor.'
    elNuevoProveedorError.classList.remove('oculto')
    return
  }

  const boton = document.getElementById('btn-crear-proveedor')
  boton.disabled = true
  const { data: nuevoId, error } = await supabase.rpc('crear_proveedor', { p_nombre: nombre })
  boton.disabled = false

  if (error) {
    elNuevoProveedorError.textContent = 'No se pudo crear el proveedor. Probá de nuevo.'
    elNuevoProveedorError.classList.remove('oculto')
    console.error(error)
    return
  }

  await cargarProveedores()
  selectCompraProveedor.value = nuevoId
  document.getElementById('btn-cancelar-nuevo-proveedor').click()
})

// Una vez cargado el primer producto de la boleta, el proveedor queda fijo
// (bloqueado) hasta "Finalizar esta compra" -- así no cambia sin querer
// a mitad de una boleta con varios productos.
function bloquearProveedor() {
  selectCompraProveedor.disabled = true
  document.getElementById('btn-mostrar-nuevo-proveedor').disabled = true
}
function desbloquearProveedor() {
  selectCompraProveedor.disabled = false
  document.getElementById('btn-mostrar-nuevo-proveedor').disabled = false
}


const elCompraPcu = document.getElementById('compra-pcu')
const elCompraPct = document.getElementById('compra-pct')
const elCompraPvuOut = document.getElementById('compra-pvu-out')

// PCU y PCT se recalculan uno al otro según cuál hayas tocado último, contra
// la cantidad neta (después de descontar la tara de los cajones, o contra la
// presentación elegida). El PVU sale solo de PCU + margen — no es un campo
// que se tipee directo, y es el precio que se le termina fijando al lote.
let editandoCosto = 'pcu'

function actualizarCantidadYPvu() {
  const cantidad = cantidadNeta()

  if (cantidad > 0) {
    if (editandoCosto === 'pcu') {
      if (elCompraPcu.value !== '') elCompraPct.value = Math.round(Number(elCompraPcu.value) * cantidad)
    } else {
      if (elCompraPct.value !== '') elCompraPcu.value = (Number(elCompraPct.value) / cantidad).toFixed(2)
    }
  }

  const pcu = Number(elCompraPcu.value) || 0
  const margen = Number(elCompraMargen.value) || 0
  elCompraPvuOut.textContent = pcu > 0 ? formatoMoneda(pcu * (1 + margen / 100)) : '—'
}

elCompraPcu.addEventListener('input', () => { editandoCosto = 'pcu'; actualizarCantidadYPvu() })
elCompraPct.addEventListener('input', () => { editandoCosto = 'pct'; actualizarCantidadYPvu() })
elCompraMargen.addEventListener('input', actualizarCantidadYPvu)

elCompraMargen.addEventListener('change', async () => {
  const p = productoSeleccionado(selectCompraProducto.value)
  if (!p) return
  const valor = elCompraMargen.value === '' ? null : Number(elCompraMargen.value)

  const { error } = await supabase
    .from('productos')
    .update({ margen_objetivo_pct: valor })
    .eq('id', p.id)

  if (error) {
    console.error(error)
    return
  }
  p.margen_objetivo_pct = valor
})

// --- Registrar la fila actual (crea un lote nuevo) y dejarla lista para
// la siguiente, sin cortar el ritmo de carga: sin cartel de confirmación
// y sin pantalla intermedia de "precio sugerido" — el PVU que ya se ve en
// la fila es el precio con el que queda el lote. ---
async function registrarFila() {
  elCompraError.classList.add('oculto')

  const producto = productoSeleccionado(selectCompraProducto.value)
  const pres = presentacionSeleccionada()
  const cantidad = pres ? Number(elCantidadPresentacion.value) : null
  const cantidadBase = cantidadNeta()
  const costoTotal = Number(elCompraPct.value) || 0
  const proveedorId = selectCompraProveedor.value || null
  const ubicacion = elUbicacion.value
  const estado = Number(elEstado.value)
  const margen = Number(elCompraMargen.value) || 0
  const pcu = Number(elCompraPcu.value) || 0
  const pvu = pcu * (1 + margen / 100)

  if (!producto) {
    elCompraError.textContent = 'Elegí un producto.'
    elCompraError.classList.remove('oculto')
    return
  }
  if (!cantidadBase || cantidadBase <= 0) {
    elCompraError.textContent = pres ? 'Completá la cantidad de la presentación.' : 'Completá el peso (bruto) de al menos un cajón.'
    elCompraError.classList.remove('oculto')
    return
  }
  if (!costoTotal || costoTotal <= 0) {
    elCompraError.textContent = 'Completá el costo (PCU o PCT).'
    elCompraError.classList.remove('oculto')
    return
  }
  if (!pres && cajones.some(c => c.bruto != null && (Number(c.tara) || 0) >= Number(c.bruto))) {
    elCompraError.textContent = 'La tara no puede ser mayor o igual al peso bruto de un cajón.'
    elCompraError.classList.remove('oculto')
    return
  }

  if (comprasSesion.length === 0 && !proveedorId) {
    if (!confirm('No elegiste un proveedor para esta compra. ¿Registrarla igual, sin proveedor?')) return
  }

  const { data, error } = await supabase.rpc('registrar_compra', {
    p_producto_id: producto.id,
    p_cantidad: pres ? cantidad : cantidadBase,
    p_costo_total: costoTotal,
    p_proveedor_id: proveedorId,
    p_avance_madurez_pct: estado,
    p_ubicacion: ubicacion,
    p_presentacion_id: pres ? pres.id : null
  })

  if (error) {
    elCompraError.textContent = error.message || 'No se pudo registrar la compra.'
    elCompraError.classList.remove('oculto')
    console.error(error)
    return
  }

  const resultado = data[0]
  const unidadConfirm = producto.tipo === 'peso' ? 'kg' : 'unidades'

  // El PVU que ya se ve en la fila (calculado con la tara descontada) es el
  // precio real con el que queremos que quede este lote — lo fijamos directo,
  // sin pasar por una pantalla aparte a confirmarlo.
  if (pvu > 0) {
    const { error: errorPrecio } = await supabase
      .from('lotes')
      .update({ precio: pvu })
      .eq('id', resultado.lote_id)
    if (errorPrecio) console.error(errorPrecio)
  }

  const { data: loteNuevo } = await supabase
    .from('lotes')
    .select('codigo')
    .eq('id', resultado.lote_id)
    .single()

  // --- Crear los cajones físicos de este lote (ya en neto, sin la tara) y
  // sumar el código de cada uno a este ítem de la lista. ---
  const pesosFinales = pres ? [cantidadBase] : cajones.map(c => {
    const bruto = Number(c.bruto) || 0
    const tara = esPorPeso() ? (Number(c.tara) || 0) : 0
    return Math.max(0, bruto - tara)
  })

  const { data: cajonesCreados, error: errorCajones } = await supabase
    .from('cajones')
    .insert(pesosFinales.map(peso => ({ lote_id: resultado.lote_id, peso_inicial: peso })))
    .select('numero_guia, peso_inicial')

  const itemSesion = {
    productoId: producto.id,
    nombre: producto.nombre,
    cantidad: cantidadBase,
    unidad: unidadConfirm,
    costoTotal,
    costoUnitario: resultado.costo_unitario,
    codigos: errorCajones ? null : [...cajonesCreados]
      .sort((a, b) => a.numero_guia - b.numero_guia)
      .map(c => ({ numeroGuia: c.numero_guia, peso: c.peso_inicial, codigoLote: loteNuevo?.codigo ?? '' }))
  }
  if (errorCajones) console.error(errorCajones)

  comprasSesion.push(itemSesion)
  renderComprasSesion()
  bloquearProveedor()

  // Dejamos la fila lista para el próximo producto, sin frenar la carga.
  elCompraPcu.value = ''
  elCompraPct.value = ''
  elCantidadPresentacion.value = ''
  resetearMadurez()
  elUbicacion.value = 'deposito'
  await actualizarInfoProductoCompra()
  selectCompraProducto.focus()
}

// Enter va avanzando de celda en celda de izquierda a derecha; en la
// última (ubicación) registra la fila entera y arranca una nueva. Si la
// fila está incompleta o vacía, registrarFila() no guarda nada — solo
// muestra el error y te deja seguir corrigiendo esa misma fila.
const ordenCeldasCompra = ['compra-producto', 'compra-pcu', 'compra-pct', 'compra-margen', 'compra-estado', 'compra-ubicacion']

document.querySelector('.grilla-compra-wrap').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return
  e.preventDefault()
  if (e.target.id === 'compra-cantidad-presentacion') {
    elCompraPcu.focus()
    return
  }
  const idx = ordenCeldasCompra.indexOf(e.target.id)
  if (idx === -1) return
  if (idx === ordenCeldasCompra.length - 1) {
    registrarFila()
  } else {
    document.getElementById(ordenCeldasCompra[idx + 1]).focus()
  }
})

// --- Registrar merma ---
document.getElementById('form-merma').addEventListener('submit', async (e) => {
  e.preventDefault()
  elMermaError.classList.add('oculto')

  const producto = productoSeleccionado(selectMermaProducto.value)
  const cantidad = Number(document.getElementById('merma-cantidad').value)
  const motivo = document.getElementById('merma-motivo').value

  const boton = e.target.querySelector('button[type="submit"]')
  boton.disabled = true

  const { error } = await supabase.rpc('registrar_merma', {
    p_producto_id: producto.id,
    p_cantidad: cantidad,
    p_motivo: motivo
  })

  boton.disabled = false

  if (error) {
    elMermaError.textContent = error.message || 'No se pudo registrar la merma.'
    elMermaError.classList.remove('oculto')
    console.error(error)
    return
  }

  document.getElementById('merma-cantidad').value = ''
  await actualizarInfoProductoCompra()
})

// --- Depósito: lotes esperando pasar a salón ---
const elListaDeposito = document.getElementById('lista-deposito')

async function cargarDeposito() {
  elListaDeposito.innerHTML = '<p class="muted">Cargando…</p>'

  const { data, error } = await supabase
    .from('lotes')
    .select('id, cantidad_restante, fecha_ingreso, productos(nombre, tipo)')
    .eq('ubicacion', 'deposito')
    .gt('cantidad_restante', 0)
    .order('fecha_ingreso', { ascending: true })

  if (error) {
    console.error(error)
    elListaDeposito.innerHTML = '<p class="muted">No se pudo cargar el depósito.</p>'
    return
  }

  if (data.length === 0) {
    elListaDeposito.innerHTML = '<p class="muted">No hay lotes en depósito.</p>'
    return
  }

  const hoy = new Date()
  elListaDeposito.innerHTML = ''
  data.forEach(lote => {
    const unidad = lote.productos?.tipo === 'peso' ? 'kg' : 'unidades'
    const dias = Math.floor((hoy - new Date(lote.fecha_ingreso)) / 86400000)
    const fila = document.createElement('div')
    fila.className = 'fila-pendiente-wrap'
    fila.innerHTML = `
      <div class="item-detalle">
        <span>${lote.productos?.nombre || '?'} · ${lote.cantidad_restante} ${unidad} · ${dias}d</span>
        <button class="btn-confirmar btn-pasar-salon" data-id="${lote.id}">Pasar a salón</button>
      </div>
    `
    elListaDeposito.appendChild(fila)
  })
}

elListaDeposito.addEventListener('click', async (e) => {
  const btn = e.target.closest('.btn-pasar-salon')
  if (!btn) return
  btn.disabled = true

  const { error } = await supabase
    .from('lotes')
    .update({ ubicacion: 'salon' })
    .eq('id', btn.dataset.id)

  if (error) {
    alert('No se pudo mover el lote. Probá de nuevo.')
    console.error(error)
    btn.disabled = false
    return
  }
  cargarDeposito()
})

// --- Maduración: sugerencias de descuento u retiro por lote ---
const elListaMaduracion = document.getElementById('lista-maduracion')

async function cargarMaduracion() {
  elListaMaduracion.innerHTML = '<p class="muted">Cargando…</p>'

  const { data, error } = await supabase
    .from('sugerencias_maduracion')
    .select('*')
    .order('dias_efectivos', { ascending: false })

  if (error) {
    console.error(error)
    elListaMaduracion.innerHTML = '<p class="muted">No se pudieron cargar las sugerencias.</p>'
    return
  }

  if (data.length === 0) {
    elListaMaduracion.innerHTML = '<p class="muted">Ningún lote necesita atención hoy.</p>'
    return
  }

  elListaMaduracion.innerHTML = ''
  data.forEach(s => {
    const fila = document.createElement('div')
    fila.className = 'fila-pendiente-wrap'

    if (s.retirar) {
      const productoDeEsteLote = productoSeleccionado(s.producto_id)
      const unidadLote = productoDeEsteLote?.tipo === 'unidad' ? 'unidades' : 'kg'
      fila.innerHTML = `
        <div class="detalle-pedido">
          <div class="fila-titulo">${s.nombre} · ${s.dias_efectivos}d</div>
          <p class="muted">Este lote ya pasó su punto de venta. Quedan ${s.cantidad_restante} ${unidadLote} — si parte todavía se puede vender (ej: sacando hojas feas), poné solo lo que se pierde.</p>
          <label>Cantidad que se pierde
            <input type="number" min="0.01" step="0.01" class="input-cantidad-baja" value="${s.cantidad_restante}" data-max="${s.cantidad_restante}">
          </label>
          <div class="acciones-pedido">
            <button class="btn-cancelar btn-dar-de-baja" data-producto-id="${s.producto_id}">Registrar como merma</button>
          </div>
        </div>
      `
    } else {
      fila.innerHTML = `
        <div class="detalle-pedido">
          <div class="fila-titulo">${s.nombre} · ${s.dias_efectivos}d</div>
          <p class="muted">Precio actual ${formatoMoneda(s.precio_actual)} → sugerido ${formatoMoneda(s.precio_sugerido)} (-${s.descuento_pct}%)</p>
          <label class="oculto campo-precio-maduracion">Precio a aplicar
            <input type="number" min="0" step="1" class="input-precio-maduracion" value="${s.precio_sugerido}">
          </label>
          <div class="acciones-pedido">
            <button class="btn-confirmar btn-aplicar-maduracion" data-lote-id="${s.lote_id}">Usar este precio</button>
            <button class="btn-cancelar btn-ignorar-maduracion">Ignorar</button>
          </div>
        </div>
      `
    }
    elListaMaduracion.appendChild(fila)
  })
}

// --- Precio manual: editar el precio de cualquier lote activo, sin esperar
// ni a la sugerencia de compra ni a la de maduración ---
const selectPrecioProducto = document.getElementById('precio-producto')
const elListaPrecioLotes = document.getElementById('lista-precio-lotes')

selectPrecioProducto.addEventListener('change', cargarLotesParaPrecio)

async function cargarLotesParaPrecio() {
  const productoId = selectPrecioProducto.value
  if (!productoId) return
  elListaPrecioLotes.innerHTML = '<p class="muted">Cargando…</p>'

  const producto = productoSeleccionado(productoId)

  const { data, error } = await supabase
    .from('lotes')
    .select('id, cantidad_restante, ubicacion, precio, precio_original, costo_unitario, fecha_ingreso')
    .eq('producto_id', productoId)
    .gt('cantidad_restante', 0)
    .order('fecha_ingreso')

  if (error) {
    console.error(error)
    elListaPrecioLotes.innerHTML = '<p class="muted">No se pudieron cargar los lotes.</p>'
    return
  }

  if (data.length === 0) {
    elListaPrecioLotes.innerHTML = '<p class="muted">Este producto no tiene ningún lote activo todavía.</p>'
    return
  }

  const unidad = producto?.tipo === 'peso' ? 'kg' : 'unidades'
  elListaPrecioLotes.innerHTML = ''
  data.forEach(lote => {
    const fila = document.createElement('div')
    fila.className = 'fila-pendiente-wrap'
    fila.innerHTML = `
      <div class="detalle-pedido">
        <div class="fila-titulo">${lote.cantidad_restante} ${unidad} · ${lote.ubicacion === 'salon' ? 'Salón' : 'Depósito'}</div>
        <p class="muted">Precio original: ${formatoMoneda(lote.precio_original)}</p>
        <label>Costo de este lote <span class="muted">(lo que te costó a vos)</span>
          <input type="number" min="0" step="1" class="input-costo-lote" value="${lote.costo_unitario}" data-original="${lote.costo_unitario}" data-lote-id="${lote.id}">
        </label>
        <label>Precio actual de este lote <span class="muted">(lo que le cobrás al cliente)</span>
          <input type="number" min="0" step="1" class="input-precio-lote" value="${lote.precio}" data-original="${lote.precio}" data-lote-id="${lote.id}">
        </label>
        <p class="muted margen-lote" data-lote-id="${lote.id}"></p>
        <div class="acciones-pedido">
          <button class="btn-confirmar btn-guardar-precio-lote" data-lote-id="${lote.id}" disabled>Guardar</button>
        </div>
      </div>
    `
    elListaPrecioLotes.appendChild(fila)
    actualizarMargenLote(lote.id)
  })
}

function actualizarMargenLote(loteId) {
  const inputCosto = elListaPrecioLotes.querySelector(`.input-costo-lote[data-lote-id="${loteId}"]`)
  const inputPrecio = elListaPrecioLotes.querySelector(`.input-precio-lote[data-lote-id="${loteId}"]`)
  const elMargen = elListaPrecioLotes.querySelector(`.margen-lote[data-lote-id="${loteId}"]`)
  const btn = elListaPrecioLotes.querySelector(`.btn-guardar-precio-lote[data-lote-id="${loteId}"]`)

  const costo = Number(inputCosto.value)
  const precio = Number(inputPrecio.value)
  elMargen.textContent = costo > 0
    ? `Margen con estos números: ${(((precio - costo) / costo) * 100).toFixed(1)}%`
    : 'Margen: —'

  const cambioAlgo = inputCosto.value !== inputCosto.dataset.original || inputPrecio.value !== inputPrecio.dataset.original
  btn.disabled = !cambioAlgo
}

elListaPrecioLotes.addEventListener('input', (e) => {
  const loteId = e.target.dataset.loteId
  if (!loteId || !e.target.matches('.input-costo-lote, .input-precio-lote')) return
  actualizarMargenLote(loteId)
})

elListaPrecioLotes.addEventListener('click', async (e) => {
  const btn = e.target.closest('.btn-guardar-precio-lote')
  if (!btn) return

  const inputPrecio = elListaPrecioLotes.querySelector(`.input-precio-lote[data-lote-id="${btn.dataset.loteId}"]`)
  const inputCosto = elListaPrecioLotes.querySelector(`.input-costo-lote[data-lote-id="${btn.dataset.loteId}"]`)
  const precio = Number(inputPrecio.value)
  const costo = Number(inputCosto.value)

  if (!precio || precio <= 0 || !costo || costo <= 0) {
    alert('Poné un costo y un precio válidos, mayores a cero.')
    return
  }

  btn.disabled = true

  const { error: errorCosto } = await supabase.rpc('corregir_costo_lote', {
    p_lote_id: btn.dataset.loteId,
    p_costo: costo
  })

  if (errorCosto) {
    btn.disabled = false
    alert('No se pudo guardar el costo. Probá de nuevo.')
    console.error(errorCosto)
    return
  }

  const { error } = await supabase.rpc('confirmar_precio_maduracion', {
    p_lote_id: btn.dataset.loteId,
    p_precio: precio
  })

  btn.disabled = false

  if (error) {
    alert('El costo se guardó, pero no se pudo guardar el precio. Probá de nuevo.')
    console.error(error)
    return
  }
  inputCosto.dataset.original = inputCosto.value
  inputPrecio.dataset.original = inputPrecio.value
  btn.disabled = true
  btn.textContent = 'Guardado ✓'
  setTimeout(() => { btn.textContent = 'Guardar' }, 1500)
})

elListaMaduracion.addEventListener('click', async (e) => {
  const btnIgnorar = e.target.closest('.btn-ignorar-maduracion')
  if (btnIgnorar) {
    btnIgnorar.closest('.fila-pendiente-wrap').remove()
    return
  }

  const btnAplicar = e.target.closest('.btn-aplicar-maduracion')
  if (btnAplicar) {
    const fila = btnAplicar.closest('.detalle-pedido')
    const campo = fila.querySelector('.campo-precio-maduracion')
    const input = fila.querySelector('.input-precio-maduracion')

    if (campo.classList.contains('oculto')) {
      // Primer toque: solo mostramos el campo con el sugerido ya seleccionado, no guardamos todavía
      campo.classList.remove('oculto')
      input.focus()
      input.select()
      btnAplicar.textContent = 'Guardar'
      return
    }

    const precio = Number(input.value)
    if (!precio || precio <= 0) {
      alert('Poné un precio válido.')
      return
    }

    btnAplicar.disabled = true
    const { error } = await supabase.rpc('confirmar_precio_maduracion', {
      p_lote_id: btnAplicar.dataset.loteId,
      p_precio: precio
    })

    if (error) {
      alert('No se pudo actualizar el precio del lote. Probá de nuevo.')
      console.error(error)
      btnAplicar.disabled = false
      return
    }
    btnAplicar.closest('.fila-pendiente-wrap').remove()
    return
  }

  const btnBaja = e.target.closest('.btn-dar-de-baja')
  if (btnBaja) {
    const fila = btnBaja.closest('.detalle-pedido')
    const inputCantidad = fila.querySelector('.input-cantidad-baja')
    const cantidad = Number(inputCantidad.value)
    const maximo = Number(inputCantidad.dataset.max)

    if (!cantidad || cantidad <= 0) {
      alert('Poné cuánto se pierde.')
      return
    }
    if (cantidad > maximo) {
      alert(`No puede ser más de lo que queda en el lote (${maximo}).`)
      return
    }

    if (!confirm(`¿Registrar ${cantidad} como merma?`)) return
    btnBaja.disabled = true
    const { error } = await supabase.rpc('registrar_merma', {
      p_producto_id: btnBaja.dataset.productoId,
      p_cantidad: cantidad,
      p_motivo: 'vencido'
    })

    if (error) {
      alert('No se pudo registrar la merma. Probá de nuevo.')
      console.error(error)
      btnBaja.disabled = false
      return
    }
    btnBaja.closest('.fila-pendiente-wrap').remove()
  }
})

// Mismo motivo que en admin.js: sacar cualquier Service Worker viejo que haya
// quedado registrado, para que esta página no quede pegada en una copia vieja.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(regs => {
    regs.forEach(reg => reg.unregister())
  })
}
