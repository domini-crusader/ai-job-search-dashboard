// "Gerar com o Claude": pede ao Claude Code, em modo não interativo e só leitura,
// que proponha as tags de busca a partir do que o /setup gravou no workspace.
// O resultado volta como sugestão; nada é salvo sem a pessoa revisar.
import { spawn } from 'node:child_process'
import { ROOT, httpError } from './data.js'
import { claudeBin } from './commands.js'
import { VOCAB_GROUPS, cleanVocab } from './settings.js'

const PROMPT = `Você está no workspace do ai-job-search. Apenas leia (não edite nada) estes arquivos:
CLAUDE.md, .claude/skills/job-application-assistant/01-candidate-profile.md,
.claude/skills/job-application-assistant/04-job-evaluation.md, .claude/skills/job-scraper/search-queries.md
e os .agents/skills/*/SKILL.md (portais instalados).

Com base no perfil e na configuração de busca do /setup (cargos, habilidades distintivas, região,
modalidade aceita, deal-breakers e portais), proponha tags para montar consultas de busca de vagas.

Responda SOMENTE com um objeto JSON, sem texto antes ou depois, com estas chaves, cada uma uma
lista de strings curtas (no máximo 20 itens, sem aspas internas):
- titles: cargos a buscar, incluindo variações de título e nos idiomas que a pessoa usa
- sites: domínios de busca (ex.: linkedin.com/jobs, gupy.io), coerentes com o mercado e os portais
- stacks: tecnologias que aparecem em anúncios para esse perfil
- skills: habilidades e competências pesquisáveis (não tecnologias)
- levels: níveis de senioridade compatíveis (respeite os deal-breakers)
- modes: termos de modalidade de trabalho aceitos (respeite os deal-breakers)
- locations: regiões e cidades para a busca
- salary: faixas de pretensão salarial plausíveis para o mercado e a senioridade

Use apenas o que está nos arquivos; não invente experiência.`

export function generateVocab() {
  const bin = claudeBin()
  if (!bin) throw httpError(501, 'CLI do Claude não encontrado — instale o Claude Code para gerar as tags')
  const args = ['-p', '--output-format', 'json',
    '--allowedTools', 'Read', 'Glob', 'Grep',
    '--disallowedTools', 'Bash', 'Edit', 'Write', 'NotebookEdit', 'WebFetch', 'WebSearch']
  return new Promise((resolve, reject) => {
    // O .cmd do npm só roda via shell; os argumentos são fixos e o prompt vai pelo stdin.
    const child = spawn(bin, args, { cwd: ROOT, windowsHide: true, shell: /\.cmd$/i.test(bin) })
    let out = ''
    let err = ''
    const timer = setTimeout(() => { child.kill(); reject(httpError(504, 'o Claude demorou demais para responder')) }, 300000)
    child.stdout.on('data', (d) => { out += d })
    child.stderr.on('data', (d) => { err += d })
    child.on('error', (e) => { clearTimeout(timer); reject(httpError(500, e.message)) })
    child.on('close', () => {
      clearTimeout(timer)
      let envelope = null
      try { envelope = JSON.parse(out.trim().split('\n').pop()) } catch { /* saída não-JSON */ }
      const text = envelope?.result ?? out
      if (!envelope || envelope.is_error) {
        const msg = `${text}\n${err}`
        if (/log ?in|not logged|authenticat|\/login/i.test(msg)) return reject(httpError(401, 'Faça login no Claude Code (Início → Ambiente → Fazer login) e tente de novo'))
        return reject(httpError(502, `o Claude não gerou as tags: ${msg.trim().slice(0, 300)}`))
      }
      const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)
      try {
        const data = JSON.parse(json)
        if (!VOCAB_GROUPS.some((g) => Array.isArray(data[g]))) throw new Error('sem listas')
        resolve({ groups: cleanVocab(data), cost: envelope.total_cost_usd ?? null })
      } catch {
        reject(httpError(502, 'a resposta do Claude não veio no formato esperado'))
      }
    })
    child.stdin.end(PROMPT)
  })
}
