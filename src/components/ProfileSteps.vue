<script setup>
import { computed, reactive, ref } from 'vue'
import { state, trigger, apiGet } from '../store.js'
import Icon from './Icon.vue'
import SectionEditor from './SectionEditor.vue'

const emit = defineEmits(['go'])
const open = ref(null)
const sections = reactive({}) // id da etapa -> seções de origem (lidas ao abrir)

async function toggle(id) {
  open.value = open.value === id ? null : id
  if (open.value && !sections[id]) sections[id] = (await apiGet(`/api/profile/sections?step=${id}`)) ?? []
}

const steps = computed(() => state.profile?.steps ?? [])
const required = computed(() => steps.value.filter((s) => !s.optional))
const optional = computed(() => steps.value.filter((s) => s.optional))
const nextStep = computed(() => required.value.find((s) => s.status !== 'done'))

const STATUS = {
  done: { label: 'Completo', cls: 'ok' },
  partial: { label: 'Incompleto', cls: 'warn' },
  todo: { label: 'Pendente', cls: 'missing' },
  optional: { label: 'Opcional', cls: '' },
}

function fix(step) {
  if (step.fix === 'search') return emit('go', 'busca')
  trigger(step.fix)
}
</script>

<template>
  <div v-if="!state.profile" class="empty-state">Verificando o perfil…</div>
  <template v-else>
    <div v-if="nextStep" class="callout">
      <Icon name="alert" :size="18" />
      <div>
        <b>Próxima etapa: {{ nextStep.title }}</b>
        <p>{{ nextStep.checks.find((c) => !c.ok)?.hint }}</p>
      </div>
      <button class="btn primary" @click="fix(nextStep)">
        {{ nextStep.fix === 'search' ? 'Abrir busca' : 'Completar com /' + nextStep.fix }}
      </button>
    </div>
    <div v-else class="callout good">
      <Icon name="check" :size="18" />
      <div>
        <b>Perfil completo</b>
        <p>Tudo o que o /setup preenche está no lugar. Rode /setup de novo quando sua experiência mudar.</p>
      </div>
      <button class="btn" @click="trigger('setup')">Revisar perfil</button>
    </div>

    <template v-for="[title, list] in [['Etapas do /setup', required], ['Para fortalecer o perfil', optional]]" :key="title">
      <h2 class="section-title">{{ title }}</h2>
      <div class="panel step-list">
        <div v-for="(s, i) in list" :key="s.id" class="step-item" :class="{ expanded: open === s.id }">
          <button class="step-row" :aria-expanded="open === s.id" @click="toggle(s.id)">
            <span class="step-index" :class="STATUS[s.status].cls">
              <Icon v-if="s.status === 'done'" name="check" :size="13" />
              <template v-else>{{ i + 1 }}</template>
            </span>
            <span class="step-text">
              <b>{{ s.title }}</b>
              <span>{{ s.description }}</span>
            </span>
            <span class="step-count">{{ s.checks.filter((c) => c.ok).length }}/{{ s.checks.length }}</span>
            <span class="badge" :class="STATUS[s.status].cls">{{ STATUS[s.status].label }}</span>
          </button>
          <div v-if="open === s.id" class="step-detail">
            <ul class="checklist">
              <li v-for="c in s.checks" :key="c.label" :class="{ ok: c.ok }">
                <Icon :name="c.ok ? 'check' : 'x'" :size="14" />
                <span>{{ c.label }}</span>
                <em v-if="c.hint">{{ c.hint }}</em>
              </li>
            </ul>
            <div v-if="sections[s.id]?.length" class="step-sections">
              <SectionEditor v-for="sec in sections[s.id]" :key="sec.file + sec.heading" :section="sec" :step="s.id"
                @saved="sections[s.id] = $event" />
              <p class="muted small">
                O resumo fica no CLAUDE.md e o detalhe nos arquivos do job-application-assistant.
                Ao mudar um, revise o outro — ou rode /setup para que ele os alinhe.
              </p>
            </div>
            <div v-else-if="s.fix === 'search'" class="step-sections">
              <button class="btn sm" @click="fix(s)"><Icon name="search" :size="13" /> Editar categorias de busca</button>
            </div>
            <div class="step-foot">
              <span class="files">{{ s.files.join(' · ') }}</span>
              <button v-if="s.status !== 'done' && s.fix !== 'search'" class="btn sm" @click="fix(s)">
                Completar com /{{ s.fix }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </template>
  </template>
</template>
