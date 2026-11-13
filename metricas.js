import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = 'https://meekevxxjirvgsuppvij.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1lZWtldnh4amlydmdzdXBwdmlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU1MjQwMjMsImV4cCI6MjEwMTEwMDAyM30.MGajznwLTreSKal-1-aFcYsEHTTGC6geruLvRryQ88M'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

const vistaMetricas = document.getElementById('vista-metricas')
const tarjetaMeta = document.getElementById('tarjeta-meta')
const tarjetaResultado = document.getElementById('tarjeta-resultado')
const tarjetaMargen = document.getElementById('tarjeta-margen')
const tarjetaGastos = document.getElementById('tarjeta-gastos-fijos')

// Período (en días) de los gráficos y del margen; lo cambian los botones 7 / 30 / 90 días
let diasPeriodo = 30
// Local elegido (misma clave que usa el selector del Panel). null = todos los locales
const CLAVE_LOCAL_FILTRO = 'once_local_filtro'
let localFiltro = localStorage.getItem(CLAVE_LOCAL_FILTRO) || null

// Los nombres de gastos y categorías los carga una persona: se escapan antes de mostrarlos
function escapeHtml(texto) {
  if (texto == null) return ''
  return String(texto)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function formatoMoneda(n) {
  const redondeado = Math.round(n)
  return (redondeado < 0 ? '-' : '') + '$' + Math.abs(redondeado).toLocaleString('es-AR')
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
  vistaMetricas.classList.remove('oculto')
  cargarMetaHoy()
  cargarResultadoBruto()
  cargarMargenCategoria()
  cargarGastosFijos()
  prepararLocales()
  cargarVentas()
}

// --- Meta de venta del día (3 niveles: supervivencia/objetivo/excelente) ---
const NIVEL_META_INFO = {
  bajo_supervivencia: { color: 'tomate', texto: 'Por debajo del mínimo' },
  supervivencia: { color: 'naranja', texto: 'Cubriendo lo mínimo' },
  objetivo: { color: 'verde', texto: 'En objetivo' },
  excelente: { color: 'verde-oscuro', texto: '¡Excelente!' },
}

async function cargarMetaHoy() {
  const { data, error } = await supabase.rpc('obtener_meta_venta_hoy')
  if (error) {
    console.error(error)
    return
  }
  dibujarMeta(data)
}

function dibujarMeta(meta) {
  const info = NIVEL_META_INFO[meta.nivel_alcanzado] || NIVEL_META_INFO.bajo_supervivencia
  const porcentaje = Math.max(0, Math.min(100, meta.porcentaje_objetivo || 0))
  const faltaTexto = meta.falta_para_proximo_nivel > 0
    ? `Faltan ${formatoMoneda(meta.falta_para_proximo_nivel)} para el próximo nivel`
    : '¡Ya alcanzaste el nivel excelente!'

  tarjetaMeta.innerHTML = `
    <div class="meta-header">
      <div>
        <span class="meta-rotulo">Vendido hoy</span>
        <span class="meta-total">${formatoMoneda(meta.total_hoy)}</span>
      </div>
      <span class="meta-nivel meta-nivel-${info.color}">${info.texto}</span>
    </div>
    <div class="meta-barra" role="progressbar" aria-label="Avance hacia el objetivo del día" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(porcentaje)}">
      <div class="meta-barra-relleno meta-barra-${info.color}" style="width:${porcentaje}%"></div>
    </div>
    <div class="meta-niveles">
      <span><i class="meta-punto meta-punto-bajo"></i>Mínimo <strong>${formatoMoneda(meta.supervivencia)}</strong></span>
      <span><i class="meta-punto meta-punto-objetivo"></i>Objetivo <strong>${formatoMoneda(meta.objetivo)}</strong></span>
      <span><i class="meta-punto meta-punto-excelente"></i>Excelente <strong>${formatoMoneda(meta.excelente)}</strong></span>
    </div>
    <p class="meta-falta muted">${faltaTexto}</p>
  `
}

// --- Resultado bruto del día (venta - costo de mercadería, solo con costo real conocido) ---
async function cargarResultadoBruto() {
  const { data, error } = await supabase.rpc('obtener_resultado_bruto_hoy')
  if (error) {
    console.error(error)
    return
  }
  dibujarResultado(data)
}

function dibujarResultado(r) {
  const notaParcial = r.items_sin_costo_registrado > 0
    ? `<p class="muted resultado-nota">${r.items_sin_costo_registrado} venta(s) de hoy sin costo real registrado, no entran en este cálculo.</p>`
    : ''

  const claseNeto = r.resultado_neto_estimado >= 0 ? '' : 'resultado-negativo'

  tarjetaResultado.innerHTML = `
    <div class="resultado-fila">
      <span class="muted">Ventas (con costo conocido)</span>
      <span>${formatoMoneda(r.ventas_con_costo_conocido)}</span>
    </div>
    <div class="resultado-fila">
      <span class="muted">Costo de mercadería</span>
      <span>${formatoMoneda(r.costo_mercaderia)}</span>
    </div>
    <div class="resultado-fila resultado-subtotal">
      <span>Resultado bruto</span>
      <span>${formatoMoneda(r.resultado_bruto)}</span>
    </div>
    <div class="resultado-fila">
      <span class="muted">Cuota diaria de gastos fijos</span>
      <span>-${formatoMoneda(r.reserva_diaria_gastos_fijos)}</span>
    </div>
    <div class="resultado-fila resultado-total ${claseNeto}">
      <span>Resultado neto estimado</span>
      <span>${formatoMoneda(r.resultado_neto_estimado)}</span>
    </div>
    <p class="muted resultado-aviso">Estimado: los gastos fijos son montos aproximados cargados a mano, no gastos reales del día.</p>
    ${notaParcial}
  `
}

// --- Gastos fijos (montos estimados, editables) ---
async function cargarGastosFijos() {
  const { data, error } = await supabase.rpc('obtener_gastos_fijos')
  if (error) {
    console.error(error)
    return
  }
  dibujarGastosFijos(data)
}

function dibujarGastosFijos(gastos) {
  const total = gastos.reduce((acc, g) => acc + Number(g.monto_mensual), 0)

  tarjetaGastos.innerHTML = gastos.map(g => `
    <div class="gasto-fila">
      <span class="gasto-concepto">${escapeHtml(g.concepto)}</span>
      <input type="number" class="gasto-input" data-id="${g.id}" value="${g.monto_mensual}" min="0" step="1000">
    </div>
  `).join('') + `
    <div class="gasto-fila gasto-total">
      <span>Total mensual</span>
      <span>${formatoMoneda(total)}</span>
    </div>
  `
}

tarjetaGastos.addEventListener('change', async (e) => {
  const input = e.target.closest('.gasto-input')
  if (!input) return

  const { error } = await supabase.rpc('actualizar_gasto_fijo', {
    p_id: input.dataset.id,
    p_monto: Number(input.value),
  })
  if (error) {
    console.error(error)
    alert('No se pudo guardar: ' + error.message)
    return
  }
  cargarGastosFijos()
  cargarResultadoBruto()
})

// --- Margen real por categoría (solo ventas con costo real registrado) ---
async function cargarMargenCategoria() {
  const { data, error } = await supabase.rpc('obtener_margen_por_categoria', { p_dias: diasPeriodo })
  if (error) {
    console.error(error)
    return
  }
  dibujarMargen(data)
}

function dibujarMargen(datos) {
  if (!datos.categorias || datos.categorias.length === 0) {
    const nota = datos.items_sin_costo_registrado > 0
      ? `Todavía no hay ventas con costo real registrado en este período (${datos.items_sin_costo_registrado} venta(s) son anteriores a este cambio y no se pueden reconstruir). Se va a ir completando con las ventas nuevas.`
      : 'Todavía no hay ventas pagadas en este período.'
    tarjetaMargen.innerHTML = `<p class="muted">${nota}</p>`
    return
  }

  const filas = datos.categorias.map(c => {
    const pct = c.margen_real_pct
    const ancho = pct !== null ? Math.max(0, Math.min(100, Number(pct))) : 0
    const negativo = pct !== null && Number(pct) < 0
    return `
    <div class="margen-fila">
      <span class="margen-categoria">${escapeHtml(c.categoria)}</span>
      <span class="margen-barra"><span class="${negativo ? 'margen-barra-neg' : ''}" style="width:${ancho}%"></span></span>
      <span class="margen-valor ${negativo ? 'margen-valor-neg' : ''}">${pct !== null ? pct + '%' : '—'}</span>
    </div>
  `
  }).join('')

  const notaParcial = datos.items_sin_costo_registrado > 0
    ? `<p class="muted margen-nota">${datos.items_sin_costo_registrado} venta(s) del período todavía no tienen costo real registrado (son de antes de este cambio) y no entran en este cálculo.</p>`
    : ''

  tarjetaMargen.innerHTML = filas + notaParcial
}

// --- Ventas del período: tarjetas y gráficos (los números los calcula la base) ---
const elKpis = document.getElementById('num-kpis')
const elGrafDias = document.getElementById('graf-dias')
const elGrafHoras = document.getElementById('graf-horas')
const elGrafMedios = document.getElementById('graf-medios')

const NOMBRES_METODO = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  mercado_pago: 'Mercado Pago',
  cuenta_corriente: 'Cuenta corriente',
  combinado: 'Combinado',
}
const COLORES_METODO = ['#15271D', '#1F6B43', '#D9962B', '#7A8F82', '#B9B198']
const DIAS_SEMANA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

function nombreMetodo(m) {
  if (NOMBRES_METODO[m]) return NOMBRES_METODO[m]
  const t = String(m || '').replaceAll('_', ' ')
  return t.charAt(0).toUpperCase() + t.slice(1)
}

// "$1,2 M", "$350 mil", "$900": rótulos cortos para los ejes de los gráficos
function formatoCompacto(n) {
  const v = Math.round(n)
  if (v >= 1000000) return '$' + (v / 1000000).toLocaleString('es-AR', { maximumFractionDigits: 1 }) + ' M'
  if (v >= 1000) return '$' + Math.round(v / 1000).toLocaleString('es-AR') + ' mil'
  return '$' + v.toLocaleString('es-AR')
}

// Tope "redondo" para la escala de un gráfico (1, 2, 2,5, 5 × potencia de 10)
function topeEscala(max) {
  if (!max || max <= 0) return 1
  const exp = Math.pow(10, Math.floor(Math.log10(max)))
  const f = max / exp
  const paso = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10
  return paso * exp
}

function fechaCorta(iso) {
  const [a, m, d] = String(iso).slice(0, 10).split('-').map(Number)
  const dia = new Date(a, m - 1, d)
  return { texto: String(d).padStart(2, '0') + '/' + String(m).padStart(2, '0'), semana: DIAS_SEMANA[dia.getDay()] }
}

function mensajeVacio(el, texto) {
  el.innerHTML = `<p class="muted graf-vacio">${texto}</p>`
}

function ejeY(tope) {
  return `<div class="graf-eje" aria-hidden="true"><span>${formatoCompacto(tope)}</span><span>${formatoCompacto(tope / 2)}</span><span>$0</span></div>`
}

async function cargarVentas() {
  const { data, error } = await supabase.rpc('obtener_ventas_tablero', { p_dias: diasPeriodo, p_local: localFiltro })
  if (error) {
    console.error(error)
    const msg = 'Todavía no se pueden mostrar las ventas del período. Si recién actualizaste la página, avisale a quien administra el sistema.'
    elKpis.innerHTML = ''
    mensajeVacio(elGrafDias, msg)
    mensajeVacio(elGrafHoras, msg)
    mensajeVacio(elGrafMedios, msg)
    return
  }
  dibujarKpisVentas(data)
  dibujarGraficoDias(data)
  dibujarGraficoHoras(data)
  dibujarMedios(data)
}

function dibujarKpisVentas(d) {
  let variacion = '<span class="num-kpi-var">Sin período anterior para comparar</span>'
  if (d.variacion_pct !== null && d.variacion_pct !== undefined) {
    const v = Number(d.variacion_pct)
    const signo = v > 0 ? '+' : ''
    const clase = v > 0 ? 'num-kpi-var-sube' : v < 0 ? 'num-kpi-var-baja' : ''
    variacion = `<span class="num-kpi-var ${clase}">${signo}${v.toLocaleString('es-AR')}% vs. los ${d.periodo_dias} días anteriores</span>`
  }
  elKpis.innerHTML = `
    <div class="num-kpi">
      <span class="num-kpi-rotulo">Vendido en ${d.periodo_dias} días</span>
      <strong class="num-kpi-valor">${formatoMoneda(d.total)}</strong>
      ${variacion}
    </div>
    <div class="num-kpi">
      <span class="num-kpi-rotulo">Pedidos pagados</span>
      <strong class="num-kpi-valor">${Number(d.pedidos).toLocaleString('es-AR')}</strong>
      <span class="num-kpi-var">${Number(d.pedidos_anterior).toLocaleString('es-AR')} en el período anterior</span>
    </div>
    <div class="num-kpi">
      <span class="num-kpi-rotulo">Ticket promedio</span>
      <strong class="num-kpi-valor">${formatoMoneda(d.ticket_promedio)}</strong>
      <span class="num-kpi-var">Por pedido pagado</span>
    </div>
  `
}

function dibujarGraficoDias(d) {
  const dias = d.por_dia || []
  if (!dias.length || Number(d.total) === 0) {
    mensajeVacio(elGrafDias, 'Todavía no hay ventas pagadas en este período.')
    return
  }
  const anterior = d.por_dia_anterior || []
  const maxDato = Math.max(...dias.map(x => Number(x.total)), ...anterior.map(Number), 0)
  const tope = topeEscala(maxDato)
  const n = dias.length

  const barras = dias.map((x, i) => {
    const f = fechaCorta(x.fecha)
    const alto = Math.max(Number(x.total) > 0 ? 1.5 : 0, (Number(x.total) / tope) * 100)
    const detalle = `${f.semana} ${f.texto}: ${formatoMoneda(x.total)} · ${x.pedidos} pedido(s)`
    return `<button type="button" class="graf-barra" data-detalle="${escapeHtml(detalle)}" aria-label="${escapeHtml(detalle)}"><span style="height:${alto}%"></span></button>`
  }).join('')

  const puntos = anterior.map((t, i) => `${(((i + 0.5) / n) * 100).toFixed(2)},${(100 - (Number(t) / tope) * 100).toFixed(2)}`).join(' ')
  const linea = anterior.length === n && Math.max(...anterior.map(Number)) > 0
    ? `<svg class="graf-linea" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polyline points="${puntos}" /></svg>`
    : ''

  const indices = n <= 7 ? dias.map((_, i) => i) : [0, Math.floor((n - 1) / 2), n - 1]
  const etiquetas = dias.map((x, i) => {
    if (!indices.includes(i)) return '<span></span>'
    const f = fechaCorta(x.fecha)
    return `<span>${n <= 7 ? f.semana + '<br>' : ''}${f.texto}</span>`
  }).join('')

  elGrafDias.innerHTML = `
    <div class="graf graf-dias ${n > 40 ? 'graf-fino' : ''}">
      ${ejeY(tope)}
      <div class="graf-area">
        <div class="graf-grilla" aria-hidden="true"><i></i><i></i><i></i></div>
        <div class="graf-barras" style="--n:${n}">${barras}</div>
        ${linea}
      </div>
      <div class="graf-x" style="--n:${n}">${etiquetas}</div>
    </div>
    <p class="graf-lectura" id="graf-dias-lectura" aria-live="polite">Pasá el mouse o tocá una barra para ver el detalle del día.</p>
    <p class="graf-leyenda"><span><i class="graf-ley-barra"></i>Este período</span>${linea ? '<span><i class="graf-ley-linea"></i>Período anterior</span>' : ''}</p>
  `
  conectarLectura(elGrafDias, document.getElementById('graf-dias-lectura'))
}

function dibujarGraficoHoras(d) {
  const horas = d.por_hora || []
  const conVenta = horas.filter(h => Number(h.total) > 0)
  if (!conVenta.length) {
    mensajeVacio(elGrafHoras, 'Todavía no hay ventas pagadas en este período.')
    return
  }
  const desde = Math.min(...conVenta.map(h => h.hora), 8)
  const hasta = Math.max(...conVenta.map(h => h.hora), 20)
  const visibles = horas.filter(h => h.hora >= desde && h.hora <= hasta)
  const tope = topeEscala(Math.max(...visibles.map(h => Number(h.total))))
  const mejor = conVenta.reduce((a, b) => (Number(b.total) > Number(a.total) ? b : a))

  const barras = visibles.map(h => {
    const alto = Math.max(Number(h.total) > 0 ? 1.5 : 0, (Number(h.total) / tope) * 100)
    const detalle = `${String(h.hora).padStart(2, '0')}:00 a ${String(h.hora + 1).padStart(2, '0')}:00: ${formatoMoneda(h.total)} · ${h.pedidos} pedido(s)`
    return `<button type="button" class="graf-barra ${h.hora === mejor.hora ? 'graf-barra-mejor' : ''}" data-detalle="${escapeHtml(detalle)}" aria-label="${escapeHtml(detalle)}"><span style="height:${alto}%"></span></button>`
  }).join('')
  const etiquetas = visibles.map(h => `<span>${h.hora}</span>`).join('')

  elGrafHoras.innerHTML = `
    <div class="graf graf-horas">
      ${ejeY(tope)}
      <div class="graf-area">
        <div class="graf-grilla" aria-hidden="true"><i></i><i></i><i></i></div>
        <div class="graf-barras" style="--n:${visibles.length}">${barras}</div>
      </div>
      <div class="graf-x" style="--n:${visibles.length}">${etiquetas}</div>
    </div>
    <p class="graf-lectura" id="graf-horas-lectura" aria-live="polite">La hora más fuerte es de ${String(mejor.hora).padStart(2, '0')}:00 a ${String(mejor.hora + 1).padStart(2, '0')}:00.</p>
  `
  conectarLectura(elGrafHoras, document.getElementById('graf-horas-lectura'))
}

function dibujarMedios(d) {
  const medios = d.por_metodo || []
  if (!medios.length || Number(d.total) === 0) {
    mensajeVacio(elGrafMedios, 'Todavía no hay ventas pagadas en este período.')
    return
  }
  const segmentos = medios.map((m, i) =>
    `<span class="medios-seg" style="width:${Number(m.pct)}%;background:${COLORES_METODO[i % COLORES_METODO.length]}" title="${escapeHtml(nombreMetodo(m.metodo))}: ${Number(m.pct).toLocaleString('es-AR')}%"></span>`
  ).join('')
  const filas = medios.map((m, i) => `
    <div class="medios-fila">
      <span class="medios-nombre"><i style="background:${COLORES_METODO[i % COLORES_METODO.length]}"></i>${escapeHtml(nombreMetodo(m.metodo))}</span>
      <span class="medios-monto">${formatoMoneda(m.total)}</span>
      <span class="medios-pct">${Number(m.pct).toLocaleString('es-AR')}%</span>
    </div>
  `).join('')
  elGrafMedios.innerHTML = `<div class="medios-barra" role="img" aria-label="Reparto de las ventas por medio de pago">${segmentos}</div>${filas}`
}

// Al pasar el mouse, tocar o enfocar una barra, se muestra su detalle debajo del gráfico
function conectarLectura(contenedor, lectura) {
  const mostrar = (e) => {
    const barra = e.target.closest('.graf-barra')
    if (barra) lectura.textContent = barra.dataset.detalle
  }
  contenedor.addEventListener('mouseover', mostrar)
  contenedor.addEventListener('focusin', mostrar)
  contenedor.addEventListener('click', mostrar)
}

// --- Selector de local (solo si hay más de uno) ---
async function prepararLocales() {
  const selector = document.getElementById('num-local')
  const { data, error } = await supabase.from('locales').select('id, nombre').order('nombre')
  if (error || !data || data.length < 2) return
  selector.innerHTML = '<option value="">Todos los locales</option>' +
    data.map(l => `<option value="${l.id}" ${l.id === localFiltro ? 'selected' : ''}>${escapeHtml(l.nombre)}</option>`).join('')
  document.getElementById('num-local-caja').classList.remove('oculto')
  selector.addEventListener('change', () => {
    localFiltro = selector.value || null
    if (localFiltro) localStorage.setItem(CLAVE_LOCAL_FILTRO, localFiltro)
    else localStorage.removeItem(CLAVE_LOCAL_FILTRO)
    cargarVentas()
  })
}

// --- Controles: período y actualizar ---
const textoPeriodo = document.querySelectorAll('.num-periodo-texto')
const botonesPeriodo = document.querySelectorAll('#num-periodos [data-dias]')

botonesPeriodo.forEach(btn => {
  btn.addEventListener('click', () => {
    diasPeriodo = Number(btn.dataset.dias)
    botonesPeriodo.forEach(b => {
      const activo = b === btn
      b.classList.toggle('activa', activo)
      b.setAttribute('aria-pressed', activo ? 'true' : 'false')
    })
    textoPeriodo.forEach(t => { t.textContent = '(' + diasPeriodo + ' días)' })
    tarjetaMargen.innerHTML = '<p class="muted">Cargando…</p>'
    cargarMargenCategoria()
    cargarVentas()
  })
})

document.getElementById('btn-actualizar-numeros').addEventListener('click', async (e) => {
  const btn = e.currentTarget
  btn.disabled = true
  btn.textContent = 'Actualizando…'
  await Promise.all([cargarMetaHoy(), cargarResultadoBruto(), cargarMargenCategoria(), cargarGastosFijos(), cargarVentas()])
  btn.disabled = false
  btn.textContent = 'Actualizar'
})
