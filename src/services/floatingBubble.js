// Bolinha flutuante (overlay) do app nativo Android.
// No navegador (PWA/dev) tudo vira no-op e retorna false.
import { Capacitor, registerPlugin } from '@capacitor/core'

const FloatingBubble = registerPlugin('FloatingBubble')

export function bolhaDisponivel() {
  return Capacitor.isNativePlatform()
}

// true se o app pode desenhar por cima de outros apps.
export async function temPermissaoBolha() {
  if (!Capacitor.isNativePlatform()) return false
  try {
    const { granted } = await FloatingBubble.checkPermission()
    return !!granted
  } catch {
    return false
  }
}

// Abre a tela de configuracao de sobreposicao. Retorna true se ja tinha permissao.
export async function pedirPermissaoBolha() {
  if (!Capacitor.isNativePlatform()) return false
  try {
    const { granted } = await FloatingBubble.requestPermission()
    return !!granted
  } catch {
    return false
  }
}

// Mostra a bolinha. Retorna true se mostrou (precisa de permissao).
export async function mostrarBolha() {
  if (!Capacitor.isNativePlatform()) return false
  try {
    if (!(await temPermissaoBolha())) return false
    await FloatingBubble.show()
    return true
  } catch {
    return false
  }
}

export async function esconderBolha() {
  if (!Capacitor.isNativePlatform()) return
  try {
    await FloatingBubble.hide()
  } catch {}
}
