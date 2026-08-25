import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = 'https://meekevxxjirvgsuppvij.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1lZWtldnh4amlydmdzdXBwdmlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU1MjQwMjMsImV4cCI6MjEwMTEwMDAyM30.MGajznwLTreSKal-1-aFcYsEHTTGC6geruLvRryQ88M'
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

const elTicket = document.getElementById('ticket')
const elMensaje = document.getElementById('mensaje')
const elAcciones = document.getElementById('acciones')

function formatoMoneda(n) {
  return '$' + Math.round(n).toLocaleString('es-AR')
}

const NOMBRES_METODO = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  mercado_pago: 'Mercado Pago',
  combinado: 'Combinado',
  cuenta_corriente: 'Cuenta corriente'
}

function mostrarMensaje(texto) {
  elMensaje.textContent = texto
  elMensaje.classList.remove('oculto')
}

async function cargarTicket() {
  const params = new URLSearchParams(window.location.search)
  const pedidoId = params.get('pedido')

  if (!pedidoId) {
    mostrarMensaje('Falta el número de pedido en el link.')
    return
  }

  const { data, error } = await supabase.rpc('obtener_ticket', { p_pedido_id: pedidoId })

  if (error) {
    console.error(error)
    mostrarMensaje('No se pudo cargar el ticket. Probá de nuevo.')
    return
  }

  if (!data || data.length === 0) {
    mostrarMensaje('No se encontró ese pedido.')
    return
  }

  const cabecera = data[0]

  if (cabecera.estado !== 'pagado') {
    mostrarMensaje('Este pedido todavía no fue pagado, no hay ticket disponible.')
    return
  }

  document.getElementById('t-numero').textContent = cabecera.numero_corto
  document.getElementById('t-fecha').textContent = new Date(cabecera.pagado_en || cabecera.creado_en)
    .toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  document.getElementById('t-items').innerHTML = data.map(item => `
    <div class="t-item">
      <div class="t-item-nombre">${item.producto_nombre}</div>
      <div class="t-item-detalle">
        <span>${item.cantidad} x ${formatoMoneda(item.precio_unitario)}</span>
        <span>${formatoMoneda(item.subtotal)}</span>
      </div>
    </div>
  `).join('')

  document.getElementById('t-total').textContent = formatoMoneda(cabecera.monto_total)
  document.getElementById('t-metodo').textContent = NOMBRES_METODO[cabecera.metodo_pago] || cabecera.metodo_pago

  const elDesglose = document.getElementById('t-desglose')
  if (cabecera.metodo_pago === 'combinado') {
    elDesglose.innerHTML = `
      <div class="t-fila muted"><span>Efectivo</span><span>${formatoMoneda(cabecera.monto_efectivo)}</span></div>
      <div class="t-fila muted"><span>Transferencia</span><span>${formatoMoneda(cabecera.monto_transferencia)}</span></div>
    `
  }

  elTicket.classList.remove('oculto')
  elAcciones.classList.remove('oculto')
}

document.getElementById('btn-imprimir').addEventListener('click', () => window.print())

document.getElementById('btn-compartir').addEventListener('click', async () => {
  const url = window.location.href
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Ticket once', url })
    } catch {
      // el usuario canceló el share, no hacemos nada
    }
  } else {
    await navigator.clipboard.writeText(url)
    alert('Link copiado. Podés pegarlo donde quieras compartirlo.')
  }
})

cargarTicket()
