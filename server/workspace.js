// Localiza o workspace do ai-job-search que o painel vai ler e operar.
// Ordem: AJS_ROOT (definido por --root no CLI) > diretório atual e seus pais >
// pasta irmã ../ai-job-search ao lado deste addon.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const ADDON_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// Arquivos que só existem num checkout do ai-job-search.
const MARKERS = [
  path.join('tools', 'rank_state.py'),
  path.join('.claude', 'commands', 'rank.md'),
]

export function isWorkspace(dir) {
  return MARKERS.every((m) => fs.existsSync(path.join(dir, m)))
}

function walkUp(start) {
  let dir = path.resolve(start)
  for (;;) {
    if (isWorkspace(dir)) return dir
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

export function resolveWorkspace() {
  const explicit = process.env.AJS_ROOT
  if (explicit) {
    const dir = path.resolve(explicit)
    if (!isWorkspace(dir)) {
      throw new Error(`${dir} não parece um workspace do ai-job-search (faltam ${MARKERS.join(', ')})`)
    }
    return dir
  }
  const found = walkUp(process.cwd()) || walkUp(path.join(ADDON_DIR, '..', 'ai-job-search'))
  if (!found) {
    throw new Error(
      'workspace do ai-job-search não encontrado. Rode o comando de dentro da pasta do ' +
      'ai-job-search ou informe o caminho com --root <pasta> (ou a variável AJS_ROOT).',
    )
  }
  return found
}

