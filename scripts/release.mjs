// Publicação automática do Danzo Entregador.
// Faz: build web → cap sync → APK release assinado → release no GitHub
// (danzo-entregador-releases) com o APK. O app instalado detecta a versão
// nova sozinho e oferece a atualização (services/appUpdate.js).
//
// Uso:  npm run release
// Requisito: variável de ambiente GH_TOKEN (token do GitHub com permissão
// de Contents no repo umpifelipeia/danzo-entregador-releases).
// Para subir a versão: edite versionName e versionCode em
// android/app/build.gradle ANTES de rodar.
import { execSync } from 'node:child_process'
import { readFileSync, statSync, createReadStream } from 'node:fs'
import { resolve } from 'node:path'

const REPO = 'umpifelipeia/danzo-entregador-releases'
const TOKEN = process.env.GH_TOKEN
if (!TOKEN) {
  console.error('❌ Defina a variável GH_TOKEN (token do GitHub). Ex: setx GH_TOKEN ghp_xxx (e abra um terminal novo)')
  process.exit(1)
}

const raiz = resolve(import.meta.dirname, '..')
const gradle = readFileSync(resolve(raiz, 'android/app/build.gradle'), 'utf8')
const versao = gradle.match(/versionName\s+"([^"]+)"/)?.[1]
if (!versao) { console.error('❌ versionName não encontrado no build.gradle'); process.exit(1) }
const tag = `v${versao}`

const gh = (caminho, opts = {}) =>
  fetch(`https://api.github.com${caminho}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      ...(opts.headers || {}),
    },
  })

// Não deixa republicar a mesma versão (o app compara a tag com a instalada)
const existe = await gh(`/repos/${REPO}/releases/tags/${tag}`)
if (existe.ok) {
  console.error(`❌ A release ${tag} já existe. Suba versionName/versionCode no android/app/build.gradle primeiro.`)
  process.exit(1)
}

const run = (cmd, cwd = raiz) => { console.log(`\n▶ ${cmd}`); execSync(cmd, { cwd, stdio: 'inherit', shell: true }) }

run('npm run build')
run('npx cap sync android')
run('gradlew.bat assembleRelease', resolve(raiz, 'android'))

const apkPath = resolve(raiz, 'android/app/build/outputs/apk/release/app-release.apk')
const tamanho = statSync(apkPath).size
console.log(`\n📦 APK: ${apkPath} (${(tamanho / 1048576).toFixed(1)} MB)`)

console.log(`\n🚀 Criando release ${tag} em ${REPO}…`)
const criada = await gh(`/repos/${REPO}/releases`, {
  method: 'POST',
  body: JSON.stringify({ tag_name: tag, name: versao, body: `Danzo Entregador ${versao}` }),
})
if (!criada.ok) { console.error('❌ Erro ao criar release:', await criada.text()); process.exit(1) }
const release = await criada.json()

const nomeAsset = `danzo-entregador-${tag}.apk`
console.log(`⬆️  Enviando ${nomeAsset}…`)
const upload = await fetch(
  `https://uploads.github.com/repos/${REPO}/releases/${release.id}/assets?name=${encodeURIComponent(nomeAsset)}`,
  {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/vnd.android.package-archive',
      'Content-Length': tamanho,
    },
    body: createReadStream(apkPath),
    duplex: 'half',
  }
)
if (!upload.ok) { console.error('❌ Erro no upload:', await upload.text()); process.exit(1) }

console.log(`\n✅ Release ${tag} publicada! Os entregadores recebem o aviso de atualização ao abrir o app.`)
console.log(`   ${release.html_url}`)
