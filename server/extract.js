// Extração heurística do resumo de uma vaga a partir do texto do anúncio e dos
// dados estruturados (JSON-LD JobPosting, campos do CLI do portal).
// Tudo aqui é texto não confiável: só é exibido, nunca executado nem enviado a um modelo.

// ---------- HTML -> texto ----------

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', bull: '•', hellip: '…',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú',
  atilde: 'ã', otilde: 'õ', Atilde: 'Ã', Otilde: 'Õ', ccedil: 'ç', Ccedil: 'Ç', acirc: 'â', ecirc: 'ê', ocirc: 'ô',
  Acirc: 'Â', Ecirc: 'Ê', Ocirc: 'Ô', agrave: 'à', Agrave: 'À', uuml: 'ü', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“',
}

export function decodeEntities(s) {
  return String(s ?? '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n] ?? m)
}

export function htmlToText(html) {
  return decodeEntities(String(html ?? '')
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<h[1-6][^>]*>/gi, '\n\n')
    .replace(/<\/(p|div|h[1-6]|li|ul|ol|section|tr|strong)>/gi, (m) => (/strong/i.test(m) ? ' ' : '\n'))
    .replace(/<[^>]+>/g, ''))
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// ---------- JSON-LD ----------

export function jobPostingFromHtml(html) {
  for (const m of String(html).matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let raw = m[1].trim()
    if (raw.includes('&quot;')) raw = decodeEntities(raw)
    try {
      const data = JSON.parse(raw)
      const nodes = [data, ...(Array.isArray(data) ? data : []), ...(data['@graph'] ?? [])].flat()
      const job = nodes.find((n) => n && (n['@type'] === 'JobPosting' || (Array.isArray(n['@type']) && n['@type'].includes('JobPosting'))))
      if (job) return job
    } catch { /* JSON-LD malformado: segue para o próximo */ }
  }
  return null
}

export function metaContent(html, prop) {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*>`, 'i')
  const tag = String(html).match(re)?.[0]
  return tag ? decodeEntities(tag.match(/content=["']([^"']*)["']/i)?.[1] ?? '') || null : null
}

// ---------- seções do anúncio ----------

const SECTION_RES = [
  ['intro', /^(job description|descri[cç][aã]o( da vaga| do cargo)?|a vaga|the role|vaga)$/i],
  ['other', /(informa[cç][oõ]es adicionais|additional information|etapas do processo|hiring process|processo seletivo)/i],
  ['niceToHave', /(diferencia|desej[aá]v|nice[- ]to[- ]have|b[oô]nus points|pontos? extras?|preferred|plus)/i],
  ['benefits', /(benef[ií]cio|benefits|perks|o que oferecemos|what we offer|remunera[cç][aã]o)/i],
  ['requirements', /(requisito|requirement|qualifica|o que (voc[eê]|vc) (precisa|deve|traz)|o que esperamos|o que buscamos|must[- ]have|what you('ll)? (need|bring)|you have|habilidades|conhecimentos|skills|experi[eê]ncias? necess|perfil)/i],
  ['responsibilities', /(responsabilidade|atividade|atribui|o que (voc[eê]|vc) (vai|ir[aá]) fazer|responsibilit|what you('ll)? do|your role|desafio|day[- ]to[- ]day|dia a dia)/i],
  ['about', /^(sobre|about|quem somos|who we are|a empresa)/i],
]

function headingKind(line) {
  const l = line.replace(/[:：]\s*$/, '').trim()
  if (l.length < 3 || l.length > 70 || /[.!?]$/.test(l) || l.startsWith('- ')) return null
  for (const [kind, re] of SECTION_RES) if (re.test(l)) return kind
  return null
}

function itemsOf(lines) {
  const out = []
  for (const raw of lines) {
    const line = raw.replace(/^[-•*·▪●◦]\s*/, '').trim()
    if (!line) continue
    if (/^[-•*·▪●◦]/.test(raw.trim()) || line.length <= 160) out.push(line)
    else out.push(...line.split(/(?<=[.;])\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ])/).map((s) => s.trim()).filter(Boolean))
  }
  return out.map((s) => (s.length > 220 ? `${s.slice(0, 217)}…` : s)).slice(0, 12)
}

export function sections(text) {
  const out = { intro: [], requirements: [], niceToHave: [], responsibilities: [], benefits: [], about: [], other: [] }
  let current = 'intro'
  for (const line of String(text ?? '').split('\n')) {
    const kind = headingKind(line)
    if (kind) { current = kind; continue }
    out[current].push(line)
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, itemsOf(v)]))
}

// ---------- campos ----------

const fold = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

function workModel(text, title, ld, mode) {
  if (ld?.jobLocationType === 'TELECOMMUTE') return 'Remoto'
  const t = fold(`${title} ${text}`)
  if (mode) {
    const m = fold(mode)
    if (m.includes('remote')) return 'Remoto'
    if (m.includes('hybrid')) return 'Híbrido'
    if (m.includes('site') || m.includes('office')) return 'Presencial'
  }
  if (/100% remot|totalmente remot|fully remote|remote[- ]first/.test(t) || /remot/.test(fold(title))) return 'Remoto'
  const hybrid = /\b(hibrid|hybrid)/.test(t)
  const remote = /\b(remot[oa]|remote|home[- ]office|teletrabalho|anywhere)\b/.test(t)
  const onsite = /\b(presencial|on[- ]?site|in[- ]office)\b/.test(t)
  if (hybrid) return 'Híbrido'
  if (remote) return 'Remoto'
  if (onsite) return 'Presencial'
  return null
}

function contracts(text, ld, employment) {
  const t = ` ${text} `
  const out = new Set()
  if (/\bCLT\b/.test(t)) out.add('CLT')
  if (/\bPJ\b|pessoa jur[ií]dica/i.test(t)) out.add('PJ')
  if (/cooperad/i.test(t)) out.add('Cooperado')
  if (/\best[aá]gio\b|internship/i.test(t)) out.add('Estágio')
  if (/\btempor[aá]ri|\btemporary\b/i.test(t)) out.add('Temporário')
  if (/\bcontractor\b|freelanc/i.test(t)) out.add('Contractor')
  const types = [ld?.employmentType, employment].flat().filter(Boolean).map((s) => fold(s).replace(/[_-]/g, ' '))
  for (const ty of types) {
    if (ty.includes('full')) out.add('Tempo integral')
    else if (ty.includes('part')) out.add('Meio período')
    else if (ty.includes('contract')) out.add('Contractor')
    else if (ty.includes('intern')) out.add('Estágio')
    else if (ty.includes('temporary')) out.add('Temporário')
  }
  if (/tempo integral|full[- ]time/i.test(t)) out.add('Tempo integral')
  return [...out]
}

const LEVELS = [
  ['Estágio', /\b(estagi|intern)/], ['Júnior', /\b(junior|jr)\b/], ['Pleno', /\b(pleno|mid[- ]level|pl)\b/],
  ['Sênior', /\b(senior|sr)\b/], ['Especialista', /\b(especialista|specialist|expert)\b/],
  ['Tech Lead', /\b(tech lead|lider tecnico|team lead|lead)\b/], ['Staff / Principal', /\b(staff|principal)\b/],
]

function seniority(title, text, linkedinLevel) {
  const fromTitle = LEVELS.filter(([, re]) => re.test(fold(title))).map(([l]) => l)
  if (fromTitle.length) return fromTitle
  const map = { 'entry level': 'Júnior', associate: 'Pleno', 'mid-senior level': 'Pleno/Sênior', director: 'Diretoria', executive: 'Executivo', internship: 'Estágio' }
  if (linkedinLevel && map[fold(linkedinLevel)]) return [map[fold(linkedinLevel)]]
  const t = fold(text).slice(0, 1500)
  return LEVELS.filter(([l, re]) => ['Júnior', 'Pleno', 'Sênior'].includes(l) && re.test(t)).map(([l]) => l).slice(0, 2)
}

function salary(text, ld) {
  const b = ld?.baseSalary
  if (b) {
    const v = b.value ?? {}
    const cur = b.currency || v.currency || ''
    const fmt = (n) => Number(n).toLocaleString('pt-BR')
    const unit = { MONTH: '/mês', YEAR: '/ano', HOUR: '/hora', WEEK: '/semana', DAY: '/dia' }[v.unitText] ?? ''
    if (v.minValue && v.maxValue) return `${cur} ${fmt(v.minValue)} – ${fmt(v.maxValue)}${unit}`.trim()
    if (v.value || v.minValue) return `${cur} ${fmt(v.value || v.minValue)}${unit}`.trim()
  }
  const money = /(R\$|US\$|USD|BRL|EUR|€|£|\$)\s?\d[\d.,]*\s?(k|mil)?(\s?(?:-|–|a|até|to)\s?(?:R\$|US\$|USD|BRL|EUR|€|£|\$)?\s?\d[\d.,]*\s?(?:k|mil)?)?(\s?(?:\/|por|per)\s?(?:m[eê]s|month|ano|year|hora|hour|h)\b)?/i
  const m = String(text).match(money)
  if (m) return m[0].replace(/\s+/g, ' ').trim()
  if (/a combinar|a negociar|to be discussed|negoci[aá]vel|informada na entrevista|compat[ií]vel com o mercado|competitive (salary|compensation)/i.test(text)) return 'A combinar'
  return null
}

const BENEFITS = [
  ['Plano de saúde', /plano de sa[uú]de|assist[eê]ncia m[eé]dica|health (insurance|plan)|medical/i],
  ['Plano odontológico', /odontol|dental/i],
  ['Vale-refeição', /vale[- ]?refei|\bVR\b|meal (voucher|allowance)/i],
  ['Vale-alimentação', /vale[- ]?alimenta|\bVA\b|food (voucher|allowance)/i],
  ['Flash / benefício flexível', /\bflash\b|caju|swile|benef[ií]cio flex/i],
  ['Wellhub / Gympass', /wellhub|gympass|totalpass/i],
  ['PLR / bônus', /\bPLR\b|participa[cç][aã]o nos lucros|profit sharing|b[oô]nus/i],
  ['Seguro de vida', /seguro de vida|life insurance/i],
  ['Auxílio home office', /aux[ií]lio home ?office|home ?office (allowance|stipend)|ajuda de custo/i],
  ['Day off', /day ?off|folga no anivers/i],
  ['Educação / cursos', /aux[ií]lio educa|cursos|treinamento|learning (budget|stipend)|education/i],
  ['Stock options', /stock options?|equity|\bESOP\b/i],
  ['Férias remuneradas', /f[eé]rias remuneradas|paid time off|\bPTO\b|vacation/i],
  ['Previdência privada', /previd[eê]ncia privada|401k|pension/i],
  ['Equipamento', /notebook|laptop|equipamento/i],
]

const JOB_TYPES = [
  ['Back-end', /back[- ]?end|backend/], ['Front-end', /front[- ]?end|frontend/], ['Full stack', /full[- ]?stack/],
  ['Mobile', /\b(mobile|android|ios|flutter|react native)\b/], ['Dados', /\b(dados|data (engineer|scien|analyst))/],
  ['DevOps / Cloud', /\b(devops|sre|platform engineer|cloud engineer|infra)/], ['QA', /\b(qa|quality assurance|tester|testes)\b/],
  ['Arquitetura', /arquitet|architect/], ['Segurança', /seguranca|security/], ['Redes', /\b(network|redes)\b/],
  ['Engenharia de software', /software engineer|engenheir[oa] de software|desenvolvedor|developer/],
]

const STACKS = ['.NET', 'C#', 'Java', 'Kotlin', 'Python', 'Node.js', 'TypeScript', 'JavaScript', 'Go', 'PHP', 'Ruby', 'React',
  'Angular', 'Vue', 'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'SQL Server', 'PostgreSQL', 'MySQL', 'MongoDB', 'Redis',
  'Kafka', 'RabbitMQ', 'Elasticsearch', 'Terraform', 'GraphQL', 'Microservices']

function stacks(text) {
  const t = ` ${text} `
  return STACKS.filter((s) => {
    const esc = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`(^|[^\\w#])${esc}(?![\\w#])`, 'i').test(t) || (s === 'Microservices' && /microsservi/i.test(t))
  }).slice(0, 10)
}

function english(text) {
  const m = fold(text).match(/ingles (avancado|fluente|intermediario|basico|tecnico)|(fluent|advanced|intermediate|proficient|professional) english|english \((fluent|advanced|intermediate)/)
  if (!m) return /\bingl[eê]s\b|\benglish\b/i.test(text) ? 'Inglês mencionado' : null
  const lvl = (m[1] || m[2] || m[3]).replace('avancado', 'avançado').replace('intermediario', 'intermediário').replace('basico', 'básico').replace('tecnico', 'técnico')
  const pt = { fluent: 'fluente', advanced: 'avançado', intermediate: 'intermediário', proficient: 'avançado', professional: 'profissional' }
  return `Inglês ${pt[lvl] ?? lvl}`
}

function inlineFields(text) {
  const out = {}
  for (const m of String(text).matchAll(/^(sal[aá]rio|contrato|per[ií]odo|jornada|local|modalidade|regime|carga hor[aá]ria)\s*:\s*(.{2,120})$/gim)) {
    out[fold(m[1]).replace(/\s+/g, '_')] = m[2].trim()
  }
  return out
}

export function summarize({ title, text, ld, employment, level, mode, location }) {
  const sec = sections(text)
  const inline = inlineFields(text)
  const benefitTags = BENEFITS.filter(([, re]) => re.test(text)).map(([b]) => b)
  const intro = sec.intro.join(' ')
  return {
    summary: intro.length > 360 ? `${intro.slice(0, 357)}…` : intro || null,
    jobType: JOB_TYPES.filter(([, re]) => re.test(fold(title))).map(([t]) => t).slice(0, 2),
    workModel: workModel(`${text} ${inline.modalidade ?? ''} ${inline.contrato ?? ''}`, title, ld, mode),
    contracts: contracts(`${text} ${inline.regime ?? ''}`, ld, employment),
    seniority: seniority(title, text, level),
    salary: salary(`${inline.salario ?? ''}\n${text}`, ld),
    benefits: benefitTags,
    benefitItems: sec.benefits,
    requirements: sec.requirements,
    niceToHave: sec.niceToHave,
    responsibilities: sec.responsibilities,
    stacks: stacks(`${title}\n${text}`),
    english: english(text),
    schedule: inline.jornada || inline.periodo || inline.carga_horaria || null,
    location: location || null,
  }
}
