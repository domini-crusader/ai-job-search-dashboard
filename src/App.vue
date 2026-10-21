<script setup>
import { computed, onMounted, ref } from 'vue'
import {
  state, goTo, savePrefs, dismissToast,
  loadBoard, loadCatalog, loadHealth, loadProfile, loadSearch, loadLists, watchChanges,
} from './store.js'
import Icon from './components/Icon.vue'
import ParamDialog from './components/ParamDialog.vue'
import HomeView from './views/HomeView.vue'
import BoardView from './views/BoardView.vue'
import CommandsView from './views/CommandsView.vue'

const TABS = [
  { id: 'inicio', label: 'Início', icon: 'home' },
  { id: 'vagas', label: 'Vagas', icon: 'board' },
  { id: 'comandos', label: 'Comandos', icon: 'terminal' },
]

// Ponto na aba Início quando falta algo obrigatório no perfil ou no ambiente.
const setupPending = computed(() => {
  const p = state.profile?.summary
  return (p && p.done < p.total) || (state.health?.summary.blocking ?? 0) > 0
})
// Sem o mascote no workspace (fork antigo, por exemplo), volta ao ícone.
const logoFailed = ref(false)
// Ligado com :src para o Vue não tentar resolver a rota da API como import.
const MASCOT_URL = '/api/brand/mascot'
const running = computed(() => state.runs.some((r) => r.status === 'running'))

const THEMES = ['system', 'light', 'dark']
const themeIcon = computed(() => ({ system: 'monitor', light: 'sun', dark: 'moon' })[state.prefs.theme])
function cycleTheme() {
  state.prefs.theme = THEMES[(THEMES.indexOf(state.prefs.theme) + 1) % THEMES.length]
  savePrefs()
}

onMounted(async () => {
  savePrefs()
  await Promise.all([loadBoard(), loadCatalog(), loadLists(), loadProfile(), loadSearch()])
  loadHealth()
  watchChanges()
})
</script>

<template>
  <div class="app">
    <header class="topbar">
      <div class="brand">
        <img v-if="!logoFailed" class="brand-logo" :src="MASCOT_URL" alt="" @error="logoFailed = true" />
        <span v-else class="brand-mark"><Icon name="board" :size="16" /></span>
        <span class="brand-text">
          <span class="brand-name">
            <span class="flag brand-flag" title="Feito no Brasil" aria-label="Feito no Brasil"></span>ai-job-search<span class="brand-suffix">-dashboard</span>
          </span>
          <a class="brand-by" href="https://github.com/domini-crusader/ai-job-search-dashboard" target="_blank" rel="noopener">por DominiCrusader</a>
        </span>
      </div>

      <nav class="tabs" aria-label="Seções">
        <button
          v-for="t in TABS" :key="t.id" class="tab" :class="{ active: state.tab === t.id }"
          :aria-current="state.tab === t.id ? 'page' : undefined" @click="goTo(t.id)"
        >
          <Icon :name="t.icon" :size="15" />
          <span>{{ t.label }}</span>
          <i v-if="t.id === 'inicio' && setupPending" class="dot" title="Configuração pendente"></i>
          <i v-if="t.id === 'comandos' && running" class="dot" title="Comando em execução"></i>
        </button>
      </nav>

      <div class="top-right">
        <button class="btn ghost icon-only" :title="`Tema: ${state.prefs.theme}`" @click="cycleTheme">
          <Icon :name="themeIcon" />
        </button>
      </div>
    </header>

    <main class="view">
      <HomeView v-if="state.tab === 'inicio'" />
      <BoardView v-else-if="state.tab === 'vagas'" />
      <CommandsView v-else />
    </main>

    <ParamDialog v-if="state.dialog" :dialog="state.dialog" @close="state.dialog = null" />

    <div class="toasts" aria-live="polite">
      <div v-for="t in state.toasts" :key="t.uid" class="toast" :class="t.kind" @click="dismissToast(t.uid)">
        <i class="t-dot"></i>
        <span>{{ t.message }}</span>
        <button v-if="t.action" class="btn sm" @click.stop="t.action.run(); dismissToast(t.uid)">{{ t.action.label }}</button>
      </div>
    </div>
  </div>
</template>
