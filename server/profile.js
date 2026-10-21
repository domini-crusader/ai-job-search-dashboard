// Validação do perfil: percorre o que o /setup preenche (CLAUDE.md, os arquivos
// do job-application-assistant, os templates e a configuração de busca) e diz,
// etapa por etapa, o que está completo e o que falta.
import fs from 'node:fs'
import path from 'node:path'
import { ROOT } from './data.js'

const SKILL = path.join('.claude', 'skills', 'job-application-assistant')

function read(rel) {
  const file = path.join(ROOT, rel)
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n') : null
}

// Tokens de modelo ([COMPANY], [YOUR_EMAIL]...) fora de comentários HTML.
function tokens(text) {
  if (!text) return []
  const clean = text.replace(/<!--[\s\S]*?-->/g, '')
  return [...new Set(clean.match(/\[[A-Z][A-Z0-9_]{3,}\]/g) || [])]
}

// Conteúdo de um "### Título" dentro de um texto markdown.
function section(md, title) {
  if (!md) return null
  const re = new RegExp(`^###\\s+${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'mi')
  const m = re.exec(md)
  if (!m) return null
  const rest = md.slice(m.index + m[0].length)
  const end = rest.search(/^#{2,3}\s/m)
  return (end < 0 ? rest : rest.slice(0, end)).replace(/<!--[\s\S]*?-->/g, '').trim()
}

const EMPTY = /^[-*\s]*(nenhum|nenhuma|none|n\/a|não informad|not provided)/i

function filled(text) {
  return Boolean(text) && !EMPTY.test(text) && tokens(text).length === 0
}

function bullets(text) {
  return (text?.match(/^\s*[-*]\s+\S/gm) || []).length
}

function step(id, title, description, checks, { optional = false, fix = 'setup', files = [] } = {}) {
  const done = checks.filter((c) => c.ok).length
  return {
    id, title, description, optional, fix, files, checks,
    status: done === checks.length ? 'done' : optional ? 'optional' : done === 0 ? 'todo' : 'partial',
  }
}

const check = (label, ok, hint) => ({ label, ok: Boolean(ok), hint: ok ? null : hint })

export function profileReport() {
  const claude = read('CLAUDE.md')
  const p01 = read(path.join(SKILL, '01-candidate-profile.md'))
  const p02 = read(path.join(SKILL, '02-behavioral-profile.md'))
  const p04 = read(path.join(SKILL, '04-job-evaluation.md'))
  const p05 = read(path.join(SKILL, '05-cv-templates.md'))
  const p06 = read(path.join(SKILL, '06-cover-letter-templates.md'))
  const p07 = read(path.join(SKILL, '07-interview-prep.md'))
  const cv = read(path.join('cv', 'main_example.tex'))
  const queries = read(path.join('.claude', 'skills', 'job-scraper', 'search-queries.md'))

  const identity = section(claude, 'Identity')
  const field = (name) => identity?.match(new RegExp(`\\*\\*${name}:\\*\\*\\s*(.+)`))?.[1]?.trim()
  const langRows = (identity?.match(/^\s*\|(?!\s*-)(?!\s*Language)[^|\n]+\|[^|\n]+\|/gm) || []).length
  const star = (p07?.match(/^###\s+\d+\./gm) || []).length
  const starStubs = /STAR Candidates \(Complete Manually\)/i.test(p07 || '')
  const categories = (queries?.match(/^###\s+Priority\s+\d+/gmi) || []).length
  const docsDir = path.join(ROOT, 'documents')
  const docs = fs.existsSync(docsDir)
    ? fs.readdirSync(docsDir, { withFileTypes: true }).filter((d) => d.isDirectory())
      .map((d) => ({ name: d.name, count: fs.readdirSync(path.join(docsDir, d.name)).filter((f) => !f.startsWith('.')).length }))
    : []

  const steps = [
    step('identity', 'Identidade e contato', 'Nome, localização, idiomas e situação atual.', [
      check('Nome', filled(field('Name')), 'Informe seu nome no CLAUDE.md'),
      check('Localização', filled(field('Location')), 'Informe cidade/país e modalidade aceita'),
      check('Idiomas', langRows > 0, 'Preencha a tabela de idiomas com o nível de cada um'),
      check('Situação atual', filled(field('Status')), 'Diga se está empregado e o que busca'),
      check('Contato no CV base', cv && /\\email\{[^}[]+\}/.test(cv) && /\\name\{[^}[]+\}/.test(cv),
        'Nome e e-mail em cv/main_example.tex'),
    ], { files: ['CLAUDE.md', 'cv/main_example.tex'] }),
    step('education', 'Formação', 'Cursos, instituições e datas.', [
      check('Formação acadêmica', bullets(section(claude, 'Education')) > 0, 'Liste ao menos uma formação'),
    ], { files: ['CLAUDE.md'] }),
    step('experience', 'Experiência profissional', 'Cargos, empresas, períodos e realizações.', [
      check('Experiências', bullets(section(claude, 'Professional Experience')) > 0, 'Liste suas experiências'),
      check('Perfil detalhado (01-candidate-profile)', p01 && tokens(p01).length === 0,
        `Ainda há campos de modelo: ${tokens(p01).slice(0, 4).join(', ')}`),
    ], { files: ['CLAUDE.md', `${SKILL}/01-candidate-profile.md`] }),
    step('skills', 'Habilidades', 'Stack principal, secundária e domínio.', [
      check('Habilidades técnicas', filled(section(claude, 'Technical Skills')), 'Preencha Technical Skills'),
    ], { files: ['CLAUDE.md'] }),
    step('behavior', 'Perfil comportamental', 'Como você trabalha, forças e pontos de crescimento.', [
      check('Resumo no CLAUDE.md', filled(section(claude, 'Behavioral Profile')), 'Preencha Behavioral Profile'),
      check('Arquivo 02-behavioral-profile', p02 && tokens(p02).length === 0, 'Ainda com campos de modelo'),
    ], { files: ['CLAUDE.md', `${SKILL}/02-behavioral-profile.md`] }),
    step('goals', 'Objetivos e preferências', 'O que te motiva, setores-alvo e o que é inegociável.', [
      check('O que te motiva', filled(section(claude, 'What Excites You')), 'Preencha What Excites You'),
      check('Setores-alvo', filled(section(claude, 'Target Sectors')), 'Liste setores e empresas-alvo'),
      check('Deal-breakers', filled(section(claude, 'Deal-breakers')), 'Liste o que te faz recusar uma vaga'),
      check('Critérios de avaliação (04-job-evaluation)', p04 && tokens(p04).length === 0, 'Ainda com campos de modelo'),
    ], { files: ['CLAUDE.md', `${SKILL}/04-job-evaluation.md`] }),
    step('search', 'Configuração de busca', 'Categorias de consultas usadas pelo /scrape.', [
      check('Arquivo search-queries.md', queries && tokens(queries).length === 0,
        `Ainda há campos de modelo: ${tokens(queries).slice(0, 4).join(', ')}`),
      check('Categorias de busca', categories > 0, 'Crie ao menos uma categoria "Priority"'),
    ], { files: ['.claude/skills/job-scraper/search-queries.md'], fix: 'search' }),
    step('templates', 'Templates de CV e carta', 'Bloco de contato e modelos usados pelo /apply.', [
      check('Template de CV (05-cv-templates)', p05 && tokens(p05).length === 0,
        `Campos pendentes: ${tokens(p05).slice(0, 4).join(', ')}`),
      check('Template de carta (06-cover-letter-templates)', p06 && tokens(p06).length === 0,
        `Campos pendentes: ${tokens(p06).slice(0, 4).join(', ')}`),
      check('CV base (cv/main_example.tex)', cv && tokens(cv).length === 0,
        `Campos pendentes: ${tokens(cv).slice(0, 4).join(', ')}`),
    ], { files: [`${SKILL}/05-cv-templates.md`, `${SKILL}/06-cover-letter-templates.md`, 'cv/main_example.tex'] }),
    step('interview', 'Preparação para entrevistas', 'Exemplos STAR prontos para usar.', [
      check('Exemplos STAR', star >= 3, `Há ${star} exemplo(s); o /setup recomenda ao menos 3`),
      check('Sem rascunhos pendentes', !starStubs, 'Complete os "STAR Candidates" deixados pelo /setup'),
    ], { files: [`${SKILL}/07-interview-prep.md`] }),
    step('extras', 'Certificações, publicações e prêmios', 'Opcional, mas fortalece o CV.', [
      check('Certificações', filled(section(claude, 'Certifications')), 'Nenhuma informada'),
      check('Publicações', filled(section(claude, 'Publications')), 'Nenhuma informada'),
      check('Prêmios', filled(section(claude, 'Awards')), 'Nenhum informado'),
    ], { optional: true, fix: 'expand', files: ['CLAUDE.md'] }),
    step('documents', 'Documentos de apoio', 'CVs, LinkedIn, diplomas e referências em documents/ melhoram o /setup e o /expand.', [
      ...['cv', 'linkedin', 'diplomas', 'references', 'projects'].map((name) => {
        const d = docs.find((x) => x.name === name)
        return check(`documents/${name}`, d?.count > 0, 'Vazio')
      }),
    ], { optional: true, fix: 'expand', files: ['documents/README.md'] }),
  ]

  const required = steps.filter((s) => !s.optional)
  return {
    name: field('Name') || null,
    steps,
    summary: { done: required.filter((s) => s.status === 'done').length, total: required.length },
  }
}
