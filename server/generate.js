// "Gerar com o Claude": pede ao Claude Code, em modo não interativo e só leitura,
// propostas a partir do que o /setup gravou no workspace (tags de busca e categorias
// do search-queries.md). O resultado volta como sugestão; nada é salvo sem revisão.
import { spawn } from 'node:child_process'
import { ROOT, httpError } from './data.js'
import { claudeBin } from './commands.js'
import { VOCAB_GROUPS, BR_SITES, cleanVocab } from './settings.js'

const READ_ONLY = `Você está no workspace do ai-job-search. Apenas leia (não edite nada) estes arquivos:
CLAUDE.md, .claude/skills/job-application-assistant/01-candidate-profile.md,
.claude/skills/job-application-assistant/04-job-evaluation.md, .claude/skills/job-scraper/search-queries.md
e os .agents/skills/*/SKILL.md (portais instalados).`

const VOCAB_PROMPT = `${READ_ONLY}

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

function categoriesPrompt() {
  const br = BR_SITES.map((s) => s.domain).join(', ')
  return `${READ_ONLY}

Monte as categorias de busca do /scrape (a seção "## Query Categories" do search-queries.md),
como o /setup faria na seção 9 ("Job Search Configuration"): parta da função que a pessoa quer
exercer, traduza em cargos concretos e agrupe em categorias por direção de carreira.

Regras:
- 3 a 6 categorias, em ordem de prioridade (a primeira é a direção principal).
- Cada categoria tem de 4 a 8 consultas no formato de busca web usado pelo /scrape, por exemplo:
  site:linkedin.com/jobs "Cargo" remoto Brasil
  site:gupy.io "Cargo" "Tecnologia" remoto (Pleno OR Sênior)
- Use os sites que já estão em "## Search Sites" e, se o mercado for o Brasil, também sites
  brasileiros (${br}).
- Escreva as consultas nos idiomas da tabela Languages do CLAUDE.md, traduzindo os termos com
  naturalidade (não palavra por palavra).
- Respeite a localização, a modalidade aceita, a senioridade e os deal-breakers do perfil.
- Não use crases (\`) em nenhum campo.

Responda SOMENTE com um objeto JSON, sem texto antes ou depois, no formato:
{"categories": [{"title": "Nome curto da categoria",
  "description": "uma ou duas frases sobre a direção",
  "queries": ["site:... \\"Cargo\\" ...", "..."],
  "notes": "Títulos-variantes: Cargo A, Cargo B, Cargo C."}]}

Use apenas o que está nos arquivos; não invente experiência.`
}

// Roda `claude -p` só leitura, com o prompt pelo stdin, e devolve o JSON da resposta.
function runClaudeJson(prompt) {
  const bin = claudeBin()
  if (!bin) throw httpError(501, 'CLI do Claude não encontrado — instale o Claude Code para gerar sugestões')
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
        return reject(httpError(502, `o Claude não gerou a sugestão: ${msg.trim().slice(0, 300)}`))
      }
      try {
        resolve({ data: JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)), cost: envelope.total_cost_usd ?? null })
      } catch {
        reject(httpError(502, 'a resposta do Claude não veio no formato esperado'))
      }
    })
    child.stdin.end(prompt)
  })
}

export async function generateVocab() {
  const { data, cost } = await runClaudeJson(VOCAB_PROMPT)
  if (!VOCAB_GROUPS.some((g) => Array.isArray(data[g]))) throw httpError(502, 'a resposta do Claude não trouxe as listas de tags')
  return { groups: cleanVocab(data), cost }
}

// Categorias no formato do search-queries.md; o texto passa pelas mesmas validações
// de saveCategories quando a pessoa salvar.
export async function generateCategories() {
  const { data, cost } = await runClaudeJson(categoriesPrompt())
  const list = Array.isArray(data.categories) ? data.categories : []
  const text = (v, max) => String(v ?? '').replace(/`/g, '').replace(/\r\n/g, '\n').trim().slice(0, max)
  const categories = list.slice(0, 8).map((c) => ({
    title: text(c.title, 120).replace(/\n+/g, ' '),
    description: text(c.description, 800),
    queries: (Array.isArray(c.queries) ? c.queries : String(c.queries ?? '').split('\n'))
      .map((q) => text(q, 300).replace(/\n+/g, ' ')).filter(Boolean).slice(0, 12).join('\n'),
    notes: text(c.notes, 800),
  })).filter((c) => c.title && c.queries)
  if (!categories.length) throw httpError(502, 'a resposta do Claude não trouxe categorias')
  return { categories, cost }
}
