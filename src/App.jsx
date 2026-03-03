import { useState, useRef, useEffect } from "react";
import { supabase } from "./supabase";

const API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY || "";

const today = () => new Date().toISOString().split("T")[0];
const fmt = (d) => new Date(d + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });

const NUTRITION_PROMPT = `{
  "meal_name": "specific name of the meal",
  "calories": number,
  "protein_g": number,
  "carbs_g": number,
  "fat_g": number,
  "fibre_g": number,
  "sugar_g": number,
  "saturated_fat_g": number,
  "trans_fat_g": number,
  "cholesterol_mg": number,
  "sodium_mg": number,
  "potassium_mg": number,
  "calcium_mg": number,
  "iron_mg": number,
  "magnesium_mg": number,
  "phosphorus_mg": number,
  "zinc_mg": number,
  "vitamin_a_ug": number,
  "vitamin_c_mg": number,
  "vitamin_d_ug": number,
  "vitamin_e_mg": number,
  "vitamin_k_ug": number,
  "vitamin_b12_ug": number,
  "vitamin_b6_mg": number,
  "folate_ug": number,
  "confidence_score": number 1-100,
  "quality_score": number 1-10,
  "quality_label": "Excellent or Good or Average or Poor",
  "main_ingredients": ["item1","item2","item3"],
  "notes": "one sentence about nutritional value and suggestions"
}`;

const WOL_DIMS = [
  { key: "health",    label: "Health & Fitness",  icon: "🏃" },
  { key: "career",    label: "Career & Growth",    icon: "💼" },
  { key: "money",     label: "Money & Finance",    icon: "💰" },
  { key: "fun",       label: "Fun & Recreation",   icon: "🎉" },
  { key: "env",       label: "Environment",        icon: "🏡" },
  { key: "community", label: "Community",          icon: "🤝" },
  { key: "family",    label: "Family & Friends",   icon: "👨‍👩‍👧" },
  { key: "love",      label: "Partners & Love",    icon: "❤️" },
  { key: "growth",    label: "Growth & Learning",  icon: "📚" },
  { key: "spirit",    label: "Spirituality",       icon: "✨" },
];

const MOOD_PERIODS = ["Morning", "Afternoon", "Evening"];

const getCurrentPeriod = () => {
  const h = new Date().getHours();
  if (h >= 6  && h < 12) return "Morning";
  if (h >= 12 && h < 18) return "Afternoon";
  return "Evening";
};

const getNextPeriodTime = () => {
  const h = new Date().getHours();
  if (h >= 6  && h < 12) return "12:00";
  if (h >= 12 && h < 18) return "18:00";
  return "06:00";
};

const getCurrentWeekMonday = () => {
  const d = new Date();
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1 - day);
  d.setDate(d.getDate() + diff);
  return d.toISOString().split("T")[0];
};

const formatWeekRange = (mondayStr) => {
  const mon = new Date(mondayStr + "T12:00:00");
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const opts = { day: "numeric", month: "short" };
  return `${mon.toLocaleDateString("en-GB", opts)} – ${sun.toLocaleDateString("en-GB", opts)}`;
};

const scoreColor = (v) => {
  if (v >= 8) return "#4ade80";
  if (v >= 6) return "#facc15";
  if (v >= 4) return "#fb923c";
  return "#f87171";
};

const scoreBg = (v) => {
  if (v >= 8) return "rgba(74,222,128,0.12)";
  if (v >= 6) return "rgba(250,204,21,0.12)";
  if (v >= 4) return "rgba(251,146,60,0.12)";
  return "rgba(248,113,113,0.12)";
};

// ── Supabase helpers ─────────────────────────────────────────────────────────

const loadAllData = async () => {
  const [{ data: moodData }, { data: journalData }, { data: wolData }, { data: foodData }] = await Promise.all([
    supabase.from("mood_logs").select("*").order("date", { ascending: false }),
    supabase.from("journal_logs").select("*").order("date", { ascending: false }),
    supabase.from("wol_logs").select("*").order("week_key", { ascending: false }),
    supabase.from("food_logs").select("*").order("date", { ascending: false }),
  ]);
  return {
    moodLogs:    moodData    || [],
    journalLogs: journalData || [],
    wolLogs:     wolData     || [],
    foodLogs:    foodData    || [],
  };
};

const saveMoodLog = async (log) => {
  const { error } = await supabase.from("mood_logs").upsert({
    id:     log.id,
    date:   log.date,
    time:   log.time,
    period: log.period,
    mood:   log.mood,
    energy: log.energy,
    stress: log.stress,
    notes:  log.notes,
  });
  if (error) console.error("Error saving mood log:", error);
};

const saveJournalLog = async (log) => {
  const { error } = await supabase.from("journal_logs").upsert({
    id:          log.id,
    date:        log.date,
    time:        log.time,
    work_hours:  log.work_hours,
    sleep_hours: log.sleep_hours,
    social:      log.social,
    notes:       log.notes,
  });
  if (error) console.error("Error saving journal log:", error);
};

const saveWolLog = async (log) => {
  const { error } = await supabase.from("wol_logs").upsert({
    id:        log.id,
    week_key:  log.week_key,
    time:      log.time,
    health:    log.health,
    career:    log.career,
    money:     log.money,
    fun:       log.fun,
    env:       log.env,
    community: log.community,
    family:    log.family,
    love:      log.love,
    growth:    log.growth,
    spirit:    log.spirit,
    wol_avg:   log.wol_avg,
  });
  if (error) console.error("Error saving WOL log:", error);
};

const saveFoodLog = async (log) => {
  const { error } = await supabase.from("food_logs").upsert({
    id:               log.id,
    date:             log.date,
    time:             log.time,
    meal_name:        log.meal_name,
    calories:         log.calories,
    protein_g:        log.protein_g,
    carbs_g:          log.carbs_g,
    fat_g:            log.fat_g,
    fibre_g:          log.fibre_g,
    sugar_g:          log.sugar_g,
    saturated_fat_g:  log.saturated_fat_g,
    trans_fat_g:      log.trans_fat_g,
    cholesterol_mg:   log.cholesterol_mg,
    sodium_mg:        log.sodium_mg,
    potassium_mg:     log.potassium_mg,
    calcium_mg:       log.calcium_mg,
    iron_mg:          log.iron_mg,
    magnesium_mg:     log.magnesium_mg,
    phosphorus_mg:    log.phosphorus_mg,
    zinc_mg:          log.zinc_mg,
    vitamin_a_ug:     log.vitamin_a_ug,
    vitamin_c_mg:     log.vitamin_c_mg,
    vitamin_d_ug:     log.vitamin_d_ug,
    vitamin_e_mg:     log.vitamin_e_mg,
    vitamin_k_ug:     log.vitamin_k_ug,
    vitamin_b12_ug:   log.vitamin_b12_ug,
    vitamin_b6_mg:    log.vitamin_b6_mg,
    folate_ug:        log.folate_ug,
    confidence_score: log.confidence_score,
    quality_score:    log.quality_score,
    quality_label:    log.quality_label,
    main_ingredients: log.main_ingredients,
    notes:            log.notes,
    image:            log.image,
  });
  if (error) console.error("Error saving food log:", error);
};

// ── Slider ───────────────────────────────────────────────────────────────────
function Slider({ value, onChange, min = 1, max = 10, step = 0.5, color }) {
  const pct = ((value - min) / (max - min)) * 100;
  const c = color || scoreColor(value);
  return (
    <div style={{ position: "relative", padding: "8px 0" }}>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{
          width: "100%", appearance: "none", height: 4, borderRadius: 2,
          background: `linear-gradient(to right, ${c} ${pct}%, rgba(255,255,255,0.1) ${pct}%)`,
          outline: "none", cursor: "pointer",
        }}
      />
      <style>{`
        input[type=range]::-webkit-slider-thumb {
          appearance:none; width:20px; height:20px; border-radius:50%;
          background:${c}; border:2px solid #1a1a2e; cursor:pointer;
          box-shadow:0 0 8px ${c}88;
        }
      `}</style>
    </div>
  );
}

// ── AuraSlider (for Journal) ─────────────────────────────────────────────────
function AuraSlider({ value, onChange, min = 0, max = 16, step = 0.5, accentColor = "#92400e", sliderKey = "s" }) {
  const pct = ((value - min) / (max - min)) * 100;
  const cls = `aslider-${sliderKey}`;
  return (
    <div style={{ position: "relative", padding: "10px 0" }}>
      <style>{`
        .${cls} { -webkit-appearance: none; appearance: none; width: 100%; height: 4px; border-radius: 4px; outline: none; cursor: pointer; background: linear-gradient(to right, ${accentColor} ${pct}%, rgba(30,10,0,0.15) ${pct}%); }
        .${cls}::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 30px; height: 30px; border-radius: 50%; background: rgba(255,255,255,0.5); backdrop-filter: blur(20px); border: 1.5px solid rgba(255,255,255,0.8); box-shadow: 0 2px 12px rgba(0,0,0,0.2); cursor: grab; opacity: 0; transition: opacity 0.18s, transform 0.15s; }
        .${cls}:hover::-webkit-slider-thumb, .${cls}:active::-webkit-slider-thumb { opacity: 1; transform: scale(1.1); }
        .${cls}:active::-webkit-slider-thumb { cursor: grabbing; }
      `}</style>
      <input type="range" min={min} max={max} step={step} value={value} className={cls} onChange={(e) => onChange(parseFloat(e.target.value))} />
    </div>
  );
}

function GlassCard({ children, style = {} }) {
  return (
    <div style={{
      background: "rgba(200,190,185,0.28)",
      backdropFilter: "blur(50px) saturate(160%) brightness(1.08)",
      WebkitBackdropFilter: "blur(50px) saturate(160%) brightness(1.08)",
      borderRadius: 20, border: "0.5px solid rgba(255,255,255,0.28)",
      boxShadow: "0 2px 12px rgba(0,0,0,0.08)", padding: "16px 18px", marginBottom: 10,
      ...style,
    }}>{children}</div>
  );
}

// ── Home Page ────────────────────────────────────────────────────────────────
function HomePage({ moodLogs, journalLogs, foodLogs, wolLogs, setPage }) {
  const latestMood    = moodLogs[0];
  const latestJournal = journalLogs[0];
  const todayMoods    = moodLogs.filter(l => l.date === today());

  const fitnessScore = latestMood
    ? ((latestMood.energy || 5) * 10).toFixed(2) : "—";
  const sleepScore = latestJournal
    ? Math.min(100, ((latestJournal.sleep_hours || 7) / 9 * 100)).toFixed(2) : "—";
  const nutritionScore = foodLogs.length
    ? (foodLogs.slice(0, 7).reduce((a, b) => a + (b.quality_score || 5), 0) / Math.min(7, foodLogs.length) * 10).toFixed(2) : "—";
  const socialScore = latestJournal
    ? (latestJournal.social ? 85 : 55).toFixed(2) : "—";

  const validScores = [fitnessScore, sleepScore, nutritionScore, socialScore].filter(s => s !== "—").map(parseFloat);
  const overallScore = validScores.length >= 2
    ? (validScores.reduce((a, b) => a + b, 0) / validScores.length).toFixed(2) : null;

  const challenges = [
    { label: "Daily 30-minute walk from 18:00-20:00", daysLeft: 2, totalDays: 7 },
    { label: "Increasing magnesium by 50g for 2 months", daysLeft: 28, totalDays: 60 },
  ];

  const insights = [];
  if (foodLogs.length > 0) {
    const lastMeal = foodLogs[0];
    if (lastMeal.calories > 700) insights.push("Your heavy meal last night decreased your deep sleep by 25%");
    if (lastMeal.carbs_g > 60)   insights.push("Excess carbs at lunch increased your running pace by 0.5sec/km");
  }
  if (insights.length === 0) {
    insights.push("Log your meals and check-ins to unlock personalised daily insights");
    insights.push("Complete your first check-in to see how sleep affects your mood");
  }

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "GOOD MORNING";
    if (h < 17) return "GOOD AFTERNOON";
    return "GOOD EVENING";
  };

  const hasCheckedInToday = todayMoods.length > 0;

  return (
    <div style={{ minHeight: "100vh", position: "relative" }}>
      <div style={{
        position: "absolute", inset: 0, zIndex: 0,
        background: "radial-gradient(ellipse 120% 60% at 50% -10%, #1a3a8f 0%, #0d1b4d 35%, #0d0d18 70%)",
      }} />
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 320, zIndex: 0,
        background: "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(59,130,246,0.35) 0%, transparent 70%)",
      }} />

      <div style={{ position: "relative", zIndex: 1, padding: "calc(env(safe-area-inset-top) + 28px) 20px 180px" }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 3, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", marginBottom: 6 }}>
            {greeting()}
          </div>
          <div style={{ fontSize: 32, fontWeight: 900, color: "#fff", lineHeight: 1.1, letterSpacing: -1, textTransform: "uppercase" }}>
            WELCOME<br />BACK TO<br /><span style={{ color: "#7eb3ff" }}>FUNDAMENTALS</span>
          </div>
        </div>

        <div style={{
          background: "rgba(255,255,255,0.07)", backdropFilter: "blur(20px)",
          borderRadius: 24, padding: "24px",
          border: "1px solid rgba(255,255,255,0.12)", marginBottom: 16, textAlign: "center",
        }}>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 8, letterSpacing: 1 }}>Your overall wellness score</div>
          <div style={{ fontSize: 56, fontWeight: 900, letterSpacing: -2, color: "#fff", textShadow: "0 0 40px rgba(126,179,255,0.4)" }}>
            {overallScore ?? "—"}
          </div>
          {!overallScore && (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 8 }}>Complete a check-in to see your score</div>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
          {[
            { label: "Fitness score",   value: fitnessScore,   color: "#60a5fa" },
            { label: "Sleep score",     value: sleepScore,     color: "#a78bfa" },
            { label: "Nutrition score", value: nutritionScore, color: "#34d399" },
            { label: "Social score",    value: socialScore,    color: "#f472b6" },
          ].map(s => (
            <div key={s.label} style={{
              background: "rgba(255,255,255,0.06)", backdropFilter: "blur(12px)",
              borderRadius: 16, padding: "14px 10px", border: "1px solid rgba(255,255,255,0.09)",
            }}>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.45)", marginBottom: 8, lineHeight: 1.3 }}>{s.label}</div>
              <div style={{ fontSize: 19, fontWeight: 800, color: "#fff", letterSpacing: -0.5 }}>{s.value}</div>
            </div>
          ))}
        </div>

        <div style={{
          background: "rgba(255,255,255,0.05)", backdropFilter: "blur(12px)",
          borderRadius: 20, padding: "16px", border: "1px solid rgba(255,255,255,0.08)", marginBottom: 16,
        }}>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 12 }}>Daily insight</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {insights.slice(0, 2).map((ins, i) => (
              <div key={i} style={{ background: "rgba(59,130,246,0.2)", borderRadius: 14, padding: "14px 12px", border: "1px solid rgba(59,130,246,0.3)" }}>
                <div style={{ fontSize: 12, color: "#fff", fontWeight: 600, lineHeight: 1.5 }}>{ins}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{
          background: "rgba(255,255,255,0.05)", backdropFilter: "blur(12px)",
          borderRadius: 20, padding: "16px", border: "1px solid rgba(255,255,255,0.08)", marginBottom: 8,
        }}>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 14 }}>Improvement test</div>
          {challenges.map((c, i) => {
            const pct = ((c.totalDays - c.daysLeft) / c.totalDays) * 100;
            return (
              <div key={i} style={{ marginBottom: i < challenges.length - 1 ? 18 : 0 }}>
                <div style={{ height: 6, borderRadius: 3, overflow: "hidden", background: "rgba(255,255,255,0.1)", marginBottom: 8, position: "relative" }}>
                  <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to right, #f87171, #facc15, #4ade80)", borderRadius: 3 }} />
                  <div style={{ position: "absolute", top: 0, bottom: 0, right: 0, width: `${100 - pct}%`, background: "rgba(13,13,24,0.7)", borderRadius: "0 3px 3px 0" }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 12, color: "#fff", fontWeight: 500, flex: 1, marginRight: 12, lineHeight: 1.4 }}>{c.label}</div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#4ade80", whiteSpace: "nowrap", background: "rgba(74,222,128,0.1)", borderRadius: 8, padding: "3px 8px", border: "1px solid rgba(74,222,128,0.2)" }}>
                    {c.daysLeft} days left
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {!hasCheckedInToday && (
          <button onClick={() => setPage("mood")} style={{
            width: "100%", marginTop: 12, padding: "14px", borderRadius: 14, border: "none",
            background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
            color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", letterSpacing: 0.5,
          }}>
            ✦  Complete Today's Mood Check-in
          </button>
        )}
      </div>
    </div>
  );
}

// ── Mood Page ────────────────────────────────────────────────────────────────
function MoodPage({ moodLogs, setMoodLogs }) {
  const currentPeriod = getCurrentPeriod();
  const periodEmoji = { Morning: "🌅", Afternoon: "☀️", Evening: "🌙" };

  const todayLogs = moodLogs.filter(l => l.date === today());
  const savedPeriods = todayLogs.map(l => l.period);
  const isPeriodLocked = savedPeriods.includes(currentPeriod);

  const existingEntry = todayLogs.find(l => l.period === currentPeriod);

  const [mood,   setMood]   = useState(existingEntry?.mood   ?? 5);
  const [energy, setEnergy] = useState(existingEntry?.energy ?? 5);
  const [stress, setStress] = useState(existingEntry?.stress ?? 5);
  const [notes,  setNotes]  = useState(existingEntry?.notes  ?? "");
  const [saved,  setSaved]  = useState(false);
  const [tab,    setTab]    = useState("checkin");

  const stressColor = stress <= 4 ? "#4ade80" : stress <= 6 ? "#facc15" : "#f87171";

  const saveEntry = async () => {
    if (isPeriodLocked) return;
    const log = {
      id:     Date.now(),
      date:   today(),
      time:   new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
      period: currentPeriod,
      mood, energy, stress, notes,
    };
    await saveMoodLog(log);
    setMoodLogs(prev => [log, ...prev]);
    setSaved(true);
  };

  const allLogs = [...moodLogs].sort((a, b) => (b.date + b.period).localeCompare(a.date + a.period));

  // Group by date for history
  const groupedByDate = allLogs.reduce((acc, log) => {
    if (!acc[log.date]) acc[log.date] = {};
    acc[log.date][log.period] = log;
    return acc;
  }, {});

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", paddingTop: "env(safe-area-inset-top)", paddingBottom: 120 }}>
      <div style={{
        display: "flex", gap: 0, background: "rgba(255,255,255,0.04)",
        borderRadius: 12, margin: "20px 20px 0", border: "1px solid rgba(255,255,255,0.06)",
      }}>
        {[{ key: "checkin", label: "Check-in" }, { key: "history", label: "History" }].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            flex: 1, padding: "10px", border: "none", borderRadius: 10,
            background: tab === t.key ? "rgba(99,102,241,0.3)" : "transparent",
            color: tab === t.key ? "#a5b4fc" : "#555",
            fontSize: 13, fontWeight: tab === t.key ? 600 : 400, cursor: "pointer", transition: "all 0.2s",
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "checkin" && (
        <div style={{ padding: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#f0f0f8" }}>Mood Check-in</h2>
              <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>
                {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
              </div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: scoreColor(mood) }}>{mood}</div>
              <div style={{ fontSize: 10, color: "#555" }}>mood</div>
            </div>
          </div>

          {/* Period indicator */}
          <div style={{
            background: isPeriodLocked ? "rgba(255,255,255,0.02)" : "rgba(99,102,241,0.1)",
            borderRadius: 12, padding: "10px 14px", marginBottom: 14,
            border: `1px solid ${isPeriodLocked ? "rgba(255,255,255,0.05)" : "rgba(99,102,241,0.3)"}`,
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <div style={{ fontSize: 13, color: isPeriodLocked ? "#555" : "#a5b4fc", fontWeight: 600 }}>
              {periodEmoji[currentPeriod]} {currentPeriod} check-in
            </div>
            {isPeriodLocked ? (
              <div style={{ fontSize: 12, color: "#555" }}>
                Next at <span style={{ color: "#a5b4fc", fontWeight: 700 }}>{getNextPeriodTime()}</span>
              </div>
            ) : (
              <div style={{ fontSize: 11, color: "#666" }}>Now open</div>
            )}
          </div>

          {/* Completed periods */}
          {savedPeriods.length > 0 && (
            <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
              {MOOD_PERIODS.map(p => savedPeriods.includes(p) && (
                <div key={p} style={{
                  fontSize: 11, padding: "4px 10px", borderRadius: 20,
                  background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.25)", color: "#4ade80",
                }}>
                  {periodEmoji[p]} {p} ✓
                </div>
              ))}
            </div>
          )}

          <div style={{ opacity: isPeriodLocked ? 0.45 : 1, pointerEvents: isPeriodLocked ? "none" : "auto", transition: "opacity 0.3s" }}>
            {/* Mood */}
            <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)", padding: "12px 14px", marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: "#888" }}>{periodEmoji[currentPeriod]} {currentPeriod} Mood</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: scoreColor(mood) }}>{mood}</span>
              </div>
              <Slider value={mood} onChange={setMood} color={scoreColor(mood)} />
            </div>

            {/* Energy */}
            <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)", padding: "12px 14px", marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: "#888" }}>⚡ {currentPeriod} Energy</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: scoreColor(energy) }}>{energy}</span>
              </div>
              <Slider value={energy} onChange={setEnergy} color={scoreColor(energy)} />
            </div>

            {/* Stress */}
            <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)", padding: "12px 14px", marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: "#888" }}>🌊 {currentPeriod} Stress</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: stressColor }}>{stress}</span>
              </div>
              <Slider value={stress} onChange={setStress} color={stressColor} />
            </div>

            <textarea placeholder="Any notes for this period…" value={notes} onChange={e => setNotes(e.target.value)}
              style={{
                width: "100%", minHeight: 70, background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12,
                padding: "12px 14px", color: "#ddd", fontSize: 13, resize: "none",
                outline: "none", boxSizing: "border-box", fontFamily: "inherit", marginBottom: 14,
              }} />
          </div>

          {saved ? (
            <div style={{ textAlign: "center", padding: "14px", background: "rgba(74,222,128,0.1)", borderRadius: 12, color: "#4ade80", fontSize: 14, fontWeight: 600 }}>
              ✓  {currentPeriod} check-in saved!
            </div>
          ) : (
            <button onClick={saveEntry} disabled={isPeriodLocked} style={{
              width: "100%", padding: "14px", borderRadius: 12, border: "none",
              background: isPeriodLocked ? "rgba(99,102,241,0.2)" : "linear-gradient(135deg,#6366f1,#8b5cf6)",
              color: isPeriodLocked ? "#555" : "#fff",
              fontSize: 15, fontWeight: 600, cursor: isPeriodLocked ? "not-allowed" : "pointer",
            }}>
              {isPeriodLocked ? `Next entry at ${getNextPeriodTime()}` : `Save ${currentPeriod} Check-in`}
            </button>
          )}
        </div>
      )}

      {tab === "history" && (
        <div style={{ padding: "20px" }}>
          {Object.keys(groupedByDate).length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 20px", color: "#555" }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>😶</div>
              <div>No mood entries yet. Complete your first check-in!</div>
            </div>
          ) : Object.entries(groupedByDate).map(([date, periods]) => {
            const moodVals = Object.values(periods).map(p => p.mood);
            const avgMood = moodVals.length ? (moodVals.reduce((a, b) => a + b, 0) / moodVals.length).toFixed(1) : null;
            return (
              <div key={date} style={{
                background: "rgba(255,255,255,0.03)", borderRadius: 14,
                border: "1px solid rgba(255,255,255,0.06)", padding: "16px", marginBottom: 12,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#ddd" }}>{fmt(date)}</div>
                  {avgMood && (
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 18, fontWeight: 700, color: scoreColor(parseFloat(avgMood)) }}>{avgMood}</div>
                      <div style={{ fontSize: 9, color: "#555" }}>avg mood</div>
                    </div>
                  )}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                  {MOOD_PERIODS.map(p => {
                    const entry = periods[p];
                    return (
                      <div key={p} style={{
                        background: entry ? scoreBg(entry.mood) : "rgba(255,255,255,0.02)",
                        border: `1px solid ${entry ? scoreColor(entry.mood) + "33" : "rgba(255,255,255,0.04)"}`,
                        borderRadius: 8, padding: "8px 6px", textAlign: "center",
                        opacity: entry ? 1 : 0.35,
                      }}>
                        <div style={{ fontSize: 11, marginBottom: 4 }}>{ { Morning: "🌅", Afternoon: "☀️", Evening: "🌙" }[p] }</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: entry ? scoreColor(entry.mood) : "#444" }}>
                          {entry ? entry.mood : "—"}
                        </div>
                        <div style={{ fontSize: 9, color: "#555", marginTop: 1 }}>{p.slice(0, 3)}</div>
                        {entry && (
                          <div style={{ fontSize: 9, color: "#666", marginTop: 3 }}>
                            ⚡{entry.energy} 🌊{entry.stress}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Journal Page ─────────────────────────────────────────────────────────────
function JournalPage({ journalLogs, setJournalLogs }) {
  const [tab, setTab] = useState("checkin");

  const todayLog = journalLogs.find(l => l.date === today());

  const [workHours,  setWorkHours]  = useState(todayLog?.work_hours  ?? 8);
  const [sleepHours, setSleepHours] = useState(todayLog?.sleep_hours ?? 7.5);
  const [social,     setSocial]     = useState(todayLog?.social      ?? false);
  const [notes,      setNotes]      = useState(todayLog?.notes       ?? "");
  const [saved,      setSaved]      = useState(false);

  const workColor  = workHours  <= 8   ? "#92400e" : workHours  <= 10 ? "#c2410c" : "#991b1b";
  const sleepColor = sleepHours >= 7.5 ? "#92400e" : sleepHours >= 6  ? "#c2410c" : "#991b1b";
  const TP = "rgba(20,6,0,0.88)";
  const TS = "rgba(20,6,0,0.88)";
  const TM = "rgba(20,6,0,0.88)";

  const saveEntry = async () => {
    const log = {
      id:          todayLog?.id ?? Date.now(),
      date:        today(),
      time:        new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
      work_hours:  workHours,
      sleep_hours: sleepHours,
      social,
      notes,
    };
    await saveJournalLog(log);
    setJournalLogs(prev => [log, ...prev.filter(l => l.date !== today())]);
    setSaved(true);
  };

  const sortedLogs = [...journalLogs].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div style={{
      width: "100%", minHeight: "100vh",
      background: "linear-gradient(160deg, #ff6a00 0%, #ee0979 60%, #c0392b 100%)",
      display: "flex", flexDirection: "column",
      fontFamily: "'DM Sans', system-ui, sans-serif",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700&display=swap');
        .j-scroll { overflow-y: auto; flex: 1; min-height: 0; padding-top: env(safe-area-inset-top); }
        .j-scroll::-webkit-scrollbar { display: none; }
        .j-title { font-family: 'DM Serif Display', Georgia, serif; font-size: 38px; color: #fff; letter-spacing: -0.5px; line-height: 1.05; text-shadow: 0 2px 20px rgba(0,0,0,0.3); margin: 0; }
        .j-date-str { font-size: 13px; color: rgba(255,255,255,0.8); margin-top: 4px; font-weight: 400; text-shadow: 0 1px 8px rgba(0,0,0,0.25); }
        .j-tabs { display: flex; gap: 3px; background: rgba(200,190,185,0.28); backdrop-filter: blur(50px) saturate(160%) brightness(1.08); -webkit-backdrop-filter: blur(50px) saturate(160%) brightness(1.08); border-radius: 16px; padding: 3px; border: 0.5px solid rgba(255,255,255,0.25); margin: 18px 20px 0; box-shadow: 0 2px 12px rgba(0,0,0,0.08); }
        .j-tab { flex: 1; padding: 9px; border: none; background: transparent; cursor: pointer; font-size: 13px; border-radius: 13px; font-family: 'DM Sans', system-ui, sans-serif; font-weight: 500; transition: all 0.18s; color: rgba(20,6,0,0.38); }
        .j-tab.active { background: rgba(255,255,255,0.5); color: rgba(20,6,0,0.85); font-weight: 700; box-shadow: 0 1px 4px rgba(0,0,0,0.1); }
        textarea.j-ta { width: 100%; min-height: 110px; background: transparent; border: none; border-bottom: 1.5px solid rgba(20,6,0,0.12); border-radius: 0; padding: 10px 0; color: rgba(20,6,0,0.88); font-size: 15px; resize: none; outline: none; font-family: 'DM Sans', system-ui, sans-serif; line-height: 1.7; }
        textarea.j-ta::placeholder { color: rgba(20,6,0,0.28); }
        .j-save { width: 100%; padding: 15px; border-radius: 18px; border: none; background: rgba(200,190,185,0.3); backdrop-filter: blur(50px) saturate(160%) brightness(1.08); -webkit-backdrop-filter: blur(50px) saturate(160%) brightness(1.08); border: 0.5px solid rgba(255,255,255,0.28); color: rgba(20,6,0,0.82); font-size: 15px; font-weight: 700; cursor: pointer; font-family: 'DM Sans', system-ui, sans-serif; transition: all 0.18s; box-shadow: 0 2px 12px rgba(0,0,0,0.08); }
        .j-save:hover { background: rgba(220,210,205,0.42); }
        .j-save:active { transform: scale(0.985); }
        .j-hcard { border-radius: 20px; border: 0.5px solid rgba(255,255,255,0.28); padding: 16px 18px; margin-bottom: 10px; background: rgba(200,190,185,0.28); backdrop-filter: blur(50px) saturate(160%) brightness(1.08); -webkit-backdrop-filter: blur(50px) saturate(160%) brightness(1.08); box-shadow: 0 2px 12px rgba(0,0,0,0.08); }
        .j-chip { background: rgba(255,255,255,0.2); border-radius: 12px; border: 0.5px solid rgba(255,255,255,0.25); padding: 10px 8px; text-align: center; }
      `}</style>

      <div className="j-scroll">
        <div style={{ position: "relative", zIndex: 1, maxWidth: 480, margin: "0 auto", paddingBottom: 20 }}>
          <div style={{ padding: "48px 22px 0" }}>
            <h2 className="j-title">Journal</h2>
            <div className="j-date-str">{new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</div>
          </div>

          <div className="j-tabs">
            {[{ key: "checkin", label: "Today" }, { key: "history", label: "History" }].map(t => (
              <button key={t.key} className={`j-tab ${tab === t.key ? "active" : ""}`} onClick={() => setTab(t.key)}>{t.label}</button>
            ))}
          </div>

          {tab === "checkin" && (
            <div style={{ padding: "18px 20px 0" }}>
              <GlassCard>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 2 }}>
                  <span style={{ fontSize: 13, color: TP, fontWeight: 500 }}>💼  Work hours</span>
                  <span style={{ fontSize: 22, fontWeight: 700, color: workColor }}>
                    {workHours}<span style={{ fontSize: 13, fontWeight: 600, color: TP, marginLeft: 2 }}>h</span>
                  </span>
                </div>
                <AuraSlider value={workHours} min={0} max={16} step={0.5} accentColor={workColor} sliderKey="work" onChange={setWorkHours} />
              </GlassCard>

              <GlassCard>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 2 }}>
                  <span style={{ fontSize: 13, color: TP, fontWeight: 500 }}>🌙  Sleep hours</span>
                  <span style={{ fontSize: 22, fontWeight: 700, color: sleepColor }}>
                    {sleepHours}<span style={{ fontSize: 13, fontWeight: 600, color: TP, marginLeft: 2 }}>h</span>
                  </span>
                </div>
                <AuraSlider value={sleepHours} min={3} max={12} step={0.5} accentColor={sleepColor} sliderKey="sleep" onChange={setSleepHours} />
              </GlassCard>

              <GlassCard style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px" }}>
                <div>
                  <div style={{ fontSize: 14, color: TP, fontWeight: 600, marginBottom: 3 }}>🤝  Social activity</div>
                  <div style={{ fontSize: 12, color: TS }}>Time spent with others today?</div>
                </div>
                <button onClick={() => setSocial(!social)} style={{
                  background: social ? "rgba(255,255,255,0.45)" : "rgba(200,190,185,0.22)",
                  border: `0.5px solid ${social ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.2)"}`,
                  borderRadius: 20, padding: "7px 18px", cursor: "pointer",
                  color: social ? "rgba(20,6,0,0.85)" : "rgba(20,6,0,0.38)",
                  fontSize: 13, fontWeight: 700, transition: "all 0.22s",
                  backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
                }}>
                  {social ? "Yes ✓" : "No"}
                </button>
              </GlassCard>

              <GlassCard style={{ padding: "16px 18px" }}>
                <div style={{ fontSize: 11, color: TM, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 700, marginBottom: 8 }}>Reflections</div>
                <textarea className="j-ta" placeholder="Write anything — thoughts, observations, what went well…" value={notes} onChange={e => setNotes(e.target.value)} />
              </GlassCard>

              <div style={{ marginTop: 4 }}>
                {saved ? (
                  <div style={{ textAlign: "center", padding: "15px", borderRadius: 18, background: "rgba(200,190,185,0.3)", border: "0.5px solid rgba(255,255,255,0.28)", color: "#14532d", fontSize: 14, fontWeight: 700 }}>✓  Saved</div>
                ) : (
                  <button className="j-save" onClick={saveEntry}>Save entry</button>
                )}
              </div>
            </div>
          )}

          {tab === "history" && (
            <div style={{ padding: "18px 20px 0" }}>
              {sortedLogs.length === 0 ? (
                <div style={{ textAlign: "center", padding: "60px 20px", color: "rgba(20,6,0,0.4)" }}>
                  <div style={{ fontSize: 36, marginBottom: 12 }}>📓</div>
                  <div>No journal entries yet.</div>
                </div>
              ) : sortedLogs.map(log => (
                <div key={log.id} className="j-hcard">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <div style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: 18, color: TP }}>{fmt(log.date)}</div>
                    <div style={{ fontSize: 11, color: TM }}>{log.time}</div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
                    {[
                      { label: "Work",   value: `${log.work_hours ?? "—"}h`,  color: (log.work_hours ?? 8) <= 8 ? "#92400e" : "#c2410c" },
                      { label: "Sleep",  value: `${log.sleep_hours ?? "—"}h`, color: (log.sleep_hours ?? 0) >= 7.5 ? "#92400e" : "#c2410c" },
                      { label: "Social", value: log.social ? "Yes ✓" : "Solo", color: log.social ? "#92400e" : TM },
                    ].map(item => (
                      <div key={item.label} className="j-chip">
                        <div style={{ fontSize: 14, fontWeight: 700, color: item.color, marginBottom: 3 }}>{item.value}</div>
                        <div style={{ fontSize: 10, color: TM, letterSpacing: 0.3 }}>{item.label}</div>
                      </div>
                    ))}
                  </div>
                  {log.notes ? (
                    <div style={{ fontSize: 13, color: TS, fontStyle: "italic", lineHeight: 1.6, borderTop: "1px solid rgba(20,6,0,0.08)", paddingTop: 10, fontFamily: "'DM Serif Display', Georgia, serif" }}>
                      "{log.notes}"
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: TM, fontStyle: "italic" }}>No notes written</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Wheel of Life Page ───────────────────────────────────────────────────────
function WOLPage({ wolLogs, setWolLogs }) {
  const thisWeek = getCurrentWeekMonday();
  const thisWeekLog = wolLogs.find(l => l.week_key === thisWeek);
  const isLocked = !!thisWeekLog;

  const initWol = () => Object.fromEntries(WOL_DIMS.map(d => [d.key, thisWeekLog?.[d.key] ?? 5]));
  const [wol, setWol] = useState(initWol);
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState("checkin");

  const wolAvg = (Object.values(wol).reduce((a, b) => a + b, 0) / WOL_DIMS.length).toFixed(1);

  const nextMon = new Date(thisWeek + "T12:00:00");
  nextMon.setDate(nextMon.getDate() + 7);
  const nextMonStr = nextMon.toLocaleDateString("en-GB", { day: "numeric", month: "short" });

  const saveWOL = async () => {
    if (isLocked) return;
    const log = {
      id:       Date.now(),
      week_key: thisWeek,
      time:     new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
      wol_avg:  parseFloat(wolAvg),
      ...wol,
    };
    await saveWolLog(log);
    setWolLogs(prev => [log, ...prev.filter(l => l.week_key !== thisWeek)]);
    setSaved(true);
  };

  const sortedLogs = [...wolLogs].sort((a, b) => b.week_key.localeCompare(a.week_key));

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", paddingTop: "env(safe-area-inset-top)", paddingBottom: 120 }}>
      <div style={{
        display: "flex", gap: 0, background: "rgba(255,255,255,0.04)",
        borderRadius: 12, margin: "20px 20px 0", border: "1px solid rgba(255,255,255,0.06)",
      }}>
        {[{ key: "checkin", label: "This Week" }, { key: "history", label: "History" }].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            flex: 1, padding: "10px", border: "none", borderRadius: 10,
            background: tab === t.key ? "rgba(99,102,241,0.3)" : "transparent",
            color: tab === t.key ? "#a5b4fc" : "#555",
            fontSize: 13, fontWeight: tab === t.key ? 600 : 400, cursor: "pointer", transition: "all 0.2s",
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "checkin" && (
        <div style={{ padding: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#f0f0f8" }}>Wheel of Life</h2>
              <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>{formatWeekRange(thisWeek)}</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: scoreColor(parseFloat(wolAvg)) }}>{wolAvg}</div>
              <div style={{ fontSize: 10, color: "#555" }}>avg</div>
            </div>
          </div>

          {/* Lock banner */}
          <div style={{
            background: isLocked ? "rgba(255,255,255,0.02)" : "rgba(99,102,241,0.1)",
            borderRadius: 12, padding: "10px 14px", marginBottom: 14,
            border: `1px solid ${isLocked ? "rgba(255,255,255,0.05)" : "rgba(99,102,241,0.3)"}`,
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <div style={{ fontSize: 13, color: isLocked ? "#555" : "#a5b4fc", fontWeight: 600 }}>
              📅 Week of {formatWeekRange(thisWeek)}
            </div>
            {isLocked ? (
              <div style={{ fontSize: 12, color: "#555" }}>
                Unlocks <span style={{ color: "#a5b4fc", fontWeight: 700 }}>{nextMonStr}</span>
              </div>
            ) : (
              <div style={{ fontSize: 11, color: "#666" }}>Now open</div>
            )}
          </div>

          <div style={{ opacity: isLocked ? 0.45 : 1, pointerEvents: isLocked ? "none" : "auto", transition: "opacity 0.3s" }}>
            {WOL_DIMS.map(dim => (
              <div key={dim.key} style={{
                background: "rgba(255,255,255,0.03)", borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.06)", padding: "12px 14px", marginBottom: 10,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: "#888" }}>{dim.icon} {dim.label}</span>
                  <span style={{ fontSize: 15, fontWeight: 700, color: scoreColor(wol[dim.key]) }}>{wol[dim.key]}</span>
                </div>
                <Slider value={wol[dim.key]} onChange={v => setWol(prev => ({ ...prev, [dim.key]: v }))} color={scoreColor(wol[dim.key])} />
              </div>
            ))}
          </div>

          {isLocked || saved ? (
            <div style={{ textAlign: "center", padding: "14px", marginTop: 4, background: "rgba(74,222,128,0.1)", borderRadius: 12, color: "#4ade80", fontSize: 14, fontWeight: 600 }}>
              ✓  Saved for this week
            </div>
          ) : (
            <button onClick={saveWOL} style={{
              width: "100%", padding: "14px", borderRadius: 12, border: "none",
              background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
              color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer", marginTop: 4,
            }}>
              Save Weekly Check-in
            </button>
          )}
        </div>
      )}

      {tab === "history" && (
        <div style={{ padding: "20px" }}>
          {sortedLogs.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 20px", color: "#555" }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>🎯</div>
              <div>No weekly check-ins yet.</div>
            </div>
          ) : sortedLogs.map(log => (
            <div key={log.id} style={{
              background: "rgba(255,255,255,0.03)", borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.06)", padding: "16px", marginBottom: 12,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#ddd" }}>{formatWeekRange(log.week_key)}</div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: scoreColor(log.wol_avg) }}>{log.wol_avg?.toFixed(1)}</div>
                  <div style={{ fontSize: 9, color: "#555" }}>avg</div>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {WOL_DIMS.map(dim => (
                  <div key={dim.key} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    background: scoreBg(log[dim.key] ?? 5), borderRadius: 8, padding: "6px 10px",
                    border: `1px solid ${scoreColor(log[dim.key] ?? 5)}22`,
                  }}>
                    <span style={{ fontSize: 11, color: "#888" }}>{dim.icon} {dim.label}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: scoreColor(log[dim.key] ?? 5) }}>{log[dim.key] ?? "—"}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Food Page ────────────────────────────────────────────────────────────────
function FoodPage({ foodLogs, setFoodLogs }) {
  const [image, setImage]       = useState(null);
  const [imageData, setImageData] = useState(null);
  const [loading, setLoading]   = useState(false);
  const [result, setResult]     = useState(null);
  const [error, setError]       = useState(null);
  const [savedFood, setSavedFood] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [selectedLog, setSelectedLog] = useState(null);
  const fileRef = useRef();

  const handleFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      setImage(e.target.result);
      setImageData(e.target.result.split(",")[1]);
      setResult(null); setSavedFood(false); setError(null);
    };
    reader.readAsDataURL(file);
  };

  const analyseImage = async () => {
    if (!imageData) return;
    if (!API_KEY) { setError("No API key found."); return; }
    setLoading(true); setError(null);
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": API_KEY, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
        body: JSON.stringify({
          model: "claude-opus-4-6", max_tokens: 1000,
          messages: [{ role: "user", content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: imageData } },
            { type: "text", text: `You are an expert nutritionist. Analyse this meal photo carefully. Respond ONLY with raw JSON (no markdown, no backticks):\n${NUTRITION_PROMPT}` }
          ]}]
        })
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error.message);
      setResult(JSON.parse(data.content[0].text.trim()));
    } catch (e) { setError("Analysis failed. Check your API key or try a clearer photo."); }
    setLoading(false);
  };

  const analyseText = async () => {
    if (!textInput.trim()) return;
    if (!API_KEY) { setError("No API key found."); return; }
    setLoading(true); setError(null);
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": API_KEY, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
        body: JSON.stringify({
          model: "claude-opus-4-6", max_tokens: 1000,
          messages: [{ role: "user", content: `You are an expert nutritionist. The user ate: "${textInput}". Estimate nutrition based on typical portion sizes. Respond ONLY with raw JSON (no markdown, no backticks):\n${NUTRITION_PROMPT}` }]
        })
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error.message);
      setResult(JSON.parse(data.content[0].text.trim()));
    } catch (e) { setError("Analysis failed."); }
    setLoading(false);
  };

  const saveLog = async () => {
    if (!result) return;
    const log = { id: Date.now(), date: today(), time: new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }), ...result, image: image || null };
    await saveFoodLog(log);
    setFoodLogs(prev => [log, ...prev]);
    setSavedFood(true);
  };

  const reset = () => { setImage(null); setImageData(null); setResult(null); setSavedFood(false); setError(null); setTextInput(""); };

  return (
    <div style={{ padding: "calc(env(safe-area-inset-top) + 24px) 20px 200px", maxWidth: "100%", margin: "0 auto" }}>
      <h2 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 700, color: "#f0f0f8" }}>Food Analysis</h2>
      <p style={{ margin: "0 0 20px", fontSize: 13, color: "#666" }}>Photo your meal or describe it for an instant nutrition breakdown</p>

      {!result && (
        <>
          <div onClick={() => fileRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
            style={{
              border: image ? "none" : "2px dashed rgba(255,255,255,0.12)", borderRadius: 16,
              overflow: "hidden", cursor: "pointer",
              background: image ? "transparent" : "rgba(255,255,255,0.03)",
              minHeight: image ? "auto" : 180, display: "flex", alignItems: "center",
              justifyContent: "center", marginBottom: 16,
            }}>
            {image
              ? <img src={image} alt="meal" style={{ width: "100%", borderRadius: 16, maxHeight: 280, objectFit: "cover" }} />
              : <div style={{ textAlign: "center", padding: 32 }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>📸</div>
                  <div style={{ fontSize: 14, color: "#888" }}>Tap to upload or drag a photo</div>
                  <div style={{ fontSize: 11, color: "#555", marginTop: 4 }}>JPG, PNG, HEIC</div>
                </div>
            }
          </div>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={e => handleFile(e.target.files[0])} />

          {image && (
            <button onClick={analyseImage} disabled={loading} style={{
              width: "100%", padding: "14px", borderRadius: 12, border: "none",
              background: loading ? "rgba(99,102,241,0.4)" : "linear-gradient(135deg,#6366f1,#8b5cf6)",
              color: "#fff", fontSize: 15, fontWeight: 600, cursor: loading ? "default" : "pointer", marginBottom: 16,
            }}>
              {loading ? "Analysing…" : "✦  Analyse Meal"}
            </button>
          )}

          {!image && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)" }} />
                <span style={{ fontSize: 12, color: "#444", letterSpacing: 1 }}>OR</span>
                <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)" }} />
              </div>
              <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 16, border: "1px solid rgba(255,255,255,0.08)", padding: "16px", marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: "#555", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 10 }}>✏️  Describe your meal</div>
                <textarea placeholder="e.g. 2 scrambled eggs, 2 slices of sourdough toast with butter, and a black coffee"
                  value={textInput} onChange={e => setTextInput(e.target.value)}
                  style={{ width: "100%", minHeight: 80, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "12px 14px", color: "#ddd", fontSize: 13, resize: "none", outline: "none", boxSizing: "border-box", fontFamily: "inherit", marginBottom: 10, lineHeight: 1.5 }} />
                <button onClick={analyseText} disabled={loading || !textInput.trim()} style={{
                  width: "100%", padding: "13px", borderRadius: 10, border: "none",
                  background: (!textInput.trim() || loading) ? "rgba(99,102,241,0.25)" : "linear-gradient(135deg,#6366f1,#8b5cf6)",
                  color: (!textInput.trim() || loading) ? "#666" : "#fff",
                  fontSize: 14, fontWeight: 600, cursor: (!textInput.trim() || loading) ? "default" : "pointer",
                }}>
                  {loading ? "Analysing…" : "✦  Analyse Description"}
                </button>
              </div>
            </>
          )}
        </>
      )}

      {error && (
        <div style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 10, padding: "12px 16px", color: "#f87171", fontSize: 13, marginBottom: 16 }}>{error}</div>
      )}

      {result && (
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#f0f0f8" }}>{result.meal_name}</div>
              <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>{result.notes}</div>
              <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ fontSize: 11, color: "#555" }}>Confidence:</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: result.confidence_score >= 80 ? "#4ade80" : result.confidence_score >= 60 ? "#facc15" : "#f87171" }}>
                  {result.confidence_score}%
                </div>
              </div>
            </div>
            <div style={{ background: scoreBg(result.quality_score), border: `1px solid ${scoreColor(result.quality_score)}44`, borderRadius: 10, padding: "6px 12px", textAlign: "center" }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: scoreColor(result.quality_score) }}>{result.quality_score}</div>
              <div style={{ fontSize: 10, color: scoreColor(result.quality_score), opacity: 0.8 }}>{result.quality_label}</div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
            {[
              { label: "Calories", value: result.calories,  unit: "kcal", color: "#f59e0b" },
              { label: "Protein",  value: result.protein_g, unit: "g",    color: "#6366f1" },
              { label: "Carbs",    value: result.carbs_g,   unit: "g",    color: "#f97316" },
              { label: "Fat",      value: result.fat_g,     unit: "g",    color: "#ec4899" },
            ].map(m => (
              <div key={m.label} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 10, border: `1px solid ${m.color}33`, padding: "10px 8px", textAlign: "center" }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: m.color }}>{m.value}</div>
                <div style={{ fontSize: 9, color: "#666", marginTop: 2 }}>{m.unit}</div>
                <div style={{ fontSize: 10, color: "#888" }}>{m.label}</div>
              </div>
            ))}
          </div>

          {savedFood ? (
            <div style={{ textAlign: "center", padding: "14px", background: "rgba(74,222,128,0.1)", borderRadius: 12, color: "#4ade80", fontSize: 14, fontWeight: 600 }}>✓  Saved</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button onClick={reset} style={{ padding: "13px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#888", fontSize: 14, cursor: "pointer" }}>Retake</button>
              <button onClick={saveLog} style={{ padding: "13px", borderRadius: 12, border: "none", background: "linear-gradient(135deg,#6366f1,#8b5cf6)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Save Log</button>
            </div>
          )}
        </div>
      )}

      {/* Selected log modal */}
      {selectedLog && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)", overflowY: "auto", padding: "24px 20px 60px" }}>
          <div style={{ maxWidth: 480, margin: "0 auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#f0f0f8" }}>{selectedLog.meal_name}</div>
                <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>{fmt(selectedLog.date)} · {selectedLog.time}</div>
              </div>
              <button onClick={() => setSelectedLog(null)} style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "8px 14px", color: "#aaa", fontSize: 13, cursor: "pointer" }}>✕ Close</button>
            </div>
            {selectedLog.image && <img src={selectedLog.image} alt="meal" style={{ width: "100%", borderRadius: 16, maxHeight: 220, objectFit: "cover", marginBottom: 16 }} />}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
              {[
                { label: "Calories", value: selectedLog.calories,  unit: "kcal", color: "#f59e0b" },
                { label: "Protein",  value: selectedLog.protein_g, unit: "g",    color: "#6366f1" },
                { label: "Carbs",    value: selectedLog.carbs_g,   unit: "g",    color: "#f97316" },
                { label: "Fat",      value: selectedLog.fat_g,     unit: "g",    color: "#ec4899" },
              ].map(m => (
                <div key={m.label} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 10, border: `1px solid ${m.color}33`, padding: "10px 8px", textAlign: "center" }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: m.color }}>{m.value}</div>
                  <div style={{ fontSize: 9, color: "#666", marginTop: 2 }}>{m.unit}</div>
                  <div style={{ fontSize: 10, color: "#888" }}>{m.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {foodLogs.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <div style={{ fontSize: 11, color: "#555", letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 }}>Recent</div>
          {[...foodLogs].sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)).slice(0, 10).map(log => (
            <div key={log.id} onClick={() => setSelectedLog(log)}
              style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10, background: "rgba(255,255,255,0.03)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)", padding: "10px 14px", cursor: "pointer" }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.06)"}
              onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.03)"}
            >
              {log.image
                ? <img src={log.image} alt="" style={{ width: 44, height: 44, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
                : <div style={{ width: 44, height: 44, borderRadius: 8, background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>✏️</div>
              }
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#ddd", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{log.meal_name}</div>
                <div style={{ fontSize: 11, color: "#555" }}>{fmt(log.date)} · {log.time} · {log.calories} kcal</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: scoreColor(log.quality_score) }}>{log.quality_score}</div>
                <div style={{ fontSize: 14, color: "#444" }}>›</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Insights Page ────────────────────────────────────────────────────────────
function InsightsPage({ moodLogs, journalLogs, foodLogs, wolLogs }) {
  if (moodLogs.length < 3) return (
    <div style={{ padding: "60px 24px", textAlign: "center", maxWidth: 480, margin: "0 auto" }}>
      <div style={{ fontSize: 40, marginBottom: 16 }}>🔍</div>
      <div style={{ fontSize: 16, color: "#888", marginBottom: 8 }}>Not enough data yet</div>
      <div style={{ fontSize: 13, color: "#555", lineHeight: 1.6 }}>
        Complete at least 3 mood check-ins to see your first personal insights.
        <br /><br />
        <span style={{ color: "#6366f1" }}>Each day of data makes the picture clearer.</span>
      </div>
    </div>
  );

  // Group mood logs by date, calculate daily avg mood
  const moodByDate = moodLogs.reduce((acc, l) => {
    if (!acc[l.date]) acc[l.date] = [];
    acc[l.date].push(l.mood);
    return acc;
  }, {});
  const dailyMoods = Object.entries(moodByDate).map(([date, moods]) => ({
    date,
    avgMood: moods.reduce((a, b) => a + b, 0) / moods.length,
  }));

  const overallMoodAvg = dailyMoods.length
    ? (dailyMoods.reduce((a, b) => a + b.avgMood, 0) / dailyMoods.length).toFixed(1)
    : "—";

  const socialDays    = journalLogs.filter(l => l.social);
  const nonSocialDays = journalLogs.filter(l => !l.social);
  const highWorkDays  = journalLogs.filter(l => l.work_hours > 9);
  const lowWorkDays   = journalLogs.filter(l => l.work_hours <= 8);
  const goodSleepDays = journalLogs.filter(l => l.sleep_hours >= 7.5);
  const poorSleepDays = journalLogs.filter(l => l.sleep_hours < 6.5);

  // Helper: get avg mood for dates matching a filter
  const avgMoodForDates = (dates) => {
    const moods = dates.flatMap(l => moodByDate[l.date] || []);
    return moods.length ? (moods.reduce((a, b) => a + b, 0) / moods.length).toFixed(1) : null;
  };

  const avgFoodQ = foodLogs.length ? (foodLogs.reduce((a, b) => a + (b.quality_score || 0), 0) / foodLogs.length).toFixed(1) : null;
  const latestWol = wolLogs[0];

  const insights = [];

  if (socialDays.length >= 2 && nonSocialDays.length >= 2) {
    const soc = avgMoodForDates(socialDays);
    const solo = avgMoodForDates(nonSocialDays);
    if (soc && solo) {
      const diff = (parseFloat(soc) - parseFloat(solo)).toFixed(1);
      insights.push({ icon: "🤝", title: "Social Activity & Mood", color: parseFloat(diff) > 0 ? "#4ade80" : "#a78bfa",
        finding: parseFloat(diff) > 0
          ? `Social days: mood ${soc} vs solo days: ${solo} (+${diff} pts). Social connection lifts your mood.`
          : `Solo days score slightly higher (${solo} vs ${soc}). You may recharge best alone.` });
    }
  }

  if (highWorkDays.length >= 2 && lowWorkDays.length >= 2) {
    const low = avgMoodForDates(lowWorkDays);
    const high = avgMoodForDates(highWorkDays);
    if (low && high) {
      const diff = (parseFloat(low) - parseFloat(high)).toFixed(1);
      insights.push({ icon: "💼", title: "Work Hours & Mood", color: parseFloat(diff) > 0.3 ? "#f87171" : "#facc15",
        finding: `Short days (≤8h): mood ${low}. Long days (>9h): mood ${high}. Working long costs you ${diff} mood points.` });
    }
  }

  if (goodSleepDays.length >= 2) {
    const good = avgMoodForDates(goodSleepDays);
    const poor = poorSleepDays.length >= 2 ? avgMoodForDates(poorSleepDays) : null;
    if (good) {
      insights.push({ icon: "🌙", title: "Sleep & Mood", color: "#a5b4fc",
        finding: `7.5h+ sleep: mood ${good}${poor ? ` vs short sleep: ${poor}` : ""}. ${parseFloat(good) > 6.5 ? "Sleep is a clear mood booster for you." : "Other factors may be driving your mood more than sleep."}` });
    }
  }

  if (avgFoodQ) {
    insights.push({ icon: "🥗", title: "Food Quality", color: scoreColor(parseFloat(avgFoodQ)),
      finding: `Average food quality: ${avgFoodQ}/10 across ${foodLogs.length} meals. ${parseFloat(avgFoodQ) >= 7 ? "Strong foundation." : parseFloat(avgFoodQ) >= 5 ? "Room to improve — better food days likely lift energy and mood." : "Food quality is a key area to focus on."}` });
  }

  if (latestWol) {
    const wolAvg = latestWol.wol_avg?.toFixed(1);
    const lowest = WOL_DIMS.sort((a, b) => (latestWol[a.key] ?? 5) - (latestWol[b.key] ?? 5))[0];
    insights.push({ icon: "🎯", title: "Wheel of Life", color: scoreColor(parseFloat(wolAvg)),
      finding: `Latest WOL avg: ${wolAvg}/10. Lowest area: ${lowest.icon} ${lowest.label} (${latestWol[lowest.key]}). Focus here for biggest life satisfaction gains.` });
  }

  return (
    <div style={{ padding: "calc(env(safe-area-inset-top) + 24px) 20px 24px", maxWidth: 480, margin: "0 auto" }}>
      <h2 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 700, color: "#f0f0f8" }}>Your Insights</h2>
      <p style={{ margin: "0 0 20px", fontSize: 13, color: "#666" }}>Patterns from your data</p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10, marginBottom: 24 }}>
        {[
          { label: "Avg Mood",  value: overallMoodAvg, icon: "😊" },
          { label: "Mood logs", value: moodLogs.length,    icon: "✦",  raw: true },
          { label: "Meals",     value: foodLogs.length,    icon: "🍽️", raw: true },
          { label: "WOL avg",   value: wolLogs[0]?.wol_avg?.toFixed(1) ?? "—", icon: "🎯" },
        ].map(s => (
          <div key={s.label} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.07)", padding: "14px 10px", textAlign: "center" }}>
            <div style={{ fontSize: 20 }}>{s.icon}</div>
            <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4, color: s.raw ? "#a5b4fc" : scoreColor(parseFloat(s.value)) }}>{s.value}</div>
            <div style={{ fontSize: 10, color: "#555", marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {insights.map((ins, i) => (
        <div key={i} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 14, border: `1px solid ${ins.color}22`, borderLeft: `3px solid ${ins.color}`, padding: "16px", marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: ins.color, marginBottom: 6 }}>{ins.icon}  {ins.title}</div>
          <div style={{ fontSize: 13, color: "#aaa", lineHeight: 1.6 }}>{ins.finding}</div>
        </div>
      ))}

      {moodLogs.length < 7 && (
        <div style={{ background: "rgba(99,102,241,0.08)", borderRadius: 12, border: "1px solid rgba(99,102,241,0.2)", padding: "14px 16px", marginTop: 8 }}>
          <div style={{ fontSize: 13, color: "#a5b4fc", lineHeight: 1.6 }}>
            <strong>Keep going.</strong> {7 - Math.min(moodLogs.length, 7)} more check-ins until your insights become reliable.
          </div>
        </div>
      )}
    </div>
  );
}

// ── Bottom Nav ───────────────────────────────────────────────────────────────
function BottomNav({ page, setPage }) {
  const tabs = [
    { key: "home",     icon: "⌂",  label: "Home"    },
    { key: "mood",     icon: "✦",  label: "Mood"    },
    { key: "journal",  icon: "≡",  label: "Journal" },
    { key: "wol",      icon: "◎",  label: "Life"    },
    { key: "food",     icon: "♥",  label: "Food"    },
    { key: "insights", icon: "⚡", label: "Insights" },
  ];

  return (
    <>
      <style>{`
        .nav-pill-wrap { position:fixed; bottom:0; left:0; right:0; z-index:9999; display:flex; align-items:center; justify-content:center; padding:0 12px 28px; pointer-events:none; }
        .nav-pill { display:flex; align-items:center; background:#1c1c2a; border-radius:40px; padding:6px 8px; gap:0px; box-shadow:0 8px 32px rgba(0,0,0,0.55),0 2px 8px rgba(0,0,0,0.4),inset 0 1px 0 rgba(255,255,255,0.07); border:1px solid rgba(255,255,255,0.07); pointer-events:all; flex:1; min-width:0; }
        .nav-btn { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:3px; padding:8px 0; border-radius:32px; border:none; background:transparent; cursor:pointer; transition:background 0.18s,transform 0.14s; flex:1; min-width:0; }
        .nav-btn:active { transform:scale(0.93); }
        .nav-btn.active { background:#2a2a3e; box-shadow:inset 0 1px 0 rgba(255,255,255,0.09); }
        .nav-btn-icon { font-size:18px; line-height:1; color:rgba(255,255,255,0.28); transition:color 0.18s,transform 0.18s; }
        .nav-btn.active .nav-btn-icon { color:#ffffff; transform:scale(1.08); }
        .nav-btn-label { font-size:9px; font-weight:500; color:rgba(255,255,255,0.28); transition:color 0.18s; font-family:system-ui,-apple-system,sans-serif; }
        .nav-btn.active .nav-btn-label { color:#ffffff; font-weight:700; }
        .home-indicator { position:fixed; bottom:8px; left:50%; transform:translateX(-50%); width:120px; height:4px; border-radius:2px; background:rgba(255,255,255,0.2); z-index:10000; pointer-events:none; }
      `}</style>
      <div className="nav-pill-wrap">
        <div className="nav-pill">
          {tabs.map(t => (
            <button key={t.key} className={`nav-btn ${page === t.key ? "active" : ""}`} onClick={() => setPage(t.key)}>
              <span className="nav-btn-icon">{t.icon}</span>
              <span className="nav-btn-label">{t.label}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="home-indicator" />
    </>
  );
}

// ── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [page, setPage] = useState("home");
  const [moodLogs,    setMoodLogs]    = useState([]);
  const [journalLogs, setJournalLogs] = useState([]);
  const [wolLogs,     setWolLogs]     = useState([]);
  const [foodLogs,    setFoodLogs]    = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAllData().then(({ moodLogs, journalLogs, wolLogs, foodLogs }) => {
      setMoodLogs(moodLogs);
      setJournalLogs(journalLogs);
      setWolLogs(wolLogs);
      setFoodLogs(foodLogs);
      setLoading(false);
    });
  }, []);

  return (
    <div style={{
      minHeight: "100vh", background: "#0d0d18", color: "#f0f0f8",
      fontFamily: "system-ui,-apple-system,sans-serif",
      width: "100%", maxWidth: "100%",
      overflowY: "auto", msOverflowStyle: "none", scrollbarWidth: "none",
    }}>
      <style>{`
        * { box-sizing:border-box; }
        html,body { scrollbar-width:none; -ms-overflow-style:none; overflow-y:scroll; }
        html::-webkit-scrollbar,body::-webkit-scrollbar,*::-webkit-scrollbar { display:none; width:0; height:0; }
        ::placeholder { color:#444; }
        textarea { font-family:inherit; }
        @keyframes fadeUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
      `}</style>

      {loading ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
          <div style={{ fontSize: 14, color: "#555" }}>Loading…</div>
        </div>
      ) : (
        <div style={{ animation: "fadeUp 0.3s ease" }}>
          {page === "home"     && <HomePage     moodLogs={moodLogs} journalLogs={journalLogs} foodLogs={foodLogs} wolLogs={wolLogs} setPage={setPage} />}
          {page === "mood"     && <MoodPage     moodLogs={moodLogs} setMoodLogs={setMoodLogs} />}
          {page === "journal"  && <JournalPage  journalLogs={journalLogs} setJournalLogs={setJournalLogs} />}
          {page === "wol"      && <WOLPage      wolLogs={wolLogs} setWolLogs={setWolLogs} />}
          {page === "food"     && <FoodPage     foodLogs={foodLogs} setFoodLogs={setFoodLogs} />}
          {page === "insights" && <InsightsPage moodLogs={moodLogs} journalLogs={journalLogs} foodLogs={foodLogs} wolLogs={wolLogs} />}
        </div>
      )}

      <BottomNav page={page} setPage={setPage} />
    </div>
  );
}