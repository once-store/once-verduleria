import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = 'https://meekevxxjirvgsuppvij.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1lZWtldnh4amlydmdzdXBwdmlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU1MjQwMjMsImV4cCI6MjEwMTEwMDAyM30.MGajznwLTreSKal-1-aFcYsEHTTGC6geruLvRryQ88M'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

const vistaLogin = document.getElementById('vista-login')
const vistaPanel = document.getElementById('vista-panel')
const formLogin = document.getElementById('form-login')
const loginError = document.getElementById('login-error')
const listaPendientes = document.getElementById('lista-pendientes')
const badgePorArmar = document.getElementById('badge-por-armar')
const resumenHoy = document.getElementById('resumen-hoy')
const btnCampana = document.getElementById('btn-campana')
const badgeAlertas = document.getElementById('badge-alertas')
const modalCritica = document.getElementById('modal-alerta-critica')
const modalCriticaMensaje = document.getElementById('modal-alerta-critica-mensaje')
const btnCerrarAlertaCritica = document.getElementById('btn-cerrar-alerta-critica')
const tarjetaClima = document.getElementById('tarjeta-clima')
const modalListaAlertas = document.getElementById('modal-lista-alertas')
const listaAlertasContenido = document.getElementById('lista-alertas-contenido')
const btnCerrarListaAlertas = document.getElementById('btn-cerrar-lista-alertas')
const modalCC = document.getElementById('modal-cuenta-corriente')
const btnCerrarModalCC = document.getElementById('btn-cerrar-modal-cc')
const ccSelectCliente = document.getElementById('cc-select-cliente')
const btnConfirmarCC = document.getElementById('btn-confirmar-cc')
const ccError = document.getElementById('cc-error')
let ccPedidoIdActual = null

let refrescoInterval = null
let alertaCriticaAbierta = null // id de la alerta crítica mostrada en el popup, para no reabrirlo solo mientras espera que la cierren

function formatoMoneda(n) {
  return '$' + Math.round(n).toLocaleString('es-AR')
}

// --- Login ---
formLogin.addEventListener('submit', async (e) => {
  e.preventDefault()
  loginError.classList.add('oculto')
  const email = document.getElementById('login-email').value
  const password = document.getElementById('login-password').value

  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    loginError.textContent = error.message
    loginError.classList.remove('oculto')
    return
  }
  mostrarPanel()
})

document.getElementById('btn-salir').addEventListener('click', async () => {
  await supabase.auth.signOut()
  clearInterval(refrescoInterval)
  vistaPanel.classList.add('oculto')
  vistaLogin.classList.remove('oculto')
})

// Si ya había una sesión activa (no cerró sesión la última vez), entra directo
const { data: { session } } = await supabase.auth.getSession()
if (session) mostrarPanel()

function mostrarPanel() {
  vistaLogin.classList.add('oculto')
  vistaPanel.classList.remove('oculto')
  cargarPendientes()
  cargarContadorPorArmar()
  cargarResumenHoy()
  cargarAlertas()
  refrescoInterval = setInterval(() => {
    cargarPendientes()
    cargarContadorPorArmar()
    cargarResumenHoy()
    cargarAlertas()
  }, 5000)
}

let ultimoConteoPorArmar = null // null = todavía no cargamos el primer valor (no sonar al abrir la página)

function reproducirAlertaSonora() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const tocarBeep = (frecuencia, inicio, duracion) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = frecuencia
      osc.connect(gain)
      gain.connect(ctx.destination)
      gain.gain.setValueAtTime(0.35, ctx.currentTime + inicio)
      osc.start(ctx.currentTime + inicio)
      osc.stop(ctx.currentTime + inicio + duracion)
    }
    // Dos beeps cortos, como un aviso de "entró algo nuevo"
    tocarBeep(880, 0, 0.15)
    tocarBeep(880, 0.2, 0.15)
  } catch (error) {
    console.error('No se pudo reproducir la alerta sonora:', error)
  }
}

// --- Contador de pedidos de WhatsApp por armar (solo el número, para el botón) ---
async function cargarContadorPorArmar() {
  const { count, error } = await supabase
    .from('pedidos')
    .select('id', { count: 'exact', head: true })
    .eq('origen', 'whatsapp')
    .eq('armado_estado', 'pendiente')

  if (error) {
    console.error(error)
    return
  }

  if (ultimoConteoPorArmar !== null && count > ultimoConteoPorArmar) {
    reproducirAlertaSonora()
  }
  ultimoConteoPorArmar = count

  if (!count) {
    badgePorArmar.classList.add('oculto')
  } else {
    badgePorArmar.textContent = count
    badgePorArmar.classList.remove('oculto')
  }
}

// --- Pendientes de confirmar ---
async function cargarPendientes() {
  const { data, error } = await supabase
    .from('pedidos')
    .select('*')
    .in('estado', ['pendiente_efectivo', 'pendiente_transferencia', 'pendiente_combinado', 'pendiente_mp'])
    .order('creado_en', { ascending: true })

  if (error) {
    console.error(error)
    return
  }

  if (data.length === 0) {
    listaPendientes.innerHTML = '<p class="muted">No hay pedidos pendientes.</p>'
    return
  }

  // Traemos los items de todos los pedidos pendientes en paralelo
  const pedidosConItems = await Promise.all(
    data.map(async (pedido) => {
      const { data: items } = await supabase
        .from('pedido_items')
        .select('cantidad, subtotal, productos(nombre, tipo)')
        .eq('pedido_id', pedido.id)
      return { ...pedido, items: items || [] }
    })
  )

  // Antes de redibujar, anotamos qué pedidos tenía abiertos, para no cerrarlos de golpe
  const abiertos = new Set(
    Array.from(listaPendientes.querySelectorAll('details[open]')).map(d => d.dataset.id)
  )

  listaPendientes.innerHTML = ''
  pedidosConItems.forEach(pedido => {
    const metodoTexto = pedido.metodo_pago === 'efectivo'
      ? 'Efectivo'
      : pedido.metodo_pago === 'combinado'
        ? `Combinado (${formatoMoneda(pedido.monto_efectivo)} efectivo + ${formatoMoneda(pedido.monto_transferencia)} transf.)`
        : pedido.metodo_pago === 'mercado_pago'
          ? 'Mercado Pago'
          : 'Transferencia'
    const filaItems = pedido.items.map(it => {
      const unidad = it.productos?.tipo === 'peso' ? 'kg' : ''
      return `<div class="item-detalle">
        <span>${it.productos?.nombre || '?'} · ${it.cantidad}${unidad}</span>
        <span>${formatoMoneda(it.subtotal)}</span>
      </div>`
    }).join('')

    const fila = document.createElement('div')
    fila.className = 'fila-pendiente-wrap'
    fila.innerHTML = `
      <details class="detalle-pedido" data-id="${pedido.id}" ${abiertos.has(pedido.id) ? 'open' : ''}>
        <summary>
          <span class="fila-titulo">Pedido #${pedido.numero_corto}</span>
          <span class="muted">${formatoMoneda(pedido.monto_total)} · ${metodoTexto}</span>
        </summary>
        <div class="detalle-items">${filaItems || '<p class="muted">Sin productos cargados</p>'}</div>
        <div class="acciones-pedido">
          <button class="btn-confirmar" data-id="${pedido.id}">Confirmar</button>
          <button class="btn-texto btn-a-cuenta" data-id="${pedido.id}">A cuenta</button>
          <button class="btn-cancelar" data-id="${pedido.id}">Cancelar</button>
        </div>
      </details>
    `
    listaPendientes.appendChild(fila)
  })
}

listaPendientes.addEventListener('click', async (e) => {
  const btnCancelar = e.target.closest('.btn-cancelar')
  if (btnCancelar) {
    if (!confirm('¿Cancelar este pedido? Se repone el stock automáticamente. No se puede deshacer.')) return
    const { error } = await supabase.rpc('cancelar_pedido', {
      p_pedido_id: btnCancelar.dataset.id
    })
    if (error) {
      alert('No se pudo cancelar. Probá de nuevo.')
      console.error(error)
      return
    }
    cargarPendientes()
    return
  }
  const btn = e.target.closest('.btn-confirmar')
  if (!btn) return
  btn.disabled = true
  btn.textContent = '...'

  const { error } = await supabase
    .from('pedidos')
    .update({ estado: 'pagado', pagado_en: new Date().toISOString() })
    .eq('id', btn.dataset.id)

  if (error) {
    alert('No se pudo confirmar. Probá de nuevo.')
    console.error(error)
    btn.disabled = false
    btn.textContent = 'Confirmar'
    return
  }
  cargarPendientes()
  cargarResumenHoy()
  window.open(`ticket.html?pedido=${btn.dataset.id}`, '_blank')
})

  listaPendientes.addEventListener('click', async (e) => {
  const btnACuenta = e.target.closest('.btn-a-cuenta')
  
  if (!btnACuenta) return
  ccPedidoIdActual = btnACuenta.dataset.id
  ccError.classList.add('oculto')

  const { data, error } = await supabase
    .from('clientes')
    .select('id, nombre, limite_fiado')
    .eq('activo', true)
    .gt('limite_fiado', 0)
    .order('nombre')

  if (error) {
    console.error(error)
    return
  }

  if (!data || data.length === 0) {
    ccSelectCliente.innerHTML = '<option value="">Ningún cliente tiene fiado habilitado</option>'
  } else {
    ccSelectCliente.innerHTML = data.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('')
  }

  modalCC.classList.remove('oculto')
})

btnCerrarModalCC.addEventListener('click', () => {
  modalCC.classList.add('oculto')
  ccPedidoIdActual = null
})

btnConfirmarCC.addEventListener('click', async () => {
  const clienteId = ccSelectCliente.value
  if (!clienteId || !ccPedidoIdActual) {
    ccError.textContent = 'Elegí un cliente con fiado habilitado.'
    ccError.classList.remove('oculto')
    return
  }

  btnConfirmarCC.disabled = true
  btnConfirmarCC.textContent = '...'

  const { error } = await supabase.rpc('cargar_pedido_a_cuenta', {
    p_pedido_id: ccPedidoIdActual,
    p_cliente_id: clienteId
  })

  btnConfirmarCC.disabled = false
  btnConfirmarCC.textContent = 'Confirmar cargo'

  if (error) {
    ccError.textContent = error.message.includes('limite')
      ? 'Este pedido supera el límite de fiado del cliente.'
      : 'No se pudo cargar a cuenta. Probá de nuevo.'
    ccError.classList.remove('oculto')
    console.error(error)
    return
  }

  modalCC.classList.add('oculto')
  cargarPendientes()
  cargarResumenHoy()
  window.open(`ticket.html?pedido=${ccPedidoIdActual}`, '_blank')
  ccPedidoIdActual = null
})

// --- Resumen del día ---
async function cargarResumenHoy() {
  const inicioHoy = new Date()
  inicioHoy.setHours(0, 0, 0, 0)

  const { data, error } = await supabase
    .from('pedidos')
    .select('monto_total, metodo_pago')
    .eq('estado', 'pagado')
    .gte('pagado_en', inicioHoy.toISOString())

  if (error) {
    console.error(error)
    return
  }

  const totalVendido = data.reduce((a, p) => a + Number(p.monto_total), 0)
  const totalEfectivo = data
    .filter(p => p.metodo_pago === 'efectivo')
    .reduce((a, p) => a + Number(p.monto_total), 0)
  const totalDigital = totalVendido - totalEfectivo

  resumenHoy.innerHTML = `
    <div class="resumen-item"><span class="muted">Vendido</span><strong>${formatoMoneda(totalVendido)}</strong></div>
    <div class="resumen-item"><span class="muted">Pedidos</span><strong>${data.length}</strong></div>
    <div class="resumen-item"><span class="muted">Digital</span><strong>${formatoMoneda(totalDigital)}</strong></div>
    <div class="resumen-item"><span class="muted">Efectivo</span><strong>${formatoMoneda(totalEfectivo)}</strong></div>
  `
}

// --- Alertas ---
function formatoFechaAlerta(iso) {
  const d = new Date(iso)
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }) +
    ' ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

const ICONOS_CLIMA = {
  helada: '🌨️',
  lluvia_excesiva: '🌧️',
  sequia: '☀️',
  error_consulta: '⚠️'
}

async function cargarAlertas() {
  const { data: todas, error } = await supabase
    .from('alertas')
    .select('*')
    .eq('vista', false)
    .order('fecha', { ascending: false })

  if (error) {
    console.error(error)
    return
  }

  // Las alertas de clima viven en su propia tarjeta destacada, no en la campanita/lista/popup
  const clima = todas.filter(a => a.tipo === 'clima')
  const data = todas.filter(a => a.tipo !== 'clima')

  dibujarTarjetaClima(clima)

  btnCampana.classList.remove('oculto')

  if (data.length === 0) {
    badgeAlertas.classList.add('oculto')
  } else {
    badgeAlertas.textContent = data.length
    badgeAlertas.classList.remove('oculto')
  }

  // Si hay una alerta crítica sin ver y no está ya mostrada en el popup, la mostramos
  const critica = data.find(a => a.prioridad === 'critica')
  if (critica && alertaCriticaAbierta !== critica.id) {
    alertaCriticaAbierta = critica.id
    modalCriticaMensaje.textContent = critica.mensaje
    modalCritica.classList.remove('oculto')
  }
  if (!critica) {
    alertaCriticaAbierta = null
  }

  // Si la lista completa está abierta, la mantenemos actualizada
  if (!modalListaAlertas.classList.contains('oculto')) {
    dibujarListaAlertas(data)
  }
}

function dibujarTarjetaClima(clima) {
  if (clima.length === 0) {
    tarjetaClima.classList.add('oculto')
    tarjetaClima.innerHTML = ''
    return
  }
  tarjetaClima.classList.remove('oculto')
  tarjetaClima.innerHTML = clima.map(a => `
    <div class="tarjeta-clima-item">
      <span class="tarjeta-clima-icono">${ICONOS_CLIMA[a.contexto?.evento] || '🌡️'}</span>
      <div class="tarjeta-clima-texto">
        ${a.mensaje}
        <br>
        <button class="tarjeta-clima-cerrar" data-id="${a.id}">Entendido</button>
      </div>
    </div>
  `).join('')

  tarjetaClima.querySelectorAll('.tarjeta-clima-cerrar').forEach(btn => {
    btn.addEventListener('click', async () => {
      await supabase.from('alertas').update({ vista: true }).eq('id', btn.dataset.id)
      cargarAlertas()
    })
  })
}

function dibujarListaAlertas(data) {
  if (data.length === 0) {
    listaAlertasContenido.innerHTML = '<p class="muted">No hay alertas pendientes.</p>'
    return
  }
  listaAlertasContenido.innerHTML = data.map(a => `
    <div class="alerta-item prioridad-${a.prioridad}">
      <div class="alerta-item-texto">
        <p class="alerta-item-mensaje">${a.mensaje}</p>
        <span class="alerta-item-fecha">${formatoFechaAlerta(a.fecha)}</span>
      </div>
      <button class="btn-marcar-visto" data-id="${a.id}">Marcar visto</button>
    </div>
  `).join('')
}

btnCampana.addEventListener('click', async () => {
  modalListaAlertas.classList.remove('oculto')
  const { data, error } = await supabase
    .from('alertas')
    .select('*')
    .eq('vista', false)
    .order('fecha', { ascending: false })
  if (error) {
    console.error(error)
    return
  }
  dibujarListaAlertas(data)
})

btnCerrarListaAlertas.addEventListener('click', () => {
  modalListaAlertas.classList.add('oculto')
})

listaAlertasContenido.addEventListener('click', async (e) => {
  const btn = e.target.closest('.btn-marcar-visto')
  if (!btn) return
  btn.disabled = true
  const { error } = await supabase
    .from('alertas')
    .update({ vista: true })
    .eq('id', btn.dataset.id)
  if (error) {
    console.error(error)
    btn.disabled = false
    return
  }
  cargarAlertas()
  btnCampana.click() // recarga la lista abierta con el dato fresco
})

btnCerrarAlertaCritica.addEventListener('click', async () => {
  if (!alertaCriticaAbierta) {
    modalCritica.classList.add('oculto')
    return
  }
  const { error } = await supabase
    .from('alertas')
    .update({ vista: true })
    .eq('id', alertaCriticaAbierta)
  if (error) {
    console.error(error)
    return
  }
  modalCritica.classList.add('oculto')
  alertaCriticaAbierta = null
  cargarAlertas()
})

// Por si quedó un Service Worker viejo registrado (de una versión anterior con
// caché agresivo), lo sacamos siempre, para que esta página nunca quede pegada
// mostrando una copia vieja de sí misma.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(regs => {
    regs.forEach(reg => reg.unregister())
  })
}
