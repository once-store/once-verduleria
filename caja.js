import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = 'https://meekevxxjirvgsuppvij.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1lZWtldnh4amlydmdzdXBwdmlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU1MjQwMjMsImV4cCI6MjEwMTEwMDAyM30.MGajznwLTreSKal-1-aFcYsEHTTGC6geruLvRryQ88M'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

const vistaCaja = document.getElementById('vista-caja')
const tarjetaCaja = document.getElementById('tarjeta-caja')

function formatoMoneda(n) {
  return '$' + Math.round(n).toLocaleString('es-AR')
}

// --- Sesión: esta pantalla requiere estar logueado, igual que el resto del panel ---
const { data: { session } } = await supabase.auth.getSession()
if (!session) {
  window.location.href = 'admin-v2.html'
} else {
  vistaCaja.classList.remove('oculto')
  cargarEstadoCaja()
}

document.getElementById('btn-salir').addEventListener('click', async () => {
  await supabase.auth.signOut()
  window.location.href = 'admin-v2.html'
})

// --- Caja diaria (apertura/cierre, simplificado: no contempla retiros durante el día) ---
async function cargarEstadoCaja() {
  const { data, error } = await supabase.rpc('obtener_estado_caja_hoy')
  if (error) {
    console.error(error)
    tarjetaCaja.innerHTML = `<p class="error">No se pudo cargar la caja: ${error.message}</p>`
    return
  }
  dibujarCaja(data)
}

function dibujarCaja(estado) {
  if (estado.estado === 'sin_abrir') {
    tarjetaCaja.innerHTML = `
      <p class="muted" style="margin-top:0;">Todavía no abriste la caja hoy.</p>
      <label>Fondo inicial (efectivo con el que arrancás)
        <input type="number" id="caja-fondo-inicial" min="0" step="100">
      </label>
      <button type="button" id="btn-abrir-caja" class="btn-confirmar" style="margin-top:8px;">Abrir caja</button>
      <p id="caja-error" class="error oculto"></p>
    `
    document.getElementById('btn-abrir-caja').addEventListener('click', async () => {
      const fondo = Number(document.getElementById('caja-fondo-inicial').value)
      const elError = document.getElementById('caja-error')
      const { error } = await supabase.rpc('abrir_caja', { p_fondo_inicial: fondo })
      if (error) {
        elError.textContent = error.message
        elError.classList.remove('oculto')
        return
      }
      cargarEstadoCaja()
    })
    return
  }

  if (estado.estado === 'abierta') {
    tarjetaCaja.innerHTML = `
      <p style="margin-top:0;">Caja abierta — fondo inicial ${formatoMoneda(estado.fondo_inicial)}.</p>
      <label>Efectivo contado al cerrar
        <input type="number" id="caja-efectivo-contado" min="0" step="100">
      </label>
      <button type="button" id="btn-cerrar-caja" class="btn-confirmar" style="margin-top:8px;">Cerrar caja</button>
      <p id="caja-error" class="error oculto"></p>
    `
    document.getElementById('btn-cerrar-caja').addEventListener('click', async () => {
      const contado = Number(document.getElementById('caja-efectivo-contado').value)
      const elError = document.getElementById('caja-error')
      const { error } = await supabase.rpc('cerrar_caja', { p_efectivo_contado: contado })
      if (error) {
        elError.textContent = error.message
        elError.classList.remove('oculto')
        return
      }
      cargarEstadoCaja()
    })
    return
  }

  // cerrada
  const diferencia = estado.diferencia
  const textoDif = diferencia === 0
    ? 'Cuadró justo.'
    : diferencia > 0
      ? `Sobran ${formatoMoneda(diferencia)}.`
      : `Faltan ${formatoMoneda(Math.abs(diferencia))}.`

  tarjetaCaja.innerHTML = `
    <p style="margin-top:0;">Caja cerrada por hoy.</p>
    <div class="resultado-fila"><span class="muted">Esperado</span><span>${formatoMoneda(estado.efectivo_esperado_cierre)}</span></div>
    <div class="resultado-fila"><span class="muted">Contado</span><span>${formatoMoneda(estado.efectivo_contado_cierre)}</span></div>
    <p class="${diferencia === 0 ? 'muted' : 'resultado-negativo'}" style="font-weight:700;">${textoDif}</p>
  `
}
