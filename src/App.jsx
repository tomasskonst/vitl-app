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

// ── Weather helpers ──────────────────────────────────────────────────────────

// WMO weather code → description + emoji
const weatherCodeInfo = (code) => {
  if (code === 0)              return { label: "Clear",        emoji: "☀️"  };
  if (code <= 2)               return { label: "Partly cloudy",emoji: "⛅"  };
  if (code === 3)              return { label: "Overcast",     emoji: "☁️"  };
  if (code <= 49)              return { label: "Foggy",        emoji: "🌫️"  };
  if (code <= 59)              return { label: "Drizzle",      emoji: "🌦️"  };
  if (code <= 69)              return { label: "Rain",         emoji: "🌧️"  };
  if (code <= 79)              return { label: "Snow",         emoji: "❄️"  };
  if (code <= 82)              return { label: "Showers",      emoji: "🌧️"  };
  if (code <= 86)              return { label: "Snow showers", emoji: "🌨️"  };
  if (code <= 99)              return { label: "Thunderstorm", emoji: "⛈️"  };
  return { label: "Unknown", emoji: "🌡️" };
};

const uvLabel = (uv) => {
  if (uv <= 2)  return { label: "Low",       color: "#4ade80" };
  if (uv <= 5)  return { label: "Moderate",  color: "#facc15" };
  if (uv <= 7)  return { label: "High",      color: "#fb923c" };
  if (uv <= 10) return { label: "Very High", color: "#f87171" };
  return { label: "Extreme", color: "#c084fc" };
};

// Fetch weather from Open-Meteo (free, no key needed)
const fetchWeatherData = async (lat, lon) => {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,apparent_temperature,cloud_cover,uv_index,weather_code,wind_speed_10m,relative_humidity_2m` +
    `&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Weather fetch failed");
  const data = await res.json();
  const c = data.current;
  return {
    temperature_c:       Math.round(c.temperature_2m),
    feels_like_c:        Math.round(c.apparent_temperature),
    cloud_cover_pct:     c.cloud_cover,
    uv_index:            Math.round(c.uv_index * 10) / 10,
    weather_code:        c.weather_code,
    wind_speed_kmh:      Math.round(c.wind_speed_10m),
    humidity_pct:        c.relative_humidity_2m,
    latitude:            Math.round(lat * 1000) / 1000,
    longitude:           Math.round(lon * 1000) / 1000,
  };
};

// Get user's geolocation as a Promise
const getLocation = () =>
  new Promise((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      (err) => reject(err),
      { timeout: 10000 }
    )
  );

// ── Supabase helpers ─────────────────────────────────────────────────────────

const loadAllData = async () => {
  const [
    { data: moodData },
    { data: journalData },
    { data: wolData },
    { data: foodData },
    { data: weatherData },
  ] = await Promise.all([
    supabase.from("mood_logs").select("*").order("date", { ascending: false }),
    supabase.from("journal_logs").select("*").order("date", { ascending: false }),
    supabase.from("wol_logs").select("*").order("week_key", { ascending: false }),
    supabase.from("food_logs").select("*").order("date", { ascending: false }),
    supabase.from("weather_logs").select("*").order("date", { ascending: false }).limit(90),
  ]);
  return {
    moodLogs:    moodData    || [],
    journalLogs: journalData || [],
    wolLogs:     wolData     || [],
    foodLogs:    foodData    || [],
    weatherLogs: weatherData || [],
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
    id:                log.id,
    date:              log.date,
    time:              log.time,
    work_hours:        log.work_hours,
    sleep_hours:       log.sleep_hours,
    social:            log.social,
    notes:             log.notes,
    caffeine_cups:     log.caffeine_cups,
    last_coffee_hour:  log.last_coffee_hour,
    smoking:           log.smoking,
    smoking_amount:    log.smoking_amount,
    screen_bed:        log.screen_bed,
    alcohol_amount:    log.alcohol_amount,
    last_alcohol_hour: log.last_alcohol_hour,
    reading:           log.reading,
    journaling:        log.journaling,
    illness:           log.illness,
    injury:            log.injury,
    shared_bed:        log.shared_bed,
    funny_business:    log.funny_business,
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

const saveWeatherLog = async (log) => {
  const { error } = await supabase.from("weather_logs").upsert({
    id:              log.id,
    date:            log.date,
    time:            log.time,
    period:          log.period,
    temperature_c:   log.temperature_c,
    feels_like_c:    log.feels_like_c,
    cloud_cover_pct: log.cloud_cover_pct,
    uv_index:        log.uv_index,
    weather_code:    log.weather_code,
    wind_speed_kmh:  log.wind_speed_kmh,
    humidity_pct:    log.humidity_pct,
    latitude:        log.latitude,
    longitude:       log.longitude,
  });
  if (error) console.error("Error saving weather log:", error);
};

// Auto-track weather for the current period (runs silently on app load)
const autoTrackWeather = async (existingWeatherLogs, setWeatherLogs) => {
  try {
    const period = getCurrentPeriod();
    const dateStr = today();

    // Check if we already have a log for this period today
    const alreadyLogged = existingWeatherLogs.some(
      (l) => l.date === dateStr && l.period === period
    );
    if (alreadyLogged) return;

    // Get location
    const { lat, lon } = await getLocation();

    // Fetch weather
    const weatherData = await fetchWeatherData(lat, lon);

    const log = {
      id:      `${dateStr}-${period}`,   // stable dedup key
      date:    dateStr,
      time:    new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
      period,
      ...weatherData,
    };

    await saveWeatherLog(log);
    setWeatherLogs((prev) => [log, ...prev.filter((l) => l.id !== log.id)]);
  } catch (e) {
    // Silently fail — weather tracking is background/optional
    console.warn("Weather auto-track skipped:", e.message);
  }
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

// ── Weather Widget (shown on Home) ───────────────────────────────────────────
function WeatherWidget({ weatherLogs }) {
  const todayLogs = weatherLogs
    .filter((l) => l.date === today())
    .sort((a, b) => {
      const order = { Morning: 0, Afternoon: 1, Evening: 2 };
      return (order[a.period] ?? 3) - (order[b.period] ?? 3);
    });

  const latest = todayLogs[todayLogs.length - 1];
  if (!latest) return null;

  const { emoji } = weatherCodeInfo(latest.weather_code ?? 0);

  return (
    <div style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      background: "rgba(255,255,255,0.08)",
      backdropFilter: "blur(12px)",
      borderRadius: 20,
      padding: "6px 12px",
      border: "1px solid rgba(255,255,255,0.1)",
      marginBottom: 20,
    }}>
      <span style={{ fontSize: 16 }}>{emoji}</span>
      <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{latest.temperature_c}°C</span>
      <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>·</span>
      <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>Feels {latest.feels_like_c}°C</span>
    </div>
  );
}

// ── Home Page ────────────────────────────────────────────────────────────────
function HomePage({ moodLogs, journalLogs, foodLogs, wolLogs, weatherLogs, setPage }) {
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
        background: "linear-gradient(160deg, #0a0a1a 0%, #0d1b4d 25%, #0a2a6e 45%, #0d3a7a 60%, #061428 100%)",
      }} />
      <div style={{
        position: "absolute", inset: 0, zIndex: 0,
        background: "radial-gradient(ellipse 60% 50% at 20% 40%, rgba(0,120,255,0.45) 0%, transparent 65%), radial-gradient(ellipse 50% 40% at 80% 60%, rgba(0,220,255,0.25) 0%, transparent 60%), radial-gradient(ellipse 70% 35% at 50% 80%, rgba(0,80,200,0.35) 0%, transparent 70%)",
        filter: "blur(18px)",
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

        {/* Weather widget — shown automatically once we have data */}
        <WeatherWidget weatherLogs={weatherLogs} />

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
function MoodPage({ moodLogs, setMoodLogs, wolLogs, setWolLogs }) {
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

  return (
    <div style={{ minHeight: "100vh", position: "relative" }}>
      <div style={{ position: "absolute", inset: 0, zIndex: 0, background: "linear-gradient(160deg, #0a0a1a 0%, #0d1b4d 25%, #0a2a6e 45%, #0d3a7a 60%, #061428 100%)" }} />
      <div style={{ position: "absolute", inset: 0, zIndex: 0, background: "radial-gradient(ellipse 60% 50% at 20% 40%, rgba(0,120,255,0.45) 0%, transparent 65%), radial-gradient(ellipse 50% 40% at 80% 60%, rgba(0,220,255,0.25) 0%, transparent 60%), radial-gradient(ellipse 70% 35% at 50% 80%, rgba(0,80,200,0.35) 0%, transparent 70%)", filter: "blur(18px)" }} />

      <div style={{ position: "relative", zIndex: 1, maxWidth: 480, margin: "0 auto", paddingTop: "env(safe-area-inset-top)", paddingBottom: 120 }}>
        <div style={{
          display: "flex", gap: 0, background: "rgba(255,255,255,0.07)",
          borderRadius: 12, margin: "20px 20px 0", border: "1px solid rgba(255,255,255,0.12)",
        }}>
          {[{ key: "checkin", label: "Daily" }, { key: "wol", label: "Weekly" }].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              flex: 1, padding: "10px", border: "none", borderRadius: 10,
              background: tab === t.key ? "rgba(99,102,241,0.3)" : "transparent",
              color: tab === t.key ? "#a5b4fc" : "rgba(255,255,255,0.4)",
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
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>
                  {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
                </div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: scoreColor(mood) }}>{mood}</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>mood</div>
              </div>
            </div>

            <div style={{
              background: isPeriodLocked ? "rgba(255,255,255,0.05)" : "rgba(99,102,241,0.15)",
              borderRadius: 12, padding: "10px 14px", marginBottom: 14,
              border: `1px solid ${isPeriodLocked ? "rgba(255,255,255,0.1)" : "rgba(99,102,241,0.4)"}`,
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <div style={{ fontSize: 13, color: isPeriodLocked ? "rgba(255,255,255,0.35)" : "#a5b4fc", fontWeight: 600 }}>
              {periodEmoji[currentPeriod]} {currentPeriod} check-in
              </div>
              {isPeriodLocked ? (
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
                  Next at <span style={{ color: "#a5b4fc", fontWeight: 700 }}>{getNextPeriodTime()}</span>
                </div>
              ) : (
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>Now open</div>
              )}
            </div>

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
              <div style={{ background: "rgba(255,255,255,0.07)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.13)", padding: "12px 14px", marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>{periodEmoji[currentPeriod]} {currentPeriod} Mood</span>
                  <span style={{ fontSize: 15, fontWeight: 700, color: scoreColor(mood) }}>{mood}</span>
                </div>
                <Slider value={mood} onChange={setMood} color={scoreColor(mood)} />
              </div>

              <div style={{ background: "rgba(255,255,255,0.07)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.13)", padding: "12px 14px", marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>⚡ {currentPeriod} Energy</span>
                  <span style={{ fontSize: 15, fontWeight: 700, color: scoreColor(energy) }}>{energy}</span>
                </div>
                <Slider value={energy} onChange={setEnergy} color={scoreColor(energy)} />
              </div>

              <div style={{ background: "rgba(255,255,255,0.07)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.13)", padding: "12px 14px", marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>🌊 {currentPeriod} Stress</span>
                  <span style={{ fontSize: 15, fontWeight: 700, color: stressColor }}>{stress}</span>
                </div>
                <Slider value={stress} onChange={setStress} color={stressColor} />
              </div>

              <textarea placeholder="Any notes for this period…" value={notes} onChange={e => setNotes(e.target.value)}
                style={{
                  width: "100%", minHeight: 70, background: "rgba(255,255,255,0.07)",
                  border: "1px solid rgba(255,255,255,0.13)", borderRadius: 12,
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

        {tab === "wol" && (
          <WOLPage wolLogs={wolLogs} setWolLogs={setWolLogs} />
        )}
      </div>
    </div>
  );
}

// ── Journal Page ─────────────────────────────────────────────────────────────
function JournalPage({ journalLogs, setJournalLogs }) {
  const [tab, setTab] = useState("checkin");

  const now = new Date();
  const currentHour = now.getHours();
  const effectiveDate = currentHour < 6
    ? new Date(now.getTime() - 86400000).toISOString().split("T")[0]
    : today();
  const todayLog = journalLogs.find(l => l.date === effectiveDate);
  const isLocked = !!todayLog;

  const nextUnlockStr = () => {
    const d = new Date();
    d.setDate(d.getDate() + (currentHour < 6 ? 0 : 1));
    d.setHours(6, 0, 0, 0);
    return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) + " at 6:00am";
  };

  const [workHours,       setWorkHours]       = useState(todayLog?.work_hours        ?? 8);
  const [sleepHours,      setSleepHours]      = useState(todayLog?.sleep_hours       ?? 7.5);
  const [social,          setSocial]          = useState(todayLog?.social            ?? false);
  const [notes,           setNotes]           = useState(todayLog?.notes             ?? "");
  const [saved,           setSaved]           = useState(false);
  const [caffeineCups,    setCaffeineCups]    = useState(todayLog?.caffeine_cups     ?? 0);
  const [lastCoffeeHour,  setLastCoffeeHour]  = useState(todayLog?.last_coffee_hour  ?? 8);
  const [smoking,         setSmoking]         = useState(todayLog?.smoking           ?? false);
  const [smokingAmount,   setSmokingAmount]   = useState(todayLog?.smoking_amount    ?? 1);
  const [screenBed,       setScreenBed]       = useState(todayLog?.screen_bed        ?? 0);
  const [alcoholAmount,   setAlcoholAmount]   = useState(todayLog?.alcohol_amount    ?? 0);
  const [lastAlcoholHour, setLastAlcoholHour] = useState(todayLog?.last_alcohol_hour ?? 20);
  const [reading,         setReading]         = useState(todayLog?.reading           ?? false);
  const [journaling,      setJournaling]      = useState(todayLog?.journaling        ?? false);
  const [illness,         setIllness]         = useState(todayLog?.illness           ?? false);
  const [injury,          setInjury]          = useState(todayLog?.injury            ?? false);
  const [sharedBed,       setSharedBed]       = useState(todayLog?.shared_bed        ?? false);
  const [funnyBusiness,   setFunnyBusiness]   = useState(todayLog?.funny_business    ?? false);

  const workColor     = workHours  <= 8   ? "#60a5fa" : workHours  <= 10 ? "#facc15" : "#f87171";
  const caffeineColor = caffeineCups <= 2 ? "#60a5fa" : caffeineCups <= 4 ? "#facc15" : "#f87171";
  const screenColor   = screenBed  <= 20  ? "#60a5fa" : screenBed  <= 60 ? "#facc15" : "#f87171";
  const alcoholColor  = alcoholAmount === 0 ? "#60a5fa" : alcoholAmount <= 3 ? "#facc15" : "#f87171";

  const formatHour = (h) => {
    const hNorm = ((h % 24) + 24) % 24;
    const period = hNorm >= 12 ? "pm" : "am";
    const display = hNorm % 12 === 0 ? 12 : hNorm % 12;
    return `${display}${period}`;
  };

  const ToggleBtn = ({ value, onToggle, labelYes = "Yes ✓", labelNo = "No" }) => (
    <button onClick={onToggle} style={{
      background: value ? "rgba(99,102,241,0.35)" : "rgba(255,255,255,0.07)",
      border: `1px solid ${value ? "rgba(99,102,241,0.6)" : "rgba(255,255,255,0.13)"}`,
      borderRadius: 20, padding: "7px 18px", cursor: "pointer",
      color: value ? "#a5b4fc" : "rgba(255,255,255,0.4)",
      fontSize: 13, fontWeight: 700, transition: "all 0.22s",
      whiteSpace: "nowrap",
    }}>
      {value ? labelYes : labelNo}
    </button>
  );

  const BlueSlider = ({ value, onChange, min = 0, max = 16, step = 0.5, color = "#60a5fa", sliderKey = "s" }) => {
    const pct = ((value - min) / (max - min)) * 100;
    const cls = `bslider-${sliderKey}`;
    return (
      <div style={{ position: "relative", padding: "10px 0" }}>
        <style>{`
          .${cls} { -webkit-appearance: none; appearance: none; width: 100%; height: 4px; border-radius: 4px; outline: none; cursor: pointer; background: linear-gradient(to right, ${color} ${pct}%, rgba(255,255,255,0.1) ${pct}%); }
          .${cls}::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 22px; height: 22px; border-radius: 50%; background: ${color}; border: 2px solid #1a1a2e; box-shadow: 0 0 8px ${color}88; cursor: pointer; }
        `}</style>
        <input type="range" min={min} max={max} step={step} value={value} className={cls} onChange={(e) => onChange(parseFloat(e.target.value))} />
      </div>
    );
  };

  const Card = ({ children, style = {} }) => (
    <div style={{
      background: "rgba(255,255,255,0.07)", borderRadius: 16,
      border: "1px solid rgba(255,255,255,0.13)",
      padding: "14px 16px", marginBottom: 10, ...style,
    }}>{children}</div>
  );

  const saveEntry = async () => {
    if (isLocked) return;
    const log = {
      id:                todayLog?.id ?? Date.now(),
      date:              effectiveDate,
      time:              new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
      work_hours:        workHours,
      sleep_hours:       sleepHours,
      social,
      notes,
      caffeine_cups:     caffeineCups,
      last_coffee_hour:  lastCoffeeHour,
      smoking,
      smoking_amount:    smokingAmount,
      screen_bed:        screenBed,
      alcohol_amount:    alcoholAmount,
      last_alcohol_hour: lastAlcoholHour,
      reading,
      journaling,
      illness,
      injury,
      shared_bed:        sharedBed,
      funny_business:    funnyBusiness,
    };
    await saveJournalLog(log);
    setJournalLogs(prev => [log, ...prev.filter(l => l.date !== today())]);
    setSaved(true);
  };

  const sortedLogs = [...journalLogs].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div style={{ minHeight: "100vh", position: "relative" }}>
      <div style={{ position: "absolute", inset: 0, zIndex: 0, background: "linear-gradient(160deg, #0a0a1a 0%, #0d1b4d 25%, #0a2a6e 45%, #0d3a7a 60%, #061428 100%)" }} />
      <div style={{ position: "absolute", inset: 0, zIndex: 0, background: "radial-gradient(ellipse 60% 50% at 20% 40%, rgba(0,120,255,0.45) 0%, transparent 65%), radial-gradient(ellipse 50% 40% at 80% 60%, rgba(0,220,255,0.25) 0%, transparent 60%), radial-gradient(ellipse 70% 35% at 50% 80%, rgba(0,80,200,0.35) 0%, transparent 70%)", filter: "blur(18px)" }} />

      <div style={{ position: "relative", zIndex: 1, maxWidth: 480, margin: "0 auto", paddingTop: "calc(env(safe-area-inset-top) + 24px)", paddingBottom: 120 }}>
        <div style={{ padding: "0 20px 0" }}>
          <h2 style={{ margin: "0 0 2px", fontSize: 22, fontWeight: 700, color: "#f0f0f8" }}>Journal</h2>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginBottom: 16 }}>
            {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
          </div>
        </div>

        <div style={{
          display: "flex", gap: 0, background: "rgba(255,255,255,0.07)",
          borderRadius: 12, margin: "0 20px 20px", border: "1px solid rgba(255,255,255,0.12)",
        }}>
          {[{ key: "checkin", label: "Today" }, { key: "history", label: "History" }].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              flex: 1, padding: "10px", border: "none", borderRadius: 10,
              background: tab === t.key ? "rgba(99,102,241,0.3)" : "transparent",
              color: tab === t.key ? "#a5b4fc" : "rgba(255,255,255,0.4)",
              fontSize: 13, fontWeight: tab === t.key ? 600 : 400, cursor: "pointer", transition: "all 0.2s",
            }}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === "checkin" && (
          <div style={{ padding: "0 20px 40px" }}>
            {isLocked && (
              <div style={{
                background: "rgba(74,222,128,0.1)", borderRadius: 12, padding: "12px 16px",
                marginBottom: 14, border: "1px solid rgba(74,222,128,0.3)",
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
                <div style={{ fontSize: 13, color: "#4ade80", fontWeight: 700 }}>✓  Today's entry is saved</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Unlocks {nextUnlockStr()}</div>
              </div>
            )}

            <div style={{ opacity: isLocked ? 0.45 : 1, pointerEvents: isLocked ? "none" : "auto", transition: "opacity 0.3s" }}>

              <Card>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 2 }}>
                  <span style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", fontWeight: 500 }}>💼  Work hours</span>
                  <span style={{ fontSize: 22, fontWeight: 700, color: workColor }}>
                    {workHours}<span style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginLeft: 2 }}>h</span>
                  </span>
                </div>
                <BlueSlider value={workHours} min={0} max={16} step={0.5} color={workColor} sliderKey="work" onChange={setWorkHours} />
              </Card>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                <Card style={{ marginBottom: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 2 }}>
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", fontWeight: 500 }}>☕ Caffeine</span>
                    <span style={{ fontSize: 20, fontWeight: 700, color: caffeineColor }}>
                      {caffeineCups}<span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginLeft: 2 }}>cups</span>
                    </span>
                  </div>
                  <BlueSlider value={caffeineCups} min={0} max={7} step={1} color={caffeineColor} sliderKey="caff" onChange={setCaffeineCups} />
                </Card>
                <Card style={{ marginBottom: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 2 }}>
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", fontWeight: 500 }}>🕐 Last coffee</span>
                    <span style={{ fontSize: 20, fontWeight: 700, color: "#60a5fa" }}>{formatHour(lastCoffeeHour)}</span>
                  </div>
                  <BlueSlider value={lastCoffeeHour} min={6} max={22} step={0.5} color="#60a5fa" sliderKey="lcoff" onChange={setLastCoffeeHour} />
                </Card>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                <Card style={{ marginBottom: 0, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", fontWeight: 500, marginBottom: 10 }}>🚬 Smoking</div>
                  <ToggleBtn value={smoking} onToggle={() => setSmoking(!smoking)} />
                </Card>
                <Card style={{ marginBottom: 0, opacity: smoking ? 1 : 0.4, transition: "opacity 0.2s" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 2 }}>
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", fontWeight: 500 }}>💨 How much</span>
                    <span style={{ fontSize: 20, fontWeight: 700, color: "#f87171" }}>{smokingAmount}</span>
                  </div>
                  <BlueSlider value={smokingAmount} min={1} max={10} step={1} color="#f87171" sliderKey="smoke" onChange={setSmokingAmount} />
                </Card>
              </div>

              <Card>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 2 }}>
                  <span style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", fontWeight: 500 }}>📱  Screentime before bed</span>
                  <span style={{ fontSize: 22, fontWeight: 700, color: screenColor }}>
                    {screenBed}<span style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginLeft: 2 }}>min</span>
                  </span>
                </div>
                <BlueSlider value={screenBed} min={0} max={120} step={5} color={screenColor} sliderKey="screen" onChange={setScreenBed} />
              </Card>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                <Card style={{ marginBottom: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 2 }}>
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", fontWeight: 500 }}>🍷 Alcohol</span>
                    <span style={{ fontSize: 20, fontWeight: 700, color: alcoholColor }}>{alcoholAmount}</span>
                  </div>
                  <BlueSlider value={alcoholAmount} min={0} max={10} step={1} color={alcoholColor} sliderKey="alc" onChange={setAlcoholAmount} />
                </Card>
                <Card style={{ marginBottom: 0, opacity: alcoholAmount > 0 ? 1 : 0.4, transition: "opacity 0.2s" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 2 }}>
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", fontWeight: 500 }}>🕐 Last drink</span>
                    <span style={{ fontSize: 20, fontWeight: 700, color: "#60a5fa" }}>{formatHour(lastAlcoholHour)}</span>
                  </div>
                  <BlueSlider value={lastAlcoholHour} min={10} max={29} step={0.5} color="#60a5fa" sliderKey="lalc" onChange={setLastAlcoholHour} />
                </Card>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                <Card style={{ marginBottom: 0, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", fontWeight: 500, marginBottom: 10 }}>📖 Reading</div>
                  <ToggleBtn value={reading} onToggle={() => setReading(!reading)} />
                </Card>
                <Card style={{ marginBottom: 0, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", fontWeight: 500, marginBottom: 10 }}>✍️ Journaling</div>
                  <ToggleBtn value={journaling} onToggle={() => setJournaling(!journaling)} />
                </Card>
              </div>

              <Card style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 14, color: "rgba(255,255,255,0.8)", fontWeight: 600, marginBottom: 3 }}>🤝  Social activity</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>Time spent with others today?</div>
                </div>
                <ToggleBtn value={social} onToggle={() => setSocial(!social)} />
              </Card>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                <Card style={{ marginBottom: 0, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", fontWeight: 500, marginBottom: 10 }}>🤒 Illness</div>
                  <ToggleBtn value={illness} onToggle={() => setIllness(!illness)} />
                </Card>
                <Card style={{ marginBottom: 0, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", fontWeight: 500, marginBottom: 10 }}>🤕 Injury</div>
                  <ToggleBtn value={injury} onToggle={() => setInjury(!injury)} />
                </Card>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                <Card style={{ marginBottom: 0, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", fontWeight: 500, marginBottom: 10 }}>🛏️ Shared bed</div>
                  <ToggleBtn value={sharedBed} onToggle={() => setSharedBed(!sharedBed)} />
                </Card>
                <Card style={{ marginBottom: 0, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", fontWeight: 500, marginBottom: 10 }}>😏 Funny business</div>
                  <ToggleBtn value={funnyBusiness} onToggle={() => setFunnyBusiness(!funnyBusiness)} />
                </Card>
              </div>

              <style>{`.j-notes::placeholder { color: rgba(255,255,255,0.3) !important; }`}</style>
              <textarea className="j-notes" placeholder="Any notes for today…" value={notes} onChange={e => setNotes(e.target.value)}
                style={{
                  width: "100%", minHeight: 90, background: "rgba(255,255,255,0.07)",
                  border: "1px solid rgba(255,255,255,0.13)", borderRadius: 12,
                  padding: "12px 14px", color: "#fff", fontSize: 13, resize: "none",
                  outline: "none", boxSizing: "border-box", fontFamily: "inherit",
                  marginBottom: 14, lineHeight: 1.6,
                }} />

            </div>

            {isLocked ? (
              <div style={{ textAlign: "center", padding: "14px", borderRadius: 12, background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.25)", color: "#4ade80", fontSize: 14, fontWeight: 600 }}>
                ✓  Saved · Unlocks {nextUnlockStr()}
              </div>
            ) : saved ? (
              <div style={{ textAlign: "center", padding: "14px", borderRadius: 12, background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.25)", color: "#4ade80", fontSize: 14, fontWeight: 600 }}>✓  Saved</div>
            ) : (
              <button onClick={saveEntry} style={{
                width: "100%", padding: "14px", borderRadius: 12, border: "none",
                background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
                color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer",
              }}>Save Entry</button>
            )}
          </div>
        )}

        {tab === "history" && (
          <div style={{ padding: "0 20px 40px" }}>
            {sortedLogs.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 20px" }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>📓</div>
                <div style={{ fontSize: 16, color: "rgba(255,255,255,0.4)" }}>No journal entries yet.</div>
              </div>
            ) : sortedLogs.map(log => (
              <div key={log.id} style={{
                background: "rgba(255,255,255,0.07)", borderRadius: 16,
                border: "1px solid rgba(255,255,255,0.13)", padding: "16px 18px", marginBottom: 10,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#f0f0f8" }}>{fmt(log.date)}</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{log.time}</div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
                  {[
                    { label: "Work",   value: `${log.work_hours ?? "—"}h`,   color: (log.work_hours ?? 8) <= 8 ? "#60a5fa" : "#facc15" },
                    { label: "Sleep",  value: `${log.sleep_hours ?? "—"}h`,  color: (log.sleep_hours ?? 0) >= 7.5 ? "#4ade80" : "#f87171" },
                    { label: "Social", value: log.social ? "Yes ✓" : "Solo", color: log.social ? "#4ade80" : "rgba(255,255,255,0.4)" },
                  ].map(item => (
                    <div key={item.label} style={{ background: "rgba(255,255,255,0.05)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)", padding: "10px 8px", textAlign: "center" }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: item.color, marginBottom: 3 }}>{item.value}</div>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{item.label}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
                  {[
                    { label: "Caffeine", value: log.caffeine_cups != null ? `${log.caffeine_cups}c` : "—",  color: "#60a5fa" },
                    { label: "Screen",   value: log.screen_bed   != null ? `${log.screen_bed}m`   : "—",  color: (log.screen_bed ?? 0) <= 20 ? "#60a5fa" : "#facc15" },
                    { label: "Alcohol",  value: log.alcohol_amount != null ? `${log.alcohol_amount}` : "—", color: (log.alcohol_amount ?? 0) === 0 ? "#60a5fa" : "#facc15" },
                  ].map(item => (
                    <div key={item.label} style={{ background: "rgba(255,255,255,0.05)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)", padding: "10px 8px", textAlign: "center" }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: item.color, marginBottom: 3 }}>{item.value}</div>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{item.label}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: log.notes ? 10 : 0 }}>
                  {[
                    { label: "📖 Read",    val: log.reading },
                    { label: "✍️ Journal", val: log.journaling },
                    { label: "🚬 Smoked",  val: log.smoking },
                    { label: "🤒 Ill",     val: log.illness },
                    { label: "🤕 Injured", val: log.injury },
                    { label: "🛏️ Shared",  val: log.shared_bed },
                    { label: "😏 Funny",   val: log.funny_business },
                  ].filter(t => t.val).map(t => (
                    <span key={t.label} style={{ fontSize: 11, background: "rgba(99,102,241,0.15)", borderRadius: 20, padding: "3px 10px", color: "#a5b4fc", fontWeight: 600, border: "1px solid rgba(99,102,241,0.3)" }}>
                      {t.label}
                    </span>
                  ))}
                </div>
                {log.notes ? (
                  <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", fontStyle: "italic", lineHeight: 1.6, borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 10, marginTop: log.notes ? 4 : 0 }}>
                    "{log.notes}"
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.25)", fontStyle: "italic" }}>No notes written</div>
                )}
              </div>
            ))}
          </div>
        )}
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

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", paddingTop: "env(safe-area-inset-top)", paddingBottom: 120 }}>
      <div style={{
        display: "flex", gap: 0, background: "rgba(255,255,255,0.04)",
        borderRadius: 12, margin: "20px 20px 0", border: "1px solid rgba(255,255,255,0.06)",
      }}>
        {[{ key: "checkin", label: "This Week" }].map(t => (
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
    </div>
  );
}

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

  // ── Selected log detail view (full page, same bg as other pages) ──
  if (selectedLog) {
    return (
      <div style={{ minHeight: "100vh", position: "relative" }}>
        <div style={{ position: "absolute", inset: 0, zIndex: 0, background: "linear-gradient(160deg, #0a0a1a 0%, #0d1b4d 25%, #0a2a6e 45%, #0d3a7a 60%, #061428 100%)" }} />
        <div style={{ position: "absolute", inset: 0, zIndex: 0, background: "radial-gradient(ellipse 60% 50% at 20% 40%, rgba(0,120,255,0.45) 0%, transparent 65%), radial-gradient(ellipse 50% 40% at 80% 60%, rgba(0,220,255,0.25) 0%, transparent 60%), radial-gradient(ellipse 70% 35% at 50% 80%, rgba(0,80,200,0.35) 0%, transparent 70%)", filter: "blur(18px)" }} />
        <div style={{ position: "relative", zIndex: 1, maxWidth: 480, margin: "0 auto", padding: "calc(env(safe-area-inset-top) + 24px) 20px 160px", overflowY: "auto" }}>

          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
            <div style={{ flex: 1, marginRight: 12 }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: "#f0f0f8", lineHeight: 1.2 }}>{selectedLog.meal_name}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>{fmt(selectedLog.date)} · {selectedLog.time}</div>
            </div>
            <button onClick={() => setSelectedLog(null)} style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.13)", borderRadius: 12, padding: "10px 16px", color: "rgba(255,255,255,0.6)", fontSize: 13, cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap" }}>← Back</button>
          </div>

          {/* Image */}
          {selectedLog.image && (
            <img src={selectedLog.image} alt="meal" style={{ width: "100%", borderRadius: 16, maxHeight: 260, objectFit: "cover", marginBottom: 16 }} />
          )}

          {/* Quality + notes */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 20 }}>
            <div style={{ flex: 1 }}>
              {selectedLog.notes && (
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.6, fontStyle: "italic" }}>{selectedLog.notes}</div>
              )}
              {selectedLog.confidence_score != null && (
                <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>Confidence:</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: selectedLog.confidence_score >= 80 ? "#4ade80" : selectedLog.confidence_score >= 60 ? "#facc15" : "#f87171" }}>
                    {selectedLog.confidence_score}%
                  </div>
                </div>
              )}
            </div>
            {selectedLog.quality_score != null && (
              <div style={{ background: scoreBg(selectedLog.quality_score), border: `1px solid ${scoreColor(selectedLog.quality_score)}44`, borderRadius: 12, padding: "10px 16px", textAlign: "center", flexShrink: 0 }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: scoreColor(selectedLog.quality_score) }}>{selectedLog.quality_score}</div>
                <div style={{ fontSize: 10, color: scoreColor(selectedLog.quality_score), opacity: 0.8 }}>{selectedLog.quality_label}</div>
              </div>
            )}
          </div>

          {/* Macros */}
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 10 }}>Macros</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 20 }}>
            {[
              { label: "Calories", value: selectedLog.calories,  unit: "kcal", color: "#f59e0b" },
              { label: "Protein",  value: selectedLog.protein_g, unit: "g",    color: "#6366f1" },
              { label: "Carbs",    value: selectedLog.carbs_g,   unit: "g",    color: "#f97316" },
              { label: "Fat",      value: selectedLog.fat_g,     unit: "g",    color: "#ec4899" },
            ].map(m => (
              <div key={m.label} style={{ background: "rgba(255,255,255,0.07)", borderRadius: 10, border: `1px solid ${m.color}44`, padding: "10px 8px", textAlign: "center" }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: m.color }}>{m.value}</div>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>{m.unit}</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>{m.label}</div>
              </div>
            ))}
          </div>

          {/* Fats & Other */}
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 10 }}>Fats & Other</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 20 }}>
            {[
              { label: "Fibre",       value: selectedLog.fibre_g,         unit: "g",  color: "#4ade80" },
              { label: "Sugar",       value: selectedLog.sugar_g,         unit: "g",  color: "#f472b6" },
              { label: "Saturated",   value: selectedLog.saturated_fat_g, unit: "g",  color: "#fb923c" },
              { label: "Trans Fat",   value: selectedLog.trans_fat_g,     unit: "g",  color: "#f87171" },
              { label: "Cholesterol", value: selectedLog.cholesterol_mg,  unit: "mg", color: "#facc15" },
              { label: "Sodium",      value: selectedLog.sodium_mg,       unit: "mg", color: "#60a5fa" },
            ].map(m => (
              <div key={m.label} style={{ background: "rgba(255,255,255,0.07)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.13)", padding: "10px 8px" }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: m.color }}>{m.value}<span style={{ fontSize: 10, marginLeft: 2, opacity: 0.7 }}>{m.unit}</span></div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", marginTop: 3 }}>{m.label}</div>
              </div>
            ))}
          </div>

          {/* Minerals */}
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 10 }}>Minerals</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 20 }}>
            {[
              { label: "Potassium",  value: selectedLog.potassium_mg,  unit: "mg", color: "#a78bfa" },
              { label: "Calcium",    value: selectedLog.calcium_mg,    unit: "mg", color: "#34d399" },
              { label: "Iron",       value: selectedLog.iron_mg,       unit: "mg", color: "#fb923c" },
              { label: "Magnesium",  value: selectedLog.magnesium_mg,  unit: "mg", color: "#60a5fa" },
              { label: "Phosphorus", value: selectedLog.phosphorus_mg, unit: "mg", color: "#facc15" },
              { label: "Zinc",       value: selectedLog.zinc_mg,       unit: "mg", color: "#f472b6" },
            ].map(m => (
              <div key={m.label} style={{ background: "rgba(255,255,255,0.07)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.13)", padding: "10px 8px" }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: m.color }}>{m.value}<span style={{ fontSize: 10, marginLeft: 2, opacity: 0.7 }}>{m.unit}</span></div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", marginTop: 3 }}>{m.label}</div>
              </div>
            ))}
          </div>

          {/* Vitamins */}
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 10 }}>Vitamins</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 20 }}>
            {[
              { label: "Vitamin A",   value: selectedLog.vitamin_a_ug,   unit: "μg", color: "#f59e0b" },
              { label: "Vitamin C",   value: selectedLog.vitamin_c_mg,   unit: "mg", color: "#34d399" },
              { label: "Vitamin D",   value: selectedLog.vitamin_d_ug,   unit: "μg", color: "#facc15" },
              { label: "Vitamin E",   value: selectedLog.vitamin_e_mg,   unit: "mg", color: "#fb923c" },
              { label: "Vitamin K",   value: selectedLog.vitamin_k_ug,   unit: "μg", color: "#a78bfa" },
              { label: "Vitamin B12", value: selectedLog.vitamin_b12_ug, unit: "μg", color: "#60a5fa" },
              { label: "Vitamin B6",  value: selectedLog.vitamin_b6_mg,  unit: "mg", color: "#f472b6" },
              { label: "Folate",      value: selectedLog.folate_ug,      unit: "μg", color: "#4ade80" },
            ].map(m => (
              <div key={m.label} style={{ background: "rgba(255,255,255,0.07)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.13)", padding: "10px 8px" }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: m.color }}>{m.value}<span style={{ fontSize: 10, marginLeft: 2, opacity: 0.7 }}>{m.unit}</span></div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", marginTop: 3 }}>{m.label}</div>
              </div>
            ))}
          </div>

          {/* Ingredients */}
          {selectedLog.main_ingredients?.length > 0 && (
            <>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 10 }}>Detected Ingredients</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
                {selectedLog.main_ingredients.map((ing, i) => (
                  <span key={i} style={{ fontSize: 12, padding: "6px 14px", borderRadius: 20, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.13)", color: "rgba(255,255,255,0.7)" }}>
                    {ing}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", position: "relative" }}>
      <div style={{ position: "absolute", inset: 0, zIndex: 0, background: "linear-gradient(160deg, #0a0a1a 0%, #0d1b4d 25%, #0a2a6e 45%, #0d3a7a 60%, #061428 100%)" }} />
      <div style={{ position: "absolute", inset: 0, zIndex: 0, background: "radial-gradient(ellipse 60% 50% at 20% 40%, rgba(0,120,255,0.45) 0%, transparent 65%), radial-gradient(ellipse 50% 40% at 80% 60%, rgba(0,220,255,0.25) 0%, transparent 60%), radial-gradient(ellipse 70% 35% at 50% 80%, rgba(0,80,200,0.35) 0%, transparent 70%)", filter: "blur(18px)" }} />

      <div style={{ position: "relative", zIndex: 1, padding: "calc(env(safe-area-inset-top) + 24px) 20px 200px", maxWidth: 480, margin: "0 auto" }}>
        <h2 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 700, color: "#f0f0f8" }}>Food Analysis</h2>
        <p style={{ margin: "0 0 20px", fontSize: 13, color: "rgba(255,255,255,0.6)" }}>Photo your meal or describe it for an instant nutrition breakdown</p>

        {!result && (
          <>
            <div onClick={() => fileRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
              style={{
                border: image ? "none" : "2px dashed rgba(255,255,255,0.15)", borderRadius: 16,
                overflow: "hidden", cursor: "pointer",
                background: image ? "transparent" : "rgba(255,255,255,0.05)",
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
                  <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.1)" }} />
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", letterSpacing: 1 }}>OR</span>
                  <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.1)" }} />
                </div>
                <div style={{ background: "rgba(255,255,255,0.07)", borderRadius: 16, border: "1px solid rgba(255,255,255,0.13)", padding: "16px", marginBottom: 16 }}>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 10 }}>✏️  Describe your meal</div>
                  <style>{`.food-ta::placeholder { color: rgba(255,255,255,0.4) !important; }`}</style>
                  <textarea className="food-ta" placeholder="e.g. 2 scrambled eggs, 2 slices of sourdough toast with butter, and a black coffee"
                    value={textInput} onChange={e => setTextInput(e.target.value)}
                    style={{ width: "100%", minHeight: 80, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 10, padding: "12px 14px", color: "#fff", fontSize: 13, resize: "none", outline: "none", boxSizing: "border-box", fontFamily: "inherit", marginBottom: 10, lineHeight: 1.5 }} />
                  <button onClick={analyseText} disabled={loading || !textInput.trim()} style={{
                    width: "100%", padding: "13px", borderRadius: 10, border: "none",
                    background: (!textInput.trim() || loading) ? "rgba(99,102,241,0.6)" : "linear-gradient(135deg,#6366f1,#8b5cf6)",
                    color: "#fff", fontSize: 14, fontWeight: 600, cursor: (!textInput.trim() || loading) ? "default" : "pointer",
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
            {image && <img src={image} alt="meal" style={{ width: "100%", borderRadius: 16, maxHeight: 260, objectFit: "cover", marginBottom: 16 }} />}

            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16, gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#f0f0f8", lineHeight: 1.3 }}>{result.meal_name}</div>
                <div style={{ fontSize: 12, color: "#888", marginTop: 6, lineHeight: 1.5 }}>{result.notes}</div>
                <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ fontSize: 11, color: "#555" }}>Confidence:</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: result.confidence_score >= 80 ? "#4ade80" : result.confidence_score >= 60 ? "#facc15" : "#f87171" }}>
                    {result.confidence_score}%
                  </div>
                </div>
              </div>
              <div style={{ background: scoreBg(result.quality_score), border: `1px solid ${scoreColor(result.quality_score)}44`, borderRadius: 10, padding: "8px 14px", textAlign: "center", flexShrink: 0 }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: scoreColor(result.quality_score) }}>{result.quality_score}</div>
                <div style={{ fontSize: 10, color: scoreColor(result.quality_score), opacity: 0.8 }}>{result.quality_label}</div>
              </div>
            </div>

            <div style={{ fontSize: 11, color: "#555", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 10 }}>Macros</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 20 }}>
              {[
                { label: "Calories", value: result.calories,  unit: "kcal", color: "#f59e0b" },
                { label: "Protein",  value: result.protein_g, unit: "g",    color: "#6366f1" },
                { label: "Carbs",    value: result.carbs_g,   unit: "g",    color: "#f97316" },
                { label: "Fat",      value: result.fat_g,     unit: "g",    color: "#ec4899" },
              ].map(m => (
                <div key={m.label} style={{ background: "rgba(255,255,255,0.07)", borderRadius: 10, border: `1px solid ${m.color}44`, padding: "10px 8px", textAlign: "center" }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: m.color }}>{m.value}</div>
                  <div style={{ fontSize: 9, color: "#666", marginTop: 2 }}>{m.unit}</div>
                  <div style={{ fontSize: 10, color: "#888" }}>{m.label}</div>
                </div>
              ))}
            </div>

            <div style={{ fontSize: 11, color: "#555", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 10 }}>Fats</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 20 }}>
              {[
                { label: "Fibre",       value: result.fibre_g,         unit: "g",  color: "#4ade80" },
                { label: "Sugar",       value: result.sugar_g,         unit: "g",  color: "#f472b6" },
                { label: "Saturated",   value: result.saturated_fat_g, unit: "g",  color: "#fb923c" },
                { label: "Trans Fat",   value: result.trans_fat_g,     unit: "g",  color: "#f87171" },
                { label: "Cholesterol", value: result.cholesterol_mg,  unit: "mg", color: "#facc15" },
                { label: "Sodium",      value: result.sodium_mg,       unit: "mg", color: "#60a5fa" },
              ].map(m => (
                <div key={m.label} style={{ background: "rgba(255,255,255,0.07)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.13)", padding: "10px 8px" }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: m.color }}>{m.value}{m.unit}</div>
                  <div style={{ fontSize: 10, color: "#666", marginTop: 3 }}>{m.label}</div>
                </div>
              ))}
            </div>

            <div style={{ fontSize: 11, color: "#555", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 10 }}>Minerals</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 20 }}>
              {[
                { label: "Potassium",  value: result.potassium_mg,  unit: "mg", color: "#a78bfa" },
                { label: "Calcium",    value: result.calcium_mg,    unit: "mg", color: "#34d399" },
                { label: "Iron",       value: result.iron_mg,       unit: "mg", color: "#fb923c" },
                { label: "Magnesium",  value: result.magnesium_mg,  unit: "mg", color: "#60a5fa" },
                { label: "Phosphorus", value: result.phosphorus_mg, unit: "mg", color: "#facc15" },
                { label: "Zinc",       value: result.zinc_mg,       unit: "mg", color: "#f472b6" },
              ].map(m => (
                <div key={m.label} style={{ background: "rgba(255,255,255,0.07)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.13)", padding: "10px 8px" }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: m.color }}>{m.value}{m.unit}</div>
                  <div style={{ fontSize: 10, color: "#666", marginTop: 3 }}>{m.label}</div>
                </div>
              ))}
            </div>

            <div style={{ fontSize: 11, color: "#555", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 10 }}>Vitamins</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 20 }}>
              {[
                { label: "Vitamin A",   value: result.vitamin_a_ug,   unit: "μg", color: "#f59e0b" },
                { label: "Vitamin C",   value: result.vitamin_c_mg,   unit: "mg", color: "#34d399" },
                { label: "Vitamin D",   value: result.vitamin_d_ug,   unit: "μg", color: "#facc15" },
                { label: "Vitamin E",   value: result.vitamin_e_mg,   unit: "mg", color: "#fb923c" },
                { label: "Vitamin K",   value: result.vitamin_k_ug,   unit: "μg", color: "#a78bfa" },
                { label: "Vitamin B12", value: result.vitamin_b12_ug, unit: "μg", color: "#60a5fa" },
                { label: "Vitamin B6",  value: result.vitamin_b6_mg,  unit: "mg", color: "#f472b6" },
                { label: "Folate",      value: result.folate_ug,      unit: "μg", color: "#4ade80" },
              ].map(m => (
                <div key={m.label} style={{ background: "rgba(255,255,255,0.07)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.13)", padding: "10px 8px" }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: m.color }}>{m.value}{m.unit}</div>
                  <div style={{ fontSize: 10, color: "#666", marginTop: 3 }}>{m.label}</div>
                </div>
              ))}
            </div>

            {result.main_ingredients?.length > 0 && (
              <>
                <div style={{ fontSize: 11, color: "#555", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 10 }}>Detected</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
                  {result.main_ingredients.map((ing, i) => (
                    <span key={i} style={{ fontSize: 12, padding: "6px 14px", borderRadius: 20, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.13)", color: "#bbb" }}>
                      {ing}
                    </span>
                  ))}
                </div>
              </>
            )}

            {savedFood ? (
              <div style={{ textAlign: "center", padding: "14px", background: "rgba(74,222,128,0.1)", borderRadius: 12, color: "#4ade80", fontSize: 14, fontWeight: 600 }}>✓  Saved</div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <button onClick={reset} style={{ padding: "13px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.13)", background: "rgba(255,255,255,0.05)", color: "#888", fontSize: 14, cursor: "pointer" }}>Retake</button>
                <button onClick={saveLog} style={{ padding: "13px", borderRadius: 12, border: "none", background: "linear-gradient(135deg,#6366f1,#8b5cf6)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Save Log</button>
              </div>
            )}
          </div>
        )}

        {foodLogs.length > 0 && (
          <div style={{ marginTop: 32 }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 }}>Recent</div>
            {[...foodLogs].sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)).slice(0, 10).map(log => (
              <div key={log.id} onClick={() => setSelectedLog(log)}
                style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10, background: "rgba(255,255,255,0.07)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.13)", padding: "10px 14px", cursor: "pointer" }}
                onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.1)"}
                onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.07)"}
              >
                {log.image
                  ? <img src={log.image} alt="" style={{ width: 44, height: 44, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
                  : <div style={{ width: 44, height: 44, borderRadius: 8, background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>✏️</div>
                }
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#ddd", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{log.meal_name}</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{fmt(log.date)} · {log.time} · {log.calories} kcal</div>
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
    </div>
  );
}

// ── Insights Page ────────────────────────────────────────────────────────────
function InsightsPage({ moodLogs, journalLogs, foodLogs, wolLogs, weatherLogs }) {
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

  // Weather-mood correlation insight
  if (weatherLogs.length >= 5 && moodLogs.length >= 5) {
    const sunnyDates = new Set(
      weatherLogs.filter(w => (w.weather_code ?? 99) <= 2).map(w => w.date)
    );
    const cloudyDates = new Set(
      weatherLogs.filter(w => (w.weather_code ?? 0) >= 3).map(w => w.date)
    );
    const sunnyMoods = moodLogs.filter(l => sunnyDates.has(l.date)).map(l => l.mood);
    const cloudyMoods = moodLogs.filter(l => cloudyDates.has(l.date)).map(l => l.mood);
    if (sunnyMoods.length >= 2 && cloudyMoods.length >= 2) {
      const sunnyAvg = (sunnyMoods.reduce((a, b) => a + b, 0) / sunnyMoods.length).toFixed(1);
      const cloudyAvg = (cloudyMoods.reduce((a, b) => a + b, 0) / cloudyMoods.length).toFixed(1);
      const diff = (parseFloat(sunnyAvg) - parseFloat(cloudyAvg)).toFixed(1);
      insights.push({
        icon: "🌤️", title: "Weather & Mood", color: parseFloat(diff) > 0 ? "#facc15" : "#a5b4fc",
        finding: `Clear days: mood ${sunnyAvg} vs cloudy days: ${cloudyAvg} (${parseFloat(diff) > 0 ? "+" : ""}${diff} pts). ${Math.abs(parseFloat(diff)) < 0.3 ? "Weather doesn't seem to strongly affect your mood." : parseFloat(diff) > 0 ? "You tend to feel better on sunny days." : "You actually prefer overcast conditions."}`,
      });
    }
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
// Replace your existing BottomNav function and the App return JSX with this.
// Also update your App useState for page to include "insights" and "sync" as
// valid pages (they're opened via the overlay, not the pill).

function BottomNav({ page, setPage }) {
  const [overlayOpen, setOverlayOpen] = React.useState(false);

  const pillTabs = [
    { key: "home",    icon: "⌂",  label: "Home"    },
    { key: "mood",    icon: "✦",  label: "Mood"    },
    { key: "journal", icon: "≡",  label: "Journal" },
    { key: "food",    icon: "♥",  label: "Food"    },
  ];

  const overlayItems = [
    { key: "insights", icon: "⚡", label: "Insights",  desc: "Patterns from your data" },
    { key: "sync",     icon: "↻",  label: "Data Sync", desc: "Import Garmin & more"    },
  ];

  const handleOverlayPick = (key) => {
    setOverlayOpen(false);
    setPage(key);
  };

  const isPillActive = pillTabs.some(t => t.key === page);
  const isOverlayPageActive = overlayItems.some(t => t.key === page);

  return (
    <>
      <style>{`
        /* ── layout ── */
        .nav-wrap {
          position: fixed; bottom: 0; left: 0; right: 0; z-index: 9999;
          display: flex; align-items: flex-end; justify-content: center;
          padding: 0 16px 28px; gap: 10px; pointer-events: none;
        }

        /* ── pill ── */
        .nav-pill {
          display: flex; align-items: center;
          background: #1c1c2a;
          border-radius: 40px; padding: 6px 8px; gap: 0;
          box-shadow: 0 8px 32px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.4),
                      inset 0 1px 0 rgba(255,255,255,0.07);
          border: 1px solid rgba(255,255,255,0.07);
          pointer-events: all; flex: 1; max-width: 340px;
        }

        .nav-btn {
          display: flex; flex-direction: column; align-items: center;
          justify-content: center; gap: 3px; padding: 8px 0;
          border-radius: 32px; border: none; background: transparent;
          cursor: pointer; transition: background 0.18s, transform 0.14s;
          flex: 1; min-width: 0;
        }
        .nav-btn:active { transform: scale(0.93); }
        .nav-btn.active { background: #2a2a3e; box-shadow: inset 0 1px 0 rgba(255,255,255,0.09); }
        .nav-btn-icon {
          font-size: 18px; line-height: 1;
          color: rgba(255,255,255,0.28);
          transition: color 0.18s, transform 0.18s;
        }
        .nav-btn.active .nav-btn-icon { color: #ffffff; transform: scale(1.08); }
        .nav-btn-label {
          font-size: 9px; font-weight: 500;
          color: rgba(255,255,255,0.28);
          transition: color 0.18s;
          font-family: system-ui, -apple-system, sans-serif;
        }
        .nav-btn.active .nav-btn-label { color: #ffffff; font-weight: 700; }

        /* ── plus button ── */
        .nav-plus {
          width: 52px; height: 52px; border-radius: 50%; border: none;
          background: ${isOverlayPageActive
            ? "linear-gradient(135deg, #6366f1, #8b5cf6)"
            : "#2a2a3e"};
          box-shadow: 0 4px 20px rgba(0,0,0,0.5),
                      inset 0 1px 0 rgba(255,255,255,0.1);
          border: 1px solid ${isOverlayPageActive
            ? "rgba(99,102,241,0.5)"
            : "rgba(255,255,255,0.1)"};
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; pointer-events: all; flex-shrink: 0;
          transition: transform 0.22s cubic-bezier(.34,1.56,.64,1),
                      background 0.2s, box-shadow 0.2s;
        }
        .nav-plus:active { transform: scale(0.9); }
        .nav-plus.open {
          transform: rotate(45deg);
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          border-color: rgba(99,102,241,0.5);
          box-shadow: 0 4px 24px rgba(99,102,241,0.4);
        }
        .nav-plus-icon {
          font-size: 22px; font-weight: 300; line-height: 1;
          color: rgba(255,255,255,0.7);
          transition: color 0.2s;
          font-family: system-ui, -apple-system, sans-serif;
          margin-top: -1px;
        }
        .nav-plus.open .nav-plus-icon { color: #ffffff; }

        /* ── overlay backdrop ── */
        .overlay-backdrop {
          position: fixed; inset: 0; z-index: 9998;
          background: rgba(0,0,0,0); pointer-events: none;
          transition: background 0.25s;
        }
        .overlay-backdrop.open {
          background: rgba(0,0,0,0.55); pointer-events: all;
          backdrop-filter: blur(4px);
        }

        /* ── overlay card ── */
        .overlay-card {
          position: fixed; bottom: 110px; right: 16px; z-index: 9999;
          background: #1c1c2a;
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 20px;
          box-shadow: 0 16px 48px rgba(0,0,0,0.6),
                      inset 0 1px 0 rgba(255,255,255,0.08);
          padding: 8px;
          min-width: 200px;
          pointer-events: all;
          transform-origin: bottom right;
          transform: scale(0.85) translateY(12px);
          opacity: 0;
          transition: transform 0.28s cubic-bezier(.34,1.56,.64,1),
                      opacity 0.22s ease;
        }
        .overlay-card.open {
          transform: scale(1) translateY(0);
          opacity: 1;
        }

        .overlay-item {
          display: flex; align-items: center; gap: 14px;
          padding: 13px 14px; border-radius: 14px; cursor: pointer;
          border: none; background: transparent; width: 100%; text-align: left;
          transition: background 0.15s;
        }
        .overlay-item:hover, .overlay-item:active {
          background: rgba(255,255,255,0.07);
        }
        .overlay-item.active-page {
          background: rgba(99,102,241,0.18);
        }
        .overlay-item-icon {
          width: 36px; height: 36px; border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
          font-size: 17px; flex-shrink: 0;
          background: rgba(255,255,255,0.07);
          border: 1px solid rgba(255,255,255,0.1);
        }
        .overlay-item.active-page .overlay-item-icon {
          background: rgba(99,102,241,0.25);
          border-color: rgba(99,102,241,0.4);
        }
        .overlay-item-text {}
        .overlay-item-label {
          font-size: 14px; font-weight: 600;
          color: rgba(255,255,255,0.9);
          font-family: system-ui, -apple-system, sans-serif;
          display: block; margin-bottom: 2px;
        }
        .overlay-item-desc {
          font-size: 11px; color: rgba(255,255,255,0.4);
          font-family: system-ui, -apple-system, sans-serif;
          display: block;
        }

        /* ── home indicator ── */
        .home-indicator {
          position: fixed; bottom: 8px; left: 50%; transform: translateX(-50%);
          width: 120px; height: 4px; border-radius: 2px;
          background: rgba(255,255,255,0.2); z-index: 10000; pointer-events: none;
        }
      `}</style>

      {/* Backdrop */}
      <div
        className={`overlay-backdrop ${overlayOpen ? "open" : ""}`}
        onClick={() => setOverlayOpen(false)}
      />

      {/* Overlay card */}
      <div className={`overlay-card ${overlayOpen ? "open" : ""}`}>
        {overlayItems.map(item => (
          <button
            key={item.key}
            className={`overlay-item ${page === item.key ? "active-page" : ""}`}
            onClick={() => handleOverlayPick(item.key)}
          >
            <div className="overlay-item-icon">{item.icon}</div>
            <div className="overlay-item-text">
              <span className="overlay-item-label">{item.label}</span>
              <span className="overlay-item-desc">{item.desc}</span>
            </div>
          </button>
        ))}
      </div>

      {/* Bottom bar */}
      <div className="nav-wrap">
        {/* Pill */}
        <div className="nav-pill">
          {pillTabs.map(t => (
            <button
              key={t.key}
              className={`nav-btn ${page === t.key ? "active" : ""}`}
              onClick={() => { setPage(t.key); setOverlayOpen(false); }}
            >
              <span className="nav-btn-icon">{t.icon}</span>
              <span className="nav-btn-label">{t.label}</span>
            </button>
          ))}
        </div>

        {/* Plus button */}
        <button
          className={`nav-plus ${overlayOpen ? "open" : ""}`}
          onClick={() => setOverlayOpen(o => !o)}
        >
          <span className="nav-plus-icon">+</span>
        </button>
      </div>

      <div className="home-indicator" />
    </>
  );
}


// ── In your App return, update the page routing to include insights + sync:
//
//   {page === "home"     && <HomePage     ... />}
//   {page === "mood"     && <MoodPage     ... />}
//   {page === "journal"  && <JournalPage  ... />}
//   {page === "food"     && <FoodPage     ... />}
//   {page === "insights" && <InsightsPage ... />}
//   {page === "sync"     && <SyncPage     />}        ← add when you build it
//
// No other changes needed in App.jsx.

// ── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [page, setPage] = useState("home");
  const [moodLogs,    setMoodLogs]    = useState([]);
  const [journalLogs, setJournalLogs] = useState([]);
  const [wolLogs,     setWolLogs]     = useState([]);
  const [foodLogs,    setFoodLogs]    = useState([]);
  const [weatherLogs, setWeatherLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAllData().then(({ moodLogs, journalLogs, wolLogs, foodLogs, weatherLogs }) => {
      setMoodLogs(moodLogs);
      setJournalLogs(journalLogs);
      setWolLogs(wolLogs);
      setFoodLogs(foodLogs);
      setWeatherLogs(weatherLogs);
      setLoading(false);

      // Fire weather auto-track after data is loaded (so we can check for duplicates)
      autoTrackWeather(weatherLogs, setWeatherLogs);
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
        ::placeholder { color:rgba(255,255,255,0.35); }
        textarea { font-family:inherit; }
        @keyframes fadeUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
      `}</style>

      {loading ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
          <div style={{ fontSize: 14, color: "#555" }}>Loading…</div>
        </div>
      ) : (
        <div style={{ animation: "fadeUp 0.3s ease" }}>
          {page === "home"     && <HomePage     moodLogs={moodLogs} journalLogs={journalLogs} foodLogs={foodLogs} wolLogs={wolLogs} weatherLogs={weatherLogs} setPage={setPage} />}
          {page === "mood"     && <MoodPage     moodLogs={moodLogs} setMoodLogs={setMoodLogs} wolLogs={wolLogs} setWolLogs={setWolLogs} />}
          {page === "journal"  && <JournalPage  journalLogs={journalLogs} setJournalLogs={setJournalLogs} />}
          {page === "food"     && <FoodPage     foodLogs={foodLogs} setFoodLogs={setFoodLogs} />}
          {page === "insights" && <InsightsPage moodLogs={moodLogs} journalLogs={journalLogs} foodLogs={foodLogs} wolLogs={wolLogs} weatherLogs={weatherLogs} />}
          {page === "sync"     && <div style={{color:"#fff",padding:40}}>Sync coming soon</div>}
        </div>
      )}

      <BottomNav page={page} setPage={setPage} />
    </div>
  );
}