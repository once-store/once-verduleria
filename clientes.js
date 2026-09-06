import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = 'https://meekevxxjirvgsuppvij.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1lZWtldnh4amlydmdzdXBwdmlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU1MjQwMjMsImV4cCI6MjEwMTEwMDAyM30.MGajznwLTreSKal-1-aFcYsEHTTGC6geruLvRryQ88M'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

const vistaClientes = document.getElementById('vista-clientes')
const elListaClientes = document.getElementById('lista-clientes')

const btnNuevoCliente = document.getElementById('btn-nuevo-cliente')
const panelFormCliente = document.getElementById('panel-form-cliente')
const formClienteTitulo = document.getElementById('form-cliente-titulo')
const btnCerrarFormCliente = document.getElementById('btn-cerrar-form-cliente')
const formCliente = document.getElementById('form-cliente')
const clienteError = document.getElementById('cliente-error')
const btnGuardarCliente = document.getElementById('btn-guardar-cliente')

const campoId = document.getElementById('cliente-id')
const campoNombre = document.getElementById('cliente-nombre')
const campoDni = document.getElementById('cliente-dni')
const campoWhatsapp = document.getElementById('cliente-whatsapp')
const campoLimite = document.getElementById('cliente-limite')
const campoActivo = document.getElementById('cliente-activo')

const panelFichaCliente = document.getElementById('panel-ficha-cliente')
const fichaClienteNombre = document.getElementById('ficha-cliente-nombre')
const fichaClienteSaldo = document.getElementById('ficha-cliente-saldo')
const fichaClienteLimite = document.getElementById('ficha-cliente-limite')
const btnCerrarFichaCliente = document.getElementById('btn-cerrar-ficha-cliente')
const btnEditarCliente = document.getElementById('btn-editar-cliente')
const fichaClienteHistorial = document.getElementById('ficha-cliente-historial')

const formPago = document.getElementById('form-pago')
const pagoClienteId = document.getElementById('pago-cliente-id')
const pagoMonto = document.getElementById('pago-monto')
const pagoNota = document.getElementById('pago-nota')
const btnRegistrarPago = document.getElementById('btn-registrar-pago')
const pagoError = document.getElementById('pago-error')

let clientesCache = []
let clienteFichaActual = null // el cliente que está abierto en la ficha ahora mismo

function formatoMoneda(n) {
  return '$' + Math.round(n).toLocaleString('es-AR')
}

document.getElementById('btn-salir').addEventListener('click', async () => {
  await supabase.auth.signOut()
  window.location.href = 'admin-v2.html'
})

// --- Sesión: esta pantalla requiere estar logueado, igual que el resto del panel ---
const { data: { session } } = await supabase.auth.getSession()
if (!session) {
  window.location.href = 'admin-v2.html'
} else {
  vistaClientes.classList.remove('oculto')
  cargarClientes()
}

// --- Listado ---
async function cargarClientes() {
  const { data, error } = await supabase
    .from('clientes')
    .select('*')
    .order('nombre')

  if (error) {
    console.error(error)
    elListaClientes.innerHTML = '<p class="error">No se pudieron cargar los clientes.</p>'
    return
  }

  clientesCache = data

  if (data.length === 0) {
    elListaClientes.innerHTML = '<p class="muted">Todavía no cargaste ningún cliente.</p>'
    return
  }

  elListaClientes.innerHTML = data.map(c => `
    <div class="fila-pendiente-wrap" data-id="${c.id}" style="cursor:pointer;">
      <div class="fila-promo-info">
        <p class="fila-titulo">${c.nombre}${!c.activo ? ' <span class="chip chip-apagado">Inactivo</span>' : ''}</p>
        <p class="muted" style="margin:2px 0;">DNI ${c.dni}${c.whatsapp ? ' · ' + c.whatsapp : ''}</p>
        <p class="muted" style="margin:2px 0;">Límite de fiado: ${formatoMoneda(c.limite_fiado)}</p>
      </div>
    </div>
  `).join('')
}

elListaClientes.addEventListener('click', (e) => {
  const fila = e.target.closest('[data-id]')
  if (!fila) return
  const cliente = clientesCache.find(c => c.id === fila.dataset.id)
  if (cliente) abrirFicha(cliente)
})

// --- Formulario nuevo/editar ---
function limpiarFormCliente() {
  formCliente.reset()
  campoId.value = ''
  campoLimite.value = 0
  campoActivo.checked = true
  clienteError.classList.add('oculto')
}

function abrirFormCliente(cliente) {
  limpiarFormCliente()

  if (cliente) {
    formClienteTitulo.textContent = 'Editar cliente'
    campoId.value = cliente.id
    campoNombre.value = cliente.nombre
    campoDni.value = cliente.dni
    campoWhatsapp.value = cliente.whatsapp || ''
    campoLimite.value = cliente.limite_fiado
    campoActivo.checked = cliente.activo
  } else {
    formClienteTitulo.textContent = 'Nuevo cliente'
  }

  panelFormCliente.classList.remove('oculto')
}

btnNuevoCliente.addEventListener('click', () => abrirFormCliente(null))
btnCerrarFormCliente.addEventListener('click', () => panelFormCliente.classList.add('oculto'))

formCliente.addEventListener('submit', async (e) => {
  e.preventDefault()
  clienteError.classList.add('oculto')
  btnGuardarCliente.disabled = true
  btnGuardarCliente.textContent = 'Guardando…'

  try {
    const campos = {
      nombre: campoNombre.value.trim(),
      dni: campoDni.value.trim(),
      whatsapp: campoWhatsapp.value.trim() || null,
      limite_fiado: Number(campoLimite.value) || 0,
      activo: campoActivo.checked,
    }

    if (!campos.nombre || !campos.dni) {
      throw new Error('Nombre y DNI son obligatorios.')
    }

    const id = campoId.value

    if (id) {
      const { error } = await supabase.from('clientes').update(campos).eq('id', id)
      if (error) throw new Error(error.message)
    } else {
      const { error } = await supabase.from('clientes').insert(campos)
      if (error) throw new Error(error.message)
    }

    panelFormCliente.classList.add('oculto')
    await cargarClientes()

    // Si estábamos editando el cliente que ya tenías abierto en la ficha, la refrescamos
    if (id && clienteFichaActual && clienteFichaActual.id === id) {
      const actualizado = clientesCache.find(c => c.id === id)
      if (actualizado) abrirFicha(actualizado)
    }
  } catch (err) {
    console.error(err)
    clienteError.textContent = err.message || 'No se pudo guardar. Probá de nuevo.'
    clienteError.classList.remove('oculto')
  } finally {
    btnGuardarCliente.disabled = false
    btnGuardarCliente.textContent = 'Guardar cliente'
  }
})

// --- Ficha de cliente: saldo, historial, registrar pago ---
async function abrirFicha(cliente) {
  clienteFichaActual = cliente
  fichaClienteNombre.textContent = cliente.nombre
  fichaClienteLimite.textContent = formatoMoneda(cliente.limite_fiado)
  fichaClienteSaldo.textContent = '…'
  fichaClienteHistorial.innerHTML = '<p class="muted">Cargando…</p>'
  pagoClienteId.value = cliente.id
  pagoError.classList.add('oculto')
  formPago.reset()
  pagoClienteId.value = cliente.id

  panelFichaCliente.classList.remove('oculto')

  const { data, error } = await supabase
    .from('cuenta_corriente_movimientos')
    .select('*')
    .eq('cliente_id', cliente.id)
    .order('creado_en', { ascending: false })

  if (error) {
    console.error(error)
    fichaClienteHistorial.innerHTML = '<p class="error">No se pudo cargar el historial.</p>'
    fichaClienteSaldo.textContent = '—'
    return
  }

  const saldo = data.reduce((acc, m) => acc + (m.tipo === 'cargo' ? Number(m.monto) : -Number(m.monto)), 0)
  fichaClienteSaldo.textContent = formatoMoneda(saldo)

  if (data.length === 0) {
    fichaClienteHistorial.innerHTML = '<p class="muted">Sin movimientos todavía.</p>'
    return
  }

  fichaClienteHistorial.innerHTML = data.map(m => `
    <div class="fila-promo" style="grid-template-columns: 1fr auto;">
      <div class="fila-promo-info">
        <p class="fila-titulo">${m.tipo === 'cargo' ? 'Cargo' : 'Pago'}${m.nota ? ' — ' + m.nota : ''}</p>
        <p class="muted" style="margin:2px 0;">${new Date(m.creado_en).toLocaleString('es-AR')}</p>
      </div>
      <p class="fila-titulo" style="color:${m.tipo === 'cargo' ? 'var(--tomate)' : 'var(--verde)'};">
        ${m.tipo === 'cargo' ? '+' : '-'}${formatoMoneda(m.monto)}
      </p>
    </div>
  `).join('')
}

btnCerrarFichaCliente.addEventListener('click', () => {
  panelFichaCliente.classList.add('oculto')
  clienteFichaActual = null
})

btnEditarCliente.addEventListener('click', () => {
  if (clienteFichaActual) abrirFormCliente(clienteFichaActual)
})

formPago.addEventListener('submit', async (e) => {
  e.preventDefault()
  pagoError.classList.add('oculto')
  btnRegistrarPago.disabled = true
  btnRegistrarPago.textContent = 'Guardando…'

  try {
    const monto = Number(pagoMonto.value)
    if (!monto || monto <= 0) {
      throw new Error('El monto tiene que ser mayor a cero.')
    }

    const { error } = await supabase.rpc('registrar_pago_cuenta_corriente', {
      p_cliente_id: pagoClienteId.value,
      p_monto: monto,
      p_nota: pagoNota.value.trim() || null,
    })
    if (error) throw new Error(error.message)

    formPago.reset()
    pagoClienteId.value = clienteFichaActual.id
    if (clienteFichaActual) await abrirFicha(clienteFichaActual)
  } catch (err) {
    console.error(err)
    pagoError.textContent = err.message || 'No se pudo registrar el pago. Probá de nuevo.'
    pagoError.classList.remove('oculto')
  } finally {
    btnRegistrarPago.disabled = false
    btnRegistrarPago.textContent = 'Registrar pago'
  }
})
