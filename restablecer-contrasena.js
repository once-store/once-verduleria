import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = 'https://meekevxxjirvgsuppvij.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1lZWtldnh4amlydmdzdXBwdmlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU1MjQwMjMsImV4cCI6MjEwMTEwMDAyM30.MGajznwLTreSKal-1-aFcYsEHTTGC6geruLvRryQ88M'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

const form = document.getElementById('form-restablecer')
const errorEl = document.getElementById('restablecer-error')
const okEl = document.getElementById('restablecer-ok')

form.addEventListener('submit', async (e) => {
  e.preventDefault()
  errorEl.classList.add('oculto')

  const pass1 = document.getElementById('nueva-password').value
  const pass2 = document.getElementById('nueva-password-confirmar').value

  if (pass1 !== pass2) {
    errorEl.textContent = 'Las contraseñas no coinciden.'
    errorEl.classList.remove('oculto')
    return
  }
  if (pass1.length < 6) {
    errorEl.textContent = 'La contraseña tiene que tener al menos 6 caracteres.'
    errorEl.classList.remove('oculto')
    return
  }

  const btn = form.querySelector('button[type="submit"]')
  btn.disabled = true
  btn.textContent = '...'

  // El link del mail deja una sesión temporal de tipo "recovery" cargada en el navegador;
  // supabase-js la detecta solo al abrir esta página, así que alcanza con updateUser().
  const { error } = await supabase.auth.updateUser({ password: pass1 })

  btn.disabled = false
  btn.textContent = 'Guardar contraseña'

  if (error) {
    errorEl.textContent = 'El link venció o ya se usó. Volvé al login y pedí uno nuevo.'
    errorEl.classList.remove('oculto')
    console.error(error)
    return
  }

  form.classList.add('oculto')
  okEl.classList.remove('oculto')
})
