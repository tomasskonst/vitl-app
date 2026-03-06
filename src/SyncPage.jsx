import { useState, useCallback, useRef, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import JSZip from "jszip";

// ── Supabase ────────────────────────────────────────────────────────────────
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// ── Helpers ─────────────────────────────────────────────────────────────────
const epochToDate = (ms) => {
  if (!ms) return null;
  const d = new Date(typeof ms === "number" ? ms : Date.parse(ms));
  return d.toISOString().split("T")[0];
};

const secsToTime = (s) => {
  if (!s) return null;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
};

const bedtimeHour = (isoStr) => {
  if (!isoStr) return null;
  // convert GMT timestamp to local hour (approximate — use local offset)
  const d = new Date(isoStr.replace(".0", "Z"));
  return d.getUTCHours() + d.getUTCMinutes() / 60;
};

const getStatValue = (statList, type) =>
  statList?.find((s) => s.bodyBatteryStatType === type)?.statsValue ?? null;

const getStress = (aggregatorList, type) =>
  aggregatorList?.find((s) => s.type === type) ?? null;

// ── Parsers ──────────────────────────────────────────────────────────────────

function parseSleep(records) {
  return records.map((r) => {
    const spo2 = r.spo2SleepSummary || null;
    return {
      id: r.calendarDate,
      calendar_date: r.calendarDate,
      sleep_start_gmt: r.sleepStartTimestampGMT?.replace(".0", "Z") || null,
      sleep_end_gmt: r.sleepEndTimestampGMT?.replace(".0", "Z") || null,
      bedtime_hour: bedtimeHour(r.sleepStartTimestampGMT),
      sleep_total_min: r.deepSleepSeconds != null
        ? Math.round((r.deepSleepSeconds + r.lightSleepSeconds + r.remSleepSeconds + r.awakeSleepSeconds) / 60)
        : null,
      sleep_deep_min: r.deepSleepSeconds != null ? Math.round(r.deepSleepSeconds / 60) : null,
      sleep_light_min: r.lightSleepSeconds != null ? Math.round(r.lightSleepSeconds / 60) : null,
      sleep_rem_min: r.remSleepSeconds != null ? Math.round(r.remSleepSeconds / 60) : null,
      sleep_awake_min: r.awakeSleepSeconds != null ? Math.round(r.awakeSleepSeconds / 60) : null,
      sleep_score: r.sleepScores?.overallScore ?? null,
      sleep_quality_score: r.sleepScores?.qualityScore ?? null,
      sleep_duration_score: r.sleepScores?.durationScore ?? null,
      sleep_recovery_score: r.sleepScores?.recoveryScore ?? null,
      sleep_restfulness_score: r.sleepScores?.restfulnessScore ?? null,
      sleep_feedback: r.sleepScores?.feedback ?? null,
      sleep_stress_score: r.avgSleepStress ?? null,
      sleep_respiration: r.averageRespiration ?? null,
      sleep_resp_lowest: r.lowestRespiration ?? null,
      sleep_resp_highest: r.highestRespiration ?? null,
      restless_moments: r.restlessMomentCount ?? null,
      awake_count: r.awakeCount ?? null,
      sleep_spo2_avg: spo2?.averageSPO2 ?? null,
      sleep_spo2_low: spo2?.lowestSPO2 ?? null,
      sleep_avg_hr: spo2?.averageHR ?? null,
      waking_spo2: null,
      skin_temp_delta: null,
    };
  });
}

function parseDaily(records) {
  return records.map((r) => {
    const bb = r.bodyBattery?.bodyBatteryStatList || [];
    const stress = getStress(r.allDayStress?.aggregatorList, "TOTAL");
    const resp = r.respiration || {};
    const charged = r.bodyBattery?.chargedValue ?? null;
    const drained = r.bodyBattery?.drainedValue ?? null;
    return {
      id: r.calendarDate,
      calendar_date: r.calendarDate,
      total_steps: r.totalSteps ?? null,
      step_goal: r.dailyStepGoal ?? null,
      total_distance_m: r.totalDistanceMeters ?? null,
      total_kcal: r.totalKilocalories ?? null,
      active_kcal: r.activeKilocalories ?? null,
      bmr_kcal: r.bmrKilocalories ?? null,
      highly_active_s: r.highlyActiveSeconds ?? null,
      active_s: r.activeSeconds ?? null,
      moderate_intensity_min: r.moderateIntensityMinutes ?? null,
      vigorous_intensity_min: r.vigorousIntensityMinutes ?? null,
      min_hr: r.minHeartRate ?? null,
      max_hr: r.maxHeartRate ?? null,
      resting_hr: r.restingHeartRate ?? null,
      avg_spo2: r.averageSpo2Value ?? null,
      lowest_spo2: r.lowestSpo2Value ?? null,
      waking_respiration: resp.avgWakingRespirationValue ?? null,
      lowest_respiration: resp.lowestRespirationValue ?? null,
      highest_respiration: resp.highestRespirationValue ?? null,
      avg_stress: stress?.averageStressLevel ?? null,
      max_stress: stress?.maxStressLevel ?? null,
      stress_duration_s: stress?.stressDuration ?? null,
      high_stress_duration_s: stress?.highDuration ?? null,
      body_battery_high: getStatValue(bb, "HIGHEST"),
      body_battery_low: getStatValue(bb, "LOWEST"),
      body_battery_latest: getStatValue(bb, "MOSTRECENT"),
      body_battery_charged: charged,
      body_battery_drained: drained,
      body_battery_change: charged != null && drained != null ? charged - drained : null,
      floors_ascended_m: r.floorsAscendedInMeters ?? null,
      floors_descended_m: r.floorsDescendedInMeters ?? null,
    };
  });
}

function parseReadiness(records) {
  return records.map((r) => ({
    id: r.calendarDate,
    calendar_date: r.calendarDate,
    timestamp_gmt: r.timestamp?.replace(".0", "Z") || null,
    score: r.score ?? null,
    level: r.level ?? null,
    feedback_short: r.feedbackShort ?? null,
    feedback_long: r.feedbackLong ?? null,
    hrv_factor_pct: r.hrvFactorPercent ?? null,
    hrv_factor_feedback: r.hrvFactorFeedback ?? null,
    hrv_weekly_avg: r.hrvWeeklyAverage ?? null,
    sleep_score: r.sleepScore ?? null,
    sleep_factor_pct: r.sleepScoreFactorPercent ?? null,
    sleep_factor_feedback: r.sleepScoreFactorFeedback ?? null,
    sleep_history_pct: r.sleepHistoryFactorPercent ?? null,
    sleep_history_feedback: r.sleepHistoryFactorFeedback ?? null,
    recovery_time_min: r.recoveryTime ?? null,
    recovery_time_hrs: r.recoveryTime != null ? Math.round((r.recoveryTime / 60) * 10) / 10 : null,
    recovery_factor_pct: r.recoveryTimeFactorPercent ?? null,
    recovery_factor_feedback: r.recoveryTimeFactorFeedback ?? null,
    stress_factor_pct: r.stressHistoryFactorPercent ?? null,
    stress_factor_feedback: r.stressHistoryFactorFeedback ?? null,
    acwr_factor_pct: r.acwrFactorPercent ?? null,
    acwr_factor_feedback: r.acwrFactorFeedback ?? null,
    acute_load: r.acuteLoad ?? null,
  }));
}

function parseVo2max(maxMetRecords) {
  return maxMetRecords.map((r) => ({
    id: r.calendarDate,
    calendar_date: r.calendarDate,
    sport: r.sport ?? null,
    vo2max: r.vo2MaxValue ?? null,
    max_met: r.maxMet ?? null,
    fitness_age: null,
    rhr_fitness: null,
    lt_speed_ms: null,
    lt_heart_rate: null,
  }));
}

function parseTrainingLoad(records) {
  return records.map((r) => ({
    id: epochToDate(r.calendarDate),
    calendar_date: epochToDate(r.calendarDate),
    atl: r.dailyTrainingLoadAcute ?? null,
    ctl: r.dailyTrainingLoadChronic ?? null,
    acwr_ratio: r.dailyAcuteChronicWorkloadRatio ?? null,
    acwr_pct: r.acwrPercent ?? null,
    acwr_status: r.acwrStatus ?? null,
    acwr_feedback: r.acwrStatusFeedback ?? null,
  }));
}

function parseRacePredictions(records) {
  // dedupe by date, take latest per date
  const byDate = {};
  for (const r of records) {
    byDate[r.calendarDate] = r;
  }
  return Object.values(byDate).map((r) => ({
    id: r.calendarDate,
    calendar_date: r.calendarDate,
    race_5k_s: r.raceTime5K ?? null,
    race_10k_s: r.raceTime10K ?? null,
    race_half_s: r.raceTimeHalf ?? null,
    race_marathon_s: r.raceTimeMarathon ?? null,
    pred_5k: secsToTime(r.raceTime5K),
    pred_10k: secsToTime(r.raceTime10K),
    pred_half: secsToTime(r.raceTimeHalf),
    pred_marathon: secsToTime(r.raceTimeMarathon),
  }));
}

function parseHillScore(records) {
  return records.map((r) => ({
    id: epochToDate(r.calendarDate),
    calendar_date: epochToDate(r.calendarDate),
    overall_score: r.overallScore ?? null,
    strength_score: r.strengthScore ?? null,
    endurance_score: r.enduranceScore ?? null,
  }));
}

function parseRunTolerance(records) {
  return records.map((r) => ({
    id: r.calendarDate,
    calendar_date: r.calendarDate,
    load: r.acuteImpactLoad ?? null,
    ceiling: r.acuteTolerance ?? null,
    distance_m: r.acuteDistance ?? null,
    status: r.runningToleranceFeedBackPhrase ?? null,
  }));
}

function parseActivities(summarizedExport) {
  const activities = [];
  const byDate = {};

  for (const a of summarizedExport) {
    const date = epochToDate(a.beginTimestamp || a.startTimeGmt);
    if (!date) continue;

    const totalZone = (a.hrTimeInZone_0 || 0) + (a.hrTimeInZone_1 || 0) +
      (a.hrTimeInZone_2 || 0) + (a.hrTimeInZone_3 || 0) +
      (a.hrTimeInZone_4 || 0) + (a.hrTimeInZone_5 || 0) || 1;

    const pct = (v) => v != null ? Math.round((v / totalZone) * 1000) / 10 : null;

    activities.push({
      id: String(a.activityId),
      calendar_date: date,
      start_time_gmt: a.startTimeGmt ? new Date(a.startTimeGmt).toISOString() : null,
      name: a.name ?? null,
      activity_type: a.activityType ?? null,
      sport_type: a.sportType ?? null,
      duration_s: a.duration != null ? a.duration / 1000 : null,
      elapsed_duration_s: a.elapsedDuration != null ? a.elapsedDuration / 1000 : null,
      moving_duration_s: a.movingDuration != null ? a.movingDuration / 1000 : null,
      distance_m: a.distance ?? null,
      avg_speed_ms: a.avgSpeed ?? null,
      max_speed_ms: a.maxSpeed ?? null,
      avg_hr: a.avgHr ?? null,
      max_hr: a.maxHr ?? null,
      min_hr: a.minHr ?? null,
      calories: a.calories ?? null,
      training_load: a.activityTrainingLoad ?? null,
      aerobic_te: a.aerobicTrainingEffect ?? null,
      anaerobic_te: a.anaerobicTrainingEffect ?? null,
      te_label: a.trainingEffectLabel ?? null,
      moderate_intensity_min: a.moderateIntensityMinutes ?? null,
      vigorous_intensity_min: a.vigorousIntensityMinutes ?? null,
      hr_zone_0_s: a.hrTimeInZone_0 ?? null,
      hr_zone_1_s: a.hrTimeInZone_1 ?? null,
      hr_zone_2_s: a.hrTimeInZone_2 ?? null,
      hr_zone_3_s: a.hrTimeInZone_3 ?? null,
      hr_zone_4_s: a.hrTimeInZone_4 ?? null,
      hr_zone_5_s: a.hrTimeInZone_5 ?? null,
      hr_zone_0_pct: pct(a.hrTimeInZone_0),
      hr_zone_1_pct: pct(a.hrTimeInZone_1),
      hr_zone_2_pct: pct(a.hrTimeInZone_2),
      hr_zone_3_pct: pct(a.hrTimeInZone_3),
      hr_zone_4_pct: pct(a.hrTimeInZone_4),
      hr_zone_5_pct: pct(a.hrTimeInZone_5),
    });

    // accumulate for daily summary
    if (!byDate[date]) byDate[date] = [];
    byDate[date].push(a);
  }

  // build daily summaries
  const dailySummaries = Object.entries(byDate).map(([date, acts]) => {
    const runs = acts.filter((a) => a.sportType === "RUNNING");
    const totalDurationMs = acts.reduce((s, a) => s + (a.duration || 0), 0);
    const totalDistanceM = acts.reduce((s, a) => s + (a.distance || 0), 0);
    const totalLoad = acts.reduce((s, a) => s + (a.activityTrainingLoad || 0), 0);
    const runDistM = runs.reduce((s, a) => s + (a.distance || 0), 0);
    const totalHrWeight = acts.reduce((s, a) => s + (a.avgHr || 0) * (a.duration || 0), 0);
    const totalDurForHr = acts.reduce((s, a) => s + (a.avgHr ? a.duration || 0 : 0), 0);

    const totalZone = acts.reduce((s, a) =>
      s + (a.hrTimeInZone_0 || 0) + (a.hrTimeInZone_1 || 0) +
      (a.hrTimeInZone_2 || 0) + (a.hrTimeInZone_3 || 0) +
      (a.hrTimeInZone_4 || 0) + (a.hrTimeInZone_5 || 0), 0) || 1;

    const sumZone = (z) => acts.reduce((s, a) => s + (a[z] || 0), 0);
    const pct = (v) => Math.round((v / totalZone) * 1000) / 10;

    return {
      id: date,
      calendar_date: date,
      activity_count: acts.length,
      activity_types: [...new Set(acts.map((a) => a.sportType).filter(Boolean))],
      total_duration_min: Math.round(totalDurationMs / 60000 * 10) / 10,
      total_distance_km: Math.round(totalDistanceM / 100) / 10,
      total_training_load: Math.round(totalLoad * 10) / 10,
      run_distance_km: Math.round(runDistM / 100) / 10,
      avg_hr: totalDurForHr > 0 ? Math.round(totalHrWeight / totalDurForHr) : null,
      body_battery_change: null, // filled from garmin_daily join if needed
      hr_zone_0_pct: pct(sumZone("hrTimeInZone_0")),
      hr_zone_1_pct: pct(sumZone("hrTimeInZone_1")),
      hr_zone_2_pct: pct(sumZone("hrTimeInZone_2")),
      hr_zone_3_pct: pct(sumZone("hrTimeInZone_3")),
      hr_zone_4_pct: pct(sumZone("hrTimeInZone_4")),
      hr_zone_5_pct: pct(sumZone("hrTimeInZone_5")),
    };
  });

  return { activities, dailySummaries };
}

// ── Main ZIP parser ──────────────────────────────────────────────────────────
async function parseGarminZip(file, onProgress) {
  const zip = await JSZip.loadAsync(file);
  const result = {
    sleep: [], daily: [], readiness: [], vo2max: [],
    trainingLoad: [], racePredictions: [], hillScore: [],
    runTolerance: [], activities: [], dailySummaries: [],
  };

  // helper: load JSON from zip entry
  const loadJson = async (entry) => {
    try {
      const text = await entry.async("string");
      return JSON.parse(text);
    } catch { return null; }
  };

  // collect all file entries
  const entries = {};
  zip.forEach((path, entry) => { entries[path] = entry; });

  const keys = Object.keys(entries);
  let done = 0;

  const processFile = async (path, entry) => {
    const name = path.split("/").pop();
    const data = await loadJson(entry);
    if (!data) return;

    // Sleep
    if (name.includes("sleepData") && Array.isArray(data)) {
      result.sleep.push(...parseSleep(data));
    }
    // UDS (daily wellness)
    else if (name.startsWith("UDSFile") && Array.isArray(data)) {
      result.daily.push(...parseDaily(data));
    }
    // Training Readiness
    else if (name.startsWith("TrainingReadinessDTO") && Array.isArray(data)) {
      result.readiness.push(...parseReadiness(data));
    }
    // VO2Max / MaxMet
    else if (name.startsWith("MetricsMaxMetData") && Array.isArray(data)) {
      result.vo2max.push(...parseVo2max(data));
    }
    // Training Load
    else if (name.startsWith("MetricsAcuteTrainingLoad") && Array.isArray(data)) {
      result.trainingLoad.push(...parseTrainingLoad(data));
    }
    // Race Predictions
    else if (name.startsWith("RunRacePredictions") && Array.isArray(data)) {
      result.racePredictions.push(...data); // dedupe later
    }
    // Hill Score
    else if (name.startsWith("HillScore") && Array.isArray(data)) {
      result.hillScore.push(...parseHillScore(data));
    }
    // Running Tolerance
    else if ((name.startsWith("RunningTolerance_") || name.startsWith("RunningToleranceHistory")) && Array.isArray(data)) {
      result.runTolerance.push(...parseRunTolerance(data));
    }
    // Activities
    else if (name.includes("summarizedActivities")) {
      const acts = Array.isArray(data) ? data[0]?.summarizedActivitiesExport : null;
      if (acts) {
        const { activities, dailySummaries } = parseActivities(acts);
        result.activities.push(...activities);
        result.dailySummaries.push(...dailySummaries);
      }
    }

    done++;
    onProgress(Math.round((done / keys.length) * 100));
  };

  await Promise.all(keys.map((k) => processFile(k, entries[k])));

  // Final deduplication and post-processing
  result.racePredictions = parseRacePredictions(result.racePredictions);
  result.sleep = dedupeById(result.sleep);
  result.daily = dedupeById(result.daily);
  result.readiness = dedupeById(result.readiness);
  result.vo2max = dedupeById(result.vo2max);
  result.trainingLoad = dedupeById(result.trainingLoad);
  result.hillScore = dedupeById(result.hillScore);
  result.runTolerance = dedupeById(result.runTolerance);
  result.dailySummaries = dedupeById(result.dailySummaries);

  return result;
}

const dedupeById = (arr) => {
  const seen = new Set();
  return arr.filter((r) => {
    if (!r.id || seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
};

// ── Upsert to Supabase ───────────────────────────────────────────────────────
const TABLES = [
  { key: "sleep", table: "garmin_sleep", label: "Sleep" },
  { key: "daily", table: "garmin_daily", label: "Daily Wellness" },
  { key: "readiness", table: "garmin_readiness", label: "Readiness" },
  { key: "vo2max", table: "garmin_vo2max", label: "VO2Max" },
  { key: "trainingLoad", table: "garmin_training_load", label: "Training Load" },
  { key: "racePredictions", table: "garmin_race_predictions", label: "Race Predictions" },
  { key: "hillScore", table: "garmin_hill_score", label: "Hill Score" },
  { key: "runTolerance", table: "garmin_run_tolerance", label: "Run Tolerance" },
  { key: "activities", table: "garmin_activities", label: "Activities" },
  { key: "dailySummaries", table: "garmin_daily_activity_summary", label: "Daily Summaries" },
];

async function upsertAll(parsed, onProgress) {
  const results = {};
  for (const { key, table, label } of TABLES) {
    const rows = parsed[key];
    if (!rows?.length) {
      results[label] = { count: 0, error: null };
      continue;
    }
    // batch in chunks of 500
    let errors = [];
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const { error } = await supabase.from(table).upsert(chunk, { onConflict: "id" });
      if (error) errors.push(error.message);
    }
    results[label] = { count: rows.length, error: errors[0] || null };
    onProgress(label, rows.length, errors[0] || null);
  }
  return results;
}

// ── UI ───────────────────────────────────────────────────────────────────────
export default function SyncPage() {
  const [phase, setPhase] = useState("idle"); // idle | parsing | preview | uploading | done | error
  const [parseProgress, setParseProgress] = useState(0);
  const [parsed, setParsed] = useState(null);
  const [uploadLog, setUploadLog] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const fileRef = useRef();

  const handleFile = useCallback(async (file) => {
    if (!file?.name.endsWith(".zip")) {
      setErrorMsg("Please upload a Garmin .zip export file.");
      setPhase("error");
      return;
    }
    setPhase("parsing");
    setParseProgress(0);
    setErrorMsg("");
    try {
      const data = await parseGarminZip(file, setParseProgress);
      setParsed(data);
      setPhase("preview");
    } catch (e) {
      setErrorMsg(e.message || "Failed to parse ZIP file.");
      setPhase("error");
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleUpload = async () => {
    if (!parsed) return;
    setPhase("uploading");
    setUploadLog([]);
    await upsertAll(parsed, (label, count, error) => {
      setUploadLog((prev) => [...prev, { label, count, error }]);
    });
    setPhase("done");
  };

  const reset = () => {
    setPhase("idle");
    setParsed(null);
    setUploadLog([]);
    setParseProgress(0);
    setErrorMsg("");
  };

  const totalRows = parsed
    ? Object.values(parsed).reduce((s, arr) => s + (arr?.length || 0), 0)
    : 0;

  const [lastSync, setLastSync] = useState(null);
  useEffect(() => {
    supabase.from("garmin_sleep").select("calendar_date").order("calendar_date", { ascending: false }).limit(1)
      .then(({ data }) => { if (data?.[0]) setLastSync(data[0].calendar_date); });
  }, [phase]);

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div style={styles.headerIcon}>⚡</div>
        <div>
          <div style={styles.headerTitle}>Garmin Sync</div>
          <div style={styles.headerSub}>Import your health data from a Garmin export ZIP</div>
        </div>
      </div>

      {/* IDLE — drop zone */}
      {phase === "idle" && (
        <div
          style={{ ...styles.dropzone, ...(dragOver ? styles.dropzoneActive : {}) }}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".zip"
            style={{ display: "none" }}
            onChange={(e) => handleFile(e.target.files[0])}
          />
          <div style={styles.dropIcon}>📦</div>
          <div style={styles.dropTitle}>Drop your Garmin ZIP here</div>
          <div style={styles.dropSub}>
            Export from <strong>garmin.com/account/profile/data-privacy</strong>
          </div>
          <div style={styles.dropBtn}>Choose File</div>
        </div>
      )}

      {/* PARSING */}
      {phase === "parsing" && (
        <div style={styles.card}>
          <div style={styles.statusTitle}>Parsing files…</div>
          <div style={styles.progressTrack}>
            <div style={{ ...styles.progressFill, width: `${parseProgress}%` }} />
          </div>
          <div style={styles.statusSub}>{parseProgress}% complete</div>
        </div>
      )}

      {/* PREVIEW */}
      {phase === "preview" && parsed && (
        <div style={styles.card}>
          <div style={styles.statusTitle}>Ready to import</div>
          <div style={styles.statusSub}>{totalRows.toLocaleString()} total records found</div>
          <div style={styles.previewGrid}>
            {TABLES.map(({ key, label }) => {
              const count = parsed[key]?.length || 0;
              return (
                <div key={key} style={styles.previewItem}>
                  <div style={styles.previewLabel}>{label}</div>
                  <div style={{ ...styles.previewCount, color: count > 0 ? "#6ee7b7" : "#64748b" }}>
                    {count.toLocaleString()}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={styles.buttonRow}>
            <button style={styles.btnSecondary} onClick={reset}>Cancel</button>
            <button style={styles.btnPrimary} onClick={handleUpload}>
              Upload to Supabase
            </button>
          </div>
        </div>
      )}

      {/* UPLOADING */}
      {phase === "uploading" && (
        <div style={styles.card}>
          <div style={styles.statusTitle}>Uploading…</div>
          <div style={styles.logList}>
            {uploadLog.map((item, i) => (
              <div key={i} style={styles.logItem}>
                <span style={styles.logLabel}>{item.label}</span>
                {item.error
                  ? <span style={styles.logError}>✗ {item.error}</span>
                  : <span style={styles.logOk}>✓ {item.count.toLocaleString()} rows</span>
                }
              </div>
            ))}
            <div style={styles.logSpinner}>Syncing…</div>
          </div>
        </div>
      )}

      {/* DONE */}
      {phase === "done" && (
        <div style={styles.card}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
          <div style={styles.statusTitle}>Sync complete</div>
          <div style={styles.logList}>
            {uploadLog.map((item, i) => (
              <div key={i} style={styles.logItem}>
                <span style={styles.logLabel}>{item.label}</span>
                {item.error
                  ? <span style={styles.logError}>✗ {item.error}</span>
                  : <span style={styles.logOk}>✓ {item.count.toLocaleString()} rows</span>
                }
              </div>
            ))}
          </div>
          <button style={styles.btnPrimary} onClick={reset}>Sync Another File</button>
        </div>
      )}

      {/* ERROR */}
      {phase === "error" && (
        <div style={styles.card}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>⚠️</div>
          <div style={styles.statusTitle}>Something went wrong</div>
          <div style={styles.statusSub}>{errorMsg}</div>
          <button style={styles.btnPrimary} onClick={reset}>Try Again</button>
        </div>
      )}

      {/* Instructions */}
      {phase === "idle" && (
        <div style={styles.instructions}>
          <div style={styles.instrTitle}>How to export from Garmin</div>
          <div style={styles.instrStep}><span style={styles.instrNum}>1</span> Go to garmin.com and sign in</div>
          <div style={styles.instrStep}><span style={styles.instrNum}>2</span> Account → Privacy → Export Your Data</div>
          <div style={styles.instrStep}><span style={styles.instrNum}>3</span> Request export and wait for email (~1 hour)</div>
          <div style={styles.instrStep}><span style={styles.instrNum}>4</span> Download and drag the ZIP here</div>
          <div style={styles.instrNote}>
            Imports: sleep, daily wellness, readiness, VO2max, training load, race predictions, hill scores, running tolerance, and activities.
          </div>
        </div>
      )}

    {lastSync && (
      <div style={{ textAlign: "center", marginTop: 24, fontSize: 12, color: "#475569" }}>
        Last synced data: <span style={{ color: "#6366f1", fontWeight: 600 }}>{lastSync}</span>
      </div>
    )}
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────
const styles = {
  page: {
    minHeight: "100vh",
    background: "transparent",
    padding: "calc(env(safe-area-inset-top) + 48px) 20px 120px",
    color: "#f1f5f9",
    fontFamily: "'Inter', sans-serif",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    marginBottom: 28,
  },
  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    background: "rgba(99,102,241,0.2)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 22,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 700,
    color: "#f1f5f9",
    letterSpacing: "-0.3px",
  },
  headerSub: {
    fontSize: 13,
    color: "#94a3b8",
    marginTop: 2,
  },
  dropzone: {
    border: "2px dashed rgba(99,102,241,0.35)",
    borderRadius: 20,
    padding: "48px 24px",
    textAlign: "center",
    cursor: "pointer",
    background: "rgba(15,23,42,0.6)",
    transition: "all 0.2s",
  },
  dropzoneActive: {
    border: "2px dashed rgba(99,102,241,0.8)",
    background: "rgba(99,102,241,0.08)",
  },
  dropIcon: { fontSize: 48, marginBottom: 14 },
  dropTitle: { fontSize: 18, fontWeight: 600, marginBottom: 8, color: "#e2e8f0" },
  dropSub: { fontSize: 13, color: "#64748b", marginBottom: 20 },
  dropBtn: {
    display: "inline-block",
    background: "rgba(99,102,241,0.15)",
    border: "1px solid rgba(99,102,241,0.4)",
    color: "#818cf8",
    padding: "10px 24px",
    borderRadius: 10,
    fontSize: 14,
    fontWeight: 600,
  },
  card: {
    background: "rgba(15,23,42,0.7)",
    border: "1px solid rgba(99,102,241,0.2)",
    borderRadius: 20,
    padding: "32px 24px",
    textAlign: "center",
  },
  statusTitle: {
    fontSize: 20,
    fontWeight: 700,
    marginBottom: 8,
    color: "#f1f5f9",
  },
  statusSub: {
    fontSize: 14,
    color: "#94a3b8",
    marginBottom: 24,
  },
  progressTrack: {
    height: 6,
    background: "rgba(99,102,241,0.15)",
    borderRadius: 99,
    overflow: "hidden",
    margin: "16px 0",
  },
  progressFill: {
    height: "100%",
    background: "linear-gradient(90deg, #6366f1, #818cf8)",
    borderRadius: 99,
    transition: "width 0.15s ease",
  },
  previewGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
    margin: "20px 0 28px",
    textAlign: "left",
  },
  previewItem: {
    background: "rgba(99,102,241,0.06)",
    border: "1px solid rgba(99,102,241,0.12)",
    borderRadius: 10,
    padding: "10px 14px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  previewLabel: { fontSize: 13, color: "#94a3b8" },
  previewCount: { fontSize: 15, fontWeight: 700 },
  buttonRow: {
    display: "flex",
    gap: 12,
    justifyContent: "center",
  },
  btnPrimary: {
    background: "linear-gradient(135deg, #6366f1, #818cf8)",
    border: "none",
    color: "#fff",
    padding: "12px 28px",
    borderRadius: 12,
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
  },
  btnSecondary: {
    background: "rgba(99,102,241,0.1)",
    border: "1px solid rgba(99,102,241,0.25)",
    color: "#818cf8",
    padding: "12px 28px",
    borderRadius: 12,
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
  },
  logList: {
    textAlign: "left",
    margin: "16px 0 24px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  logItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "8px 14px",
    background: "rgba(99,102,241,0.06)",
    borderRadius: 8,
    fontSize: 14,
  },
  logLabel: { color: "#94a3b8" },
  logOk: { color: "#6ee7b7", fontWeight: 600, fontSize: 13 },
  logError: { color: "#f87171", fontWeight: 600, fontSize: 13 },
  logSpinner: {
    textAlign: "center",
    color: "#64748b",
    fontSize: 13,
    padding: "8px 0",
    animation: "pulse 1.5s infinite",
  },
  instructions: {
    marginTop: 28,
    background: "rgba(15,23,42,0.5)",
    border: "1px solid rgba(99,102,241,0.12)",
    borderRadius: 16,
    padding: "20px 20px",
  },
  instrTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: "#6366f1",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    marginBottom: 14,
  },
  instrStep: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    fontSize: 14,
    color: "#94a3b8",
    marginBottom: 10,
  },
  instrNum: {
    width: 22,
    height: 22,
    borderRadius: "50%",
    background: "rgba(99,102,241,0.2)",
    color: "#818cf8",
    fontSize: 12,
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  instrNote: {
    marginTop: 14,
    fontSize: 12,
    color: "#475569",
    lineHeight: 1.6,
    borderTop: "1px solid rgba(99,102,241,0.1)",
    paddingTop: 12,
  },
};