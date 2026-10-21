#!/usr/bin/env node
// CLI do addon: sobe o painel apontando para um workspace do ai-job-search.
//   ajs-dashboard                 (de dentro da pasta do ai-job-search)
//   ajs-dashboard --root <pasta>  (de qualquer lugar)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ADDON_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(fs.readFileSync(path.join(ADDON_DIR, 'package.json'), 'utf8'))

const HELP = `ajs-dashboard ${pkg.version} - Painel Kanban para o ai-job-search

Uso:
  ajs-dashboard [--root <pasta>] [--port <n>] [--no-open]

Opções:
  --root <pasta>  workspace do ai-job-search (padrão: pasta atual ou um de seus pais)
  --port <n>      porta local (padrão: 5174)
  --no-open       não abrir o navegador
  -v, --version   mostra a versão
  -h, --help      mostra esta ajuda
`

const args = process.argv.slice(2)
for (let i = 0; i < args.length; i++) {
  const a = args[i]
  const value = () => {
    const v = args[++i]
    if (!v || v.startsWith('-')) fail(`${a} precisa de um valor`)
    return v
  }
  if (a === '-h' || a === '--help') { process.stdout.write(HELP); process.exit(0) }
  else if (a === '-v' || a === '--version') { console.log(pkg.version); process.exit(0) }
  else if (a === '--root') process.env.AJS_ROOT = path.resolve(value())
  else if (a === '--port') {
    const port = Number(value())
    if (!Number.isInteger(port) || port < 1 || port > 65535) fail('porta inválida')
    process.env.AJS_DASHBOARD_PORT = String(port)
  } else if (a === '--no-open') process.env.DASHBOARD_NO_OPEN = '1'
  else fail(`opção desconhecida: ${a}\n\n${HELP}`)
}

function fail(message) {
  console.error(`ajs-dashboard: ${message}`)
  process.exit(1)
}

// Valida o workspace antes de subir o servidor, para um erro claro em vez de um stack trace.
const { resolveWorkspace } = await import('../server/workspace.js')
let root
try { root = resolveWorkspace() } catch (e) { fail(e.message) }
process.env.AJS_ROOT = root

const { createServer } = await import('vite')
const server = await createServer({ configFile: path.join(ADDON_DIR, 'vite.config.js') })
await server.listen()
console.log(`\n  Painel de Vagas ${pkg.version}`)
console.log(`  workspace: ${root}`)
server.printUrls()
console.log('\n  Ctrl+C para encerrar\n')
