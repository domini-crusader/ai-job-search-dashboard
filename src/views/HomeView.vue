<script setup>
import { computed, ref } from 'vue'
import { state, loadProfile, loadHealth, loadSearch } from '../store.js'
import Icon from '../components/Icon.vue'
import ProfileSteps from '../components/ProfileSteps.vue'
import SearchSettings from '../components/SearchSettings.vue'
import EnvChecks from '../components/EnvChecks.vue'

const SECTIONS = [
  { id: 'perfil', label: 'Perfil' },
  { id: 'busca', label: 'Busca' },
  { id: 'ambiente', label: 'Ambiente' },
]
const section = ref('perfil')
const mascotFailed = ref(false)
const MASCOT_URL = '/api/brand/mascot'

const firstName = computed(() => state.profile?.name?.split(' ')[0])
const progress = computed(() => {
  const s = state.profile?.summary
  return s ? Math.round((s.done / s.total) * 100) : 0
})

function refresh() {
  loadProfile()
  loadSearch()
  loadHealth()
}
</script>

<template>
  <div class="page">
    <header class="page-head home-head">
      <img v-if="!mascotFailed" class="home-mascot" :src="MASCOT_URL" alt="Pip, o mascote do ai-job-search" @error="mascotFailed = true" />
      <div class="grow">
        <h1>{{ firstName ? `Olá, ${firstName}` : 'Configuração inicial' }}</h1>
        <p v-if="state.profile">
          Perfil {{ state.profile.summary.done }} de {{ state.profile.summary.total }} etapas completas
        </p>
        <div class="progress"><span :style="{ width: `${progress}%` }"></span></div>
      </div>
      <button class="btn ghost" title="Verificar de novo" @click="refresh"><Icon name="refresh" /> Verificar</button>
    </header>

    <div class="segmented sub-nav" role="tablist">
      <button
        v-for="s in SECTIONS" :key="s.id" role="tab" :aria-selected="section === s.id"
        :class="{ on: section === s.id }" @click="section = s.id"
      >{{ s.label }}</button>
    </div>

    <ProfileSteps v-if="section === 'perfil'" @go="section = $event" />
    <SearchSettings v-else-if="section === 'busca'" />
    <EnvChecks v-else />

    <footer class="credits">
      <img v-if="!mascotFailed" :src="MASCOT_URL" alt="" class="credits-pip" />
      <p>
        Construído sobre o <a href="https://github.com/MadsLorentzen/ai-job-search" target="_blank" rel="noopener">ai-job-search</a>,
        criado por <a href="https://www.linkedin.com/in/mads-lorentzen/" target="_blank" rel="noopener">Mads Lorentzen</a>.
        O perfil, as buscas, o ranqueamento e as candidaturas são trabalho do framework dele; este painel é uma janela visual por cima.
        <span class="credits-links">
          <a href="https://github.com/MadsLorentzen/ai-job-search" target="_blank" rel="noopener">Dê uma estrela ao projeto</a> ·
          <a href="https://ko-fi.com/madslorentzen" target="_blank" rel="noopener">Apoie o criador</a>
        </span>
        <span class="credits-own">
          Painel por <a href="https://github.com/domini-crusader/ai-job-search-dashboard" target="_blank" rel="noopener">DominiCrusader</a>
        </span>
      </p>
    </footer>
  </div>
</template>
