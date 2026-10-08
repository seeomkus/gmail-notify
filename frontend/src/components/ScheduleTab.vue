<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import {
  mdiCalendarPlus, mdiClockOutline, mdiDelete, mdiInformation, mdiLoading, mdiPause, mdiPlay, mdiSend,
} from "@mdi/js";
import { deleteSchedule, getSchedules, runScheduleNow, toggleSchedule, type Schedule } from "../api";
import { askConfirm, toast } from "../ui";
import { repeatIcons } from "../icons";
import Icon from "./Icon.vue";
import IconTile from "./IconTile.vue";

const emit = defineEmits<{ ran: []; goto: [tab: "send"] }>();

const DAYS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const items = ref<Schedule[]>([]);
const loaded = ref(false);
const busyId = ref<number | null>(null);

async function load() {
  try {
    items.value = await getSchedules();
  } catch (e) {
    if (!loaded.value) toast("error", e instanceof Error ? e.message : "Gagal memuat jadwal");
  } finally {
    loaded.value = true;
  }
}

// muat ulang berkala agar status "terakhir dikirim" ikut berubah tanpa refresh
let poll: ReturnType<typeof setInterval>;
onMounted(() => {
  load();
  poll = setInterval(load, 5000);
});
onBeforeUnmount(() => clearInterval(poll));

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : "—";

function describe(s: Schedule) {
  switch (s.repeat) {
    case "once": return `Sekali, ${fmt(s.runAt)}`;
    case "interval": return `Setiap ${s.intervalMin} menit`;
    case "daily": return `Setiap hari, pukul ${s.timeOfDay}`;
    case "weekly": return `Setiap ${s.weekdays.map((d) => DAYS[d]).join(", ")}, pukul ${s.timeOfDay}`;
  }
}

function target(s: Schedule) {
  if (s.job.mode === "broadcast") {
    const n = (s.job.recipients ?? "").split(/\r?\n/).filter((l) => l.trim()).length;
    return `Broadcast ke ${n} penerima`;
  }
  return `Ke ${s.job.to}`;
}

const statusBadge = {
  success: { cls: "success", text: "Berhasil" },
  partial: { cls: "warn", text: "Sebagian gagal" },
  failed: { cls: "danger", text: "Gagal" },
} as const;

async function act(s: Schedule, fn: () => Promise<unknown>, okMsg?: string) {
  busyId.value = s.id;
  try {
    await fn();
    if (okMsg) toast("success", okMsg);
    await load();
  } catch (e) {
    toast("error", e instanceof Error ? e.message : "Terjadi kesalahan");
  } finally {
    busyId.value = null;
  }
}

const toggle = (s: Schedule) =>
  act(s, () => toggleSchedule(s.id, !s.enabled), s.enabled ? "Jadwal dijeda." : "Jadwal diaktifkan.");

async function runNow(s: Schedule) {
  const ok = await askConfirm({
    title: "Kirim sekarang?",
    message: `Email "${s.name}" akan langsung dikirim (${target(s).toLowerCase()}). Jadwal berikutnya tidak berubah.`,
    okText: "Ya, kirim",
  });
  if (ok) await act(s, async () => { await runScheduleNow(s.id); emit("ran"); }, "Email dikirim. Lihat hasilnya di Riwayat.");
}

async function remove(s: Schedule) {
  const ok = await askConfirm({
    title: "Hapus jadwal?",
    message: `Jadwal "${s.name}" akan dihapus permanen. Riwayat email yang sudah terkirim tidak ikut terhapus.`,
    okText: "Hapus", danger: true,
  });
  if (ok) await act(s, () => deleteSchedule(s.id), "Jadwal dihapus.");
}
</script>

<template>
  <div class="stack">
    <div class="alert info">
      <Icon :path="mdiInformation" :size="22" />
      <div class="alert-body">
        Jadwal berjalan otomatis selama aplikasi menyala. Waktu kirim bisa terlambat hingga sekitar 10 detik.
        Untuk membuat jadwal baru, buka tab <b>Kirim</b> lalu pilih <b>Jadwalkan</b> di langkah 4.
      </div>
      <button class="btn sm" @click="emit('goto', 'send')"><Icon :path="mdiCalendarPlus" :size="16" /> Buat jadwal</button>
    </div>

    <div v-if="loaded && !items.length" class="card empty">
      <IconTile :path="mdiClockOutline" color="#f59e0b" :size="64" />
      <h3>Belum ada jadwal</h3>
      <p>Jadwalkan email agar terkirim otomatis, misalnya pengingat harian atau laporan mingguan.</p>
      <button class="btn primary" @click="emit('goto', 'send')"><Icon :path="mdiCalendarPlus" :size="18" /> Buat jadwal pertama</button>
    </div>

    <ul class="list">
      <li v-for="s in items" :key="s.id" :class="['item', { off: !s.enabled }]">
        <div class="item-head" style="cursor: default">
          <IconTile :path="repeatIcons[s.repeat].path" :color="s.enabled ? repeatIcons[s.repeat].color : '#94a3b8'" :size="42" />
          <div class="txt">
            <div class="t">{{ s.name }}</div>
            <div class="hint">{{ describe(s) }} · {{ target(s) }}</div>
          </div>
          <span :class="['badge', s.enabled ? 'success' : '']">{{ s.enabled ? "Aktif" : s.nextRunAt === null && s.repeat === 'once' && s.runCount ? "Selesai" : "Dijeda" }}</span>
        </div>

        <div class="meta-grid">
          <span>Berikutnya: <b>{{ s.enabled ? fmt(s.nextRunAt) : "—" }}</b></span>
          <span>Terakhir: <b>{{ fmt(s.lastRunAt) }}</b>
            <span v-if="s.lastStatus" :class="['badge', statusBadge[s.lastStatus].cls]" style="margin-left: 6px">{{ statusBadge[s.lastStatus].text }}</span>
          </span>
          <span>Sudah berjalan: <b>{{ s.runCount }}×</b></span>
        </div>
        <p v-if="s.lastResult" class="item-note">{{ s.lastResult }}</p>

        <div class="item-actions">
          <button class="btn sm" :disabled="busyId === s.id" @click="runNow(s)">
            <Icon :path="busyId === s.id ? mdiLoading : mdiSend" :size="16" :class="{ spin: busyId === s.id }" /> Kirim sekarang
          </button>
          <button
            v-if="s.enabled || s.nextRunAt || s.repeat !== 'once'" class="btn sm" :disabled="busyId === s.id" @click="toggle(s)"
          >
            <Icon :path="s.enabled ? mdiPause : mdiPlay" :size="16" /> {{ s.enabled ? "Jeda" : "Aktifkan" }}
          </button>
          <button class="btn sm danger end" :disabled="busyId === s.id" @click="remove(s)">
            <Icon :path="mdiDelete" :size="16" /> Hapus
          </button>
        </div>
      </li>
    </ul>
  </div>
</template>
