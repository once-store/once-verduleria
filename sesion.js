import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = 'https://meekevxxjirvgsuppvij.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1lZWtldnh4amlydmdzdXBwdmlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU1MjQwMjMsImV4cCI6MjEwMTEwMDAyM30.MGajznwLTreSKal-1-aFcYsEHTTGC6geruLvRryQ88M'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

let sesionCache = null

/**
 * Devuelve { userId, email, rol, localId, nombre } del usuario logueado,
 * o null si no hay sesión activa. Si hay sesión pero no tiene fila en
 * usuarios_perfil (no debería pasar con cuentas de staff reales), vuelve
 * con rol: null — cada página lo trata como "sin acceso".
 * Se cachea en memoria para no repetir la consulta en cada llamada dentro
 * de la misma carga de página; usar forzarRecarga tras un login recién hecho.
 */
export async function obtenerSesionActual({ forzarRecarga = false } = {}) {
  if (sesionCache && !forzarRecarga) return sesionCache

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    sesionCache = null
    return null
  }

  const { data, error } = await supabase
    .from('usuarios_perfil')
    .select('rol, local_id, nombre')
    .eq('user_id', session.user.id)
    .maybeSingle()

  if (error) {
    console.error('No se pudo leer el perfil del usuario:', error)
  }

  sesionCache = {
    userId: session.user.id,
    email: session.user.email,
    rol: data?.rol ?? null,
    localId: data?.local_id ?? null,
    nombre: data?.nombre ?? null
  }
  return sesionCache
}

export function limpiarSesionCache() {
  sesionCache = null
}

const CLAVE_LOCAL_FILTRO = 'once_local_filtro'

/** Local elegido en el selector (solo tiene sentido para Dueño). null = "Todos". */
export function obtenerLocalFiltroActivo() {
  return localStorage.getItem(CLAVE_LOCAL_FILTRO) || null
}

function guardarLocalFiltroActivo(id) {
  if (id) localStorage.setItem(CLAVE_LOCAL_FILTRO, id)
  else localStorage.removeItem(CLAVE_LOCAL_FILTRO)
}

/**
 * Dibuja el selector de local dentro de `contenedorEl` y lo deja funcionando.
 * Solo se muestra para Dueño -- Encargado/Mostrador están atados a un único
 * local fijo por ahora, así que no tiene sentido ofrecerles nada para elegir.
 * Al cambiar, guarda la elección y recarga la página para que se aplique.
 */
export async function renderizarSelectorLocal(contenedorEl, rol) {
  if (!contenedorEl || rol !== 'dueno') return

  const { data, error } = await supabase.from('locales').select('id, nombre').order('nombre')
  if (error || !data || data.length < 2) return // con un solo local no hace falta selector

  const activo = obtenerLocalFiltroActivo()
  contenedorEl.innerHTML = `
    <select id="selector-local-activo" class="form-select form-select-sm" style="width:auto;">
      <option value="">Todos los locales</option>
      ${data.map(l => `<option value="${l.id}" ${l.id === activo ? 'selected' : ''}>${l.nombre}</option>`).join('')}
    </select>
  `
  contenedorEl.querySelector('#selector-local-activo').addEventListener('change', (e) => {
    guardarLocalFiltroActivo(e.target.value || null)
    window.location.reload()
  })
}

/**
 * Esconde del sidebar los <li> cuyo <a data-roles="..."> no incluya el rol actual.
 * Un link SIN atributo data-roles queda visible para cualquier rol logueado (ej. "Panel").
 * Se llama una sola vez, después de conocer el rol.
 */
export function aplicarVisibilidadSidebarPorRol(rol) {
  document.querySelectorAll('.sidebar-menu a[data-roles]').forEach(link => {
    const rolesPermitidos = link.dataset.roles.split(',').map(r => r.trim())
    if (!rolesPermitidos.includes(rol)) {
      const li = link.closest('li')
      if (li) li.classList.add('oculto')
    }
  })
}
