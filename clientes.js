import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = 'https://meekevxxjirvgsuppvij.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1lZWtldnh4amlydmdzdXBwdmlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU1MjQwMjMsImV4cCI6MjEwMTEwMDAyM30.MGajznwLTreSKal-1-aFcYsEHTTGC6geruLvRryQ88M'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

const vistaClientes = document.getElementById('vista-clientes')
const listaClientes = document.getElementById('lista-clientes')
const btnNuevoCliente = document.getElementById('btn-nuevo-cliente')

const panelForm = document.getElementById('panel-form-cliente')
const formClienteTitulo = document.getElementById('form-cliente-titulo')
const btnCerrarFormCliente = document.getElementById('btn-cerrar-form-cliente')
const formCliente = document.getElementById('form-cliente')
const clienteError = document.getElementById('cliente-error')

const campoId = document.getElementById('cliente-id')
const campoNombre = document.getElementById('cliente-nombre')
const campoWhatsapp = document.getElementById('cliente-whatsapp')
const campoLimite = document.getElementById('cliente-limite')
const campoActivo = document.getElementById('cliente-activo')

const panelFicha = document.getElementById('panel-ficha-cliente')
const fichaNombre = document.getElementById('ficha-cliente-nombre')
const fichaSaldo = document.getElementById('ficha-cliente-saldo')
const fichaLimite = document.getElementById('ficha-cliente-limite')
const fichaHistorial = document.getElementById('ficha-cliente-historial')
const btnCerrarFicha = document.getElementById('btn-cerrar-ficha-cliente')
const btnEditarCliente = document.getElementById('btn-editar-cliente')

const formPago = document.getElementById('form-pago')
const campoPagoClienteId = document.getElementById('pago-cliente-id')
const campoPagoMonto = document.getElementById('pago-monto')
const campoPagoNota = document.getElementById('pago-nota')
const pagoError = document.getElementById('pago-error')

let clientesCache = []
let clienteFichaActual = null

function formatoMoneda(n) {
  return '$' + Math.round(n).toLocaleString('es-AR')
}

// --- Auth: misma protección que el resto de las subpáginas del admin ---
const { data: { session } } = await supabase.auth.getSession()
if (!session) {
  window.location.href = 'admin.html'
} else {
  vistaClientes.classList.remove('oculto')
  cargarClientes()
}

// --- Listado ---
async function cargarClientes() {
  const { data, error } = await supabase
    .from('clientes_saldo')
    .select('*')
    .order('nombre')

  if (error) {
    listaClientes.innerHTML = '<p class="muted">No se pudo cargar la lista de clientes.</p>'
    console.error(error)
    return
  }

  clientesCache = data || []

  if (clientesCache.length === 0) {
    listaClientes.innerHTML = '<p class="muted">Todavía no hay clientes cargados.</p>'
    return
  }

  listaClientes.innerHTML = clientesCache.map(c => `
    <div class="fila-pendiente-wrap">
      <button class="fila-cliente" data-id="${c.cliente_id}" style="width:100%; text-align:left; background:none; border:none; padding:12px 0; cursor:pointer; display:flex; justify-content:space-between; align-items:center;">
        <span class="fila-titulo">${c.nombre}</span>
        <span class="${Number(c.saldo_actual) > 0 ? '' : 'muted'}">${formatoMoneda(c.saldo_actual)}${Number(c.saldo_actual) > 0 ? ' debe' : ''}</span>
      </button>
    </div>
  `).join('')
}

listaClientes.addEventListener('click', (e) => {
  const btn = e.target.closest('.fila-cliente')
  if (!btn) return
  abrirFicha(btn.dataset.id)
})

// --- Alta / edición ---
btnNuevoCliente.addEventListener('click', () => {
  formClienteTitulo.textContent = 'Nuevo cliente'
  campoId.value = ''
  campoNombre.value = ''
  campoWhatsapp.value = ''
  campoLimite.value = '0'
  campoActivo.checked = true
  clienteError.classList.add('oculto')
  panelForm.classList.remove('oculto')
})

btnCerrarFormCliente.addEventListener('click', () => panelForm.classList.add('oculto'))

formCliente.addEventListener('submit', async (e) => {
  e.preventDefault()
  clienteError.classList.add('oculto')

  const payload = {
    nombre: campoNombre.value.trim(),
    whatsapp: campoWhatsapp.value.trim() || null,
    limite_fiado: Number(campoLimite.value) || 0,
    activo: campoActivo.checked
  }

  const query = campoId.value
    ? supabase.from('clientes').update(payload).eq('id', campoId.value)
    : supabase.from('clientes').insert(payload)

  const { error } = await query
  if (error) {
    clienteError.textContent = 'No se pudo guardar. Probá de nuevo.'
    clienteError.classList.remove('oculto')
    console.error(error)
    return
  }

  panelForm.classList.add('oculto')
  cargarClientes()
  if (clienteFichaActual) abrirFicha(clienteFichaActual)
})

// --- Ficha de cliente ---
async function abrirFicha(clienteId) {
  clienteFichaActual = clienteId
  fichaNombre.textContent = 'Cargando…'
  fichaHistorial.innerHTML = '<p class="muted">Cargando…</p>'
  panelFicha.classList.remove('oculto')

  const [{ data: cliente, error: errCliente }, { data: movimientos, error: errMov }] = await Promise.all([
    supabase.from('clientes_saldo').select('*').eq('cliente_id', clienteId).single(),
    supabase.from('cuenta_corriente_movimientos').select('*').eq('cliente_id', clienteId).order('creado_en', { ascending: false })
  ])

  if (errCliente) {
    console.error(errCliente)
    fichaNombre.textContent = 'Error al cargar'
    return
  }

  fichaNombre.textContent = cliente.nombre
  fichaSaldo.textContent = formatoMoneda(cliente.saldo_actual)
  fichaLimite.textContent = formatoMoneda(cliente.limite_fiado)
  campoPagoClienteId.value = clienteId

  if (errMov) {
    console.error(errMov)
    fichaHistorial.innerHTML = '<p class="muted">No se pudo cargar el historial.</p>'
    return
  }

  if (!movimientos || movimientos.length === 0) {
    fichaHistorial.innerHTML = '<p class="muted">Sin movimientos todavía.</p>'
    return
  }

  fichaHistorial.innerHTML = movimientos.map(m => `
    <div class="item-detalle">
      <span>${m.tipo === 'cargo' ? 'Cargo' : 'Pago'} · ${new Date(m.creado_en).toLocaleDateString('es-AR')}${m.nota ? ' · ' + m.nota : ''}</span>
      <span>${m.tipo === 'cargo' ? '+' : '-'}${formatoMoneda(m.monto)}</span>
    </div>
  `).join('')
}

btnCerrarFicha.addEventListener('click', () => {
  panelFicha.classList.add('oculto')
  clienteFichaActual = null
})

btnEditarCliente.addEventListener('click', () => {
  const c = clientesCache.find(x => x.cliente_id === clienteFichaActual)
  if (!c) return
  formClienteTitulo.textContent = 'Editar cliente'
  campoId.value = c.cliente_id
  campoNombre.value = c.nombre
  campoWhatsapp.value = c.whatsapp || ''
  campoLimite.value = c.limite_fiado
  campoActivo.checked = c.activo
  clienteError.classList.add('oculto')
  panelForm.classList.remove('oculto')
})

// --- Registrar pago ---
formPago.addEventListener('submit', async (e) => {
  e.preventDefault()
  pagoError.classList.add('oculto')

  const monto = Number(campoPagoMonto.value)
  if (!monto || monto <= 0) {
    pagoError.textContent = 'Ingresá un monto válido.'
    pagoError.classList.remove('oculto')
    return
  }

  const { error } = await supabase.rpc('registrar_pago_cuenta_corriente', {
    p_cliente_id: campoPagoClienteId.value,
    p_monto: monto,
    p_nota: campoPagoNota.value.trim() || null
  })

  if (error) {
    pagoError.textContent = 'No se pudo registrar el pago. Probá de nuevo.'
    pagoError.classList.remove('oculto')
    console.error(error)
    return
  }

  campoPagoMonto.value = ''
  campoPagoNota.value = ''
  cargarClientes()
  abrirFicha(clienteFichaActual)
})
