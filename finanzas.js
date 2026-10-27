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
let datos = { resumen: null, movimientos: [], locales: [], tope: null, topeError: null }
let sesion = null
let pagoActual = null
let fechaActual = null
let ajusteActual = null
let minimoActual = null
let tipoMovimiento = 'gasto'
let verEsperar = false

const TIPOS_CUENTA = {
  caja: 'Efectivo · caja del local',
  resguardo: 'Efectivo resguardado',
  banco: 'Cuenta bancaria',
  billetera: 'Billetera virtual'
}
const NIVELES = {
  imprescindible: 'Imprescindible',
  conviene: 'Conviene',
  puede_esperar: 'Puede esperar'
}
const MESES = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC']

// ---------- utilidades ----------
function fmt(n) {
  const v = Math.round(Number(n) || 0)
  return `${v < 0 ? '−' : ''}$${Math.abs(v).toLocaleString('es-AR')}`
}

function fmtCant(n, tipo) {
  const v = Number(n) || 0
  const texto = v.toLocaleString('es-AR', { maximumFractionDigits: 2 })
  return `${texto} ${tipo === 'peso' ? 'kg' : 'un.'}`
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

function textoPostergado(c) {
  return c.vencimiento_original && c.vencimiento_original !== c.vencimiento
    ? `antes vencía el ${textoFecha(c.vencimiento_original)}` : null
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

function textoDias(n) {
  const v = Number(n)
  return `${v.toLocaleString('es-AR', { maximumFractionDigits: 1 })} ${v === 1 ? 'día' : 'días'}`
}

// ---------- carga ----------
async function cargarFinanzas() {
  limpiarError('fin-error')
  const [resumen, movimientos, locales, tope] = await Promise.all([
    supabase.rpc('obtener_resumen_finanzas', { p_local_id: filtroLocal }),
    supabase.rpc('obtener_movimientos_recientes', { p_local_id: filtroLocal, p_limite: 40 }),
    supabase.from('locales').select('id, nombre').order('nombre'),
    supabase.rpc('obtener_tope_compras', { p_local_id: filtroLocal })
  ])
  if (resumen.error) {
    console.error(resumen.error)
    mostrarError('fin-error', `No se pudo cargar Finanzas: ${resumen.error.message}`)
    $('fin-kpis').innerHTML = ''
    return
  }
  if (movimientos.error) console.error(movimientos.error)
  if (locales.error) console.error(locales.error)
  if (tope.error) console.error(tope.error)
  datos = {
    resumen: resumen.data,
    movimientos: movimientos.data || [],
    locales: locales.data || [],
    // Si el tope falla, el resto de Finanzas sigue funcionando.
    tope: tope.error ? null : tope.data,
    topeError: tope.error ? `No se pudo calcular el tope: ${tope.error.message}` : null
  }
  dibujar()
}

function dibujar() {
  dibujarKpis()
  dibujarCuentas()
  dibujarMovimientos()
  dibujarVencimientos()
  dibujarPagos()
  dibujarTope()
  dibujarQueComprar()
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
        <small>${textoVence(diasHasta(c.vencimiento))}${c.monto_es_estimado ? ' · estimado' : c.pagado > 0 ? ' · pago parcial' : ''}${textoPostergado(c) ? ' · ' + textoPostergado(c) : ''}</small>
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
        textoPostergado(c),
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
            <button type="button" class="fin-link" data-fecha="${c.id}">Cambiar fecha</button>
            <button type="button" class="fin-btn fin-btn-primario" data-pagar="${c.id}">Pagar</button>
          </div>
        </div>`
    }).join('')
    : '<p class="fin-vacio">No hay pagos pendientes. Cuando una compra quede "A pagar" o cargues un vencimiento, aparece acá.</p>'
}

// ---------- tope prudente para compras ----------
// Los avisos vienen de la base. Los que "bloquean" impiden dar un número confiable.
function htmlAvisos(avisos, conBoton) {
  return avisos.map(a => {
    const boton = conBoton && a.codigo === 'sin_cobertura'
      ? ' <button type="button" class="fin-link fin-link-linea" data-ajustes-compras>Definirlo</button>' : ''
    const clase = a.bloquea || a.codigo === 'deficit' ? 'fin-aviso fin-aviso-rojo' : 'fin-aviso'
    return `<div class="${clase}">${escapar(a.texto)}${boton}</div>`
  }).join('')
}

function dibujarTope() {
  const el = $('fin-tope')
  const t = datos.tope
  if (!t) {
    el.innerHTML = `<h4>Tope prudente para compras</h4>
      <p class="fin-vacio">${escapar(datos.topeError || 'No se pudo calcular el tope.')}</p>`
    return
  }
  const dias = t.horizonte_dias
  const imprescindibles = t.productos.filter(p => p.nivel === 'imprescindible').length
  const valor = t.confiable
    ? `<strong class="fin-tope-valor">${fmt(t.tope)}</strong>`
    : '<strong class="fin-tope-valor fin-tope-sin">Sin tope confiable</strong>'
  const texto = t.confiable
    ? `Lo prudente para gastar en compras: el dinero de todas las cuentas, menos los pagos y los gastos fijos de los próximos ${dias} días.`
    : 'Falta información para dar un número en que confiar. Revisá los avisos.'
  const desglose = t.confiable ? `
    <div class="fin-tope-desglose">
      <div><span>Dinero de todas las cuentas</span><strong>${fmt(t.dinero_total)}</strong></div>
      <div><span>Pagos de los próximos ${dias} días${t.cantidad_pagos ? ` (${t.cantidad_pagos})` : ''}</span><strong>−${fmt(t.pagos_en_ventana).replace('−', '')}</strong></div>
      <div><span>Gastos fijos estimados (${dias}/30 del mes)</span><strong>−${fmt(t.gastos_fijos_estimados).replace('−', '')}</strong></div>
    </div>` : ''
  const omitidos = (t.gastos_fijos_omitidos || []).length
    ? `<p class="fin-tope-nota">Ya contados como pago, no se repiten como gasto fijo: ${t.gastos_fijos_omitidos.map(escapar).join(', ')}.</p>` : ''
  const faltante = t.confiable && Number(t.tope_calculado) < 0
    ? `<div class="fin-aviso fin-aviso-rojo">Los pagos y gastos fijos superan al dinero disponible por ${fmt(-t.tope_calculado)}.</div>` : ''
  const urgentes = imprescindibles
    ? `<div class="fin-tope-urgentes">${imprescindibles} ${imprescindibles === 1 ? 'producto imprescindible' : 'productos imprescindibles'} para reponer</div>` : ''
  const avisos = htmlAvisos(t.avisos.filter(a => a.codigo !== 'deficit'), true)
  el.innerHTML = `
    <h4>Tope prudente para compras</h4>
    ${valor}
    <p class="fin-tope-texto">${texto}</p>
    ${desglose}${omitidos}${faltante}${avisos}${urgentes}
    <button type="button" class="fin-btn fin-btn-primario fin-tope-boton" data-ir-comprar>Qué comprar →</button>`
}

function filaCompra(p, t) {
  const sinCobertura = t.cobertura_dias === null || t.cobertura_dias === undefined
  const ritmo = Number(p.ritmo_diario) > 0 ? `${fmtCant(p.ritmo_diario, p.tipo)} por día` : 'sin ventas'
  let dura = '—'
  if (p.dias_stock !== null && p.dias_stock !== undefined) {
    dura = Number(p.dias_stock) < 1 ? 'menos de 1 día' : textoDias(p.dias_stock)
  }
  const minimo = p.minimo !== null && p.minimo !== undefined
    ? `${fmtCant(p.minimo, p.tipo)} <button type="button" class="fin-link fin-link-linea" data-minimo="${p.producto_id}">cambiar</button>`
    : `<button type="button" class="fin-link fin-link-linea" data-minimo="${p.producto_id}">fijar</button>`
  const cantidad = Number(p.sugerida) > 0
    ? `<strong>${fmtCant(p.sugerida, p.tipo)}</strong>`
    : `—${sinCobertura && p.nivel === 'imprescindible' ? '<small>definí la cobertura</small>' : ''}`
  let costo = '—'
  if (Number(p.sugerida) > 0) costo = p.costo_estimado !== null && p.costo_estimado !== undefined ? fmt(p.costo_estimado) : '<small>sin costo cargado</small>'
  let acumulado = ''
  if (Number(p.sugerida) > 0) {
    acumulado = p.entra_en_tope === false
      ? `<span class="fin-pasa">${fmt(p.acumulado)}</span><small class="fin-pasa">se pasa del tope</small>`
      : fmt(p.acumulado)
  }
  return `
    <tr>
      <td><strong>${escapar(p.nombre)}</strong><small>${ritmo}</small></td>
      <td class="fin-num">${fmtCant(p.stock, p.tipo)}</td>
      <td class="fin-num">${dura}</td>
      <td class="fin-num">${minimo}</td>
      <td class="fin-num">${cantidad}</td>
      <td class="fin-num">${costo}</td>
      <td class="fin-num">${acumulado}</td>
    </tr>`
}

function dibujarQueComprar() {
  const el = $('fin-comprar')
  const aviso = $('fin-tab-comprar-aviso')
  const t = datos.tope
  if (!t) {
    el.innerHTML = `<p class="fin-vacio">${escapar(datos.topeError || 'No se pudo calcular el tope.')}</p>`
    aviso.classList.add('oculto')
    return
  }
  const prods = t.productos
  const imprescindibles = prods.filter(p => p.nivel === 'imprescindible').length
  aviso.textContent = imprescindibles
  aviso.classList.toggle('oculto', imprescindibles === 0)

  const sugeridos = prods.filter(p => Number(p.sugerida) > 0)
  const totalSugerido = sugeridos.reduce((m, p) => Math.max(m, Number(p.acumulado) || 0), 0)
  const sinCobertura = t.cobertura_dias === null || t.cobertura_dias === undefined
  const resumen = `
    <div class="fin-compras-resumen">
      <div><span>Tope prudente</span><strong>${t.confiable ? fmt(t.tope) : 'Sin tope confiable'}</strong></div>
      <div><span>Total de lo sugerido</span><strong>${fmt(totalSugerido)}</strong></div>
      <div><span>Alcanza para</span><strong>${sinCobertura ? 'Sin definir' : textoDias(t.cobertura_dias)}</strong></div>
    </div>`

  const pasan = sugeridos.filter(p => p.entra_en_tope === false)
  const pasanUrgentes = pasan.some(p => p.nivel === 'imprescindible')
  let alerta = ''
  if (pasanUrgentes) {
    alerta = '<div class="fin-aviso fin-aviso-rojo">Ni siquiera lo imprescindible entra en el tope. Conviene revisar los pagos o comprar solo lo más urgente.</div>'
  } else if (pasan.length) {
    alerta = `<div class="fin-aviso fin-aviso-rojo">Con este tope no alcanza para todo: ${pasan.length} ${pasan.length === 1 ? 'producto se pasa' : 'productos se pasan'} (en rojo). Comprá de arriba hacia abajo y frená donde se pasa.</div>`
  }
  const avisos = htmlAvisos(t.avisos.filter(a => a.codigo !== 'deficit'), true)

  const visibles = prods.filter(p => verEsperar || p.nivel !== 'puede_esperar')
  const esperan = prods.length - prods.filter(p => p.nivel !== 'puede_esperar').length
  let filas = ''
  let nivelActual = null
  for (const p of visibles) {
    if (p.nivel !== nivelActual) {
      nivelActual = p.nivel
      const cuantos = prods.filter(x => x.nivel === nivelActual).length
      filas += `<tr class="fin-nivel-fila fin-nivel-${nivelActual}"><td colspan="7">${NIVELES[nivelActual]} · ${cuantos}</td></tr>`
    }
    filas += filaCompra(p, t)
  }

  let tabla
  if (!prods.length) {
    tabla = '<p class="fin-vacio">Todavía no hay productos con stock ni ventas para sugerir.</p>'
  } else {
    tabla = `<div class="fin-tabla-wrap"><table class="fin-tabla fin-tabla-compras">
      <thead><tr>
        <th>Producto</th><th class="fin-num">Stock</th><th class="fin-num">Dura</th><th class="fin-num">Mínimo</th>
        <th class="fin-num">Comprar</th><th class="fin-num">Costo estimado</th><th class="fin-num">Acumulado</th>
      </tr></thead>
      <tbody>${filas}</tbody></table></div>
      ${esperan ? `<button type="button" class="fin-btn fin-esperan" data-ver-esperar>${verEsperar ? 'Ocultar' : 'Mostrar'} los ${esperan} que pueden esperar</button>` : ''}`
  }

  el.innerHTML = `${resumen}${alerta}${avisos}${tabla}
    <p class="fin-pie">El ritmo de venta sale de las ventas pagadas de los últimos ${t.ritmo_ventana_dias} días. El costo estimado usa el último costo cargado de cada producto, y las cantidades se redondean a la presentación de compra. Los gastos fijos y los montos estimados son aproximados.</p>`
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
  $('pagar-resto-fecha').min = hoyAR()
  $('pagar-resto-fecha').value = c.vencimiento >= hoyAR() ? c.vencimiento : fechaMasDias(7)
  actualizarRestoPago()
  limpiarError('pagar-error')
  $('dlg-pagar').showModal()
}

// Si se paga solo una parte de una deuda, se pregunta cuándo vence el resto.
function hayRestoPorPagar() {
  if (!pagoActual || pagoActual.monto_es_estimado) return false
  const monto = redondear2(Number($('pagar-monto').value) || 0)
  return monto > 0 && redondear2(pagoActual.saldo - monto) > 0.005
}

function actualizarRestoPago() {
  const hay = hayRestoPorPagar()
  $('pagar-resto-label').classList.toggle('oculto', !hay)
  if (hay) {
    const resto = redondear2(pagoActual.saldo - (Number($('pagar-monto').value) || 0))
    $('pagar-resto-texto').textContent = `El resto (${fmt(resto)}) vence`
  }
}

function abrirFecha(id) {
  const c = datos.resumen.compromisos.find(x => x.id === id)
  if (!c) return
  fechaActual = c
  $('fe-titulo').textContent = c.concepto
  $('fe-info').textContent = `Hoy vence el ${textoFecha(c.vencimiento)}${textoPostergado(c) ? ` (${textoPostergado(c)})` : ''}. Si el proveedor te dio más plazo, cargá la fecha nueva.`
  $('fe-fecha').min = hoyAR()
  $('fe-fecha').value = c.vencimiento >= hoyAR() ? c.vencimiento : hoyAR()
  limpiarError('fe-error')
  $('dlg-fecha').showModal()
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

function abrirAjustesCompras() {
  const t = datos.tope
  if (!t) return
  $('co-cobertura').value = t.cobertura_dias === null || t.cobertura_dias === undefined ? '' : String(t.cobertura_dias)
  $('co-horizonte').value = String(t.horizonte_dias)
  $('co-ritmo').value = String(t.ritmo_ventana_dias)
  limpiarError('co-error')
  $('dlg-compras').showModal()
}

function abrirMinimo(id) {
  const p = datos.tope?.productos.find(x => x.producto_id === id)
  if (!p) return
  minimoActual = p
  $('mi-titulo').textContent = `Mínimo · ${p.nombre}`
  $('mi-info').textContent = `Stock actual: ${fmtCant(p.stock, p.tipo)}. ${Number(p.ritmo_diario) > 0 ? `Se vende ${fmtCant(p.ritmo_diario, p.tipo)} por día.` : 'No tuvo ventas en el período mirado.'}`
  $('mi-etiqueta').textContent = `Mínimo que no tiene que faltar (${p.tipo === 'peso' ? 'kg' : 'unidades'})`
  $('mi-minimo').value = p.minimo === null || p.minimo === undefined ? '' : String(p.minimo)
  limpiarError('mi-error')
  $('dlg-minimo').showModal()
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
  let proximo = null
  if (hayRestoPorPagar()) {
    proximo = $('pagar-resto-fecha').value || null
    if (!proximo) { mostrarError('pagar-error', 'Elegí cuándo vence el resto.'); return }
  }
  await ejecutar('pagar_compromiso', {
    p_id: pagoActual.id,
    p_monto_real: monto,
    p_cuenta_id: $('pagar-cuenta').value || null,
    p_fecha: $('pagar-fecha').value || null,
    p_proximo_vencimiento: proximo
  }, 'pagar-error', 'dlg-pagar')
})

$('form-fecha').addEventListener('submit', async e => {
  e.preventDefault()
  limpiarError('fe-error')
  await ejecutar('cambiar_vencimiento', {
    p_id: fechaActual.id,
    p_nuevo: $('fe-fecha').value
  }, 'fe-error', 'dlg-fecha')
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

// Ajustes del tope: solo se guardan los datos que cambiaron.
$('form-compras').addEventListener('submit', async e => {
  e.preventDefault()
  limpiarError('co-error')
  const t = datos.tope
  const textoCob = $('co-cobertura').value.trim()
  const cobertura = textoCob === '' ? null : Number(textoCob)
  const horizonte = Number($('co-horizonte').value)
  const ritmo = Number($('co-ritmo').value)
  if (cobertura !== null && !(cobertura > 0 && cobertura <= 60)) {
    mostrarError('co-error', 'La cobertura tiene que ser mayor a 0 y hasta 60 días.'); return
  }
  if (!Number.isInteger(horizonte) || horizonte < 1 || horizonte > 90) {
    mostrarError('co-error', 'Los días de pagos van de 1 a 90.'); return
  }
  if (!Number.isInteger(ritmo) || ritmo < 3 || ritmo > 90) {
    mostrarError('co-error', 'Los días de ventas van de 3 a 90.'); return
  }
  const cambios = []
  if (cobertura !== (t.cobertura_dias ?? null)) cambios.push(['cobertura_dias', cobertura])
  if (horizonte !== t.horizonte_dias) cambios.push(['horizonte_pagos_dias', horizonte])
  if (ritmo !== t.ritmo_ventana_dias) cambios.push(['ritmo_ventana_dias', ritmo])
  for (const [clave, valor] of cambios) {
    const { error } = await supabase.rpc('guardar_parametro_compras', { p_clave: clave, p_valor: valor })
    if (error) { mostrarError('co-error', error.message); return }
  }
  $('dlg-compras').close()
  if (cambios.length) await cargarFinanzas()
})

$('form-minimo').addEventListener('submit', async e => {
  e.preventDefault()
  limpiarError('mi-error')
  const texto = $('mi-minimo').value.trim()
  const minimo = texto === '' ? null : Number(texto)
  if (minimo !== null && !(minimo >= 0)) { mostrarError('mi-error', 'El mínimo no puede ser negativo.'); return }
  await ejecutar('guardar_stock_minimo', {
    p_producto_id: minimoActual.producto_id,
    p_minimo: minimo
  }, 'mi-error', 'dlg-minimo')
})

// ---------- eventos de la página ----------
function elegirPanel(panel) {
  document.querySelectorAll('.fin-tab').forEach(t => t.classList.toggle('activa', t.dataset.panel === panel))
  $('fin-panel-cuentas').classList.toggle('oculto', panel !== 'cuentas')
  $('fin-panel-pagos').classList.toggle('oculto', panel !== 'pagos')
  $('fin-panel-comprar').classList.toggle('oculto', panel !== 'comprar')
}

document.querySelectorAll('.fin-tab').forEach(t => t.addEventListener('click', () => elegirPanel(t.dataset.panel)))
$('btn-ver-pagos').addEventListener('click', () => elegirPanel('pagos'))
$('btn-nuevo-pago').addEventListener('click', abrirPagoNuevo)
$('btn-nueva-cuenta').addEventListener('click', abrirCuenta)
$('btn-registrar-movimiento').addEventListener('click', abrirMovimiento)
$('pagar-monto').addEventListener('input', actualizarRestoPago)
$('cu-tipo').addEventListener('change', ajustarLocalCuenta)
document.querySelectorAll('.fin-tipo').forEach(b => b.addEventListener('click', () => elegirTipoMovimiento(b.dataset.tipo)))
document.querySelectorAll('[data-cerrar]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()))

// Botones que se dibujan dinámicamente (se atienden desde el documento).
document.addEventListener('click', async e => {
  const pagar = e.target.closest('[data-pagar]')
  if (pagar) { abrirPagar(pagar.dataset.pagar); return }
  const fecha = e.target.closest('[data-fecha]')
  if (fecha) { abrirFecha(fecha.dataset.fecha); return }
  const ajustar = e.target.closest('[data-ajustar]')
  if (ajustar) { abrirAjuste(ajustar.dataset.ajustar); return }
  const minimo = e.target.closest('[data-minimo]')
  if (minimo) { abrirMinimo(minimo.dataset.minimo); return }
  if (e.target.closest('[data-ajustes-compras]')) { abrirAjustesCompras(); return }
  if (e.target.closest('[data-ver-esperar]')) { verEsperar = !verEsperar; dibujarQueComprar(); return }
  // La tarjeta del tope entera es clicable (los botones de adentro se atienden antes).
  if (e.target.closest('[data-ir-comprar]')) { elegirPanel('comprar'); return }
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
