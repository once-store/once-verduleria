import {
  supabase,
  obtenerSesionActual,
  aplicarVisibilidadSidebarPorRol,
  renderizarSelectorLocal,
  obtenerLocalFiltroActivo
} from './sesion.js'

// --- Finanzas: solo para el Dueño. Todo sale de las funciones de la base; la pantalla no calcula plata. ---

const $ = id => document.getElementById(id)
const vista = $('vista-finanzas')

const filtroLocal = obtenerLocalFiltroActivo() // null = todos los locales
let datos = { resumen: null, movimientos: [], locales: [] }
let sesion = null
let pagoActual = null
let ajusteActual = null
let tipoMovimiento = 'gasto'

const TIPOS_CUENTA = {
  caja: 'Efectivo · caja del local',
  resguardo: 'Efectivo resguardado',
  banco: 'Cuenta bancaria',
  billetera: 'Billetera virtual'
}
const MESES = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC']

// ---------- utilidades ----------
function fmt(n) {
  const v = Math.round(Number(n) || 0)
  return `${v < 0 ? '−' : ''}$${Math.abs(v).toLocaleString('es-AR')}`
}

function escapar(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function hoyAR() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date())
}

function fechaMasDias(dias) {
  const [a, m, d] = hoyAR().split('-').map(Number)
  const f = new Date(Date.UTC(a, m - 1, d + dias))
  return f.toISOString().slice(0, 10)
}

function diasHasta(iso) {
  const [a, m, d] = iso.split('-').map(Number)
  const [a2, m2, d2] = hoyAR().split('-').map(Number)
  return Math.round((Date.UTC(a, m - 1, d) - Date.UTC(a2, m2 - 1, d2)) / 86400000)
}

function textoFecha(iso) {
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}

function textoVence(dias) {
  if (dias < 0) return `Vencido hace ${-dias} ${dias === -1 ? 'día' : 'días'}`
  if (dias === 0) return 'Vence hoy'
  if (dias === 1) return 'Vence mañana'
  return `Vence en ${dias} días`
}

function nombreLocal(id) {
  return datos.locales.find(l => l.id === id)?.nombre || 'Local'
}

function mostrarError(id, mensaje) {
  const el = $(id)
  el.textContent = mensaje
  el.classList.remove('oculto')
}

function limpiarError(id) {
  $(id).classList.add('oculto')
}

function redondear2(n) {
  return Math.round(n * 100) / 100
}

// El local sobre el que se opera: el filtro elegido o, si es "Todos", el local del usuario.
function localOperativo() {
  return filtroLocal || sesion?.localId || null
}

// ---------- carga ----------
async function cargarFinanzas() {
  limpiarError('fin-error')
  const [resumen, movimientos, locales] = await Promise.all([
    supabase.rpc('obtener_resumen_finanzas', { p_local_id: filtroLocal }),
    supabase.rpc('obtener_movimientos_recientes', { p_local_id: filtroLocal, p_limite: 40 }),
    supabase.from('locales').select('id, nombre').order('nombre')
  ])
  if (resumen.error) {
    console.error(resumen.error)
    mostrarError('fin-error', `No se pudo cargar Finanzas: ${resumen.error.message}`)
    $('fin-kpis').innerHTML = ''
    return
  }
  if (movimientos.error) console.error(movimientos.error)
  if (locales.error) console.error(locales.error)
  datos = {
    resumen: resumen.data,
    movimientos: movimientos.data || [],
    locales: locales.data || []
  }
  dibujar()
}

function dibujar() {
  dibujarKpis()
  dibujarCuentas()
  dibujarMovimientos()
  dibujarVencimientos()
  dibujarPagos()
}

// ---------- dibujo ----------
function dibujarKpis() {
  const r = datos.resumen
  const pendientes = r.compromisos.length
  const proximo = r.compromisos[0]
  const kpi = (titulo, valor, detalle, clase = '') => `
    <div class="fin-kpi">
      <span>${titulo}</span>
      <strong class="${clase}">${valor}</strong>
      <small>${detalle}</small>
    </div>`
  $('fin-kpis').innerHTML = [
    kpi('Dinero disponible', fmt(r.dinero_disponible),
      filtroLocal ? `En las cuentas de ${escapar(nombreLocal(filtroLocal))} y del negocio` : 'En todas las cuentas activas',
      r.dinero_disponible < 0 ? 'fin-neg' : ''),
    kpi('Efectivo en caja', fmt(r.efectivo_en_caja), 'Suma de la caja de cada local'),
    kpi('Pagos pendientes', fmt(r.pagos_pendientes),
      pendientes
        ? `${pendientes} ${pendientes === 1 ? 'compromiso' : 'compromisos'} · próximo ${textoFecha(proximo.vencimiento).slice(0, 5)}`
        : 'No hay pagos pendientes'),
    kpi('Disponible luego de pagos', fmt(r.disponible_luego_de_pagos), 'Dinero disponible menos lo pendiente',
      r.disponible_luego_de_pagos < 0 ? 'fin-neg' : '')
  ].join('')

  const aviso = $('fin-tab-aviso')
  aviso.textContent = pendientes
  aviso.classList.toggle('oculto', pendientes === 0)
}

function dibujarCuentas() {
  const cuentas = datos.resumen.cuentas
  $('fin-cuentas').innerHTML = cuentas.length
    ? cuentas.map(c => `
      <div class="fin-cuenta">
        <div>
          <strong>${escapar(c.nombre)}</strong>
          <small>${TIPOS_CUENTA[c.tipo] || escapar(c.tipo)}${c.local_id ? '' : ' · todo el negocio'}</small>
        </div>
        <div class="fin-cuenta-saldo">
          <strong class="${c.saldo < 0 ? 'fin-neg' : ''}">${fmt(c.saldo)}</strong>
          ${c.tipo !== 'caja' ? `<button type="button" class="fin-link" data-ajustar="${c.id}">Ajustar saldo</button>` : ''}
        </div>
      </div>`).join('')
    : '<p class="fin-vacio">Todavía no hay cuentas.</p>'
}

function describirMovimiento(m) {
  if (m.tipo === 'gasto') return { signo: -1, cuenta: m.origen, tipo: 'Gasto' }
  if (m.tipo === 'ingreso') return { signo: 1, cuenta: m.destino, tipo: 'Ingreso' }
  if (m.tipo === 'traslado') return { signo: 0, cuenta: `${m.origen} → ${m.destino}`, tipo: 'Traslado' }
  return { signo: m.destino ? 1 : -1, cuenta: m.destino || m.origen, tipo: 'Ajuste' }
}

function dibujarMovimientos() {
  const filas = datos.movimientos.map(m => {
    const d = describirMovimiento(m)
    const cuando = new Date(m.creado_en).toLocaleString('es-AR', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
      timeZone: 'America/Argentina/Buenos_Aires'
    })
    const meta = [cuando, m.registrado_por, m.anulado ? `anulado${m.motivo_anulacion ? ': ' + m.motivo_anulacion : ''}` : null]
      .filter(Boolean).map(escapar).join(' · ')
    const clase = d.signo < 0 ? 'fin-neg' : d.signo > 0 ? 'fin-pos' : ''
    const importe = d.signo === 0 ? fmt(m.monto) : `${d.signo > 0 ? '+' : '−'}${fmt(m.monto)}`
    const anular = !m.anulado && m.tipo !== 'ajuste'
      ? `<button type="button" class="fin-link fin-link-peligro" data-anular="${m.id}">Anular</button>` : ''
    return `
      <tr class="${m.anulado ? 'fin-anulado' : ''}">
        <td><strong>${escapar(m.concepto)}</strong><small>${meta}</small></td>
        <td>${d.tipo}</td>
        <td>${escapar(d.cuenta)}</td>
        <td class="fin-importe ${clase}">${importe}${anular}</td>
      </tr>`
  })
  $('fin-movimientos').innerHTML = filas.length
    ? `<div class="fin-tabla-wrap"><table class="fin-tabla">
         <thead><tr><th>Movimiento</th><th>Tipo</th><th>Cuenta</th><th class="fin-importe">Importe</th></tr></thead>
         <tbody>${filas.join('')}</tbody></table></div>`
    : '<p class="fin-vacio">Todavía no hay movimientos.</p>'
}

function htmlFecha(iso) {
  const dias = diasHasta(iso)
  const [, mes, dia] = iso.split('-')
  const clase = dias < 0 ? 'fin-fecha-vencido' : dias <= 3 ? 'fin-fecha-pronto' : ''
  return `<div class="fin-fecha ${clase}"><span>${MESES[Number(mes) - 1]}</span><strong>${dia}</strong></div>`
}

function dibujarVencimientos() {
  const comp = datos.resumen.compromisos
  const proximos = comp.slice(0, 4).map(c => `
    <div class="fin-venc">
      ${htmlFecha(c.vencimiento)}
      <div>
        <strong>${escapar(c.concepto)}</strong>
        <small>${textoVence(diasHasta(c.vencimiento))}${c.monto_es_estimado ? ' · estimado' : c.pagado > 0 ? ' · pago parcial' : ''}</small>
      </div>
      <span class="fin-venc-monto">${fmt(c.saldo)}</span>
    </div>`).join('')
  $('fin-vencimientos').innerHTML = comp.length
    ? `${proximos}<div class="fin-total"><span>Total pendiente</span><strong>${fmt(datos.resumen.pagos_pendientes)}</strong></div>`
    : '<p class="fin-vacio">No hay pagos pendientes.</p>'
}

function dibujarPagos() {
  const comp = datos.resumen.compromisos
  $('fin-pagos').innerHTML = comp.length
    ? comp.map(c => {
      const detalle = [
        c.proveedor ? escapar(c.proveedor) : null,
        datos.locales.length > 1 ? escapar(nombreLocal(c.local_id)) : null,
        c.monto_es_estimado ? 'monto estimado' : (c.pagado > 0 ? `pagaste ${fmt(c.pagado)} de ${fmt(c.monto)}` : null),
        c.repite === 'mensual' ? 'se repite todos los meses' : null
      ].filter(Boolean).join(' · ')
      return `
        <div class="fin-pago">
          ${htmlFecha(c.vencimiento)}
          <div class="fin-pago-datos">
            <strong>${escapar(c.concepto)}</strong>
            <small>${textoVence(diasHasta(c.vencimiento))}${detalle ? ' · ' + detalle : ''}</small>
          </div>
          <div class="fin-pago-monto">
            <strong>${fmt(c.saldo)}</strong>
            <button type="button" class="fin-btn fin-btn-primario" data-pagar="${c.id}">Pagar</button>
          </div>
        </div>`
    }).join('')
    : '<p class="fin-vacio">No hay pagos pendientes. Cuando una compra quede "A pagar" o cargues un vencimiento, aparece acá.</p>'
}

// ---------- diálogos ----------
function cuentasDeLocal(localId) {
  return datos.resumen.cuentas.filter(c => c.local_id === localId || c.local_id === null)
}

function llenarCuentas(select, cuentas, seleccion) {
  select.innerHTML = cuentas
    .map(c => `<option value="${c.id}">${escapar(c.nombre)} (${fmt(c.saldo)})</option>`).join('')
  if (seleccion) select.value = seleccion
}

function llenarLocales(select, conVacio) {
  const opciones = datos.locales.map(l => `<option value="${l.id}">${escapar(l.nombre)}</option>`)
  select.innerHTML = (conVacio ? '<option value="">Todo el negocio</option>' : '') + opciones.join('')
}

function abrirPagar(id) {
  const c = datos.resumen.compromisos.find(x => x.id === id)
  if (!c) return
  pagoActual = c
  $('pagar-titulo').textContent = c.concepto
  $('pagar-info').textContent = c.monto_es_estimado
    ? `Monto estimado ${fmt(c.monto)}. Cargá el monto real de este mes.`
    : `Saldo pendiente ${fmt(c.saldo)} de ${fmt(c.monto)}${c.pagado > 0 ? ` (ya pagaste ${fmt(c.pagado)})` : ''}. Podés pagar solo una parte.`
  $('pagar-etiqueta-monto').textContent = c.monto_es_estimado ? 'Monto real' : 'Monto a pagar ahora'
  $('pagar-monto').value = String(redondear2(c.saldo))
  if (c.monto_es_estimado) $('pagar-monto').removeAttribute('max')
  else $('pagar-monto').max = String(redondear2(c.saldo))
  const cuentas = cuentasDeLocal(c.local_id)
  llenarCuentas($('pagar-cuenta'), cuentas, cuentas.find(x => x.tipo === 'caja')?.id)
  $('pagar-fecha').value = hoyAR()
  limpiarError('pagar-error')
  $('dlg-pagar').showModal()
}

function abrirPagoNuevo() {
  $('pn-concepto').value = ''
  $('pn-monto').value = ''
  $('pn-vencimiento').value = fechaMasDias(7)
  $('pn-repite').value = 'no'
  llenarLocales($('pn-local'), false)
  if (localOperativo()) $('pn-local').value = localOperativo()
  $('pn-local-label').classList.toggle('oculto', datos.locales.length < 2)
  limpiarError('pn-error')
  $('dlg-pago-nuevo').showModal()
}

function ajustarLocalCuenta() {
  const tipo = $('cu-tipo').value
  $('cu-local').value = tipo === 'resguardo' ? (localOperativo() || '') : ''
}

function abrirCuenta() {
  $('cu-nombre').value = ''
  $('cu-tipo').value = 'banco'
  $('cu-saldo').value = '0'
  llenarLocales($('cu-local'), true)
  ajustarLocalCuenta()
  $('cu-local-label').classList.toggle('oculto', datos.locales.length < 2)
  limpiarError('cu-error')
  $('dlg-cuenta').showModal()
}

function abrirAjuste(id) {
  const c = datos.resumen.cuentas.find(x => x.id === id)
  if (!c) return
  ajusteActual = c
  $('aj-titulo').textContent = `Ajustar saldo · ${c.nombre}`
  $('aj-info').textContent = `Saldo registrado: ${fmt(c.saldo)}. Cargá el saldo real y la diferencia queda como ajuste.`
  $('aj-saldo').value = String(redondear2(c.saldo))
  $('aj-motivo').value = ''
  limpiarError('aj-error')
  $('dlg-ajuste').showModal()
}

const AYUDA_MOVIMIENTO = {
  gasto: 'Plata que sale del negocio: un servicio, un proveedor, algo puntual.',
  traslado: 'La plata cambia de lugar y el total no cambia: un depósito, un retiro, pasar a una billetera.',
  aporte: 'Plata que entra y no es una venta: por ejemplo, un aporte tuyo.'
}

function elegirTipoMovimiento(tipo) {
  tipoMovimiento = tipo
  document.querySelectorAll('.fin-tipo').forEach(b => b.classList.toggle('activa', b.dataset.tipo === tipo))
  $('mv-ayuda').textContent = AYUDA_MOVIMIENTO[tipo]
  $('mv-concepto').required = tipo !== 'traslado'
  $('mv-concepto-texto').textContent = tipo === 'traslado' ? 'Concepto (opcional)' : 'Concepto'
  $('mv-origen-label').classList.toggle('oculto', tipo === 'aporte')
  $('mv-destino-label').classList.toggle('oculto', tipo === 'gasto')
  $('mv-origen-texto').textContent = tipo === 'traslado' ? 'Desde' : 'Pagar con'
  $('mv-destino-texto').textContent = tipo === 'traslado' ? 'Hacia' : 'Entra a'
}

function abrirMovimiento() {
  const cuentas = datos.resumen.cuentas
  const caja = cuentas.find(c => c.tipo === 'caja' && c.local_id === localOperativo()) || cuentas.find(c => c.tipo === 'caja')
  llenarCuentas($('mv-origen'), cuentas, caja?.id)
  llenarCuentas($('mv-destino'), cuentas, cuentas.find(c => c.id !== caja?.id)?.id)
  $('mv-concepto').value = ''
  $('mv-monto').value = ''
  limpiarError('mv-error')
  elegirTipoMovimiento('gasto')
  $('dlg-movimiento').showModal()
}

function cuentaPorId(id) {
  return datos.resumen.cuentas.find(c => c.id === id)
}

// ---------- acciones ----------
async function ejecutar(rpc, parametros, errorId, dialogoId) {
  const { error } = await supabase.rpc(rpc, parametros)
  if (error) {
    mostrarError(errorId, error.message)
    return false
  }
  $(dialogoId).close()
  await cargarFinanzas()
  return true
}

$('form-pagar').addEventListener('submit', async e => {
  e.preventDefault()
  limpiarError('pagar-error')
  const monto = redondear2(Number($('pagar-monto').value))
  if (!(monto > 0)) { mostrarError('pagar-error', 'Ingresá un importe mayor a 0.'); return }
  if (!pagoActual.monto_es_estimado && monto > redondear2(pagoActual.saldo) + 0.005) {
    mostrarError('pagar-error', `El pago supera el saldo pendiente (${fmt(pagoActual.saldo)}).`)
    return
  }
  await ejecutar('pagar_compromiso', {
    p_id: pagoActual.id,
    p_monto_real: monto,
    p_cuenta_id: $('pagar-cuenta').value || null,
    p_fecha: $('pagar-fecha').value || null
  }, 'pagar-error', 'dlg-pagar')
})

$('form-pago-nuevo').addEventListener('submit', async e => {
  e.preventDefault()
  limpiarError('pn-error')
  const monto = redondear2(Number($('pn-monto').value))
  if (!(monto > 0)) { mostrarError('pn-error', 'Ingresá un monto estimado mayor a 0.'); return }
  await ejecutar('crear_compromiso', {
    p_concepto: $('pn-concepto').value.trim(),
    p_monto: monto,
    p_vencimiento: $('pn-vencimiento').value,
    p_repite: $('pn-repite').value,
    p_proveedor_id: null,
    p_local_id: $('pn-local').value || localOperativo()
  }, 'pn-error', 'dlg-pago-nuevo')
})

$('form-cuenta').addEventListener('submit', async e => {
  e.preventDefault()
  limpiarError('cu-error')
  await ejecutar('crear_cuenta', {
    p_nombre: $('cu-nombre').value.trim(),
    p_tipo: $('cu-tipo').value,
    p_saldo_inicial: Number($('cu-saldo').value) || 0,
    p_local_id: $('cu-local').value || null
  }, 'cu-error', 'dlg-cuenta')
})

$('form-ajuste').addEventListener('submit', async e => {
  e.preventDefault()
  limpiarError('aj-error')
  const saldo = Number($('aj-saldo').value)
  if (Number.isNaN(saldo)) { mostrarError('aj-error', 'Ingresá el saldo real.'); return }
  await ejecutar('ajustar_saldo', {
    p_cuenta_id: ajusteActual.id,
    p_saldo_real: saldo,
    p_motivo: $('aj-motivo').value.trim() || null
  }, 'aj-error', 'dlg-ajuste')
})

$('form-movimiento').addEventListener('submit', async e => {
  e.preventDefault()
  limpiarError('mv-error')
  const monto = redondear2(Number($('mv-monto').value))
  const concepto = $('mv-concepto').value.trim()
  if (!(monto > 0)) { mostrarError('mv-error', 'Ingresá un importe mayor a 0.'); return }

  if (tipoMovimiento === 'gasto') {
    const origen = cuentaPorId($('mv-origen').value)
    await ejecutar('registrar_salida', {
      p_monto: monto, p_concepto: concepto, p_cuenta_id: origen.id,
      p_local_id: origen.local_id || localOperativo()
    }, 'mv-error', 'dlg-movimiento')
  } else if (tipoMovimiento === 'traslado') {
    const origen = cuentaPorId($('mv-origen').value)
    const destino = cuentaPorId($('mv-destino').value)
    if (origen.id === destino.id) { mostrarError('mv-error', 'El origen y el destino son la misma cuenta.'); return }
    await ejecutar('registrar_traslado', {
      p_monto: monto, p_cuenta_destino_id: destino.id, p_cuenta_origen_id: origen.id,
      p_concepto: concepto || null, p_local_id: origen.local_id || destino.local_id || localOperativo()
    }, 'mv-error', 'dlg-movimiento')
  } else {
    const destino = cuentaPorId($('mv-destino').value)
    await ejecutar('registrar_ingreso', {
      p_monto: monto, p_concepto: concepto, p_cuenta_id: destino.id, p_categoria: 'aporte',
      p_local_id: destino.local_id || localOperativo()
    }, 'mv-error', 'dlg-movimiento')
  }
})

// ---------- eventos de la página ----------
function elegirPanel(panel) {
  document.querySelectorAll('.fin-tab').forEach(t => t.classList.toggle('activa', t.dataset.panel === panel))
  $('fin-panel-cuentas').classList.toggle('oculto', panel !== 'cuentas')
  $('fin-panel-pagos').classList.toggle('oculto', panel !== 'pagos')
}

document.querySelectorAll('.fin-tab').forEach(t => t.addEventListener('click', () => elegirPanel(t.dataset.panel)))
$('btn-ver-pagos').addEventListener('click', () => elegirPanel('pagos'))
$('btn-nuevo-pago').addEventListener('click', abrirPagoNuevo)
$('btn-nueva-cuenta').addEventListener('click', abrirCuenta)
$('btn-registrar-movimiento').addEventListener('click', abrirMovimiento)
$('cu-tipo').addEventListener('change', ajustarLocalCuenta)
document.querySelectorAll('.fin-tipo').forEach(b => b.addEventListener('click', () => elegirTipoMovimiento(b.dataset.tipo)))
document.querySelectorAll('[data-cerrar]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()))

// Botones que se dibujan dinámicamente (se atienden desde el documento).
document.addEventListener('click', async e => {
  const pagar = e.target.closest('[data-pagar]')
  if (pagar) { abrirPagar(pagar.dataset.pagar); return }
  const ajustar = e.target.closest('[data-ajustar]')
  if (ajustar) { abrirAjuste(ajustar.dataset.ajustar); return }
  const anular = e.target.closest('[data-anular]')
  if (anular) {
    const motivo = window.prompt('¿Por qué anulás este movimiento? (queda registrado)')
    if (!motivo || !motivo.trim()) return
    anular.disabled = true
    const { error } = await supabase.rpc('anular_movimiento', { p_id: anular.dataset.anular, p_motivo: motivo.trim() })
    if (error) {
      anular.disabled = false
      window.alert(error.message)
      return
    }
    await cargarFinanzas()
  }
})

$('btn-salir').addEventListener('click', async () => {
  await supabase.auth.signOut()
  window.location.href = 'admin-v2.html'
})

// ---------- arranque (al final, cuando todo lo de arriba ya está definido) ----------
sesion = await obtenerSesionActual({ forzarRecarga: true })
if (!sesion || sesion.rol !== 'dueno') {
  window.location.href = 'admin-v2.html'
} else {
  aplicarVisibilidadSidebarPorRol(sesion.rol)
  vista.classList.remove('oculto')
  renderizarSelectorLocal($('contenedor-selector-local'), sesion.rol)
  cargarFinanzas()
}
