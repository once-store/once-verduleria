import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = 'https://meekevxxjirvgsuppvij.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1lZWtldnh4amlydmdzdXBwdmlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU1MjQwMjMsImV4cCI6MjEwMTEwMDAyM30.MGajznwLTreSKal-1-aFcYsEHTTGC6geruLvRryQ88M'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

function formatoMoneda(n) {
  return '$' + Math.round(n).toLocaleString('es-AR')
}

function formatoFecha(f) {
  const [anio, mes, dia] = f.split('-')
  return `${dia}/${mes}/${anio}`
}

const elCargando = document.getElementById('cajon-cargando')
const elError = document.getElementById('cajon-error')
const elFicha = document.getElementById('cajon-ficha')

function mostrarError(mensaje) {
  elCargando.classList.add('oculto')
  elError.textContent = mensaje
  elError.classList.remove('oculto')
}

// Esta página vive protegida por la sesión que ya abriste en admin-v2.html,
// igual que compras.html. Si entrás acá directo sin haber iniciado sesión,
// te manda a loguearte primero.
const { data: { session } } = await supabase.auth.getSession()
if (!session) {
  window.location.href = 'admin-v2.html'
} else {
  buscarCajon()
}

async function buscarCajon() {
  const numeroGuia = Number(new URLSearchParams(window.location.search).get('n'))

  if (!numeroGuia) {
    mostrarError('Este link no tiene un número de cajón válido.')
    return
  }

  const { data: cajon, error } = await supabase
    .from('cajones')
    .select(`
      numero_guia, peso_inicial, creado_en,
      lotes ( codigo, ubicacion, cantidad_restante, costo_unitario, precio, fecha_ingreso,
        productos ( nombre, tipo ) )
    `)
    .eq('numero_guia', numeroGuia)
    .single()

  if (error || !cajon) {
    mostrarError(`No encontré ningún cajón con el número ${numeroGuia}.`)
    console.error(error)
    return
  }

  const lote = cajon.lotes
  const producto = lote?.productos
  const unidad = producto?.tipo === 'peso' ? 'kg' : 'unidades'

  document.getElementById('cajon-producto').textContent = producto?.nombre ?? '(producto no encontrado)'
  document.getElementById('cajon-numero').textContent = `cajón #${cajon.numero_guia}`
  document.getElementById('cajon-codigo').textContent = lote?.codigo ?? ''
  document.getElementById('cajon-peso').textContent = `${cajon.peso_inicial} ${unidad}`
  document.getElementById('cajon-fecha').textContent = formatoFecha(lote.fecha_ingreso)
  document.getElementById('cajon-ubicacion').textContent = lote.ubicacion === 'salon' ? 'Salón' : 'Depósito'
  document.getElementById('cajon-restante').textContent = `${lote.cantidad_restante} ${unidad}`
  document.getElementById('cajon-costo').textContent = formatoMoneda(lote.costo_unitario)
  document.getElementById('cajon-precio').textContent = formatoMoneda(lote.precio)

  elCargando.classList.add('oculto')
  elFicha.classList.remove('oculto')
}
