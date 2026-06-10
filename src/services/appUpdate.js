// Auto-atualização do app (sem Play Store): consulta a última release no
// GitHub e, se for mais nova que a versão instalada, baixa o APK e abre o
// instalador via plugin nativo. No navegador (PWA/dev) vira no-op.
import { Capacitor, registerPlugin } from '@capacitor/core'

const AppUpdate = registerPlugin('AppUpdate')

const RELEASES_API = 'https://api.github.com/repos/umpifelipeia/danzo-entregador-releases/releases/latest'

// Compara versões "1.2" / "1.10.3" numericamente. true se a > b.
function versaoMaisNova(a, b) {
  const pa = String(a).split('.').map(n => parseInt(n, 10) || 0)
  const pb = String(b).split('.').map(n => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0
    const y = pb[i] || 0
    if (x !== y) return x > y
  }
  return false
}

// Retorna { versao, url } se houver atualização disponível, senão null.
export async function verificarAtualizacao() {
  if (!Capacitor.isNativePlatform()) return null
  try {
    const { versionName } = await AppUpdate.getInfo()
    const res = await fetch(RELEASES_API, {
      headers: { Accept: 'application/vnd.github+json' },
    })
    if (!res.ok) return null
    const release = await res.json()
    const versaoRemota = String(release.tag_name || '').replace(/^v/i, '')
    if (!versaoRemota || !versaoMaisNova(versaoRemota, versionName)) return null
    const apk = (release.assets || []).find(a => a.name?.toLowerCase().endsWith('.apk'))
    if (!apk?.browser_download_url) return null
    return { versao: versaoRemota, url: apk.browser_download_url }
  } catch {
    return null
  }
}

// Baixa o APK e abre o instalador do Android.
export async function baixarEInstalarAtualizacao(url) {
  await AppUpdate.baixarEInstalar({ url })
}
