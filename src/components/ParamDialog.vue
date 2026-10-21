<script setup>
import { computed, reactive } from 'vue'
import { state, execute } from '../store.js'
import Icon from './Icon.vue'

const props = defineProps({ dialog: Object })
const emit = defineEmits(['close'])

const params = reactive({ ...props.dialog.params })
const cmd = computed(() => props.dialog.command)
const missing = computed(() => (cmd.value.params || []).some((p) => p.required && !String(params[p.name] ?? '').trim()))
const isClaude = computed(() => cmd.value.kind === 'claude')

const canBackground = computed(() => cmd.value.background && state.catalog.claudeLoggedIn === true)

// how: 'auto' | 'background' | 'terminal' | 'copy' (ver execute() no store).
function submit(how) {
  if (!missing.value) execute(cmd.value, { ...props.dialog.preset, ...params }, how)
}
</script>

<template>
  <div class="overlay" @click.self="emit('close')" @keydown.esc="emit('close')">
    <form class="dialog" @submit.prevent="submit('auto')">
      <h3><Icon :name="cmd.icon" :size="18" /> {{ cmd.label }}</h3>
      <p class="desc">{{ cmd.description }}</p>
      <p v-if="cmd.confirm" class="confirm">{{ cmd.confirm }}</p>

      <label v-for="p in cmd.params || []" :key="p.name" class="field">
        <template v-if="p.type === 'checkbox'">
          <span class="switch"><input v-model="params[p.name]" type="checkbox" /> {{ p.label }}</span>
        </template>
        <template v-else>
          <span>{{ p.label }}</span>
          <input
            v-model="params[p.name]" class="input" autofocus
            :type="p.type === 'number' ? 'number' : p.type === 'url' ? 'url' : 'text'"
            :placeholder="p.type === 'url' ? 'https://…' : ''" :required="p.required"
          />
        </template>
      </label>

      <div class="dialog-actions">
        <button type="button" class="btn ghost" @click="emit('close')">Cancelar</button>
        <template v-if="isClaude">
          <button type="button" class="btn ghost" :disabled="missing" @click="submit('copy')">
            <Icon name="copy" /> Copiar
          </button>
          <button v-if="state.catalog.claudeCli" type="button" class="btn" :class="{ primary: !canBackground }" :disabled="missing" @click="submit('terminal')">
            <Icon name="terminal" /> Abrir no terminal
          </button>
          <button v-if="canBackground" type="button" class="btn primary" :disabled="missing" @click="submit('background')">
            <Icon name="play" /> Rodar no painel
          </button>
        </template>
        <button v-else type="submit" class="btn primary" :disabled="missing"><Icon name="play" /> Executar</button>
      </div>
    </form>
  </div>
</template>
