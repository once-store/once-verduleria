import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = 'https://meekevxxjirvgsuppvij.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1lZWtldnh4amlydmdzdXBwdmlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU1MjQwMjMsImV4cCI6MjEwMTEwMDAyM30.MGajznwLTreSKal-1-aFcYsEHTTGC6geruLvRryQ88M'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

const vistaConversaciones = document.getElementById('vista-conversaciones')
const pantallaLista = document.getElementById('pantalla-lista')
const pantallaHilo = document.getElementById('pantalla-hilo')
const elConvLista = document.getElementById('conv-lista')
const elContactoCard = document.getElementById('conv-contacto-card')
const elMensajes = document.getElementById('conv-mensajes')
const btnVolverLista = document.getElementById('btn-volver-lista')

// --- Sesión: esta pantalla requiere estar logueado, igual que el resto del panel ---
const { data: { session } } = await supabase.auth.getSession()
if (!session) {
  window.location.href = 'admin.html'
} else {
  vistaConversaciones.classList.remove('oculto')
  cargarLista()
}

function iniciales(nombre) {
  if (!nombre) return '?'
  return nombre.trim().slice(0, 2).toUpperCase()
}

function formatoFechaCorta(fechaIso) {
  const fecha = new Date(fechaIso)
  const hoy = new Date()
  const esHoy = fecha.toDateString() === hoy.toDateString()
  return esHoy
    ? fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
    : fecha.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
}

function formatoFechaHora(fechaIso) {
  return new Date(fechaIso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

async function cargarLista() {
  elConvLista.innerHTML = '<p class="muted">Cargando…</p>'

  const { data, error } = await supabase.rpc('obtener_conversaciones_bot')
  if (error) {
    console.error(error)
    elConvLista.innerHTML = '<p class="muted">No se pudieron cargar las conversaciones.</p>'
    return
  }

  if (data.length === 0) {
    elConvLista.innerHTML = '<p class="muted">Todavía no hay conversaciones registradas.</p>'
    return
  }

  elConvLista.innerHTML = data.map(c => `
    <div class="conv-fila" data-numero="${c.numero_cliente}">
      <div class="conv-avatar">${iniciales(c.nombre || c.numero_cliente)}</div>
      <div class="conv-info">
        <p class="conv-nombre">${c.nombre || c.numero_cliente}</p>
        <p class="conv-preview">${c.ultimo_mensaje || ''}</p>
      </div>
      <span class="conv-fecha">${formatoFechaCorta(c.ultima_fecha)}</span>
    </div>
  `).join('')
}

elConvLista.addEventListener('click', (e) => {
  const fila = e.target.closest('.conv-fila')
  if (!fila) return
  abrirHilo(fila.dataset.numero)
})

async function abrirHilo(numeroCliente) {
  pantallaLista.classList.add('oculto')
  pantallaHilo.classList.remove('oculto')
  elContactoCard.innerHTML = '<p class="muted">Cargando…</p>'
  elMensajes.innerHTML = ''

  const { data, error } = await supabase.rpc('obtener_hilo_conversacion', { p_numero_cliente: numeroCliente })
  if (error) {
    console.error(error)
    elContactoCard.innerHTML = '<p class="muted">No se pudo cargar la conversación.</p>'
    return
  }

  const contacto = data.contacto
  elContactoCard.innerHTML = `
    <p class="conv-nombre">${contacto?.nombre || numeroCliente}</p>
    <p>${numeroCliente}</p>
    ${contacto ? `<p>Cliente desde ${formatoFechaHora(contacto.primera_interaccion)}</p>` : ''}
  `

  elMensajes.innerHTML = data.mensajes.map(m => `
    ${m.mensaje_cliente ? `
      <div class="conv-burbuja conv-burbuja-cliente">
        ${m.mensaje_cliente}
        <span class="conv-burbuja-hora">${formatoFechaHora(m.creado_en)}</span>
      </div>
    ` : ''}
    ${m.respuesta_bot ? `
      <div class="conv-burbuja conv-burbuja-bot">
        ${m.respuesta_bot}
      </div>
    ` : ''}
  `).join('')

  elMensajes.scrollIntoView({ block: 'end' })
}

btnVolverLista.addEventListener('click', () => {
  pantallaHilo.classList.add('oculto')
  pantallaLista.classList.remove('oculto')
})
