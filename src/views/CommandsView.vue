<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { state, trigger, savePrefs } from '../store.js'
import Icon from '../components/Icon.vue'

const groups = computed(() =>
  (state.catalog.groups ?? [])
    .map((g) => ({ ...g, commands: state.catalog.commands.filter((c) => c.group === g.id) }))
    .filter((g) => g.commands.length),
)
const runningIds = computed(() => new Set(state.runs.filter((r) => r.status === 'running').map((r) => r.id)))
const active = computed(() => state.runs.find((r) => r.uid === state.activeRun) || state.runs[0] || null)
const hasOptions = (c) => (c.params || []).length > 0

const time = (d) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

// Acompanha o fim da saída enquanto o usuário não rolou para cima.
const out = ref(null)
watch(() => active.value?.output, async () => {
  const el = out.value
  if (!el) return
  const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
  await nextTick()
  if (atBottom) el.scrollTop = el.scrollHeight
})

function clearFinished() {
  state.runs = state.runs.filter((r) => r.status === 'running')
}
</script>

<template>
  <div class="commands-view">
    <div class="commands-list">
      <header class="page-head">
        <h1>Comandos</h1>
        <p>Um clique executa. Use <Icon name="cog" :size="13" style="display:inline;vertical-align:-2px" /> para opções.</p>
      </header>
      <div v-if="state.catalog.claudeCli && state.catalog.claudeLoggedIn === false" class="callout">
        <Icon name="alert" :size="18" />
        <div>
          <b>O Claude Code do terminal ainda não está logado</b>
          <p>Até fazer login, os botões do Claude copiam o comando para você colar no app. O login do app desktop não vale para o terminal.</p>
        </div>
        <button class="btn primary" @click="trigger('login', {}, true)">Fazer login</button>
      </div>
      <div class="hint-bar">
        <Icon name="terminal" :size="14" />
        <template v-if="state.catalog.claudeCli && state.catalog.claudeLoggedIn === true">
          <span class="grow">
            {{ state.prefs.claudeMode === 'terminal'
              ? 'Comandos do Claude abrem uma sessão do Claude Code numa janela do terminal.'
              : 'Buscar, ranquear, relatório e plano de estudos rodam aqui em segundo plano, com a saída ao lado. Os que fazem perguntas abrem o terminal.' }}
          </span>
          <div class="segmented" role="group" aria-label="Onde rodar o Claude">
            <button :class="{ on: state.prefs.claudeMode !== 'terminal' }" @click="state.prefs.claudeMode = 'background'; savePrefs()">No painel</button>
            <button :class="{ on: state.prefs.claudeMode === 'terminal' }" @click="state.prefs.claudeMode = 'terminal'; savePrefs()">No terminal</button>
          </div>
        </template>
        <span v-else>Comandos do Claude são copiados — cole no Claude Code. Scripts locais rodam aqui e a saída aparece ao lado.</span>
      </div>

      <template v-for="g in groups" :key="g.id">
        <h2 class="section-title">{{ g.title }}</h2>
        <div class="cmd-grid">
          <div v-for="c in g.commands" :key="c.id" class="tile-wrap">
            <button
              class="tile" :class="c.kind" :disabled="runningIds.has(c.id)" :title="c.description"
              @click="trigger(c.id)"
            >
              <span class="tile-icon">
                <Icon :name="runningIds.has(c.id) ? 'refresh' : c.icon" :size="16" :class="{ spin: runningIds.has(c.id) }" />
              </span>
              <span class="tile-label">
                {{ c.label }}
                <span class="tile-kind">{{ c.kind !== 'claude' ? 'Script local' : c.background && state.prefs.claudeMode !== 'terminal' && state.catalog.claudeLoggedIn ? 'Claude Code · no painel' : 'Claude Code · terminal' }}</span>
              </span>
            </button>
            <button v-if="hasOptions(c)" class="btn ghost sm icon-only opts" title="Opções" @click="trigger(c.id, {}, false, true)">
              <Icon name="cog" :size="14" />
            </button>
          </div>
        </div>
      </template>
    </div>

    <aside class="console" aria-label="Saída dos scripts">
      <header class="console-head">
        <Icon name="terminal" />
        <h3>Saída</h3>
        <button v-if="active?.status === 'running'" class="btn sm danger" @click="active.controller.abort()"><Icon name="stop" :size="13" /> Parar</button>
        <button v-if="state.runs.some((r) => r.status !== 'running')" class="btn ghost sm" title="Limpar concluídos" @click="clearFinished"><Icon name="trash" :size="14" /></button>
      </header>
      <template v-if="state.runs.length">
        <div class="runs">
          <button
            v-for="r in state.runs" :key="r.uid" class="run" :class="{ active: active?.uid === r.uid }"
            @click="state.activeRun = r.uid"
          >
            <i class="status-dot" :class="{ ok: r.status === 'ok', missing: r.status === 'fail', warn: r.status === 'running' }"></i>
            <span>{{ r.label }}</span>
            <span class="when">{{ time(r.startedAt) }}</span>
          </button>
        </div>
        <pre ref="out" class="output">{{ active?.output || '…' }}</pre>
      </template>
      <div v-else class="console-empty">
        <div>
          <Icon name="terminal" :size="22" style="margin: 0 auto 8px" />
          A saída dos scripts locais aparece aqui.
        </div>
      </div>
    </aside>
  </div>
</template>
