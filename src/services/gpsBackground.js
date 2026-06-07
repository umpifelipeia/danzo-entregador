// GPS em segundo plano para o app nativo (Capacitor / Android).
// No app nativo usa @capacitor-community/background-geolocation (serviço em
// primeiro plano + localização mesmo com o app minimizado/fechado).
// No navegador (PWA/dev) retorna false e o caller usa navigator.geolocation.
import { Capacitor, registerPlugin } from '@capacitor/core'
import api from './api'

const BackgroundGeolocation = registerPlugin('BackgroundGeolocation')

let watcherId = null

export function ehNativo() {
  return Capacitor.isNativePlatform()
}

// Inicia o rastreio em segundo plano. onCoord(coords) é chamado a cada posição.
// Retorna true se iniciou no modo nativo; false se deve cair no fallback web.
export async function iniciarGpsBackground(onCoord) {
  if (!Capacitor.isNativePlatform()) return false

  await pararGpsBackground()

  watcherId = await BackgroundGeolocation.addWatcher(
    {
      backgroundTitle: 'Danzo Entregador ativo',
      backgroundMessage: 'Rastreando sua localização para as entregas.',
      requestPermissions: true,
      stale: false,
      distanceFilter: 20, // metros entre atualizações
    },
    async (location, error) => {
      if (error) {
        console.error('[GPS bg] erro:', error.code || error.message)
        return
      }
      if (!location) return
      const coords = { lat: location.latitude, lon: location.longitude }
      try {
        await api.patch('/entregadores/meu-gps', { lat: coords.lat, lng: coords.lon })
      } catch (e) {
        console.error('[GPS bg] falha ao enviar:', e.message)
      }
      if (onCoord) onCoord(coords)
    }
  )
  return true
}

export async function pararGpsBackground() {
  if (!watcherId) return
  try {
    await BackgroundGeolocation.removeWatcher({ id: watcherId })
  } catch (e) {
    console.error('[GPS bg] erro ao parar:', e.message)
  }
  watcherId = null
}
