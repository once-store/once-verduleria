import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = 'https://meekevxxjirvgsuppvij.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1lZWtldnh4amlydmdzdXBwdmlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU1MjQwMjMsImV4cCI6MjEwMTEwMDAyM30.MGajznwLTreSKal-1-aFcYsEHTTGC6geruLvRryQ88M'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

const vistaMetricas = document.getElementById('vista-metricas')
const tarjetaMeta = document.getElementById('tarjeta-meta')
const tarjetaResultado = document.getElementById('tarjeta-resultado')
const tarjetaMargen = document.getElementById('tarjeta-margen')

function formatoMoneda(n) {
  return '$' + Math.round(n).toLocaleString('es-AR')
}

// --- Sesión: esta pantalla requiere estar logueado, igual que el resto del panel ---
const { data: { session } } = await supabase.auth.getSession()
if (!session) {
  window.location.href = 'admin.html'
} else {
  vistaMetricas.classList.remove('oculto')
  cargarMetaHoy()
  cargarResultadoBruto()
  cargarMargenCategoria()
}

// --- Meta de venta del día (3 niveles: supervivencia/objetivo/excelente) ---
const NIVEL_META_INFO = {
  bajo_supervivencia: { color: 'tomate', texto: 'Por debajo del mínimo' },
  supervivencia: { color: 'naranja', texto: 'Cubriendo lo mínimo' },
  objetivo: { color: 'verde', texto: 'En objetivo' },
  excelente: { color: 'verde-oscuro', texto: '¡Excelente! 🌟' },
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
      <span class="meta-total">${formatoMoneda(meta.total_hoy)}</span>
      <span class="meta-nivel meta-nivel-${info.color}">${info.texto}</span>
    </div>
    <div class="meta-barra">
      <div class="meta-barra-relleno meta-barra-${info.color}" style="width:${porcentaje}%"></div>
    </div>
    <div class="meta-niveles">
      <span>🔴 ${formatoMoneda(meta.supervivencia)}</span>
      <span>🟡 ${formatoMoneda(meta.objetivo)}</span>
      <span>🟢 ${formatoMoneda(meta.excelente)}</span>
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
  if (r.ventas_totales === 0) {
    tarjetaResultado.innerHTML = '<p class="muted">Todavía no hay ventas hoy.</p>'
    return
  }

  const notaParcial = r.items_sin_costo_registrado > 0
    ? `<p class="muted resultado-nota">${r.items_sin_costo_registrado} venta(s) de hoy sin costo real registrado, no entran en este cálculo.</p>`
    : ''

  tarjetaResultado.innerHTML = `
    <div class="resultado-fila">
      <span class="muted">Ventas (con costo conocido)</span>
      <span>${formatoMoneda(r.ventas_con_costo_conocido)}</span>
    </div>
    <div class="resultado-fila">
      <span class="muted">Costo de mercadería</span>
      <span>${formatoMoneda(r.costo_mercaderia)}</span>
    </div>
    <div class="resultado-fila resultado-total">
      <span>Resultado bruto</span>
      <span>${formatoMoneda(r.resultado_bruto)}</span>
    </div>
    <p class="muted resultado-aviso">No resta gastos fijos (todavía no están cargados).</p>
    ${notaParcial}
  `
}

// --- Margen real por categoría (solo ventas con costo real registrado) ---
async function cargarMargenCategoria() {
  const { data, error } = await supabase.rpc('obtener_margen_por_categoria', { p_dias: 30 })
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

  const filas = datos.categorias.map(c => `
    <div class="margen-fila">
      <span class="margen-categoria">${c.categoria}</span>
      <span class="margen-valor">${c.margen_real_pct !== null ? c.margen_real_pct + '%' : '—'}</span>
    </div>
  `).join('')

  const notaParcial = datos.items_sin_costo_registrado > 0
    ? `<p class="muted margen-nota">${datos.items_sin_costo_registrado} venta(s) del período todavía no tienen costo real registrado (son de antes de este cambio) y no entran en este cálculo.</p>`
    : ''

  tarjetaMargen.innerHTML = filas + notaParcial
}
