<script setup lang="ts">
import { mdiAlertCircle, mdiCheckCircle, mdiClose, mdiHelpCircle, mdiInformation } from "@mdi/js";
import Icon from "./Icon.vue";
import { answerConfirm, confirmState, dismissToast, toasts } from "../ui";

const icons = { success: mdiCheckCircle, error: mdiAlertCircle, info: mdiInformation };
const colors = { success: "var(--success)", error: "var(--danger)", info: "var(--primary)" };
</script>

<template>
  <div class="toasts" aria-live="polite">
    <div v-for="t in toasts" :key="t.id" :class="['toast', t.type]">
      <span :style="{ color: colors[t.type] }"><Icon :path="icons[t.type]" :size="22" /></span>
      <div class="txt">{{ t.text }}</div>
      <button class="btn icon ghost" aria-label="Tutup" @click="dismissToast(t.id)"><Icon :path="mdiClose" :size="16" /></button>
    </div>
  </div>

  <div v-if="confirmState.open" class="overlay" @click.self="answerConfirm(false)" @keydown.esc="answerConfirm(false)">
    <div class="modal" role="dialog" aria-modal="true">
      <h2>
        <span :style="{ color: confirmState.danger ? 'var(--danger)' : 'var(--primary)' }">
          <Icon :path="confirmState.danger ? mdiAlertCircle : mdiHelpCircle" :size="26" />
        </span>
        {{ confirmState.title }}
      </h2>
      <p class="muted">{{ confirmState.message }}</p>
      <div class="actions">
        <button class="btn" @click="answerConfirm(false)">Batal</button>
        <button :class="['btn', confirmState.danger ? 'danger solid' : 'primary']" autofocus @click="answerConfirm(true)">
          {{ confirmState.okText }}
        </button>
      </div>
    </div>
  </div>
</template>
