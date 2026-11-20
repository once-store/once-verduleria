// Mapa de la vuelta del repartidor: paradas numeradas y recorrido dibujado sobre las calles.
//
// Se carga solo cuando se abre la pestaña Mapa (una "carga de mapa" de Mapbox se cuenta cada vez
// que se inicia el mapa, así que se inicia una sola vez y se reutiliza). Todo lo que depende del
// proveedor está en el objeto PROVEEDOR: si algún día se cambia de proveedor (por ejemplo a
// MapLibre + OpenRouteService), se reescribe ese objeto y la pantalla no cambia.
//
// Si el mapa no se puede cargar (falta el token, no hay conexión, error de Mapbox), la pantalla
// sigue funcionando con la lista y los botones de Google Maps y Waze.

const VERSION_GL = '3.2.0'
const MAX_PUNTOS_RUTA = 25 // límite de la API de rutas, incluido el local
const CENTRO_POR_DEFECTO = [-66.855, -29.413] // La Rioja (capital)
const ESTILOS = { claro: 'mapbox://styles/mapbox/streets-v12', oscuro: 'mapbox://styles/mapbox/dark-v11' }
const COLOR_RUTA = { claro: '#0b6a3b', oscuro: '#58c98a' }

let promesaLibreria = null

const PROVEEDOR = {
  nombre: 'mapbox',

  cargarLibreria() {
    if (window.mapboxgl) return Promise.resolve(window.mapboxgl)
    if (promesaLibreria) return promesaLibreria
    promesaLibreria = new Promise((resolve, reject) => {
      const css = document.createElement('link')
      css.rel = 'stylesheet'
      css.href = `https://api.mapbox.com/mapbox-gl-js/v${VERSION_GL}/mapbox-gl.css`
      document.head.appendChild(css)
      const js = document.createElement('script')
      js.src = `https://api.mapbox.com/mapbox-gl-js/v${VERSION_GL}/mapbox-gl.js`
      js.onload = () => (window.mapboxgl ? resolve(window.mapboxgl) : reject(new Error('Mapbox no se inicializó')))
      js.onerror = () => { promesaLibreria = null; reject(new Error('No se pudo cargar el mapa (¿sin conexión?)')) }
      document.head.appendChild(js)
    })
    return promesaLibreria
  },

  // puntos: [{lat, lng}], en el orden del recorrido. Devuelve la geometría y el resumen.
  async ruta(puntos, token, senal) {
    const coords = puntos.map((p) => `${p.lng},${p.lat}`).join(';')
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?geometries=geojson&overview=full&access_token=${encodeURIComponent(token)}`
    const r = await fetch(url, { signal: senal })
    const datos = await r.json().catch(() => ({}))
    if (!r.ok || !datos.routes || !datos.routes.length) {
      throw new Error(datos.message || `Mapbox no devolvió ruta (${datos.code || r.status})`)
    }
    const ruta = datos.routes[0]
    return { geometria: ruta.geometry, km: ruta.distance / 1000, min: ruta.duration / 60 }
  },
}

function crearPin(texto, clases, etiqueta) {
  const el = document.createElement('button')
  el.type = 'button'
  el.className = `pin ${clases}`
  el.textContent = texto
  el.setAttribute('aria-label', etiqueta)
  return el
}

const iconoLocal = '<svg class="i" aria-hidden="true"><use href="#i-store"/></svg>'

/**
 * Crea el mapa dentro de `contenedor`.
 * opciones: { token, oscuro, onSeleccionar(id), onRuta({km, min, aprox}), onError(mensaje) }
 * Devuelve { actualizar({ local, paradas, seleccionada }), setOscuro(bool), redimensionar(), destruir() }
 *   local: {lat, lng} o null
 *   paradas: [{ id, numero, lat, lng, sig }] en el orden del recorrido
 */
export async function crearMapa(contenedor, opciones) {
  const { token, onSeleccionar = () => {}, onRuta = () => {}, onError = () => {} } = opciones
  let oscuro = !!opciones.oscuro
  const gl = await PROVEEDOR.cargarLibreria()
  gl.accessToken = token

  const mapa = new gl.Map({
    container: contenedor,
    style: oscuro ? ESTILOS.oscuro : ESTILOS.claro,
    center: CENTRO_POR_DEFECTO,
    zoom: 12,
    attributionControl: true,
  })
  mapa.addControl(new gl.NavigationControl({ showCompass: false }), 'top-right')

  let listo = false
  let ultimo = { local: null, paradas: [], seleccionada: null }
  let pines = []
  let claveRuta = null
  let claveEncuadre = null
  let ultimaGeometria = null
  let pedido = 0

  function sembrarRuta() {
    if (mapa.getSource('ruta')) return
    mapa.addSource('ruta', { type: 'geojson', data: ultimaGeometria || { type: 'FeatureCollection', features: [] } })
    mapa.addLayer({ id: 'ruta-borde', type: 'line', source: 'ruta', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': oscuro ? '#0f1311' : '#ffffff', 'line-width': 9, 'line-opacity': 0.9 } })
    mapa.addLayer({ id: 'ruta-linea', type: 'line', source: 'ruta', filter: ['!=', ['get', 'aprox'], true], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': oscuro ? COLOR_RUTA.oscuro : COLOR_RUTA.claro, 'line-width': 5 } })
    mapa.addLayer({ id: 'ruta-aprox', type: 'line', source: 'ruta', filter: ['==', ['get', 'aprox'], true], paint: { 'line-color': oscuro ? COLOR_RUTA.oscuro : COLOR_RUTA.claro, 'line-width': 4, 'line-dasharray': [2, 2] } })
  }

  function ponerGeometria(feature) {
    ultimaGeometria = feature
    const fuente = mapa.getSource('ruta')
    if (fuente) fuente.setData(feature)
  }

  function dibujarPines() {
    pines.forEach((p) => p.remove())
    pines = []
    const { local, paradas, seleccionada } = ultimo
    if (local) {
      const el = crearPin('', 'local', 'Local')
      el.innerHTML = iconoLocal
      pines.push(new gl.Marker({ element: el, anchor: 'center' }).setLngLat([local.lng, local.lat]).addTo(mapa))
    }
    paradas.forEach((p) => {
      const el = crearPin(String(p.numero), `${p.sig ? 'sig' : ''} ${p.id === seleccionada ? 'sel' : ''}`, `Parada ${p.numero}`)
      el.addEventListener('click', (e) => { e.stopPropagation(); onSeleccionar(p.id) })
      pines.push(new gl.Marker({ element: el, anchor: 'center' }).setLngLat([p.lng, p.lat]).addTo(mapa))
    })
  }

  function encuadrar() {
    const puntos = [...ultimo.paradas.map((p) => [p.lng, p.lat])]
    if (ultimo.local) puntos.push([ultimo.local.lng, ultimo.local.lat])
    const clave = JSON.stringify(puntos)
    if (clave === claveEncuadre) return // no mover el mapa en cada actualización de 15 segundos
    claveEncuadre = clave
    if (!puntos.length) return
    if (puntos.length === 1) { mapa.easeTo({ center: puntos[0], zoom: 15 }); return }
    const b = puntos.reduce((acc, p) => [[Math.min(acc[0][0], p[0]), Math.min(acc[0][1], p[1])], [Math.max(acc[1][0], p[0]), Math.max(acc[1][1], p[1])]], [[puntos[0][0], puntos[0][1]], [puntos[0][0], puntos[0][1]]])
    mapa.fitBounds(b, { padding: 56, maxZoom: 16, duration: 0 })
  }

  async function calcularRuta() {
    const { local, paradas } = ultimo
    const puntos = [...(local ? [local] : []), ...paradas].slice(0, MAX_PUNTOS_RUTA)
    const clave = JSON.stringify(puntos.map((p) => [p.lat, p.lng]))
    if (clave === claveRuta) return
    claveRuta = clave
    if (puntos.length < 2) { ponerGeometria({ type: 'FeatureCollection', features: [] }); onRuta(null); return }
    const mio = ++pedido
    const control = new AbortController()
    const limite = setTimeout(() => control.abort(), 15000)
    try {
      const r = await PROVEEDOR.ruta(puntos, token, control.signal)
      if (mio !== pedido) return
      ponerGeometria({ type: 'Feature', properties: { aprox: false }, geometry: r.geometria })
      onRuta({ km: r.km, min: r.min, aprox: false, paradas: paradas.length })
    } catch (e) {
      if (mio !== pedido) return
      // Sin ruta por calles: se unen las paradas con una línea punteada para no dejar el mapa vacío.
      ponerGeometria({ type: 'Feature', properties: { aprox: true }, geometry: { type: 'LineString', coordinates: puntos.map((p) => [p.lng, p.lat]) } })
      onRuta({ aprox: true, paradas: paradas.length })
      onError('No se pudo calcular el recorrido por calles: ' + e.message)
    } finally {
      clearTimeout(limite)
    }
  }

  let firmaPines = null
  function aplicar() {
    if (!listo) return
    // Los pines se redibujan solo si algo cambió (la lista se actualiza cada 15 segundos).
    const firma = JSON.stringify([ultimo.local, ultimo.paradas.map((p) => [p.id, p.numero, p.lat, p.lng, !!p.sig]), ultimo.seleccionada])
    if (firma !== firmaPines) { firmaPines = firma; dibujarPines() }
    encuadrar()
    calcularRuta()
  }

  mapa.on('load', () => { listo = true; sembrarRuta(); aplicar() })
  mapa.on('error', (e) => { if (e && e.error && /401|403|token/i.test(String(e.error.message || e.error.status))) onError('El token del mapa no es válido o no tiene permiso para este sitio.') })

  return {
    actualizar(datos) { ultimo = { local: datos.local || null, paradas: datos.paradas || [], seleccionada: datos.seleccionada || null }; aplicar() },
    setOscuro(valor) {
      if (valor === oscuro) return
      oscuro = valor
      mapa.once('style.load', () => { sembrarRuta(); aplicar() })
      mapa.setStyle(oscuro ? ESTILOS.oscuro : ESTILOS.claro)
    },
    redimensionar() { mapa.resize() },
    destruir() { pines.forEach((p) => p.remove()); mapa.remove() },
  }
}
