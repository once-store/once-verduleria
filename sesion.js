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
  // Caja va primero: así queda antes de Finanzas y de Números.
  agregarLinkCaja(rol)
  agregarLinkFinanzas(rol)
  agregarLinkInventario(rol)
  renombrarMercaderia()
}

/**
 * Caja la usan Dueño, Encargado y Mostrador. Hay páginas (ej. Compras) cuyo sidebar
 * quedó sin el link; en vez de copiarlo a mano en cada una, se agrega acá si falta.
 * Se ubica después de "Conversaciones" y antes de "Números", igual que en el Panel.
 */
function agregarLinkCaja(rol) {
  if (!['dueno', 'encargado', 'mostrador'].includes(rol)) return
  const menu = document.querySelector('.sidebar-menu')
  if (!menu || menu.querySelector('a[href="caja.html"]')) return

  const li = document.createElement('li')
  li.className = 'nav-item'
  li.innerHTML = `
    <a href="caja.html" class="nav-link" data-roles="dueno,encargado,mostrador">
      <i class="nav-icon bi bi-cash-coin"></i>
      <p>Caja</p>
    </a>`

  const numeros = menu.querySelector('a[href="metricas.html"]')?.closest('li')
  const salir = menu.querySelector('#btn-salir')?.closest('li')
  const referencia = numeros || salir
  if (referencia) referencia.before(li)
  else menu.appendChild(li)
}

/**
 * La página Finanzas es solo del Dueño. En vez de copiar su link a mano en el sidebar de cada
 * página, se agrega acá: aparece (antes de "Números") en toda página que llame a la función de
 * arriba, y solo si el rol es Dueño y la página todavía no tiene el link.
 */
function agregarLinkFinanzas(rol) {
  if (rol !== 'dueno') return
  const menu = document.querySelector('.sidebar-menu')
  if (!menu || menu.querySelector('a[href="finanzas.html"]')) return

  const li = document.createElement('li')
  li.className = 'nav-item'
  li.innerHTML = `
    <a href="finanzas.html" class="nav-link" data-roles="dueno">
      <i class="nav-icon bi bi-bank"></i>
      <p>Finanzas</p>
    </a>`

  const numeros = menu.querySelector('a[href="metricas.html"]')?.closest('li')
  const salir = menu.querySelector('#btn-salir')?.closest('li')
  const referencia = numeros || salir
  if (referencia) referencia.before(li)
  else menu.appendChild(li)
}

/**
 * Inventario lo ven Dueño, Encargado y Mostrador (la base ya oculta el costo al Mostrador).
 * Igual que Caja y Finanzas, se agrega acá si la página todavía no tiene el link. Se ubica
 * después de "Números" y antes de "Editar horario" (o, si no está, antes de "Cerrar sesión").
 */
function agregarLinkInventario(rol) {
  if (!['dueno', 'encargado', 'mostrador'].includes(rol)) return
  const menu = document.querySelector('.sidebar-menu')
  if (!menu || menu.querySelector('a[href="inventario.html"]')) return

  const li = document.createElement('li')
  li.className = 'nav-item'
  li.innerHTML = `
    <a href="inventario.html" class="nav-link" data-roles="dueno,encargado,mostrador">
      <i class="nav-icon bi bi-clipboard-data"></i>
      <p>Inventario</p>
    </a>`

  const numeros = menu.querySelector('a[href="metricas.html"]')?.closest('li')
  const horario = menu.querySelector('a[href="horario.html"]')?.closest('li')
  const salir = menu.querySelector('#btn-salir')?.closest('li')
  if (numeros) numeros.after(li)
  else if (horario) horario.before(li)
  else if (salir) salir.before(li)
  else menu.appendChild(li)
}

/**
 * "Compras y mermas" pasó a llamarse "Mercadería". En vez de editar el texto a mano en cada
 * página, se cambia acá: el link del menú (conservando el aviso de maduración), el atajo del
 * Panel, el título de la pestaña y el encabezado de la propia página de Mercadería.
 * Solo toca textos que digan exactamente "compras y mermas"; si ya dicen otra cosa, no hace nada.
 */
function renombrarMercaderia() {
  const NUEVO = 'Mercadería'
  const VIEJO = /compras y mermas/i

  document.querySelectorAll('a[href="compras.html"]').forEach(a => {
    const p = a.querySelector('p')
    if (p) {
      p.childNodes.forEach(nodo => {
        if (nodo.nodeType === Node.TEXT_NODE && VIEJO.test(nodo.textContent)) {
          nodo.textContent = nodo.textContent.replace(VIEJO, NUEVO)
        }
      })
    }
    const fuerte = a.querySelector('strong')
    if (fuerte && VIEJO.test(fuerte.textContent)) fuerte.textContent = NUEVO
  })

  document.querySelectorAll('.app-content-header h3').forEach(h => {
    if (h.textContent.trim().toLowerCase() === 'compras y mermas') h.textContent = NUEVO
  })

  if (VIEJO.test(document.title)) document.title = document.title.replace(VIEJO, 'mercadería')
}
