// Push (FCM) do app nativo: pede permissao de notificacao, obtem o token do
// dispositivo e registra no backend. No navegador (PWA/dev) vira no-op.
import { Capacitor, registerPlugin } from '@capacitor/core'
import api from './api'

const PushDanzo = registerPlugin('PushDanzo')

export function pushDisponivel() {
  return Capacitor.isNativePlatform()
}

export async function pedirPermissaoPush() {
  if (!Capacitor.isNativePlatform()) return false
  try {
    const { granted } = await PushDanzo.requestPermission()
    return !!granted
  } catch {
    return false
  }
}

// Pede permissao (se preciso), obtem o token e envia ao backend.
// Retorna true se registrou. Idempotente — pode chamar a cada abertura.
export async function registrarTokenPush() {
  if (!Capacitor.isNativePlatform()) return false
  try {
    const granted = await pedirPermissaoPush()
    if (!granted) return false
    const { token } = await PushDanzo.getToken()
    if (!token) return false
    await api.patch('/entregadores/meu-fcm-token', { token })
    return true
  } catch (e) {
    console.error('[push] falha ao registrar token:', e.message)
    return false
  }
}
