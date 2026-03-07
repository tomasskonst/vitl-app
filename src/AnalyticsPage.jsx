import { useState, useEffect, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// ── Colour helpers ────────────────────────────────────────────────────────────
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * clamp(t, 0, 1);

const scoreGradient = (v, lo, hi) => {
  const t = (v - lo) / (hi - lo);
  if (t >= 0.7) return "#34d399";
  if (t >= 0.4) return "#facc15";
  return "#f87171";
};

const corrColor = (r) => {
  if (r > 0.5) return "#34d399";
  if (r > 0.2) return "#86efac";
  if (r < -0.5) return "#f87171";
  if (r < -0.2) return "#fca5a5";
  return "#94a3b8";
};

// ── Stats utilities ───────────────────────────────────────────────────────────
const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
const std = (arr) => {
  const m = mean(arr);
  return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length);
};

const pearson = (xs, ys) => {
  if (xs.length < 5) return null;
  const mx = mean(xs), my = mean(ys);
  const num = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0);
  const den = Math.sqrt(
    xs.reduce((s, x) => s + (x - mx) ** 2, 0) *
    ys.reduce((s, y) => s + (y - my) ** 2, 0)
  );
  return den === 0 ? 0 : num / den;
};

// Collect paired values for two fields across joined data
const pairFields = (rows, fieldA, fieldB) => {
  const pairs = rows
    .filter((r) => r[fieldA] != null && r[fieldB] != null)
    .map((r) => [Number(r[fieldA]), Number(r[fieldB])]);
  return { xs: pairs.map((p) => p[0]), ys: pairs.map((p) => p[1]) };
};

// rolling average
const rolling = (arr, w) =>
  arr.map((_, i) => {
    const slice = arr.slice(Math.max(0, i - w + 1), i + 1);
    return mean(slice);
  });

// Lag correlation: does A today predict B tomorrow?
const lagCorr = (rows, sortKey, fieldA, fieldB, lag = 1) => {
  const sorted = [...rows].sort((a, b) => (a[sortKey] > b[sortKey] ? 1 : -1));
  const xs = [], ys = [];
  for (let i = 0; i < sorted.length - lag; i++) {
    const va = sorted[i][fieldA], vb = sorted[i + lag][fieldB];
    if (va != null && vb != null) { xs.push(Number(va)); ys.push(Number(vb)); }
  }
  return pearson(xs, ys);
};

// ── Loaders ───────────────────────────────────────────────────────────────────
const loadAnalyticsData = async () => {
  const [
    { data: sleep },
    { data: daily },
    { data: readiness },
    { data: vo2max },
    { data: load },
    { data: race },
    { data: hill },
    { data: runTol },
    { data: activities },
    { data: dailyAct },
  ] = await Promise.all([
    supabase.from("garmin_sleep").select("*").order("calendar_date", { ascending: true }),
    supabase.from("garmin_daily").select("*").order("calendar_date", { ascending: true }),
    supabase.from("garmin_readiness").select("*").order("calendar_date", { ascending: true }),
    supabase.from("garmin_vo2max").select("*").order("calendar_date", { ascending: true }),
    supabase.from("garmin_training_load").select("*").order("calendar_date", { ascending: true }),
    supabase.from("garmin_race_predictions").select("*").order("calendar_date", { ascending: true }),
    supabase.from("garmin_hill_score").select("*").order("calendar_date", { ascending: true }),
    supabase.from("garmin_run_tolerance").select("*").order("calendar_date", { ascending: true }),
    supabase.from("garmin_activities").select("*").order("calendar_date", { ascending: true }),
    supabase.from("garmin_daily_activity_summary").select("*").order("calendar_date", { ascending: true }),
  ]);
  return {
    sleep: sleep || [], daily: daily || [], readiness: readiness || [],
    vo2max: vo2max || [], load: load || [], race: race || [],
    hill: hill || [], runTol: runTol || [], activities: activities || [],
    dailyAct: dailyAct || [],
  };
};

// ── Join daily + sleep + readiness by date ────────────────────────────────────
const joinByDate = (daily, sleep, readiness, load, dailyAct) => {
  const sleepMap = Object.fromEntries(sleep.map((r) => [r.calendar_date, r]));
  const readMap = Object.fromEntries(readiness.map((r) => [r.calendar_date, r]));
  const loadMap = Object.fromEntries(load.map((r) => [r.calendar_date, r]));
  const actMap = Object.fromEntries(dailyAct.map((r) => [r.calendar_date, r]));
  return daily.map((d) => ({
    ...d,
    ...(sleepMap[d.calendar_date] || {}),
    ...(readMap[d.calendar_date] || {}),
    ...(loadMap[d.calendar_date] || {}),
    ...(actMap[d.calendar_date] || {}),
    date: d.calendar_date,
  }));
};

const secsToHHMM = (s) => {
  if (!s) return "—";
  const h = Math.floor(s / 60), m = s % 60;
  return `${h}h ${m}m`;
};

const fmt = (d) =>
  d ? new Date(d + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—";

// ── Mini sparkline ─────────────────────────────────────────────────────────────
function Sparkline({ data, color = "#6366f1", height = 32, showDots = false }) {
  if (!data || data.length < 2) return null;
  const vals = data.filter((v) => v != null);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const range = hi - lo || 1;
  const w = 120, h = height;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - lo) / range) * (h - 4) - 2;
    return `${x},${y}`;
  });
  return (
    <svg width={w} height={h} style={{ overflow: "visible" }}>
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity={0.9}
      />
      {showDots && data.slice(-1).map((v, i) => {
        const x = w;
        const y = h - ((v - lo) / range) * (h - 4) - 2;
        return <circle key={i} cx={x} cy={y} r={3} fill={color} />;
      })}
    </svg>
  );
}

// ── Correlation bar ───────────────────────────────────────────────────────────
function CorrBar({ r }) {
  if (r == null) return <span style={{ color: "#475569", fontSize: 12 }}>Not enough data</span>;
  const pct = Math.abs(r) * 100;
  const col = corrColor(r);
  const label = Math.abs(r) > 0.6 ? "Strong" : Math.abs(r) > 0.35 ? "Moderate" : Math.abs(r) > 0.15 ? "Weak" : "None";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 5, borderRadius: 99, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: col, borderRadius: 99, transition: "width 0.8s ease" }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color: col, minWidth: 24, textAlign: "right" }}>
        {r > 0 ? "+" : ""}{r.toFixed(2)}
      </span>
      <span style={{ fontSize: 10, color: "#64748b" }}>{label}</span>
    </div>
  );
}

// ── Section header ─────────────────────────────────────────────────────────────
function SectionTitle({ icon, title, sub }) {
  return (
    <div style={{ marginBottom: 14, marginTop: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        <span style={{ fontSize: 15, fontWeight: 700, color: "#f1f5f9", letterSpacing: "-0.3px" }}>{title}</span>
      </div>
      {sub && <div style={{ fontSize: 12, color: "#64748b", paddingLeft: 24 }}>{sub}</div>}
    </div>
  );
}

// ── Insight card ───────────────────────────────────────────────────────────────
function InsightCard({ icon, color, title, finding, tag }) {
  return (
    <div style={{
      background: "rgba(15,23,42,0.6)",
      border: `1px solid ${color}28`,
      borderLeft: `3px solid ${color}`,
      borderRadius: 14,
      padding: "14px 16px",
      marginBottom: 10,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color, display: "flex", alignItems: "center", gap: 6 }}>
          <span>{icon}</span> {title}
        </div>
        {tag && (
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, background: `${color}18`, color, borderRadius: 20, padding: "2px 8px", border: `1px solid ${color}30` }}>
            {tag}
          </span>
        )}
      </div>
      <div style={{ fontSize: 12.5, color: "#94a3b8", lineHeight: 1.65 }}>{finding}</div>
    </div>
  );
}

// ── Stat pill ──────────────────────────────────────────────────────────────────
function StatPill({ label, value, unit, color = "#a5b4fc", trend }) {
  return (
    <div style={{ background: "rgba(15,23,42,0.5)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "12px 14px" }}>
      <div style={{ fontSize: 10, color: "#475569", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 3, marginBottom: 4 }}>
        <span style={{ fontSize: 22, fontWeight: 800, color, letterSpacing: "-0.5px" }}>{value ?? "—"}</span>
        {unit && <span style={{ fontSize: 11, color: "#475569" }}>{unit}</span>}
      </div>
      {trend && <Sparkline data={trend} color={color} height={22} showDots />}
    </div>
  );
}

// ── Corr row ───────────────────────────────────────────────────────────────────
function CorrRow({ a, b, r, lagLabel }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
        <span style={{ fontSize: 12, color: "#94a3b8" }}>{a}</span>
        <span style={{ fontSize: 10, color: "#334155" }}>→</span>
        <span style={{ fontSize: 12, color: "#94a3b8" }}>{b}</span>
        {lagLabel && <span style={{ fontSize: 9, color: "#475569", marginLeft: 4 }}>({lagLabel})</span>}
      </div>
      <CorrBar r={r} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════
export default function AnalyticsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("overview");

  useEffect(() => {
    loadAnalyticsData().then((d) => { setData(d); setLoading(false); });
  }, []);

  const analytics = useMemo(() => {
    if (!data) return null;
    const { sleep, daily, readiness, vo2max, load, race, hill, runTol, activities, dailyAct } = data;

    const joined = joinByDate(daily, sleep, readiness, load, dailyAct);
    const recent90 = joined.slice(-90);
    const recent30 = joined.slice(-30);

    // ── Overview stats ──────────────────────────────────────────────────────
    const sleepScores = sleep.map((s) => s.sleep_score).filter(Boolean);
    const readinessScores = readiness.map((r) => r.score).filter(Boolean);
    const hrv = readiness.map((r) => r.hrv_weekly_avg).filter(Boolean);
    const steps = daily.map((d) => d.total_steps).filter(Boolean);
    const rhr = daily.map((d) => d.resting_hr).filter(Boolean);
    const vo2arr = vo2max.map((v) => v.vo2max).filter(Boolean);
    const bbHigh = daily.map((d) => d.body_battery_high).filter(Boolean);
    const stress = daily.map((d) => d.avg_stress).filter(Boolean);

    const latestVo2 = vo2arr[vo2arr.length - 1];
    const earliestVo2 = vo2arr[0];
    const latestRace = race[race.length - 1];
    const latestHill = hill[hill.length - 1];
    const latestReadiness = readiness[readiness.length - 1];
    const latestLoad = load[load.length - 1];

    // ── Correlations (same-day) ─────────────────────────────────────────────
    const { xs: ssXs, ys: ssYs } = pairFields(joined, "sleep_score", "score"); // sleep → readiness
    const corr_sleep_readiness = pearson(ssXs, ssYs);

    const { xs: hrv_xs, ys: hrv_ys } = pairFields(joined, "hrv_weekly_avg", "score");
    const corr_hrv_readiness = pearson(hrv_xs, hrv_ys);

    const { xs: bb_xs, ys: bb_ys } = pairFields(joined, "body_battery_high", "score");
    const corr_bb_readiness = pearson(bb_xs, bb_ys);

    const { xs: str_xs, ys: str_ys } = pairFields(joined, "avg_stress", "sleep_score");
    const corr_stress_sleep = pearson(str_xs, str_ys);

    const { xs: load_xs, ys: load_ys } = pairFields(joined, "ctl", "vo2max");
    const corr_load_vo2 = pearson(load_xs, load_ys);

    const { xs: stps_xs, ys: stps_ys } = pairFields(joined, "total_steps", "body_battery_high");
    const corr_steps_bb = pearson(stps_xs, stps_ys);

    // ── Lag correlations ────────────────────────────────────────────────────
    const lag_load_readiness = lagCorr(joined, "date", "total_training_load", "score", 1);
    const lag_sleep_stress = lagCorr(joined, "date", "sleep_score", "avg_stress", 1);
    const lag_bb_sleep = lagCorr(joined, "date", "body_battery_high", "sleep_score", 1);
    const lag_stress_hrv = lagCorr(joined, "date", "avg_stress", "hrv_weekly_avg", 1);

    // ── Bedtime analysis ────────────────────────────────────────────────────
    const bedPairs = sleep
      .filter((s) => s.bedtime_hour != null && s.sleep_score != null)
      .map((s) => ({ bedtime: Number(s.bedtime_hour), score: Number(s.sleep_score) }));
    const early = bedPairs.filter((p) => p.bedtime < 23 || p.bedtime > 22.5);
    const late = bedPairs.filter((p) => p.bedtime >= 23 || p.bedtime < 3);
    const earlyAvg = early.length ? mean(early.map((p) => p.score)) : null;
    const lateAvg = late.length ? mean(late.map((p) => p.score)) : null;

    // ── Sleep stage analysis ────────────────────────────────────────────────
    const sleepWithStages = sleep.filter(
      (s) => s.sleep_deep_min && s.sleep_rem_min && s.sleep_total_min
    );
    const avgDeepPct = sleepWithStages.length
      ? mean(sleepWithStages.map((s) => (s.sleep_deep_min / s.sleep_total_min) * 100))
      : null;
    const avgRemPct = sleepWithStages.length
      ? mean(sleepWithStages.map((s) => (s.sleep_rem_min / s.sleep_total_min) * 100))
      : null;

    // ── High stress days ────────────────────────────────────────────────────
    const highStressDays = joined.filter((d) => (d.avg_stress || 0) > 70);
    const highStressSleepAfter = highStressDays
      .map((d, i) => joined[joined.indexOf(d) + 1]?.sleep_score)
      .filter(Boolean);
    const avgSleepAfterHighStress = highStressSleepAfter.length
      ? mean(highStressSleepAfter)
      : null;
    const avgNormalSleep = sleepScores.length ? mean(sleepScores) : null;

    // ── VO2max trend ────────────────────────────────────────────────────────
    const vo2Trend = vo2max.slice(-30).map((v) => v.vo2max);
    const vo2Change = vo2arr.length >= 2
      ? (latestVo2 - earliestVo2).toFixed(1)
      : null;

    // ── Body battery ────────────────────────────────────────────────────────
    const bbChange7d = daily.slice(-7).map((d) => d.body_battery_change).filter(Boolean);
    const avgBBChange7d = bbChange7d.length ? mean(bbChange7d).toFixed(1) : null;

    // ── Training load balance ───────────────────────────────────────────────
    const latestACWR = latestLoad?.acwr_ratio;
    const isOverreaching = latestACWR != null && latestACWR > 1.3;
    const isUndertraining = latestACWR != null && latestACWR < 0.8;

    // ── Running economy ─────────────────────────────────────────────────────
    const runActivities = activities.filter(
      (a) => a.sport_type === "RUNNING" && a.distance_m > 1000 && a.avg_hr && a.avg_speed_ms
    );
    const runEconomy = runActivities.map((a) => ({
      date: a.calendar_date,
      hr: a.avg_hr,
      pace: a.avg_speed_ms,
      ratio: a.avg_speed_ms / a.avg_hr, // higher = more efficient
    }));
    const econTrend = runEconomy.slice(-30).map((r) => r.ratio * 1000);
    const econChange = runEconomy.length >= 10
      ? ((runEconomy.slice(-5).reduce((s, r) => s + r.ratio, 0) / 5) /
         (runEconomy.slice(0, 5).reduce((s, r) => s + r.ratio, 0) / 5) - 1) * 100
      : null;

    // ── HRV trend ───────────────────────────────────────────────────────────
    const hrvTrend = readiness.slice(-30).map((r) => r.hrv_weekly_avg).filter(Boolean);
    const latestHRV = hrv[hrv.length - 1];
    const avgHRV30 = hrv.slice(-30).length ? mean(hrv.slice(-30)) : null;

    // ── Race predictions trend ──────────────────────────────────────────────
    const raceTrend5k = race.slice(-20).map((r) => r.race_5k_s).filter(Boolean);
    const raceTrend10k = race.slice(-20).map((r) => r.race_10k_s).filter(Boolean);
    const raceImproved5k = raceTrend5k.length >= 2
      ? raceTrend5k[0] - raceTrend5k[raceTrend5k.length - 1]
      : null;

    // ── Sleep debt ──────────────────────────────────────────────────────────
    const TARGET_SLEEP_MIN = 480; // 8h
    const sleepDebt7d = sleep.slice(-7)
      .reduce((debt, s) => debt + Math.max(0, TARGET_SLEEP_MIN - (s.sleep_total_min || 0)), 0);

    // ── Resting HR trend ───────────────────────────────────────────────────
    const rhrTrend = daily.slice(-60).map((d) => d.resting_hr).filter(Boolean);

    // ── Most tiring activity types ─────────────────────────────────────────
    const byType = {};
    for (const a of activities) {
      if (!a.sport_type || !a.training_load) continue;
      if (!byType[a.sport_type]) byType[a.sport_type] = [];
      byType[a.sport_type].push(a.training_load);
    }
    const typeLoads = Object.entries(byType)
      .map(([type, loads]) => ({ type, avg: mean(loads), count: loads.length }))
      .filter((t) => t.count >= 3)
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 5);

    // ── Weekly pattern analysis ─────────────────────────────────────────────
    const byWeekday = Array.from({ length: 7 }, (_, i) => ({
      day: ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][i],
      sleepScores: [], readinessScores: [], stress: [],
    }));
    for (const d of joined) {
      const dow = (new Date(d.date + "T12:00:00").getDay() + 6) % 7;
      if (d.sleep_score) byWeekday[dow].sleepScores.push(d.sleep_score);
      if (d.score) byWeekday[dow].readinessScores.push(d.score);
      if (d.avg_stress) byWeekday[dow].stress.push(d.avg_stress);
    }
    const weekdayStats = byWeekday.map((d) => ({
      day: d.day,
      avgSleep: d.sleepScores.length ? mean(d.sleepScores) : null,
      avgReadiness: d.readinessScores.length ? mean(d.readinessScores) : null,
      avgStress: d.stress.length ? mean(d.stress) : null,
    }));

    const bestSleepDay = weekdayStats.filter((d) => d.avgSleep).sort((a, b) => b.avgSleep - a.avgSleep)[0];
    const worstSleepDay = weekdayStats.filter((d) => d.avgSleep).sort((a, b) => a.avgSleep - b.avgSleep)[0];
    const bestReadinessDay = weekdayStats.filter((d) => d.avgReadiness).sort((a, b) => b.avgReadiness - a.avgReadiness)[0];

    // ── Key insights text ───────────────────────────────────────────────────
    const insights = [];

    if (corr_sleep_readiness != null && corr_sleep_readiness > 0.4) {
      insights.push({
        icon: "💤", color: "#818cf8", tag: "STRONG LINK",
        title: "Sleep drives your Readiness",
        finding: `There's a ${corr_sleep_readiness > 0.6 ? "strong" : "moderate"} correlation (r=${corr_sleep_readiness.toFixed(2)}) between your sleep quality and next-day training readiness. Prioritising sleep is your single biggest lever for recovery.`,
      });
    }

    if (lag_load_readiness != null && lag_load_readiness < -0.25) {
      insights.push({
        icon: "🏃", color: "#f87171", tag: "RECOVERY",
        title: "Heavy training days lower next-day Readiness",
        finding: `After high training load days, your readiness score drops the following morning (r=${lag_load_readiness.toFixed(2)}). Build in planned recovery days after your hardest sessions.`,
      });
    }

    if (corr_stress_sleep != null && corr_stress_sleep < -0.3) {
      insights.push({
        icon: "😤", color: "#fb923c", tag: "STRESS",
        title: "High stress days hurt your sleep",
        finding: `Your daily stress score negatively correlates with sleep quality (r=${corr_stress_sleep.toFixed(2)}). On your most stressed days, your sleep score averages ${avgSleepAfterHighStress ? avgSleepAfterHighStress.toFixed(0) : "—"} vs your normal ${avgNormalSleep ? avgNormalSleep.toFixed(0) : "—"}.`,
      });
    }

    if (vo2Change != null) {
      const dir = Number(vo2Change) > 0 ? "improved" : "declined";
      insights.push({
        icon: "🫀", color: Number(vo2Change) > 0 ? "#34d399" : "#f87171", tag: "FITNESS",
        title: `VO2max has ${dir} over time`,
        finding: `Your VO2max changed by ${vo2Change} mL/kg/min since your first recorded data point. Current: ${latestVo2?.toFixed(1)} mL/kg/min. ${Number(vo2Change) > 1 ? "Your aerobic capacity is trending in the right direction." : Number(vo2Change) < -1 ? "Consider increasing aerobic base training." : "Your aerobic fitness is holding steady."}`,
      });
    }

    if (isOverreaching) {
      insights.push({
        icon: "⚠️", color: "#f87171", tag: "ALERT",
        title: "Training load may be too high",
        finding: `Your acute:chronic workload ratio (ACWR) is ${latestACWR?.toFixed(2)}, above the safe zone of 0.8–1.3. This significantly raises injury risk. Reduce intensity for 3–5 days.`,
      });
    } else if (isUndertraining) {
      insights.push({
        icon: "📉", color: "#facc15", tag: "ATTENTION",
        title: "Training stimulus may be insufficient",
        finding: `Your ACWR of ${latestACWR?.toFixed(2)} is below 0.8. You may be losing fitness gains. Consider increasing training volume gradually this week.`,
      });
    }

    if (econChange != null && Math.abs(econChange) > 3) {
      insights.push({
        icon: "⚡", color: econChange > 0 ? "#34d399" : "#fb923c", tag: "RUNNING",
        title: `Running economy ${econChange > 0 ? "improving" : "declining"}`,
        finding: `Your speed-to-HR ratio has changed by ${econChange.toFixed(1)}% over your recent runs. ${econChange > 0 ? "You're getting faster at the same effort — a sign of improving fitness." : "You're working harder for the same pace. Check for fatigue, illness or overtraining."}`,
      });
    }

    if (bestSleepDay && worstSleepDay && bestSleepDay.day !== worstSleepDay.day) {
      insights.push({
        icon: "📅", color: "#a78bfa", tag: "PATTERN",
        title: `${bestSleepDay.day} is your best sleep night`,
        finding: `You consistently sleep best on ${bestSleepDay.day} (avg ${bestSleepDay.avgSleep?.toFixed(0)}) and worst on ${worstSleepDay.day} (avg ${worstSleepDay.avgSleep?.toFixed(0)}). This ${Math.abs(bestSleepDay.avgSleep - worstSleepDay.avgSleep) > 8 ? "significant" : "notable"} pattern likely reflects weekly routine.`,
      });
    }

    if (sleepDebt7d > 120) {
      insights.push({
        icon: "😴", color: "#f59e0b", tag: "SLEEP DEBT",
        title: `You've accumulated ${secsToHHMM(sleepDebt7d)} of sleep debt this week`,
        finding: `Over the past 7 days, you fell short of 8h sleep by a cumulative ${secsToHHMM(sleepDebt7d)}. Sleep debt compounds — your readiness, HRV, and mood are all likely affected.`,
      });
    }

    if (raceImproved5k != null && raceImproved5k > 30) {
      insights.push({
        icon: "🏁", color: "#34d399", tag: "RACE",
        title: "Predicted 5K time is getting faster",
        finding: `Your predicted 5K has improved by ${secsToHHMM(Math.round(raceImproved5k))} since your earliest data. Your current prediction: ${latestRace?.pred_5k ?? "—"}.`,
      });
    }

    return {
      // raw
      sleep, daily, readiness, vo2max, load, race, hill, runTol, activities, dailyAct,
      joined, recent30, recent90,
      // stats
      avgSleepScore: sleepScores.length ? mean(sleepScores).toFixed(0) : null,
      avgReadiness: readinessScores.length ? mean(readinessScores).toFixed(0) : null,
      avgHRV30: avgHRV30 ? avgHRV30.toFixed(0) : null,
      latestHRV: latestHRV ? latestHRV.toFixed(0) : null,
      avgSteps: steps.length ? mean(steps).toFixed(0) : null,
      avgRHR: rhr.length ? mean(rhr).toFixed(0) : null,
      latestVo2: latestVo2 ? latestVo2.toFixed(1) : null,
      vo2Change, latestRace, latestHill, latestReadiness,
      avgDeepPct: avgDeepPct ? avgDeepPct.toFixed(0) : null,
      avgRemPct: avgRemPct ? avgRemPct.toFixed(0) : null,
      latestACWR: latestACWR ? latestACWR.toFixed(2) : null,
      isOverreaching, isUndertraining,
      sleepDebt7d,
      avgBBChange7d,
      // correlations
      corr_sleep_readiness, corr_hrv_readiness, corr_bb_readiness,
      corr_stress_sleep, corr_steps_bb,
      lag_load_readiness, lag_sleep_stress, lag_bb_sleep, lag_stress_hrv,
      // trends
      sleepTrend: sleep.slice(-30).map((s) => s.sleep_score),
      readinessTrend: readiness.slice(-30).map((r) => r.score),
      hrvTrend,
      vo2Trend,
      rhrTrend,
      raceTrend5k,
      econTrend,
      bbTrend: daily.slice(-30).map((d) => d.body_battery_high),
      // patterns
      weekdayStats, bestSleepDay, worstSleepDay, bestReadinessDay,
      typeLoads,
      runEconomy, econChange,
      earlyAvg, lateAvg,
      earlyCount: early.length, lateCount: late.length,
      // insights
      insights,
      // data quality
      hasSleep: sleep.length > 7,
      hasReadiness: readiness.length > 7,
      hasLoad: load.length > 7,
      hasActivities: activities.length > 5,
      hasRace: race.length > 5,
    };
  }, [data]);

  if (loading) return (
    <div style={pageStyle}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "60vh", gap: 16 }}>
        <div style={{ width: 40, height: 40, borderRadius: "50%", border: "3px solid rgba(99,102,241,0.3)", borderTopColor: "#6366f1", animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <div style={{ fontSize: 13, color: "#475569" }}>Crunching your data…</div>
      </div>
    </div>
  );

  if (!analytics) return null;

  const noData = !analytics.hasSleep && !analytics.hasReadiness && !analytics.hasActivities;

  if (noData) return (
    <div style={pageStyle}>
      <div style={{ padding: "60px 20px", textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
        <div style={{ fontSize: 17, fontWeight: 700, color: "#f1f5f9", marginBottom: 8 }}>No Garmin data yet</div>
        <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.7 }}>
          Sync your Garmin data first using the <strong style={{ color: "#818cf8" }}>Data Sync</strong> page, then come back here for deep insights.
        </div>
      </div>
    </div>
  );

  const a = analytics;
  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "sleep", label: "Sleep" },
    { key: "fitness", label: "Fitness" },
    { key: "patterns", label: "Patterns" },
    { key: "correlations", label: "Correlations" },
  ];

  return (
    <div style={pageStyle}>
      <style>{`
        @keyframes fadeUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        .ana-tab { transition: background 0.15s, color 0.15s; }
        .ana-tab:active { transform: scale(0.97); }
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "#334155", marginBottom: 4 }}>Deep Analysis</div>
        <div style={{ fontSize: 24, fontWeight: 800, color: "#f1f5f9", letterSpacing: "-0.5px" }}>Health Intelligence</div>
        <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>
          {a.joined.length} days analysed · {a.activities.length} activities
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 20, scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}>
        <style>{`.tab-scroll::-webkit-scrollbar { display:none; }`}</style>
        {tabs.map((t) => (
          <button key={t.key} className="ana-tab"
            onClick={() => setTab(t.key)}
            style={{
              padding: "7px 14px", borderRadius: 20, border: "none", whiteSpace: "nowrap",
              background: tab === t.key ? "rgba(99,102,241,0.25)" : "rgba(255,255,255,0.05)",
              color: tab === t.key ? "#a5b4fc" : "#64748b",
              fontSize: 12, fontWeight: tab === t.key ? 700 : 400, cursor: "pointer",
              border: tab === t.key ? "1px solid rgba(99,102,241,0.4)" : "1px solid transparent",
            }}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ animation: "fadeUp 0.25s ease" }} key={tab}>

        {/* ═══ OVERVIEW ═══ */}
        {tab === "overview" && (
          <>
            {/* Key metrics row */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
              <StatPill label="Avg Sleep Score" value={a.avgSleepScore} unit="/100" color="#818cf8" trend={a.sleepTrend} />
              <StatPill label="Avg Readiness" value={a.avgReadiness} unit="/100" color="#34d399" trend={a.readinessTrend} />
              <StatPill label="VO2max" value={a.latestVo2} unit="mL/kg/min" color="#f59e0b" trend={a.vo2Trend} />
              <StatPill label="Avg HRV" value={a.avgHRV30} unit="ms" color="#a78bfa" trend={a.hrvTrend} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 20 }}>
              <StatPill label="Resting HR" value={a.avgRHR} unit="bpm" color="#f87171" trend={a.rhrTrend} />
              <StatPill label="Avg Steps" value={a.avgSteps ? Number(a.avgSteps).toLocaleString() : null} color="#60a5fa" />
              <StatPill label="BB Change/day" value={a.avgBBChange7d} unit="pts" color="#facc15" />
            </div>

            {/* ACWR */}
            {a.latestACWR && (
              <div style={{
                marginBottom: 16, padding: "14px 16px", borderRadius: 14,
                background: a.isOverreaching ? "rgba(248,113,113,0.08)" : a.isUndertraining ? "rgba(250,204,21,0.08)" : "rgba(52,211,153,0.08)",
                border: `1px solid ${a.isOverreaching ? "rgba(248,113,113,0.3)" : a.isUndertraining ? "rgba(250,204,21,0.3)" : "rgba(52,211,153,0.3)"}`,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Training Load Balance (ACWR)</div>
                    <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-1px", color: a.isOverreaching ? "#f87171" : a.isUndertraining ? "#facc15" : "#34d399" }}>
                      {a.latestACWR}
                    </div>
                    <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                      {a.isOverreaching ? "⚠️ Overreaching — injury risk elevated" : a.isUndertraining ? "📉 Undertraining zone" : "✓ Optimal zone (0.8–1.3)"}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 10, color: "#334155", marginBottom: 4 }}>Safe zone</div>
                    <div style={{ fontSize: 11, color: "#475569" }}>0.8 – 1.3</div>
                  </div>
                </div>
              </div>
            )}

            {/* Insights */}
            <SectionTitle icon="🔍" title="Key Findings" sub="Auto-detected patterns in your data" />
            {a.insights.length === 0 ? (
              <div style={{ fontSize: 13, color: "#475569", textAlign: "center", padding: "20px 0" }}>
                Keep syncing data — more patterns will emerge as your dataset grows.
              </div>
            ) : a.insights.map((ins, i) => (
              <InsightCard key={i} {...ins} />
            ))}

            {/* Race predictions */}
            {a.latestRace && (
              <>
                <SectionTitle icon="🏁" title="Race Predictions" sub={`Based on ${a.race.length} data points`} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 8 }}>
                  {[
                    { label: "5K", val: a.latestRace.pred_5k, trend: a.raceTrend5k },
                    { label: "10K", val: a.latestRace.pred_10k },
                    { label: "Half", val: a.latestRace.pred_half },
                    { label: "Marathon", val: a.latestRace.pred_marathon },
                  ].filter((r) => r.val).map((r) => (
                    <div key={r.label} style={{ background: "rgba(15,23,42,0.6)", border: "1px solid rgba(99,102,241,0.15)", borderRadius: 12, padding: "12px 14px" }}>
                      <div style={{ fontSize: 10, color: "#475569", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>{r.label}</div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: "#a5b4fc", letterSpacing: "-0.5px" }}>{r.val}</div>
                      {r.trend && <Sparkline data={r.trend.map((v) => -v)} color="#6366f1" height={20} />}
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {/* ═══ SLEEP ═══ */}
        {tab === "sleep" && (
          <>
            <SectionTitle icon="💤" title="Sleep Quality Breakdown" sub="All time averages" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
              <StatPill label="Sleep Score" value={a.avgSleepScore} unit="/100" color="#818cf8" trend={a.sleepTrend} />
              <StatPill label="Deep Sleep" value={a.avgDeepPct} unit="%" color="#6366f1" />
              <StatPill label="REM Sleep" value={a.avgRemPct} unit="%" color="#a78bfa" />
              <StatPill label="Avg HRV" value={a.avgHRV30} unit="ms" color="#34d399" trend={a.hrvTrend} />
            </div>

            {/* Sleep debt */}
            {a.sleepDebt7d > 0 && (
              <div style={{ marginBottom: 16, padding: "14px 16px", borderRadius: 14, background: "rgba(250,204,21,0.08)", border: "1px solid rgba(250,204,21,0.25)" }}>
                <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>7-Day Sleep Debt</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: "#facc15" }}>{secsToHHMM(a.sleepDebt7d)}</div>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>vs 8h nightly target · affects readiness, mood & performance</div>
              </div>
            )}

            {/* Bedtime analysis */}
            {a.earlyCount >= 3 && a.lateCount >= 3 && (
              <>
                <SectionTitle icon="🌙" title="Bedtime Impact" sub="Earlier bedtime vs later bedtime sleep score" />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
                  <div style={{ background: "rgba(15,23,42,0.6)", border: "1px solid rgba(52,211,153,0.2)", borderRadius: 12, padding: "14px", textAlign: "center" }}>
                    <div style={{ fontSize: 10, color: "#475569", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Before 11pm ({a.earlyCount} nights)</div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: "#34d399" }}>{a.earlyAvg?.toFixed(0)}</div>
                    <div style={{ fontSize: 10, color: "#475569", marginTop: 2 }}>avg sleep score</div>
                  </div>
                  <div style={{ background: "rgba(15,23,42,0.6)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 12, padding: "14px", textAlign: "center" }}>
                    <div style={{ fontSize: 10, color: "#475569", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>After 11pm ({a.lateCount} nights)</div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: "#f87171" }}>{a.lateAvg?.toFixed(0)}</div>
                    <div style={{ fontSize: 10, color: "#475569", marginTop: 2 }}>avg sleep score</div>
                  </div>
                </div>
              </>
            )}

            {/* Weekly sleep pattern */}
            <SectionTitle icon="📅" title="Sleep Score by Day of Week" sub="Your consistent weekly rhythm" />
            <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
              {a.weekdayStats.map((d) => {
                const val = d.avgSleep;
                const barH = val ? Math.round((val / 100) * 52) : 4;
                const col = val ? scoreGradient(val, 60, 90) : "#1e293b";
                return (
                  <div key={d.day} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: val ? col : "#334155" }}>{val ? val.toFixed(0) : "—"}</div>
                    <div style={{ width: "100%", height: 56, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
                      <div style={{ width: "80%", height: barH, background: col, borderRadius: "4px 4px 0 0", opacity: val ? 1 : 0.2 }} />
                    </div>
                    <div style={{ fontSize: 9, color: "#475569", textTransform: "uppercase", letterSpacing: 0.5 }}>{d.day}</div>
                  </div>
                );
              })}
            </div>

            {/* Sleep correlations */}
            <SectionTitle icon="🔗" title="What affects your sleep?" sub="Correlation strength — same day" />
            <div style={{ background: "rgba(15,23,42,0.5)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: "16px" }}>
              <CorrRow a="Daily stress" b="Sleep score" r={a.corr_stress_sleep} />
              <CorrRow a="Body Battery peak" b="Sleep score" r={a.lag_bb_sleep} lagLabel="next night" />
              <CorrRow a="Training load" b="Readiness" r={a.lag_load_readiness} lagLabel="next day" />
            </div>
          </>
        )}

        {/* ═══ FITNESS ═══ */}
        {tab === "fitness" && (
          <>
            <SectionTitle icon="🫀" title="Aerobic Fitness" sub="Long-term VO2max & readiness trends" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
              <StatPill label="VO2max" value={a.latestVo2} unit="mL/kg/min" color="#f59e0b" trend={a.vo2Trend} />
              <StatPill label="VO2max change" value={a.vo2Change != null ? (Number(a.vo2Change) > 0 ? `+${a.vo2Change}` : a.vo2Change) : null} color={Number(a.vo2Change) > 0 ? "#34d399" : "#f87171"} />
              <StatPill label="Latest Readiness" value={a.latestReadiness?.score} unit="/100" color="#34d399" trend={a.readinessTrend} />
              <StatPill label="HRV (latest)" value={a.latestHRV} unit="ms" color="#a78bfa" trend={a.hrvTrend} />
            </div>

            {/* Hill score */}
            {a.latestHill && (
              <>
                <SectionTitle icon="⛰️" title="Hill Score" sub="Strength + Endurance on inclines" />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
                  {[
                    { label: "Overall", value: a.latestHill.overall_score, color: "#f59e0b" },
                    { label: "Strength", value: a.latestHill.strength_score, color: "#f87171" },
                    { label: "Endurance", value: a.latestHill.endurance_score, color: "#34d399" },
                  ].map((s) => (
                    <div key={s.label} style={{ background: "rgba(15,23,42,0.6)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "12px", textAlign: "center" }}>
                      <div style={{ fontSize: 10, color: "#475569", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>{s.label}</div>
                      <div style={{ fontSize: 26, fontWeight: 800, color: s.color }}>{s.value ?? "—"}</div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Running economy */}
            {a.runEconomy.length >= 5 && (
              <>
                <SectionTitle icon="⚡" title="Running Economy" sub="Speed-to-HR efficiency ratio over time" />
                <div style={{ background: "rgba(15,23,42,0.5)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: "14px", marginBottom: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <div>
                      <div style={{ fontSize: 12, color: "#94a3b8" }}>Economy trend (last 30 runs)</div>
                      <div style={{ fontSize: 11, color: "#475569" }}>Higher = more efficient at same HR</div>
                    </div>
                    {a.econChange != null && (
                      <div style={{ fontSize: 18, fontWeight: 800, color: a.econChange > 0 ? "#34d399" : "#f87171" }}>
                        {a.econChange > 0 ? "+" : ""}{a.econChange.toFixed(1)}%
                      </div>
                    )}
                  </div>
                  <Sparkline data={a.econTrend} color={a.econChange > 0 ? "#34d399" : "#fb923c"} height={44} showDots />
                </div>
              </>
            )}

            {/* Activity type training loads */}
            {a.typeLoads.length > 0 && (
              <>
                <SectionTitle icon="🏋️" title="Training Load by Activity Type" sub="Average load per session" />
                {a.typeLoads.map((t) => {
                  const maxLoad = a.typeLoads[0].avg;
                  const pct = (t.avg / maxLoad) * 100;
                  return (
                    <div key={t.type} style={{ marginBottom: 10, background: "rgba(15,23,42,0.5)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: "12px 14px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <span style={{ fontSize: 13, color: "#94a3b8" }}>{t.type.replace(/_/g, " ")}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#f59e0b" }}>{t.avg.toFixed(0)} <span style={{ fontSize: 10, color: "#475569" }}>avg load · {t.count} sessions</span></span>
                      </div>
                      <div style={{ height: 5, borderRadius: 99, background: "rgba(255,255,255,0.05)", overflow: "hidden" }}>
                        <div style={{ width: `${pct}%`, height: "100%", background: "linear-gradient(90deg, #f59e0b, #fbbf24)", borderRadius: 99 }} />
                      </div>
                    </div>
                  );
                })}
              </>
            )}

            {/* Fitness correlations */}
            <SectionTitle icon="🔗" title="Fitness Correlations" sub="What builds your aerobic fitness" />
            <div style={{ background: "rgba(15,23,42,0.5)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: "16px" }}>
              <CorrRow a="Chronic training load (CTL)" b="VO2max" r={a.corr_load_vo2} />
              <CorrRow a="Daily steps" b="Body Battery" r={a.corr_steps_bb} />
              <CorrRow a="HRV" b="Readiness" r={a.corr_hrv_readiness} />
            </div>
          </>
        )}

        {/* ═══ PATTERNS ═══ */}
        {tab === "patterns" && (
          <>
            <SectionTitle icon="📆" title="Weekday Patterns" sub="Your consistent weekly rhythms" />

            {/* Readiness by day */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 10 }}>Readiness Score by Day</div>
              <div style={{ display: "flex", gap: 6 }}>
                {a.weekdayStats.map((d) => {
                  const val = d.avgReadiness;
                  const barH = val ? Math.round((val / 100) * 52) : 4;
                  const col = val ? scoreGradient(val, 50, 85) : "#1e293b";
                  return (
                    <div key={d.day} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: val ? col : "#334155" }}>{val ? val.toFixed(0) : "—"}</div>
                      <div style={{ width: "100%", height: 56, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
                        <div style={{ width: "80%", height: barH, background: col, borderRadius: "4px 4px 0 0", opacity: val ? 1 : 0.2 }} />
                      </div>
                      <div style={{ fontSize: 9, color: "#475569", textTransform: "uppercase" }}>{d.day}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Stress by day */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 10 }}>Avg Stress Level by Day</div>
              <div style={{ display: "flex", gap: 6 }}>
                {a.weekdayStats.map((d) => {
                  const val = d.avgStress;
                  const barH = val ? Math.round((val / 100) * 52) : 4;
                  const col = val ? scoreGradient(100 - val, 20, 70) : "#1e293b"; // invert — high stress = red
                  return (
                    <div key={d.day} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: val ? col : "#334155" }}>{val ? val.toFixed(0) : "—"}</div>
                      <div style={{ width: "100%", height: 56, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
                        <div style={{ width: "80%", height: barH, background: col, borderRadius: "4px 4px 0 0", opacity: val ? 1 : 0.2 }} />
                      </div>
                      <div style={{ fontSize: 9, color: "#475569", textTransform: "uppercase" }}>{d.day}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Pattern findings */}
            <SectionTitle icon="💡" title="Pattern Insights" />
            {a.bestSleepDay && a.worstSleepDay && (
              <InsightCard
                icon="😴" color="#818cf8" tag="WEEKLY"
                title={`Best sleep: ${a.bestSleepDay.day} · Worst: ${a.worstSleepDay?.day}`}
                finding={`You sleep best on ${a.bestSleepDay.day} (avg ${a.bestSleepDay.avgSleep?.toFixed(0)}) and worst on ${a.worstSleepDay?.day} (avg ${a.worstSleepDay?.avgSleep?.toFixed(0)}). If this is consistent, protect your ${a.worstSleepDay?.day} bedtime routine.`}
              />
            )}
            {a.bestReadinessDay && (
              <InsightCard
                icon="⚡" color="#34d399" tag="WEEKLY"
                title={`Highest readiness: ${a.bestReadinessDay.day}`}
                finding={`${a.bestReadinessDay.day} is consistently your highest readiness day (avg ${a.bestReadinessDay.avgReadiness?.toFixed(0)}). This is your optimal day for high-intensity sessions or races.`}
              />
            )}

            {/* HRV trend */}
            {a.hrvTrend.length >= 7 && (
              <>
                <SectionTitle icon="📈" title="HRV 30-Day Trend" sub="Higher is generally better — shows recovery capacity" />
                <div style={{ background: "rgba(15,23,42,0.5)", border: "1px solid rgba(167,139,250,0.15)", borderRadius: 14, padding: "16px 20px", marginBottom: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <div style={{ fontSize: 12, color: "#94a3b8" }}>HRV (ms)</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: "#a78bfa" }}>{a.latestHRV} <span style={{ fontSize: 11, color: "#475569" }}>ms</span></div>
                  </div>
                  <Sparkline data={a.hrvTrend} color="#a78bfa" height={48} showDots />
                </div>
              </>
            )}

            {/* RHR trend */}
            {a.rhrTrend.length >= 7 && (
              <>
                <SectionTitle icon="❤️" title="Resting HR 60-Day Trend" sub="Lower = stronger aerobic base" />
                <div style={{ background: "rgba(15,23,42,0.5)", border: "1px solid rgba(248,113,113,0.15)", borderRadius: 14, padding: "16px 20px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <div style={{ fontSize: 12, color: "#94a3b8" }}>RHR (bpm)</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: "#f87171" }}>{a.avgRHR} <span style={{ fontSize: 11, color: "#475569" }}>bpm avg</span></div>
                  </div>
                  <Sparkline data={a.rhrTrend} color="#f87171" height={48} showDots />
                </div>
              </>
            )}
          </>
        )}

        {/* ═══ CORRELATIONS ═══ */}
        {tab === "correlations" && (
          <>
            <div style={{ background: "rgba(99,102,241,0.07)", border: "1px solid rgba(99,102,241,0.15)", borderRadius: 12, padding: "12px 14px", marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: "#818cf8", lineHeight: 1.6 }}>
                <strong>How to read this:</strong> Pearson r values show linear correlation strength. +1.0 = perfect positive, −1.0 = perfect negative, 0 = no relationship. Lag correlations show how today predicts tomorrow.
              </div>
            </div>

            <SectionTitle icon="💤→⚡" title="Sleep & Recovery" sub="How sleep quality drives next-day performance" />
            <div style={{ background: "rgba(15,23,42,0.5)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: "16px", marginBottom: 16 }}>
              <CorrRow a="Sleep score" b="Readiness score" r={a.corr_sleep_readiness} />
              <CorrRow a="HRV average" b="Readiness score" r={a.corr_hrv_readiness} />
              <CorrRow a="Body Battery peak" b="Readiness score" r={a.corr_bb_readiness} />
            </div>

            <SectionTitle icon="⏰→💤" title="Day Behaviour → Next Night" sub="How what you do today affects tonight's sleep" />
            <div style={{ background: "rgba(15,23,42,0.5)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: "16px", marginBottom: 16 }}>
              <CorrRow a="Daily stress" b="Sleep score (same night)" r={a.corr_stress_sleep} />
              <CorrRow a="Body Battery peak" b="Sleep score (next night)" r={a.lag_bb_sleep} lagLabel="lag +1" />
              <CorrRow a="Training load" b="Readiness (next day)" r={a.lag_load_readiness} lagLabel="lag +1" />
            </div>

            <SectionTitle icon="🏃→📈" title="Training → Fitness" sub="How training drives long-term adaptations" />
            <div style={{ background: "rgba(15,23,42,0.5)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: "16px", marginBottom: 16 }}>
              <CorrRow a="Chronic training load (CTL)" b="VO2max" r={a.corr_load_vo2} />
              <CorrRow a="Daily steps" b="Body Battery high" r={a.corr_steps_bb} />
            </div>

            <SectionTitle icon="😤→🫀" title="Stress → Recovery Chain" sub="How stress cascades through your system" />
            <div style={{ background: "rgba(15,23,42,0.5)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: "16px", marginBottom: 16 }}>
              <CorrRow a="Daily stress" b="Sleep score" r={a.corr_stress_sleep} />
              <CorrRow a="Sleep score" b="Next-day stress" r={a.lag_sleep_stress} lagLabel="lag +1" />
              <CorrRow a="Daily stress" b="Next-day HRV" r={a.lag_stress_hrv} lagLabel="lag +1" />
            </div>

            <div style={{ background: "rgba(15,23,42,0.4)", border: "1px solid rgba(255,255,255,0.04)", borderRadius: 12, padding: "14px 16px", marginTop: 8 }}>
              <div style={{ fontSize: 11, color: "#334155", lineHeight: 1.7 }}>
                Correlations are calculated from all available paired data points. Minimum 5 pairs required to show a value. More data = more reliable patterns.
              </div>
            </div>
          </>
        )}

      </div>
    </div>
  );
}

const pageStyle = {
  minHeight: "100vh",
  padding: "calc(env(safe-area-inset-top) + 24px) 20px 140px",
  maxWidth: 480,
  margin: "0 auto",
  color: "#f1f5f9",
  fontFamily: "system-ui, -apple-system, sans-serif",
};