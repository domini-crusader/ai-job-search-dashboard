<script setup>
import { computed, ref, watch } from 'vue'
import { state, saveCategories, saveDays, togglePortal, saveLists, goTo, toast, trigger, apiPut, loadProfile } from '../store.js'
import Icon from './Icon.vue'
import QueryBuilder from './QueryBuilder.vue'
import VocabEditor from './VocabEditor.vue'
import CompanyLogo from './CompanyLogo.vue'

// Rascunho local das categorias; só vai para o search-queries.md ao salvar.
const draft = ref([])
const open = ref(null)
const days = ref(null)
const dragFrom = ref(null)

function reset() {
  draft.value = (state.search?.categories ?? []).map((c, i) => ({ ...c, key: `${i}-${c.title}` }))
  days.value = state.search?.days ?? null
}
watch(() => state.search, reset, { immediate: true })

const strip = (list) => list.map(({ title, description, queries, notes }) => ({ title, description, queries, notes }))
const dirty = computed(() => JSON.stringify(strip(draft.value)) !== JSON.stringify(strip(state.search?.categories ?? [])))
const invalid = computed(() => draft.value.some((c) => !c.title.trim()))

function move(i, delta) {
  const j = i + delta
  if (j < 0 || j >= draft.value.length) return
  const list = draft.value.slice()
  ;[list[i], list[j]] = [list[j], list[i]]
  draft.value = list
}
function onDrop(i) {
  if (dragFrom.value === null || dragFrom.value === i) return
  const list = draft.value.slice()
  const [item] = list.splice(dragFrom.value, 1)
  list.splice(i, 0, item)
  draft.value = list
  dragFrom.value = null
}
function add() {
  const key = `new-${Date.now()}`
  draft.value = [...draft.value, { key, title: 'Nova categoria', description: '', queries: '', notes: '', keywords: [] }]
  open.value = key
}
function remove(i) {
  if (confirm(`Remover a categoria "${draft.value[i].title}"? (Salve para gravar.)`)) {
    draft.value = draft.value.filter((_, k) => k !== i)
  }
}
// Portais e sites: os brasileiros (com ou sem CLI) primeiro; os demais CLIs depois.
const portalOf = (site) => state.search?.portals?.find((p) => p.id === site.portalId)
const brIds = computed(() => new Set((state.search?.regional ?? []).map((s) => s.portalId).filter(Boolean)))
const otherPortals = computed(() => (state.search?.portals ?? []).filter((p) => !brIds.value.has(p.id)))
const brCount = computed(() => (state.search?.regional ?? []).filter((s) => s.cli).length)

// Inclui um site brasileiro no search-queries.md (Search Sites + uma consulta site: por categoria).
async function includeSite(site) {
  if (dirty.value && !confirm('Há alterações não salvas nas categorias, que serão descartadas. Continuar?')) return
  const res = await apiPut('/api/settings/site', { domain: site.domain })
  if (res) {
    state.search = res
    toast(`${site.name} incluído na busca do /scrape`, 'ok')
    loadProfile()
  }
}

async function save() {
  if (await saveCategories(strip(draft.value))) open.value = null
}

// Cria uma lista de objetivos com os termos entre aspas das consultas da categoria.
async function listFrom(cat) {
  const lists = state.lists
  const id = `l${Date.now().toString(36)}`
  const ok = await saveLists({
    active: id,
    lists: [...lists.lists, {
      id, name: cat.title.replace(/\s*\(.*\)\s*$/, ''),
      filters: { include: cat.keywords, exclude: [], fits: [], portals: [], minScore: null, flagsOk: false, applications: true },
      columns: ['new', 'ranked', 'drafted', 'applied', 'interview', 'offer', 'closed'],
    }],
  })
  if (ok) {
    toast(`Lista "${cat.title}" criada`, 'ok')
    goTo('vagas')
  }
}
</script>

<template>
  <div v-if="!state.search" class="empty-state">Lendo a configuração de busca…</div>
  <template v-else>
    <p v-if="state.search.error" class="callout"><Icon name="alert" :size="18" /> {{ state.search.error }}</p>

    <div class="section-head">
      <div>
        <h2 class="section-title">Portais e sites de vagas</h2>
        <p class="muted small">
          Onde o /scrape procura. Com CLI, o site é consultado direto; sem CLI, entra pelas consultas
          <code>site:</code> (busca na web), que o /scrape só usa para cobrir lacunas.
        </p>
      </div>
    </div>

    <div class="panel portals">
      <div class="portal-group br">
        <span class="flag" aria-hidden="true"></span>
        <b>Brasil</b>
        <span class="muted small">{{ brCount }} de {{ (state.search.regional ?? []).length }} com CLI</span>
      </div>
      <div v-for="s in state.search.regional ?? []" :key="s.domain" class="pref-row site-row">
        <CompanyLogo :sources="[`https://${s.domain.replace(/^br\./, '')}/favicon.ico`]" :name="s.name" :size="28" />
        <div class="grow">
          <b>{{ s.name }} <span class="muted small">{{ s.domain }}</span></b>
          <span>{{ s.note }}</span>
        </div>
        <template v-if="s.cli">
          <span class="badge ok">CLI</span>
          <label class="switch" :title="portalOf(s)?.enabled ? 'Ligado no /scrape' : 'Desligado no /scrape'">
            <input type="checkbox" :checked="portalOf(s)?.enabled" @change="togglePortal(portalOf(s), $event.target.checked)" />
          </label>
        </template>
        <template v-else>
          <span v-if="s.listed && s.queries" class="badge" :title="`${s.queries} consulta(s) site:`">Busca na web</span>
          <span v-else-if="s.listed" class="badge warn" title="Listado em Search Sites, mas sem consultas site:">Sem consultas</span>
          <button v-if="!(s.listed && s.queries)" class="btn sm" @click="includeSite(s)"><Icon name="plus" :size="13" /> Incluir na busca</button>
          <button class="btn sm" :class="{ primary: s.listed && s.queries }" title="Abre o /add-portal no Claude Code (terminal) para gerar um CLI deste site" @click="trigger('add-portal', { args: s.url })">Criar CLI</button>
        </template>
      </div>

      <div class="portal-group">
        <Icon name="globe" :size="14" />
        <b>Outros portais</b>
        <span class="muted small">CLIs internacionais e de outros mercados</span>
      </div>
      <div v-for="p in otherPortals" :key="p.id" class="pref-row site-row">
        <CompanyLogo :sources="[p.domain && `https://${p.domain}/favicon.ico`]" :name="p.name" :size="28" />
        <div class="grow">
          <b>{{ p.name }} <span v-if="p.domain" class="muted small">{{ p.domain }}</span></b>
          <span>{{ p.installed ? (p.description || p.id) : 'Dependências não instaladas' }}</span>
        </div>
        <span class="badge ok">CLI</span>
        <label class="switch" :title="p.enabled ? 'Ligado no /scrape' : 'Desligado no /scrape'">
          <input type="checkbox" :checked="p.enabled" @change="togglePortal(p, $event.target.checked)" />
        </label>
      </div>
      <div class="pref-row site-row">
        <span class="add-portal-icon"><Icon name="plus" :size="16" /></span>
        <div class="grow"><b>Novo portal</b><span>Gera um CLI para qualquer outro site de vagas (/add-portal, no terminal).</span></div>
        <button class="btn sm" @click="trigger('add-portal')">Adicionar</button>
      </div>
    </div>

    <VocabEditor />

    <div class="section-head">
      <div>
        <h2 class="section-title">Categorias de busca</h2>
        <p class="muted small">A ordem é a prioridade usada pelo /scrape. Arraste para reorganizar.</p>
      </div>
      <div class="actions-inline">
        <button class="btn sm" @click="add"><Icon name="plus" :size="14" /> Categoria</button>
      </div>
    </div>

    <div class="panel cat-list">
      <div
        v-for="(c, i) in draft" :key="c.key" class="cat" :class="{ expanded: open === c.key }"
        draggable="true" @dragstart="dragFrom = i" @dragover.prevent @drop.prevent="onDrop(i)"
      >
        <div class="cat-row">
          <span class="grip" title="Arrastar">⋮⋮</span>
          <span class="prio">{{ i + 1 }}</span>
          <button class="cat-title" @click="open = open === c.key ? null : c.key">
            <b>{{ c.title || 'Sem título' }}</b>
            <span>{{ c.queries.split('\n').filter(Boolean).length }} consultas<template v-if="c.keywords?.length"> · {{ c.keywords.slice(0, 3).join(', ') }}</template></span>
          </button>
          <button class="btn ghost sm icon-only" title="Subir" :disabled="i === 0" @click="move(i, -1)">↑</button>
          <button class="btn ghost sm icon-only" title="Descer" :disabled="i === draft.length - 1" @click="move(i, 1)">↓</button>
          <button class="btn ghost sm" title="Criar uma lista de vagas com estes termos" :disabled="!c.keywords?.length" @click="listFrom(c)">
            <Icon name="board" :size="14" /> Lista
          </button>
        </div>
        <div v-if="open === c.key" class="cat-edit">
          <label class="field"><span>Título</span><input v-model="c.title" class="input" maxlength="120" /></label>
          <label class="field"><span>Descrição</span><textarea v-model="c.description" class="input area" rows="2"></textarea></label>
          <QueryBuilder :category="c" />
          <details class="more">
            <summary>Editar consultas como texto</summary>
            <textarea v-model="c.queries" class="input area mono" rows="6" spellcheck="false"></textarea>
          </details>
          <label class="field"><span>Notas (títulos-variantes, observações)</span><textarea v-model="c.notes" class="input area" rows="2"></textarea></label>
          <div class="cat-edit-foot">
            <button class="btn ghost sm danger" @click="remove(i)"><Icon name="trash" :size="14" /> Remover</button>
          </div>
        </div>
      </div>
      <p v-if="!draft.length" class="empty-state">Nenhuma categoria. Crie uma ou rode /setup.</p>
    </div>

    <div v-if="dirty" class="savebar">
      <span>Alterações não salvas em <code>{{ state.search.file }}</code></span>
      <button class="btn ghost" @click="reset">Descartar</button>
      <button class="btn primary" :disabled="invalid" @click="save">Salvar</button>
    </div>

    <h2 class="section-title">Filtros do /scrape</h2>
    <div class="panel">
      <div class="pref-row">
        <div><b>Janela de datas</b><span>Só vagas publicadas nos últimos N dias (ou com prazo aberto).</span></div>
        <form class="inline-form" @submit.prevent="saveDays(days)">
          <input v-model.number="days" class="input num" type="number" min="1" max="365" :disabled="!state.search.days" />
          <span class="muted small">dias</span>
          <button class="btn sm" :disabled="!state.search.days || days === state.search.days">Salvar</button>
        </form>
      </div>
    </div>
    <p class="muted small foot-note">
      Antes de cada gravação, o arquivo original é copiado para <code>~/.ai-job-search-dashboard/backups</code>.
    </p>
  </template>
</template>
