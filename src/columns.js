// Colunas do Kanban. `seen` = job_scraper/seen_jobs.json, `tracker` = job_search_tracker.csv.
// `drop` é o status gravado quando um card é solto na coluna (null = pede escolha).
export const FINAL_STATUSES = ['hired', 'rejected', 'no_response', 'offer_declined', 'withdrawn']

export const STATUS_LABELS = {
  new: 'Nova', ranked: 'Ranqueada', skipped: 'Descartada', expired: 'Expirada', unreachable: 'Inacessível',
  drafted: 'Rascunho', applied: 'Candidatado', interview: 'Entrevista', offer: 'Oferta',
  hired: 'Contratado', rejected: 'Rejeitado', no_response: 'Sem resposta',
  offer_declined: 'Oferta recusada', withdrawn: 'Desistência',
}

const TRACKER_OPEN = ['drafted', 'applied', 'interview', 'offer']

export const COLUMNS = [
  { id: 'new', title: 'Novas', hint: 'Encontradas pelo /scrape', source: 'seen', drop: 'new',
    match: (c) => c.source === 'seen' && c.status === 'new' },
  { id: 'ranked', title: 'Ranqueadas', hint: 'Pontuadas pelo /rank', source: 'seen', drop: 'ranked',
    match: (c) => c.source === 'seen' && c.status === 'ranked' },
  { id: 'drafted', title: 'Rascunho', hint: 'CV e carta gerados pelo /apply', source: 'tracker', drop: 'drafted',
    match: (c) => c.source === 'tracker' && c.status === 'drafted' },
  { id: 'applied', title: 'Candidatado', hint: 'Enviado, aguardando retorno', source: 'tracker', drop: 'applied',
    match: (c) => c.source === 'tracker' && c.status === 'applied' },
  { id: 'interview', title: 'Entrevista', hint: 'Em processo', source: 'tracker', drop: 'interview',
    match: (c) => c.source === 'tracker' && c.status === 'interview' },
  { id: 'offer', title: 'Oferta', hint: 'Proposta recebida', source: 'tracker', drop: 'offer',
    match: (c) => c.source === 'tracker' && c.status === 'offer' },
  // Status desconhecidos do tracker caem aqui, como no catch-all do /html-report.
  { id: 'closed', title: 'Encerradas', hint: 'Contratado, rejeitado, sem resposta…', source: 'tracker', drop: null,
    match: (c) => c.source === 'tracker' && !TRACKER_OPEN.includes(c.status) },
  { id: 'discarded', title: 'Descartadas', hint: 'Puladas, expiradas ou inacessíveis', source: 'seen', drop: 'skipped',
    optional: true,
    match: (c) => c.source === 'seen' && !['new', 'ranked'].includes(c.status) },
]

const FIT_ORDER = { high: 0, medium: 1, low: 2 }

export function sortCards(columnId, cards) {
  const byDate = (a, b) => String(b.date || '').localeCompare(String(a.date || ''))
  if (columnId === 'ranked') return cards.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || byDate(a, b))
  if (columnId === 'new' || columnId === 'discarded') {
    return cards.sort((a, b) => (FIT_ORDER[a.fit] ?? 3) - (FIT_ORDER[b.fit] ?? 3) || byDate(a, b))
  }
  return cards.sort(byDate)
}

export function daysUntil(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((new Date(`${iso.slice(0, 10)}T00:00:00`) - today) / 86400000)
}
