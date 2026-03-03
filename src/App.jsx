import { useState, useRef, useEffect } from "react";
import { supabase } from "./supabase";

const API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY || "";

const today = () => new Date().toISOString().split("T")[0];
const fmt = (d) => new Date(d + "T12:00:00").toLocaleDateString("en-GB", { day:"numeric", month:"short" });

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
  { key:"health",    label:"Health & Fitness",  icon:"🏃" },
  { key:"career",    label:"Career & Growth",    icon:"💼" },
  { key:"money",     label:"Money & Finance",    icon:"💰" },
  { key:"fun",       label:"Fun & Recreation",   icon:"🎉" },
  { key:"env",       label:"Environment",        icon:"🏡" },
  { key:"community", label:"Community",          icon:"🤝" },
  { key:"family",    label:"Family & Friends",   icon:"👨‍👩‍👧" },
  { key:"love",      label:"Partners & Love",    icon:"❤️" },
  { key:"growth",    label:"Growth & Learning",  icon:"📚" },
  { key:"spirit",    label:"Spirituality",       icon:"✨" },
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

// Returns the Monday date string (YYYY-MM-DD) for the current week
const getCurrentWeekMonday = () => {
  const d = new Date();
  const day = d.getDay(); // 0=Sun, 1=Mon...
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

const emptyMental = () => ({
  date: today(),
  moods:        { Morning: 5, Afternoon: 5, Evening: 5 },
  energyLevels: { Morning: 5, Afternoon: 5, Evening: 5 },
  stressLevels: { Morning: 5, Afternoon: 5, Evening: 5 },
  savedPeriods: [],
  social: false,
  workHours: 8,
  sleepHours: 7.5,
  stressLevel: 5,
  energyLevel: 5,
  notes: "",
  wol:        Object.fromEntries(WOL_DIMS.map(d => [d.key, 5])),
  wolWeekKey: null,
  wolSaved:   false,
});

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
const loadLogs = async () => {
  const { data: mental, error: mentalError } = await supabase
    .from("mental_logs")
    .select("*")
    .order("date", { ascending: false });

  const { data: food, error: foodError } = await supabase
    .from("food_logs")
    .select("*")
    .order("date", { ascending: false });

  if (mentalError) console.error("Error loading mental logs:", mentalError);
  if (foodError)   console.error("Error loading food logs:",   foodError);

  const mentalLogs = (mental || []).map(l => ({
    ...l,
    type:         "mental",
    workHours:    l.work_hours,
    sleepHours:   l.sleep_hours,
    stressLevel:  l.stress_level,
    energyLevel:  l.energy_level,
    energyLevels: l.energy_levels ?? { Morning: 5, Afternoon: 5, Evening: 5 },
    stressLevels: l.stress_levels ?? { Morning: 5, Afternoon: 5, Evening: 5 },
    savedPeriods: l.saved_periods ?? [],
    wolWeekKey:   l.wol_week_key  ?? null,
    wolSaved:     l.wol_saved     ?? false,
    avgMood:      l.avg_mood,
    wolAvg:       l.wol_avg,
  }));

  const foodLogs = (food || []).map(l => ({ ...l, type: "food" }));

  return [...mentalLogs, ...foodLogs];
};

const saveMentalLog = async (entry) => {
  const { error } = await supabase.from("mental_logs").upsert({
    id:            entry.id,
    date:          entry.date,
    time:          entry.time,
    moods:         entry.moods,
    energy_levels: entry.energyLevels,
    stress_levels: entry.stressLevels,
    saved_periods: entry.savedPeriods,
    social:        entry.social,
    work_hours:    entry.workHours,
    sleep_hours:   entry.sleepHours,
    stress_level:  entry.stressLevel,
    energy_level:  entry.energyLevel,
    notes:         entry.notes,
    wol:           entry.wol,
    wol_week_key:  entry.wolWeekKey,
    wol_saved:     entry.wolSaved,
    avg_mood:      entry.avgMood,
    wol_avg:       entry.wolAvg,
  });
  if (error) console.error("Error saving mental log:", error);
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

// ── Slider ──────────────────────────────────────────────────────────────────
function Slider({ value, onChange, min=1, max=10, step=0.5, color }) {
  const pct = ((value - min) / (max - min)) * 100;
  const c = color || scoreColor(value);
  return (
    <div style={{ position:"relative", padding:"8px 0" }}>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{
          width:"100%", appearance:"none", height:4, borderRadius:2,
          background:`linear-gradient(to right, ${c} ${pct}%, rgba(255,255,255,0.1) ${pct}%)`,
          outline:"none", cursor:"pointer",
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

// ── Home Page ────────────────────────────────────────────────────────────────
function HomePage({ logs, setPage }) {
  const mentalLogs = logs.filter(l => l.type === "mental");
  const foodLogs   = logs.filter(l => l.type === "food");
  const latestMental = mentalLogs.sort((a,b) => b.date.localeCompare(a.date))[0];
  const todayMental  = mentalLogs.find(l => l.date === today());

  const fitnessScore = latestMental
    ? ((latestMental.energyLevel || 5) * 10).toFixed(2)
    : "—";
  const sleepScore = latestMental
    ? Math.min(100, ((latestMental.sleepHours || 7) / 9 * 100)).toFixed(2)
    : "—";
  const nutritionScore = foodLogs.length
    ? (foodLogs.slice(0,7).reduce((a,b) => a + (b.quality_score||5), 0) / Math.min(7, foodLogs.length) * 10).toFixed(2)
    : "—";
  const socialScore = latestMental
    ? (latestMental.social ? 85 : 55).toFixed(2)
    : "—";

  const validScores = [fitnessScore, sleepScore, nutritionScore, socialScore].filter(s => s !== "—").map(parseFloat);
  const overallScore = validScores.length >= 2
    ? (validScores.reduce((a, b) => a + b, 0) / validScores.length).toFixed(2)
    : null;

  const challenges = [
    { label: "Daily 30-minute walk from 18:00-20:00", daysLeft: 2, totalDays: 7 },
    { label: "Increasing magnesium by 50g for 2 months", daysLeft: 28, totalDays: 60 },
  ];

  const insights = [];
  if (foodLogs.length > 0) {
    const lastMeal = foodLogs[0];
    if (lastMeal.calories > 700) {
      insights.push("Your heavy meal last night decreased your deep sleep by 25%");
    }
    if (lastMeal.carbs_g > 60) {
      insights.push("Excess amount of carbs at lunch increased your running pace by 0.5sec/km");
    }
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

  return (
    <div style={{ minHeight:"100vh", position:"relative" }}>
      <div style={{
        position:"absolute", inset:0, zIndex:0,
        background:"radial-gradient(ellipse 120% 60% at 50% -10%, #1a3a8f 0%, #0d1b4d 35%, #0d0d18 70%)",
      }} />
      <div style={{
        position:"absolute", top:0, left:0, right:0, height:320, zIndex:0,
        background:"radial-gradient(ellipse 80% 50% at 50% 0%, rgba(59,130,246,0.35) 0%, transparent 70%)",
      }} />

      <div style={{ position:"relative", zIndex:1, padding:"28px 20px 180px" }}>
        <div style={{ marginBottom:24 }}>
          <div style={{
            fontSize:11, fontWeight:700, letterSpacing:3,
            color:"rgba(255,255,255,0.5)", textTransform:"uppercase", marginBottom:6,
          }}>
            {greeting()}
          </div>
          <div style={{
            fontSize:32, fontWeight:900, color:"#fff", lineHeight:1.1,
            letterSpacing:-1, textTransform:"uppercase",
          }}>
            WELCOME<br/>BACK TO<br/><span style={{ color:"#7eb3ff" }}>FUNDAMENTALS</span>
          </div>
        </div>

        <div style={{
          background:"rgba(255,255,255,0.07)", backdropFilter:"blur(20px)",
          borderRadius:24, padding:"24px",
          border:"1px solid rgba(255,255,255,0.12)",
          marginBottom:16, textAlign:"center",
        }}>
          <div style={{ fontSize:12, color:"rgba(255,255,255,0.5)", marginBottom:8, letterSpacing:1 }}>
            Your overall wellness score
          </div>
          <div style={{
            fontSize:56, fontWeight:900, letterSpacing:-2, color:"#fff",
            textShadow:"0 0 40px rgba(126,179,255,0.4)",
          }}>
            {overallScore ?? "—"}
          </div>
          {!overallScore && (
            <div style={{ fontSize:12, color:"rgba(255,255,255,0.35)", marginTop:8 }}>
              Complete a check-in to see your score
            </div>
          )}
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:10, marginBottom:16 }}>
          {[
            { label:"Fitness score",   value:fitnessScore,   color:"#60a5fa" },
            { label:"Sleep score",     value:sleepScore,     color:"#a78bfa" },
            { label:"Nutrition score", value:nutritionScore, color:"#34d399" },
            { label:"Social score",    value:socialScore,    color:"#f472b6" },
          ].map(s => (
            <div key={s.label} style={{
              background:"rgba(255,255,255,0.06)", backdropFilter:"blur(12px)",
              borderRadius:16, padding:"14px 10px",
              border:"1px solid rgba(255,255,255,0.09)",
            }}>
              <div style={{ fontSize:9, color:"rgba(255,255,255,0.45)", marginBottom:8, lineHeight:1.3 }}>
                {s.label}
              </div>
              <div style={{ fontSize:19, fontWeight:800, color:"#fff", letterSpacing:-0.5 }}>
                {s.value}
              </div>
            </div>
          ))}
        </div>

        <div style={{
          background:"rgba(255,255,255,0.05)", backdropFilter:"blur(12px)",
          borderRadius:20, padding:"16px",
          border:"1px solid rgba(255,255,255,0.08)", marginBottom:16,
        }}>
          <div style={{ fontSize:10, color:"rgba(255,255,255,0.4)", letterSpacing:1.5, textTransform:"uppercase", marginBottom:12 }}>
            Daily insight
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            {insights.slice(0,2).map((ins, i) => (
              <div key={i} style={{
                background:"rgba(59,130,246,0.2)", borderRadius:14, padding:"14px 12px",
                border:"1px solid rgba(59,130,246,0.3)",
              }}>
                <div style={{ fontSize:12, color:"#fff", fontWeight:600, lineHeight:1.5 }}>{ins}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{
          background:"rgba(255,255,255,0.05)", backdropFilter:"blur(12px)",
          borderRadius:20, padding:"16px",
          border:"1px solid rgba(255,255,255,0.08)", marginBottom:8,
        }}>
          <div style={{ fontSize:10, color:"rgba(255,255,255,0.4)", letterSpacing:1.5, textTransform:"uppercase", marginBottom:14 }}>
            Improvement test
          </div>
          {challenges.map((c, i) => {
            const pct = ((c.totalDays - c.daysLeft) / c.totalDays) * 100;
            return (
              <div key={i} style={{ marginBottom: i < challenges.length - 1 ? 18 : 0 }}>
                <div style={{
                  height:6, borderRadius:3, overflow:"hidden",
                  background:"rgba(255,255,255,0.1)", marginBottom:8, position:"relative",
                }}>
                  <div style={{
                    position:"absolute", inset:0,
                    background:"linear-gradient(to right, #f87171, #facc15, #4ade80)", borderRadius:3,
                  }} />
                  <div style={{
                    position:"absolute", top:0, bottom:0, right:0, width:`${100 - pct}%`,
                    background:"rgba(13,13,24,0.7)", borderRadius:"0 3px 3px 0",
                  }} />
                </div>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <div style={{ fontSize:12, color:"#fff", fontWeight:500, flex:1, marginRight:12, lineHeight:1.4 }}>
                    {c.label}
                  </div>
                  <div style={{
                    fontSize:10, fontWeight:700, color:"#4ade80", whiteSpace:"nowrap",
                    background:"rgba(74,222,128,0.1)", borderRadius:8, padding:"3px 8px",
                    border:"1px solid rgba(74,222,128,0.2)",
                  }}>
                    {c.daysLeft} days left
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {!todayMental && (
          <button onClick={() => setPage("mental")} style={{
            width:"100%", marginTop:12, padding:"14px",
            borderRadius:14, border:"none",
            background:"linear-gradient(135deg,#6366f1,#8b5cf6)",
            color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer", letterSpacing:0.5,
          }}>
            ✦  Complete Today's Check-in
          </button>
        )}
      </div>
    </div>
  );
}

// ── Food Page ───────────────────────────────────────────────────────────────
function FoodPage({ logs, setLogs }) {
  const [image, setImage] = useState(null);
  const [imageData, setImageData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const [textInput, setTextInput] = useState("");
const [selectedLog, setSelectedLog] = useState(null);
  const fileRef = useRef();

  const handleFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      setImage(e.target.result);
      setImageData(e.target.result.split(",")[1]);
      setResult(null); setSaved(false); setError(null);
    };
    reader.readAsDataURL(file);
  };

  const analyseImage = async () => {
    if (!imageData) return;
    if (!API_KEY) { setError("No API key found. Add VITE_ANTHROPIC_API_KEY to your .env file."); return; }
    setLoading(true); setError(null);
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": API_KEY,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: "claude-opus-4-6",
          max_tokens: 1000,
          messages: [{
            role: "user",
            content: [
              { type:"image", source:{ type:"base64", media_type:"image/jpeg", data:imageData } },
              { type:"text", text:`You are an expert nutritionist. Analyse this meal photo carefully, considering visible portion sizes. Respond ONLY with raw JSON (no markdown, no backticks):\n${NUTRITION_PROMPT}` }
            ]
          }]
        })
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error.message);
      setResult(JSON.parse(data.content[0].text.trim()));
    } catch(e) {
      setError("Analysis failed. Check your API key or try a clearer photo.");
      console.error(e);
    }
    setLoading(false);
  };

  const analyseText = async () => {
    if (!textInput.trim()) return;
    if (!API_KEY) { setError("No API key found. Add VITE_ANTHROPIC_API_KEY to your .env file."); return; }
    setLoading(true); setError(null);
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": API_KEY,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: "claude-opus-4-6",
          max_tokens: 1000,
          messages: [{
            role: "user",
            content: `You are an expert nutritionist. The user ate: "${textInput}". Estimate the nutrition carefully based on typical portion sizes. Respond ONLY with raw JSON (no markdown, no backticks):\n${NUTRITION_PROMPT}`
          }]
        })
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error.message);
      setResult(JSON.parse(data.content[0].text.trim()));
    } catch(e) {
      setError("Analysis failed. Check your API key or try again.");
      console.error(e);
    }
    setLoading(false);
  };

  const saveLog = async () => {
    if (!result) return;
    const log = {
      id: Date.now(), type: "food",
      date: today(),
      time: new Date().toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"}),
      ...result,
      image: image || null,
    };
    await saveFoodLog(log);
    setLogs(prev => [log, ...prev]);
    setSaved(true);
  };

  const reset = () => {
    setImage(null); setImageData(null); setResult(null);
    setSaved(false); setError(null); setTextInput("");
  };

  return (
    <div style={{ padding:"24px 20px 200px", maxWidth:"100%", margin:"0 auto" }}>
      <h2 style={{ margin:"0 0 4px", fontSize:22, fontWeight:700, color:"#f0f0f8" }}>Food Analysis</h2>
      <p style={{ margin:"0 0 20px", fontSize:13, color:"#666" }}>Photo your meal or describe it for an instant nutrition breakdown</p>

      {!result && (
        <>
          {/* Photo Upload */}
          <div onClick={() => fileRef.current?.click()}
            onDragOver={e=>e.preventDefault()}
            onDrop={e=>{e.preventDefault();handleFile(e.dataTransfer.files[0]);}}
            style={{
              border:image?"none":"2px dashed rgba(255,255,255,0.12)", borderRadius:16,
              overflow:"hidden", cursor:"pointer",
              background:image?"transparent":"rgba(255,255,255,0.03)",
              minHeight:image?"auto":180, display:"flex", alignItems:"center",
              justifyContent:"center", marginBottom:16,
            }}>
            {image
              ? <img src={image} alt="meal" style={{width:"100%",borderRadius:16,maxHeight:280,objectFit:"cover"}} />
              : <div style={{textAlign:"center",padding:32}}>
                  <div style={{fontSize:40,marginBottom:12}}>📸</div>
                  <div style={{fontSize:14,color:"#888"}}>Tap to upload or drag a photo</div>
                  <div style={{fontSize:11,color:"#555",marginTop:4}}>JPG, PNG, HEIC</div>
                </div>
            }
          </div>
          <input ref={fileRef} type="file" accept="image/*" capture="environment"
            style={{display:"none"}} onChange={e=>handleFile(e.target.files[0])} />

          {image && (
            <button onClick={analyseImage} disabled={loading} style={{
              width:"100%",padding:"14px",borderRadius:12,border:"none",
              background:loading?"rgba(99,102,241,0.4)":"linear-gradient(135deg,#6366f1,#8b5cf6)",
              color:"#fff",fontSize:15,fontWeight:600,cursor:loading?"default":"pointer",marginBottom:16,
            }}>
              {loading ? "Analysing…" : "✦  Analyse Meal"}
            </button>
          )}

          {/* OR Divider */}
          {!image && (
            <>
              <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
                <div style={{flex:1,height:1,background:"rgba(255,255,255,0.07)"}} />
                <span style={{fontSize:12,color:"#444",letterSpacing:1}}>OR</span>
                <div style={{flex:1,height:1,background:"rgba(255,255,255,0.07)"}} />
              </div>

              {/* Manual Text Input */}
              <div style={{
                background:"rgba(255,255,255,0.03)", borderRadius:16,
                border:"1px solid rgba(255,255,255,0.08)",
                padding:"16px", marginBottom:16,
              }}>
                <div style={{fontSize:11,color:"#555",letterSpacing:1.5,textTransform:"uppercase",marginBottom:10}}>
                  ✏️  Describe your meal
                </div>
                <textarea
                  placeholder="e.g. 2 scrambled eggs, 2 slices of sourdough toast with butter, and a black coffee"
                  value={textInput}
                  onChange={e => setTextInput(e.target.value)}
                  style={{
                    width:"100%", minHeight:80,
                    background:"rgba(255,255,255,0.04)",
                    border:"1px solid rgba(255,255,255,0.1)", borderRadius:10,
                    padding:"12px 14px", color:"#ddd", fontSize:13,
                    resize:"none", outline:"none",
                    boxSizing:"border-box", fontFamily:"inherit",
                    marginBottom:10, lineHeight:1.5,
                  }}
                />
                <button
                  onClick={analyseText}
                  disabled={loading || !textInput.trim()}
                  style={{
                    width:"100%", padding:"13px", borderRadius:10, border:"none",
                    background:(!textInput.trim() || loading)
                      ? "rgba(99,102,241,0.25)"
                      : "linear-gradient(135deg,#6366f1,#8b5cf6)",
                    color:(!textInput.trim() || loading) ? "#666" : "#fff",
                    fontSize:14, fontWeight:600,
                    cursor:(!textInput.trim() || loading) ? "default" : "pointer",
                    transition:"all 0.2s",
                  }}
                >
                  {loading ? "Analysing…" : "✦  Analyse Description"}
                </button>
              </div>
            </>
          )}
        </>
      )}

      {error && (
        <div style={{background:"rgba(248,113,113,0.1)",border:"1px solid rgba(248,113,113,0.3)",
          borderRadius:10,padding:"12px 16px",color:"#f87171",fontSize:13,marginBottom:16}}>
          {error}
        </div>
      )}

      {result && (
        <div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
            <div>
              <div style={{fontSize:18,fontWeight:700,color:"#f0f0f8"}}>{result.meal_name}</div>
              <div style={{fontSize:12,color:"#666",marginTop:2}}>{result.notes}</div>
              <div style={{marginTop:6,display:"flex",alignItems:"center",gap:6}}>
                <div style={{fontSize:11,color:"#555"}}>Estimate confidence:</div>
                <div style={{fontSize:12,fontWeight:700,color:result.confidence_score>=80?"#4ade80":result.confidence_score>=60?"#facc15":"#f87171"}}>
                  {result.confidence_score}%
                </div>
              </div>
            </div>
            <div style={{background:scoreBg(result.quality_score),border:`1px solid ${scoreColor(result.quality_score)}44`,
              borderRadius:10,padding:"6px 12px",textAlign:"center"}}>
              <div style={{fontSize:20,fontWeight:700,color:scoreColor(result.quality_score)}}>{result.quality_score}</div>
              <div style={{fontSize:10,color:scoreColor(result.quality_score),opacity:0.8}}>{result.quality_label}</div>
            </div>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8,marginBottom:12}}>
            {[
              {label:"Calories",value:result.calories,unit:"kcal",color:"#f59e0b"},
              {label:"Protein",value:result.protein_g,unit:"g",color:"#6366f1"},
              {label:"Carbs",value:result.carbs_g,unit:"g",color:"#f97316"},
              {label:"Fat",value:result.fat_g,unit:"g",color:"#ec4899"},
            ].map(m=>(
              <div key={m.label} style={{background:"rgba(255,255,255,0.04)",borderRadius:10,
                border:`1px solid ${m.color}33`,padding:"10px 8px",textAlign:"center"}}>
                <div style={{fontSize:16,fontWeight:700,color:m.color}}>{m.value}</div>
                <div style={{fontSize:9,color:"#666",marginTop:2}}>{m.unit}</div>
                <div style={{fontSize:10,color:"#888"}}>{m.label}</div>
              </div>
            ))}
          </div>

          <div style={{marginBottom:12}}>
            <div style={{fontSize:11,color:"#555",letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>Fats</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
              {[
                {label:"Fibre",value:`${result.fibre_g}g`,color:"#34d399"},
                {label:"Sugar",value:`${result.sugar_g}g`,color:"#f472b6"},
                {label:"Saturated",value:`${result.saturated_fat_g}g`,color:"#fb923c"},
                {label:"Trans Fat",value:`${result.trans_fat_g}g`,color:"#f87171"},
                {label:"Cholesterol",value:`${result.cholesterol_mg}mg`,color:"#facc15"},
                {label:"Sodium",value:`${result.sodium_mg}mg`,color:"#60a5fa"},
              ].map(m=>(
                <div key={m.label} style={{background:"rgba(255,255,255,0.03)",borderRadius:8,
                  border:"1px solid rgba(255,255,255,0.06)",padding:"8px 10px",
                  display:"flex",flexDirection:"column",gap:2}}>
                  <span style={{fontSize:13,fontWeight:600,color:m.color}}>{m.value}</span>
                  <span style={{fontSize:10,color:"#555"}}>{m.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{marginBottom:12}}>
            <div style={{fontSize:11,color:"#555",letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>Minerals</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
              {[
                {label:"Potassium",value:`${result.potassium_mg}mg`,color:"#a78bfa"},
                {label:"Calcium",value:`${result.calcium_mg}mg`,color:"#34d399"},
                {label:"Iron",value:`${result.iron_mg}mg`,color:"#f87171"},
                {label:"Magnesium",value:`${result.magnesium_mg}mg`,color:"#60a5fa"},
                {label:"Phosphorus",value:`${result.phosphorus_mg}mg`,color:"#facc15"},
                {label:"Zinc",value:`${result.zinc_mg}mg`,color:"#fb923c"},
              ].map(m=>(
                <div key={m.label} style={{background:"rgba(255,255,255,0.03)",borderRadius:8,
                  border:"1px solid rgba(255,255,255,0.06)",padding:"8px 10px",
                  display:"flex",flexDirection:"column",gap:2}}>
                  <span style={{fontSize:13,fontWeight:600,color:m.color}}>{m.value}</span>
                  <span style={{fontSize:10,color:"#555"}}>{m.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{marginBottom:12}}>
            <div style={{fontSize:11,color:"#555",letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>Vitamins</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
              {[
                {label:"Vitamin A",value:`${result.vitamin_a_ug}μg`,color:"#f59e0b"},
                {label:"Vitamin C",value:`${result.vitamin_c_mg}mg`,color:"#34d399"},
                {label:"Vitamin D",value:`${result.vitamin_d_ug}μg`,color:"#facc15"},
                {label:"Vitamin E",value:`${result.vitamin_e_mg}mg`,color:"#fb923c"},
                {label:"Vitamin K",value:`${result.vitamin_k_ug}μg`,color:"#a78bfa"},
                {label:"Vitamin B12",value:`${result.vitamin_b12_ug}μg`,color:"#60a5fa"},
                {label:"Vitamin B6",value:`${result.vitamin_b6_mg}mg`,color:"#f472b6"},
                {label:"Folate",value:`${result.folate_ug}μg`,color:"#34d399"},
              ].map(m=>(
                <div key={m.label} style={{background:"rgba(255,255,255,0.03)",borderRadius:8,
                  border:"1px solid rgba(255,255,255,0.06)",padding:"8px 10px",
                  display:"flex",flexDirection:"column",gap:2}}>
                  <span style={{fontSize:13,fontWeight:600,color:m.color}}>{m.value}</span>
                  <span style={{fontSize:10,color:"#555"}}>{m.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{marginBottom:16}}>
            <div style={{fontSize:11,color:"#555",marginBottom:6,letterSpacing:1,textTransform:"uppercase"}}>Detected</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
              {result.main_ingredients.map(ing=>(
                <span key={ing} style={{background:"rgba(255,255,255,0.05)",borderRadius:6,
                  padding:"4px 10px",fontSize:12,color:"#aaa",border:"1px solid rgba(255,255,255,0.08)"}}>
                  {ing}
                </span>
              ))}
            </div>
          </div>

          {saved ? (
            <div style={{textAlign:"center",padding:"14px",background:"rgba(74,222,128,0.1)",
              borderRadius:12,color:"#4ade80",fontSize:14,fontWeight:600}}>✓  Saved to Supabase</div>
          ) : (
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <button onClick={reset} style={{
                padding:"13px",borderRadius:12,border:"1px solid rgba(255,255,255,0.1)",
                background:"transparent",color:"#888",fontSize:14,cursor:"pointer"}}>Retake</button>
              <button onClick={saveLog} style={{
                padding:"13px",borderRadius:12,border:"none",
                background:"linear-gradient(135deg,#6366f1,#8b5cf6)",
                color:"#fff",fontSize:14,fontWeight:600,cursor:"pointer"}}>Save Log</button>
            </div>
          )}
        </div>
      )}

      {selectedLog && (
        <div style={{
          position:"fixed", inset:0, zIndex:100,
          background:"rgba(0,0,0,0.85)", backdropFilter:"blur(8px)",
          overflowY:"auto", padding:"24px 20px 60px",
        }}>
          <div style={{maxWidth:480, margin:"0 auto"}}>
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20}}>
              <div>
                <div style={{fontSize:18, fontWeight:700, color:"#f0f0f8"}}>{selectedLog.meal_name}</div>
                <div style={{fontSize:12, color:"#555", marginTop:2}}>{fmt(selectedLog.date)} · {selectedLog.time}</div>
              </div>
              <button onClick={() => setSelectedLog(null)} style={{
                background:"rgba(255,255,255,0.08)", border:"1px solid rgba(255,255,255,0.1)",
                borderRadius:10, padding:"8px 14px", color:"#aaa", fontSize:13, cursor:"pointer",
              }}>✕ Close</button>
            </div>

            {selectedLog.image && (
              <img src={selectedLog.image} alt="meal"
                style={{width:"100%", borderRadius:16, maxHeight:220, objectFit:"cover", marginBottom:16}} />
            )}

            <div style={{display:"flex", alignItems:"center", gap:10, marginBottom:16}}>
              <div style={{background:scoreBg(selectedLog.quality_score),
                border:`1px solid ${scoreColor(selectedLog.quality_score)}44`,
                borderRadius:10, padding:"6px 14px", textAlign:"center"}}>
                <div style={{fontSize:20, fontWeight:700, color:scoreColor(selectedLog.quality_score)}}>{selectedLog.quality_score}</div>
                <div style={{fontSize:10, color:scoreColor(selectedLog.quality_score), opacity:0.8}}>{selectedLog.quality_label}</div>
              </div>
              <div style={{fontSize:12, color:"#666", flex:1, lineHeight:1.5}}>{selectedLog.notes}</div>
            </div>

            {selectedLog.confidence_score && (
              <div style={{display:"flex", alignItems:"center", gap:6, marginBottom:16}}>
                <div style={{fontSize:11, color:"#555"}}>Estimate confidence:</div>
                <div style={{fontSize:12, fontWeight:700, color:selectedLog.confidence_score>=80?"#4ade80":selectedLog.confidence_score>=60?"#facc15":"#f87171"}}>
                  {selectedLog.confidence_score}%
                </div>
              </div>
            )}

            <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:8, marginBottom:12}}>
              {[
                {label:"Calories", value:selectedLog.calories,   unit:"kcal", color:"#f59e0b"},
                {label:"Protein",  value:selectedLog.protein_g,  unit:"g",    color:"#6366f1"},
                {label:"Carbs",    value:selectedLog.carbs_g,    unit:"g",    color:"#f97316"},
                {label:"Fat",      value:selectedLog.fat_g,      unit:"g",    color:"#ec4899"},
              ].map(m=>(
                <div key={m.label} style={{background:"rgba(255,255,255,0.04)", borderRadius:10,
                  border:`1px solid ${m.color}33`, padding:"10px 8px", textAlign:"center"}}>
                  <div style={{fontSize:16, fontWeight:700, color:m.color}}>{m.value}</div>
                  <div style={{fontSize:9, color:"#666", marginTop:2}}>{m.unit}</div>
                  <div style={{fontSize:10, color:"#888"}}>{m.label}</div>
                </div>
              ))}
            </div>

            <div style={{marginBottom:12}}>
              <div style={{fontSize:11,color:"#555",letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>Fats</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                {[
                  {label:"Fibre",      value:`${selectedLog.fibre_g}g`,        color:"#34d399"},
                  {label:"Sugar",      value:`${selectedLog.sugar_g}g`,         color:"#f472b6"},
                  {label:"Saturated",  value:`${selectedLog.saturated_fat_g}g`, color:"#fb923c"},
                  {label:"Trans Fat",  value:`${selectedLog.trans_fat_g}g`,     color:"#f87171"},
                  {label:"Cholesterol",value:`${selectedLog.cholesterol_mg}mg`, color:"#facc15"},
                  {label:"Sodium",     value:`${selectedLog.sodium_mg}mg`,      color:"#60a5fa"},
                ].map(m=>(
                  <div key={m.label} style={{background:"rgba(255,255,255,0.03)",borderRadius:8,
                    border:"1px solid rgba(255,255,255,0.06)",padding:"8px 10px",
                    display:"flex",flexDirection:"column",gap:2}}>
                    <span style={{fontSize:13,fontWeight:600,color:m.color}}>{m.value}</span>
                    <span style={{fontSize:10,color:"#555"}}>{m.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{marginBottom:12}}>
              <div style={{fontSize:11,color:"#555",letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>Minerals</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                {[
                  {label:"Potassium", value:`${selectedLog.potassium_mg}mg`, color:"#a78bfa"},
                  {label:"Calcium",   value:`${selectedLog.calcium_mg}mg`,   color:"#34d399"},
                  {label:"Iron",      value:`${selectedLog.iron_mg}mg`,      color:"#f87171"},
                  {label:"Magnesium", value:`${selectedLog.magnesium_mg}mg`, color:"#60a5fa"},
                  {label:"Phosphorus",value:`${selectedLog.phosphorus_mg}mg`,color:"#facc15"},
                  {label:"Zinc",      value:`${selectedLog.zinc_mg}mg`,      color:"#fb923c"},
                ].map(m=>(
                  <div key={m.label} style={{background:"rgba(255,255,255,0.03)",borderRadius:8,
                    border:"1px solid rgba(255,255,255,0.06)",padding:"8px 10px",
                    display:"flex",flexDirection:"column",gap:2}}>
                    <span style={{fontSize:13,fontWeight:600,color:m.color}}>{m.value}</span>
                    <span style={{fontSize:10,color:"#555"}}>{m.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{marginBottom:12}}>
              <div style={{fontSize:11,color:"#555",letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>Vitamins</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                {[
                  {label:"Vitamin A",  value:`${selectedLog.vitamin_a_ug}μg`,  color:"#f59e0b"},
                  {label:"Vitamin C",  value:`${selectedLog.vitamin_c_mg}mg`,  color:"#34d399"},
                  {label:"Vitamin D",  value:`${selectedLog.vitamin_d_ug}μg`,  color:"#facc15"},
                  {label:"Vitamin E",  value:`${selectedLog.vitamin_e_mg}mg`,  color:"#fb923c"},
                  {label:"Vitamin K",  value:`${selectedLog.vitamin_k_ug}μg`,  color:"#a78bfa"},
                  {label:"Vitamin B12",value:`${selectedLog.vitamin_b12_ug}μg`,color:"#60a5fa"},
                  {label:"Vitamin B6", value:`${selectedLog.vitamin_b6_mg}mg`, color:"#f472b6"},
                  {label:"Folate",     value:`${selectedLog.folate_ug}μg`,     color:"#34d399"},
                ].map(m=>(
                  <div key={m.label} style={{background:"rgba(255,255,255,0.03)",borderRadius:8,
                    border:"1px solid rgba(255,255,255,0.06)",padding:"8px 10px",
                    display:"flex",flexDirection:"column",gap:2}}>
                    <span style={{fontSize:13,fontWeight:600,color:m.color}}>{m.value}</span>
                    <span style={{fontSize:10,color:"#555"}}>{m.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {selectedLog.main_ingredients?.length > 0 && (
              <div style={{marginBottom:16}}>
                <div style={{fontSize:11,color:"#555",marginBottom:6,letterSpacing:1,textTransform:"uppercase"}}>Detected</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                  {selectedLog.main_ingredients.map(ing=>(
                    <span key={ing} style={{background:"rgba(255,255,255,0.05)",borderRadius:6,
                      padding:"4px 10px",fontSize:12,color:"#aaa",border:"1px solid rgba(255,255,255,0.08)"}}>
                      {ing}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {logs.filter(l=>l.type==="food").length > 0 && (
        <div style={{marginTop:32}}>
          <div style={{fontSize:11,color:"#555",letterSpacing:1,textTransform:"uppercase",marginBottom:12}}>Recent</div>
          {[...logs.filter(l=>l.type==="food")]
            .sort((a,b) => (b.date+b.time).localeCompare(a.date+a.time))
            .slice(0,10)
            .map(log=>(
            <div key={log.id}
              onClick={() => setSelectedLog(log)}
              style={{display:"flex",alignItems:"center",gap:12,marginBottom:10,
                background:"rgba(255,255,255,0.03)",borderRadius:12,
                border:"1px solid rgba(255,255,255,0.06)",padding:"10px 14px",
                cursor:"pointer", transition:"background 0.15s",
              }}
              onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.06)"}
              onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,0.03)"}
            >
              {log.image
                ? <img src={log.image} alt="" style={{width:44,height:44,borderRadius:8,objectFit:"cover",flexShrink:0}} />
                : <div style={{width:44,height:44,borderRadius:8,background:"rgba(99,102,241,0.15)",
                    border:"1px solid rgba(99,102,241,0.2)",display:"flex",alignItems:"center",
                    justifyContent:"center",fontSize:20,flexShrink:0}}>✏️</div>
              }
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:600,color:"#ddd",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{log.meal_name}</div>
                <div style={{fontSize:11,color:"#555"}}>{fmt(log.date)} · {log.time} · {log.calories} kcal</div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <div style={{fontSize:16,fontWeight:700,color:scoreColor(log.quality_score)}}>{log.quality_score}</div>
                <div style={{fontSize:14,color:"#444"}}>›</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Mental Page ─────────────────────────────────────────────────────────────
function MentalPage({ logs, setLogs }) {
  const currentPeriod = getCurrentPeriod();

  const buildEntry = () => {
    const todayLog = logs.find(l => l.type === "mental" && l.date === today());
    if (todayLog) {
      return {
        date:         todayLog.date,
        moods:        todayLog.moods        ?? { Morning: 5, Afternoon: 5, Evening: 5 },
        energyLevels: todayLog.energyLevels ?? { Morning: 5, Afternoon: 5, Evening: 5 },
        stressLevels: todayLog.stressLevels ?? { Morning: 5, Afternoon: 5, Evening: 5 },
        savedPeriods: todayLog.savedPeriods ?? [],
        social:       todayLog.social       ?? false,
        workHours:    todayLog.workHours    ?? 8,
        sleepHours:   todayLog.sleepHours   ?? 7.5,
        stressLevel:  todayLog.stressLevel  ?? 5,
        energyLevel:  todayLog.energyLevel  ?? 5,
        notes:        todayLog.notes        ?? "",
        wol:          todayLog.wol          ?? Object.fromEntries(WOL_DIMS.map(d => [d.key, 5])),
      };
    }
    return emptyMental();
  };

  const [entry, setEntry]       = useState(buildEntry);
  const [tab, setTab]           = useState("checkin");
  const [saved, setSaved]       = useState(false);
  const [expandWol, setExpandWol] = useState(false);

  const isPeriodLocked = entry.savedPeriods?.includes(currentPeriod);

  const set = (path, val) => {
    if (isPeriodLocked) return;
    setEntry(prev => {
      const next = { ...prev };
      if (path.includes(".")) {
        const [a, b] = path.split(".");
        next[a] = { ...next[a], [b]: val };
      } else { next[path] = val; }
      return next;
    });
    setSaved(false);
  };

  const avgMood = (Object.values(entry.moods).reduce((a, b) => a + b, 0) / 3).toFixed(1);
  const wolAvg  = (Object.values(entry.wol).reduce((a, b) => a + b, 0) / WOL_DIMS.length).toFixed(1);

  const saveEntry = async () => {
    if (isPeriodLocked) return;
    const newSavedPeriods = [...(entry.savedPeriods ?? []), currentPeriod];
    const updatedEntry = { ...entry, savedPeriods: newSavedPeriods };
    const existingLog = logs.find(l => l.type === "mental" && l.date === today());
    const log = {
      id:      existingLog?.id ?? Date.now(),
      type:    "mental",
      ...updatedEntry,
      time:    new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
      avgMood: parseFloat(avgMood),
      wolAvg:  parseFloat(wolAvg),
    };
    await saveMentalLog(log);
    setLogs(prev => [log, ...prev.filter(l => !(l.type === "mental" && l.date === today()))]);
    setEntry(updatedEntry);
    setSaved(true);
  };

  const mentalLogs = logs.filter(l => l.type === "mental").sort((a, b) => b.date.localeCompare(a.date));

  const periodEmoji = { Morning: "🌅", Afternoon: "☀️", Evening: "🌙" };

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", paddingBottom: 120 }}>
      <div style={{
        display: "flex", gap: 0, background: "rgba(255,255,255,0.04)",
        borderRadius: 12, margin: "20px 20px 0", border: "1px solid rgba(255,255,255,0.06)",
      }}>
        {[
          { key: "checkin", label: "Daily" },
          { key: "weekly",  label: "Weekly" },
          { key: "history", label: "History" },
        ].map(t => (
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
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#f0f0f8" }}>Daily Check-in</h2>
              <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>
                {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
              </div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: scoreColor(parseFloat(avgMood)) }}>{avgMood}</div>
              <div style={{ fontSize: 10, color: "#555" }}>avg mood</div>
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
                Next entry at <span style={{ color: "#a5b4fc", fontWeight: 700 }}>{getNextPeriodTime()}</span>
              </div>
            ) : (
              <div style={{ fontSize: 11, color: "#666" }}>Now open</div>
            )}
          </div>

          {/* Completed periods pills */}
          {entry.savedPeriods?.length > 0 && (
            <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
              {["Morning", "Afternoon", "Evening"].map(p => (
                entry.savedPeriods.includes(p) && (
                  <div key={p} style={{
                    fontSize: 11, padding: "4px 10px", borderRadius: 20,
                    background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.25)",
                    color: "#4ade80",
                  }}>
                    {periodEmoji[p]} {p} ✓
                  </div>
                )
              ))}
            </div>
          )}

          {/* Mood, Energy, Stress — each in own full-width block */}
          <div style={{
            display: "flex", flexDirection: "column", gap: 10, marginBottom: 14,
            opacity: isPeriodLocked ? 0.45 : 1,
            transition: "opacity 0.3s",
            pointerEvents: isPeriodLocked ? "none" : "auto",
          }}>
            {/* Mood */}
            <div style={{
              background: "rgba(255,255,255,0.03)", borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.06)", padding: "12px 14px",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: "#888" }}>{periodEmoji[currentPeriod]} {currentPeriod} Mood</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: scoreColor(entry.moods[currentPeriod]) }}>
                  {entry.moods[currentPeriod]}
                </span>
              </div>
              <Slider
                value={entry.moods[currentPeriod]}
                onChange={v => set(`moods.${currentPeriod}`, v)}
                color={scoreColor(entry.moods[currentPeriod])}
              />
            </div>

            {/* Energy */}
            <div style={{
              background: "rgba(255,255,255,0.03)", borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.06)", padding: "12px 14px",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: "#888" }}>⚡ {currentPeriod} Energy</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: scoreColor(entry.energyLevels[currentPeriod]) }}>
                  {entry.energyLevels[currentPeriod]}
                </span>
              </div>
              <Slider
                value={entry.energyLevels[currentPeriod]}
                onChange={v => set(`energyLevels.${currentPeriod}`, v)}
                color={scoreColor(entry.energyLevels[currentPeriod])}
              />
            </div>

            {/* Stress */}
            <div style={{
              background: "rgba(255,255,255,0.03)", borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.06)", padding: "12px 14px",
            }}>
              {(() => {
                const c = entry.stressLevels[currentPeriod] <= 4 ? "#4ade80" : entry.stressLevels[currentPeriod] <= 6 ? "#facc15" : "#f87171";
                return (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontSize: 12, color: "#888" }}>🌊 {currentPeriod} Stress</span>
                      <span style={{ fontSize: 15, fontWeight: 700, color: c }}>
                        {entry.stressLevels[currentPeriod]}
                      </span>
                    </div>
                    <Slider
                      value={entry.stressLevels[currentPeriod]}
                      onChange={v => set(`stressLevels.${currentPeriod}`, v)}
                      color={c}
                    />
                  </>
                );
              })()}
            </div>
          </div>



          <textarea placeholder="How was your day? Any observations…" value={entry.notes}
            onChange={e => set("notes", e.target.value)}
            style={{
              width: "100%", minHeight: 80, background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12,
              padding: "12px 14px", color: "#ddd", fontSize: 13, resize: "none",
              outline: "none", boxSizing: "border-box", fontFamily: "inherit", marginBottom: 14,
            }} />

          {saved ? (
            <div style={{
              textAlign: "center", padding: "14px", background: "rgba(74,222,128,0.1)",
              borderRadius: 12, color: "#4ade80", fontSize: 14, fontWeight: 600,
            }}>✓  Saved to Supabase</div>
          ) : (
            <button onClick={saveEntry} disabled={isPeriodLocked} style={{
              width: "100%", padding: "14px", borderRadius: 12, border: "none",
              background: isPeriodLocked
                ? "rgba(99,102,241,0.2)"
                : "linear-gradient(135deg,#6366f1,#8b5cf6)",
              color: isPeriodLocked ? "#555" : "#fff",
              fontSize: 15, fontWeight: 600,
              cursor: isPeriodLocked ? "not-allowed" : "pointer",
            }}>
              {isPeriodLocked ? `Next entry at ${getNextPeriodTime()}` : "Save Check-in"}
            </button>
          )}
        </div>
      )}

      {tab === "weekly" && (
        <div style={{ padding: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#f0f0f8" }}>Weekly Check-in</h2>
              <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>
                {formatWeekRange(getCurrentWeekMonday())}
              </div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: scoreColor(parseFloat(wolAvg)) }}>{wolAvg}</div>
              <div style={{ fontSize: 10, color: "#555" }}>wol avg</div>
            </div>
          </div>

          {/* Week lock status banner */}
          {(() => {
            const thisWeek = getCurrentWeekMonday();
            const weekLog  = logs.find(l => l.type === "mental" && l.wolWeekKey === thisWeek && l.wolSaved);
            const isLocked = !!weekLog;

            // Find next Monday
            const nextMon = new Date(thisWeek + "T12:00:00");
            nextMon.setDate(nextMon.getDate() + 7);
            const nextMonStr = nextMon.toLocaleDateString("en-GB", { day: "numeric", month: "short" });

            return (
              <>
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

                {/* WOL sliders */}
                <div style={{
                  opacity: isLocked ? 0.45 : 1,
                  transition: "opacity 0.3s",
                  pointerEvents: isLocked ? "none" : "auto",
                }}>
                  {WOL_DIMS.map(dim => (
                    <div key={dim.key} style={{
                      background: "rgba(255,255,255,0.03)", borderRadius: 12,
                      border: "1px solid rgba(255,255,255,0.06)",
                      padding: "12px 14px", marginBottom: 10,
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <span style={{ fontSize: 12, color: "#888" }}>{dim.icon} {dim.label}</span>
                        <span style={{ fontSize: 15, fontWeight: 700, color: scoreColor(entry.wol[dim.key]) }}>
                          {entry.wol[dim.key]}
                        </span>
                      </div>
                      <Slider
                        value={entry.wol[dim.key]}
                        onChange={v => set(`wol.${dim.key}`, v)}
                        color={scoreColor(entry.wol[dim.key])}
                      />
                    </div>
                  ))}
                </div>

                {/* Save button */}
                {isLocked ? (
                  <div style={{
                    textAlign: "center", padding: "14px", marginTop: 4,
                    background: "rgba(74,222,128,0.1)", borderRadius: 12,
                    color: "#4ade80", fontSize: 14, fontWeight: 600,
                  }}>✓  Saved for this week</div>
                ) : (
                  <button onClick={async () => {
                    const thisWeekKey = getCurrentWeekMonday();
                    const existingLog = logs.find(l => l.type === "mental" && l.date === today());
                    const updatedEntry = {
                      ...entry,
                      wolWeekKey: thisWeekKey,
                      wolSaved:   true,
                    };
                    const log = {
                      id:      existingLog?.id ?? Date.now(),
                      type:    "mental",
                      ...updatedEntry,
                      time:    new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
                      avgMood: parseFloat(avgMood),
                      wolAvg:  parseFloat(wolAvg),
                    };
                    await saveMentalLog(log);
                    setLogs(prev => [log, ...prev.filter(l => !(l.type === "mental" && l.date === today()))]);
                    setEntry(updatedEntry);
                  }} style={{
                    width: "100%", padding: "14px", borderRadius: 12, border: "none",
                    background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
                    color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer", marginTop: 4,
                  }}>
                    Save Weekly Check-in
                  </button>
                )}
              </>
            );
          })()}
        </div>
      )}

      {tab === "history" && (
        <div style={{ padding: "20px" }}>
          {mentalLogs.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 20px", color: "#555" }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>📓</div>
              <div>No entries yet. Complete your first check-in!</div>
            </div>
          ) : mentalLogs.map(log => (
            <div key={log.id} style={{
              background: "rgba(255,255,255,0.03)", borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.06)", padding: "16px", marginBottom: 12,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#ddd" }}>{fmt(log.date)}</div>
                  <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>
                    {log.workHours}h work · {log.sleepHours}h sleep · {log.social ? "social ✓" : "solo"}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: scoreColor(log.avgMood) }}>{log.avgMood?.toFixed(1)}</div>
                    <div style={{ fontSize: 9, color: "#555" }}>mood</div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: scoreColor(log.wolAvg) }}>{log.wolAvg?.toFixed(1)}</div>
                    <div style={{ fontSize: 9, color: "#555" }}>life</div>
                  </div>
                </div>
              </div>

              {/* Per-period breakdown */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
                {["Morning", "Afternoon", "Evening"].map(p => {
                  const done = log.savedPeriods?.includes(p);
                  return (
                    <div key={p} style={{
                      background: done ? scoreBg(log.moods?.[p] || 5) : "rgba(255,255,255,0.02)",
                      border: `1px solid ${done ? scoreColor(log.moods?.[p] || 5) + "33" : "rgba(255,255,255,0.04)"}`,
                      borderRadius: 8, padding: "8px 6px", textAlign: "center",
                      opacity: done ? 1 : 0.35,
                    }}>
                      <div style={{ fontSize: 11, marginBottom: 4 }}>{periodEmoji[p]}</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: done ? scoreColor(log.moods?.[p] || 5) : "#444" }}>
                        {done ? log.moods?.[p] : "—"}
                      </div>
                      <div style={{ fontSize: 9, color: "#555", marginTop: 1 }}>{p.slice(0, 3)}</div>
                      {done && (
                        <div style={{ fontSize: 9, color: "#666", marginTop: 3 }}>
                          ⚡{log.energyLevels?.[p] ?? "—"} 🌊{log.stressLevels?.[p] ?? "—"}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {log.notes && (
                <div style={{
                  fontSize: 12, color: "#666", fontStyle: "italic",
                  borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 8, marginTop: 4,
                }}>
                  "{log.notes}"
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
//// ── Journal Page ─────────────────────────────────────────────────────────────
const JOURNAL_BG = "https://imgur.com/a/1h9xT4F";
const MOCK_LOGS = [{"id": 1, "type": "mental", "date": "2026-03-02", "workHours": 8, "sleepHours": 7.5, "social": true, "notes": "Great day, felt focused and energised.", "time": "21:30"}, {"id": 2, "type": "mental", "date": "2026-03-01", "workHours": 10, "sleepHours": 6, "social": false, "notes": "Long day but got a lot done.", "time": "22:15"}, {"id": 3, "type": "mental", "date": "2026-02-28", "workHours": 7, "sleepHours": 8, "social": true, "notes": "", "time": "20:45"}];

function today() { return new Date().toISOString().slice(0, 10); }
function fmt(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}

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

const NAV_ITEMS = [
  { key: "home",     label: "Home",     icon: "⌂"  },
  { key: "mind",     label: "Mind",     icon: "◎"  },
  { key: "journal",  label: "Journal",  icon: "▤"  },
  { key: "food",     label: "Food",     icon: "◑"  },
  { key: "insights", label: "Insights", icon: "✦"  },
];

function JournalPage({ logs, setLogs }) {
  const [activeNav, setActiveNav] = useState("journal");
  const [logs, setLogs] = useState(MOCK_LOGS);
  const [entry, setEntry] = useState({ date: today(), workHours: 8, sleepHours: 7.5, social: false, notes: "" });
  const [tab, setTab] = useState("checkin");
  const [saved, setSaved] = useState(false);

  const set = (key, val) => { setEntry(prev => ({ ...prev, [key]: val })); setSaved(false); };
  const saveEntry = () => {
    const log = { id: Date.now(), type: "mental", ...entry, time: new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) };
    setLogs(prev => [log, ...prev.filter(l => !(l.type === "mental" && l.date === entry.date))]);
    setSaved(true);
  };

  const mentalLogs = logs.filter(l => l.type === "mental").sort((a, b) => b.date.localeCompare(a.date));
  const TP = "rgba(20,6,0,0.88)";
  const TS = "rgba(20,6,0,0.88)";
  const TM = "rgba(20,6,0,0.88)";
  const workColor  = entry.workHours  <= 8   ? "#92400e" : entry.workHours  <= 10 ? "#c2410c" : "#991b1b";
  const sleepColor = entry.sleepHours >= 7.5 ? "#92400e" : entry.sleepHours >= 6  ? "#c2410c" : "#991b1b";

  return (
    <div style={{
      width: "100%", height: "100vh",
      background: "#1a0800",
      display: "flex", flexDirection: "column",
      fontFamily: "'DM Sans', system-ui, sans-serif",
      overflow: "hidden", position: "relative",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700&display=swap');
        * { box-sizing: border-box; }
        .j-scroll { overflow-y: auto; flex: 1; min-height: 0; }
        .j-scroll::-webkit-scrollbar { display: none; }
        .j-bg { position: absolute; inset: 0; z-index: 0; background-image: url("data:image/png;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAUDBAQEAwUEBAQFBQUGBwwIBwcHBw8LCwkMEQ8SEhEPERETFhwXExQaFRERGCEYGh0dHx8fExciJCIeJBweHx7/2wBDAQUFBQcGBw4ICA4eFBEUHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh7/wAARCAYABAADASIAAhEBAxEB/8QAHAABAQEBAQEBAQEAAAAAAAAAAQIAAwQHBgUI/8QALxAAAgICAgICAgEEAQQDAQAAAAERIQIxQVESYXGBkaEiMkKxwfAD0eHxE1Jicv/EABwBAAMBAAMBAQAAAAAAAAAAAAABAgMEBgcFCP/EABwRAQEBAQEBAQEBAAAAAAAAAAABEQISMSEDQf/aAAwDAQACEQMRAD8AiZMt1ojgrHk8RseyYqUmwblkqZZXuBYWNMOik1y7I+zTTDBjqmwbQN/x2TltixHUWtjPsjF1Q8wGMsWmD3sG76NKkchY1x0Xi1F7I07FNSyaqcuyaxWxZymy5u2RYrFCtbJld0Rk1OwzR51TcmIlyVpTwGHipKWVnOXqBWX8kuRYPLo7ditEtxJvNTYsRjpL8YIfzZk7/qM6W5FheW9jIf4N67BOLmxmOTm/nRpT5FheXV5PkltNWS8lM9Et7YYc5LyMm+SMsluQebgryucuvnEo5Ny4DybUhl+hyKnJeSU2TllO4QZOtnPLKy5FeTnkTlkyc877Ib8p4LnK5y6eXsHlZHn2Dysflc5Xk2sXZLySWg8n6OeWW+ipyqRTyTVHN5A8l8EPJNs0nK5y65ZQc8nYPKKmyMnDuypy055Lb7NMKSJ3YN+ysXOVPM5ZPpi8q6RDdFyNJy2TcbIb9me3JDcM0kVIXkycsrBuUwlFyLkD17MnQp9m5KXDoHdm4gMr9DXoyonguHBkrgBqV0UlyXDCIFpWqU6FKeTJaLxxjeibWdqYhGSk6eLhxQLF+QtL0mHZoktpNmWPAtF6EJOikrFYoYcexWptaFFFL1sIh2XiiWdpxTaGGOO4gW7EztTzuDJc7KePKsUmlQqNZKVEFa0aMoM4JA9lJNma9CqQJqpuCcp7HiYM7ngRI1qxS5KhMGueh6es+CN6K9rkUrse4eiLFTIpr5ZlbYxoeo5Jaq2dI/kGa7/pAenJIcfTFpz6LhxIar0yrYp8vQPRqGPQy7Ie+jpkoWyMttSB6pOVARuFJXCXATHIQaiKCImDpCdtmcOkypT9OdmfyU02oJiHAz9LxaJc2PJTxmRam9Iae5oHuCmvYxIanQ1CHG3dGSj2XjbQqi9HFFP5FKVWxcKURqPSPGhSgUWlM+ydTekPH6NEOC2uGwczsWotC12PwZXpQUpf0JNZbMpaGGl0ZaompJrmDPy5CpFhVki4NTTCo2CaY9ozYNRPwMafAEHXJsXYu9GWmMOb/BLdg39mfZnjeRScTwZZTkCaSvY1wrEeGYehn4/IKI0K1HIiw6/0Q9lTG2Q25iQibFJyKITn6LlP0NHk3A9wFRO0LcEl5P8Aaxy0ZRoz4lipyGHyxmgl/AXeiVSLk01ZMr4MtXYYeNEbY/Yy9kueAPDMXMGnVBGpDHb9DwYpz2bychPs2hF5dZr2LfK2jkn/AODpO452ThXlX+yW33YqIBxYYnyzah2R5Oa4NLX9RLfKHIc5dPKVBOWVyp+CW69Bk+EPFThSZLdtEzDiTPKr2PFTlU3JOWULZDyfYN8NlTlc5OWVUc3kzZP2Q3+ypFeC3XoG70S25hA2+7LkXOFN7Iyys2TW7OeW7mCpyqcKeTneic8m7VEZNA8noucqnBbsHlVUZuVDZGTv0VIqcKyyqGT5WS3RLd7LnLTnhfleyXl/+kDf5BseNJwW5W6JbnWjZPgltrRUh+S2iXtozCS5D8lr0c2kdNg1bQ4ciHHQczBXjPwUsXtj02j7CDp4sUtsWlrlEWLxovxfJaxli9C1zWLg2OO6k7eMUjPFonWd6Riv46LXBXjxwy0k0LUenPxmB8DpCjdmj3ItT6RCaag3i4+Dp4wWsdSTaV6c8cNULxOsVo0di0vTn42Kxmi4Ss2K6DU3pCxj0NKTpEzI+K2Gp1CXsvHFyUsb1R0S6J1OuUfgI9HXJPlyS0vLQpRqMcX2OK2dfGFLslpzQaPTnFs0bRcPQ+LAa5tPuCvHVFrGdoYqmBah406JaZ2jUktL/wCwaNc49GaKitjD/AaaYcNg8as6R7g1cP5Hpa4+Ln0LTqzs10S12GnOk5LQNKXCKytbJc/A4Aycr1AxMqRxxgenrKoj7GlQqtDil1YaNRlgzVMHSacA8UL0eoalRJLxdzwd/GiHi+Q9DUY4lJPZSV6KSVth6FqIVzZnjcHSEkMVYaz9OLxhpopJ7OixUaMsb9C9FaFxYtTu2UlyWkptEekWpWNujNPZ01zZOU2LU65wzNQy3Jr3yGlUxdlJNVJsZiyt7FqQ1/Gw4nktpA1whanU8OzJpULXa0aLcIcCl8QEmUv7M4TsCZ1e5C09yZNpsLhvkYxTXVEWuS8phSwe72OE4SkaWlBKvZSUrgycrCrkrHbaCHyV8EjD8hNybnYb5AYM3279E02OTrRDccjkTYpP3BSeuiP9lKU9SFLHROUzc7BPsV8k0pFUuTP2HY91ZKvJpml3Rkm+l9mjakBgoZaaBpd6NEOQPHRWobH5InUocWpsWDFNtIlSpaYtyoD7AYdo1EzFcG+ww8MuZNg3y38k+UlLlAWOkwiW1N0T6k2VSGF5LeLufolZWlBLyUM1q3Y5DnJbpp0S3bscrshuWORc5M+oJybfK+gbneg7grFeS/n6JbmfRssudHPPKJoqRU5ZtNs5+VmeTTlkN3M7NJGk5X5A8uZImXDYP5+ivK5y6NtJnPNuBeRDaTY5DnIbiUTk+JNNA7Wy5FzkvRL7NMcGyutFSL8pbqyGtDMOINj0VipDxQZHRqjnknoIaWwfEipgWp9FhMduwsrxtlLGw0kpWU0p9FvCET4tuhFo8X0OK4g6Yq1Rax+haV6c0nBvGoZ28aM0TqL05rGXJaTnRaXopJC1F6c/GJW/YQ40d/GpM8LiRekXpxWPYpM7ePoyx30GovSEpbcAlMo6pcsHjDFqfSEm2XioKURotKmTp6EoQaopKXEi1DaiQTqGoVBFTydIins3jWhaV6TCnZeKUOeRj3Zmlseo1koWxNik/RcKNk6eo+ghlw5kpXwBekrFpdmao6uE9A1NyTo1y8XM0KShtuy1itOSclDoe6NS0+jNQp/R05hoHjL2gGo+VQQuhjcbKxTYUah4rYtLclQjVoDlS0p0GW6KacbMlcANTD3AR2jrEQD+A0RyhG8bpHRqUXhjUD1WvOsW9i8W1tSdvCNk+KfED0a5PGLBLs7vDgnxUuxehqYjTMk+C8U40Ul8B6LW8V4+yXgdEr2areydLXNpzoywujonPBSUVA9GufjEoIfZ0pVyb2tk6nUQmnIJQ24On3sVi5Yai1CT8S1ip2aPwbdaFpa0KWg/pe5RTUqDRK2LS1F8kpuqKyVsyTWrAtbpo0cvgV7F4zIBtrcB7Wxx6gU1IfCGWiHvZbqZ5JauBwlqFC2S0ZPgpRuYbH8JOSlXwTTmS2q/3IOVUIcoFNNIHxDkWno0WMPKnclp9qSFP4KTqzKuXi4jiBm7DF9i2o2QE5NcJkzdi3YbpDORTtUjllv5KbUWS3ZUKxSFSC4krkE4VMSy0m9V6ISlFTCtk0SKT3fA9oiU32y1onDZQtsZXKBvmTPJBh4zmWzL8g3fsltzQYeOjlKUQ3LhCsqcsiU3Q5CkdfL+Mckt/glN6KWicPFKAjVmmpM2xjBKMsrgMp+AblwkGDFptcrZm6gnymtEt96HgxTZlkiGzSPFzlbbjZE96M33TJe7Y5DkLasjJ9GyfT2RllWy5Fzlsm3REvYzs5y4ZUi5yW1FEN7Gf49E5PkuRpOQ5j2S259mbaeyJuC5F46ZNxLsG/47gVLRDhZDkGF8E1Ohrc/QS9QVIcjC0zcir5Gpzat9mhyjq4iSY+Q0NDbaCpgq4T5HxUhpahLkHjzwdKiEUse1Qan05eLLxxKip+ioUbDS9B40yPFaO0MViTqPSVh6LSWoFKoOiSWybUWufjdaN4zEI7eKjYeKuA1na5NbgyTmEdYc6NirsWpvScVDsYce5LWMv2V4OfQ9Z3tzhI0KDqklK5DxqxI9Jh3wjJd7OkLv6Mkk4EXpPjzwFWjs0vE5tfy0JXoJaGP8isXcopIRXpMXKsYudvoVt9GXqmNOhKOGhiNnRK7N/wBRKoska46dl424BJzEF4qAPRHbNXsrnZoSmXYJ1nMQZwNtDCqWB6hbYJO2VF2bv5AazjXIxZuBcJUybTR4vbY4pJdFb9ozjoA5w2qM1cC69dmSdsYHrRuL2KSLhTsQjn4vlilDtltdAw+noeLcilBXO6M0p+AtPUuFNsnKPZ0yUmaUbFo1MLxfZGVOIOkNEvf+BwtTb+CkpfwOMQ5KUcANTli02+CLT2js5iCGvYaWhK/HkW9wUoiZs0ew0tTH7NzKti9uxSW9EjQkuhVWysUuTZRAtRal9J7CHKKyq4Jba2Im1vZlWzJ9jDj0MBpuQXlqNHSouhaXAtJEPYc/5LcJWyXEjgZBDn4KUcMzbhgEZKGzX5Ni5MonookN7aakFvstrdYkXooLUpKRp8mj+NsymxYkLFzBUfygpJxKLSSUvY9LX87j4NzMGn+TYp1EGTnYZrsOHNG3wZXQDBk4UyQ346Li3Ab6HFRLf2KV0Ln0aFG0B2FX9CrNwqCYcwCMdFF0aJ9Epxb5KXJNGNF0Pk5Ycu4Bu/6hjFEynIN+K2HPYsVIttSgmJsMpStkt0PDxTc8yTc1RnH0ZdIDxSyWosUyHPwPVhYMdJ9A8+g8nANT8iwvJyfqwklv+X0bG2PDnJlrkJU9hwwseKkPlc8g2wydGceQ1eWbe2MyF7J/6mUTI5NVIrKODlltmc/3aBuUy5MaTkP/AJZD3RTahEu/ouRciW7B79GyloVplRWCKmAudFQZqxhMxb2S9ui3Cp2GKt8jOJixjUlYqmXih6HOISoHUJHWOOQajYaScVQwxalyVCkNLUePJUQmX4s3i5FqbUJOaQ4rcb9ltORSkNZWjxm2PjCbOnjWtGiGTpekQ46MpovmykuBJvSUmUkvkd0UknjqBIvQiJMqkvW7DIIzvSeOxiaMrbhUUl2xs700V0bxy/8AsXiqlleKacAztcp+SjXIqrAtTFNmVltck5f1IBqplWDUS5MyvGhHqVpm/YtxRluqEW6Y4/QJS9CtbsviwGpSaRspqClEfBk/diw9RHMmSqGdMoiWTWp2MtEGyVvkYM20KwimbtQHl1Q4tySassedEtQynDBRAaInaZLdODo+kQ9voUXCnSlmycrc+jLE3vlAGj1YtS72Xx5RZnx2Gkhq5Y6lRQ89mmMQUzpUgt0kVNGfZJphxYvHmSkuEZK9wA3EzD0EPo6Q4JydCLUuzQ+Co3dFJVQaHNL7Zo5VF6slqA0taL2aFNQVTTRo6oNJoaUxj+SWpZaXP5N4LvYaSfHgzTKacGXXYtIOeQcf9yqiOZM15ASW+1QWndyVNOTUm5+hk5tNRVyVNiMNuAAfMkt8IrJs3MCgS7SNC8hfvRLmEmhgpFf2jXIZbCTSbi3ZxyT7lnfKFxJCqeSoHJzMwyk3It01syTlexktLmQ07Zn/AEmVNSBOimRUvYN24YS5kCx/MncCqZKf6OiuxOebqQydUZxJnr0SoPTiWDdmy2rMmPDU2vcAmp0aQub50GFXTj0EBLTgf7obEMbGZKm3cA+1QN8sQVG4dA3wlJuIhv7Cf/yOQ8Py5M+An8mbUWxYZu4QKSZc7ZSb0MYXUWgevsptNaIqWGHiuGl+wjKdhyFbDDxb24JsybtTRp+ww5C51INxT0ZtqyMt25Kh4ubrQO+SPvYttVI8ORm7dmlfLM24Iy9BFSKmrZMqLZTpkOJjkqKkGT9/RMwuim70TlElRcgyaYPngasnKF7KimcBz6M2nSQranRRtD2nAzY8UMT/AGyBOcVsPF8UdoUaDJQwLUeNxZax5kYZmn7gQ1mptIIUMpdNjDbhaArUQ0qo0XTO3hslJcBqNZLTEUkLlsWotEcsrFcxsrFeitRAtZ9dBStsHypLccg0ooesvTJLUG8HOhUxMuSsZtiTaEvXyblp6LUf3IjJJAVrPmN/IW9VA+M2VEKBo1L9fYc9opqKC0xxNronTqTJ3snhGT+kGM9X647BK+wlRHAvYDWpqJDgZU1RklAYnQpqyuNuQx6Kf9NPXAsVoczPMEvd8C5mSokMLWWtDzs13ya9CwazabBMW7szXQHobrTNPJn+TY/1WL4NV7CV0VC+jNKmII5mSk2tyymlIN8Bp627YJPUmiHI1GybDgyc0mHjZTWwfYlaylJmxrZtFLTGNKmOhTxblyjXtrXsz7SEE5RtaBtWuODNQ7RlTEa3aiAiogrbiTdKYENCUO3RttPgeNWZp1dANZTF8GcvoV7dG59CLRFMyqCgajgm022on6Mk38Ib8vYzknXIv1Opavglf5LbYZUwGnGY6NDUywllTwP9RrN1v6If9UJlRPrsyUu3QaJUpXEGiM2i+mqM1Uho1zqk1Zm5kp0jbnsehsmtz9E5y7K8eOSc5nr0OUhKTjZsXthE6f2b9IYL3YNOaZSU2TkuVYg2XLkUkmwajiEbncjhlbolu6Rr1tG04GGe3wH7GfsVjvgCMLhKQVW3LMvSgW1FbCUsZuVqGDnyrQyxXYyx/NhLkUlOyfQ8yJ9HGmvvRm/cINQpBu/lwEPD2iVT7BvcuBSuhnItzToydslz2ZOOwwsWpRlL27MnzH7NNCEipmbgnntBN/5NL4EeKVqnCN7kFHFD+kHwYd2RflBWVb+iG90OHIU3+Be9kzKiRmHHIKkVPolOzOaszpTsBh4rZM24r5F3sH7GeLx1dMGnxAbVMzftAcjNvsH3Bm4QPKwkXIXQTdsZqYIyemqHBIb7gG5tmlzL5NfCopWGafBDbkprlkscEjN7o55W5bKc9slr2VFw60TbkVLlzZojbKEF8IytWVju6NDlcoDtOMrTvsrFO/5Gj1sp4pciTreKVGanZWgi9ghKTapjDTqxSuY/ZSx6oWjcR4z8lpeqKxxuDosVqRai9OcQtgk5hHXLHcEpBqNQk2uikMI1J6DUWslKspJd6KS7NFCZWjYQ5KxT8vgY90NNqVXsU38SPfo0QvKbGi1Th8kzDiKND7DloJCVFbBq9mcp7FQlEjIOWbdDMXsl1oaLTCQIqPX7Huxs7QnK/wBGmZsLVslNTEjwtXrQ0quTYqVCLTdLgQ1Llc0Gsq1BThcGiEKno4M5+x577NEqhEZ+jfYb+CluwGtFTM+g56LWtkxAj1pqzK60b/8AnYcO4Y8PV6pB/wD1QTw9sUp2TghYS2Cd6krF/wAWwzDL6blEbdaHhuRe7Jqo0UF8FtLx9sH6ZJxoewue4KS4FioZtOAbHapQZNaADcyaGp0p7K7c2bbloQaopm/iC3A0neiaa3ohp7gqf4g2m55FpDd6NTYxUi0oFoT9yPjzJuehVzcID0Oe5HFexUX6CE5sSQ4TZGWKbR1TURAQnQ9wai0xvsXi09ipW4YaTeO54DiUW5iWcpt3AhHSm6N6JlxMr6KlcsBhhNaSIavop73DZLXbHBjNymiX7stp7JySm1QwMo4bJeoVQOX7B/5GC224lInU8hEUUm6kBjaUJhEyXTUszW+ByhzU+MTYw4K5DlJsAznx2bxbKaUg203QEXSagi2y5r2KjkaU3yZbSFpzujJRLGH8yHIOnZKyoXakH05DNO6Jen+jeTl0Cdh8VjPUSLdt7JemafcDhyKmhmtnPUlLfYWFi9jepBVMinWyRI1tGv5N8aCeEB4uvthp9g2udmnl8AJC3K5B2byfRn3IRUiXNuhnna7M9+gqaKVivl2awTXZnrsRYW0lsHMkzbSQzTlgrC3v2Q47M2icnbKkVIptRCMnf/k5tvb0NwPFYtt+MBKiAmzOdjwSHmWUm9cEPdmmGGHjrUNnNp9FzrolzA4SMtbNC3sX4mSqkOGlpKpMlZcaZSSi2PQlY1OUFRCpUU0vE0d0CbUQlzIxi3RTS+zQkCdbrsfHlbGK3EClAk2ssZ3sY6RnL5YqZkEaaihfYcOx4oWM7WankI7orH5N6YYm1KUqIKaTpcC54BbBFpjpm0/RSXqEZrUgztK8Ugae3pC+OTdTSGnQ4hwtk5L+McnRraSknJDTqdW6M0mq2VvYDO0JOJYu9Mr2bFU2NFoeLuSYnWy3q2TXkEjO0pOAbKxlp8Jma4mBxFRl+hUL+0rJKaFJtUO0tZRrQSvsWm3ozUueicOKv8cEtO1OisZ5o3xrkR6McW06gfF8FuognKuQDLH0MP0HwaJmGBFrnglpyVqidzcDNpamAqfZtXMjFNipwfpjKVSVEsl4247JU12zK3eio+wjU8BRKfmW0Utw1QTyilKdE0Mk5s0ccFbROWqsjFStKeqB1lvZtbZUSpQw2n0ogyiRV09mjnXoQTKU2DyKcdUzekTT0pJ3oVCZl8lXcE0JavVEqsu0WlL/AMjCuxEEp20Z/FGrsWnRJjLctSjJJuZgr0S0tKxjRHo0VJT4imiclDDQbieDM21szb+ACcppmuPY/wAtjFoQDnlkOfFHSFZPLQQBJxAz9m7ujQnyMK5nZmm2PSBuG5FNJm3HRCnaLf6JylNPaKDOIc7ZGWPMnTiYszt05+QlDnDr2HJ0yTSsnJcTscM36oGk72KXDMohuYGScoXBDiWi6h05JaTcfljCpaiIRubYY0rKxUPtgTQ1tQMXCMtOXyP2NIfMuR5gNJFK7Ao/h3rRSdO4IbRpXdlY+sq5lhM0rM2nwS7bgMVIqbN9SQpdSWsqgMPG/YqUiVuxUBRXRNq2zSp0CvnQZNMWFIvenRpTObbnYpixXlT6mzLmrGegyWV6A5GU8uglgxc0xm017Jbv/JpaydmyY5DkKdbgqXCshWv8FLmQPGe5JbmbK24DFbAxkv42Sy/ZDmhw40KAlzRU3LWyU2xw5+qxSal7RuYHa3onK0UFd3MGmyYj0hXEsQUl0E7r9mV4sXiwhpi5GGmMR8l4qqYyTE20MWimoakfl0GptaKvk0RsUlz9DFWNnahfsVFl/RknFCLRCrsdPozbkz0rsSLWUwVuoCXLjUFYtwNNrRWpCFO4MlZSBnaGrU0O/RSmCclexotMWK36CmUkwxFp4iQauRoyVObgVidZLbiDNS7eh+TO7CEOJklp3QvdVY3P9SKSlqtEyL+ZZnMACviylrom9lPexorNTxQKkirBpRI2drKaKqyU2PDtAllxGx0wdqZM6CkZpybF7Bt8b5F6pgcL07kE6hBN0oFWwwapLiSW/gpnPKEGaJVN0Kq1ZM+ikALu5ghqH6K29i1DQhqfoU6bF6sl04ZNipVTNMPgybvgcXxwGGpK5X+QS3IL5NkyTbFwmirdEJ/yLx17FVKX4MtdCkudi1jDEWpceSTZS3BL32Zv7kmmck5mbKn0TOptoa22LQ088ozd+hmKQc0iDLhQZt/k202kaUlYjLlmasU3GwlbmxBspjRk29m5hMltWGEWoNENj5TjBlqgDS42Dl1BTmAf8bEcONMjIWpuQaA2Uj2Hi1Q5aACkzRfyaeNGTGWKivgjNfZafG5BNTAhAvcmx6GJXwEK9yMNkl2zacsXx7FYp/QELuiZc7hlz24DctBBEu9yTCLcxoHV9hKeM9SEQ4RU1KN8uCpQMp60Q1H8ir22EqN/RUJLXvYy9XIuevsYb/uGBfIo0P8A+xvsE4pdsyU2OWif7tgT+FyyU3ch5OJQat6NcfYx0n9mcpk39Fc2GKkZxAyt8hFGmvYhhTT2Cb5ZMxaQr8hgx08uhbSREypM2Th5GlNim4JqWKfseHI6J1uxe4JT9GT7Jw8XV0Q5l2byy7FTwPMEgijcaKlVVg9jOCBRp2Z/IjD10TLXJc1sK2ODAbmdGuHJlD+BngoIuqH0ZSUcVrYRJr02LibgCZ1Rv7nRk5UcDNyAZKYE11Jn/VHAsPWhipTgzkZUSxptNfJsbNLhNGroGdWoZnHU+wj+I6VFIpi7RN9jzvYvcQJOpftiobM0k5gUn2GJtZNxoymdivHydfBSaa1YIrLRl8lP+mCZsEUzV7F7oKT0NwNNrNP4NDKtoXoaKn0N47C5kqZV7BGhuHbJTcuynF8MPTDCZRGwha5F9oX/AEyAD6SCHLKfyHzsaLWVOWMQrM50xm+x4jWuFYadjLTJ3TBGqppwZUw/wIBsv6rJclQnzYuYoExKaTNlE+we2x7YYrA7griQXbs1R2B4t2t2wpbsJh/JWNu0FSHpkuey4T2S1/JpaECvQp+yVMl1AjZPhh6exUzf0bJ3PKGaeVJp6NWzS+0TVRTdUHSifkJfJSh0KnG3fBaqyVp9DNbJsV9Lfbsyd0yVt+isYmyaeFutUTehURe+AUp6sWEUxXsFLg0ufgmwLlaIblyZw7YV5RwLFSKlrHYt/wAkmFRZShsVNSdOAThg3GhUv/uLCDmJkzY10KsVAasP5d6Knkz3RJ4z98CmpaDhyzTuAGM51MIlu6ZdEfQCNcGbnZNw7GgORnuglrmhqdUbV8gak5tjjEyF8aGooNTjXOyXN9lONwHLjY4GxfDNL2TLexrvQyxTi3+iYfv5KcQa0/FiHxMPxtkp3aLymYk55BDhbVgulsyhxNFOrKAc6cMneVIfJcbFKKkojvRFFfyVKgvyc6CDGa5uDT0MtqCYXY0rxb5syU/Ixil8lY20h6l+aTuC1NujneylDV0bWPt4u9s0V9kz1spur5JsqsNBNsNQ+zctN0AxjcxwMdWNP0MsZV8G36Ehv+RMis1T/Ps0xwON+g+9DGLT5bHgjgbFgPl6Mpq38ky+ivkLDxUJI0uQ+xlAMGUJ9hqxbVJozjUgYcT0gen7N6FJsZxmq2ZKxSlGSqgM28XCJeoRU9L5BREIaU5LoL9nRKha/jIwhW9nRJTsFjei8VwAaOY/YOq/Z14s5tSERqZqATYtGW4GFdUUld0iVVFTOgRTMcGTmuTOGjSpDEVvs0t8Dw4CY5BBSNHE0Khe0Z06BNadei1DyVEpTuhT5j5HjO1XYK5kd+jPfQsTRpf+Rk3MaDTbbGm1Sc+gl0pg1QPljOhorcQZOEyt6JqWuwSz1LZls2SjkzapdAA75KrxiQlTo3jcSMi/qfkGptvY7VClOtAipiE/Yr99C1/LmQlcbKiKW69g29wKaj2LtQHxCYZpK+v2bjQBvoJppFNPbBy969CCXW0aYKaqtA6lTsakt1ozbaumZtKuzJ3oQZfLKWZo/ZD3SoAue0Z78pJtFJNqFYk4Ym+Bd+oBbd2VDYgXrRNzod4wmMS2kCsS19ImP5QdGoUtyTFzJOmyfo0u7CIW6KxhwoFVRvctehW4Qx/6B7tQIyofEG2oky6/YuE4IVGpwbysJVoYcbEML/jLg17BqN2MTHQqY4l0aLHSUg06EcLbfAS+5M6sym4EqGOSll+DK1EWKx/AqRcImXP/AJNlo0rRNEjN9meUOAa3Zoty6D8ORVNdEvuWzZcWbrkWYMUu2zNwMw4JfyIBpTsEpmypXRkugBWoNzoY5BQtgMVMJgt9DM0jNTrYiEVREufbF1sVHlofw8DqoHJVJT3HIQxkzfoOTNzKGa0BYzjxZzyfotu0yP7pehhlbiBe2tivZo25gcIRrgmXfB0iVw/klx8tlQB17BO9Js0NbMv6oGav7ZJllR7oz2oQIqlFqSlChkK2Kdjwsfm26hE2/o07lwTMODk4+5I6SV1Jzxco6VGybDM05JbU8lNpkOJ2EhLTqdGmNslOpHbsBIZcCtktXsrH26JsV8XUSTpzBSiJaJlJ9iNXDZLlzBvv6Hm3FDwoyr+oyd7kOKQyp2JTS/gU+J2TLHiwwFu5ZMN5Nov5QIYZD9hUdlVyMypUhrb/AAaVMyZzOgJl7j8jFJ0ZJDjuAIKnei1f0MKIbgzV1yNNKXIr4gJjmx/uEWqbUXsjJXJTtVYP2NOpcXJDTmVo6NSgeNDg1KajZSaeginI409DhLT7oFMyqHjsK50DOnXtG5FemEfsMQr/AAiqglKo6LSUdCxNS/6jKuTP7FpdjRTKds3kmbankGmnoE1TcolyaXs3lHAJpWnBk6sy3Mm5kaFzUJkvaMlcSLTEk+nZL0x+NmVORlWU+jNw7YxN6RlDexpapC1szewm40hFVSmmzJ4xsOIRuBxFVMLdm1Llh8lVA0FRKM4kztUiGwBT7CWkZ7iaNtfABponKW5RTdRwS+QV9DmrKWgVfJpqZAYtPvoH/wAsmftm5sAt9iiZ8eZGeZoQxV70Dmd6BNpQbGeaEMXvSo1pzJtJ2Eyomyaam1FWTDM39DPPRIU/QJNcwK/JtuBKjTL0vkHdTIvcG+AqsTddIZbylaFVMqAXyScKT1Jn2ylWiX0IRT/4gbxaiTPlmi92SrGbYdyzSbhSxHIz+fyZQ3WzPWzY7l0CsdE1NimSlr5NllZAxTdOEQ2qFx9mbVjwSGo9BuuOwbpTUA3EBh4viOEUvcEYuRbXiIlS+Yki0Db3Fl4RyLDwNypM63wKvgzc0+BDC2obuwTXJm4ULRNTKAYuVBnKVEzqyuNgQczBrgeYRl86FojSovkHKVszg2TeiiL8Y3sOYQuI0pD+4AYfon5LJ77kE1lF/Ae2VloN0UTLpNhToXKM0AiHzBKT8jo0tExf/wCeRw1LQp1SMtSzdyUiqWnNE80aaNzCGMflU+TN30iEy8Xo5djsGKRWLaZKuJKieSSLdBlbpEzFCpnYsGKTcShTbDnRSdiokKGYduict24MtCJ1T5mg218kpt1oriWyTkKVsPYzLHmOBjA5xJkvgzkAnhDjp3Bov0baAH7Znc2ZGeKn0OCBGeV2EQzT+R4D5ToVk5Bf0srH+kApbFMFMWxlCJauRUcuCV/7LjQJoc+oDF0wy+aFbhMeJVi/oyb/ALXIOHpiqQiO7ZMXZXMm6Q0tFBa5ovJeyKmNjTpT+ge9jlqdE6faAlL2L21zwaVqRbU0CKfkr2R75MqWxoqt42bBJv0b21Aq5Em1VKZ+iMpiHsU12DV2wSP5LoZsEuS8Vwg1Nb6Nx7KShsK2GpsZxG7NxPAcGtAnDxTCVfYOfsePRWlYbjXBKtfJX9N8hetDTY18G/YykESnYk1tG25BUtlRdgmw3kKUsEoN9jZmWpWgy1sc9Il72ByM9KhaltjD0aVFUBpba/iQ965OrVSrJahyrYGHr2aHGx1kTlTmYAisbUFL+rsEuZK5FTxoiTIriDeM6J0CFQO3sriCX7CHhTa5Mm1lI488iI2Vz7GFfZl9UKa5JAX4HRPyxQlKamWwxFxpEvqRHuqer2S5Vzstuo7JdfRNpwp10S1/LIrK4Ukv0EONHAzXl7DJdUE3DYsVDEOjf1OBTcbNuHoVORmv0E34vRUx77JblMSpFvX+LJm7sluObM8l9sJBiph+7JW6BS0Mxthipytuw8mnBnMWC0xHi0oQNtWCtTJm5oPwsZ5PfIpxe5J17Kxb4Cni5fcGackvoqE6kmlicltsmy6iDnlKaAYtZJFTXbObZk7UULBjo2HlYJ7fszymdBIWFVoPJ9kzuWHyPCx0mP5GlshT7KTpJseFi5hbBuWDcuUDepDCxblILbg2PyKjsE4pKDnCgW/bkibrYQSKbT/loy23olWtl7iaZQqlMK4Je3Zp72KfrYJxlPYS2zNRNmXNyEp4/JqkxxYb2Kpwjn2Pv464tRoG/wDkhPZHOycEiylvcohNv6KmIDA6UjXKsiVc0ylHeicSr9kuZqina9A5QgVMWzpjvZHCkpPpCwlPngh/NFy+TfYjjTYfZpewlLQGrsOejVsa0kBHrgVSsngzcJBgOVrck3/5FGxtueBj4r6FTMaQXsU+2EiapRMcG5iLF6lQjfYE0eOy01cku4lA44DCUpbM5en+gxnReMuUCb+tiLt2E8RZuYkMQze4FOoDj0Zv2NLorlMions2LSRq42Mjw5csn7KSl60Prskg46BpcjxMyKvbGmpcTyUk+Bn1Bpj1IamsnT5FNLgHHDBf1CThbocdpN0aPUCt0BWGNmU8Myv62Vv+kIiie9k5b9FpdkP+q6Q4kPezaxH5saGVU5pgvbJT/KKTfLEVh2rYONj/AINlCbDSwZfBrHjZqcpD1FD27MvYuU4gO2wlRYZjbG49ArNPBScU3qWoJNGkjR9CGN8uRyWqBb6GW6CnjS0qol8zuBdspJPENPEXJot8mqHBSmJb0GljJO7g3HjNmlz7KWNyGnI1bmTT2Zr8Ev8AqhaJGFOUZQ/ZN/Qy5YHiuDO6liphGiLJoDePE0PlfRsqURsiEmISOnbVs3EbHidA3exachc0TK+WaXLRLf8AFvkS5HSeGCyc2c/JwmhlqGxYuRbe5Jt8gsnN6M8mn6EcipXyCaWTJmasJhStgeOziQmdIjyUy7FPcMWHIuaJry7M21zLJb55JVIW/sjysW21b2S0NUjqnOjeWPWjmsmvg0rkSvK23tBL7I8nMC3LDDx0l1DFO72c1kkvYqYmQwvKm6fBMuUkxbbUyF6AYttw54K8lRMpyzShF5VNTMES4lsW62CmYYhhTUW5DWjZRwQnbhBIXl0mXbmTPeqJTqZDyfAYMX2Zb2yZe5N5ONjwvK1C2xTUWRKg0ryhhhWOmwUr2wnhGWUeh4nFPJwbyc7J8pUGlugGM8uqJb9mylNTol5KdDg8utC3tt2SoihbS1Ik2M3duQbhg3BMvysMHl1lvbKTvfyck1BSa4HheX5ZamRklNTESUr0fRx909kpOdin6F6FgOPuip6RE3KKT7exWFjPhimwlJaGVGicC6nZlsFwaSQ6LLegxcOUc+YktVYYWOsuKJ07+gmp0aVMNyLCxTbasHKFKrYymGBk38CnZvH2bTjYih3PBrdFY+ti/QBGgVWrOnAR7iQkGi+eRUTH7NqK9G2ysIqZsy7kaTcoBYF7UyEOrMulwXilDYk1lKcwUqW49k4wit80CNDjtpm2+h/jJMq7BK5pqKJmjKdspOa0PE4naBV79l5VRLV0hBdJTIp3EwSrlDHRKcVlC4knXBtbcmTXlBUTYXLmedGalQynCuJJ8lGgIa1obmx2tDMpcCIKR/yKM9NsPhYz4SNO+INIZVK7BFjpMqCcv+MJ/IjRjaW5YNRcjHGha1IEhr3sVspxDkFsBivsJkZ9GdbJLC9vigep0yt/iA04aTDU4NezRF7FKTPpMcqLyEuTejR2xURBWpw+KhslqrZ0ajFuTnk54Ech1wDfPJnLXozhRyCsMvgH0aano0p5QBYNOEaWtsHMuxamhljf4Kx+aBNJQVpS7FaMZOoMklfRm6FwkTp4HF+yWoSF3aCvKZGJFqNSLiGSk4XZtOWyaMb/ACLWwldFTK2LTxT1P6khoXD+jShHIjKU3GgbbUHRxBGSl0C4m0kipbUA01NGmvYLwzcA1Ld6BrmTZP6A8Hk4M3EGbh2aZtLQsVI1XdjMINpvsU6SmRKxWTfjYOmosHprsE7XoWHIu44JaV+iv7Scmo2JWJbUbJbY5NKjeUFGOJQp3Qe4Zm3t16DDxadQ7NMLck4tN7geYmhYMX5OdJfZpbmyNWzLK/YvIxafdGlyQ8pVGyaUBgxSaLbm5g4+V6HyihWDHSdyZRMyT5SGWXsM0sU2zLKicslATy7HheVJ1EmT9kTGPlHIeXGh4fl18pWjNuXCJ8qrYPLphheV+X0lsyjUnOf2Vj3IDytv+MyHnFkeUbJ8r4UjwvLt5O6/ZvKTm3v0ZWwxN5dfL9Geb+ji2uXoVmtBifK225eiZ9wDdwS8ojTkUh+XXcFY02c1klK2Kyv5GXl+ZTU+xWUbOa0Unyz6Vj6sdU5RXktHJOCuCMUv4HcSRNWxQYl0lQ8QTUhKk2XLJzVLWn2ZkLL2VPIYSlJUqIJTacoZ4Js0LlPQXZMuZ0K9WxYS1PZlkglgomEGE63FGU7JTcJmm4YsGOqim2Vi18EK1rRm4vkWJVk/5dEu3CM22gn2OQKUz0ab9gpa2VChAGlT2ZqxXqI5QSpoCV7kpfRLUK2GVumH0nRzFwbyRKUPYtbYsSzcGb7SM1UmqbYyq1W1AKYkMd3Yy7gSVP8AJlKyNNKUHFMSVKVPQpqYBdcDXaD8IfDs3LdMOHOjKOE/sCwy4bN6N3JSVqQS1/gZnVGfpyFTYFiktqSrUyyU0lWzNzUiGFvHhAr2EqDONKgKw20Su1s3YpuY5BGK9mW2mZzyaLgScNmh2x4oA0eVJrlyZpOhUGn8C0sDkOXdGcXs3wqGWG96RvTN/bYKJkabDtmU+RvRuAlwvJbiZiwlI2UV0bG2LRhq/ZClM6VDmiMv6hjGcTQOWvY86GHNhoxLSj2MOdDW5HaoNTga3yPFs0OHCGG8aFTwNqro0uKM4iIgG2nSJPBNKRh1Blu9j6mGO0SEN0ip+wbhSI/IhwTLehbkyidjPFTct2a0+iXk42LbjskSFzslNxbSM2/EjvsFyGXdphFzsX6N/wAkNXI0pyTLfwLbiZIbXwJUi3E0wmE5M2oM3qgPBwoG51QTls0w4eww8L3YJ4+VmbcEzYsORbblA5biKJTb0PuQVI2Uk5NGlpvgOdDOQ8bHXMkQ+xXKbGrFUm0wbh1o018ktxQYWKlr7J8mtsPL2DbnsMPHVNdQEtOwqiPJsJNEi5cs3lcnNZMuXFhYeL8kuQWVkZZJsHk1AsLHXyf0ZtRu0c1lKg3lccjwYt5Ly9EvJ0wmoZDy6HIfl1l3ZvKak5N1sfIMHl2TV3Blkrs5rJcuzPKtoWJx08pqaITlkPJg6coeCcu3lqfs1zUnPy5bN50rDCvLo8lAN1RDfszy9oMLy6PKnLsG5RzeT8rN5B5Hl18rFNqzjjk3Nl45S46H5Hl+ehIdMlQ1LFNJH0scrVN0ik/oldbDZPk/TrxBnVpkqXQ4sWHKpexl9EyVPvZNh61wUtWyYsp2oFh6qVUszepJpUZORWJ10yaaVmXZOP5KSh2LDXu2xVPYJKzKBErtwKcuzTSg0y5mwwtVg6akqY5I3RU8yTYRf/ET/dZXsG7FgUtlSpIXyVGMwAMK3olvVUWRzsRYqE1sy2wfPCNQFiuLtinRsYkbmAI42tk8N8i1cmqdgmm2rZk4YpblUZ8rngCZv0MwgtfPJt6EMVllUkvKXoynYCLFzuxRCn4Oi3sRZjbZTXQJ8DP8dhU4zrTJfXRVNWTSdC0eQnc6FTIQ+Smv6RjDEy5MtxAkttP2Cay5iio1Ds018glcBpYrhzbMnFip+ghSxanFcR2Dvky6DtCGKXZp6B8E87DCx0+CU7jQTwtCt0HwsU3shttFvm7ObpgnyZpJSvopW4CZx+BepGWBrbNjk6B0bfoCxcygdmxfsU5qQ0YW/X2GrUsWonoPK4Fp+S4SaI7SYz43yEzXYROKlqFJeLU7OcQmaVG7A5wqV8mlyS5TNMuAPycpk237F0tEZe2A8rmNA27JU0Zf3MRyKmaDxU7CXtsG0uRjyW2lRpZKbTMt/wBQlTleW5aJy6YzDamTZOf+4HIlPmWhldthkDaToF42TcX+iPRWX+SflgqRUXv6BZWZLmWZumALdRJMvqfZm5VWTC2ww8Mwtya1cmbxemZ6ngDkMv2/g1cp/ZM3JtZfIsPF5bckN2U8jnKljipFObsmXyD2b4CqxSZMz/7NlLJ5XQ4MPFs3lRMxcg87Y8ORbf2E+yfKVsdewweVqZa4Hhy6JmrVmlRMyGDGb2QnD9Dk5Jy4Hh4pu1LMsiNMlOl8hh4755e7Cf5ZES7SCaHhYqjS02GWp0KcfAYMU3aJ822kDbiOTnllFLQYJHbyl2zK07OOLumVL/AvJ4p/MfZnk3yTk7J5geFjtNeQeXMEoMskOcpwvNQ3BPkp2RlkvJmXLHmK8u2LpwV5XBymSp0GaMfxE6aGejnPJSb7k+jeUyrkyfRE9jNk4p0vspNEJt70aYFhyuymDJuSZa5CY0QcrpL3JS8jjjk05mztjk24kVPT9mV30aVYrskyk96K+7CeeDNqJQg6X2KyXRCc7ZSgSVOrYNy3GhdxOjKJiAMpv4FPa/ybjcGx3EEiKbrcAt7FqKe2D2SMUoqkLhug5SmKJ/yGE6SoibNkl8kT7stOZm2LAG40ZOOaYvjk3FgK6JqKQqYnkj2KbVCTY6JegceUM0vUmV2CGcuZY86smb+BnnliPFcOSWnNULbi2KdsRYF03JlzZvgG/YDFrSNyCbh+hxaiWxFiq5Bu5FXsl9oCxba4RLp0iVLsdyKH5VTyti9bJVFTe4AsEuJmhUP+m/li4WiGBYvkN8gqK4bQtLyzlJqTJ/dBl8mm4QrT8meRnhEzcMVHA04pWg7NaWwbfIk4fSC6SKcRJMxcAMWnV7B2rDali6qaBN5H39D9mUWZqgLA1bMt0VklWzJYyx6PLLUhyL/wD21IjxUt8/INrcGTqCXS3IF5Vb2EXSSCX2M1K2gTi1CnsOYJm1LHJ8tgPIl3YTwthly4NSGrFy4tktxyHk5tme0A8n4YS+EZtr0RflBIkdE08ewcAmyoGcgT5kZ3YKJigb3f5Qzwzd7JbvYNzc2DjsIc5XvkjKY2ZuL2DcNSwV5ZvT2ZuLXINudhWxqxc8SHPYVOzTu4EMVNNImJVsW6Jyj6ANEGbr2Zg3OxHP0yr7NwS25BtqkPFYW3OyZ2GTqUbynY1SKTqJFNQyVoU07ewNr1JLdlZOaRDduQxWF6dEtpU7YS+dg4cvkqQSKXCgU8mCloqZUYhQ19M01dGbcGUPGWAGXphK9s33QPWwByaSlIhu9FNvQOZsYaXyzXJmkb7oAZuGDd0gva7M7Y8Jm9xRDmy0r9C1e6Gr8QpSk1z7GzOUBCdyEudi9SzLoDVKidEZMzlb+gbc1pjkIP+k18PZvRSiKGGXMSjJt86NbiTOEGG/hJ8yVPs4YzJ0xdWfTvLCV0vjgrB5Sc5Yp6lkWLd1HdlRFnPHL4g6Ty2Tg0+QfZKd6K4mWTYpUvoyfIew0Thx1T3ZS90c1TvZc+iKpaYy3RzacxOy8KfIYTonD7KW52yE5QzzIqTpI/3SRLKV8kWB13tG1tr6JWXMGmFsky/wDjB7M/kGAxc8xQbVkrK+SsXNaAYYixTa4N/kY36ECppclJSTNSZOOScJUVtm0/Rm44N/hkiql8P7NKTNuYZgTioqZ2GnGx9mU8IRSNrZvyDlO98FYr2JWFqFRLXMlauQTUxAFjL4NbrUFa21Xsl8+xDDOkbnYekLQFYYKW9IOb6D4FoxuKM39+hW4bNjuwLC6QZZORcpRJL3YDFTEToZqpIU/3FYpiGE27gqZvoIlxItJMR7HF2aeDJw9hpWL5iKB8+tDKajkIGnA/nZUtQpoEqM+hUZqpr4Bt9QS3y9GmaQoXlfE8mBZKPYPJJyMvKm216B1ZpTszaaCDBNbBmbU6HGJbYx5N6mgmOB4mbB/4EPIeXoE3MGmS4rZSfJmVEBHTrkJ/Q/HOwGJfy4IerLbpol6kFY3OyuuDmn6L+QGF1xJmv7gTT0PkpEWHiXQS9mcSjTYzkS4QNzvg1g+bsDwt0qM+wmcY5N+PyM5DMr4Ie9FvJNQiG5cChyDjex4NfINqQVhc+gntGtqiZQHim6dEXHSK8k6RphDLG/4zJ3Bpb+jcV9iPA27IyUp2W1WycntDORDf8YB8+hboWt+xxcjczP0Z9GqXBSUugL4zqaId7OjUb0RlXAGHdgm7FvWtBKko1Y2ujbnj4JmVQrfoAWlFOWClUVHRmnbbFpJhKeSWq3ZW/sY7YwiPYpXJTxcarsliELi6Jdci5ZmpUJDlLQ9BFpcFxNII2gAUxC0Oloa7s0Q7dDLQlc8DE1JSjcES6QDWWP6C+i201GgfyBa5re5DnRenMGa5KGuTTd6NejrDj0T43eg0/SIgprT2W41BPI9OV+alTscclyyfhDez62MI64tXIyc/Z0x7RNitUsjpi3MM5p8xJSdqxWG6JxuxbqJJxFQ6bM7DlUmiturIe5KTJsXFrUstOSE7gU4cGditWtOdlWicdpxRVKXOwSpSl0Kdht1ZWPWiaDUMJGJdClzokzJplRJor2aOtk1UWnSF/o5qdlkmEmmmy01ubM9AtpATp72VOv2ShVImyEWlMfgyqZHgXahugITjs0wbjRbVSTsMLkMa2UwiRFgm9i2/LcIY/RonZOg+5B+xdKn9GSsQUoB/Ap8mtphRghRTDih3SGP4u+RaByVKi9gU1aoVoZTyazdyx4tiBhOTNeSnRk+ZHnYahDTRlEsvLVEtXsNNknP+CkmtkpuYkvgRM5iCXJU9Anu0ATP5BQLS+RSp8ALD9GaaWylMALSwX2aVp2Dlbonm2MsU3USbTMnTsfvQxjSnqzOwmHRl/VYhiW2nRlk037FzAZK0VKeKpfI4uG22SuSvck6WGXEEutlOeHRErljGNk2ZPaM3NIm05GWOnyZP6JT7M33P0OFir9IjKZfZnL02bhz+QGJc80ae2U0oDKAPDi+dA3wjLmR0Msa0rJbKsM99kqkDZOTTqSspNCmx6flMo1jl+iMnagYxWUxZpvoFe2ZrmQGKlTuyZ6YOmpBzMtgqRSpEN9ji/QvsPgxNw/Zp7NlOpB8SUMPATzZUwqIyyZKopt70kDbblGTcCuhgIyTaopRaM6xoQRzqWMtchrexmZfIyLfANPfAxKluwbeuQCMoRLjyOjjb2TFWypVHG7bMsXMitXovoWkjbZS/p9ji90C3qBDQ0/gH7UlvvZLXAyjOfHZLTZcUwfQFqGrFP2McLRSxrQaNaoolzzReKvozxsSdc4Y4qagqLgrxhD0aiIWiXuTo0/kFjNSPS1ErgUr0VHOin5eg0rXN4uNBkncHXJOdnPJOXTHKNGMwpZmp1YpOLFJ6YaEw2CTmDriu6FYhonT8gnwVjYNhJ9yxlFfsrF1MkTOqFXRNi47J9Cn72RvgVsjFutFzJzWdFKyLFSKdNlYslMrkinFzKjk1wgTKxiyadWn0UtwRi1DKxnsmh13/AEipDCpKWtGYUlzjQ03BofJuSTh+A5K/RlH0TVlJNxBqVG+dFcQhEP8A8o1zsPF2VjjdsWniv8lJvQY6KVklI0vbIVNl6oPGHYtP4F2i8ZnYY/BWK96JIp4xopbkmaGebFpKiyWpLgzT1wLS3AkaLdlNREA19IWgNOC8cRVMZ4FoEWyGrfZcTyTKkWgr0bgfcGjkWjWhdmifkqK0DV7FpaGqCCohA7oDb3wS9i0PsAz0w5kpP7DtMNDaTNy6KdGytBpJ50ZW0LpejJ3CDTWtQC9An/E0CSXcnPJRR0a9ktoc/CR/9fkdyLhzRL3dD08VcRIOYkz9mAYpuUieXYzOqDKqysIMCq4+RUdmuTfcDPGmEDbkrjRLaXAQYltxTDJ5KCpBadlDGctzxBkzUrKbfwJNg/pcIY9m/Zn/AFIepwPuDcm4fyZtp0I8MT8GSVml8o3AxilPiQl+in+jm6gDhlvknkp3o0qQCWnHohp7OmVsh/1SOCKUVNmcaZk90bYGHX9X0TcC/YJPUgbNPkFssl+hhm2S1L/8i12DhVsDLioJyn7N5UEXIA/ymZFuwSp27LSuYAhNfZs6ci/5B8vQjZ98BhKoyY5KXRQHZotsaWjO9sAlzDknpI6bsI3KACDbZUcj417Fpa0MUn9GUJQKXTEWiKfEB4yjo/gnkSdT488At9nX50FTA5S1Hi4KaGGK2BBmUxEwVEKHybFQ+wLQsW0aF8nSH4hzK4FqdRFN6BJedo6RNhGw0aIxh0RZ0+gaHKWoaJaZ2foHimwnR65RSHxfZ0ivgIvorStZrs0RHZWK3yhSQamV+Ib4k32Qrs64pRJ2Gqw8BLt6EyTbIXFp6spfBCVFp0RWki+6LRyTcnTHoiqdFrWysdQycX0V2Z0YpexXoOpFTKWiKrNWlei8ZJxb2XiiKMdcZ7KS0mCjgX4ozokabt2PRE2UroSsWvyKlcGXMDboi08aOGONIyQwotSTTNyERqx+DLl6ERT7FS+A5vY3HoVI7Uvg0OxUoYSVEaep6bKfqggpJvYVNpSQ47s0X8Cl9k2p0qS0mSpZaVSRpWproy5Ky1L0S6dWGjT3DsOSpe4gL6pi0aeaJbuUU0gauGLS0qZlmUyZJyMN5QwlGqW5k5ul2y2lSkGlMi0a0yrMo6MldFK1YaWparoI0dInZoQaJRFEtezoga9i09SlRmuoKVzJklA9PUQw020jpkutEOe6CfpiasW5mDQuwiBkzfsKbM5VmVoYbJfRNyU9rsKThIA12Z7N8mmpQw3yEpJxoXHyTN7HIamEJvYq0DeOgB7slp8IZTvoJvYwYfJNaRXHaRD7xAlSob0Q2+ypc+uQrYAts0u2PF8kumBYpth5NUaVMhT5GFKtm8nDXYPXwFTewJvKuZJvTCbcmxGeOk9Evev2bye9GehQB5WZP8g53IxEXJRqVIltzPAP3wLf8RGjJ+7NLnYMaA1pqTTLjRLlaFtjSGocSS/6heqMkm7AMlNOzPRS/wAE8tSBiH5bKTjYKYlDE2wA044DmYKe5BTNsA017Bu1aKSU7CghM1xBt3BttSOnQw244CHZcfk03Ii1OXp6M9+imlDXZL2ItK/KKUeIfo1c/oCrOW0VDijKsW0M/wAZlgRaUbshp7kqppWZcyL4lN9j6G4sY7dBpWndtApmQUFNxlCGnSzNPijS3c6HFwJLX4xJqW1ZUJOQhOWKDUNQ4k3+C3AvFS5Hpa5tMeBcxcQa2okBoatyEQ72dEpqIF4xMuR6nUmW9QVFTNgpkC1+BWui044khTCZWKvZ2OuTjrg/RS3onH1ovyURBnVSM0lyZTwaPydMUlsi3GsjYv0KbbDSHdIinOVrZ0xS7OeKjdnTF0R0ry6e+h9wbFMpY+zOnIyOiSXJKR0SlcEWnikwbmkS2Wr2SWCHscVexSWoFXRFq46L4Mlfs2P9NlVNEaWFbjYr5gyXsHTJ0j9yaI9+ion0OKaJtSy+BW4kYozSTItMq6KpE4qWWrWibUWlXJmjJN0mVD5YvSdQ041+xi92UlPBSxsWptwQ/gR3TZmq/iTaWjh1+w+CoY496J0amG1BoOkLx7N43MivQ9Jj/wBDyhi52ZpRoXpOiFMyap0V4tqdBDti0aPqw/0XzA6Vj09Tctgq+yqQqNC9FrKUHOyo/AtTYaJUq1oHqeS2nGyGod6HKcolw29hLXyy6n0DSn0PTlEfxiQa70XUEuLWw05U1LvYeO7ZUY9QbKn0Vppa9Etcltr2DY9NDmGEMuqVmasJTTVyEOy2mlwS1LK0N9EuZK2Og00+5Cb0IdjgP9tIluHoVp2Z7CHictK3s0/yZnEQaNXyUlv7d/JvhGVTJlvYfAzjsKci07BVsCaKtkTdltQam50OfgbjYNTybV7HpTCDTwNTBoh6kt702iVYiLxon1NlyuVIbpABC6YJ+hcqSYvYzL9f5JehieTNSgCX1NG1RTjUbJcsDKrZp3Rp9BEO2UTbUmVuFyzW9Cq32FNp57NWwmI9GtqBBX6GY4JubFtSImlxqCcvkXW7NxIAKuZG+EE8waWqGRl7fBUNtsFLTkab3AEqku2EX7Nbrg1Ji0m3wjSzcG52gJn2uSdOmVEaBwnAA4uomBcpQkTjNnRbUsE2homXotp7egfvQk6YV3wZRK6Jbf8AoU1NgRiNmltxBbtTBPiwIt+jXXAdu2Kd6gE1SidmehSfyS2nS2CVe0jPfsyT7He2IM09wgTu+Cpy9GhPbtjiS9S9dA+UkLiYk202uWBBKb0O6M04llL2AfPFpWVjs546OmCZ2OufOHTGVwXibFVL4LiIZnaqc4VHiPTMtCtxwZ1cjJPa0OKdjijol7ItazlsVReKBWzokRarCkykprgEp5LS6M7S8lYpcmtOioXJmlOyNPBBXw7GOIMleibSxlMFJxszTizJT9E2wLxv2i8U50GCizokZ2lREaNiptsuJqBxUGd6RaYmzJOUVjP2WsfZF6RaIWzJVZcWKV6J1PpKxei8cYbFKFTKZF6RahxwCT8uyuaQwT6Ra2KfRoLj2V48CtRekeLiTNPXBbXEmU/YtL0jx2tAlc9HWP4thH8oTlMXoToJVHBkrLS3CKeNWydGoam4ofG3BSTi2K/LFpamO1CI8eFJ3a+yWqDROnODNM6RTfAPFLQ9VK5vFrZlHRbxg0Bo1K1Q/YrV0MfFBp6l9EtVbOrVkvENOVLVUQ5OkOPYRNFSnKj5M4KyQNRyVqkuKlkuWXkuoFK60EpognLZ0aRLW5RWqlRe1wMrnZr4BocpnnYQ5No2P4GaWrsPR0alRyQ9xyOUGo+CXE2VeiMlYzjPeidTIXJWS7HpizBLXsXl0OCxl8mmnId3ZSu27GgPc2H9xnq+DT6Ay+5JScszeMQzOKgcoKf8XwZ7mJRMvllXwAaXEzQOmZw9ux42MiupJuZM8nEiuRfDwPdhtFNdMhraDQbsHPGzJOejNQ5bA8ZavZMWU9dya6oCNPlk7mCn2yVU2MjxdGiWnwH9t7KxlgYa3YamXBeaIe4AK+DPd6Il2aW1AEtxtWGk0C/AvUgTcKaNSN+wW7GFuY2TIqWok3BIKmboW7sm4nZaS+QSltPUm5THyWoN8bANCch4w4KahzI3HoEiLlsZ9XJphUYRKc8r6Ibt2M3APUaHCwSuxXybn/wUpgCq3CiiXK5NMbuTad2JONekhh9G19lcIElVUwFT8FpWS+VsElR2CiXYw/HRsVYAdzQ8miUxY0tE4qzXDhm7QTC1A0qXyVj2TM8lIQfPsUdcFuQxxovFUfftfanJRXOv2CaopUyLR5ZI6Y2Tijov0RaqQ4yWlcoy1BcKNwZWrkTF2XjsEqKaoztVYpR2UnDdGh+OjKVlZOpUvZSQY9FJdmdqVLUFparRsNHRa0Z2p0eG3JKxs6RezJSybU6rHFfYxG9ilRWKszvSLVQEOdlpVyUsTO1FqcSlAvFxLKSItRoSnaLWP2ZYu/Z0xxbJvSLU+MSS049nZ40DVsi9I1ziGL1dnRKogViL0i1DQtPstF1BN6RenKOQ8XJ0i2Pj/FyHovSI+zJejp4wkxxVi0alVUDyuWWldmeKinYrS0JX6Mpj+k0P8C58UI9DJcq9HRaBRyGjUwTlo7NNqZg5ZJp2wlOVK246Jc+KjZ12kw8XPRWq1DxvVmxdsrxc7FJrY9PUS/HYrdjG2D6A9D8orRLjjZbVzwZqbSHqpUdolp8lvSCEvhjlXENVEmWPXQ6bTKXDK00LG2DmWVkp7Ie9jn6cb72TkirfJlqdFLjm1Do2rkt3QPGhmMn/ABtkOjpk7dExsAJollT/ABCKlsqKTAan9FZObD7GBwF2M8iv6WUVS09h6KcBlMsA0yS6ro32VxK0MJUwDl/RT3sn09jBiVJLypotucdwT2EB4f8AkErg17aBv3EjCpf4N9E4u9Shl6diGKX9NA1LkU6cUGW4EINroMt0jFbULYzCqoKS7Zk0lDVhUAkPUE+LLetmiLDQmHPRlM0W42Tk1KhjgM05YN4m6F23xIgm3c2aGXHdkwk7YBKnZoZbTgzx/kg0kXJTWigyfIfSH6YpWCqpgqAAtP2UnsnVclN8SFSH/wDYyfsHseuBBdX7Je//ACPEkxGUBpYZrgzdbNltDEdNATJpuIDkzfIypljIcSV5MyQxYVLZJqyZcbRnVSMARV8lpVs5rV0WmnyCaprbn9gtqCsd/AOfsRKl+LYYv6DF9FTLD8Szrf6IUTZd9ENQ2whKbtoG35SZOpK5nkpLTaZSTXYJ+RSfugGPwyhMtRBEqS1DZ9uvuSFYlJUbG1Z0xVEWqxoSVIUnMIpJQUk/RlabQ5RSaGJBJEUKSnkY7FJvqxWMzJnarQpjZWCqdmxluDpinMQRajr8Vjj0ikmXGoLWPJnemdqUo0KV26KjIUnNEddM9ZLtC8fotKVYwoMvSfQSdHXD0iIlaOiX7It1FphtFYqZgUi8YRnai0JOilF0hvkGkid1lqkrLSqwx1R1al0zO1F6c7uw8W/o6Q1JsfYrU+krGXPBa657KXKijQloWotRA/A2KxlqibU2iJw9ik4s6Q4jg1qkT6T6RD7iRiJ6F++DU3Y9GhJyMcRA8GvQDUtR7NTlMp8rkBWnKzRoSdj7N7Fp6lqiMlxB0cg1VBKqVCpjGlsqEKSvsuU9QsEmaKibOnEvYNvTHolRkl5QQ+Z4Oj75IaUWVKqJyXWiX5LmJOkVSBqUx6uVHaklrcWdPFTFk5qHQ5Vyuf8AkbS2ZprKkMuJ5Q1DLUyR9HR+yXMxwVKcTCm9A2vyVlBL6kpcbgJepoza0waUwhqhZzc+cNlZN8Axm3dGfQupr9hKjYzS41BGTqinEE5eoLhjJtLpMltzHAuQu5KCp9h7NUXQTzIEdcGdOTKOTOJbQxjSmuje2gvnYuGrYwly1CM2o9mbStBTsArtaJdeyqj5FUuwCIa9Bp0rLaJbYApvljxr8kyyk5VhYQcyaeNFOIolroQZagVuQcyaQwKWokJuINLXoJ4bAlOJ6RGUTotkZboICtDZKbKWUMeA4zDUhqtm9TsVqhBn8gpfJjVIEd3JOSK5s29hCTBm349F5KGuiMv6oQyKpoFl/Bdm9BCmAJTns09ux77BO9CNd+IPfs38lyZewIubbYXKGWkuzK7YJP8A9k38Alsqob5CeJ2EClEeyW3GxUfRnFvgE4wVqWM8/gG+4kCwvxns2LU0Rk36Mm07GMdpqQzctQRL5GbkWIxadXwOTcbs5+Tat2dE09sMSW3Ek35KbRSiO/snLKpkPoaXDekZNrbkJSrcm5gosXjzAq6IeTQz/JJiPH4vEvHYY4zo6Yqj7Nr7vleKhQWlFUZLnYpWZdU8VjvUlpBjqdHTFEUqlJopY3stQV4y6M7UpS4KWLW0WlHyUr5M70nUrFdF442UlrovHFSoM70m9HHGYK8Y4Lx1ofGTG9MeukQKpwU1Y4rsi9M7SlrgVjDa2UsYpl+KTgi9IvSFjtnTFTC0WsYJ+UZ3pPpWKWpopK1KFJTZeKniiL0y66CWq/Zoc/B0SofGCPSL0hfxZUPSbgYvsvFVOhWs7Updg1o6O+Rjgi0tCTaaaN4tODosVHszx9i1HoRKjRKvLWjpEvYJQTqdV9EtSy3STJd+haWpaSTiw9aL+gSWL+RynrJKds1aKinQND0aia3fZleMwXBvG546DT1DTd6MqpHRpdA8Zbhi1WpuNI2uCktqDPGUPRqIUu9hG7KdP2DVhKqN9yaDSoBOW+CocZ2oObVnXfJLxuR60iY5JdFxQNXElaqJ2obJzXJbUB6iRxcQ1vKCYbcM6tVBOfyVD1zruIM11yLh8G/t2NUc8pS0RPo65KpZDh6ouLiHOjO1PRdEZU0UuUPXoG7Vmy2ErsqHjNzvZLy4KlXKJbQ4qBud0TyW1zwS9toqGzdaIS2dE62TFyUQmu4BqTexSnmAAffRteym1qNBk1EDCXdtg6f0V6/ZM9sog+LHFuym8UtBC2AUtaDe6GVQZJzQibiCXJWWrYOnoZNTewW4Q/5M3EAbbizTMpjq4B7mQhatuKg5uuCmp0widMMLWSl2ZRJludGiZYA0Tk70VbQQACXJvG9lNTQ8P0IxpwUojdg5iZNKBJTngIpmxeyo9wAEQokEu2VESTk6/wBCgZtLknJy5FuFOwWV6Kwjfjoy3Jk1JsmpiRBt82GnCGRUQ0wETcu2bF8b+TNpQbUV8gF20h36BOaHapxYqkxAPaM5T2EoEmVxMGb90TepGHMSUZX4M9bg01qQbUCLGijRLnUGlRMQK5UgFJyoglmeXyE3EAWKcTJsN7JbaszdqBljqnLa10Ey4ghOHLcm53scicdErhkt3BpTULYZPVyEicbyg3naZOTRphwPFSPzOKjZeKhSVEszxg+len3SnVivQRezpjjZnbC1SS4ZWCgyxg6YLsz6qarHGioUmVbLSMrUMkrFLItY8l4qjO9M+uk4Yvl0dMYFJUVjjdmPXTHrpSUaLxT6HHGqOixhGN6Y3py8G6KWPZ1SuOCklsi9s72hKNL5KWP5L8YQpLuyfTO9J8XDHHGXEF27FL8GdpegsX4+xxTk6JTwZKCPTO9MlT4g0Oa5LhR8jBPpGpWLpjCgtYxc0ZxPQtLQsZuDJRPRUDTTlk6VqO3wK6Qv0K9bFqbRjP2NNlJNPg0ff0LUalz9G1lCKit6GFEj0tTrYPWyv8ikrA9TxC2aL0W0thPEgNZqOF+Sb4orKJVk5PoDjVGzNJ0h4kUlGxapDmJaFA927Nq2NUDTgMl0VNhdyCohqTNLgviwfRcqoh+Vhcr/ALlsj0UuNlqkQ9u+C3MxJLXqSouBNzqiW3MaFuJckv2VDjN9dgnds0QjNLsrWkEImbr/ACXla7IyUKRxUS9eyLTZWW/YfLLioMojZGTTaaZT+AiHouLiH65JcydctSc3MlRUDa8QfUaDbgt/07KUniAcK2b1P2GbXYQ8bJ04giXK6FvlBJcPDUBi2n8B90EuRyJXK7JncOTbUQEvXA8IzKQezL0aYYGruSZc9IrfRLXGxxK0+kS8nsy0ZJDDNrs0/wD6DiOR49iJS9uTU3GzLqSmoUiIZTPshtb3JU8zZOn1JUJSVOBr+5hi4xbHfFiCYeilFy7BOzRbHhM0zQ5v6NyKsR6bj2TKlWV6TgjnQYNVUMy7C5qjNtuWGEd7oUnxRvGp4M21oCLmFJGUsuX9mSpyxYNc1vcA1/LdFOpoYtoYCid12Z25RrhVBeK4mELSS04sMk9wW1ROT70GloyX8VBr266HsYp+gGhO1P2Vjq+wva5FzCkVBcWlZEOYLSvoHVzoITKNzQPezcx2U4rkAnuOQaafop1ckt+6HCbnVGm6NO1wLSA1SvDZDj7FPgzb+xwhcuwlpG+WaVFjB+zX/wAYSLxc7AYdO2TPs3ZM240OROOjfAXpaJnvgU+mOQ8fw0oRaxT2UsVNFPHo5V6fY1PiohMpYj4uFdHT/p4md6Ta2KqdFLCfk6rH0aPoxvSPSFh8HVIrHHiJKxxZnekXoJXKOqVwOKqNnTFRUGd7YddBYNKrLxTmGisdWykpMbWHXQxxuJOqw9DiqKS9md6ZXpCkcVtleM/QpXBnazvRhLuTQnqoOi+DZYzpUT6Retc4XDKSZXiyljFsm9FoX9IxdFadiyNTrL+JovsVHNlrFi9I1MPxdiU1D0DmZ5FpayVPszVbNxPJUPgnQmIsz2MR8dGT5DS042+h/wAGV+ioixahLibJOj7CGEpQG4vgpoyiZ6DT1NJgnZXPsB6cLVcEZKCmuJGGGnERyHj7OkPYeNyGr1DVhknB0WtGjfoNNzeqM5KcNs3j/EpUD3AZFPVkzDQLicr4Jauy3yDU6Zcq4lykc7uzq/gjKtFRcQ4ZOcp+im5mwq/RcVIjL5NpwU3UtGbUji4h/JGWimpJaaRa4H2S/Yv+qNjE2XFRLTXolymXFVZzfU70XFwZXNnPJa/kdHD+ghQyopP+jJ7oeOg49jNGXbojLZeUJ6/ZN30XFoho3lspcg2ioWt/kzmRXbBra7GlnOyXNiwheQ4Qe5Mkrkp6CtAbTo1yNNWHoZFGSs2mZ5WBF3ZLuxynsmJfQEqpF060Hrkb02Ihla6N0W0ukZRABN72OIci7dUPCaetg02Xi+Ae4TGmiHHs182Z72KiY5FhMlHyCbmCstdEwENXJub0Sy8K5DCbW9G4oqaj2HLYgHWwS5ZaVBlpBQly18Djv/uLiXRlagVGjbDxsry4aB/IFuhxauQfouqori9i0tcmuTJcltSiHH4CjVJexiLNi2q7K4sQDVPkmL0dedQQ3/KNBC1KT7CYeXoqPU/JOTouDRPWuQmqoza1DGooeG0SgX6G9STqbEFJ7Bt2NtbM8a2OEJ1YN4itWg9DGqMwM2EgLdaImfRTbiGznk7ocF/Vrn2ZKHEhF0UuyhH8xWUlqRS4RWKllXp9W0rG7FLqi1jUlYq7Mr0ztbHF1yWsbLwTjo6LH+MwY3plesRjiyscXsuG2pKWMGd6Z9dHFbkrHFRopYrZaxu9Gd6YXpKXLKS+hSuy8cUnZnemXVbFFpX6RscUpLS7Mr0ytTMqkMTCiy9aQpW0T6Z2pWNbsq0Wkm/ZUNkWp1Pi4KioMt2VE62RaVrm1UwzRejo1ly6BYyGlrYq7iC8ZgElXBTom1Oh2yY5RXt8jH8oFpajmWr0VzsYcw1Qw+Q0tRfP4FJTqimlybx4QaWn+MUV3No1C72ydTqWn9GS/lLsYHahho0PmSXGy3ZOS3wwlEGUR7Jh1ZUtexTUWh6qJcxKJac7OkfkYcQPVSoh0mzOeymqDuA04H1JLLduzVHserjncehvXBXpkOtDi43rZNbgW2S69lRcDtugbaiKZT1PJDaKio2Tn0S7d2hcTCCtaLioHEujllE+zplBLU5NdFxpEQ4/8hkdInVkZKmioqIbu6BttORcbM0piS40kS99Ey1sp8snN3BcVA3DoiFItuGD1SKkVBlqqIbZeTVzsnJqNlSLjacOwb3wS8opMltwVh43EkS+38DLfITCfZpPxTUt8g9/I5O4BJSMlvlNmlcoJ09E5w3sPpGfQOb4GfQ5PoZVDnugt64KltXya1oog9VRrVi50xUykAb5slx0X8Eu2BDIlN+WypnZlTcIaatSZ8yZRE8ik4FhazipBsW26fBN34wgwM6cslu6Nk+GZKGxyFq59DPL0StWxdoeJ1UqNSG3QTtikoYrAdpzwDUvQr9G49iDRC5CPqRljW2BaIfZvVmipG9AWqUf+DU96DmWKSgVg1tqdEtNS0yo3s3j0wTqIfP4GE2LhL2byaYsGnLVUZNOJBNfIpIMGniiEmuJLbfZOW7FBrJxz8Cpm3RnEjMwnoC1nt9kRZbq0D1scLU3HoGl0JoUDMc+g7/RTSj2Z99ANTv2VirJ1LkvHcOwFpWKnQNbSOkQpJalqwT6c2n2DV0dI546C+xnqI/ugLb1B0aSYNsIPSIqHZLXXB0qIlgkkM9FsyluGUpW0KfIx6eFY0novBQ9SdFhzApQrM70+hehioLxx9Dji5g7YpRBlekXpKxUbZeKlQKxc8SWsWqbRnemN6KxcRBSSqjYpPlnTFIzt1laFi4ktLclYzoY4dmN6Z2pj0OKkq+hWNNE2srSkodisVGzJQxae1CItZ2hKl6KQpWXilcE7ibRim70Vo0cNwMXZKbWSkYhSbUzyNP2STX2MJ8GX4LSmXyTqbUxuUkEPejrH/2syUy+han0hY36FJx/suK2H0TqdaPUg1UFPiwfexFohWjaeikmyon4DS1z4/0M6op60DS6DS0f3P8A7ilLhjTcQOmmwPU/mjO3oq7aD7gJREQ09hDiJKrk3spcb6ZpSNOUD6CqS4e0GlZT3L4BtSEVBEck3LLlaDKrKlXHPKpabDamSnqNEc2VGkEyogPijotktMuKiMp+yHa6OmWLdEZKy4uJ9GZceiMvn6KXE5dg3bY5OLZDfRUXI2T4VI5t3LFuoJnllxcjfLM2lcmy9k5NTBUXBlpnJu2oOjddEuW2aRUS36Jcy3It8LZDqC4uQN1LJbmtF5WqOeU76KkXGbeujTJMyw8kuGVisOS37OeT45Lyan2Rk/RcMPK5gU+ZvolzFGXvZWFVzPo22TfZWMwPEtDW2Un/ABjsXpRskMSzlP0K9sMuwbnQ8Jbaj2G30Q25iSlko2LCrObBxJo5HdIZMjczI8WyJ45HIjddJoyiLZzl6kyfAYHRqJsJqgX4M+5CQtNUmrFVYJpQNSGFa3oN1Bk50hl8lYnU87G4M2pg0rhCGrmLgU5eiFlG9opZL4FYWl6hUTaZTaaBr7FgKFOXolNtzorBNfA8TqnvVEw5kqtIzqOBUtZvVA2567CbsU0GFrNbUTBB13iiH+gwtZamRa9mjrQNrQYeq52MLu0Tc0WlUzZOFalzt0Gr2W8u1INfxiQL0z1HZMb9C5Mq2BekR7KidikuhUbAekxKBr6OvMslqRj0nVQZSnopq7MomOAHotfxmSXO4gpSwuZ6CQvTVOqB+xfcmabQCUOImCXjKtwU5Zhl6S1RmrkuGlJL1LYx6S7UIO3wU0+wSuKHhzovDgnHG4Z1mXegh+XZxNc/0nHF7dFpdbOkLx1IP8GdqL1rJFhgnEM6RWjO9M7SlFnTFWwxXMWdFPZnaytaL6GG+Ri4FVoztZ2slGxUbkpKVpC0pmCdRaElEJyPizJQ5R1xXsi1nUrH0OKuykqVi1qSdRqWlNMH+Ra4gYJ0a0almW5krFSi1jti0kJP7KxqbKW9mjnZOptZa/yL9aNiqdFxVEo1POghlxsGoxFoSrHFOdQMKEx+Q0rUKZvZWNMWugc6ESp9EteyuAyjgNSPezXyEOSlq3AzE27sNC9aFboIqBqq5B9clVubNEryK04mFJLovLtol9BGkS0/F0G3KKShy2Eyqpji4z6TB3Ui/XAZOiouIymJJi9FuGrZMw4KjSDithlsya8jN2VFQZNR02c5UW+RyccEP9mkaSKbfDohtPSsrhrkjJsuRUGXRD5grJuIJbUyVGsgcENMpuiMmaRcFtOiG3zspu+icr2aRUjcbIyb4Ky7gl39lRcifknJqaZWWvgh6KxcLatzRyykvjZOVrZcVIiXGrIymEW5nUkOS4rC5lG4sNJ2Dc+x4Gt0ZtXdmTmZCPRUgpkedkmq+ysRheTNLgG3CYT7DE1U0zJ05cBi08TZlYTNmnJOYIm5QpuYHiXTatwONWyFt8l8RyTiLWbVgrtmfofXDspOs1YTfRm97JlXwGJtWmrk0qCUzcfGx4nV3FujVwxxvF+zKNyBa2SfCJbemypo2VxAJ0dPgzbSHKJBPYhK2M7bKWrJ/ZS3EBg0vXZm42bQO7YsL0zcKhxblWD1opRESBeleTnoW42wTTQNQ7YitaW/gpNTs5zHs6KFcgWqb7J0xoKnYFotbN/gcvgykC9NZS7mIImMuym/4e5Fg1m20qB63RnlXfoFtJoMLVUjbqbFKoM0u7QFphhXi1ygbe50PkqcbDC3FNqFAPbjg3oz/uAetNRbCVcDNzBDrJhg0tuP9G9GTb2bjdBifQe9m3pseIk2vgB6OrbJZT17B6sC9C7DmODTQPcN0VIXo9z9Ev0LFX6Hg9LSrReCuSIds6RZ8619OtEJscZ/BWNcbKM7UWtipvZSlFY6ZSVURaztOKKRlwVHoytZ2pSqdlYqJUDFuSkpUci1FoU8lpTWjLUQU0RqLRFxJaSnsGaumRUKRsXxlsfcGa7ciQFrdlLH7MrsqPpE0q3jGykqFKfZo7dEFrJPmBdo0LsZ+halORURYqvgXakWklubkE1oXE6MtTAANQjZcDPex4sVJoiwbrdm47M4lhpG52KmQSlbESWfKCm4gp8KQylqYCHBNA7Q6sl1TexxcjNcaZllUSaOictjipGfM6N5bfDB/ro3Ba5Ga/i7sl7F5Mzb+xyLkDfG5B5RMmyv0HLKjSRDadrZLcC98GSl7KjVsk1/IHdDrZnTLhxD1bIabmeTo3KZzbWmy4qBqJIy4LbjZDa6LjWRLynE55TMIp+9E5fsuRpIMqcg3Zlt9GhRstciW5bIfPfyXkc2XyqRnuSchbhA3Kk0kXIhuGyW2ym+yG1qaLkXA3oH/wAsznjQKdoapA9EZSjpk1ohxzZchjK9kNtfYvcm3ouQRpmCk+CVOoBO9hgqmC2U2mkpIyaKkRpy5lEZO5K4JydQXIgeUji28tk5WoBOoX2VIVdMdPRnOwxa7ofciZ0xrk3kzbMn9hiLTOpMsqchMEN/yYSJq3k2qZLcMnJw4pFJoeFapy0OjJqDUCdWsk1BmCe6gZiKBOs8n3QX/wAYuIJfT0CbS2ub9md6Djsl62PE66z4sJi5ITVy5KVsWDVrLSkb9HPvgqxYVq9fIK3/AJN+RTqqDEemdUDc+y/KEc8ncSLBolJ3sZmVMG2h4nkMLSqUjbsJ4dkyk+Qwa7efoMnWwmdIJtixOqmpW2FzBMqI0ZuVMwPyPSm3vRpfZzT+TpqAwr0tNKyXT+RmFEBK8kLC9Nn/AMsfIjJxk7GVroeJ9OibftmlzAN8yPlK9k4XpsuZ6CJfwhmvZEqXY8P0udqSXvdGmVQTuEPE66V0TG5J8qbBtdi8l6U3fIeVvgHmwbTRU5HpTylhbckt1uATvcDkRenVUt7NUbsnHLsVkpDC9u8XHZS7FqpNHR8nX2bSpjZ0xS1EsmOzpjqjO1FqknXBa/BkpX8mOKX4M9Z04pTaLS2bGVZUKjO1namFEtDppwPpGib5FqaVJSX8tyHoqSLUWtpUgci1ajkqFNk6jWhwxXCBK7KUiSP0KnmzVzsqtSSkrmB9MJhUUpj+RNAUFEy+xm7JLF0xiVOvRPBTf0Ig1NwQ00dFDCFywCLNcwxaVmajQaGdtm2zKedC57JIpdUbswwp2NLPWjbtODctIjLhBhxnp3JnGyXNqRcRQ2kjSQ3U8lZNolzoqNJGfIPanZnq2Z9wVFRrJe9FUlRL36gufi5A2+CXqhflC/ZnNSOLgfxZLngZ9hlGyouM029ktszcOnslxyy4qQZN7k55NTRTffBEqTSRpIcm3bJnZspVPZNJyi5Gkgf/ABA+TPWwybj2XFhuwyjQN74JplyNJBlOpoh2dG0Rk7cFRcS9fJPkvoc2p7Ob+TSLkOTfJGTXwZ5US7ZcPGbadfkHqmaUyW62XIcOTS4/ZDcOEbLJOE6Obabcl8w1zW6BPcbCYTXBLa4KkC5adbJmGDdKGExp0OQ13MGTf2RNGbgvGTpOiXHX0EruQyfseJZxfBL5ezPLd7JncDkKrbXYzFI5y9Djk2ViK6y/oyiQmo4BtTuAxlf1b1YNL7JxakZkWM6zaamJJcp0Zt9mTu9lYm10lo01LJ8pNM0Tha6SvF/9yVly2RLMouHaHiLXWXN38mby0c/JxMm8npOwxNqm2lqAycOqJmrM3wVIWuklY9/7OXk6uUdMWnTJsLVvvkE2psHkS3foMTa6eS8YmzTpWcvJTJvJ/AeU66vLhsHljOiG1EyCypy7Dyn06rKqJeTjdnPHJXZch5HpXk4FOpbo5eVNTRXl0/oPJenXylbaJybIyae2byXeg8p9LlS+hT2iJSsJkVg9OquOILUuVMo5SkKziYYYXp08kk+weVNyc8slEmWVhhelvLmZCfZLyjiZM3GgxPpfm+WX5bjcHneUPuRWbUQF5L07eT8d2CbTo5+fLN58Jh5L06+TUyoJeVOznlnUNkvJS+UV4L27+S4DLLo5LLmYHzTttB4L0t5URk1PMk5Mh5uIKnI9uvk/GODLO5/RxeXv6FZ+x+UXp3xydm8utnF5K1IrNJ0/oPCPb+xqYHG3DMpjZUag6/XYK3ovHejK1CLW62Rai0vvnoFYzxyCUGaHRa2XRGNqYg6L0Z1nWe5Zl7RlrYr0JJTls0zRK6/ZShbFUUv5mCrJSaLxkiprJpJmcvRXdI1tiQlzLged2UktTZUcC0alKL/RbcxTBvHnZpQh9PDoG/Qp3A8k0mmZ4HqSVtJioapiIyEcbHfyEewLC9BAqhXxBJ4Jphk/H2MyoWjZXpgRmCLnZVSYcKRuE5JbiokzrYxKhAqQKuNg+dlA3LdhIuJb44JkX3o3ZbSRLXsHspwtqw+BrkaZBuTakG4sqKxXsjN+wb9mnguKkDvkluCm72Q3suLiXfwD07F36DJ1XZcjSROTSW7ObiSsnfRLpOS40kZ7gjL0zOYXYcwaSLgbaJbmeByf8dkPK9FyNJGbgmY2zeSj2Tk7Li5A57Jy+RbIbouRpIMnGMo55P1Y5O/RL2aSLkTk2+CW4Y8NJkvTsuKka2mS3WzNqaZDyhpGkh4rLyeyJ4F5uCW1HsqQlP5JyMnWzbVsokuUpFTJm10bgrE2hr2zSaacBD5ZSKr1JLcOBnkE5GgO9ujLTuBa52icqHiaZoG7pwDc+jczI8Z2ukwZNt6kmWrNfHI8Z2rTalwLcrZMxTJbnVBIi0tpKTW9slPiR3aHiLVrdsfK2nxo5Twi3lUIWItV5TwT5QQ81oPK6H5Ra7ebTiA8ouDn5LgvyUJhhaW5y0DbThbJc20KyUWPE2rTiaBO7ZPl47sluVQYWuqzqJB5Q42c3PL0Dd1IeU2u2LlW4FZKdnLJ6ux/+SFqw8ptdXn0Q3bckNuZ7NxsMTelpxyZ5QrbZEwvRPncD8p128uYGezmnDsM8lMyPyVrqs6mwmU3Ojg8nwdMcuAvJeleT3oqf/0cvJJRBm5crKBeS9Ozza/9g821uDhi3disk1CYeUXp3WVlLOGzhjl2xeVO6DyXt28vdo0qbOPmp5M8qbbH5T7dfP0DyTuTjlm+2T536H4T6eh5S5mCfN8nLznGSXlK2Ocl7d8s/wCMySv+pcI5eT7J83rkc4T7enyl27Dzp+jh5Ncpg84lPkfge3o8/Vh538HDznkP/kuZkfhPt2yy/uJeXLcHJ5qWkS8oY5yV7enzjRP/AMjWzz+bSB/9RunFdFThlf6P1qRSrbgSJ3Z1N2rV4zwWm5OeO9l47gmoroZehU9Ck/gzqKZSZcxzRMKVRSupIqKVD0NQzK6VDvgSBT0iocglvgtTGyLU1khfsHv4KVzJLOsvgd8mTXQr8CJvoZUyDmTLskYVZts3cm+xHC6UzJKcPkqVEBHoUEXjH8X6YY2oTsFHdjpykNNi4mnwLn4BOpbgdkEHUyzSkjZe0Z6sDxDcSCdi96MpkDUk4MzJuNg6dAUjNRTG7Bdm4HDjSohkZaTnQ+3TCe4RUi5BvfAqJfYN1INwU0kU5gjJOheTlWE77CRciMplyTt0is25lm42aLiG4+SZiS3slx2VFSJbf4REv5HLRLLkaSGeWRk3xoptwS32aSLkTk+SG62Vk7Ib62VI0h+XYZZcOgb52GTlWaSLkS3fMEvY5OiX+i5GkgfsjP5stnLJ8lxpIHHFIltdhL8WEwk4NJFyDNt+yHP4HJwtnNuzSRchzjxOWTcFPIjJyXIqM8qJymdiTk3OzSQUNqeQTuzNxwHZciKzccg8noxq2VhVcvcB7Zlrex9MbOjJruyGzo0iG1OhxJnqhu0tIOCW4ZWJrpcbRLcbFuo0cssrHIztVk6o5vjsXlO2TLkeM7XSZUuoN5KNs5TTLURdDxnavJ/aBufZsmoJbaSgMZ1banonJ0o0E9oycJ8DxNMzzQeXsJm2GTU6oMTS3c0GLSeyZYtyr4KxnVLJLmSlku3JyyajVji19hiLXbyUbsG3NEt3PJOWTTWgkTa6eTpszbVycnlxMsfKNhib06eXugeRPnNEt7lsMLVrKdgs0q4Obe5MtleUWu3kp7RpbVaOcqNg84cIPKNdk9yQ5mfyQ82wWTmB4WuvmkQ8peiXlZMy4mUOclrp5ZRwbyrola9Gb+A8pvTp5TPAPKt/o5+X8nNmeVWE5TenR56h/IrNKzzPNzI4u7UD8pvT0+crcj5pqjzLJcMVlbe2HhGvQ8obkPKryOPmzZZPUh5L06ZZ1EnPzjROWUnN5Rk+SpyWu6zhRJlnuTg829g85djnCb07vOFOiPO4/Zxee1JnnfRc4RenfyUf1SGX/Uk4LPfALPiaH4Re3oyzfPBLza5Ofl0wee4Y5wXt1yzr2S83EHDL/qqYJy/6im3BU4Re3of/AFHFsPO6ODzW1on/AOTaRU4Z3t9AThbMl5Mlcl4u+jpFd0pWMKdF4tybAVC2RU1ami2rUk46hCl+jOs6pSY0zyO7TJSVKQp7RKiIk6ISayUWa0mg1yVKiEZ1FNxP+RVgu+iuVQkVWOylzLJ8qM9EkU6iw5MxmCTxvlyDccgttlcWPBjOXfIrZIprsQwpKIFu2ZZXRk5tCAm05Kxb40E0ZdSBYZa2Zvg3F2Z/1UhDBNRoclo3OjKLuQGKqdE51LN+g52EgkDbfs0/ykG7kzh2UuQZPfYTbkpuVol69DipA2/GTNmb/BDc2VI0kV5UZuw8qJbvY5FyFu2TxY5ZJpUS/wCouRUg4rRL2L5BtakvFxOUxJLd7HJq7khv/jL5jXmNMyyM3UDlk52jm+5NJFyMnwE+7M7sMmp0XF4zmJOeT9i3LbJ7g0kaSM7ohuJQtvckNrUlyLkXNQjnlPoW7g5t1sqRpInPdkPJwVllwcnkk2a8xcOWRyb2i3ltkZOXqzTmKiW7sGwcfghvujScmpxoMr+gTfIeVlyEzc2wc2aU24N4tKWUhl0kKDJ3RvKB4m03FmWglmbUDkZ1U9WSt0HlKdg39F4hTdSyXv0HNM07Q5EWlzFkS7scuLIz2y4itNsZashsf2GIrJyjTK2DZvK+CsZ9Ok9a5Jby4CrZOT2EjKqmFD2HkQ3dCsodDzEVTfsfKuwlaNk5DE2luFJMy7M6cg3ageM7TOWzOYlsnbrIai3I8Z6p5xQN+TsltwaU9MWFunYy1LBvUGmXuxpplxtGlTH+zm58ok2+aKxOus7Imw4QvIMTa02xbbsm3ZndjTWyfszygnLJE+S0PCtX5uIDG1BLyr2aa3+B4i1b5Dy4JbuJJbsPKL06+XoXm5uqOLyabhwifKbkflF6dXlNmmUc3lNtwzeb50V5TelzDpkttXNkvJQ1ozfQeUenR5vuEbLNNK4g5PJY/wBVkvNQ7HOStdsslDfPBDzuFsl5rfJOeU2ipyi9Kyz/AJdk5ZaT0c1k1L7onLKvGS5ym9OvnDlKg877OLya2DylxoqcM727PPckrNcHJuEHnuEVOEenpf8A1P8A6nLPOFPPycssv2RlkuxzhF6dHmtph/8AJDiZOOeUUifOjScIvT0v/qOIQf8AyZNwebybbcis78p0Pwz9vqSSjQx6gE3wyk2nxZ53dd+XjCFW72RwWtwRU2te9FJ2jK+NFpKJEi0r4HiCZaVUPyQmxXEQMsJuhnl0SmqMTemVjdPSJsTYVL5K/wBGrfIqeSU1rSljbfoYboHKWxJik0uCcnpjPIwmpbJMLblmn0C3ZTiKYw3Nhk/QhtuQBb5Bt8GSUa0Lt9Cwz8qgbv0Z6f6CaQhIuXLglv3YcbNugOQzcjK+yVbgaDBhbfDCbSM2zN2EgkZzN6Mm0jN1slxGx4qQvTI5FtzegbuByLkZunJE/Rb1Bz+NFyLhy9STlMwL9BMqypFyBzoG3AtufRGTWuCpFyFyS2Ztp0TlDRci5E5zcE+ismvGiHkohmkaSJcJfZLmYVIZ5JbuTSRpIz9IjJ2yssls5Z5Nv0XIuQ5voltA8noh5Pei5Gk5Xk5XRzya6M3+Tm8touRpIrJnLJi5fJGbNOeVSM8pf0c25egeTmQk2kxeNLiCctWU8uiMmnsqQxm6k52Lc8BMGsgqW347Jl0pLfQOFoqQtaTOeGDfuzeVlyMqptSGTUKrCVEuiG3psMZrbejTMyc23uSpaVMrCrOYo0tbBtpmdseIpl9mmyZehTmZHjOs243ZEzsaaJ+LKia07RpldEyDbgqRnVN0vRsmiHk53Zk+x4zro8vUEZN+TXBm42DjZUY0zUaJnfJm3rgltp1Q5EV1WU0zeW4cNHJMpOFMWGIrp5LlhKnpETNs0qwxFVN6NN6CXCB5PgMSXtkrkW21LBtrmBpbydy9Cst9ENxpmmvQ8Tqnl27NNkN+jSt/kMRf11n+UcEt21wTMWjTe/keJU8nwyW3MJmbXCNlA8Ktk4mGS36kcnNJaJeTgcjOqlJ9yDfCCYQfx5HiL+qm9yDfbgE3Gx/j7HImpye+gTcODOnLJbrZUjO1T3MjLiNSQ+iVknvRWIt11b+yHkpoG5UI5trgcibXR5RN7JTuGGWqJyyatMeJ3HTy2pgjLJ+Xwc272Dyt8F+Wdro8l3rROT5ZzecE+T0VOWd7X5TsnyU8kPKbJeUF+Wfp0edOyHk1pkzPyRnm5gqcpvTrllUSRlkvRDyb2Q8uNFTlF6Vlk96J8vwQ8t2Db4NJyzvTq8kkDzWjjlk4/kS8ypyyvT7AtxJS/wAAonopbZ5nXo9NxopMMVLKSfyRULVMfmglQoN5IhJbkyegT9BL7FgdE07kU98nJTBakmlY6TUpCq+wSZUqYFWa+aZSiTnjKTlFLJEWJsdfKtEuJ0TepFuaJwpCrlMyyc+iNODPLfAYeLmeQbUEtx7MqdhmHOVt1IS05Cb2ZWI8Wl0zNSzJfk02BYG5UaJbv4KbjZLUywkPB+xT9Amh438jw8VqHqRlLmSe+UDeMCwYpuXdBzsjylmbaVseHOXR6nZzbk3kA5FTktpyw8pcpA39Eu6KkXIXl7Je9meVRATzJUipFzKk5vL0ZN9slvgqRcim6+SMnFQZutkZNXBci5C8uZIThhlkiW55guRpOTllZzdvZm69jwXIuRn8nN5NVBeTlScs8lyacxpzE5OqegeUUGWUPRGbW5LkazlWTiYezm7ewydqycso2zSRpOWyfOznk5mzPK54JcmkjSQtvshueRydHPJ8yXIqRsmRk+ZgPJfIZOVs2kAyyiSVlf8A5IybnZlRp5GOjpbBv0E+zSudDxND+QdvYu02Q8vZUQrJzKI06M6t6NzSLiTtTITLZpldA29yORnVSExcELL+VFfY8RWbnbCQep4JbKxFrp5VOgWSSsjnehkeIpldkzGtA2GTh0ORNOTrRGWVC52S2taLiKW+Tba4qQlJ9m4+wZ0+T2zTsG4XZLdOxsarylBleiG4cG1tjxGL0xWVMiYVmlT0CaryrezJ8zJM1RS77GzrrV+yHUKRqYkhuHQkVbdRMkZWZtzuAuJkqRLOrkJ4Nz9Gh6AsU5jRE17K3zoluHoeI6Lhp3AT6kHXBofA01Uyl0Zt/gjmHwVKiGP4mt5eiXzdDk0S3Y0VudmT2ENW7N6XJSLC2vGf0DbdTszcYwSxoplRHKM3DtBTHaGzqXlujnk3t9lZOeXJOTguM60//oOZgHPlJuSsRaW54gnPIM54dEZZQ+vZUjO0tytkZOHHBn3Mhk1BWIqcv6tktxpyZvh7DfouRnaXndHNuDZN7bJe5j6LkZWr8qbObys2U7Ibl1RcjO0zTsjVzIOnuzc7LxFul5fxkjLJtNmyySbRzb4LkZ9dM8ncmTnKNENtSaXwVjK19r2muDd9EzcTsZ/Z5bXp1Wnex8l3ZC6QvckWJWnFSVKmUQnei0qiSaml62C8Z2ZwhS9CwjE/BaWoB04Mq0TSdMYlyxTWyU+WL12TiF7Bgsrl0Mw6RPwYW1dhL2uQmtIZ6YCQS+SlUyCVeyntcioblpuzOJhm9dmyp9gGsU1IVDM6Viwym43YN97M9hlTSDBim79hYTRnXIYeF6BzPo0/k2MTv5HTxV6Ic88GycE5NzQSHI1wuhc7Jxe+yu4Kw8Z7oJ4Yt1sl79/IYqRm6aRMuStq3ZDysqRUhfohzJm7gG54KxchyfTIncA2+CcX7gqRc5W2ohnPL9lN8E5X9F405icteiX6Nk9wS3DkuRpOTl7JbszynmSG12XIuRnlG2Tm5B/Ad8GkjScjJuJOWb4RWWokhtbLkacwNojJ1bNk0iWzSRrIXqCG7kW6iSct+zSQ8GT3JyylrRebojKag05hxDJbTorsh6dmshs7ZMTNmmUEvsuRNMqZ0aUmb2S2pkqRFpyfRDfQz6NzuypMRQnw2L8pcBpujN27KZ1m+9hk62aolky7oqRFrOZlIPJ8bM23yw8oGmqlTHBLZn1NBzQ8TS5+Q3INuIkmXBWIxdkypsJqQb97CRNLe5YZeuAblRI9uSoiiXsZXZo5ZMqx4z6LauyW+tGczYTlcMrGVbbaRm/0DbieTT1yGIq/kN0nyM8RJuUGIoVPopaiURU7rsV49hYiqeVdA3yxv6DmOATjVYfLKc6Jy3amByIUtUZb9Et8TBubHhVUJ1INS62PE8i2lYJxLae0HUFyuiHK4kGdgfZnt98GTcbgqJsacTknFwS0/wAFO97Nr5GWNEomH+CuJYqYY5U2ObnbDX+jp/YyWnWpGzsS4uaJ0omi3t1PZLSnRTGxDmGtEZa7Or9ENW3BcRYiu/ozr4DJJchP8rkqM62T2pOeUcWXl8E3wioixGWt/RLdRMHR61ZDXZcRYh252Tastyk0DlpFxjYh/Mg4ix5pEzTLjOwZao5ZzwdJlOyMp0XGdc3NOCXv+qC8qs5ZVaRcZ0ZOiHNtFZdSQ3waRlQ3KNjMyTkodBLSkpl/r7ZxPIpvkEooVKPK69RxSveikSrWzonwRU4yTRS36NqxeTmhJrfxl0Cf/wCmM/kzfFCSqapya5omeB3zoDx0uLdFJpWc8ZT7Oi3dEWFjeTlmxbTN82S/knNJUwpnkyUsPgVLxuhWG6dgm4oG7RXIsLDN30TOoFzpA9DGOmt6B1M6DVzRp/IFjO64YTseZCKvhiOQcIX+TS09EvmakMVjPhyHozYTe9DxWHyqrDyNlM9Et2OQSLv4GfZE7sp6Vhh+S74JdWby56Je54ZUipy2b5bsh8lZURk/ZUXIG6tmTqAdUD20VjSQTYNSVMIlyn6KipGuDllplzM2T42XIrmJdHPJyraktqJdkZTCZca8peiG+Sm4IbhyXI1kbLIMjZPZOWqZcaSNl2ccnVsvJ8Sc8nccGnMXIMmQ3Y5O444Iyeos0kXIG6cEN3A5Nw50Rw0a8xWFvvZPlEg3D7IeSs0kGKbf5Ie2bJ03pcEtrs0kTS5jZL2jBMFYls9ESUyW5fRUiKZr/Rpnk3Mk5ZeysZ1nlRLdbNLj0Z5WVE08TJLbXJm5ezIpmzycG8noZqyG7sCrV2NfIPuAd8lYmnKRV8EfZT0NFbJKSf8ABm1MbJ7HibTSdhzDcBN+zTN9DxFpcT/US3TM3zCDJvUjZ02gGo2S7pclM6dMn5Fa7KUAixrNr4HK8XD0S+FwCbA9wrFOejPpKgW+gRjopa2a4M9J6B6DU2Hh8mlzAbfQ00CcZo0dWUtVYqU7QtKwRYRtlPGUTzAIsNw50DYxXpGcSrHqcQ5qxfJnjbbcdC5eDoZYnKdEz7KiY/ZlKxmRpsCmBfcm3TthqZbBFaSNMp2aHoqVnYlt7JSfZ1alEpRSZesrEpUyYbcHfLU8HLJKdhKi8uTxh6kG+HidYknJO2XKyvLl92Snwjp8k72y9RY5t+oJzU2dGuIIankuVFjk01U/kh/1HXJS9kZ49WXKxvLnlt0zm6/9nbLFvEjLGDSVlY55T9kt8cFZ/gIcuC2VjnkiMprR0fuSHHyVGVc81Bzao7R/HRyzp0aysuo5tRJDU2dG7oyxhtl6xzX2z3IpS/ghdFJtHlVep4viqHT9gqcwVURyQTJ/RvL+MyE9szpwPE4qZhhc/BuTJvbFhYtf0qkKj8ky4tbKX4EWOi3AS5+ATcVsZ12SWNPuRlN6JcP6M37Fgxd9mndwS2/oaFYMPlO3ZTye1CI+rMLDxbb+jJtXJMvkPKOB4MdfNB5KaI8m1wZRIsE5dk+2aVzkoObcxNBk0pJweXRunZE6b0T5Tzs3SfI8ORXzolvg32LajcjPBK+wT9hMtShT3LocXhxauTT9Et1YT2PDxVueiHMwV5NaIbV2ORcjJ0ydt3Bp/BLajpl4rDlS2Q25M3eyZclRci5qeCXlNkPJ7kG4ZUi5yuaIczsZS0ycsnpFSKkZtrZzy/qhuhyfRLdSy5Gk5D1oltzaUGyahuSMnGmaSNJyzZGeXLYZZOdyRk5kvmNeYMn2yMm2Lbj0Rk62ayNJE5N1ZLbkW/yRPDZpIrC3KiTnlM9Ft8onJvsuQ8Q2Q+SsnCrZzbfBtyTN12DZpqeSHHJciKrJvshu9mb5M+IsrE1m2+SfsfJu0E1JUZ0uewbXKFtw5OeT9lSIVPRtyQ2kMuR4mqmnwS9VLM2Dp0PEFtxsGwB5cTQ8Sp5dqiW/5A3+DRyVhVlMlNvshPZU8j+IrN8wRk/oW6mSZ7HGdE3ZvIMtOTJLQ0VcXQTxRkqdhCXIIqnF1wS6gZpLoZYIqYi1yK665HUoFXsacVpakNzOujWrJfc2IsU1MRRmpZk39DzQFjcKdG7geWS5jewRY0xYp2Soj5OmKXY9xOKxmE9ClM8QGK25GvgksZ36JyU0nZWTlSTpyCLG9i4grS0DiQ1F5S9XoLvotJRAtRSHpXlyWqZnqimvtLZuJWg0vIpbRMdlwp2Zpj1F5SlULQJW9nRzwCHqbyI7CE3ouFAOJ6Q9ReUOyGlvk6tNaNCajkrWd5c4qlZGWL+jtEXEv5NbUFTpn1y8+WNTBEeT6O+WMEZzFFzpl1w5PHfLOeSlVxs6tRc/INW1Bc6Z3lxz1SObnuztljH2yXivIudM+uXLJVJzyTmODvFOFZzyxg0lYdcuGSUk5Tw4Ozx5RDSbbNJ0yvLk1Bza7R6Mk40cslyXKx65cclTSdHH/qYy4PRkk60Tnjy7NJWXXLzwuBU10dHipMsVNlemd5fZFdFxPommPwzzCx6ctRLsG1M6QJqX7N7Jwi2raGWyZfoZhgRWXKRr7Mk9GqYX5FhL67GZiaDVMU5IpYrH2/gpTMEq/RShIRYeA2ZtTMh5LlhgxvL0ZO9wDasykFY6JxX7NlwCdbNfyThYzcroHO0Z2nIuY3QzaFsqwlWhlCPGWX0TuXMGegz4Fgxk6KTJn8CsoUMMPFVMzITUkzyDb9DkPyrLTSZMyoGZ9EyrKxUjZR2bysHM6By5scipyW1BOTBu4Bub57KkVJhbj7IyyqxbqGQ2uC8XIqVshu5M2yU4HjSRTf8A9iG1aM2nsLLkXIzdfBGWV9Dm3s55ZFSL55U2c8m+DNzcUE9F4uRm6huyPLdGydPsjJ9bLkaSM3XbOeVuzZO/ZL27NZGkgb4JyHJktrZpItOTZHtDk1uDnk5LkXIpuoTOeTsXlxJDaNJCGVSS32OTUgaSJrN8xRDb6ottcktz8FyIofpkyXKhpMhp3ZbOhugXsW0DfoeJpb7+CMn/ACgZvQPaY02BzEs0wZ80S2iozVM3IeQcdG1sEjKezLKoM4YTRWJpSUbMnHIJjaGmhzBvJwZbsXEewZ1L3sluStIHocTY2hxfYOEC5Y02LqyXfBUpoltMGdgl7ZSlrYNP/wAB1Y0WKetmUQ3H7M+v2ZyhHjPRL1st9wTToabGXclp32iaiIgpL2Kli1TkHotsGrkWpxzanexSS5KdOyoUKKDSvKYS5BykU19ise2Gl5TFqBlroqKa5CPsWp8qrljHPQLFsrxb5J0vI9ugiV0yoqHszTHqbyhr3RFzVWdHUr8B43fAaXkxD2xam9M6QmqIyTbUMJUeUZKHU/kmIZ1eMuAhyOUry5w5d7NzBWSg1THJWs7yhpuODJJ+jq8fyQ1dKB6i8oaa4NEuzpEr4NxSH6ZXlzahuWQ8Je4OmSi2gasqVN5cMsVN2RB3cS+w8HDLnTLrhwyxe40DwWTnR3aqSGlfBc6Y9cODxjbk55YTb4PQ07JyxcQzSdMbw8rxiaObTqT05YpU0Q8HMGk6Z3hxySjcs5Z4yj1RVpMjLFRo0nTHrh5MsXHonx3CPVnhDv8ABxzxvo0nTDrh58l7BKG5R2ySUqCYi2i9Z3l9dn0ZcyHOx47PNa9Ixm62VPb+A4dFJKIJA5FexSqikqbmASIXY1N6NCMvompU7fo1wwTqjJ+xHitq3BpV3IXyGpYHi5XCBSFtbHHcTAqMU02jXRr4oKmZsRSGxlvknuKMB4qdy4CaozeuQlJ+ww8M3bHy5ObdmFYrHSWTLlzo0+zblBhYW13JjRWjN7DDxstOdkOa9GbsU7KxWGSXKs0xJsn/ABQ8VIXmHdwTKNN7HIuQ1HZM9aFvkluGVDkZurZDdUU3K2S/yVIqRmiMmrKy1MnPJ22VI05hbSRDb7NKgl5Q+i5GkhblHPJqRWSlkNwy5FyM20mc8nwOTnknbLkaSM29uiG1dlfs5ZNWXzNaSKZzdqDPNxuCcsrg1nK5GyZzbKZL6kuRSW4psieWVlfsnJfguBLIcy0dHCOb2aSDRkS23MGym7knJxo0n4mlv2yJpWM+g5LZU/4C3I8Et3A0HjYVPZnPKCXD4GVMqGcs3EKdFZRwRklI4WHyTdO4CjXOhcRZTKhxNE25LcRWyZrYJsDbgLk1sykpOKoPujIECaqvkJQ5NR7JXQ0YrhpBilzozb/ATcME2Khcsh8pF7+COWmEKxV8G8egTFOtjZ3ktfkz9lNKNmaTqRanziHLgd/JocdDHsBgaoz9QK3s0bhBpeWS1NopL9GSaZUOYkVo8ltNdmiWv9i1Rkr1EC0vIhJsU1JcqNEuG9C0vJxSqWOOL8r0ZamC1MehWjyHi7JeLmjpNNNwjC1PlCVy1RknxotcuPo32GleRctEqIcuzrEqWyGlPQtR5TCiUDxcUdFjvRr06QaXllPjHJLmeJLcURlMuNDlLyHr2TTUbLaX2TG2PU3kNNpQgicjp4yqBpKPkes7y2SfUA8VFbLhvLsVjUxI9ReXN4uFZni/UnXxfWyfGw1neURjNkrFJ2dHipcGarqCpUXlyeKtSmRli6hHd4xcEQ9lSovLi8eSPE9EURljwXOmPXLz5J+IeLaO+eNbJarZpOmXXDz5Y1ZyyxS2erNL3JzyxlxBc6ZdcOGWK7IahuPo9LwU0vojxuOzWdMeuHDPGVMWccsPR63jxr5Iyxplzpj1w8mePYPFM9Hgmnwc3ik3GzSdMby+nJwVjzAWh2jz2vQ8UpmWUuXsjFPxLIpWKmbgYsE04JjblwJGOk1ZAp1BmSMba5UCpkh055Gp2PBI6KHsG7g5J+yk/YeVYq4kVshv2UnEIWKxfloFbNNPoHxQsGKbcvoJmwe3Jh4WFuEGV2ZtB9hipDxRN9sedmffQYeHoU0Sn+yvKhYWOkvRD2ZOeSXqZCclI2VKGGTrcktvngydlSNJFNk3JvbcA97HisPHsGyn0S8pocisZurCYTB5VAS0VIqRm5g0xbBumT5XZUipDllLaOT2y8n25OWb7ZUjTmHght/3A3/JhKLkaSKytejlm7HJ738Euy5FSJZLdGyy/RLfJcjWQt+mcssnRTyonKHovmLkS62C2aaJbWkayKwvbDmTN0D9FSAZOG0cmra7OjaZyy3MlwDJ18A3LM+SXyXBgbpnN0y38hFmkRQr9G9yU4iCVCiyozrOkTbZbc2Q5kaaZlQDVWU9EPTGlGVUEaotx8k5OX0MqL6JZT1Ek5KvZSKGDfRnMwKUlJrOeUZKEVCVkZctAhplDLRClspa7HhU/ZP92xYVocRimD0VFE5AWaz0jTxIZfJrgCsWpg0fZOPzZSoVK8ief0Uu9hD6KVQGpxmpVmakvlgvSFanA4VmSuR5cM2O6F9GKje2UlKspJqfgl/LF9LBj+BSUm4FYuFGxHi0pTB1oY3cClaEWBKNqjVHbF7fYJfyjsQxd+Nhi3MGhhciLF/3fALmB49hPYIvKnEXBGSmPkuqmzQIryGrng16kpU9mjtgnylqFuiXhwWqxbFL2Gl5RkqB4qfZ2WuJBw3PQek3lyi9aMluOTtKaBqK0V6ReXNpVIr0ikqaRvcaDUXlobb/AO5OWNvotqtEtKLDUXlza6n7ZskUlzyZ1sqVF5TXwD38jk92ZakvWd5GXRLxlovJ2bHGPscrO8OWWHjwccsbvZ6csVdnN4ryk0lZdcuOeLjREOYPQ8edyTkip0yvLn4wjnmtNndruzm05Zc6ZdcOGWKi2Q8VDZ3yxcQc8sUlLNZ0w64cM8KZy8brR6MsVNMHhOjWdMby+i8MPg03Dco390cHQne1qdJmnh7BNpdAmpliLFy/H7FOHbJX6KUZOqEWFNcmyd7o0rgl5IWFhmG40Eolt/RqWgxUhcw5M39hL1I2l7BWK/yZON2DcNSTlliPDx2k0+yPJ70NfonBhbZMuNi2+A4geDFNp0jEzcjLbiQw8M9WEwgnpmbqZoMORU3P0byjZDbRk7gMPy6t1RGTfYLJxBv8hIUgvZm92HcC3/GxyLkaVfJLbS2Dy/Jp7KxeKeTjZDbkZT3QS60Ofhxm0iW2+SntkNtUh4qRnkTN6BtvZp1BWLxWTSccHLJorLKVs55O7KkVzGfpETfYtzs5tvguRpIp5bOeTcTLKfvZGT4KkXIG1GiZUoXavgmXyaSLxsn2qObyXQ5PiSOZNJFQ+uCW52Pl24IybLkVI2TepJbsryRLh2XPwJybfJL32LcKiW26bLgxnpxRDmypmgacS3oqfhJZL9C90GWi4VDdEt2uRcfJNpUWzq2+nBMhPZn6Gixm3EBIfDGaBLTvgmhydSDcOipCDnZLdex+Q9jibG+xW9mXsyhWNFVVyQ+Sm3EhIIS01sFzBbg55RNaY4MZzBkPYpKmGlhszqyoqQymZDU4HqAgpztmSl+hHjJLsqpdDCMo+wTjXCuGMKVX2ZQ0PNAnC1dcFKLoySdcmTqOSSxL1T2CS3Ja9gt3oCx0XjG7CJdmV6aFfJOl5Sl3ouHDSYpKJ0D3/gQxkKbjcBeisUGjGISay6OzSUckQpSkWljKVzYXOxrhlQxFilunbDGJ0Y2tCHkuk+TRajQqvs0IE42KUOzOFcyDjgHvdAWBuNUaYZo/k+isUg0XlSa6YTwkPC4QQp7BFjVw4Fato0xwaeJDSsVwSlduhlpRUA45cAz6jRb2DqYRTf8AF8Ey/ocrO8p+yWoVui8klol24ZWosTklGrDxcWVHCFXv4ZWs7ynJS5SC1suHCJyltrgcqbyFb6I2/jZVcsz7iC5WN5TxMc6IzVuUzrHOga9lSsry45fS6Ja6o6vFPXAOY+C5WXXLjkmcs8Zdo9OSSs55K4Rc6ZXh5nilJPi+GejNPgmGk2aTpjeH7jyhGT8m4ZLaixTUwjpbumLahbsE7SZXEOwfySFSzeTnolZQb7QYMX5KzT/KCE0UlNgWH7NuJcBP6M23EMWHIrtILmSG32aX2PFTlcqNyT5TwZ5KYTFb4EqQzPIz7ITRru1+R4fl0bWkHkT5UafYsHlTfKQS2wbUSbUexyH5LfsZnWiZTTQfYYMW3LJUd0E1YNwww8dJUdmcNkJytwbyphg8uswqOWQtylZDyuByKkaZ2ZZe5CYJb6Kxcim62D+R3ZEhIcim4JeU0MqIIycMuRUjNvZLycaM8npEzdsrFSFumc27Ky1JDY5FyKeTgjIX8kZaKkVIMndEu2Mg6Wy40gaXZGTlQXk0csnRpIqQOuSG9lv+ls55RcFxcb5Jyf5NlXJOTTZpIZbuAeVhasG7HgbIhlZcEutsuQIyfTNL4bDQqk5LKq4Iyc0yuLs55NFRFGTjSJbcyLv0Z7iS4gPZtBMNm16Gmh/Jm5USZwEoaLGblyDbgb0EW4GVjNvkG4oqJX+gam+BpwOnRpizMMvQJ8lueQcdhf2PNgnGfKJ9DkrMMsKpbZXBK3Ra9AMattwTzsXoK0BY0uNFL/iCHswhi6VgomDT+QUzoRYpP6KU8EqUUmuwTivUmTpo09G09yIvKtpPkyhOwW6UDUw7JHldNNrQKJ9Gvgy2IvKlMGh7FKfQuIhMRYmXPY0qkCoa2AwtyiJspqTKZSAYy7iCm1PaGIUsmVJKbFQr4Rn3BT92Z6C/hY3Hsm3bobmW/kyjkE+TEXsl3RSv0aG3sQxojFKNDN6oE7iLKrgVGNlP5JtsqU1qDIEYlK3YJa5sdTO5NSa+SibJXuAyX8ZkqE5oMmnXIaixqvklNSbVtjuXyxs7yI50ybiC2nzBvJRY4ixOSjklqt2dMlPoPGMh6iwLbb5CFbmS2lETonKV9jlZ2I8ZTS17N4uNot4250TWrL1leRq2pRDiLOsO0S1K2OVn1HNq+F8ExcSdM8fYPGokuVl1yh7SiiIqTq1zwiMlMwVKyvLnldktXBeSfIJQ7L1Hl+vbhJRZrnUGWmaXOjqTtmKxeU8Gb9hUezcMSpC2+KJeUP2Z2DhsJBjon+DeXCZzm9in24DBjr5dkvLkH8ET2GHIt5fxrZNySvZm3LS0GKkdU9G59EJ1uzT+RYcinkjTLdB/k0rh2ORWL9Nwzc0Snyb4sWFiup0Pkot2RNdBk4e0PFYput2R5WMruUD3IYci5ozy0SvVm4iYDBipW2TMSZuiW+kOQ5FvKtktyqCX2aokeHI0uHLFtTDM90Tk2BwyyPJT0La5Ibq6HIqR08p5Iyt9mngJ6ZUOQNktqWPDJy1sqLgc/RnLkG+A+ylSBzGycnQtsltSVIqRsmkvZMtfZplMlvsuRcDYSpDK30GTrRcihk4RD9mc/ZL97LkXIzc6OcuaLycMh+i4bXYPY82wbb5LhNM/IZcrlA20tlPU8lQnNpm+Ry/JLrkoqo5OZGZ5DmypEj2D/Y/LB7KTWaXYOFsGx2P9TiW0C32U6uCXTdjLC/ZlumDuCosaLGWoBJ09FbkH0BJhtbBpi2jWPSsaHGjOfwbXyM9sCsQ11o0cyX60HtIE4PWjJ3Q3IQ50GjDRl7YXoUuwLFVcm49hxZoU2BYVq2ZSmvYmjd6EeGI3RsbekPHZsdgnF74gH1IsyUzRIxSQpcAtRJafskrExUzXIJTo6NKfRDTkRY6T0jU+SVoqKAsaLH52E2Dc5diGOlJPg5qPKJbL3wZL+QSljLXIxOrNEpoUuxFguJkzblKYKS6M45YaWDH25RUEun6M2/L5EVinqiXWrKqI5B/NgnDK+wT5kHCnsdARXspOJkn5B9TsE4U1fIck30L3oZWKcxAXPH5Bu5kya5YJsZuFsE51ozh70SqfSGixbhyg3xwZU29IJaGzsVNKWZ7ngaiQf9XaEzsbJqaZlEWZasz45GmwZ66Iacp8HVxCsiLZUrKwVFEw9FO9A7XwXGXUS1x1YSm+yspSnkl1MDiLGaiU6OeVJp8nVw1MnPOmkVKysc3iwjt2W6mAW4LTj9V810aWuSomCcnR1b67RhlR2Pkc3k09jxLHisLcmfMfRm6fsGtAeGo6KX8orQeTNMvYhit/RLXJU0Rk09BlKFxAMJhm8uWgxchmTZPZLc6dGltBh4rycgnyGUpxNBNhipHTgZhnOUUmomQwYqSW7kPI1pyPDwjNM0s32IYfLxUhNkrKW4KVhh4zfeyW9opvgn7KgwzKtmYbDyuAPFtwqObZU00C1IfDn4IoMrfiOVojJjiozf8AEiYK4JdDxcZubZpsl5Q5Jyy/kXhyLkhtA3QeQ5FSFs5v+lmyZOeSLkXIW6Im2ZupM9yXFxOTc2D/AKdi3JO9M0gbmWzm9luJJbrRUVKl+rImZgpk+X0XDGU8gi8tSS36GD9Blo3lxIZRoqJDJamyicmVCS1QbfZUSRElROY0KGaxjkrxpsek5L5NBbsnKuRlYHpkurgt/kPGqHKkb+TJuewiWZ66GVjP5NINODN8AXk7sL1IKneyoUAPLcuiXsXk4Lx0GpsaHNmKWiHvbDU4w8dgpXApWMYPHTMrkuKJj3QiwejU8inMUZYuZ0B4zUTYIqNUPOg0sKQ92KxqrNFCtLAtUysObDmYKrYqMZV8ji1LYNuZ4ZpJGLxa6YqHsE60ZME4eFQZRbNNuzKPKATguITMpktvdUDjsQxdpIznlgt9mUrQYWK8vZv8E/OzZL+W2IsUlVGyv2Q3u2hTUBiMVJStE7uEbJpZbEFcBzMz6DynkyiaYFiqsEpoycsMqy9DkTVZWiXcFMnyTyoCwzo0tuyU3GxcykBBxDNtDkyaeUBEVUUDxUmTi5M1KbTGzsZ475BysR3SMtjZ1pVGTcdB5OQeVhhWLTrYYuHQNypBxUaHjOxTcNygTbnsJSWtmeU4wUz6jTUIHs39tsz/AKVY2dhyXipg532dNf8AsjJ3H6KjKwZbdHPJnXPUtHJ5caKiLA1Co1mapjhp9lJx+nnbn0HrkPQt8nWXZ8ZxBk3oG62EwCpHSUT8ky59mT7DD8qnmQbafRLfTCXEyEgx2lKmTJLb2yXlD+R4PLpOyW6uyW+nZptzYYcisnVUb0mS3LrgqakR4rXsHDs3Eg1UJgZnnkcXsmojoaAzO0D9s0rgzbgMOHyS1IeRLm5DL1oeaci24e4FP2c20yp1LDDxflL0FJ9kvLjhgmgwvLoR/dQtolvqh4cipqJJybqzTVOycnG7kMORm9k+W2wybXJPoqRci5uTSotEvJwHI8PGyXol/MFNpxJGT4HFQfZLmaN20O9lRcS974Jy36KbXRLnsuHBdktsrIhzMFxUGT9E3tsoz1ZRgnJ9C9wDhKmVgc3oHtdFPQVOjSKDeybkpu6DtjAaH5Btg22OFW7gh+xkeHZaU32T9lbYwMBroJY5Sl2c2xxOLbVwSzc0a5Y4WBTOxudm/wAjUbBIcEUU/YKJGGgIukVfJq42BJrkzeynqYJewgTfJUonIpWtjKmPYtcsEU2xJxMM0asqWCTmxjFKWtg19IuYVaB7vQaQh8jHAR/LYqZAmjfYqt2KaNTRIwqeGNQTK7sW1qQFhi5So0zqgl10ZwmIYXrdDx0K+KNcUIYLdsG3pULmpB23A4WKr5o1bDGIZXE8LgGdho2PMUDlGlrmBUYvH5MnDmATXJk3MiCp9GVu2EuRkWJsbLTqZ0QynolbiQRipdGmbaCf5OVJlMw3QxYXwKcbRKdtNwilD3wKxLT1SCXO5KdLVEyrocIt07NW0gTcWEvcBhWNcw2UHtg4igTYW2+TVNEy53ZWPlHEj+M6uVF2wquiW3G7NU7oJEU5SnuCW2nsptNNyR/a7spFLdu7BxOrJb7Zm347seJsKf8AHcGUuegbadGxb0tgiwt/xo0yqol5NqJMm5HjOuqePheyOIYPJW5mCPKx4y6dG07SJl+UMny6Jly+xyM66NuLeiH4tt8mbcJN6DJumuSozoybiGyVuFMC8uHEE+TgqJfqZolbdmfcmao61jtOM9WyZUDk4Ib9jxci5b2Zud8ESbyXQSHip9X8gmyU32NdjGKmpJlv0DaNMT7AYbRtoyhqDNr4DBipSYpkcbHuxHjpi5mRng5p6Nk/YsLHRv0TN3s5y05KWtlYrFTW4JTtyEwrBZQ6FipHSVEQTp6Dze5B53oeHIdIzyYTWhm9geM4ieQbacI3dhxux4MU8rjsG4egbhyzTLoeDC3dg39m52Z82GHg9thIN0DforFYW2iW4YN8vRuAVIzc8g+YNk1/4J/c9FRUL2FXZmqJdDORcronLsJ4mjZOdDPGydHNv8leS0DZcNt2wa5FtRoJRRpaIyLdEtSXA55XfJslTclZaJy3OioaG3GgT5gtvmCctwWpnfoh72XKCK2Gkmu7N2L0ZqIkoq3yZpN7BN8GcopIy0znzBeU/RMXuBwY2OtWaJdjimkZ1AJsZrol6dlZA9tSMsTfLEEnBUVsZU5JLmSX8CuTNPYQsDmdA5for3yZx2AQ5twTLLqH7DqgGFJTsVHYcO2UuwLGgqZUM0ONmfQvpWM60yZhi1QOuQLFzNhM7BP9jG0MsD/JSq05JagV8BTsPFmmR7CREfov+5Ild8FKG5FRVqqSConZtXMhk2lsRBuVAKo5BuTJwwwYtOoYrasmGuZGZcJ0CbFObolFTCU6JeSe0CTvkpS+A0pCKYqMWntRAPewlNas2SpsSVPJTsiruQ/2PrgfxNhdpcMqbkmL3JphQx4mww9jD5ZOOTeqLTcCTVTCgysluU0mE8SPEs4e3AN18ByKczYyLcqOA0o7NLZLW2gxNU6cQDbrgJ4FuqYIoatuTJ05o2VLshtFSIU39s3km56Ibvoz+ZHiatzGpNxZPk9ToeZboIzqnM6JeujZO9ktymtDxNuh1FjL2yU066M8000NnWefGpIlrkMslo03EWVjHp0VckyrlhM8kvL9BIzq223JPk+yG33RvKo3JWM6rJLslOGbKndon2VhY/U+SXIrL2Rjpjk1GzreO24fIjKZkG79mmx4qRnE82OlEGfwbewGGXtktqTN+yZnYYMVKitBPRpikyZt2GHjpLCdywT5YN1sMGLnsZdxRzmtimGDFz2zeSIWU7CVMToWDHRNTsHMU6CVFmb1YzkMqQTcyDdOCW6HipFt9sHlPsmeNirQYeKbf2aVOyfa0aWLDxTyUyEyZtA9+hjDKSjk3lsJJb92OQYttxJpnRPMGbjWgPGyb+wldg2p3INb4Q81Sn0qJmoNP4JyfsrAXMGba+TZTxonlhii+yXYdrkZKh/BLBtGbqQf4KMWLf8AyAfJnEbKgaY5CTOPsw1B0rDTsZi9kw1wVCxsp8SMk/k6P1yQ+Rw4l/vkGm3IuCW/5UXFM09vQPjgr/IfQBPLky05KZM9lRJh+oM4ajYrWiGUTZvo5uJ9FNAldjPGoepZjQtcjThppxshplv5CASKNBVQTMD0m1s0VOjLVmegOQcVsl7HKUAxmFBzY+zPYDBNVscU5oHuxxp2AxfJvZk09KBl75EmwVFkuNSW2Dn5AsZJwZzLY/IL5oYxvcGXqilco0UCU2tm2N8M0CPDbU9Cm1bI7Ul4aVioxczol/I1ASk9gWM47BROxqTOOwI1dht0bmRx3vYisK17B+hlNRP2ZMEYW0Y3GjNgWGGHNsW3FsG7DEVlCnsIaHieDSrU0NLPfQLJCv0bJXSAgpjcCmzPdWEuNjTT5ONBfLBtJ05NNw6Q8Tbip44CQf8ATsJ4THiF5ZLxpnNNw29Gyy41AYuaCRNdJSVktvsJlwZN8sPKLVJ1EQbL3wTNUxTTTl2PEVOV3JLab2LfwuwXzA8TSnHsG237M2kc83cjkZ2qeVWzPK6InhWxTm5srGeqb97Ocu7QZZOJkhv+UDnKL06Nt24BZJsjycMFm7sryytdlko3BDbvg5zbl6N51boeMrVtvchlk5UsnyrZLau1JUiLXVZVbs3km9nJ51bDySypj8p1+rs2WSijncDLR1vHcsU24kJaZpcsycLgSsLbRm8e2byohsPpyKbphM3BMuNmbdAMM1QTHMhPZWPI8VipbVhU6NNcEZO+hYWLbf2EvlwCkVXEjLFSwm5Fr8E6exYeGaLl8EJv6M2u/kMGFsmXzYeSToZseKwzRsW+7Jb7ZnrYYeLolyE3Ein7DBilw9dk+U8wExyDdxASFjpMrdB8kJ10PcDwzpeyU/wNL0E3DY8NXliyZ2Dn4J8uxwSKqPZlZLfoW7XAKwzwDTarZTfBOX4CUg4XyETYtozGpLfEE/BTyqCW6clmz9k5aKeiXscMcrkZg3Iv+mwNPkwl8szFKijHGyW3JTTo0PoqUnJoHMwdHbghqCpTMkzeyv8ABq4Hpom+iW7KanRljBWhuLJe9FPakWPSxz+VZuy2qZoqZHpJftEvZcwuyR6WDgyb0beyg0sEMllfYbcBokKupIySTKe7ozVSxj4h76Nvkp3ZKgZ4YhdmejIy07DSxnxINFJmaqxaeMZP2Zq5NyMsUn0ZMF71wL/CGixnIKDOzRyJOOkdkmmldMz2AaK6YRaLyibDmACVrVi30UqoMnsCaYlIFuAkUosRqqNyDYLk16BLLLVlTKbDVxQT7ES21BLy6NIN3SCRJeVRJllYN0ZTNaKwq6yuTTXoi4bCe2LEKffBlb9MNIE3I4zrpL0bFg31snLLgMRapZQDc0CycRwQ8rHhVWtBk2S3XsyKTV9BMETTuxbcDxDNy5iTTPyZ5Q1wRNvoabXTWqFKaJfj2DaS2GM7S54M3T8fsl5KaIbh9DxNdJQVtEPLojz/AJbHIzro27Rzy/6l7B5U3JzyyclSItdHk48gyyiG3DOfld8m8tXorGVrq8pUEN8rQebt9EZOXA5yztVlk5lk5NwHlKjonLJFyMrTk1FOAm/9kZt90HlwmVjK12yyIeUuYJ844JyyU0wnKLcdHktkrM55OtyHknyXIj0/Zd3RpjZMx7BuUdYx3uRfku4J8qgOTLcMMXhbff7C/Zm1ISxYeGfZptoeCG1OpDBIuaBufUE+TmNGn8hh+XRv+NEMzb7BtyOQsWpmxWRCdexT4YYWKl9mcmleMhLa3RNgVPv4CQbB7nQxIpORUSQmlJSynkDaVdEzQtvglv3QYeLmeA8rJZm0PBi26Jk0qPROX9SXAoJFzQeXVEy9GTl3oeDHWe3IN/gmVDgABydbdnN70W4gOhxUS53YTdlOZcsBmqfZr02SntlKPGQAlwDyrY5fkhxoAX2EejS7gcZmigHJuGU45BpQMkv8mGG7JaaBTO5gOfZTBW2VDCfdml7M2RRUCm/ZG/kzluylMaGaWqoz2/XBWr/JMVKHKGd3omHOywY4aagaF+iIQfTPLC+h4tmclEGvQNFOdEuGODGpEN0+y2S9+mUTRQKS1A18AaXEEvcFPonKm+hljcMl9FVHsygALvgPgq+6JuQDN/RQR+QYE0zyabo0DFygB+TSBhosU3/GNAY3LsIWKXwEvsybGhpbubF60agmvYiZuJJmmns2Td9k8ytjJbuIGahMhNrRUbEdNG0aoNLBIU9j87CehQVOjU3sy9sW3MBcwh4WtwpHHYPVh5XQYmrfwDd9BL7BNTY8QuXPYfJvJQyXkuwRS3u4B5Ncg2p0EpseM7VzQNpqiU1fY+SjoqRNrNwyZv0OTb2c8t9IeJvTqmuoJuyZYt8ocjO1myW+TNojyjexyItdXlyS8qfs5vNzbJeTfwPyz10eargh5Xbk5ZZ25ZllL9MflN6dnl7kHE3olNdkPLd6HIzvS3mtEZZXKo55ZXvYPJvFvkvyzvWF5zb2PmcfJuXyZZbTL8suunbLJRs5PNp7BtQQ8qgcjO9OjzjVEvK4mSHkufsjLLoucsuunR5vkHnyjk8nFsPKdlTllenbzu2Hmjh5vQ+dNcj8s707PKNkyk/Zz8lDMs1yPyz9v2/3YJ7JbTezOEdWx6NIpujaTslNfAtqBYrA23Yz6CeYNPQ8GLBslsG7kWCQ5Ot2aZSIb/lMGxcPYYrHSVAT0g9yDf0PC8rlu2MrshuKD0GFi1k9cCn7kh5CmLBYtuZ4Nvb0E3JkBF0qZLfuynajRLQGZ6J0Dy4Ha2B4p/j7CbCkIAS9GbaZm1OjZMDZuTT0S3Y4u+gDpNbgOyU1oquwxONLdGn8GdE6DDLgmZ9Izd6CY4Hhq4MnCBy4MtgDLfAb5M/YoAndinEg3Ewh+xwy23QJxRuNj8ATRW4Ie9lTCslu9FQB6BvYu0DcFRQtLgmbK0D6gZto0lTK0GSscoEu6CZ+hfsN8jBcpaJ4ZZLa+x/AL6Dx7K1bNKkDS0BbfMEPsqGz6CIc7NE8mSAM5j2Rcl5Wtkv4KhKUdgzejOlIaGdohpSU/wAg4nocobTlMB19mnkek39uibLerQb0AaHaZLx9nSDQmEuEmDPYtyTIBL02ZNsqLgHfoekU/QN8hLs1fQ02FWy2iUv/AAZ+wRVbB82ISBCF2aLF76Ya2BNzYrJ6JfZk/YYermtIkryT0SwTqZbR0mFJE3EC3xoaazdyaXsNBKgeItXMN8kZOvZssrlAhpVXZvIh98A8odhhUt3YTbF7uiXocZ2rT/jonJzAeX8f9A2nsqRlTLg0xMk6s021G/Y8TVN0DV7Dahh1dDxlauX0GTlQDamiMn7gcjO0vN8I55OXMkPL+TU0ZsrMRarJ0S3/ACiQVO+fZnWPEjxnaHaakiYKybk5Z5JZWVIm1184IzcXMnN5UZZXZU5ZXpbb3BMuLoHk2v8ARGWT7oucsuultpVsl5OODnl/1CMv+pCgryw67dnltHN5Xsh5zzBDyh7LnLO9O7yS9nPLKdwQ8tB5Xr9jnLK9rbSe5IyyuJJeaZzyy9lSMr27PKoIyyaZzeczdh5Uy5yzvTos3cAv+pCjZyzy+kc8sktMryzvT6JcdGlz2TPCCeGdRx6jjpO7Mmpjkibhm5DDxc/o2w+BgWHipUEZPmRbRGW3Ggk08L1bNN0c5rdl4y0x5hqluQbJlTYyn6Fh4W/sVkiJ/wCSUokCUa5qDOeifQJdE/yaYdhKj2E/YsTjrMkvdkz7GU1CDDxLf2RLNlP4C+h4uR0nqxWSo5+S7NK7gVgx0bJb0jJ16NUAWKbTfsiZtmvbGHoYUipJj0L+BJDb7M3UmZOSXYzNtSZMLVC4kQZwDex4YP2x/Dw2Uuib29A3Yhinaom26Bt/krFj+A12aZZm1dEtuYQYF62S+2hnRm12MObkJ6Ly72QOVTOdujSwfyaV3ZQVLJb36N8MP9jw1PU8E8+hj9BV8AGb7ZLc6BtwNVyUGcz0a52ZSNjNpRLGjcwMDjZuaKaXyDXQaBDBrjRU+wlTsYEOATU2U5j0SwgDauyf8i55NHMFRLKI9mQ/JquADXAJOWUjNIDZVjBr5NU0FhiQ3RLaKc7YPkYDjQqIBzwPyADTg3qBTUm5oZVlqwMpHyfQ2daV9g5mTXITexpVfZMoZ6Deg+BsmE3BT8SahgVVIJrnYNozHiKqWzOXvQTOhfUgi0UqBPcGyamiG72PE6th5IniwmmPCtW2tg2pJ8oQ+XoeJtLai2RkynEENqdwORFrOZs3O6JyaTJmdaKkZ2ujcA3+SZrRm4KxlazdO7MnHIZfGiMmr+ByM7VvJxejnllMg8mTll+ypyytGTt3INt/BLavgG+nBeMuultwTk+Fsnyq2M8ocjK1m3vRzbcwbJxUnPLKcpRc5Z9dreSVyR5Kd0TlkkQ8tlTll126vNkPKrOTyuPIzyrZc5Y9djPJtOHRDybiyW4lSS3KiYLnLHrt0eTiefkPKomzlO7Dytui/LG9u/mruyW3uV+Tl5t3yS83ELY5yzva8s4lwc8srtkZ5OQeVbKnLHrt0eUt2ZZSt0cfKpmAyyS5L8s726+bU9EeS4ObyYPLkflne30v4RLmZHyJyZ016/IzbiRTZMubofKh4eLT+h8uiJTcs2IYWOjajZGWzS52S3tSGYcjP9im04RM2V0hU1OI9k8m5FbbEG5Mm5gnJmWh4MdU6DfJHQz7DE4uRTqJOajxK1yLCJp9g8gmUEhs7sG79D8mj4Q1QNX8GTl2aVzYpVQgpcUZLZpapBNiwlG5t6BQbJ0LCXM8h5RPBDdbKVlYnGQepNPM2zJCpm5H9QE1ATyLApPdkvRpkZhDNpqZslzyPM8C+Z0B4E5VmTc7Btq20G5Q8LFNygbs08AvwB4qVzYNmWjJy4BJf9Jzcl/ZD2ORUad/BL2L96AaihTB6kdfQwonL4FOgbj2MJeiXvo6RyQ6dgbJ+zJs0Sh0UTb0Y2zAGeuUZt8IWwbgDS6Uk8lP4B3UfsqAt7v6DnYexldjhM9EtMv4CFsZJa7RnsviTP2BBfg2URA7qSXugIPZpfLgXHBLd2OBt7B9Jg37KSoZMpnUGyv5K49EuEGhOXRpvRsvkcdAC9BszfYJuR4is3UBxYzditWivjOp0pkKXJWWiH7AFtO+SZ6krgOGNNpdILSGmukZ6hAmtNKwlEumzTfsrEVT/qjQOJfYt1JGT72CaXPRMvuDPQNztjxNL9GUoF8mdaGmlN9htsG1PwZtQORn1U5MmYexeVeyW5qS5GVquHDlkNmyfVHPLJzuSpGVrpll9EN88g3/ABIyy0VOWVqssuE6IeVVwDyVwiZht6KnLO05OweSknLJtW7I8l1JcjDrp1yfJDyrZz8pTsMnGmi5yxvSs8omXZyb5kHlM3JLf6KnLLrteXKmDnllv0bLLk5Z5L8lzlj12rLL+NKSHlXZLz+kCympg0nLDrpTfJLfszym+iMmp3CKkZ9dNlkc/Kxyy5ak5NtS5KnLj9dY6vKnZnk3jwcnlCXsHlCKnLK9rzfbkjyrZLzUbOWWX8o1Jc5ZddunlVk5ZOVsjLJTsh5/yt2X5ZXt0eVUzJ8yQ8m1ojy/kPyn2+pJ8FJq+Tji+C06tnSse14qbJbM2lZLYYMU37CXwwb6BMMPHSapmlHOfZpUBhY6Suhn3JymNlSw8ni0/YTcSTMmlQLBi5oz3RKyofsWDDLX0bYSuiZcUPE46rKKJb9yRP5GQwsXL1Jk72TL7NNdhgxdGuyU9z9Getiwz5KNC3rglwaUGG6Svk3lFES2hUCwsdE/gza0tETRk4QYnFOgmUDahwS2GKxbdB5asib2KCwY6LL7NNSTMA3+AxOKb+gkG1PsyiQxWOnEA37CW0wbsWDGfsU3vkhe9lON8lYDK6szyTeiW3LCUI8dG6pwRc7gJrZpchIWLlRBL+QnkeB4Sd8yafQtdB6mh4poZrnYhKkYMtUEiyZ4DAW3BIu+TDxQf4Mt8sedE62PAp66BN9wa/kG1wGEtNNEzM0TKVTAp3scgNpTITX+x9MnJewwN90C6gBUjw1sluX8BLjYNqR4nHRtNaImzTwqCRyJxUqKBvluzTRLr2OQYpurJcOti33ZLb3AYDAc06CYFOQwKUm4bZk63ZOTfDBJbWiftk8lfI8Jm6nYS3yZ/oaK+Jp+glRyMV8g4dgzpy7kibZT74Iyp0MqflmCeeTWPEF6QN7N2TcTwOJrNuPkyb7M4sFDfY8TuGa2S25thk+NBk1ocibTM02E3G0Dcr0Sm76KxFrtLjRzbcmmUDfCseM7S5mEFvkltoG7+R4ypbJeSSl7M8m/hHLLK6Zc5Z9dKzylaZOWTJeTmEGTLkZWnLJS7OebXLBtvbJb/kqLkY9dFv8ABDZs3HBzyyoqcsuulvL2Q8mS3dAnKmS5MYddKybBvckt02iXkosqRh10cnMwc23pPZsslEo553yaSMeumeb7JeXthk5ZLy2i5GHXReVywbXCYZNRX5IzzhFyMOu3TNrSI8uNnN5vfJDbllTll126ZZOGkzlllaDLOE/ZzeXRpOXH6/op5K7B5UQ3bIbSb4LnLDrt1yy2oUHKeQyybqSMmPyyva52S85ol5KHVfJLyhO6KxF7dXlwmS2k/ZE+/wAmWUu2PEe31JP8lpnNFfdHSMe84W2KbJnUaM3MBhM554F5OCZuf9g3PIYpYJtOoCTchhKb7Ypol09mQYSm2tAEwxlBgVNcm8uTV2Q2LAryN5cMhs01seHYv4MpJkU6oMRik+y5UHN2r4NLmheQtwr2Eky5NzsWGpvpGn2TPOxkMGLqNir04Oe2OLYYMdFKRp42GL4YN3oRYZfAL2by9Gd2GBXtgm5Bufg0wGBbiXuScjTNg2LCxpbHyshs0vgMVjo3XslvmSZqGUnUseDC+xJ2byDBinzRDbkzb3Ip0GBpcOTD7J8rhhgVNUaWk7CbMxjCrNRKfrZXGwwFkVL6KcRsnaHISm1oG9Esy9sMN01ol7syhWaVIAaNtWzPTWg2My/RDll+yW+RgVsejT+DJzwMKWiW3MFJ+waTe4CEn7Bti1yS2MzKsLNP5GZQEly9mn8i1cbM6ehk1g6FMydjKs9US5n0VSfYNK3IEhqxxZno3EjFM/JnBvK9A2LEluDTCDfJpmh4kvV2TT5F6aDQ8KqbphML+RMyLV7KxnTk6Iy0ORLfoMKn5pGboE2jNxt0UzpmYRpRDZWO7Y0WqcKaOc3cX0W2odnJ5WORNrMMmmwmVs2RUiLQ256J9yOT50TI4i100jSl/wCCVacBk1FOysZ2tk4mUc3+TZZcTYTDHjKs9+jnk/5agtuu2c2/ZcjHqtlPJDleysm5tkZNdmkjK0PVEPKCm7o555N2voqRl1WyybZzyaa2bJzshvcPRpIx6pbXwS8oZm+SG2VIw66U8txSIbTQZu9kZNKeC5yw66LcNpHN5N8yO2S2oaaLkcfqnJpI5tu5Nlkvgh5bLkcfvpsnx5EPNN3sG5cHPJw3ZrI4/XSnluXBGWTegycPsnhuS5GF6U8rsjyUuic8qglu5iysY9dLy1RzzmmnIvlSTk12VIytDye5B5qI1BOTjgjytlYzvTpKePRzbHJsjN12PGfVLb1JllBLmOyZY8Rr635JUafwck55KlHSMe/qbhzwZZegegkMVipqzNgmrjZhYFJ1QSSpfJajkPhE1wFbHJ0BMtwb0geSdIPYYa9EthNdmYYcGjTL2Tk0GrDDdEyk4d2RPLQ4tchibHVaZLMnezSLE4UxfyEqzCwjPILeyW+TJ10PFOirZo5DyhUZMnAuYWgbuwmeQngMCp6CfZE8DKDAqXBnl6JbacGQ8GLTWht0c5sVlYvJYcp3JPyxToz0GAyZUDYqYDDVKBtBLZpFgxUyDdwE2ZseEZhRJsWS2ZJhhuihezNq+2TcRISxyJMezNmsmexYpUmnjRM02ZQPArQNjMg79jwjujX2bVmvYYGb5gNs1tEz0BrTrQSDfRmPAaMmuSJdlLsAZZm5s1RWwbcgAzNp8BN7M52MijewXwVPsAlmNK0ZjTQ042YHdI017AM5XJmbgK7HgMrollcMHWuQSHT2Etg57M0+BwqeNmi9ip20HwMlSlwDqjJpK9jQRnUvmTOx2tE5NdlEW9olTsZUBKXP0NFrQvol7dlPTslzdDjO0P0TLmZHKNEZN6kqRFU3SuQfMk6mwqbkcTWmqBtxspXPBDtbspnacqVktueBnu2GT+ipGdpmOSXk3KkluJW0E3GhyM7S7ROhTM3CdlYy6oyZOVi2m54IyaacUypGPVGTmo0Tlbo2T9nPLLaSg1kY9UN7tkZSvRsn/FInLJ+LRcjG1GbomdXBssnMBtqTSRjaW4Vhk5W6JeVWRnldaKkYdXWzezm8pbkM8obvZybclyOP106t0Tll39E+S4VEZPmS5HH76OWTU+zlk50OWVEZO9uDSRxu+jlOiM3/AC0VM/PBD5c2XIw6oydTuSMqTlhk+NEtudlSMOujk5+CW54NlKWyMsuqLkY3otyuiW9raM4mJsPUlSMrWy1ZzyniCnMNckvihotM9Ezs0/gG4pDxna004BBP2KaVjxGvqvJVRs5z0Zs6Rj9C46TwHJM0UnQ8Mgm+zTubCUIKlcM0042Da7JbFgdE3sJlEzZk3NBhLbcSZthNdmfQYZmxrslaZn8hgxpmjWCJbuJHgdJSNKOfldCnchgdVl7FO7IxdGbqELEOkqAbvZKdGFgVlGtk8NIHkClPQ8N0TbuBsnVA8vdiw3TyXKGfdENvk09Cw1SvsG7JfYNsIMXkwkluxUDwKWhTXYTwDd6FiXSV3IeRDdB5SGJdJuxTghObGfYYpScLYNkypM37oMGr5szdwmc57sQwltyS24pkpuHArsJAuQbew5uxmobAMsjTVElYxIwzSgLmBbVguxYDcMFMjMoGx4apcezS7JTuh9IMB+yPkqETIDDLN8mm6BO9hgVTVsJNKDEYXP0S2aaBsMDSDfs0gMKfZM8BQ2OQjJpYLcjoRUqL4JezD6BIkFdDl1NErYzVxTM9ezLRmCalyDkcnHsHkkhlVTT7I5XBTaiQniBpbujJw7Zm+iW12ORNXMKyJ67N5SgbcDkRa2T9EbFtv6C4KxNW24oltxseCW/YYyqcny2S5Ky9BsuM62wezNg3V6HiazdMhzEyLiwbUFSMumbDKAb/AAS39lYitk3BLddmJlSVGXSm6BvnRkGTKkY9UZZNLZGTUbNk25ZDdFSMeqc2oo55NQ4cspu3Rzy2zSMuk5N/ZGTacJ7Ketkt2aRhanLcyRllUSVk/RzcbLkY9VmyG52ysotnPL8ouRj1UZ6Zyyfs6vW4OUW7NJHF7rOuScns2UyTk7Ljj9U5OrOb/qsW55Jd8lyON1dZ9TEE5ZXPAZPoh5RNlyMeq2T7ZzyZm6sjmypHH6qm63JDr2LYctaKZWs9ky0x9g7qYKZ2iWEuAbMnQ0Wmo3yTltm4B1oGdoYbHYJWUztfUsX2dMXs5rRac+jpD9FaZYyyedm4AaqQeRuNEvICU9SD9k87linbAFNxAJuYkVa2ZpSGDTLb2ZuydSZK4DDdFkabJep0Ka4Cgt0SzTsG4chAnyKTj2c3TKxcDwV1mhTvoia2Zv2LEr8jTeyU1uB8hYRlvgb2mT5GDDVLiWD2Dd0zJhgWtGbcbImLsJchhrT9meZCbkpT6FhmbLXZK1LQuuQwrVT7BUtkN+zT7DCU3H2SmzGAlpyuhmSJM5XIYFN9oJCQ5DAufQtz6JBu7FgUITJpAGaBlPRGTQBaVmJT5kz1ux4SnME6ZnO5HFVYZhluTc0Egr5HIapqxTUAnRmycM/2kFv5I52OE0mbA02GCKmTTthMaDJ0GAyjT9kz6Lx0PCaWHJsv2ZMMANP54GdyAA1/3BuDPsOQwi3K2SzN+7C05Y8I8GqUMh8hgWt2HLBG5cAhDrkG2NG+yi1pvYNtmcSbhjTUtkyy8mS79FJv6W62Yl9SPxQYgPcaN5Q4B07M2tDTWbYNWgFNFM7C6ZqgPLmTfI8ZVsnCOeTKntku5U0ViLUZb/yDf4BqmYpnWkziTSbTopnanL2RCT2dMzm8lcsqMayyZnugbJyfElSMumze0Q3D9mydxJOXRUjC1sso05bOWTHJtsnPJp6NJGPVS2rJblL0GTc2ya7LkY9XWydnJrdnR6OeVs0jHtDTkG4Y5Mhv2jSRxqzcr4IzlyU3Xyc83NSXIw7qcqsl5bFuictpFxx+qObhEPZWSvsjJzSLYdJydnLLZ0emc8o6Kjj9DLRJT0Rl6LY9FtwQ97+RafFGihyMaWiMuUU9EclRnQ2Tyynpg9UwRQ9g70K0DKxFZqETvTKcrYc0CK+o3G9im1ySil7Okv0Q6JqLJbQN0DiQwaptwQ3Zm/ZlA8NU0atkoUGJUvwaAmzJ+4AKcBF9AmM1YYelug5NN+wnsAfkzh70DbaNQsPWfs0ozh2CHC1TaNIG5AiuxWRIyPC10lQyZc7Ca2ahCVTiAc8GkeJA2lkti2b0IaU7TKTUHP8AyXi52GDVo0yTMIl5P5Fg1snYSpBtzMGTc7Hg1c1sfkMXyzSwxJbg2Lndkt3syYYcdKiSW4MS3LDAqfZq+QkZDAZa0afYOw0KwOk0DgE7KrsRgW0aewy9DwmlzAy42SnRSfsAzfZjNoyYGZqjJ3dhLMrYsDpUHNt/BTgnmwkLW9mC9CnVDwaWkkS4mCuID2PBrRbCejaJkAtsJCaNAjLC5FkyGDSpM7FsljTrfBu5Hh1TM5a+AJnBje5MvmALS4iqIlyJpGVHOibKydSDdjiW+Ta2ZzANy7GlsvTIczRUxJlexwqldM3JpYNw/Y0VnEtsh1yOTXYNDiaztbNt9guRbqRprPQP5M6xJdlSMui30ycnTjZn1OgcJ0XGHQfyTyP2FR/oplWcSS25F6IGijLLZNyDctt7CbLkY9VWTppdHPyp2U3VENSn7KkZdCWTllBm9p2Dai9lxh0MnzNnPJ25ZeUfBzz7LkYdVOTvZv4uZBtS3AZOky5GVqcm43Bz5ZeVkdlyMev1GbRycqzq46OeW/ZpHH7jSoObdlZNyHHRpPxh0htw+iG1EyXnbg45JeT6Kjj9HylOWTz8BfRsqm9lxj0HuwamYKivgn+6hxlU5bJkp9ohuGXGHUGUSyW2U27CaGwsTlTpg1CmdjubM0hs7EwmHcC2uoJfaopnYz/JLmeh4YcMEVt8iq2G/QehpfUFrYpzJK+ROlv0LKZkxpUA3QjVAJ/RM3sregNnQSbWzSpHhF6YT9m+zBQriZNJPJt8iwlTWyWzSuUEDgVNmlyTJXEoD1po2zP5BuhjVSoAl69mDCtdE6sAT+yk0NIlmczsaCbsQ1nvZScEpp3AppJBYerTk03MhKiQblwhYeqnkPL0TNmlBhLbccA/kyaaNwGDWb4QTKM/yTpBhar3I+XBLYPJcDwa6SrUmrsixlJiwa6US8gb6ADVKjYzFQQpGY5ChTc/QJmWjPVCUfLoU+ZIsUmGB0mUDImeRmgxKk+kZEzwMqAkCk6Jl/Bk5VBNjsPVptqBWyUnMSjT+RYWuk8QS05ozajdhPsWFpk2/QNoG0GHqpigbMmbcjwNwaezOlsza6AjH2ZMG09AskBl62E9GlrkJYEU6C2FtlKtsYrLixfyGTXAT0LCLe0aQTo08oeJqn0Q3xAt+yW/UhmE3lQS1RpWoFacMcLTwv8ABDbkzdSg/Y4nTcwaJHbkltjwrQwbkXSBuVElI0Ety5GZ9A47BNNxdE5N6Rpg0lRHVGUxMkt0Vl8yQ9lM6zjozi5ZpB/JUY9NMq6ImGLsMlVFRjQ24ZOVTDkrKI3BGUfA0VGUToluCnvsiVNlyMelVSlktrgziNhNXTKkY2jJ3BGWxyysjKe5LkZdDJzwQ3L39FPcWTlCZpGHSWn4s5t0Xlvn8kZTJcYdNlMJwRl7YuZJymGVGXVD574OTVuTpnP0csl+C+WPTOO59kuHci2o9kvTgth0jJzqjm5W9nWuES40y4wsc8kS3ReS7sluC2PUS9RJL4KmVsGqdlRjYjLRzy2jo+uyXpyNl1E5RPf2Rk92LNSy0XGHUD96NMKTXAZfI2Vgb2FsqgaSqRs7EugpGjngy5kE2FxtErYya5+AQ+mJ8Glt0QmylydOfoFT0Es0s3YsM8jPJMjIYeq49k8mkYoC0ygbHkHE0GDWbXYN8s32ab7AazdUaWjPkF7AtM8DJEs3pDwaufQT2C6NKDC0to0qQlSb7GNXPWwTaBDsCUm0aeQeiW3oMKVbYS5gk3tBh6uYVmmWSnwwFitVIzsluzSgwrVrUSZO6CUE9Bhaufolu+w+zP0x4Qb5MnVA9lqlsMPTi+x5BbEMLS2uwnZLM6RJ6fhjzZM+hmdhh+lyaSEzNxYYNX8mmH6IxfY6e5A9VYW/YWuRVNWNGqTNUyD0EqLDD1TYS6Jm4KsBqpli3rhE/wBppFhqbYTLJyyldAn2GB0uDEptCn7AaWEwO7gHwLBqrCVIbUyQ30GBbyXBm1GyEyl64Hhlx2DaCQrQYTpzQN1YTQT7AqqaBsOGzN/seEqSZc1RloJYJU32S3bF6MwLRPsya7NK1Ehl8DFLagl7DJ2ZO+gTVXHoJYTGjSUmh6M2uIBx0DhDTSycoCfr0bgciLTKNllVE8QauRpv6G+iXsqmb7RURU5Tyycm5ZT1JM2VGPQ1UyiW639FZaIfyVGNLiO2TlMmcfgMqsqMuonK5Ob3B0ybo5ZxMRBcZ9DJ25eyZc1Zm4CbKxhS3KdwRk3wUwbbKjKoczTJ+yu0S9Nlxl0nJps5ty6HJtXonJxzZcYdNLc2EqNtkt+4Fey4xoyidnPJaOj1HJzad/8AcqMuv1OS/BHDLaqyHE2i4w6S57omdocm0yCmPQbppsl1s6NJnPNTyXHH6FOaCJfRm2bJsuMqjUnNyW25bRDKjPpLT7CLmSmnzoE/Q2NiXMdEvg6ZeuSId9D1F5buwa7G+QagplQ0r6JfReXwS5YM7A2vk2OzJPgYfYM6+jr2VqyE5sZiDp737Vp7kVrZE+h+NhTlW1ZiWzSLD1SiTSzN1JL7DCXLhk7QA6DCtPGwTcgzTKGeqm+xImKZS02INJvkzyDsZUtxYA3wxxc7HE6pqjRwao2ZtANaYoVMkzRtBgdJJbs08BK0NLNuBlwaUaZA9aQlbDkHzAsOVTdAncQHJpsDdOwuTQDyGm1Xybgldi2BaC7pslGxdiPVzZuAmFYN+wwtU9GnoidmQYa/IPckp/QvQDTPsVPBMyylEbDBqofJqkJrbBzuRYNU9bJbsPKyk30LBKycmbszYV2M9L2KYCAM+zSEyEhhymZs26NPZvKww9VNaNNEygmthhOiyrcBPuSJm2VzQgzdo3YXJrnYDTo00aZ9m2hjS3RM30bTM3MhAXZMTZlMBIEuTTYJ2MuHIfCZ7CQb4kzDC1UWwchkZSGFp9tmmVATUk7mB4nSwbNMIJehgzHsmW5NxoMhxNrN8QE3ozfZLfA5E1WXtg4k07Yf3DTWbtqQrszc7ol1cjRVLpA3YOtWzS4kbO0PK2RKm0OU9k5TMSVIis3KZLsWqeiXuC4zsU3jaTlkZ7ujN1qCcnzyipGHTMlq9joHFrsuMajLpERwdHT0Q6KjDpLb8d0Q3/KJgrJV6JysqMqz3ZOUbZUbZGSl0y4yrPno5ZzyXlN2S3VlRl0lxCuQdO0Owm9yXGNiXHNsmkmU1CJy1spl1+Jyak5NN3Oi8mk2oIcJFxx+kuYbObl2Xkn9ExLotlQ9A5noaiNExNyVGHUD2ycvdlN10yG1KKjOxPDsOGUycl9FMqlzBHNFrZmrKZ2JuVwS1D0W1XsHqW5BnYMo2S+5Ka7bJ0UzsDiQ/u0VxvRtj1leQ1FGxxuyvlBcgjH0OejK/ZGJ0xco6i931r2abNPEmUMStM/ZsW+zcegbjgQVN7Mw9mkDb7GV1IGcgTPRM2abNNhINM+zTGmD36NWhkqfwDdG4JbQYVpbvQzGifgVasadVPAyQ37Fv9DwazfJp9k5O9mTsC9LWRpIxjkWGFrpPYSSrpGA9VNezXyatGcaAaZRlBMvXBm/YYemXAeSDJtaD0GJtXJm7omZHix4GllL2HwaRDVp1ZLblwEytmnmQwaXuJNYT2K17HhaW4b1ITZn2aobFh6Z6oU+yJbdsVDCwauaNPDIkzYsVqpQrL2c5srEMPVzOw+CZcQUn0BaZcwKfbomZ2ZuqYYWqkJ3ZMtPZtsBq5/BM0ZyHqQPVPejXMkyyk5YYrS65MmaWTO5ALmqZm/ySnwYUgbya0OLepItT/grHY8LXSf4kNjXDJyphg03GzT2S25CY0GFrotdBPASuAbqZDC1UhLRLbkabCQtLcvYN+wkylv0MzLkG3IvoMgKswb3Bvgm5tjxNqpfZOT5NLuSf8BE1WXAcjO0S3GkUnWfthPRm/RN8Dwi3JLYtzyw1NAiqmN2DagyZGT9seM7WyrROWtyDmzKWXIi1suyHZbp2DZUZ9VLgjJl5NR6IcTRUY0tqOycvRmE07gqMOg2iMvkp2uickn7RUY9RDJT2U2uCedlxlYedkvlG43YfI4zqcpgltRoshq6LR1E5QSxch2i4w6gerJcT0XUTEktKGyox6icoOecHTNIjNUXGPUc2rvRGSvotpSwcNNstjY5ZJkuTrkiWhs+o5ZaBwW1xBDlaKYWBw0S7dlueCObKjPqB9ol9DumEFMq16B+kVcmaQ2diJegcQU1EwbasepxGX6NaH6NkNnYJjklNzA5b+iVWgRj6Fj0ik6JVlbOpPcIz+RW5knXspabFVRf6B2ZP0aeYAaDSzfYANU/kGzNmYDWndBjuWE8i2BFxAP5M+gdBBqsnC0c5sXS7CLKKqT4Mm7XBloG44sE1RpcEtxwbjY06rkJGaD/AENNrP8ABudm98BwB6tOtjT5IX4HapiEqpSdWHlUA3cBpgrVmmbDaJdPsBq3aCps0+jeVWNNrTcCyW19mxdbDC1SfoxuDNqAwembs0g75CH2GD0qRTuZIbdmVAWukmJlGA5Vd8mmLBaB66A9M0aZRM9F46FT0KUN1Yg2ugGmaZvL6Jk0iwav5Ytx7OctOZkrdjLT7ZpUwTL4HyqQwKfyRJm5Yc6DDlU+BWUE8yaU2GK1byYJkvcSKDD1a9hPMh8Gh9iBNN9GNKAtUnBuQTlbJc9gDlaZD9MXrZoocLSw+zP5NPAYNPMyK2T9mAaqXBuOjLewYsLTzbN5VASaV3oorWhTQT6gW5VEvdsCtbXsHEDzQN8hibQ25JeTRT0TkWjWccg/kNsr3IFoCXOhbSsyakeJvWDVs55SdcnTOeV2VGVupc6N9hk7M4gpG6Mmto5t7srL9EMqJ6af4tck2xcrVghsbT74B3K2ZxGycnpFMqHqCXyX3BGT2VGXUDf8Xohzwym/RLf0XGXTP4JycMeGgcJDjKiSMr5M3DszouMqlv8ABDot6ZDKjKs5idE5Top6nohotlYzdaJyuhjgziHDHGVjk3tbJbqC8tuUQ6LjHqB2tgx9mlLgbKxLjojJXJb22DXBUZVyen0S8Z5OrVukRVlSsuuUafYRWy2oXBPDKlY2M9A3eh2tkumNOBviCZvoqGZr2NFgfZGSs6OLJfaQ2fURkq2EWW7UGSkacfv1SgdWSrspezqT2ufgvspGcRoKA1SlXZm/QcWKubAByaxfoGA0k8lbs1dgQcRQcRBm+mD9ADzDF2HFj8sBrRGzQoNPZrAtZ7JysfslxIyDaaqjTQXwF/Q01c+x8uyPhDyNJn0ZM12KjsCUtm+QTCd3IGzmAlyaeTAFJ9s3lCoAGLVNqSW7kOdi4tiSG9cCm1S0S5kU/Yy11T3ISuSW4B5LlhhaqbNyRN0KbDD1Th8lJoKaBv2A1c+wlQTYd8oRx0TT0wyh8k65gfl0MrSmypshPgZA9XK7JncUS9mxbkFaqejcdgtm9piGqZri2HGxmgFpn6CpfRm+9B90A0qRbD9hkwPTUmtslv2UmA1n7GVRNxZp9hipXRexcR7ImtjPsWHplhK0SpF2gGqnjgG+gb4k3kPEaa0D5sZXKgl1yA1pQyphEtmTvYxq17MnRlESDc8iLVOeAndg2wbQFpe9gjN9UQ30xlqm0tEy/wAGkOAwtXLBtBPbgGisRaZdg5gedg3zI4is9eyW4FxFsHEAXrGlyErYZewngpOrlEN8Gbo1JjRqXrf0GTXiU4S2Rl+RoS2mzOK5JcybdzotFpqzm3EwXK2Q6HGdqW63sNLYuOgfRTOlzBOUC242Tk6KjGs1NonLZm3cGbKjOpcJb2c25dFNqSXO+Sox6S55MPHs3Els7+IcqZIf/o65fJzgpnQ5iZJy2XD6BpcDZ39TadktpplOYBqpRTKoZMOS38kve9FMaISJaZbBuN/gcZ1zadkc+zpnvZxy3JcY9Quycr1YqYDnoaLGctaIyTR0+5B8lRlY5pO55BqXRf7JS4KZ2BpkvpHTL5Je5H9RYnuQlxotpOyHTBNgdqgW/Q9p0HqRox+9mBk5YzFF6OpvZ4tOXY8ke5KxYYbcCm/gG+ejSBap72aL2S99jWgBlxoGPAUBs70Sti3YOQI/ZkD1sy/QwUPZL9MJBKv7SXoSW7gIL+hvoJboxltlJVtaHQr3QVIFVKYkIXZq6gzixptDiYM3wNQTyAM0CyNFkvQxrp5KNyDjgieil8wBaWC2UnBPlAFW1wZdRA8SuQydgWsnTsHJo2xWuwI3AphPsANa5JTsX+jR0LAZNcUDdQDfTHh6rWxejni3vZacJBhWs52MuTBNDw9ZsZ9kp0KFg1XAz0T3wKXuRYcpbszp0Z0EpcSBmo2btEzKpDNBg1SJUzEghkMLWapwwTcbFkPYxKt5WEgnZuQVqkV7JVyZupENX5bJnoG9GkMGr4BsAfzYYNVPsG+IJbuHBSmR4Wj4FSw+xVKwGrhJWFBPQT+RFqnk+CWwb9g3UDwtLaklmm+hethhUJtGlyZ0EzQ8LVbnsL2NEx2ViLS9A3WwuJ4D45ArWb9hMGy2wmNDRazcqdmn0GWXTkE5HibVO7bNJLJeXseItPIPK3BsnyS3qSk3pnapkmerDy4KkZ2mXGznltlOpslu5HGdo+dBNiyZsrGdpyvbslu2NE5NS/RUZ9UN9OiXvoeKBKnyNlUv4B9FurIdvZcZ0PfRoM+TNUimdS9A0oKyyOb+Rxn0z+SUVlHZDfi/kpla3ETBOzZOSG4UyVGfTOglm8lfZkymViW9QbJ+wdC+CoyqX7s5vbOjpOWTwUy6S6qQ2YFuBoOlKBst6sMhyoscuDP9myn4N7kplYz5omzo3RLQ0VL+QyVme3YrVDQlxyChuC3omQJ+5/Rlewmrsy5k6q9ji1s3JKKEpstmN+Bj2MsKSGQlDP5EWCTXHQJ1bNtSM2eqZOmPwZxyAbSAZrQMEs69A97Ke9EyMM3Zvk20Na5Ag+AVuBb+zKOhkeKNJuIkOfQFVX0T7NJnA01pomS66Ja4GTNzjTJtuBfoV6Aj4ruyuzf5Cb2CQ3WwbM/ZL3AwpNybnYczJS9gQ3IzV7B1oGAVzYNuQU9j2GFpbc7GzSmr2S6dgrS3egV7NLNwEidK+RTJYS+B4eujcsMrohumMrgMOUmT92T+hQYNdVuxW2Cait/IS5kR6pMmejOCeboBq1rZk9kzuwbAi2Mr5IlplUALcIlzvkXIPQDT9iTLKl9wBytMapGn3IN1HBgMz2ZfIa7cG+wGrTM3sJUA2hQaTe5M244IyfQy1adjyiJci5iQw9U39Etw+wbqOyZh0OROqkPJkZNocXaHgnS0MoE67JbphhazbVyZT2ZtxLuTOdSPE2qlbC5BNA23Q8Raz3LYJuaZOT6NO7HE2rqfYN9hNA9bBNodySpnYt3QT+R4nVI3PoltyDyc+h4jS1xIPYT7Bu5KjO1m+yXbozfM2ZtyVjO0MHkjS+SW5oMTeizSoYS4cA03yUytDaJbX2L/AME5PmYKkTaMt3QT0ab7JbHiNU+gewlmbY2dDv0Q3DiS8oghxEFxj008N0T5fRnBFFRByakhvfJXYNLSGzqcnRzydHRqmc3bh6KjPoTfZuxSpwv2GimNHATxyVlRD2OIqqJe+B/tDKIllM7E5JTQY+9i5WgY0UqqZLmRbu0Dq0OM6mLch9FOiSmVZ8NkuPop1PJLjoaLA5ejWjTBn8j1GM+nokX8m7b2NL9srXRrmjCmdVexw8ezJuDCl3oSm4GjfZnQDFUS3RrNyAZ7g18MqJB8yAxqjZpVIl05BO9AMU2DbmTR7MxpaghdmUilYyZUzMX0yWghY1QRZSVmiRjCoSkKiDcQYaLGfAJsY7N43tDKqXU0GUcTJk40E7BONpUGLczBrg2uRmuezVyTPYoSbG4JllankyAYEuXoaaB98BPSGSsughKx4sl7kf0sPArVgnA0/QJSaTPZp2BlMHs2uTTcDBi9mW6GQa6AtTViv2YLmAGqenJpcm9DHsC2xuNmngG+CWwVrrLJ3tgupFCBtJmimzbXs0gej6GzNyzfGx4m1n7Zk4QX2F2gwtMwhpkpx7F2gxWqbcOCNOjf4BuHYhq5M3KInmDeQ8Hpby4CW/RM8mn2GDVeSiJCY0S97NMPsML06SvsJmmSnQvKQwvTf6CZ9AnFjPMRA8LTk+gm05BudowYNXMKmHk7QNt1oye0PCvRmEglt2LdEz2PCvTTywTjkzfBDd/A5EXotxoxKbmZFOx4jVS4gnJ97M3ZDqh4Vqm+jNgwehs70p3ck0w2oN9jTemybJ8no2RLGi1TaiifJg3syjllItOToh1Y5Vc2Q3yNFW3wD5hhM8B5TM0NFrZNfBDdPoWzm9vocZ2nJ/BFSLdRsmeIKxF61eMy+jZOoDgl5WPEXpm2mS29jNg7eypGVqW3FGex2xiU7KjMNd8kPcF/RLHiah/glr2VnZOpKZVnojJXRVBrdjjPoNTsH7ZnPZimY0oB+v2ZsyU/ARNZ9kZcHTjRD7KZ9B2jRv2O1qATlwUzrNRxJDXEnV6hHPK2NFS+YJiWdG1uCWvexxFiXXtBRTVwkiXyNFgcLRK3HZT9r9hyhofuaNsWjNWdUey4I+hmDcbDQDFI0Nh9WaQDG9jRqgBhTcbgOLZuTIZNEyFaK4CJASNx0EXAiv6gPAkZbGIs0AnGbrgjJyyns0SHwYEkxjmSolegfyMYlrmAhtnT2aB6nyiJJg6V2ZpbDR5Q9BJbVExYaXloTqQjgeTL2PU4Gn9gqey3G9k8Wh6VjLVCnCchY8gjGj0EPRSX0GWxlgyT7JcyU+wWxwmUr2N9ikkgepkE2Jb5BODClwBMbmDXBuLGFPsGE9Gb6QQF6mQhw7kIvYqUMjPZplmgMnvgAW1YSmD2OIYNNdiq9kroW1GxWDV1aJmGC2NAek03dBcmrkeJtZtdm9g/gP2CTlqES5enoYlOzJRIDWt+hMtMG0I9LUewmFZlDmSctdlSJ0N7syc0DmTMMVqjfAWuTT2GJtU+BlRAKINSAvTNg2pBtyHkMasJaeyZGd2PE3pTdUaUTL4Bu4kML06Tshv2GWRDY8Teltyicsl9h5P6BMeJvSuoFTJKfbMnux4m1TaiyZozf4BvcIMK9CXJv2Dbagl1yPEWrbcE5N6NxIT6KkRaznkzYZEvKaHiLVNpJ8kv9BNQE07ZWJtOT55IlSaXyFSGJvSprcMMmorfJMrv7NK7gbO1svg5uJovL5BcsqMqlxIPY5bqw+ymdZuiW6HKOCcnUDTaG6Jb6dDkw1srEWqvs0pA3WzNpKRp0yoIeXZm+SW4VwPEWs9UEpg32wpOxs7VVGyGLajdkzuEOM7S+wfYXvgcoZTKjJNXVk3MFv8ALI7kabSn2zVfsB2NNohpNEN3LR0y1dnPIqM609MJUmWghfQ0M/bJbOmcHPLVDTaH6YZQn77GgcMbK0PnkyU2a5s3I0/X7ozsxoZ1J7QzVIz4Gp0K+Q0Yl9way4oyHpYmKs1FOvYNUGiJyQVPZTX2CVhp4Y1RvRUSjNJKQ0sSuh+Gb6ENPA+kNwMN2Z43IyxLM0hfoJi5AsNAtkp2UnwP4X08My0VtRFE6cBoxmqD0MBkGliX0aTNMGqoZDhs08TIvQR0MrGba0a5gUhQ02JRX2aJYvQFgZPBU0ESNF5DSDYxKYpVA9LBMBEjO0DVbGmwP5M6lol1pmTCIxXuAc6Ga2Z3sYxP7Qy0bhmiUGjDCieTGgYpjKhfDBLsZcA9UBM0hvQTAt+wS0Tck6KcdAB6RWwi4k0sAeNmlToluzTY8LS2wfyEyD3I0Wqrs0xoke7FhL8p9HNzNGfyZMeFpdzRLvQt3ZMjkK0vuTPQMHkGDVWqC+Q9g2kGFauak0kNyZ6+AxN6ZtpbB6seZ2S5Y8HpbbBuNA3KIbscib06eV2aZ2RMszy4HifRyddhP7Dyug8rHib0qfchcKyctme9jxF6Xk+dEy9BKaM3Hscib2uVGyMnaB5Pklu9hhel+VmlNa0cpgVlvgeC9LcLmQmedBlk0tnN5Dxnelt+wbJbQLKf4lYzvS6gG4QN1Ggy3uhyJ9F3shuzZbJl/Q8RetafcBzQPY/LHidO+DSgWQTscRqm3sjJscsqhkS7SGnroy4dQTLFNtE6KxnehHLNlZpXAPLY4i9Mo+jNkwCbKxnejlrcslt1KFA22h4ztS939GbYu16QOYaGm0Zbdm5M9TASNNqmgm9UaVwTyOItLmCX+CphuSHc2PEWq1zRLpUzTK0bTGQbbUENudFuQy0xxFTzYIlqBTsaFTTol/6FP6Je2ORnaHqIJeyvKAd2UytZtQ+QmkkZWrMoVjTuv3YxYKXyWl2dQr2yciOClr2aO9jpAMZI3yU30yYAmbjSObmTo0CQxiY9QOKLijZKqYtViIN2W02EBowNUZK9lJLseOh6MSkIxQx0GjENUTlHR0a4kjJcAWCLaFGgpKEPS8jaNKaGPZnjY9GC7hEOzpARdBqPKGooGrOrRLQSjyhkw5OjV0EK4K0YySkOxuNmipCVNiW63AJlxwGh6WCjNXRr7KjgNT5QzP0W1tMiLqitTYH8EtWW1TCOx6m8pijNcluAew1Fg50Zj72ZxEsNLE/AXGyvjk1upSHosPFOye5mRevYqkPU2B+yWXHDQRPA9TYnn0LfKFpXGiXAEajZqSbD4MoBLPRNzsYuwcjFM/YNp0gc/k2tDIz6ByaW9gwSb+jN+wmvkyoaC6V2S2Vl0Q9jRaeDTC0CbuDTKsC1mwns2T9ksrE6W62ae0S9wagL0fs01sJ7ZnMDxOqTnGmE2R5WbyYYXpTycaJ9g8jTQ8Tpn3RsmS24oG9SPEXpTcaCbJb7YOhyIvSp9isuiG0MoeJ9LcSDc0T5uNg8gwvSmDtkyDbbdjwvRbW2CZLakJvoeFe1N7uSZcEvJhPEjkZXtaYSTMaBfJWJ9OjfbM7JTUBm7oMTemb6ZnrZE+zN1srE3pU9Ey+0GTIya7HiL0tugb9hPHBk+gjO1mwb6octOiJkqJvRba0yX8jLgjKhotV5SZuyJc2Usk9DwtN7DLRk6uyc/RSL0zfsNOeAbuAfTY8Z2mXDJbrZLb4ZloadVNqdDPolMHlcJhhXpTfZKbM8rohuEPEXp0bUvk5t0ZtBMPZTO9LTTTmjJ9ESkxlcBIn0uamSW5mAb7YNqRyFeg1QexlRewWxpvQeiMvmS8p0c8oT0Nl1WboL7NyMfoplaMmiW3JTXRCpjRr6HEUMOUdIXRo4bOm69zwb4CHotL8FJSw0Y4tV8Cvg6NAsfYaWJhmjsqPYxxAaWJ4GEaJZXwGrkGpJeMljF2Gk5eMC1ZcI0UGiIixiyonYQlY9PEwSkdNrQQGjEx6GOCvo0caDTwRwLxUbK7QQGpxzcyFot4i1orS8ohakzpRB0jolqw0sc3MMOC3t0DuhylgijNFcxAxGh6V5REcBHLOjUktWPUYnx9mSrZaSNwGljm1WyY2dnLRDQ9K8oaol+i8lUA0PUWCAiWU1ejQPS8oNopqOLJudjheWihSXYqqBc0CcYnnZTtm0OUsG7kB+zfRSMbhkNR7L5M1YSpsQKM1Nhz0CbDHMg1KK/wAEZbGWBtSD2bKUoJcyOJpbkyQa2KVbK1DcTBm55Fk1YIrP8ktwim6pEvKiozol6NoJkfseItS24NJm6BudDiLWbeweUfIN2GfY8RejKmZkZpnN/JS9DxPs3EBLM3eiW4YYXpnlLNuyZfeypjGR4jRNGmXZDc5aMm4dlYm9KkHaCYRtroMRembYSZvfJMjxN6V5TQTFkp3opeisT6jfZm62S9sPKtBiL2cmDcsJ9hMLY8K9K+TODN03JDdbHiPRmeAm3YNtVEEPZUiL0ufZllfo5t3sHlDHhenaVBMzTJWXJm5foeIvbNsOdi4hnNtdjkTelpuH6CWiZpg8kGJ9OjdbOflYPIh5RQ8RenRZVRLvbI8hblUVIz9M3CjZllBLnUhNjwr26rKoB5cEN1OgydbgMT6U9uwbTZDr7K42PE+mdBzoz3spZQ0NF6Z69kbHJxyQ3UyViL0p+wvQeS2KkC0OYBqeSpUMhw23I4m1vl0ZOgmCXY0WqybjYe0FvkqeBp0N3LGYBtXQZOoBNpeRGzNxezN/sMZ2tcBLVA9xINwymdqnMdExDkz+RngaNfSEuxaVDHOynjR0rXu+OcQikMNfIoVp4nxs0HXiyYDR+I+DQjp4wDx5DTQ1fQjH/opYqLDSTHwYYhmsNPA0EFtezQh6cRFSkEM6RUA0PTTEGiSkrKSoNGOcJg9lpOdG8eQ0kcyahaNBRYPkxSRoDRiWvVAW04MlQ9JDUExZ2aIiGPSwJTZo/JSVGqLYaMRkoVkHVrsEv5aK1GI1sG4OjWyMo7DSwSyXqymmgaHqbEtoLbofg0D1NieB8XuSltwPA9LEOOSIc2dGuSWroqVNgScGU8l/CNyGliWiMobOrVExTocqbENXRn0iuA+LHKzsMcAVp7B6p2NOIyhojReUyD6GiwSjO5oz6QMepxPyTsppyDrQ0WJubCXRT9WyHToaL+FzNkyVcbDgbPpm67IcwU09EPcFRlTKCaB72U4i3BbO1LcM1tEt2U6HEWhkv2L1uye5GztbkFM2Dfs0xyPEWrb5JbUmngzaQYn0G32ZvQZe2Smm7KxHrDdkXtFNqCG9jTejKNMb0TIt0NHovLcckeTmDN36JkeJtUnDNK+Cfs2TUFM70p5LRKcEt1sMnDHib0tuUTMvolNgnsMTe16exbqyU4JyyKxF6U5Iyb5M3ckPLgchXotzCQy5s5y56F5ctjxHtUwZN9nN5Q9lTQ8RelPKET5LTM2Tk+B5ifSvJc8Ey3MEzc7GYY8Re2bT2S2mzT+SW9tjTetUmVvRynorye9BifRczJM/BpsGv5TA03pp9yVKYfol82NOmV3JnetBNRwEuAHoppGmPYZO60DiNwUi1m9yCZm7J9jkZ3pXkbya4Jb4kZqWwGma3BLjlmfvRquQJprQWa1oPQ0WqXMGh3oPgG+ALWbfdE5OQkEwTbq204JYS/s03Y4i1pJcjPKRlMFRnobMnDkNcmw20xp19RSFIuEKSmzouveZUQpHxqy0p0h8aFotQl2OKK8WOPwLS1LSB4nTxCLYaJXNrpQZYnaJQPFD9HrnFBD5R2an0DxXYejjlCDxZ2a9A17Hqo5b4Bo6R6MsR6aIoz+TrktEtW4HpIgzTgqGhhwGhy8ejeJeUAh6eISGH9i5KQ9GIa5BSjs1RDVBKnE9h8sqPsYmoK0I4JZ0eoIaHKMD2S2XFRwBSbE89A0iolj0PU45x2MJ7KdbCZBOJeCgMkdIJa2h6WIS4RovZ0eP8SMsf5D0rA+QSouLBqbHKjEqqJc6LyRLXbHqcZ0TxJUch9jKwQS1Do6boloZWDewGNhlvQ9RYhuWDt9FOQaqSpWdgeyXvRbX8YJcSPWVjcaIa3Z0uGTQ9TUNOKJ26plvnsJ7RUZ0NOFJLdlxXZLd9jjOxLsh7g6O74JyUMqMenP+02W1YvcElxj0zNsU6onL0xs6z5UkS4sctewy/RX1HVRlRpDbo20ymRlxsH+TVHoPgE7hbIydbM37IcN2yoyvRbrsmTPT6JmNtFSIvSvLsX3wQnyNtbHib008cCmQ3paBZfx2PEXp0fJDM2yZWh4m9azcr4CXuSm66J9lRn6K9g3CN5SvgPKMQxN6Z5PUg8mT7kW6dFYi9tk1vZLysPKAT7Kxne2kG/YvRD6kMK9fheyk0Qn7KT74HiPS26+DlllJTy5eyWwkTehi7N5PQONyGTopNpbBhXtmloafTPmQ8mvgX8g1UAn0qV9imQqZXkwHpsnJnybKtk5ZewK1nqJCYDJ+5Nw2NOmaZOT9mb5YNzQyvRTuP8k3qTTZrcIpnrL5Mxy0kg50Itaa2OwmJBv+VANLdG2ZtEN3THibV0iGZzDsIuhptZ+2CmfYZboHsE669ol/JmZqr5Gm0PoG+dDlzJGVIbO0uZBOzTKZklsEvrEOJMkykm2Xji+DoHp7xqVj7FItIUhWn6Q8ZRvGzokyliL0WufjWzeNnZYrgyxsXovTk8XOjR6O6xonLHpB6VOnDLH7Dxi4OrVwghlelypSpg1R0i6CB+lSo8X0ZqPR1gmG5H6PXJqga2dclWiIehyjUJUL1bL8Z4NElablkqIg6vG2Z41Vj0a4w5srEt43Bo/A9UdLsiEVYP0PU4iDMpq6NFD0Yhr8hHZTgFHI9CYpg8fRdGhsvSxDVAdGkQ1AaWJBl5LoI4kepwQo2aB4MhliXPYMtpNHPmxxONcGllWDS2NOCO7JallOQ5GWJj7GJFzAXIyxslHJziGdXDJqRys7EdwCsXTYOPgqIqYdhlElt8kZXZURiX2S/wBjlPBkqsbPqM6ewhDWzfA2diXE6Ja9FvfsOyoysS/wc2dXH32REuCoz6S6USRlujo+jm9lRjQ4XBNbixl6B1ouMOhl8k5Pgp3RDm4KjOh+yH7K9E1BUZdBv2E2Z8yS30VGVLnUghb+yW7pDZ2s2o0Q52XNSRk3MDZ2juzMJr2GTclxlaqUpsnJ0DaJyjscjPrpnPIN1TM8nG7OeTsqRF6dMmbyqOTm236Mne4HiL06zV7JbcEpqNmbHIi9NMEvLjgzfZLf4Hib0W5UA2+WZxDglt8sbPrpU25MoIT7HhlYz1m3wTzHJsm9SS2phjwr0pNWEtXJMpjbkeJ9Km7NPZKezJ00wK9Kd6RLZuAewTpfaBb2a4NNDLWWmDbhxszbWmTMqwibWnkVlTsDQuBp1UxsmUE8sE0GF6VPsHYPk0qAHpm9g2aXpsG69DTem0a52LhBNjTp5CWaeCW+hlpbudmbt9hzwbLdgWq8iJbdA/0ZN8AVrpzZGWypqyW1uQiNDe6JXyaWK2UW6q6k0tBNSDa+wLWblTMkN3Rn/gE1YIqtcimC9s2MeV6GnX2DwopK2VimOKPOr0911ljQ+L2kXik6gtY0Teh6cccHJawlHVYpPQ+KiSb0Xpyj0ZI6ejPEPQ9ISv0MC1WxgPR+tcssUuSIrR2yRPiVOlzpzig8Tq8bsYoc6XOnNoiHJ6HiT4wVOlSuTRLxs7tcg8bH6PXHxBqDq8WZpMfo9cWpM8bOvjcwZqZofo9c3jzDRDVuqOzVcg0VOj9OLVWS1cHd4kNFSnrnDoM5VI6wrBqFESOUOLVENWdmo2T9FaoNKAe4L8ZNHBU6JLj5JaTOj+Aa6HKnHNqCX8FvROUwVKMQ3xAJwLRkUVjcEtFQ+zJDRU1uQZTgl7HpWBqTKvZSUoGg0saFDAp/JLaVDTYHojKzoRUyVKzsQ0kTaUFtdkscqLBJoXYvozRSbENUDLdvoHH0VrOxzdGfNltro5texsrGyomeYHJ9bJe9lRlYzcInJw5HLZGThlRHUGXJL0xchD7Ljj2Jftg3JWSIcz7LjHqM43JGTF+2TK5KjGhy7Jy2X24Ie9DZ1DZL1srJnPLZcYdF6ngl5OdmZLaLxj1VNxtkZPrRsm4sGNlal6CXItWD02yoy6rTNslu6FtUDc1oqM+robp9koza0MbKZ6GZx2DcIluaHGdpbBttyZg2hotU3QN8MZQN1I8K1qVk5WzPuSXuxyYztVKJlt6DJqQcSUi0yEr5M2S65Gm0pxIKZ38kzApqbcAnVtqK0S9SZbJyuwTelTNi8q+Dl5X0LdDL0t5IG5UnPy4KmuwxN6VLYb9GmeQ5HhaptyD5szuwcQGDRJNp7FpxtSDVUNOtP4Elz2aY3YFqm/Rt+jLRsu5ArRMB7Nk1BMwNNqlVhN2aVDBO4GXpS17M3Xom5N5AWs+pCYZsncwTMMeFrpMol8OTTKfEjwvQFobGlcmaZLiwLS47JfWjP5BfkZWs1YRHMlU+AfegTQzO3sJmeDcTNgh9q8fRSTR2eIRw9Hmfp7h7TjizriuBiqRWK7JvRXpKxdFQkdEk0aKJ9F6cHizNdHd4qLJa2P0c6cvGpJyxc0dYudlLGUP0udY4w3ybxuDq8UvkfGfgfpU6cfBm8WdocOSY9j9LnTn4syx/kXA+KH6V6c3jPonxO0IPG6sfo/Tn4q+SXhcnaNg049FehOnF4qIJyxg9DSJascqp087xgzVwz0ZYeiHjTkqdKlcmkpRDxXR2aB4vZc6VK5eKslqtHWO2Z48orVSvO8WDwjk7ZY7ZPj7HOlSueSZPLOjXQR9lymghpydGnslzyVKENOCWuzo+ZJey5QhpExZbT6BL6KlKxEdm+y2vRnih6hDTIOrRLQ9KpZo9mM6GmwteiGrLvbDb9DhWIJcXR0cakhpcjlRYj5ZmkW9A1RSMRlzBDktyS+5KibBNG/wb9C9NjZ2IafohplvZL9lRlY5tkvdltAypWVieOkS7mEW0+Scq0XGXUQ1VEuS3veyXBbGwJU5IcQ5L36JyX4KjDpGUrEhstxdktbLY0P5JY5P2Q3VlRh19Tm1FEOZK+wcMqMek0DU0Lr6Iyf0XGHUS2ErT2OT6IevZWMeqpxFE5xFGfyHGyoy6SzVyzOZlhlEIrGPVwP8ARpW+TPZOTqiozvWNc2DnbBtmydbHjP0G7oJ7Byg9lItXPTN5LUHNNorieQRpbUA2kDa4chk+xp1OU6mhmScndG52NNpb6JuTeUNk+Q0elNp/Bp+yJ3QpxMlYi9auXE8EuLM9bJbDE2s03slyVMSS7oeJtMtFJ1BzdMJuAxPp0bomYDybS5HgD1TyRMuLB/kfXQ02mVuTNpBU7BvdgWs+2ZuwevYTYxq06DkE/Yp3MAXotuJJa6KdLYJ1sZaMk+dA4kpv7OeQJtVOwlg37GegGs3tk3JT0EOaGWtxbGUCZn7oBqp2G/gJvYTHADTKZlvomdzyM+wLVPkmvsW6mSMnDoE1nMUGokzyvRk09jQ+8JD4Xejr4yZYo8tvT2f2h4xoVj2df/jhSHi50R6P0lL0KmWXBmuWLR6RFasGpOjT0A9OdOcUMcHSL3JokNVO3OFdGeL2WlZUcuivRzpxyxcOSUnB3aJa9fsfprO3Fr5GDq05gyD0v05PHlhFWztljbZLxKnRzpz8UtGhstrkzSHOlenNrklp7O0VoGot36KnRzpziiWtzR04Br2VKr04PG9QGS6Z1yx2TD0XrSVyaTBprk6NSTEPoqVcrm0Q0dXDQeJUpyuXGiWuYOzXolttwXKrXLLGtkNNNnXJcSTlESaSnHN27CIF7kpLgrQ5tVJMSdqIZWhAPk6OOiXuiic8kTW5+i8iMhwrB3wBo9jxLKTWepZLHZXEDlTY5tUDVltBkpQ9TUeiWW1NGiJUD1OOTUk5Kzo1TJKlRYjJUSm4aL9mbouIrm5BqSnrsl9jZWIbM+xboPKimVict7IdnTOTl/1C5WXXKXERIZao2S+wVMuVjYHps55U4OruSHEFSsOohoh/JbTslouVj1yjJ32Rk7OjojMuON1E5Ml0isnrknZbDpOWnZOW/op1JLdFRj0jKmRzZ0cRMkvZUcfofsLhjpxJnaKZVzyomNltTJzydQXGHQacXyDZuYBNFMuimgnYe19BfFSVGdrP5Je9lVINDRaEZ6YNv0Z7Gm0N9B5fYtuGyXlxI2VofyTN7HLYeh4i0snJ/RTj6OeX9USPEXpScvRS3RMmnoZelV2DfBpJb4HjP0rkJCeDPICvSW9smCycmMtbF/Q8bgJqDSA1XwwmnIPRDaAtV5KDN17Jm/gVkPC0zPMA3LJ5KS7AabbCeGzOYJuATq5GSItSLfIDTNbJydWa9aAeHpnXY/y2Qt7LxT7BOt8mGkw0A0PUwZ63ItuIDkAX/Sc22XFEtTNgKMjSEm36Hid1Uq+CW4Zjd9gVZ+2StwZ0a4kCf6DuCoKifovFHlFr1+dISrlj4y6OsJ8A1uCdOdOaxph4s6NNG8XQ9V7c3jKbDxlwdvFG8YQvQ9OcQrRmi45NAac6TFUDT0WlxtFJJMcqp05+M2T42dWuTQm9QHpc6cVj7ZvE7eO1BmsYhsc6XOnFrZPidmuk4Jad8Femk6cGn7FKNnRqDR2Vq9RFMGuNnSFIQpuhynK5PFwT4qTq12iHjsuVcqGiMsZOrTsGqrZUrSVxeMSQ0dsr2yILlXK5sOC2oJcSVq5URs55I65aObnk0lVKlpckNM6NR9m8ci5VRyePMQEHXJHPNVTLhpy0Q0U5ByyoaH3IOSmEdmkpI4szTLaS4JexhGS5M7RT0S97gqVNiR+KHjVEZTMSNJ5sl62MtA+5GmwP0DnsfY8UUmxzypkuo4OhGRSKhxsl+y8kDKjOub9aDMvJUS0oZURjm92gcFNN7B7KZ9RzZnHI1ZnDXsqMOoh40Szpl80Q0oKjLqIZORbVHPJsuMOk5b6IaLyv5Jb4LjDpDiSMqo6N7OebmeS443UTlVwRnqi8t2QzSOP3EvdgzOUwbsqON1U5aBurFtwS/ZTKs7UQTaTK+Cb+ymXSMvRD/bLzkhsuMOkvqQfwL5gztTJUZWIy9EvWynLdkubNIwsM0S37NUdrkIU2CK12EzUmbDKlIIrN+6J5fBsmFsrGduqlaB+nIStGfQ4itk+iHsX64JuJRTOs2+zK9s0XszfQ2dLe7Jb/ACD9mmGPE2tL7GfwHDNIi0y9SD2aeZM52AD3ZjOUwl7gZWl6fslwLjlhFwBbhfQSaWzT+AGl6TMvTNwpCpAU5fJL2U4J7GVVJvkngrgDHsQc7mjcjLSzLcCntBIgzYc2xdqQboYbkyduHAPQf4FClVPsl76HgF7GND54D7HhhFgRrxDTFUgbsCpqezLZLFRIyf6KXSFLkOJkra+DyWvWdUrTJ1agrnQPeiVShdtl9USnejpjYrT9J/jszj2Vkkghdi0ekNcBD0jpkuAdOx6qdpilwZpcaLjc0EQnYaqdDuiWp5gtzH+jQGtJ0H6IyUcHSm+gfNBK0lc3MO4CG1LOn9rlbJahIuVcqIkzU1wXXwZ41JUqp05tIGpOjTqicq4HKuVGS9kvFcSXl6RmqL1crllipknKjs1VnPJUVKuVyfLIht2W3HGwiXEGkrWVOVzBDxyhwdXiRlK5LlXK4tVZMPZ1cS1BoouVeuLmDOEpOrhqIOWXRcpyodfBL5o6O6IfJcq45ZJbCLLeg+TSU0NP0S69ltIhsqUBtwS1PNlegbSZUFS7XRL+Cn1sEXEhqH6IaOjpWQ1JUJMAX9EsZJaldG0VlEaJyY4mpaqSGdGuiMioysSwloYszW2VKkMjJVPJbdQS9WNFS1EkNLkvJR7Iyq2XGXSMlZNpnRolrkqMqm1PsjJFtR7Ib2XGHUQ3UHPI6ZJqzm1TLjHqIcdg3VaM01wDLjDqJydHNymW047Dxgth1yhyyWriTo1T7JaplyuL3HPJccEOmdMr+CMmi5XH6g97B6kImtGbj2VGFQ3bQaF2Rk4csuMumy1bs5vv2U8lohv0OOP00hPAtTZPO4NIxoc6JbLbgh2VGdD6M1+Dc9hk2NnUvdaBv0avoZXVDZ1MWD/JWzO5ZTKpaWjMxL5HGdpczBnThGegWpBNrZQnRDopuSL7K+IrbYpwSmhXyNCuNEvbozfAZME1m+AmeTNf+zewha1XINj6NF9gQex17M4m9EzcyMtMsygG4CfQHqtroG7BsJAaps1bDf0KutBCpiAf4Kith/sZaGxmwvUGTlANVWzegmGaUI9aagG3o00S2Mad8hU7M/Rl2NKvqAbkZlSG60Iy1VEtSU7WyX7ABzOw3yLfohu6Q8TafZkPEm5An+i4lCnCkE+JKV6PI69WlKnYpXLBTOyq0Kq1uZdji1zwZp6ZosQ9Lad+yNOy21Gw6gQlEvYKXci6UthEcjipVRYOL7D5ZrfAHKzCGuSoY9iXKnlyzJ96GKM1yw1rz0nK1C2DV2W+4NE7HK09OdwbxaLaWuTUlsrVToOLRELnZdGyVscqpXJ4xsmLZ0y4JguVpKhqrIa3aOuS6IcaLlaSuLUkNOaR2aZDTZpK25rm92GS2W47DJruS5VSuWSRMPg6ZLdEP7kuVpEP9kZKrOj17IzrRcqo55R4nN7g7ZHOHJpy0iGtySzpCIyiYTLhxLZGXPotkvbnRpDQ0wcFuI2Q96oqBL9A57KM/bLlJN8g4Le+yexkh9olyi+IIauEXE0OYJe6KcgvZSKMiU0U3CIegTYz0S9Mpudg9FRFS4IczLLyJt0ikX9S2mTkVxqAfZTKpcEtyoTKyjsnIqM7E5aiTm7o6ZeicqRUZdIa2pIaZ0cTTIfUlxh1HNzBDjll51RGSaei4w6iWuSMvRXyFwaRx+k9yQ99HR62c8okuOL3ENOOiH+C3PlAMuON1HNxsHyy8yMo7LjHqIeiMvgp7oH7LjHqOeU7J5o6ZXyRGy44/UHAP2PJL3Q2PUDklzMaKj2S9lSsq3JLT4K3s2RUZWOcNBcFZeicn7GzqXs0+zOOAbhFs7WbUeyXTM9C+LCMqznkJRstkuhxJbVk3LNk2D3A01uYC5cGezWkNFKZnMES9lJglvY8f6B62ZOtgml6BwZP3AUmMtZtQDME7kC0Zb2PIRYp3sZGuA0K0GQj1v0HLQt2HLGWqUukaeycXYyBGd/oypQw5NxsDM9ApNf0HwwGq0ia52MgokAzsy7HjYe4AU6s3MsyKAJlILkciG7AmbJ6nkedG39DLWfK2ZPk3EmlN7An+ilMSdJhbOeMui4cWqPJLHqmlZPXBWLc2c6kvGuYFT10T/iHxZS5ocufEkalK1TFbo2ThbgzaakRxnbjgl39C9A204Y1tGkrFSaKkpJ9ANZf0zAFLccC9V2SqVHb0Tw4LybagyqkDSVvkIsdMVO9ijSVEcktWdO23RMQ6LlXKmL6M+Yehcw5ZOUbQ40lTlfJOX7KbaCXzyXGvKXXwQ9wdMkiMmkXGnLnkyMpLycu9E5ONGkacueSZLOr2zm1DdmkaxIX6HKYIZUXGyS5Oef5OmSIydwaRUc37IfZ1yUkZY7ui5WkSzm1ZWQP0aQ0ZIMisiGXDTkQ5SLbombguGGDU6KdohvdlQmaokra3YNFEGTFnRkZNzRUpUNKdWTkp+imS3dFJc36J22Vk9ktspNZ62QxewydMqIsGTuwdcmcTLBlRlYzVENOipNzspFiHMsjLrgtkvkcZ9RGWyWU5fIPRcYWJbIy2W9ewakuMunN8kM6ZKdHPKmXGHSMtk8FtPglqC44/URlaOeSts7Z6k4tLUlxxu4ht6DL0ymtoGkkW43URnVnPJI65Ujlltlxh0h0uiW6gtvk5u6LjDoZaB6LdVwS4ahFxh1EvUEwOXyZttFRlYjLfoOPRWRza6ZWMOmycckjlXBvUlRl1A5S0Q+0dKtEPmyoysS/2DUi5uQahSOMqirMnUGmGC+SmdVTQdjKsH7Y00ZE+in6AEVLj5M/yLv0S91saazRn0ZgpcsEUxD2SZ3yYabS9Bz6F8yDBND5YTUDMBI063BvkYj2aUAPBjAAaaCbHj5J3QHpkyfQcQPDcgWsPPomaspa2AaaYJmmwkBpkz30b/Bt7HAzgpOidKQ52I1N0adhPRphjL6ZIZTkn/AFrOfgPoYYATbNEMRxAP8ARCmS1t2yZ5aKU7cHk1j1GVVLgVPRobQc0yap0Tq9FJ49Qc04VMtN0TRBITwtlNU/YN3dCXKyfAr3bJUjxCcgelzHH5Mkw8W3ElKPgDWk4fsymIKVcg+p2TTlEVTNlOuCXWjeVORLh9QZu/QPJsJ7BtyppQc24m4M3MyzNqio0jVNk5XMIZegbqyouJc9g1VsrXsnLmS42gy0c3G9lNVsOfRcacoy57IZ1aXRDXPJcaSueSZLUPR0fJGXvRcrWVzcxshq7Z0ceyeTSVcqGT24Kza3snKeC4qJZzc3ZTcBKVmkaROUzolz9F5aOWT9mkVP1LObk6PKtEfBcMcE1Jc8sGpVFwJygjJrop6IcclkDSxegb4kZs39kNzyLdElRNLmyGxfyb6KTUuNwQ/8Ft9A/kqIqctTBzcydcn+Dm1wVE0fIPTTF69BlvsqIocQQysvgljZ0OdA+hnZOW+iozofPZLXMFZeiXP4KjGh2mc8tdnTK7RDfouMuonKIkhpPiS2uyctFxx+kNfx3BE+y8vdnPKtFxh0G+2c8lei8iXNsuOP1HPJOSfk6ZHPJsuON1Evmjnkuy8q0S42aSsOo55fkmi2lchFFRx+omJRGS9HTiUyXtlyseo5uZ2DovKOCYVsqMuol7Iaui97JbcFRh1HNy9g5KaalkuYLY9QTTUhXyZ+gdaZUY2M1Tkl6Kol82OMqnJL5B6RsnwjQ6RTOs/QPezOAccAmwZM2ns1/MmehxDN0RfZbhOyXCdAmtdmtIeQUS7GiiAc6LTTCmxooi7Jey+yctSNnR8mcRsGxqBl9DmJDToWwlgNU9UQ2X7IbsCrT+BTsHPQzQDTw+wvsz0H2AJh7YSwMN0azPlSZSA0zRMspxsNUgBWzGURYcwA0zQC+Q5AfWfph9jNGdqxpFtKzS1JnMG7kAG32Kp0BlKYB/ouS8XXZyT9yUlcJnk1epO02EOfQYupWyp9mdMrdDi2uSU5USUq2xBdct/BFSxeV6IbankX6cXL+g8riEgltPoWrTkcVK6JqKMsVJFxtyUq2SHX9BlGrDUBlMkqgdTRLmYL9G/tYmkrm3VA3DfxRT5lE/Q2vNDejN1AuJYQnsptKzcvQZKpKetA3yVFxDqCW3PZcS9SDWypWkqXZL5LbXjBObXRca81GXbIduJKdtk5TGzWNYMtM55WXlvoh1NlRpAc83M9nSZVs55IuL5c3SiSW2im+AdrZpGkQyW43Y5EN2aRUGTcSQ3AvmwftmkXEtk5SrKfrkllqEmcmcyGTLgS24ZEXRTcXJM9MuE3ZLRbngl6GQ4shyU4mdA4KK0VAZNbF6IcLkpLOyVpjk79kvUlJolxsDTLjRikWpeqByrK4YNDjOoydSRk+C8iHZcRQ2vkmfsXApU5Y2VQ9BHZbRLKZ9B1UEOJpFt1JD3RUY9B6ckZbKyr2Tkns0jDpGWJzyVWdGribOeVyi4w6icl7Ap22yW+Sow6iW6dHHJRo76OeSkuMOo5NT2iWujo7ZGSsuVh1EZK9kuqOkMNbL1x+o5tURklHJ1yhoh6Klcfrlza7Dui2nGyWmi5WViHAV8FuqRDgvWPUS7IyUtlvZDKYdIagMtwW1BLacopl1EPUSQdMrXRzaZTHqM4fsJs1pUUioysTO6JTuy3GiWrbQIra4B3RrimDqxpocA1czAz6MCKzlEsrJyS9jRYHPY8bByDTGil9MXXsnbHaGipYJwxy9/RIIMexcNQZIwwzD/JtG5kIBp2aRcKtkvmAJp2E2Tc2KmbGNWndmMmMyINIcs3o0qWA0tkbK/0EpADxs3yZ2oJkAqaNNkp9CmA0zJpegSGRhqhkyMw9BKhegB17HFSw2bTmQD/AEMohObLxmbOCbR1wy0jyevUnZP6FW/+5DyuJ/BWLhmdg10SSUxBtmmriAyaUQSJWcKmzTRnfBk4A207o6VxwSq9mmpbAadLdlY5Pol8NszEcX5czIeT6InYeUTLFi46ptjK6lnLHKnFHROVRPxpA9dExeynL2wcQNpyl8uSMpOjhuqOeX7HG/KtQDbfRLncya9FxcLnQV8GbnbBxqdlSNI2TWznm72hyjROVy0XzGvKHlWyG7/2LbB3TNOfxtA22pIbcUOT4RElxrIW4JbkJaJlz8lyLjZJ2c3KOjslxBpFRzfsjLdFf9R/+jm3zJpGkGTS0c5uCn2S1XRpFwGctoF+UMouG2UkOZZXlFImaLgS9BwU4shtDgZuw0PGifRaaMvkPYsllJLtuyc0aQ+WNKciGXkQ7KQOTZFfANTJSag2XyxcQEpseoqMick+C2Rk4clazoqbJfyLbBlM6xGW9lOI6DJXMlRnUyoJy3sp9k5NTCRUZdJcwTkinLDLWy4x6jnlL+CMuy2+Cd4suMOkZTuSHdF5aJy3ouMekt+yavoXbgnsqMOhl6o55TydMtaIy0XGHUc3unQPdi5QPeymHUbJEc2Xs1K2XKw6jm1VEcWdWjnklPoqMa5slyW5jRL1Elxh3HPLdEP9l5f8ZL2XKw6icneyX2XHomEWx6mpiakGdLJy9jjKxzaoz9D6Fa2UysRPLD5HLdkOimVZ6YO/ZnWwx2CTFGuyuG5JeVDRRpSieeim/QZaBNEk3MC246BbGzpe9mVbNXRLa0h/UVnuw5fIp2DbGzqooH+TPYL2BFhTZgdICO5IatwMuegi7H8DcG4gp6iiGxBVGxdwT8lcUAL57Ju4NNjLsAy07DoxgCn0D2bfwE3oZlQ5MtUgm5M/kRHd6Mtg3eguR4SnDYNQ4MmOgDAvZnoAPX+iN/xMoTaYJzsU062eTvU4uUqKTkip9Gdc/BOHjurVsVfs44t+5KTFYMdFLkG2mEzol5k4MdE/ezPfo5zNyKyaVKR4MdZ4YeWrIT62Mzi+CcVIW1BLzZm/wCh7HjSRXlfopZ9HN1XYS/QsaSO7ylEeXJzWX0Kd3oWNJMdJlRJEwDfMA32VjXlU1ZkyW9ORm6YY1hbqYgjmTZdE5Oy5FyFubaOeTa6FvgnKqZpI1gzqCMnTKyrs5Pey5GvKcq/9nNttnQ55P0XG8OTqdkItuqRyaLiotv6IblBNm2jSQ05L7OOVuDpk0mc8r9GkawO/oltaehfQcRBcUnKI2Rk3MFZckvRpDDnsMjNq+CW62XgZugM7FfJQtZ0S30UyMvZUJm4RDbQth2VEUNuNmbUGyJHE1n8gNtUSxppfoMvk00FxRUZ2pb9k3BWWiMnHJUTWbZOWxfyDnsqMqHjDIclGb5KjOp2TfYy5CaZTOjKLOeTclP5Iy2VGXRygjIp2S2ioyqW7rZLrkcgyWi2NQ5ncBJeWiXahFRjY55Kt2TF7OmaOWSstj0XZDlMp+iX8lRh1HPJeyG2dctkZb0XGPUQ/kyYvlg9SVKw6S92Q0dG6Idlxh1Es5tJs6ZaIyLjHqOeVUQuYOmaOeShlRhYzT8ZB7Kj8GfbRUrG8ub30GWymugaoqMuokj0U1IOIhlRh1ENEs6cE5NRBTOxze/geBhfRtqhs7A6BlRuiclyPU43yT9i+xepgE2Ia7N+inoHoEWB2mSlPsWDpboaLDSTD7NXyavoqM7Ge60Lky/pNNbBIfbJf6FksCpcQRd9FPXoGvwMmnkmLH7MtgTd2MhHozAGgdvZnP0bTA2avZpsxgJXAbTsOBa6Ax9mkXoGIM+2ZpwZ0a+xhrQu7BaM3HIBnJMwxcmxQw/0EsuJSOmGUvaPOnWjri+jymvVpy6zWq+TeXDeiHl9m9EjHbynkzfjqzlKmZ9D5RUiw5y6+Tq4GVGrOOLU2Mw/QsHl0b6oHk9yRNxJXEBYci00mVK05OKyfDOiyUE2KkdJ1ANsiVxQrJOU3QKnKm7Ib5F2RkwxpypNJmT90c5fZSdQx40kdJ2yG29GyaiiHl0EjTiLlmWSIl/kHukGN5FvLbShkNudml/AN8SXIuFuL2c8m+xeV+iW9suRpzGntkNmbnbDLVFyNJBkc3MlN37Ifo0kawpuCcn70ZtwS2rXBUXBlLJyy+jNkZOVbNIqHyUHPIG2rRLy4LkXIWQ8mbJw9ktrg0kUbkntC32HouHA1APuBZLdlwNdyTk6FsjJyyhrN9Mzc8koeNlJDNlQu+QoaKOIkl7KbVhk7HE2pdEe/9l5O9kPZSbStMMm9yLi0TQ4jROyG98FN0DfopNS5B+xuZB9FRn0G00yMn6La6OeTvZUZU5aIbfGhcyRk9lxn1S4Ie9jyS4jZUZdM3DohtzQtywqCoyrcWFdA6cmczbKjPr8D0Q90XTIfLkcZVL3ZzcnRpQRki4x6iW2E20UyeHwVGHUwOIaOdWXlK0c3JpIx6S90TyU7b4DiSo4/US3YZdFPsl2rLjLqIdkuy8kQxxjYh7YQr5Kak3Oy2FiYo55cwdskrOTV7KlZdxL7Jyktq7Je6L1heU5MhwdGpWyWvwNl1EtkFsl0UysAOhe5B+ymVh4csOBeuyVE2CbGa9mfsXSJfyCKzjX7Jcz6Nbk00NNic/RL2U17Ie4GimWaeA4iRXI2daTJ7DVyDbmSmdU2ohkNzBm/yYSa3BSVTIKjfIw0/TJbcjE8m4oCPFA0Zm42ATls3NlZaJd0A0uES2zP2YAZ1I83QYxyPECNnKkmypnZPLGDBpQ42Z/AA/INv0Z/INsAG+zfACqYyffU5Vl45Jas48TMCq5PLLHrkj0eVFJz7POsvydFnyZ2HOXTKERLFZcchDA8dJmLMo7I9ji2hDzjpPIv23Jzcp+zPLtwGDy6VipQeTk5rKakpacBhzlflvk0taIl9jbFi5HWXFkvK4JTJmHYYqTFzY20TP4JeXTgMaSKbfKJ8rthk3yRbocjXmOye2UnOzl5OLUC37Cc60isn3ohvoHnXonJzyXJi5C7foJqwb9kN2XI15im00RNg20S8rLkayKytMjyaM8+WTlkuCpFxm0c8nu5M97Je+jSTFSDJwjm8nops5ZOy5GkMyDdm4tkZZcQXIqGUTlugybkyaNJF4zNP2ZuNkt7sqQlSS3zBp+gZZBuSW72Z9SC2VAr6JbNMbCSk1mTk45oWyY7GztZvoG+gfrQlM9ZsjtlPewbXA4nQpJbspzLJcDIXsGzPv8AAcWVE7jNcyDZWSohu4mRxNrZaObOkzKRzycUOMqnJ9MmeeRdzDBx2aRnU5PkluFIyE9lRlQ+9EuSquiXDKZUP5B6kWEoqM7A6RDOjqmRlEMqVl0l0S1PJTmGSymdghTsGldi9zEE5T8FRj1A4iIk5vmin0D0+C4w6csumEUW/wAlIrWXU1xaaBu9HR47IeL/AAVGHUxL/JDW2W90DW1JUY9RzaoIlXsppyEotlYnKSXuYKer5J4sqMeoOCPZbhojIqMeoGt2S0UwcqypWPUQ1TJj2XkoZO6K1hYhqp0D0W1VhHQ0WJJi5ktg2voaLEsHrsbgGosbKxI+jP2Da+Bpob7OZWRnWxs6n2YakGroaLCS9C5szRTOt9GiHBtmTj2Cay05DkqoonlglkwijfdG7AMzGRpQBNhexfL2FjJSjkn/AAa9cmxEG0bnYu1sIfPAxKpPtE7Zp6M1HIjVv0YmxAM/2H6NITYGpNByCrZS2Mo+9UqNEkJleVf6PLbHsXlcinejn5fRSfQsV5dFluxTrZzUjJOFjpKizX5UR5IU7iRDFSu7CUaadk5OAwTlU1Rk3JDyFO4DFzl18jT7JT0aV2CpytNxCZE7N8gthh46S42C5kJQNp3MDkVI2TiCZNk4uZJbKxpItuth5XMkzJllYSNJFz2iG2VNWzk/6twXI0i5d2S3dhM1IPIcjSQ/LIylujNvknJ8lyNYnKZCScm5gl5couRci5Jb7CTZOtl4sN76OeTM8toh5KzSQ5GycVJOTT0Dc/JLfJciy+ZN8hMGkqQaMpBvY5MnmCoDNbBtaMD2VhWszOYNZnrY0pyf2TQ5OGSUVM0GTTVsyf0au6KjOpj8GbQvTJyZTOhsJBgxp+KlRuQJ1Yz7GLWJcSW38HObHEVm0RIyTJUZ2iycnZUg74HibQ/g55PkrJtM5uZLjKlsHo16DJ1RbLqtwQ5ZX6B9FIoyJbrRTXROQ4yrZSRkW2GUwNNiakGlLixevZioipdOyMlKOj1Zzy54KjDqOeUSD2VlyHJcrDqJ1cGuC6iyMiox6TwD5keQe9lRn1ERVEtF2uCWr2UxsDVS7Oda5LdMgqMeoHW7BrReXsMlCKlZWOWcWQ4kt79EtLZesbEtMH7K+yXvscY2JaqUERsp6dhlr4LlY9RL7RNyVx8ktdMcZWBztkP0inKCPoqMuohzOjPUIfsLpFM7A6VkO2XlYQwRYn5BzaLalExY0UOeQ4KuKJ42CbBkCTZXJKmZGzsbuxWjcdDSVaKZ1LdPgHsWDkEUXYTfZjJASkKSkFvQ/IANO0Tzqy2/ZDGQuYFdyGivsDg49m42PIRXsDao9k2VZn+QCTTZoMwBD0PQN9gCoFAtGbAPuktTLgyZLXbNMqDzGx7ROXZPsU6o5Jw5Kxdk4ry6zINsJe2ZuycLypxBlk0S3OifKHAYPDu2ljq2DnTZCy4NlkwweVS/occnyc55FPmQxc5x28nEsJX4IWVPoyyV8CnJzl0yyTInsFlTJeSgch+XSagl5dnPLLmSPJdleWk4d/L6JbTqTn5zRpX0Pyc5dXlWw8mnREqypoflcinl7Jn3ohv2S8t2Py155dMnRzyb4cA8vZDfsuctZFPJrdm8+Dn5GbqCsVIXlPNEzcEtuTZMuRpFNojJ8EZP3YTey5Dxsm5Ibcjl7IycUaSKhbBs0yQXIansfZL+QetjkJWTJkzyo29FYWl0GzE5McidP+AejN0Q3Y8Betk3uTXJpGVob5NpmyZOWyozpbObmZkr2TFwVEUsztCohmexotS17JdFPeyG72PE6zdkPZWTqYJmyomhywuRfzQfA4ztMUS9bFuHsnK3Q8R1Rkq2TkqKjcE8lM9Q9Nkz9lvbI9FRFbIlydKIcS7ouM7Q40S90M/o3uBs9G2CexdBlEDRUvboIK4YSP4ixL0Q1OtnRzXRDxtspFiMk1wS9o7ODlnvRUYdQNx7Ja/JW2HJcY2J4CuC2S96H8Z9RJD5s6ZKuznmXP1h1MT6gl6tl5Jz6B7K1neUA/RbJyiNFMry5ZaI4OuWL/JMcFRj1ExXRLmGdGpomFNlRjY5tBH0W4WyX8lSsOolomFPotroGnBUrGxDShkZKaOrVzBDa0VGdjnkodByW6IdNspnZh5fZGWy26nYXA4ixPoCskyXQIxL25ol7LbB9jRY5sz9DlbMNFhigmEab7GOhxlYh6AcmCpjRYVs3sZJ5BNUn+AnZn8hFgTP5AYcGngZNMMG7QSYApmo2+QAyDMCXsDZxs1g+UABS+Q0E8MpcgZWoBbNY8iJ9vbcOxx9nNPgpNHmlj27F8UypTshW+ikoWycGOnkoHys5poZS5Dyfkt0RN9i3yQ5thh47J0DyipZyTyTjRUhgnK/JQZP8EeSTNexYry7SmjeXOjlJssr2V5Py6tpdkPJWGWU6ITUxISCQt76IeV9HTKIOOeypGvMdJpWbyOcsVlY8XOXTye5N57uCJvsnNqR+TkdPNEPJS5IeSJbuipGs5dfKUiMslJMwE8suRUmLb6onJzegbUPolvocipFTUEZNmb5JmSpyqFvkHPYSDdFyKDd7Ce0bJ3omS5AqaJbBtyZ7KwzPZpX2S7NlRWJ0t9k3bCeWKY5E2qlwS/YeTBu4HInTJPyVKJ0MtENGKbn2Q3/ACgchazdM5w+y21yDkqItS9RI8QZgPEWs30Db5ZuAfwPEWjJ1RLf5FvolxZSNZuVAOJMzLuBlaXBFyUyW+JGi01DIexbcmRTO/ouCcnTgpt6RDHIytGWthXNGb6DLclRNpqCHti2tBU7KjOp5tGehnkz2NmlzZLiCrhkwuBk2+DR6BTMlJsafqGmtgdcvyjll6Y4ih/JG5lltWDSRUZdRDQNOLOjJabovWXUQ10znDOrsnJMph1Eu2Q46LahhCkbOxza2RlMnXJKGSknMFSs7yhmh6K8WZbKlZ2OcXZOWNnVxDIemVGHUc8k5BxJeU9nPPVbKjLqJyi6Obmaou4CHtmkcbqByZrmRa6CpGzsTl/Sc3ujs9Sc3uioz6iH7BpSVlZMN+hsrEtRMm4iYRXKM4kbOxzfyHJeULhEP0VEWYnvgGU/SDjQ2dictA4kuAe7BFTCMzOzcDZ2BwTlBbS6Ji4GzrfBMWU+zKRoraVg0VtWDBNSDVl/APYBL7BpluwGm0PViuwMBz8bZv0PFA6+RGGgqSjQhnAFmsUAHOxW7NCMtMQfacXOy07cHnTfujti+Tzmx7l5dVl7s0udnJNKZHynknyry7SpmKN5JnHyqDPKoDyPLq/0CyhkeVGbUasWDyuZltlJ1Rxl8sU+JDD8uzdegyfCJlREMG4FhyKloJnZzkZ4RWL8rbaQLK7JbZLamgwSO3ls0rk4+QprbkeLnKp3GyW3EC3zBLczLKkXh8nEi3KsjycQGTqByHIQb9g8k9A3Rc5aSHi2HGyZhg8o0VisXk0TNnPyhmTqipDx08q2HkRKsyclSGX6JbrbM7ZM7KkPVN/YceyE72UtFROqVolDPRnAxal6cbJUsrJ9EypGnWZLcSU9URlYyP2HlHEkt+zDTim0Eg2roE4QyX5VZGTs21ZtlJtb4NaCezTyNFrVchPo3wS3bGi1nZmoNseBs7UuwyiBbBwMtRlIS42W7k55MorWbvsHlWjNvZDy4TGztU2mD0TKs01Y4ytMpE5OrCaM3HsrEVm1oKkz3shvbGi0t+iRnsIkpFFzuhbg3ZvspAqAyXQv3sG/YJDUGx7YNgnYy1bbghqa6KbIy2ET0HCZnZn6Bwioyoe9mfZm6Jb4kpnYzfwGxomYZUZWM0S0U/TB6KRYhmjpDlXJMw5Y4iw0iMvgpugcRsqMuojLThHOy32yci44/Uc382Q/dl5w3siVNFRl1G9wS0i+CcrRccbpLiyMist7JcPkqM7GetE/RS0HLHKz65TOwcclNQS0uytZWJdfBOVlPUEyuRxnYlq9meoKhkvqSmdiWocm9FOA4GysR9k8lZQGkCLE3dGcmkcdjRY0d7BpFcEv5KZVLiA5gXsHsbOxVSEr5JnoXAE3IGkoaaA/wMUTNgi0uNg4BDW2AZvgOdm5NNAqGgdI0gCm+x+yeaK2BxmKlMdocboR4//Z"); background-size: cover; background-position: center; }
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
        .nav-bar { position: relative; z-index: 10; background: #1a0800; padding: 10px 16px 16px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .nav-pill { display: flex; align-items: center; background: #251208; border-radius: 32px; padding: 5px 6px; gap: 2px; box-shadow: 0 4px 24px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.08); }
        .nav-item { display: flex; flex-direction: column; align-items: center; padding: 7px 13px; border-radius: 26px; cursor: pointer; transition: all 0.18s; gap: 2px; min-width: 52px; border: none; background: transparent; font-family: 'DM Sans', system-ui, sans-serif; }
        .nav-item.active { background: #3d2210; box-shadow: inset 0 1px 0 rgba(255,255,255,0.1), 0 2px 8px rgba(0,0,0,0.3); }
        .nav-icon { font-size: 17px; line-height: 1; color: rgba(255,255,255,0.35); transition: color 0.18s; }
        .nav-item.active .nav-icon { color: #fff; }
        .nav-label { font-size: 10px; font-weight: 500; color: rgba(255,255,255,0.3); transition: color 0.18s; }
        .nav-item.active .nav-label { color: #fff; font-weight: 700; }
        .nav-dot { width: 4px; height: 4px; border-radius: 50%; background: #ff8c42; margin-top: 1px; }
      `}</style>

      <div className="j-bg" />

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
                    {entry.workHours}<span style={{ fontSize: 13, fontWeight: 600, color: TP, marginLeft: 2 }}>h</span>
                  </span>
                </div>
                <AuraSlider value={entry.workHours} min={0} max={16} step={0.5} accentColor={workColor} sliderKey="work" onChange={v => set("workHours", v)} />
              </GlassCard>

              <GlassCard>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 2 }}>
                  <span style={{ fontSize: 13, color: TP, fontWeight: 500 }}>🌙  Sleep hours</span>
                  <span style={{ fontSize: 22, fontWeight: 700, color: sleepColor }}>
                    {entry.sleepHours}<span style={{ fontSize: 13, fontWeight: 600, color: TP, marginLeft: 2 }}>h</span>
                  </span>
                </div>
                <AuraSlider value={entry.sleepHours} min={3} max={12} step={0.5} accentColor={sleepColor} sliderKey="sleep" onChange={v => set("sleepHours", v)} />
              </GlassCard>

              <GlassCard style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px" }}>
                <div>
                  <div style={{ fontSize: 14, color: TP, fontWeight: 600, marginBottom: 3 }}>🤝  Social activity</div>
                  <div style={{ fontSize: 12, color: TS }}>Time spent with others today?</div>
                </div>
                <button onClick={() => set("social", !entry.social)} style={{
                  background: entry.social ? "rgba(255,255,255,0.45)" : "rgba(200,190,185,0.22)",
                  border: `0.5px solid ${entry.social ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.2)"}`,
                  borderRadius: 20, padding: "7px 18px", cursor: "pointer",
                  color: entry.social ? "rgba(20,6,0,0.85)" : "rgba(20,6,0,0.38)",
                  fontSize: 13, fontWeight: 700, transition: "all 0.22s",
                  backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
                }}>
                  {entry.social ? "Yes ✓" : "No"}
                </button>
              </GlassCard>

              <GlassCard style={{ padding: "16px 18px" }}>
                <div style={{ fontSize: 11, color: TM, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 700, marginBottom: 8 }}>Reflections</div>
                <textarea className="j-ta" placeholder="Write anything — thoughts, observations, what went well…" value={entry.notes} onChange={e => set("notes", e.target.value)} />
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
              {mentalLogs.map(log => (
                <div key={log.id} className="j-hcard">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <div style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: 18, color: TP }}>{fmt(log.date)}</div>
                    <div style={{ fontSize: 11, color: TM }}>{log.time}</div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
                    {[
                      { label: "Work",   value: `${log.workHours ?? "—"}h`, color: log.workHours <= 8 ? "#92400e" : "#c2410c" },
                      { label: "Sleep",  value: `${log.sleepHours ?? "—"}h`, color: log.sleepHours >= 7.5 ? "#92400e" : "#c2410c" },
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

      <div className="nav-bar">
        <div className="nav-pill">
          {NAV_ITEMS.map(item => (
            <button key={item.key} className={`nav-item ${activeNav === item.key ? "active" : ""}`} onClick={() => setActiveNav(item.key)}>
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
              {activeNav === item.key && <div className="nav-dot" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Insights Page ───────────────────────────────────────────────────────────
function InsightsPage({ logs }) {
  const mentalLogs = logs.filter(l=>l.type==="mental").slice(0,30);
  const foodLogs   = logs.filter(l=>l.type==="food").slice(0,30);

  if (mentalLogs.length < 3) return (
    <div style={{padding:"60px 24px",textAlign:"center",maxWidth:480,margin:"0 auto"}}>
      <div style={{fontSize:40,marginBottom:16}}>🔍</div>
      <div style={{fontSize:16,color:"#888",marginBottom:8}}>Not enough data yet</div>
      <div style={{fontSize:13,color:"#555",lineHeight:1.6}}>
        Complete at least 3 daily check-ins to see your first personal insights.
        <br/><br/>
        <span style={{color:"#6366f1"}}>Each day of data makes the picture clearer.</span>
      </div>
    </div>
  );

  const overallMoodAvg = (mentalLogs.reduce((a,b)=>a+(b.avgMood||0),0)/mentalLogs.length).toFixed(1);
  const socialDays    = mentalLogs.filter(l=>l.social);
  const nonSocialDays = mentalLogs.filter(l=>!l.social);
  const highWorkDays  = mentalLogs.filter(l=>l.workHours>9);
  const lowWorkDays   = mentalLogs.filter(l=>l.workHours<=8);
  const goodSleepDays = mentalLogs.filter(l=>l.sleepHours>=7.5);
  const poorSleepDays = mentalLogs.filter(l=>l.sleepHours<6.5);
  const avg = arr => arr.length ? (arr.reduce((a,b)=>a+(b.avgMood||0),0)/arr.length).toFixed(1) : null;
  const avgFoodQ = foodLogs.length ? (foodLogs.reduce((a,b)=>a+(b.quality_score||0),0)/foodLogs.length).toFixed(1) : null;

  const insights = [];
  if (socialDays.length>=2 && nonSocialDays.length>=2) {
    const diff = (parseFloat(avg(socialDays))-parseFloat(avg(nonSocialDays))).toFixed(1);
    insights.push({icon:"🤝",title:"Social Activity & Mood",color:parseFloat(diff)>0?"#4ade80":"#a78bfa",
      finding:parseFloat(diff)>0
        ?`Social days: mood ${avg(socialDays)} vs solo days: ${avg(nonSocialDays)} (+${diff} pts). Social connection is lifting your mood.`
        :`Solo days score slightly higher (${avg(nonSocialDays)} vs ${avg(socialDays)}). You may recharge best alone.`});
  }
  if (highWorkDays.length>=2 && lowWorkDays.length>=2) {
    const diff = (parseFloat(avg(lowWorkDays))-parseFloat(avg(highWorkDays))).toFixed(1);
    insights.push({icon:"💼",title:"Work Hours & Mood",color:parseFloat(diff)>0.3?"#f87171":"#facc15",
      finding:`Short days (≤8h): mood ${avg(lowWorkDays)}. Long days (>9h): mood ${avg(highWorkDays)}. Working long costs you ${diff} mood points.`});
  }
  if (goodSleepDays.length>=2) {
    insights.push({icon:"🌙",title:"Sleep & Mood",color:"#a5b4fc",
      finding:`7.5h+ sleep: mood ${avg(goodSleepDays)}${poorSleepDays.length>=2?` vs short sleep: ${avg(poorSleepDays)}`:""}. ${parseFloat(avg(goodSleepDays))>6.5?"Sleep is a clear mood booster for you.":"Other factors may be driving your mood more than sleep."}`});
  }
  if (avgFoodQ) {
    insights.push({icon:"🥗",title:"Food Quality",color:scoreColor(parseFloat(avgFoodQ)),
      finding:`Average food quality: ${avgFoodQ}/10 across ${foodLogs.length} meals. ${parseFloat(avgFoodQ)>=7?"Strong foundation.":parseFloat(avgFoodQ)>=5?"Room to improve — better food days likely lift energy and mood.":"Food quality is a key area to focus on."}`});
  }

  return (
    <div style={{padding:"24px 20px",maxWidth:480,margin:"0 auto"}}>
      <h2 style={{margin:"0 0 4px",fontSize:22,fontWeight:700,color:"#f0f0f8"}}>Your Insights</h2>
      <p style={{margin:"0 0 20px",fontSize:13,color:"#666"}}>Patterns from your last {mentalLogs.length} days</p>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:24}}>
        {[
          {label:"Avg Mood",value:overallMoodAvg,icon:"😊"},
          {label:"Check-ins",value:mentalLogs.length,icon:"📓",raw:true},
          {label:"Meals",value:foodLogs.length,icon:"🍽️",raw:true},
        ].map(s=>(
          <div key={s.label} style={{background:"rgba(255,255,255,0.04)",borderRadius:12,
            border:"1px solid rgba(255,255,255,0.07)",padding:"14px 10px",textAlign:"center"}}>
            <div style={{fontSize:20}}>{s.icon}</div>
            <div style={{fontSize:20,fontWeight:700,marginTop:4,
              color:s.raw?"#a5b4fc":scoreColor(parseFloat(s.value))}}>{s.value}</div>
            <div style={{fontSize:10,color:"#555",marginTop:2}}>{s.label}</div>
          </div>
        ))}
      </div>

      {insights.map((ins,i)=>(
        <div key={i} style={{background:"rgba(255,255,255,0.03)",borderRadius:14,
          border:`1px solid ${ins.color}22`,borderLeft:`3px solid ${ins.color}`,
          padding:"16px",marginBottom:12}}>
          <div style={{fontSize:13,fontWeight:700,color:ins.color,marginBottom:6}}>{ins.icon}  {ins.title}</div>
          <div style={{fontSize:13,color:"#aaa",lineHeight:1.6}}>{ins.finding}</div>
        </div>
      ))}

      {mentalLogs.length<7 && (
        <div style={{background:"rgba(99,102,241,0.08)",borderRadius:12,
          border:"1px solid rgba(99,102,241,0.2)",padding:"14px 16px",marginTop:8}}>
          <div style={{fontSize:13,color:"#a5b4fc",lineHeight:1.6}}>
            <strong>Keep going.</strong> {7-mentalLogs.length} more check-ins until your insights become reliable.
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main ────────────────────────────────────────────────────────────────────
export default function App() {
  const [page, setPage] = useState("home");
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLogs().then(data => {
      setLogs(data);
      setLoading(false);
    });
  }, []);

  const tabs = [
    {key:"home",    icon:"🏠", label:"Home"},
    {key:"mental",  icon:"🧠", label:"Mind"},
    {key:"journal", icon:"📓", label:"Journal"},
    {key:"food",    icon:"🍽️", label:"Food"},
    {key:"insights",icon:"✦",  label:"Insights"},
  ];

  return (
    <div style={{
      minHeight:"100vh", background:"#0d0d18", color:"#f0f0f8",
      fontFamily:"system-ui,-apple-system,sans-serif",
      width:"100%", maxWidth:"100%",
      overflowY:"auto", msOverflowStyle:"none", scrollbarWidth:"none",
    }}>
      <style>{`
        * { box-sizing:border-box; }
        html, body { scrollbar-width:none; -ms-overflow-style:none; overflow-y:scroll; }
        html::-webkit-scrollbar, body::-webkit-scrollbar, *::-webkit-scrollbar { display:none; width:0; height:0; }
        ::placeholder { color:#444; }
        textarea { font-family:inherit; }
        @keyframes fadeUp {
          from { opacity:0; transform:translateY(10px); }
          to   { opacity:1; transform:translateY(0); }
        }
      `}</style>

      {page !== "home" && (
        <div style={{padding:"16px 20px 12px",borderBottom:"1px solid rgba(255,255,255,0.05)",
          display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div>
            <div style={{fontSize:18,fontWeight:700,color:"#f0f0f8",letterSpacing:-0.5}}>
              vitl<span style={{color:"#6366f1"}}>.</span>
            </div>
            <div style={{fontSize:11,color:"#444",marginTop:1}}>personal health log</div>
          </div>
          <div style={{fontSize:12,color:"#555"}}>
            {new Date().toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short"})}
          </div>
        </div>
      )}

      {loading ? (
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh"}}>
          <div style={{fontSize:14,color:"#555"}}>Loading…</div>
        </div>
      ) : (
        <div style={{animation:"fadeUp 0.3s ease"}}>
          {page==="home"     && <HomePage     logs={logs} setPage={setPage} />}
          {page==="food"     && <FoodPage     logs={logs} setLogs={setLogs} />}
          {page==="mental"   && <MentalPage   logs={logs} setLogs={setLogs} />}
          {page==="journal"  && <JournalPage  logs={logs} setLogs={setLogs} />}
          {page==="insights" && <InsightsPage logs={logs} />}
        </div>
      )}

      <div style={{
        position:"fixed", bottom:0, left:0, right:0, zIndex:50,
        background:"rgba(13,13,24,0.96)", backdropFilter:"blur(20px)",
        borderTop:"1px solid rgba(255,255,255,0.06)",
        display:"flex", padding:"8px 0 24px",
      }}>
        {tabs.map(t=>(
          <button key={t.key} onClick={()=>setPage(t.key)} style={{
            flex:1, border:"none", background:"transparent",
            display:"flex", flexDirection:"column", alignItems:"center", gap:3,
            padding:"6px 0", cursor:"pointer",
          }}>
            <div style={{fontSize:20,opacity:page===t.key?1:0.3,transition:"opacity 0.2s"}}>{t.icon}</div>
            <div style={{fontSize:10,fontWeight:page===t.key?700:400,transition:"all 0.2s",
              color:page===t.key?"#a5b4fc":"#555"}}>{t.label}</div>
            {page===t.key && <div style={{width:4,height:4,borderRadius:"50%",background:"#6366f1"}} />}
          </button>
        ))}
      </div>
    </div>
  );
}