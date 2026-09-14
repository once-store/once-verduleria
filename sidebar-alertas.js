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
