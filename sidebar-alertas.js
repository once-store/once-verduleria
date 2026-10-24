// Se incluye en el <head> o antes de </body> de cada página del panel.
// Único trabajo: fijarse si hay lotes esperando revisión en "Maduración"
// (vista sugerencias_maduracion) y prender el aviso junto a "Compras y
// mermas" en el sidebar -- así se nota estés en la página que estés, no
// solo cuando entrás a Compras.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = 'https://meekevxxjirvgsuppvij.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1lZWtldnh4amlydmdzdXBwdmlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU1MjQwMjMsImV4cCI6MjEwMTEwMDAyM30.MGajznwLTreSKal-1-aFcYsEHTTGC6geruLvRryQ88M'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

async function actualizarBadgeMaduracion() {
  const badge = document.getElementById('badge-maduracion')
  if (!badge) return

  const { count, error } = await supabase
    .from('sugerencias_maduracion')
    .select('*', { count: 'exact', head: true })

  if (error) {
    console.error(error)
    return
  }

  if (!count) {
    badge.classList.add('oculto')
  } else {
    badge.textContent = count
    badge.classList.remove('oculto')
  }
}

actualizarBadgeMaduracion()

// --- "Pedidos" (antes "Pedidos por armar"): nombre corto + numerito ---
// Se aplica acá para que valga en todas las páginas que cargan este archivo,
// sin editar cada copia del sidebar. El número es la misma cuenta que muestra
// la pantalla de armado: pedidos de WhatsApp con armado pendiente.
function prepararLinkPedidos() {
  const p = document.querySelector('.sidebar-menu a[href="armado.html"] p')
  if (!p) return null
  let badge = p.querySelector('#badge-armado-sidebar')
  if (!badge) {
    p.textContent = 'Pedidos '
    badge = document.createElement('span')
    badge.id = 'badge-armado-sidebar'
    badge.className = 'badge text-bg-warning oculto'
    badge.textContent = '0'
    p.appendChild(badge)
  }
  return badge
}

async function actualizarBadgePedidos() {
  const badge = prepararLinkPedidos()
  if (!badge || document.hidden) return

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return

  const { count, error } = await supabase
    .from('pedidos')
    .select('*', { count: 'exact', head: true })
    .eq('origen', 'whatsapp')
    .eq('armado_estado', 'pendiente')

  if (error) {
    console.error(error)
    return
  }

  if (!count) {
    badge.classList.add('oculto')
  } else {
    badge.textContent = count
    badge.classList.remove('oculto')
  }
}

actualizarBadgePedidos()
setInterval(actualizarBadgePedidos, 10000)

// Que el número no quede viejo: se refresca apenas volvés a la pestaña y
// justo después de apretar "Confirmar armado" (sin esperar al ciclo de 10 s).
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) actualizarBadgePedidos()
})
window.addEventListener('focus', actualizarBadgePedidos)
document.addEventListener('click', (e) => {
  if (e.target.closest('.btn-confirmar-armado')) {
    setTimeout(actualizarBadgePedidos, 1500)
    setTimeout(actualizarBadgePedidos, 4000)
  }
})
