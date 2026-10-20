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

// --- Caja diaria: apertura, movimientos del día y cierre ---
// Todo sale de las funciones de la base (estado, movimientos y sugerencias): la pantalla no calcula plata.
const esDueno = sesion?.rol === 'dueno'
const SIN_DATO = '$ —'

const ESTADOS_CAJA = {
  sin_abrir: { texto: 'Sin abrir', clase: 'caja-estado-pendiente' },
  abierta: { texto: 'Caja abierta', clase: 'caja-estado-abierta' },
  cerrada: { texto: 'Caja cerrada', clase: 'caja-estado-cerrada' }
}

function escaparTexto(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function formatoHora(iso) {
  return new Date(iso).toLocaleTimeString('es-AR', {
    hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires'
  })
}

async function cargarEstadoCaja(opciones = {}) {
  const [estado, movimientos, conceptos, deudas] = await Promise.all([
    supabase.rpc('obtener_estado_caja_hoy'),
    supabase.rpc('obtener_movimientos_caja_hoy'),
    supabase.rpc('obtener_conceptos_gasto'),
    supabase.rpc('obtener_deudas_pendientes_caja')
  ])
  if (estado.error) {
    console.error(estado.error)
    tarjetaCaja.innerHTML = `<p class="error">No se pudo cargar la caja: ${escaparTexto(estado.error.message)}</p>`
    return
  }
  if (movimientos.error) console.error(movimientos.error)
  if (conceptos.error) console.error(conceptos.error)
  if (deudas.error) console.error(deudas.error)
  dibujarCaja(estado.data, movimientos.data || [], conceptos.data || [], deudas.data || [], opciones)
}

function tarjetaDato(titulo, detalle, valor) {
  return `
    <div class="caja-dato">
      <span>${titulo}</span>
      <small>${detalle}</small>
      <strong>${valor}</strong>
    </div>
  `
}

function htmlApertura(estado) {
  const sugerido = Number(estado.efectivo_sugerido_apertura || 0)
  const queQuedo = sugerido > 0
    ? `<p class="caja-ayuda">En la caja quedó <strong>${formatoMoneda(sugerido)}</strong> desde el último cierre. Si contás otro monto, la diferencia queda registrada.</p>`
    : ''
  return `
    <section class="caja-tarjeta caja-bloque-accion">
      <div>
        <h4>Iniciar la caja de hoy</h4>
        <p>Contá el efectivo con el que empezás el día. Ese monto será el fondo inicial para el cierre.</p>
        ${queQuedo}
      </div>
      <div class="caja-form">
        <label>Fondo inicial en efectivo
          <input type="number" id="caja-fondo-inicial" min="0" step="100" placeholder="0" value="${sugerido > 0 ? sugerido : ''}">
        </label>
        <button type="button" id="btn-abrir-caja" class="btn-confirmar">Abrir caja</button>
      </div>
      <p id="caja-error" class="error oculto"></p>
    </section>
  `
}

function htmlFormularioSalida(estado, conceptos) {
  const ayuda = estado.estado === 'abierta'
    ? 'El importe se descuenta del efectivo esperado de hoy.'
    : 'La caja no está abierta: se descuenta del efectivo que quedó y se tiene en cuenta al abrir la próxima.'
  const opciones = conceptos.map(c => `<option value="${escaparTexto(c)}"></option>`).join('')
  return `
    <section class="caja-tarjeta caja-salida">
      <h4>Registrar una salida</h4>
      <p>Anotá lo que sale de la caja: un gasto, o un retiro para guardar efectivo aparte.</p>
      <div class="caja-tipos">
        <button type="button" class="caja-tipo activa" data-tipo="gasto">Gasto del día</button>
        <button type="button" class="caja-tipo" data-tipo="retiro">Retiro a resguardo</button>
      </div>
      <div class="caja-salida-campos">
        <label><span id="caja-salida-etiqueta">Concepto</span>
          <input type="text" id="caja-salida-concepto" list="caja-conceptos" maxlength="80" autocomplete="off" placeholder="Elegí o escribí un concepto">
          <datalist id="caja-conceptos">${opciones}</datalist>
        </label>
        <label>Importe
          <input type="number" id="caja-salida-monto" min="0" step="any" inputmode="decimal" placeholder="0">
        </label>
      </div>
      <p class="caja-ayuda">${ayuda}</p>
      <button type="button" id="btn-registrar-salida" class="btn-confirmar">Registrar salida</button>
      <p id="caja-salida-error" class="error oculto"></p>
    </section>
  `
}

function textoVencimiento(iso) {
  const [anio, mes, dia] = iso.split('-')
  return `${dia}/${mes}`
}

// Cuando viene el cobrador: se paga en efectivo de la caja, total o una parte. Lo que falta queda pendiente
// y el dueño lo paga después desde Finanzas. Solo aparece si hay deudas de compras pendientes.
function htmlPagoProveedor(deudas) {
  if (!deudas.length) return ''
  const opciones = deudas.map(d => `
    <option value="${d.id}" data-saldo="${d.saldo}">${escaparTexto(d.proveedor || 'Sin proveedor')} · debe ${formatoMoneda(d.saldo)} · vence ${textoVencimiento(d.vencimiento)}</option>`).join('')
  return `
    <section class="caja-tarjeta caja-proveedor">
      <h4>Pagar a un proveedor</h4>
      <p>Para cuando viene el cobrador. Se paga solo con efectivo de la caja; si no alcanza, pagá una parte y avisale al dueño: el resto queda pendiente.</p>
      <div class="caja-salida-campos">
        <label>Deuda
          <select id="caja-deuda">${opciones}</select>
        </label>
        <label>Importe a pagar
          <input type="number" id="caja-deuda-monto" min="0" step="any" inputmode="decimal" placeholder="0">
        </label>
      </div>
      <p class="caja-ayuda" id="caja-deuda-ayuda"></p>
      <button type="button" id="btn-pagar-deuda" class="btn-confirmar">Pagar en efectivo</button>
      <p id="caja-deuda-error" class="error oculto"></p>
    </section>
  `
}

function htmlMovimientos(estado, movimientos) {
  const filas = []
  if (estado.estado !== 'sin_abrir') {
    filas.push(`<tr><td><strong>Fondo inicial</strong></td><td>Efectivo</td><td class="caja-importe">${formatoMoneda(estado.fondo_inicial)}</td></tr>`)
    filas.push(`<tr><td><strong>Ventas cobradas</strong></td><td>Efectivo</td><td class="caja-importe">${formatoMoneda(estado.efectivo_ventas || 0)}</td></tr>`)
  }
  // El servidor los manda del más nuevo al más viejo; acá se muestran en el orden en que ocurrieron.
  const ordenados = [...movimientos].reverse()
  ordenados.forEach(m => {
    const tipo = m.tipo === 'traslado' ? (m.signo < 0 ? 'Retiro' : 'Traslado')
      : ({ gasto: 'Gasto', ingreso: 'Aporte', ajuste: 'Ajuste' }[m.tipo] || m.tipo)
    const meta = [formatoHora(m.creado_en), m.registrado_por, m.fuera_de_turno ? 'fuera de turno' : null]
      .filter(Boolean).map(escaparTexto).join(' · ')
    const importe = `${m.signo > 0 ? '+' : '−'}${formatoMoneda(m.monto)}`
    const anular = esDueno && !m.anulado && m.tipo !== 'ajuste'
      ? `<button type="button" class="caja-anular" data-id="${m.id}">Anular</button>` : ''
    filas.push(`
      <tr class="${m.anulado ? 'caja-mov-anulado' : ''}">
        <td><strong>${escaparTexto(m.concepto)}</strong><small>${meta}${m.anulado ? ' · anulado' : ''}</small></td>
        <td>${tipo}</td>
        <td class="caja-importe ${m.signo < 0 ? 'caja-neg' : 'caja-pos'}">${importe}${anular}</td>
      </tr>`)
  })
  let total = ''
  if (estado.estado === 'abierta') {
    total = `<tr class="caja-total"><td colspan="2">Efectivo esperado</td><td class="caja-importe">${formatoMoneda(estado.efectivo_esperado)}</td></tr>`
  } else if (estado.estado === 'sin_abrir') {
    total = `<tr class="caja-total"><td colspan="2">Efectivo en caja ahora</td><td class="caja-importe">${formatoMoneda(estado.efectivo_sugerido_apertura || 0)}</td></tr>`
  }
  const cuerpo = filas.length + (total ? 1 : 0) === 0
    ? '<p class="caja-vacio">Todavía no hay movimientos hoy.</p>'
    : `<table class="caja-tabla"><thead><tr><th>Movimiento</th><th>Tipo</th><th class="caja-importe">Importe</th></tr></thead><tbody>${filas.join('')}${total}</tbody></table>`
  return `
    <section class="caja-tarjeta caja-movimientos">
      <h4>Movimientos de hoy</h4>
      <p>Ingresos y salidas que explican el efectivo esperado.</p>
      ${cuerpo}
    </section>
  `
}

function htmlCierre(estado) {
  if (estado.estado === 'abierta') {
    return `
      <section class="caja-tarjeta caja-bloque-accion caja-cierre">
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
  }
  if (estado.estado === 'cerrada') {
    const diferencia = estado.diferencia
    const textoDif = diferencia === 0
      ? 'Cuadró justo.'
      : diferencia > 0
        ? `Sobran ${formatoMoneda(diferencia)}.`
        : `Faltan ${formatoMoneda(Math.abs(diferencia))}.`
    return `
      <section class="caja-tarjeta">
        <h4>Cierre de hoy</h4>
        <div class="resultado-fila"><span class="muted">Esperado</span><span>${formatoMoneda(estado.efectivo_esperado_cierre)}</span></div>
        <div class="resultado-fila"><span class="muted">Contado</span><span>${formatoMoneda(estado.efectivo_contado_cierre)}</span></div>
        <p class="${diferencia === 0 ? 'muted' : 'resultado-negativo'}" style="font-weight:700;">${textoDif}</p>
      </section>
    `
  }
  return ''
}

function dibujarCaja(estado, movimientos, conceptos, deudas, opciones = {}) {
  const info = ESTADOS_CAJA[estado.estado]
  let fondo = SIN_DATO
  let ventas = SIN_DATO
  let esperado = SIN_DATO
  if (estado.estado !== 'sin_abrir') {
    fondo = formatoMoneda(estado.fondo_inicial)
    ventas = formatoMoneda(estado.efectivo_ventas || 0)
    esperado = formatoMoneda(estado.estado === 'abierta' ? estado.efectivo_esperado : estado.efectivo_esperado_cierre)
  }

  // Al actualizar no se pierde lo que se estaba escribiendo.
  const guardado = opciones.conservarCampos ? {
    concepto: document.getElementById('caja-salida-concepto')?.value,
    monto: document.getElementById('caja-salida-monto')?.value,
    contado: document.getElementById('caja-efectivo-contado')?.value,
    fondo: document.getElementById('caja-fondo-inicial')?.value,
    deuda: document.getElementById('caja-deuda')?.value,
    deudaMonto: document.getElementById('caja-deuda-monto')?.value,
    tipo: document.querySelector('.caja-tipo.activa')?.dataset.tipo
  } : null

  tarjetaCaja.innerHTML = `
    ${estado.estado === 'sin_abrir' ? htmlApertura(estado) : ''}
    <div class="caja-dia-cabecera">
      <div>
        <h4>Durante el día</h4>
        <p>Después de abrir, se registran los ingresos en efectivo hasta el cierre.</p>
      </div>
      <div class="caja-dia-acciones">
        <button type="button" id="btn-actualizar-caja" class="caja-btn-actualizar">Actualizar</button>
        <span class="caja-estado ${info.clase}">${info.texto}</span>
      </div>
    </div>
    <div class="caja-resumen">
      ${tarjetaDato('Fondo inicial', 'Efectivo al abrir', fondo)}
      ${tarjetaDato('Ventas en efectivo', 'Ingresos registrados', ventas)}
      ${tarjetaDato('Efectivo esperado', 'Antes del arqueo', esperado)}
    </div>
    <div class="caja-columnas">
      <div class="caja-col">${htmlFormularioSalida(estado, conceptos)}${htmlPagoProveedor(deudas)}</div>
      <div class="caja-col">${htmlMovimientos(estado, movimientos)}${htmlCierre(estado)}</div>
    </div>
  `

  if (guardado) {
    const poner = (id, valor) => { const el = document.getElementById(id); if (el && valor) el.value = valor }
    poner('caja-salida-concepto', guardado.concepto)
    poner('caja-salida-monto', guardado.monto)
    poner('caja-efectivo-contado', guardado.contado)
    poner('caja-fondo-inicial', guardado.fondo)
    poner('caja-deuda', guardado.deuda)
    poner('caja-deuda-monto', guardado.deudaMonto)
    if (guardado.tipo === 'retiro') elegirTipoSalida('retiro')
  }

  conectarEventosCaja()
}

function elegirTipoSalida(tipo) {
  document.querySelectorAll('.caja-tipo').forEach(b => b.classList.toggle('activa', b.dataset.tipo === tipo))
  const concepto = document.getElementById('caja-salida-concepto')
  const etiqueta = document.getElementById('caja-salida-etiqueta')
  const boton = document.getElementById('btn-registrar-salida')
  if (tipo === 'retiro') {
    etiqueta.textContent = 'Concepto (opcional)'
    concepto.placeholder = 'Retiro a resguardo'
    concepto.removeAttribute('list')
    boton.textContent = 'Registrar retiro'
  } else {
    etiqueta.textContent = 'Concepto'
    concepto.placeholder = 'Elegí o escribí un concepto'
    concepto.setAttribute('list', 'caja-conceptos')
    boton.textContent = 'Registrar salida'
  }
}

function mostrarError(id, mensaje) {
  const el = document.getElementById(id)
  if (!el) return
  el.textContent = mensaje
  el.classList.remove('oculto')
}

function conectarEventosCaja() {
  document.querySelectorAll('.caja-tipo').forEach(b => {
    b.addEventListener('click', () => {
      if (b.classList.contains('activa')) return
      elegirTipoSalida(b.dataset.tipo)
      document.getElementById('caja-salida-concepto').value = '' // el concepto de un gasto no se arrastra a un retiro
    })
  })

  document.getElementById('btn-actualizar-caja').addEventListener('click', async e => {
    e.currentTarget.disabled = true
    await cargarEstadoCaja({ conservarCampos: true })
  })

  const btnAbrir = document.getElementById('btn-abrir-caja')
  if (btnAbrir) {
    btnAbrir.addEventListener('click', async () => {
      const fondoInicial = Number(document.getElementById('caja-fondo-inicial').value)
      const { error } = await supabase.rpc('abrir_caja', { p_fondo_inicial: fondoInicial })
      if (error) { mostrarError('caja-error', error.message); return }
      cargarEstadoCaja()
    })
  }

  const btnCerrar = document.getElementById('btn-cerrar-caja')
  if (btnCerrar) {
    btnCerrar.addEventListener('click', async () => {
      const contado = Number(document.getElementById('caja-efectivo-contado').value)
      const { error } = await supabase.rpc('cerrar_caja', { p_efectivo_contado: contado })
      if (error) { mostrarError('caja-error', error.message); return }
      cargarEstadoCaja()
    })
  }

  document.getElementById('btn-registrar-salida').addEventListener('click', async e => {
    const boton = e.currentTarget
    const tipo = document.querySelector('.caja-tipo.activa').dataset.tipo
    const concepto = document.getElementById('caja-salida-concepto').value.trim()
    const monto = Number(document.getElementById('caja-salida-monto').value)
    document.getElementById('caja-salida-error').classList.add('oculto')

    if (!(monto > 0)) { mostrarError('caja-salida-error', 'Ingresá un importe mayor a 0.'); return }
    if (tipo === 'gasto' && !concepto) { mostrarError('caja-salida-error', 'Escribí el concepto del gasto.'); return }

    boton.disabled = true
    const { error } = tipo === 'retiro'
      ? await supabase.rpc('registrar_retiro_resguardo', { p_monto: monto, p_concepto: concepto || null })
      : await supabase.rpc('registrar_salida', { p_monto: monto, p_concepto: concepto })
    if (error) {
      boton.disabled = false
      mostrarError('caja-salida-error', error.message)
      return
    }
    cargarEstadoCaja()
  })

  const selDeuda = document.getElementById('caja-deuda')
  if (selDeuda) {
    const saldoElegido = () => Number(selDeuda.selectedOptions[0].dataset.saldo)
    const actualizarAyudaDeuda = () => {
      const saldo = saldoElegido()
      const monto = Number(document.getElementById('caja-deuda-monto').value) || 0
      document.getElementById('caja-deuda-ayuda').textContent = monto > 0 && monto < saldo
        ? `Quedan ${formatoMoneda(saldo - monto)} pendientes: avisale al dueño para que pague el resto.`
        : `Saldo pendiente: ${formatoMoneda(saldo)}.`
    }
    selDeuda.addEventListener('change', () => {
      document.getElementById('caja-deuda-monto').value = String(saldoElegido())
      actualizarAyudaDeuda()
    })
    document.getElementById('caja-deuda-monto').addEventListener('input', actualizarAyudaDeuda)
    if (!document.getElementById('caja-deuda-monto').value) document.getElementById('caja-deuda-monto').value = String(saldoElegido())
    actualizarAyudaDeuda()

    document.getElementById('btn-pagar-deuda').addEventListener('click', async e => {
      const boton = e.currentTarget
      const monto = Number(document.getElementById('caja-deuda-monto').value)
      document.getElementById('caja-deuda-error').classList.add('oculto')
      if (!(monto > 0)) { mostrarError('caja-deuda-error', 'Ingresá un importe mayor a 0.'); return }
      if (monto > saldoElegido() + 0.005) {
        mostrarError('caja-deuda-error', `Esa deuda es de ${formatoMoneda(saldoElegido())}.`)
        return
      }
      boton.disabled = true
      const { error } = await supabase.rpc('pagar_deuda_en_caja', { p_id: selDeuda.value, p_monto: monto })
      if (error) {
        boton.disabled = false
        mostrarError('caja-deuda-error', error.message)
        return
      }
      cargarEstadoCaja()
    })
  }

  document.querySelectorAll('.caja-anular').forEach(b => {
    b.addEventListener('click', async () => {
      const motivo = window.prompt('¿Por qué anulás este movimiento? (queda registrado)')
      if (!motivo || !motivo.trim()) return
      b.disabled = true
      const { error } = await supabase.rpc('anular_movimiento', { p_id: b.dataset.id, p_motivo: motivo.trim() })
      if (error) { b.disabled = false; window.alert(error.message); return }
      cargarEstadoCaja({ conservarCampos: true })
    })
  })
}
