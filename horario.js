import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = 'https://meekevxxjirvgsuppvij.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1lZWtldnh4amlydmdzdXBwdmlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU1MjQwMjMsImV4cCI6MjEwMTEwMDAyM30.MGajznwLTreSKal-1-aFcYsEHTTGC6geruLvRryQ88M'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

const vistaHorario = document.getElementById('vista-horario')
const listaHorario = document.getElementById('lista-horario')
const formNuevaFranja = document.getElementById('form-nueva-franja')
const franjaError = document.getElementById('franja-error')

const NOMBRES_DIA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

// Si no hay sesión, no tiene sentido mostrar esto — volvemos al login del admin
const { data: { session } } = await supabase.auth.getSession()
if (!session) {
  window.location.href = 'admin.html'
} else {
  vistaHorario.classList.remove('oculto')
  cargarHorario()
}

function formatoHora(t) {
  return (t || '').slice(0, 5)
}

async function cargarHorario() {
  const { data, error } = await supabase
    .from('horario_local')
    .select('*')
    .order('dia_semana', { ascending: true })
    .order('hora_inicio', { ascending: true })

  if (error) {
    console.error(error)
    listaHorario.innerHTML = '<p class="error">No se pudo cargar el horario.</p>'
    return
  }

  if (data.length === 0) {
    listaHorario.innerHTML = '<p class="muted">No hay franjas cargadas todavía.</p>'
    return
  }

  // Agrupamos por día, en el orden lunes...domingo
  const orden = [1, 2, 3, 4, 5, 6, 0]
  listaHorario.innerHTML = orden.map(dia => {
    const franjas = data.filter(f => f.dia_semana === dia)
    if (franjas.length === 0) return ''
    const filas = franjas.map(f => `
      <div class="fila-pendiente" data-id="${f.id}">
        <div class="fila-2" style="flex:1;">
          <input type="time" class="input-hora-inicio" value="${formatoHora(f.hora_inicio)}">
          <input type="time" class="input-hora-fin" value="${formatoHora(f.hora_fin)}">
        </div>
        <div class="acciones-pedido" style="margin-left:10px;">
          <button class="btn-confirmar btn-guardar-franja" data-id="${f.id}">Guardar</button>
          <button class="btn-cancelar btn-borrar-franja" data-id="${f.id}">Borrar</button>
        </div>
      </div>
    `).join('')
    return `<p class="subtitulo">${NOMBRES_DIA[dia]}</p>${filas}`
  }).join('')
}

formNuevaFranja.addEventListener('submit', async (e) => {
  e.preventDefault()
  franjaError.classList.add('oculto')

  const dia = Number(document.getElementById('franja-dia').value)
  const inicio = document.getElementById('franja-inicio').value
  const fin = document.getElementById('franja-fin').value

  if (!inicio || !fin) return

  const { error } = await supabase
    .from('horario_local')
    .insert({ dia_semana: dia, hora_inicio: inicio, hora_fin: fin })

  if (error) {
    franjaError.textContent = 'No se pudo agregar la franja.'
    franjaError.classList.remove('oculto')
    console.error(error)
    return
  }

  formNuevaFranja.reset()
  cargarHorario()
})

listaHorario.addEventListener('click', async (e) => {
  const btnGuardar = e.target.closest('.btn-guardar-franja')
  if (btnGuardar) {
    const fila = btnGuardar.closest('.fila-pendiente')
    const inicio = fila.querySelector('.input-hora-inicio').value
    const fin = fila.querySelector('.input-hora-fin').value
    btnGuardar.disabled = true
    btnGuardar.textContent = '...'
    const { error } = await supabase
      .from('horario_local')
      .update({ hora_inicio: inicio, hora_fin: fin })
      .eq('id', btnGuardar.dataset.id)
    btnGuardar.disabled = false
    btnGuardar.textContent = 'Guardar'
    if (error) {
      alert('No se pudo guardar. Probá de nuevo.')
      console.error(error)
      return
    }
    return
  }

  const btnBorrar = e.target.closest('.btn-borrar-franja')
  if (btnBorrar) {
    if (!confirm('¿Borrar esta franja horaria?')) return
    const { error } = await supabase
      .from('horario_local')
      .delete()
      .eq('id', btnBorrar.dataset.id)
    if (error) {
      alert('No se pudo borrar. Probá de nuevo.')
      console.error(error)
      return
    }
    cargarHorario()
  }
})
