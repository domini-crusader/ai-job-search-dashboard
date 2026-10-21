<script setup>
import { computed, ref } from 'vue'
import { state, toast, apiPut } from '../store.js'
import { parseBlocks, serializeBlocks, viewBlocks, inline } from '../markdown.js'
import Icon from './Icon.vue'

const props = defineProps({ section: Object, step: String })
const emit = defineEmits(['saved'])

const mode = ref('view') // view | edit | markdown
const blocks = ref([])
const markdown = ref('')
const saving = ref(false)

const view = computed(() => viewBlocks(props.section.content))
const fileLabel = computed(() => props.section.file.split('/').pop())
const isComment = (b) => b.type === 'raw' && /^\s*<!--[\s\S]*-->\s*$/.test(b.text)

// Tabela markdown dentro do "tail" de um campo (ex.: Languages).
function tableRows(tail) {
  return (tail ?? []).map((l) => l.trim()).filter((l) => l.startsWith('|') && !/^\|[\s|:-]+\|$/.test(l))
    .map((l) => l.replace(/^\||\|$/g, '').split('|').map((c) => c.trim()))
}
// Linhas de texto do "tail", sem tabelas nem comentários HTML (que podem ocupar várias linhas).
function textTail(tail) {
  const out = []
  let inComment = false
  for (const raw of tail ?? []) {
    const l = raw.trim()
    if (inComment || l.startsWith('<!--')) { inComment = !l.includes('-->'); continue }
    if (l && !l.startsWith('|')) out.push(l)
  }
  return out
}

// Um "tail" que começa com tabela markdown vira uma grade editável; as linhas
// depois da tabela (comentários do /setup) voltam intactas.
function splitTable(tail) {
  const n = tail.findIndex((l) => !l.trim().startsWith('|'))
  const table = n < 0 ? tail : tail.slice(0, n)
  if (table.length < 2 || !/^\s*\|[\s|:-]+\|\s*$/.test(table[1])) return null
  const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
  return {
    indent: table[0].match(/^\s*/)[0],
    header: cells(table[0]),
    sep: table[1],
    rows: table.slice(2).map(cells),
    rest: n < 0 ? [] : tail.slice(n),
  }
}

function joinTable(t) {
  const line = (cells) => `${t.indent}| ${cells.join(' | ')} |`
  return [line(t.header), t.sep, ...t.rows.filter((r) => r.some((c) => c.trim())).map(line), ...t.rest]
}

function startEdit(kind) {
  blocks.value = parseBlocks(props.section.content).map((b) => {
    const table = b.type === 'field' ? splitTable(b.tail ?? []) : null
    return { ...b, tail: [...(b.tail ?? [])], _tail: (b.tail ?? []).join('\n'), _table: table }
  })
  markdown.value = props.section.content
  mode.value = kind
}

function addItem() {
  const lastItem = blocks.value.map((b) => b.type).lastIndexOf('item')
  const at = lastItem >= 0 ? lastItem + 1 : blocks.value.length
  blocks.value.splice(at, 0, { type: 'item', text: '', tail: [], _tail: '' })
}
function move(i, d) {
  const j = i + d
  if (j < 0 || j >= blocks.value.length) return
  const list = blocks.value
  ;[list[i], list[j]] = [list[j], list[i]]
}

async function save() {
  const content = mode.value === 'markdown'
    ? markdown.value
    : serializeBlocks(blocks.value
      .filter((b) => !(b.type === 'item' && !b.text.trim() && !b._tail.trim()))
      .map((b) => ({ ...b, tail: b._table ? joinTable(b._table) : b._tail ? b._tail.split('\n') : [] })))
  saving.value = true
  const res = await apiPut('/api/profile/section', {
    step: props.step, file: props.section.file, heading: props.section.heading, level: props.section.level, content,
  })
  saving.value = false
  if (res) {
    state.profile = res.profile
    toast(`${props.section.heading} salvo em ${fileLabel.value}`, 'ok')
    mode.value = 'view'
    emit('saved', res.sections)
  }
}
</script>

<template>
  <div class="section-card">
    <header class="section-card-head">
      <div>
        <b>{{ section.heading }}</b>
        <span class="files">{{ section.file }}</span>
      </div>
      <div v-if="mode === 'view'" class="actions-inline">
        <button class="btn sm" :disabled="!section.exists" @click="startEdit('edit')"><Icon name="cog" :size="13" /> Editar</button>
        <button class="btn ghost sm" :disabled="!section.exists" title="Editar o Markdown da seção" @click="startEdit('markdown')">MD</button>
      </div>
    </header>

    <p v-if="!section.exists" class="muted small">Seção não encontrada neste arquivo — rode /setup para criá-la.</p>

    <!-- visualização -->
    <div v-else-if="mode === 'view'" class="section-view">
      <p v-if="!view.length" class="muted small">Vazio.</p>
      <template v-for="(b, i) in view" :key="i">
        <div v-if="b.type === 'field'" class="sv-field">
          <span class="sv-key">{{ b.key }}</span>
          <div class="sv-val">
            <span v-for="(p, k) in inline(b.value)" :key="k" :class="{ strong: p.b }">{{ p.t }}</span>
            <table v-if="tableRows(b.tail).length" class="mini-table">
              <tr v-for="(r, k) in tableRows(b.tail)" :key="k" :class="{ head: k === 0 }"><td v-for="(c, j) in r" :key="j">{{ c }}</td></tr>
            </table>
            <ul v-else-if="textTail(b.tail).length" class="sv-sub"><li v-for="(t, k) in textTail(b.tail)" :key="k">{{ t.replace(/^[-*]\s*/, '') }}</li></ul>
          </div>
        </div>
        <div v-else-if="b.type === 'item'" class="sv-item">
          <i></i>
          <div>
            <span v-for="(p, k) in inline(b.text)" :key="k" :class="{ strong: p.b }">{{ p.t }}</span>
            <ul v-if="textTail(b.tail).length" class="sv-sub"><li v-for="(t, k) in textTail(b.tail)" :key="k">{{ t.replace(/^[-*]\s*/, '') }}</li></ul>
          </div>
        </div>
        <p v-else class="sv-raw">
          <template v-for="(line, k) in b.text.split('\n')" :key="k">
            <b v-if="/^#{3,}\s/.test(line)" class="sv-h">{{ line.replace(/^#+\s*/, '') }}</b>
            <span v-else><span v-for="(p, j) in inline(line.replace(/^[-*]\s+/, '• '))" :key="j" :class="{ strong: p.b }">{{ p.t }}</span></span>
            <br v-if="k < b.text.split('\n').length - 1" />
          </template>
        </p>
      </template>
    </div>

    <!-- edição estruturada -->
    <div v-else-if="mode === 'edit'" class="section-edit">
      <template v-for="(b, i) in blocks" :key="i">
        <label v-if="b.type === 'field'" class="field">
          <span>{{ b.key }}</span>
          <textarea v-if="b.value || !b._table" v-model="b.value" class="input area" :rows="b.value.length > 90 ? 3 : 1"></textarea>
          <div v-if="b._table" class="grid-edit">
            <div class="grid-row head"><span v-for="h in b._table.header" :key="h">{{ h }}</span><i></i></div>
            <div v-for="(r, ri) in b._table.rows" :key="ri" class="grid-row">
              <input v-for="(c, ci) in r" :key="ci" v-model="r[ci]" class="input" />
              <button type="button" class="btn ghost sm icon-only danger" title="Remover linha" @click="b._table.rows.splice(ri, 1)"><Icon name="trash" :size="13" /></button>
            </div>
            <button type="button" class="btn ghost sm" @click="b._table.rows.push(b._table.header.map(() => ''))"><Icon name="plus" :size="13" /> Linha</button>
          </div>
          <textarea v-else-if="b._tail" v-model="b._tail" class="input area mono" :rows="Math.min(10, b._tail.split('\n').length)" spellcheck="false"></textarea>
        </label>
        <div v-else-if="b.type === 'item'" class="edit-item">
          <textarea v-model="b.text" class="input area" :rows="b.text.length > 90 ? 2 : 1" placeholder="Novo item"></textarea>
          <button class="btn ghost sm icon-only" title="Subir" @click="move(i, -1)">↑</button>
          <button class="btn ghost sm icon-only" title="Descer" @click="move(i, 1)">↓</button>
          <button class="btn ghost sm icon-only danger" title="Remover" @click="blocks.splice(i, 1)"><Icon name="trash" :size="13" /></button>
        </div>
        <textarea v-else-if="b.text.trim() && !isComment(b)" v-model="b.text" class="input area" :rows="Math.min(12, b.text.split('\n').length)"></textarea>
      </template>
      <button class="btn ghost sm" @click="addItem"><Icon name="plus" :size="13" /> Adicionar item</button>
    </div>

    <!-- markdown -->
    <textarea v-else v-model="markdown" class="input area mono" rows="14" spellcheck="false"></textarea>

    <div v-if="mode !== 'view'" class="section-actions">
      <span class="muted small">Um backup do arquivo é salvo antes da gravação.</span>
      <button class="btn ghost sm" @click="mode = 'view'">Cancelar</button>
      <button class="btn primary sm" :disabled="saving" @click="save">{{ saving ? 'Salvando…' : 'Salvar' }}</button>
    </div>
  </div>
</template>
