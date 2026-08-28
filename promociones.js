import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = 'https://meekevxxjirvgsuppvij.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1lZWtldnh4amlydmdzdXBwdmlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU1MjQwMjMsImV4cCI6MjEwMTEwMDAyM30.MGajznwLTreSKal-1-aFcYsEHTTGC6geruLvRryQ88M'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

const vistaPromociones = document.getElementById('vista-promociones')
const listaPromos = document.getElementById('lista-promos')
const btnNuevaPromo = document.getElementById('btn-nueva-promo')

const panelForm = document.getElementById('panel-form-promo')
const formPromoTitulo = document.getElementById('form-promo-titulo')
const btnCerrarFormPromo = document.getElementById('btn-cerrar-form-promo')
const formPromo = document.getElementById('form-promo')
const promoError = document.getElementById('promo-error')
const btnGuardarPromo = document.getElementById('btn-guardar-promo')
const btnEliminarPromo = document.getElementById('btn-eliminar-promo')

const campoId = document.getElementById('promo-id')
const campoNombre = document.getElementById('promo-nombre')
const campoDescripcion = document.getElementById('promo-descripcion')
const campoTipo = document.getElementById('promo-tipo')
const campoPrecioOferta = document.getElementById('promo-precio-oferta')
const campoDescuentoPct = document.getElementById('promo-descuento-pct')
const campoCantidadLleva = document.getElementById('promo-cantidad-lleva')
const campoCantidadPaga = document.getElementById('promo-cantidad-paga')
const campoPrecioCombo = document.getElementById('promo-precio-combo')
const campoCategoria = document.getElementById('promo-categoria')
const campoDestacada = document.getElementById('promo-destacada')
const campoActiva = document.getElementById('promo-activa')
const campoFechaDesde = document.getElementById('promo-fecha-desde')
const campoFechaHasta = document.getElementById('promo-fecha-hasta')
const campoOrden = document.getElementById('promo-orden')
const listaProductosPromo = document.getElementById('lista-productos-promo')

const inputImagen = document.getElementById('promo-imagen-input')
const previewImagen = document.getElementById('preview-imagen-promo')
const previewImagenImg = document.getElementById('preview-imagen-promo-img')
const btnQuitarImagen = document.getElementById('btn-quitar-imagen-promo')
const promoImagenError = document.getElementById('promo-imagen-error')

let productosCache = []
let categoriasCache = []
let promocionesCache = []
let archivoImagenPendiente = null // File elegido, se sube recién al guardar
let imagenFueQuitada = false // el usuario tildó "quitar imagen" en una promo que ya tenía una

function formatoMoneda(n) {
  return '$' + Math.round(n).toLocaleString('es-AR')
}

// --- Sesión: esta pantalla requiere estar logueado, igual que el resto del panel ---
const { data: { session } } = await supabase.auth.getSession()
if (!session) {
  window.location.href = 'admin.html'
} else {
  vistaPromociones.classList.remove('oculto')
  init()
}

async function init() {
  await Promise.all([cargarProductos(), cargarCategorias()])
  await cargarPromociones()
}

// --- Cargar datos de apoyo ---
async function cargarProductos() {
  const { data, error } = await supabase
    .from('productos')
    .select('id, nombre, tipo')
    .order('nombre')
  if (error) {
    console.error(error)
    return
  }
  productosCache = data
  listaProductosPromo.innerHTML = data.map(p => `
    <label class="check-producto">
      <input type="checkbox" class="check-producto-input" value="${p.id}">
      <span>${p.nombre}</span>
    </label>
  `).join('')
}

async function cargarCategorias() {
  const { data, error } = await supabase
    .from('categorias')
    .select('id, nombre')
    .order('orden')
  if (error) {
    console.error(error)
    return
  }
  categoriasCache = data
  campoCategoria.innerHTML = '<option value="">Sin categoría</option>' +
    data.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('')
}

// --- Listado de promociones ---
function detallePromo(promo) {
  if (promo.tipo === 'oferta_producto') return `Oferta a ${formatoMoneda(promo.precio_oferta)}`
  if (promo.tipo === 'descuento_porcentual') return `${promo.descuento_pct}% de descuento`
  if (promo.tipo === 'nxm') return `Llevá ${promo.cantidad_lleva} y pagá ${promo.cantidad_paga}`
  if (promo.tipo === 'combo') return `Combo por ${formatoMoneda(promo.precio_combo)}`
  return ''
}

async function cargarPromociones() {
  const { data, error } = await supabase
    .from('promociones')
    .select('*, promocion_productos(producto_id, cantidad_en_combo)')
    .order('orden')
    .order('creado_en', { ascending: false })

  if (error) {
    console.error(error)
    listaPromos.innerHTML = '<p class="error">No se pudieron cargar las promociones.</p>'
    return
  }

  promocionesCache = data

  if (data.length === 0) {
    listaPromos.innerHTML = '<p class="muted">Todavía no creaste ninguna promoción.</p>'
    return
  }

  listaPromos.innerHTML = data.map(p => `
    <div class="fila-promo" data-id="${p.id}">
      <div class="fila-promo-img">
        ${p.imagen_url
          ? `<img src="${p.imagen_url}" alt="" class="foto-producto">`
          : `<div class="foto-producto foto-vacia"></div>`}
      </div>
      <div class="fila-promo-info">
        <p class="fila-titulo">${p.nombre}</p>
        <p class="muted" style="margin:2px 0;">${detallePromo(p)}</p>
        <div class="fila-promo-badges">
          ${p.destacada ? '<span class="chip chip-verde">Destacada</span>' : ''}
          ${p.activa ? '<span class="chip">Activa</span>' : '<span class="chip chip-apagado">Inactiva</span>'}
        </div>
      </div>
      <button class="btn-texto btn-editar-promo" data-id="${p.id}">Editar</button>
    </div>
  `).join('')
}

listaPromos.addEventListener('click', (e) => {
  const btn = e.target.closest('.btn-editar-promo')
  if (!btn) return
  abrirForm(promocionesCache.find(p => p.id === btn.dataset.id))
})

// --- Mostrar/ocultar campos según el tipo de promoción ---
function actualizarCamposPorTipo() {
  document.getElementById('campo-precio-oferta').classList.toggle('oculto', campoTipo.value !== 'oferta_producto')
  document.getElementById('campo-descuento-pct').classList.toggle('oculto', campoTipo.value !== 'descuento_porcentual')
  document.getElementById('campo-nxm').classList.toggle('oculto', campoTipo.value !== 'nxm')
  document.getElementById('campo-combo').classList.toggle('oculto', campoTipo.value !== 'combo')
}
campoTipo.addEventListener('change', actualizarCamposPorTipo)

// --- Abrir formulario (nueva o edición) ---
function limpiarForm() {
  formPromo.reset()
  campoId.value = ''
  campoFechaDesde.value = new Date().toISOString().slice(0, 10)
  campoOrden.value = 0
  archivoImagenPendiente = null
  imagenFueQuitada = false
  promoImagenError.classList.add('oculto')
  previewImagen.classList.add('oculto')
  previewImagenImg.src = ''
  listaProductosPromo.querySelectorAll('.check-producto-input').forEach(chk => { chk.checked = false })
  actualizarCamposPorTipo()
}

function abrirForm(promo) {
  limpiarForm()
  promoError.classList.add('oculto')

  if (promo) {
    formPromoTitulo.textContent = 'Editar promoción'
    btnEliminarPromo.classList.remove('oculto')
    campoId.value = promo.id
    campoNombre.value = promo.nombre
    campoDescripcion.value = promo.descripcion || ''
    campoTipo.value = promo.tipo
    campoPrecioOferta.value = promo.precio_oferta ?? ''
    campoDescuentoPct.value = promo.descuento_pct ?? ''
    campoCantidadLleva.value = promo.cantidad_lleva ?? ''
    campoCantidadPaga.value = promo.cantidad_paga ?? ''
    campoPrecioCombo.value = promo.precio_combo ?? ''
    campoCategoria.value = promo.categoria_id || ''
    campoDestacada.checked = promo.destacada
    campoActiva.checked = promo.activa
    campoFechaDesde.value = promo.fecha_desde
    campoFechaHasta.value = promo.fecha_hasta || ''
    campoOrden.value = promo.orden

    const idsIncluidos = new Set((promo.promocion_productos || []).map(pp => pp.producto_id))
    listaProductosPromo.querySelectorAll('.check-producto-input').forEach(chk => {
      chk.checked = idsIncluidos.has(chk.value)
    })

    if (promo.imagen_url) {
      previewImagen.classList.remove('oculto')
      previewImagenImg.src = promo.imagen_url
    }
    actualizarCamposPorTipo()
  } else {
    formPromoTitulo.textContent = 'Nueva promoción'
    btnEliminarPromo.classList.add('oculto')
  }

  panelForm.classList.remove('oculto')
}

btnNuevaPromo.addEventListener('click', () => abrirForm(null))
btnCerrarFormPromo.addEventListener('click', () => panelForm.classList.add('oculto'))

// --- Imagen: selección y preview ---
inputImagen.addEventListener('change', () => {
  promoImagenError.classList.add('oculto')
  const file = inputImagen.files[0]
  if (!file) return

  if (!file.type.startsWith('image/')) {
    promoImagenError.textContent = 'Elegí un archivo de imagen.'
    promoImagenError.classList.remove('oculto')
    inputImagen.value = ''
    return
  }
  if (file.size > 5 * 1024 * 1024) {
    promoImagenError.textContent = 'La imagen no puede pesar más de 5MB.'
    promoImagenError.classList.remove('oculto')
    inputImagen.value = ''
    return
  }

  archivoImagenPendiente = file
  imagenFueQuitada = false
  previewImagenImg.src = URL.createObjectURL(file)
  previewImagen.classList.remove('oculto')
})

btnQuitarImagen.addEventListener('click', () => {
  archivoImagenPendiente = null
  imagenFueQuitada = true
  inputImagen.value = ''
  previewImagen.classList.add('oculto')
  previewImagenImg.src = ''
})

// Sube la imagen pendiente al Storage y devuelve la URL pública, o null si no hay nada pendiente
async function subirImagenSiCorresponde(promocionId) {
  if (!archivoImagenPendiente) return undefined // undefined = no tocar imagen_url
  const ext = archivoImagenPendiente.name.split('.').pop().toLowerCase()
  const ruta = `promos/${promocionId}.${ext}`

  const { error: errorSubida } = await supabase.storage
    .from('productos')
    .upload(ruta, archivoImagenPendiente, { upsert: true })

  if (errorSubida) {
    throw new Error('No se pudo subir la imagen: ' + errorSubida.message)
  }

  const { data } = supabase.storage.from('productos').getPublicUrl(ruta)
  // Le agregamos un parámetro para evitar que quede cacheada la imagen vieja con el mismo nombre
  return data.publicUrl + '?t=' + Date.now()
}

// --- Guardar (crear o editar) ---
formPromo.addEventListener('submit', async (e) => {
  e.preventDefault()
  promoError.classList.add('oculto')
  btnGuardarPromo.disabled = true
  btnGuardarPromo.textContent = 'Guardando…'

  try {
    const productosSeleccionados = Array.from(
      listaProductosPromo.querySelectorAll('.check-producto-input:checked')
    ).map(chk => ({ producto_id: chk.value, cantidad_en_combo: 1 }))

    if (productosSeleccionados.length === 0) {
      throw new Error('Tildá al menos un producto para la promoción.')
    }

    const campos = {
      tipo: campoTipo.value,
      nombre: campoNombre.value.trim(),
      descripcion: campoDescripcion.value.trim() || null,
      categoria_id: campoCategoria.value || null,
      descuento_pct: campoTipo.value === 'descuento_porcentual' ? Number(campoDescuentoPct.value) : null,
      precio_oferta: campoTipo.value === 'oferta_producto' ? Number(campoPrecioOferta.value) : null,
      cantidad_lleva: campoTipo.value === 'nxm' ? Number(campoCantidadLleva.value) : null,
      cantidad_paga: campoTipo.value === 'nxm' ? Number(campoCantidadPaga.value) : null,
      precio_combo: campoTipo.value === 'combo' ? Number(campoPrecioCombo.value) : null,
      destacada: campoDestacada.checked,
      orden: Number(campoOrden.value) || 0,
      activa: campoActiva.checked,
      fecha_desde: campoFechaDesde.value,
      fecha_hasta: campoFechaHasta.value || null,
    }

    let promocionId = campoId.value

    if (!promocionId) {
      // Crear: usamos la función crear_promocion() para que la promo y sus
      // productos queden insertados juntos, en una sola transacción.
      const { data, error } = await supabase.rpc('crear_promocion', {
        p_tipo: campos.tipo,
        p_nombre: campos.nombre,
        p_productos: productosSeleccionados,
        p_descripcion: campos.descripcion,
        p_categoria_id: campos.categoria_id,
        p_descuento_pct: campos.descuento_pct,
        p_precio_oferta: campos.precio_oferta,
        p_cantidad_lleva: campos.cantidad_lleva,
        p_cantidad_paga: campos.cantidad_paga,
        p_precio_combo: campos.precio_combo,
        p_destacada: campos.destacada,
        p_orden: campos.orden,
        p_activa: campos.activa,
        p_fecha_desde: campos.fecha_desde,
        p_fecha_hasta: campos.fecha_hasta,
      })
      if (error) throw new Error(error.message)
      promocionId = data
    } else {
      // Editar: usamos actualizar_promocion() para que el update de la promo
      // y el reemplazo de sus productos vinculados pasen en una sola
      // transacción -- si se hacían por separado, el DELETE de productos
      // dejaba la promo con 0 productos por una fracción de segundo, y el
      // trigger que exige "oferta_producto siempre con 1 producto" lo rechazaba.
      const { error: errorUpdate } = await supabase.rpc('actualizar_promocion', {
        p_id: promocionId,
        p_tipo: campos.tipo,
        p_nombre: campos.nombre,
        p_productos: productosSeleccionados,
        p_descripcion: campos.descripcion,
        p_categoria_id: campos.categoria_id,
        p_descuento_pct: campos.descuento_pct,
        p_precio_oferta: campos.precio_oferta,
        p_cantidad_lleva: campos.cantidad_lleva,
        p_cantidad_paga: campos.cantidad_paga,
        p_precio_combo: campos.precio_combo,
        p_destacada: campos.destacada,
        p_orden: campos.orden,
        p_activa: campos.activa,
        p_fecha_desde: campos.fecha_desde,
        p_fecha_hasta: campos.fecha_hasta,
      })
      if (errorUpdate) throw new Error(errorUpdate.message)
    }

    // Imagen: subir la nueva si eligió una, o borrar la referencia si tildó "quitar"
    const nuevaUrl = await subirImagenSiCorresponde(promocionId)
    if (nuevaUrl !== undefined || imagenFueQuitada) {
      const { error: errorImagen } = await supabase
        .from('promociones')
        .update({ imagen_url: imagenFueQuitada ? null : nuevaUrl })
        .eq('id', promocionId)
      if (errorImagen) throw new Error(errorImagen.message)
    }

    panelForm.classList.add('oculto')
    await cargarPromociones()
  } catch (err) {
    console.error(err)
    promoError.textContent = err.message || 'No se pudo guardar. Probá de nuevo.'
    promoError.classList.remove('oculto')
  } finally {
    btnGuardarPromo.disabled = false
    btnGuardarPromo.textContent = 'Guardar promoción'
  }
})

// --- Eliminar ---
btnEliminarPromo.addEventListener('click', async () => {
  const id = campoId.value
  if (!id) return
  if (!confirm('¿Eliminar esta promoción? No se puede deshacer.')) return

  btnEliminarPromo.disabled = true
  const { error } = await supabase.from('promociones').delete().eq('id', id)
  btnEliminarPromo.disabled = false

  if (error) {
    promoError.textContent = 'No se pudo eliminar. Probá de nuevo.'
    promoError.classList.remove('oculto')
    console.error(error)
    return
  }

  panelForm.classList.add('oculto')
  await cargarPromociones()
})
