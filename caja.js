import { supabase, obtenerSesionActual, aplicarVisibilidadSidebarPorRol } from './sesion.js'

const vistaCaja = document.getElementById('vista-caja')
const tarjetaCaja = document.getElementById('tarjeta-caja')

function formatoMoneda(n) {
  return '$' + Math.round(n).toLocaleString('es-AR')
}

// --- Sesión: esta pantalla requiere estar logueado, igual que el resto del panel ---
const sesion = await obtenerSesionActual({ forzarRecarga: true })
if (!sesion || !sesion.rol || sesion.rol === 'vendedor') {
  window.location.href = 'admin-v2.html'
} else {
  aplicarVisibilidadSidebarPorRol(sesion.rol)
  vistaCaja.classList.remove('oculto')
  cargarEstadoCaja()
}

document.getElementById('btn-salir').addEventListener('click', async () => {
  await supabase.auth.signOut()
  window.location.href = 'admin-v2.html'
})

// --- Caja diaria (apertura/cierre, simplificado: no contempla retiros durante el día) ---

// Las ventas en efectivo del día se cuentan igual que en cerrar_caja:
// pedidos pagados hoy. El día arranca a las 00:00 de Argentina (UTC-3, sin horario de verano).
function inicioDelDia() {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date())
  return `${hoy}T00:00:00-03:00`
}

async function obtenerEfectivoVentasHoy() {
  const { data, error } = await supabase
    .from('pedidos')
    .select('monto_efectivo')
    .eq('estado', 'pagado')
    .gte('pagado_en', inicioDelDia())
  if (error) {
    console.error(error)
    return null
  }
  return data.reduce((total, p) => total + Number(p.monto_efectivo || 0), 0)
}

async function cargarEstadoCaja() {
  const { data, error } = await supabase.rpc('obtener_estado_caja_hoy')
  if (error) {
    console.error(error)
    tarjetaCaja.innerHTML = `<p class="error">No se pudo cargar la caja: ${error.message}</p>`
    return
  }
  const ventas = data.estado === 'abierta' ? await obtenerEfectivoVentasHoy() : null
  dibujarCaja(data, ventas)
}

const SIN_DATO = '$ —'

const ESTADOS_CAJA = {
  sin_abrir: { texto: 'Sin abrir', clase: 'caja-estado-pendiente' },
  abierta: { texto: 'Caja abierta', clase: 'caja-estado-abierta' },
  cerrada: { texto: 'Caja cerrada', clase: 'caja-estado-cerrada' }
}

function tarjetaDato(titulo, detalle, valor, idValor) {
  return `
    <div class="caja-dato">
      <span>${titulo}</span>
      <small>${detalle}</small>
      <strong${idValor ? ` id="${idValor}"` : ''}>${valor}</strong>
    </div>
  `
}

function dibujarCaja(estado, ventasHoy) {
  const info = ESTADOS_CAJA[estado.estado]
  let fondo = SIN_DATO
  let ventas = SIN_DATO
  let esperado = SIN_DATO

  if (estado.estado === 'abierta') {
    fondo = formatoMoneda(estado.fondo_inicial)
    if (ventasHoy !== null) {
      ventas = formatoMoneda(ventasHoy)
      esperado = formatoMoneda(Number(estado.fondo_inicial) + ventasHoy)
    }
  } else if (estado.estado === 'cerrada') {
    fondo = formatoMoneda(estado.fondo_inicial)
    ventas = formatoMoneda(Number(estado.efectivo_esperado_cierre) - Number(estado.fondo_inicial))
    esperado = formatoMoneda(estado.efectivo_esperado_cierre)
  }

  const apertura = estado.estado === 'sin_abrir' ? `
    <section class="caja-tarjeta caja-bloque-accion">
      <div>
        <h4>Iniciar la caja de hoy</h4>
        <p>Contá el efectivo con el que empezás el día. Ese monto será el fondo inicial para el cierre.</p>
      </div>
      <div class="caja-form">
        <label>Fondo inicial en efectivo
          <input type="number" id="caja-fondo-inicial" min="0" step="100" placeholder="0">
        </label>
        <button type="button" id="btn-abrir-caja" class="btn-confirmar">Abrir caja</button>
      </div>
      <p id="caja-error" class="error oculto"></p>
    </section>
  ` : ''

  const botonActualizar = estado.estado === 'abierta'
    ? '<button type="button" id="btn-actualizar-caja" class="caja-btn-actualizar">Actualizar</button>'
    : ''

  const durante = `
    <div class="caja-dia-cabecera">
      <div>
        <h4>Durante el día</h4>
        <p>Después de abrir, se registran los ingresos en efectivo hasta el cierre.</p>
      </div>
      <div class="caja-dia-acciones">
        ${botonActualizar}
        <span class="caja-estado ${info.clase}">${info.texto}</span>
      </div>
    </div>
    <div class="caja-resumen">
      ${tarjetaDato('Fondo inicial', 'Efectivo al abrir', fondo)}
      ${tarjetaDato('Ventas en efectivo', 'Ingresos registrados', ventas, 'caja-valor-ventas')}
      ${tarjetaDato('Efectivo esperado', 'Antes del arqueo', esperado, 'caja-valor-esperado')}
    </div>
  `

  let cierre = ''
  if (estado.estado === 'abierta') {
    cierre = `
      <section class="caja-tarjeta caja-bloque-accion">
        <div>
          <h4>Cerrar caja</h4>
          <p>Contá el efectivo que hay en la caja para compararlo con el esperado.</p>
        </div>
        <div class="caja-form">
          <label>Efectivo contado
            <input type="number" id="caja-efectivo-contado" min="0" step="100" placeholder="0">
          </label>
          <button type="button" id="btn-cerrar-caja" class="btn-confirmar">Cerrar caja</button>
        </div>
        <p id="caja-error" class="error oculto"></p>
      </section>
    `
  } else if (estado.estado === 'cerrada') {
    const diferencia = estado.diferencia
    const textoDif = diferencia === 0
      ? 'Cuadró justo.'
      : diferencia > 0
        ? `Sobran ${formatoMoneda(diferencia)}.`
        : `Faltan ${formatoMoneda(Math.abs(diferencia))}.`
    cierre = `
      <section class="caja-tarjeta">
        <h4>Cierre de hoy</h4>
        <div class="resultado-fila"><span class="muted">Esperado</span><span>${formatoMoneda(estado.efectivo_esperado_cierre)}</span></div>
        <div class="resultado-fila"><span class="muted">Contado</span><span>${formatoMoneda(estado.efectivo_contado_cierre)}</span></div>
        <p class="${diferencia === 0 ? 'muted' : 'resultado-negativo'}" style="font-weight:700;">${textoDif}</p>
      </section>
    `
  }

  tarjetaCaja.innerHTML = apertura + durante + cierre

  const btnAbrir = document.getElementById('btn-abrir-caja')
  if (btnAbrir) {
    btnAbrir.addEventListener('click', async () => {
      const fondoInicial = Number(document.getElementById('caja-fondo-inicial').value)
      const elError = document.getElementById('caja-error')
      const { error } = await supabase.rpc('abrir_caja', { p_fondo_inicial: fondoInicial })
      if (error) {
        elError.textContent = error.message
        elError.classList.remove('oculto')
        return
      }
      cargarEstadoCaja()
    })
  }

  const btnCerrar = document.getElementById('btn-cerrar-caja')
  if (btnCerrar) {
    btnCerrar.addEventListener('click', async () => {
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
  }

  // Actualiza solo los importes del día, sin borrar lo que se esté escribiendo en "Efectivo contado".
  const btnActualizar = document.getElementById('btn-actualizar-caja')
  if (btnActualizar) {
    btnActualizar.addEventListener('click', async () => {
      btnActualizar.disabled = true
      const ventasActuales = await obtenerEfectivoVentasHoy()
      if (ventasActuales !== null) {
        document.getElementById('caja-valor-ventas').textContent = formatoMoneda(ventasActuales)
        document.getElementById('caja-valor-esperado').textContent = formatoMoneda(Number(estado.fondo_inicial) + ventasActuales)
      }
      btnActualizar.disabled = false
    })
  }
}
