<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import {
  mdiAlertCircle, mdiChevronDown, mdiChevronLeft, mdiChevronRight, mdiChevronUp, mdiCheckCircle, mdiDelete,
  mdiDeleteSweep, mdiInboxOutline, mdiSend,
} from "@mdi/js";
import { clearLogs, deleteLog, getLogs, type EmailLog } from "../api";
import { askConfirm, toast } from "../ui";
import Icon from "./Icon.vue";
import IconTile from "./IconTile.vue";

const props = defineProps<{ refreshKey: number }>();
const emit = defineEmits<{ goto: [tab: "send"] }>();

const PAGE = 15;
const filters = [
  { id: "", label: "Semua" },
  { id: "sent", label: "Terkirim" },
  { id: "failed", label: "Gagal" },
] as const;

const items = ref<EmailLog[]>([]);
const total = ref(0);
const offset = ref(0);
const filter = ref<"" | "sent" | "failed">("");
const expanded = ref<number | null>(null);
const loaded = ref(false);

async function load() {
  try {
    const r = await getLogs(filter.value, PAGE, offset.value);
    items.value = r.items;
    total.value = r.total;
  } catch (e) {
    toast("error", e instanceof Error ? e.message : "Gagal memuat riwayat");
  } finally {
    loaded.value = true;
  }
}

onMounted(load);
watch(() => props.refreshKey, () => { offset.value = 0; load(); });
watch(filter, () => { offset.value = 0; expanded.value = null; load(); });

async function remove(id: number) {
  await deleteLog(id);
  toast("success", "Riwayat dihapus.");
  load();
}

async function removeAll() {
  const ok = await askConfirm({
    title: "Hapus semua riwayat?",
    message: "Seluruh catatan pengiriman akan dihapus permanen. Email yang sudah terkirim tidak terpengaruh.",
    okText: "Hapus semua", danger: true,
  });
  if (!ok) return;
  await clearLogs();
  offset.value = 0;
  toast("success", "Seluruh riwayat dihapus.");
  load();
}

// SQLite menyimpan UTC tanpa zona; tampilkan dalam waktu lokal
const fmt = (s: string) => new Date(s.replace(" ", "T") + "Z").toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
</script>

<template>
  <div class="stack">
    <div class="row">
      <div class="chips">
        <button v-for="f in filters" :key="f.id" type="button" :class="['chip', { active: filter === f.id }]" @click="filter = f.id">
          {{ f.label }}
        </button>
      </div>
      <span class="hint">{{ total }} email</span>
      <button v-if="total" class="btn sm danger" style="margin-left: auto" @click="removeAll">
        <Icon :path="mdiDeleteSweep" :size="16" /> Hapus semua
      </button>
    </div>

    <div v-if="loaded && !items.length" class="card empty">
      <IconTile :path="mdiInboxOutline" color="#8b5cf6" :size="64" />
      <h3>{{ filter ? "Tidak ada email pada filter ini" : "Belum ada riwayat" }}</h3>
      <p>{{ filter ? "Coba pilih filter lain." : "Email yang Anda kirim akan tercatat di sini." }}</p>
      <button v-if="!filter" class="btn primary" @click="emit('goto', 'send')"><Icon :path="mdiSend" :size="18" /> Kirim email pertama</button>
    </div>

    <ul v-else class="list">
      <li v-for="l in items" :key="l.id" class="item">
        <div class="item-head" @click="expanded = expanded === l.id ? null : l.id">
          <IconTile
            :path="l.status === 'sent' ? mdiCheckCircle : mdiAlertCircle"
            :color="l.status === 'sent' ? '#16a34a' : '#dc2626'" :size="40"
          />
          <div class="txt">
            <div class="t">{{ l.subject }}</div>
            <div class="hint" style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap">ke {{ l.to_addr }} · {{ fmt(l.created_at) }}</div>
          </div>
          <span :class="['badge', l.status === 'sent' ? 'success' : 'danger']">{{ l.status === "sent" ? "Terkirim" : "Gagal" }}</span>
          <span class="muted"><Icon :path="expanded === l.id ? mdiChevronUp : mdiChevronDown" :size="22" /></span>
        </div>
        <div v-if="expanded === l.id" class="item-body">
          <div v-if="l.cc || l.bcc" class="hint">
            <span v-if="l.cc">CC: {{ l.cc }}</span><span v-if="l.cc && l.bcc"> · </span><span v-if="l.bcc">BCC: {{ l.bcc }}</span>
          </div>
          <div class="pre">{{ l.message }}</div>
          <div v-if="l.error" class="alert error"><Icon :path="mdiAlertCircle" :size="20" /><div class="alert-body">{{ l.error }}</div></div>
          <div><button class="btn sm danger" @click="remove(l.id)"><Icon :path="mdiDelete" :size="16" /> Hapus catatan ini</button></div>
        </div>
      </li>
    </ul>

    <div v-if="total > PAGE" class="pager">
      <button class="btn sm" :disabled="offset === 0" @click="offset -= PAGE; load()"><Icon :path="mdiChevronLeft" :size="18" /> Sebelumnya</button>
      <span class="hint">Halaman {{ Math.floor(offset / PAGE) + 1 }} dari {{ Math.ceil(total / PAGE) }}</span>
      <button class="btn sm" :disabled="offset + PAGE >= total" @click="offset += PAGE; load()">Berikutnya <Icon :path="mdiChevronRight" :size="18" /></button>
    </div>
  </div>
</template>
