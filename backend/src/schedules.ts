import type { Express } from "express";
import { db } from "./db";
import { errMsg, prepareJob, runJob, serializeJob } from "./sender";

db.exec(`
  CREATE TABLE IF NOT EXISTS schedules (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    enabled       INTEGER NOT NULL DEFAULT 1,
    repeat        TEXT NOT NULL CHECK (repeat IN ('once','interval','daily','weekly')),
    run_at        TEXT,
    interval_min  INTEGER,
    time_of_day   TEXT,
    weekdays      TEXT NOT NULL DEFAULT '[]',
    job           TEXT NOT NULL,
    next_run_at   TEXT,
    last_run_at   TEXT,
    last_status   TEXT,
    last_result   TEXT,
    run_count     INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

type Repeat = "once" | "interval" | "daily" | "weekly";

interface Spec {
  repeat: Repeat;
  runAt?: string;
  intervalMin?: number;
  timeOfDay?: string;
  weekdays?: number[];
}

interface Row {
  id: number;
  name: string;
  enabled: number;
  repeat: Repeat;
  run_at: string | null;
  interval_min: number | null;
  time_of_day: string | null;
  weekdays: string;
  job: string;
  next_run_at: string | null;
  last_run_at: string | null;
  last_status: string | null;
  last_result: string | null;
  run_count: number;
  created_at: string;
}

const rowSpec = (r: Row): Spec => ({
  repeat: r.repeat,
  runAt: r.run_at ?? undefined,
  intervalMin: r.interval_min ?? undefined,
  timeOfDay: r.time_of_day ?? undefined,
  weekdays: JSON.parse(r.weekdays),
});

/** Waktu eksekusi berikutnya setelah `from`. Hari/jam mengikuti zona waktu server. */
function nextAfter(spec: Spec, from: Date): Date | null {
  if (spec.repeat === "once") {
    const d = new Date(spec.runAt!);
    return d > from ? d : null;
  }
  if (spec.repeat === "interval") {
    return new Date(from.getTime() + spec.intervalMin! * 60_000);
  }
  const [h, m] = spec.timeOfDay!.split(":").map(Number);
  const days = spec.repeat === "weekly" ? spec.weekdays! : [0, 1, 2, 3, 4, 5, 6];
  for (let i = 0; i <= 7; i++) {
    const d = new Date(from);
    d.setDate(d.getDate() + i);
    d.setHours(h, m, 0, 0);
    if (d > from && days.includes(d.getDay())) return d;
  }
  return null;
}

function parseSpec(body: any): Spec {
  const repeat = body?.repeat as Repeat;
  if (!["once", "interval", "daily", "weekly"].includes(repeat)) throw new Error("Jenis pengulangan tidak valid");

  if (repeat === "once") {
    const d = new Date(body.runAt);
    if (isNaN(d.getTime())) throw new Error("Tanggal & waktu kirim tidak valid");
    if (d <= new Date()) throw new Error("Waktu kirim harus di masa depan");
    return { repeat, runAt: d.toISOString() };
  }
  if (repeat === "interval") {
    const n = Number(body.intervalMin);
    if (!Number.isInteger(n) || n < 1 || n > 10080) throw new Error("Interval harus 1 - 10080 menit");
    return { repeat, intervalMin: n };
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(body.timeOfDay))) throw new Error("Jam harus berformat HH:MM");
  if (repeat === "daily") return { repeat, timeOfDay: body.timeOfDay };

  const weekdays = Array.isArray(body.weekdays) ? [...new Set<number>(body.weekdays.map(Number))] : [];
  if (!weekdays.length || weekdays.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
    throw new Error("Pilih minimal satu hari");
  }
  return { repeat, timeOfDay: body.timeOfDay, weekdays: weekdays.sort() };
}

const toApi = (r: Row) => ({
  id: r.id,
  name: r.name,
  enabled: !!r.enabled,
  repeat: r.repeat,
  runAt: r.run_at,
  intervalMin: r.interval_min,
  timeOfDay: r.time_of_day,
  weekdays: JSON.parse(r.weekdays) as number[],
  job: JSON.parse(r.job),
  nextRunAt: r.next_run_at,
  lastRunAt: r.last_run_at,
  lastStatus: r.last_status,
  lastResult: r.last_result,
  runCount: r.run_count,
});

const getRow = (id: number) => db.prepare("SELECT * FROM schedules WHERE id = ?").get(id) as Row | undefined;

// ---------- Eksekusi ----------
const running = new Set<number>();

/** Menjalankan satu jadwal. `manual` = "jalankan sekarang": tidak mengubah jadwal berikutnya. */
async function execute(row: Row, manual = false) {
  if (running.has(row.id)) throw new Error("Jadwal ini sedang berjalan");
  running.add(row.id);
  try {
    let status: string;
    let summary: string;
    try {
      const r = await runJob(prepareJob(JSON.parse(row.job)));
      status = r.failed === 0 ? "success" : r.sent === 0 ? "failed" : "partial";
      const firstErr = r.results.find((x) => !x.ok)?.error;
      summary = `${r.sent}/${r.total} terkirim${firstErr ? ` · ${firstErr}` : ""}`;
    } catch (err) {
      status = "failed";
      summary = errMsg(err);
    }

    const now = new Date();
    if (manual) {
      db.prepare(
        "UPDATE schedules SET last_run_at=?, last_status=?, last_result=?, run_count=run_count+1 WHERE id=?"
      ).run(now.toISOString(), status, summary, row.id);
    } else {
      // jadwal "sekali" selesai & nonaktif; lainnya dihitung dari sekarang (tanpa mengejar eksekusi yang terlewat)
      const next = row.repeat === "once" ? null : nextAfter(rowSpec(row), now);
      db.prepare(
        `UPDATE schedules SET last_run_at=?, last_status=?, last_result=?, run_count=run_count+1,
         next_run_at=?, enabled=? WHERE id=?`
      ).run(now.toISOString(), status, summary, next?.toISOString() ?? null, next ? 1 : 0, row.id);
    }
    console.log(`[jadwal] #${row.id} "${row.name}" -> ${status} (${summary})`);
  } finally {
    running.delete(row.id);
  }
}

let ticking = false;
async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    const due = db
      .prepare("SELECT * FROM schedules WHERE enabled = 1 AND next_run_at IS NOT NULL AND next_run_at <= ? ORDER BY next_run_at")
      .all(new Date().toISOString()) as Row[];
    for (const row of due) await execute(row).catch((e) => console.error("[jadwal]", errMsg(e)));
  } finally {
    ticking = false;
  }
}

export function startScheduler(intervalMs = 10_000) {
  setInterval(tick, intervalMs);
  setTimeout(tick, 2000);
  console.log(`Scheduler aktif (cek setiap ${intervalMs / 1000} detik)`);
}

// ---------- Routes ----------
export function registerScheduleRoutes(app: Express) {
  app.get("/api/schedules", (_req, res) => {
    const rows = db.prepare("SELECT * FROM schedules ORDER BY id DESC").all() as Row[];
    res.json(rows.map(toApi));
  });

  app.post("/api/schedules", (req, res) => {
    try {
      const name = String(req.body?.name ?? "").trim();
      if (!name || name.length > 100) throw new Error("Nama jadwal wajib diisi (maks 100 karakter)");
      const spec = parseSpec(req.body);
      const job = prepareJob(req.body?.job); // validasi penuh sekarang, bukan saat jam kirim
      const next = nextAfter(spec, new Date());

      const info = db
        .prepare(
          `INSERT INTO schedules (name, repeat, run_at, interval_min, time_of_day, weekdays, job, next_run_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          name, spec.repeat, spec.runAt ?? null, spec.intervalMin ?? null, spec.timeOfDay ?? null,
          JSON.stringify(spec.weekdays ?? []), JSON.stringify(serializeJob(job)), next?.toISOString() ?? null
        );
      res.status(201).json(toApi(getRow(Number(info.lastInsertRowid))!));
    } catch (err) {
      res.status(400).json({ error: errMsg(err) });
    }
  });

  app.patch("/api/schedules/:id", (req, res) => {
    const row = getRow(Number(req.params.id));
    if (!row) return res.status(404).json({ error: "Jadwal tidak ditemukan" });
    const enabled = Boolean(req.body?.enabled);

    if (!enabled) {
      db.prepare("UPDATE schedules SET enabled = 0 WHERE id = ?").run(row.id);
    } else {
      const next = nextAfter(rowSpec(row), new Date());
      if (!next) return res.status(400).json({ error: "Waktu kirim sudah lewat. Buat jadwal baru." });
      db.prepare("UPDATE schedules SET enabled = 1, next_run_at = ? WHERE id = ?").run(next.toISOString(), row.id);
    }
    res.json(toApi(getRow(row.id)!));
  });

  app.post("/api/schedules/:id/run", async (req, res) => {
    const row = getRow(Number(req.params.id));
    if (!row) return res.status(404).json({ error: "Jadwal tidak ditemukan" });
    try {
      await execute(row, true);
      res.json(toApi(getRow(row.id)!));
    } catch (err) {
      res.status(409).json({ error: errMsg(err) });
    }
  });

  app.delete("/api/schedules/:id", (req, res) => {
    db.prepare("DELETE FROM schedules WHERE id = ?").run(Number(req.params.id));
    res.json({ success: true });
  });
}
