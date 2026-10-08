<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import {
  mdiAccountMultiple, mdiAlertCircle, mdiBullhorn, mdiCalendarClock, mdiCheckCircle, mdiChevronDown,
  mdiChevronUp, mdiEmailFast, mdiEmailOutline, mdiLoading, mdiSend, mdiSendCheck, mdiShieldAlert,
} from "@mdi/js";
import {
  createSchedule, getSettings, getTemplates, previewTemplate, sendBroadcast, sendTemplated,
  type BroadcastResult, type EmailTemplate, type JobInput, type Repeat,
} from "../api";
import { askConfirm, toast } from "../ui";
import { fallbackTemplateIcon, templateIcons } from "../icons";
import Icon from "./Icon.vue";
import IconTile from "./IconTile.vue";

const props = defineProps<{ ready: boolean; account: string; isAdmin?: boolean }>();
const emit = defineEmits<{ sent: []; scheduled: []; goto: [tab: "settings"] }>();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DAYS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const NAME_VAR = "{{nama}}";
const RECIPIENT_PLACEHOLDER = "budi@gmail.com, Budi\nsari@gmail.com, Sari\nandi@gmail.com";

const mode = ref<"notify" | "broadcast">("notify");
const templates = ref<EmailTemplate[]>([]);
const templateId = ref("");
const values = reactive<Record<string, string>>({});
const subject = ref("");
const to = ref("");
const cc = ref("");
const bcc = ref("");
const recipients = ref("");
const showCcBcc = ref(false);

const when = ref<"now" | "later">("now");
const sch = reactive({
  name: "",
  repeat: "once" as Repeat,
  runAt: "",
  intervalMin: 5,
  timeOfDay: "09:00",
  weekdays: [1, 2, 3, 4, 5] as number[],
});

const loading = ref(false);
const testing = ref(false);
const result = ref<BroadcastResult | null>(null);
const previewHtml = ref("");
const loadError = ref("");

// ---------- turunan ----------
const visibleTemplates = computed(() =>
  templates.value.filter((t) => t.category === "both" || t.category === (mode.value === "notify" ? "notification" : "broadcast"))
);
const current = computed(() => templates.value.find((t) => t.id === templateId.value));

const recipientLines = computed(() =>
  recipients.value.split(/\r?\n/).map((l) => l.split(/[,;\t]/)[0].trim()).filter(Boolean)
);
const recipientCount = computed(() => new Set(recipientLines.value.map((e) => e.toLowerCase())).size);
const invalidRecipients = computed(() => recipientLines.value.filter((e) => !EMAIL_RE.test(e)));
const invalidTo = computed(() =>
  to.value.split(/[,;\s]+/).map((e) => e.trim()).filter((e) => e && !EMAIL_RE.test(e))
);
const failedResults = computed(() => result.value?.results.filter((r) => !r.ok) ?? []);

const fmtDate = (d: Date) => d.toLocaleString("id-ID", { dateStyle: "full", timeStyle: "short" });
const scheduleSummary = computed(() => {
  switch (sch.repeat) {
    case "once":
      return sch.runAt ? `Dikirim satu kali pada ${fmtDate(new Date(sch.runAt))}.` : "Pilih tanggal dan jam kirim.";
    case "interval":
      return `Dikirim setiap ${sch.intervalMin || "…"} menit. Pengiriman pertama sekitar ${fmtDate(new Date(Date.now() + (sch.intervalMin || 0) * 60_000))}.`;
    case "daily":
      return `Dikirim setiap hari pukul ${sch.timeOfDay}.`;
    default:
      return sch.weekdays.length
        ? `Dikirim setiap ${[...sch.weekdays].sort().map((d) => DAYS[d]).join(", ")} pukul ${sch.timeOfDay}.`
        : "Pilih minimal satu hari.";
  }
});

const submitLabel = computed(() => {
  if (when.value === "later") return "Simpan Jadwal";
  return mode.value === "notify" ? "Kirim Sekarang" : `Kirim ke ${recipientCount.value} Penerima`;
});

// ---------- util ----------
function toLocalInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
const inMinutes = (n: number) => toLocalInput(new Date(Date.now() + n * 60_000));
sch.runAt = inMinutes(5);

function toggleDay(d: number) {
  sch.weekdays = sch.weekdays.includes(d) ? sch.weekdays.filter((x) => x !== d) : [...sch.weekdays, d];
}

const iconOf = (id: string) => templateIcons[id] ?? fallbackTemplateIcon;

onMounted(async () => {
  try {
    templates.value = await getTemplates();
    pick(visibleTemplates.value[0]);
    const s = await getSettings();
    cc.value = s.defaultCc;
    bcc.value = s.defaultBcc;
    showCcBcc.value = !!(s.defaultCc || s.defaultBcc);
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : "Gagal memuat data";
  }
});

function pick(t?: EmailTemplate) {
  if (!t) return;
  templateId.value = t.id;
  for (const k of Object.keys(values)) delete values[k];
  // pada mode notifikasi nama penerima tidak diketahui, jadi hindari variabel mentah di contoh teks
  const sample = mode.value === "notify"
    ? Object.fromEntries(Object.entries(t.sample).map(([k, v]) => [k, v.split(NAME_VAR).join("Pelanggan")]))
    : t.sample;
  Object.assign(values, sample);
  subject.value = sample.subject;
}

function setMode(m: "notify" | "broadcast") {
  mode.value = m;
  result.value = null;
  if (!visibleTemplates.value.some((t) => t.id === templateId.value)) pick(visibleTemplates.value[0]);
}

// pratinjau langsung (debounce)
let timer: ReturnType<typeof setTimeout> | undefined;
watch(
  [templateId, values],
  () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      if (!templateId.value) return;
      try {
        previewHtml.value = (await previewTemplate(templateId.value, { ...values })).html;
      } catch {
        /* pratinjau hanya pelengkap */
      }
    }, 250);
  },
  { deep: true }
);

// ---------- aksi ----------
function err(e: unknown) {
  toast("error", e instanceof Error ? e.message : "Terjadi kesalahan");
}

async function sendTest() {
  testing.value = true;
  try {
    await sendTemplated({ to: props.account, subject: `[Tes] ${subject.value}`, templateId: templateId.value, values: { ...values } });
    toast("success", `Email tes dikirim ke ${props.account}. Cek kotak masuk Anda.`);
    emit("sent");
  } catch (e) {
    err(e);
  } finally {
    testing.value = false;
  }
}

async function onSchedule() {
  const job: JobInput = {
    mode: mode.value,
    subject: subject.value,
    templateId: templateId.value,
    values: { ...values },
    ...(mode.value === "notify" ? { to: to.value, cc: cc.value, bcc: bcc.value } : { recipients: recipients.value }),
  };
  await createSchedule({
    name: sch.name || subject.value,
    repeat: sch.repeat,
    runAt: sch.repeat === "once" ? new Date(sch.runAt).toISOString() : undefined,
    intervalMin: sch.repeat === "interval" ? Number(sch.intervalMin) : undefined,
    timeOfDay: sch.repeat === "daily" || sch.repeat === "weekly" ? sch.timeOfDay : undefined,
    weekdays: sch.repeat === "weekly" ? sch.weekdays : undefined,
    job,
  });
  toast("success", "Jadwal tersimpan. Email akan dikirim otomatis.");
  emit("scheduled");
}

async function onSubmit() {
  if (!props.ready) {
    toast("error", "Akun Gmail belum diatur. Buka Pengaturan dulu.");
    return;
  }
  if (mode.value === "notify" && invalidTo.value.length) return toast("error", `Alamat email tidak valid: ${invalidTo.value[0]}`);
  if (mode.value === "broadcast" && invalidRecipients.value.length) {
    return toast("error", `Alamat email tidak valid: ${invalidRecipients.value[0]}`);
  }

  if (when.value === "now" && mode.value === "broadcast") {
    const okay = await askConfirm({
      title: "Kirim broadcast?",
      message: `Email akan dikirim ke ${recipientCount.value} penerima dan tidak bisa dibatalkan.`,
      okText: "Ya, kirim sekarang",
    });
    if (!okay) return;
  }

  loading.value = true;
  result.value = null;
  try {
    if (when.value === "later") {
      await onSchedule();
    } else if (mode.value === "notify") {
      await sendTemplated({
        to: to.value, cc: cc.value, bcc: bcc.value,
        subject: subject.value, templateId: templateId.value, values: { ...values },
      });
      toast("success", "Email berhasil dikirim.");
      emit("sent");
    } else {
      const r = await sendBroadcast({
        recipients: recipients.value, subject: subject.value, templateId: templateId.value, values: { ...values },
      });
      result.value = r;
      toast(r.failed ? "error" : "success", `Broadcast selesai: ${r.sent} terkirim, ${r.failed} gagal.`);
      emit("sent");
    }
  } catch (e) {
    err(e);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="stack">
    <div v-if="!ready" class="alert warn">
      <Icon :path="mdiShieldAlert" :size="22" />
      <div class="alert-body">
        <span class="alert-title">Akun Gmail belum diatur</span>
        {{ isAdmin ? "Hubungkan akun Gmail Anda dulu agar bisa mengirim email. Hanya perlu sekitar 2 menit." : "Admin belum menghubungkan akun Gmail pengirim. Hubungi admin agar email bisa dikirim." }}
      </div>
      <button v-if="isAdmin" class="btn sm" @click="emit('goto', 'settings')">Atur sekarang</button>
    </div>
    <div v-if="loadError" class="alert error">
      <Icon :path="mdiAlertCircle" :size="22" />
      <div class="alert-body"><span class="alert-title">Tidak dapat terhubung ke server</span>{{ loadError }}</div>
    </div>

    <form class="send-layout" @submit.prevent="onSubmit">
      <div class="stack">
        <!-- Langkah 1 -->
        <section class="card">
          <div class="step-title"><span class="step-no">1</span><h2>Pilih jenis pesan</h2></div>
          <div class="seg" role="tablist" style="margin-bottom: 8px">
            <button type="button" :class="{ active: mode === 'notify' }" @click="setMode('notify')">
              <Icon :path="mdiEmailFast" :size="18" /> Notifikasi
            </button>
            <button type="button" :class="{ active: mode === 'broadcast' }" @click="setMode('broadcast')">
              <Icon :path="mdiBullhorn" :size="18" /> Broadcast
            </button>
          </div>
          <p class="hint" style="margin-bottom: 14px">
            {{ mode === "notify"
              ? "Notifikasi: satu email untuk satu atau beberapa orang."
              : "Broadcast: email terpisah untuk setiap orang, jadi alamat mereka tidak saling terlihat." }}
          </p>
          <div class="templates">
            <button
              v-for="t in visibleTemplates" :key="t.id" type="button"
              :class="['tpl', { active: t.id === templateId }]" @click="pick(t)"
            >
              <IconTile :path="iconOf(t.id).path" :color="iconOf(t.id).color" :size="38" />
              <strong>{{ t.name }}</strong>
              <small>{{ t.description }}</small>
              <Icon v-if="t.id === templateId" class="check" :path="mdiCheckCircle" :size="20" />
            </button>
          </div>
        </section>

        <!-- Langkah 2 -->
        <section class="card">
          <div class="step-title">
            <span class="step-no">2</span>
            <h2>Siapa penerimanya?</h2>
          </div>
          <template v-if="mode === 'notify'">
            <div class="field">
              <label class="lbl" for="to">Email tujuan <span class="req">*</span></label>
              <input id="to" v-model="to" type="text" placeholder="nama@gmail.com" autocomplete="off" required />
              <span v-if="invalidTo.length" class="hint err">Alamat tidak valid: {{ invalidTo.join(", ") }}</span>
              <span v-else class="hint">
                Lebih dari satu? Pisahkan dengan koma.
                <button v-if="account" type="button" class="link-btn" @click="to = account">Gunakan email saya</button>
              </span>
            </div>
            <button type="button" class="link-btn" style="margin-top: 12px" @click="showCcBcc = !showCcBcc">
              <Icon :path="showCcBcc ? mdiChevronUp : mdiChevronDown" :size="18" />
              {{ showCcBcc ? "Sembunyikan" : "Tambahkan" }} CC / BCC
            </button>
            <div v-if="showCcBcc" class="grid-2" style="margin-top: 12px">
              <div class="field">
                <label class="lbl" for="cc">CC <span class="muted small">(salinan, terlihat)</span></label>
                <input id="cc" v-model="cc" type="text" placeholder="opsional" />
              </div>
              <div class="field">
                <label class="lbl" for="bcc">BCC <span class="muted small">(salinan, tersembunyi)</span></label>
                <input id="bcc" v-model="bcc" type="text" placeholder="opsional" />
              </div>
            </div>
          </template>
          <div v-else class="field">
            <label class="lbl" for="rcpt">
              <Icon :path="mdiAccountMultiple" :size="18" /> Daftar penerima <span class="req">*</span>
            </label>
            <textarea id="rcpt" v-model="recipients" rows="6" :placeholder="RECIPIENT_PLACEHOLDER" required />
            <span v-if="invalidRecipients.length" class="hint err">Alamat tidak valid: {{ invalidRecipients.slice(0, 3).join(", ") }}</span>
            <span v-else class="hint">
              Satu orang per baris dengan format <b>email, nama</b> (nama boleh dikosongkan).
              <b>{{ recipientCount }}</b> penerima, maksimal 200.
            </span>
          </div>
        </section>

        <!-- Langkah 3 -->
        <section v-if="current" class="card">
          <div class="step-title"><span class="step-no">3</span><h2>Tulis pesan</h2></div>
          <div class="stack" style="gap: 14px">
            <div class="field">
              <label class="lbl" for="subject">Subjek email <span class="req">*</span></label>
              <input id="subject" v-model="subject" type="text" maxlength="200" required />
            </div>
            <div v-for="f in current.fields" :key="f.key" class="field">
              <label class="lbl" :for="'f-' + f.key">{{ f.label }} <span v-if="f.required" class="req">*</span></label>
              <textarea v-if="f.type === 'textarea'" :id="'f-' + f.key" v-model="values[f.key]" rows="6" maxlength="5000" :required="f.required" />
              <input
                v-else :id="'f-' + f.key" v-model="values[f.key]" :type="f.type === 'url' ? 'url' : 'text'"
                :placeholder="f.placeholder" :required="f.required"
              />
              <span v-if="f.key === 'message' && mode === 'broadcast'" class="hint">
                Tips: tulis <b>{{ NAME_VAR }}</b> agar diganti nama tiap penerima.
              </span>
            </div>
          </div>
        </section>

        <!-- Langkah 4 -->
        <section class="card">
          <div class="step-title"><span class="step-no">4</span><h2>Kapan dikirim?</h2></div>
          <div class="seg" style="margin-bottom: 14px">
            <button type="button" :class="{ active: when === 'now' }" @click="when = 'now'">
              <Icon :path="mdiSend" :size="18" /> Sekarang
            </button>
            <button type="button" :class="{ active: when === 'later' }" @click="when = 'later'">
              <Icon :path="mdiCalendarClock" :size="18" /> Jadwalkan
            </button>
          </div>

          <div v-if="when === 'later'" class="sched-box">
            <div class="field">
              <label class="lbl" for="sname">Nama jadwal</label>
              <input id="sname" v-model="sch.name" type="text" maxlength="100" placeholder="Kosongkan untuk memakai subjek" />
            </div>
            <div class="field">
              <label class="lbl" for="rep">Pengulangan</label>
              <select id="rep" v-model="sch.repeat">
                <option value="once">Sekali saja</option>
                <option value="interval">Berulang tiap beberapa menit</option>
                <option value="daily">Setiap hari</option>
                <option value="weekly">Hari tertentu setiap minggu</option>
              </select>
            </div>

            <div v-if="sch.repeat === 'once'" class="field">
              <label class="lbl" for="runat">Tanggal dan jam kirim</label>
              <input id="runat" v-model="sch.runAt" type="datetime-local" required />
              <div class="quick">
                <button type="button" class="chip" @click="sch.runAt = inMinutes(1)">1 menit lagi</button>
                <button type="button" class="chip" @click="sch.runAt = inMinutes(5)">5 menit lagi</button>
                <button type="button" class="chip" @click="sch.runAt = inMinutes(60)">1 jam lagi</button>
              </div>
            </div>
            <div v-else-if="sch.repeat === 'interval'" class="field">
              <label class="lbl" for="intv">Ulangi tiap (menit)</label>
              <input id="intv" v-model.number="sch.intervalMin" type="number" min="1" max="10080" required />
            </div>
            <template v-else>
              <div class="field">
                <label class="lbl" for="tod">Jam kirim</label>
                <input id="tod" v-model="sch.timeOfDay" type="time" required />
              </div>
              <div v-if="sch.repeat === 'weekly'" class="field">
                <span class="lbl">Hari</span>
                <div class="days">
                  <button
                    v-for="(d, i) in DAYS" :key="i" type="button" :class="['day', { active: sch.weekdays.includes(i) }]"
                    @click="toggleDay(i)"
                  >{{ d }}</button>
                </div>
              </div>
            </template>

            <div class="alert info">
              <Icon :path="mdiCalendarClock" :size="20" />
              <div class="alert-body">{{ scheduleSummary }}<span class="hint" style="display:block">Jam mengikuti zona waktu server.</span></div>
            </div>
          </div>
        </section>

        <!-- hasil broadcast -->
        <section v-if="result" class="card">
          <div :class="['alert', result.failed ? 'warn' : 'success']">
            <Icon :path="result.failed ? mdiAlertCircle : mdiSendCheck" :size="22" />
            <div class="alert-body">
              <span class="alert-title">{{ result.sent }} dari {{ result.total }} email terkirim</span>
              <span v-if="!failedResults.length">Semua penerima berhasil.</span>
            </div>
          </div>
          <ul v-if="failedResults.length" class="list" style="margin-top: 12px">
            <li v-for="r in failedResults" :key="r.email" class="hint err"><b>{{ r.email }}</b>: {{ r.error }}</li>
          </ul>
        </section>

        <!-- aksi -->
        <div class="sticky-actions">
          <button type="button" class="btn" :disabled="testing || loading || !ready || !current" @click="sendTest">
            <Icon :path="testing ? mdiLoading : mdiEmailOutline" :size="18" :class="{ spin: testing }" />
            Kirim tes ke saya
          </button>
          <span class="hint">Cek tampilan di kotak masuk sendiri sebelum dikirim ke orang lain.</span>
          <button type="submit" class="btn primary lg end" :disabled="loading || testing || !current">
            <Icon :path="loading ? mdiLoading : when === 'later' ? mdiCalendarClock : mdiSend" :size="20" :class="{ spin: loading }" />
            {{ loading ? "Memproses..." : submitLabel }}
          </button>
        </div>
      </div>

      <aside class="preview-col">
        <div class="card preview">
          <div class="preview-bar">
            <IconTile :path="mdiEmailOutline" color="#2563eb" :size="28" />
            Pratinjau email
            <span class="hint" style="margin-left: auto">contoh penerima: Budi</span>
          </div>
          <iframe :srcdoc="previewHtml" sandbox="" title="Pratinjau email" />
        </div>
      </aside>
    </form>
  </div>
</template>
