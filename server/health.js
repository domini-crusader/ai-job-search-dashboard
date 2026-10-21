// Diagnóstico do workspace para a aba Início: o que está instalado, configurado
// e com dados. Cada item diz o estado e, quando há, qual comando resolve.
import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { ROOT, SEEN, TRACKER, loadBoard } from './data.js'
import { python, claudeBin } from './commands.js'

function probe(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 10000, windowsHide: true, encoding: 'utf8' }, (err, stdout, stderr) => {
      resolve(err ? null : `${stdout}${stderr}`.trim())
    })
  })
}

// Primeira linha que parece versão, sem os avisos que o MiKTeX imprime antes.
function versionLine(out) {
  if (!out) return null
  return out.split(/\r?\n/).find((l) => /\d+\.\d+/.test(l) && !/issue|warning/i.test(l))?.trim() ?? null
}

function item(id, label, ok, detail, extra = {}) {
  return { id, label, status: ok === true ? 'ok' : ok === 'warn' ? 'warn' : 'missing', detail, ...extra }
}

function portals() {
  const dir = path.join(ROOT, '.agents', 'skills')
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(dir, d.name, 'SKILL.md')))
    .map((d) => {
      const skill = fs.readFileSync(path.join(dir, d.name, 'SKILL.md'), 'utf8')
      const front = skill.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? ''
      const hasCli = fs.existsSync(path.join(dir, d.name, 'cli', 'package.json'))
      return {
        id: d.name,
        name: d.name.replace(/-search$/, ''),
        enabled: !/^enabled:\s*false\b/m.test(front),
        installed: !hasCli || fs.existsSync(path.join(dir, d.name, 'cli', 'node_modules')),
      }
    })
}

export async function health() {
  const py = python()
  const [pyVer, pypdf, bun, lualatex, xelatex] = await Promise.all([
    py ? probe(py.cmd, [...py.pre, '--version']) : null,
    py ? probe(py.cmd, [...py.pre, '-c', 'import pypdf; print(pypdf.__version__)']) : null,
    probe('bun', ['--version']),
    probe('lualatex', ['--version']),
    probe('xelatex', ['--version']),
  ])
  const ports = portals()
  const missingPortals = ports.filter((p) => !p.installed)
  const board = loadBoard()
  const claude = claudeBin()

  const sections = [
    {
      id: 'env',
      title: 'Ambiente',
      items: [
        item('python', 'Python 3', Boolean(pyVer), pyVer || 'Não encontrado — instale o Python 3 ou defina PYTHON'),
        item('pypdf', 'pypdf', pypdf ? true : 'warn', pypdf ? `versão ${pypdf}` : 'Necessário para verificar PDFs',
          { action: pypdf || !py ? null : 'install-pypdf' }),
        item('bun', 'Bun', bun ? true : 'warn', bun ? `versão ${bun}` : 'Necessário para os CLIs dos portais (bun.sh)'),
        item('latex', 'LaTeX', lualatex && xelatex ? true : 'warn',
          lualatex && xelatex ? versionLine(lualatex) : 'lualatex/xelatex não encontrados (MiKTeX ou TeX Live)'),
        item('claude', 'Claude Code CLI', claude ? true : 'warn',
          claude ? 'Comandos abrem direto no terminal' : 'Opcional — sem ele, os comandos são copiados'),
      ],
    },
    {
      id: 'portals',
      title: 'Portais de vagas',
      items: [
        item('portals', `${ports.length} portais`, missingPortals.length ? 'warn' : true,
          missingPortals.length
            ? `Sem dependências: ${missingPortals.map((p) => p.name).join(', ')}`
            : 'Todos instalados',
          { action: missingPortals.length ? 'install-portals' : null }),
      ],
      portals: ports,
    },
    {
      id: 'data',
      title: 'Dados',
      items: [
        item('seen', 'Vagas encontradas', fs.existsSync(SEEN) ? true : 'warn',
          fs.existsSync(SEEN) ? `${board.meta.seenTotal} no histórico` : 'Nenhuma ainda — rode /scrape',
          { action: fs.existsSync(SEEN) ? null : 'scrape' }),
        item('tracker', 'Candidaturas', fs.existsSync(TRACKER) ? true : 'warn',
          fs.existsSync(TRACKER) ? `${board.applications.length} registradas` : 'Nenhuma ainda — o /apply cria o tracker'),
      ],
    },
  ]

  const all = sections.flatMap((s) => s.items)
  return {
    workspace: ROOT,
    sections,
    summary: {
      ok: all.filter((i) => i.status === 'ok').length,
      total: all.length,
      blocking: all.filter((i) => i.status === 'missing').length,
    },
  }
}
