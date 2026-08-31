import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = 'https://meekevxxjirvgsuppvij.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1lZWtldnh4amlydmdzdXBwdmlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU1MjQwMjMsImV4cCI6MjEwMTEwMDAyM30.MGajznwLTreSKal-1-aFcYsEHTTGC6geruLvRryQ88M'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

const vistaArmado = document.getElementById('vista-armado')
const listaPorArmar = document.getElementById('lista-por-armar')

// Esta página vive protegida por la sesión que ya abriste en admin.html.
// Si entrás acá directo sin haber iniciado sesión, te manda de vuelta.
const { data: { session } } = await supabase.auth.getSession()
if (!session) {
  window.location.href = 'admin.html'
} else {
  vistaArmado.classList.remove('oculto')
  cargarPorArmar()
  setInterval(cargarPorArmar, 5000)
}

// --- Pedidos de WhatsApp por armar (peso real pendiente) ---
async function cargarPorArmar() {
  const { data, error } = await supabase
    .from('pedidos')
    .select('*')
    .eq('origen', 'whatsapp')
    .eq('armado_estado', 'pendiente')
    .order('creado_en', { ascending: true })

  if (error) {
    console.error(error)
    return
  }

  if (data.length === 0) {
    listaPorArmar.innerHTML = '<p class="muted">No hay pedidos de WhatsApp esperando armado.</p>'
    return
  }

  const pedidosConItems = await Promise.all(
    data.map(async (pedido) => {
      const { data: items } = await supabase
        .from('pedido_items')
        .select('id, cantidad, precio_unitario, productos(nombre, tipo)')
        .eq('pedido_id', pedido.id)
      return { ...pedido, items: items || [] }
    })
  )

  // No cerramos las tarjetas que ya tenía abiertas mientras estaba cargando un peso
  const abiertos = new Set(
    Array.from(listaPorArmar.querySelectorAll('details[open]')).map(d => d.dataset.id)
  )

  listaPorArmar.innerHTML = ''
  pedidosConItems.forEach(pedido => {
    const itemsPeso = pedido.items.filter(it => it.productos?.tipo === 'peso')
    const itemsUnidad = pedido.items.filter(it => it.productos?.tipo !== 'peso')

    const filaItemsPeso = itemsPeso.map(it => `
      <div class="item-detalle item-armado" data-item-id="${it.id}" data-precio="${it.precio_unitario}">
        <label>${it.productos?.nombre || '?'} · pedido ${it.cantidad}kg
          <input type="number" class="input-peso-real" min="0.01" step="0.01" inputmode="decimal" placeholder="peso real en kg">
        </label>
      </div>
    `).join('')

    const filaItemsUnidad = itemsUnidad.map(it => `
      <div class="item-detalle">
        <span>${it.productos?.nombre || '?'} · ${it.cantidad} unidad(es) (exacto)</span>
      </div>
    `).join('')

    const fila = document.createElement('div')
    fila.className = 'fila-pendiente-wrap'
    fila.innerHTML = `
      <details class="detalle-pedido" data-id="${pedido.id}" ${abiertos.has(pedido.id) ? 'open' : ''}>
        <summary>
          <span class="fila-titulo">Pedido #${pedido.numero_corto}</span>
          <span class="muted">WhatsApp · esperando armado</span>
        </summary>
        <div class="detalle-items">${filaItemsPeso}${filaItemsUnidad}</div>
        <p class="error oculto item-armado-error"></p>
        <div class="acciones-pedido">
          <button class="btn-confirmar btn-confirmar-armado" data-id="${pedido.id}">Confirmar armado</button>
        </div>
      </details>
    `
    listaPorArmar.appendChild(fila)
  })
}

listaPorArmar.addEventListener('click', async (e) => {
  const btn = e.target.closest('.btn-confirmar-armado')
  if (!btn) return

  const pedidoId = btn.dataset.id
  const tarjeta = btn.closest('details')
  const errorEl = tarjeta.querySelector('.item-armado-error')
  errorEl.classList.add('oculto')

  const itemsPeso = Array.from(tarjeta.querySelectorAll('.item-armado'))
  const items = []

  for (const el of itemsPeso) {
    const input = el.querySelector('.input-peso-real')
    const valor = parseFloat(input.value)
    if (!valor || valor <= 0) {
      errorEl.textContent = 'Falta cargar el peso real de algún producto.'
      errorEl.classList.remove('oculto')
      return
    }
    items.push({ item_id: el.dataset.itemId, cantidad_real: valor })
  }

  btn.disabled = true
  btn.textContent = 'Guardando…'

  const { error } = await supabase.rpc('cargar_pesos_reales_pedido', {
    p_pedido_id: pedidoId,
    p_items: items,
  })

  if (error) {
    errorEl.textContent = 'No se pudo guardar: ' + error.message
    errorEl.classList.remove('oculto')
    btn.disabled = false
    btn.textContent = 'Confirmar armado'
    return
  }

  cargarPorArmar()
})
