<script setup>
import { state, trigger, savePrefs } from '../store.js'
import Icon from './Icon.vue'

const ACTION_LABELS = { 'install-pypdf': 'Instalar', 'install-portals': 'Instalar', scrape: 'Buscar vagas' }
</script>

<template>
  <div v-if="!state.health" class="empty-state">Verificando o ambiente…</div>
  <template v-else>
    <template v-for="sec in state.health.sections" :key="sec.id">
      <h2 class="section-title">{{ sec.title }}</h2>
      <div class="panel">
        <div v-for="it in sec.items" :key="it.id" class="check-row">
          <i class="status-dot" :class="it.status"></i>
          <div class="check-text">
            <b>{{ it.label }}</b>
            <span :title="it.detail">{{ it.detail }}</span>
          </div>
          <button v-if="it.action" class="btn sm" @click="trigger(it.action)">{{ ACTION_LABELS[it.action] || 'Resolver' }}</button>
        </div>
      </div>
    </template>

    <h2 class="section-title">Aparência</h2>
    <div class="panel">
      <div class="pref-row">
        <div><b>Tema</b><span>Segue o sistema ou fixa claro/escuro.</span></div>
        <div class="segmented">
          <button
            v-for="t in [['system', 'Sistema'], ['light', 'Claro'], ['dark', 'Escuro']]" :key="t[0]"
            :class="{ on: state.prefs.theme === t[0] }" @click="state.prefs.theme = t[0]; savePrefs()"
          >{{ t[1] }}</button>
        </div>
      </div>
    </div>
    <p class="muted small foot-note"><Icon name="layout" :size="13" style="display:inline;vertical-align:-2px" /> Workspace: <code>{{ state.health.workspace }}</code></p>
  </template>
</template>
