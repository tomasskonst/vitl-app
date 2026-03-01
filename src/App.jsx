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

const emptyMental = () => ({
  date: today(),
  moods: { Morning: 5, Afternoon: 5, Evening: 5 },
  social: false,
  workHours: 8,
  sleepHours: 7.5,
  stressLevel: 5,
  energyLevel: 5,
  notes: "",
  wol: Object.fromEntries(WOL_DIMS.map(d => [d.key, 5])),
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
    type:        "mental",
    workHours:   l.work_hours,
    sleepHours:  l.sleep_hours,
    stressLevel: l.stress_level,
    energyLevel: l.energy_level,
    avgMood:     l.avg_mood,
    wolAvg:      l.wol_avg,
  }));

  const foodLogs = (food || []).map(l => ({ ...l, type: "food" }));

  return [...mentalLogs, ...foodLogs];
};

const saveMentalLog = async (entry) => {
  const { error } = await supabase.from("mental_logs").upsert({
    id:           entry.id,
    date:         entry.date,
    time:         entry.time,
    moods:        entry.moods,
    social:       entry.social,
    work_hours:   entry.workHours,
    sleep_hours:  entry.sleepHours,
    stress_level: entry.stressLevel,
    energy_level: entry.energyLevel,
    notes:        entry.notes,
    wol:          entry.wol,
    avg_mood:     entry.avgMood,
    wol_avg:      entry.wolAvg,
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

      {logs.filter(l=>l.type==="food").length > 0 && (
        <div style={{marginTop:32}}>
          <div style={{fontSize:11,color:"#555",letterSpacing:1,textTransform:"uppercase",marginBottom:12}}>Recent</div>
          {logs.filter(l=>l.type==="food").slice(0,5).map(log=>(
            <div key={log.id} style={{display:"flex",alignItems:"center",gap:12,marginBottom:10,
              background:"rgba(255,255,255,0.03)",borderRadius:12,
              border:"1px solid rgba(255,255,255,0.06)",padding:"10px 14px"}}>
              {log.image
                ? <img src={log.image} alt="" style={{width:44,height:44,borderRadius:8,objectFit:"cover"}} />
                : <div style={{width:44,height:44,borderRadius:8,background:"rgba(99,102,241,0.15)",
                    border:"1px solid rgba(99,102,241,0.2)",display:"flex",alignItems:"center",
                    justifyContent:"center",fontSize:20}}>✏️</div>
              }
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:600,color:"#ddd",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{log.meal_name}</div>
                <div style={{fontSize:11,color:"#555"}}>{fmt(log.date)} · {log.time} · {log.calories} kcal</div>
              </div>
              <div style={{fontSize:16,fontWeight:700,color:scoreColor(log.quality_score)}}>{log.quality_score}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Mental Page ─────────────────────────────────────────────────────────────
function MentalPage({ logs, setLogs }) {
  const [entry, setEntry] = useState(emptyMental());
  const [tab, setTab] = useState("checkin");
  const [saved, setSaved] = useState(false);
  const [expandWol, setExpandWol] = useState(false);

  const set = (path, val) => {
    setEntry(prev => {
      const next = {...prev};
      if (path.includes(".")) {
        const [a,b] = path.split(".");
        next[a] = {...next[a],[b]:val};
      } else { next[path] = val; }
      return next;
    });
    setSaved(false);
  };

  const avgMood = (Object.values(entry.moods).reduce((a,b)=>a+b,0)/3).toFixed(1);
  const wolAvg  = (Object.values(entry.wol).reduce((a,b)=>a+b,0)/WOL_DIMS.length).toFixed(1);

  const saveEntry = async () => {
   const log = {
      id:      Date.now(),
      type:    "mental",
      ...entry,
      time:    new Date().toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"}),
      avgMood: parseFloat(avgMood),
      wolAvg:  parseFloat(wolAvg),
    };
    await saveMentalLog(log);
    setLogs(prev => [log, ...prev.filter(l => !(l.type === "mental" && l.date === entry.date))]);
    setSaved(true);
  };

  const mentalLogs = logs.filter(l=>l.type==="mental").sort((a,b)=>b.date.localeCompare(a.date));

  return (
    <div style={{maxWidth:480,margin:"0 auto",paddingBottom:120}}>
      <div style={{display:"flex",gap:0,background:"rgba(255,255,255,0.04)",
        borderRadius:12,margin:"20px 20px 0",border:"1px solid rgba(255,255,255,0.06)"}}>
        {["checkin","history"].map(t=>(
          <button key={t} onClick={()=>setTab(t)} style={{
            flex:1,padding:"10px",border:"none",borderRadius:10,
            background:tab===t?"rgba(99,102,241,0.3)":"transparent",
            color:tab===t?"#a5b4fc":"#555",
            fontSize:13,fontWeight:tab===t?600:400,cursor:"pointer",transition:"all 0.2s",
          }}>
            {t==="checkin"?"Today's Check-in":"History"}
          </button>
        ))}
      </div>

      {tab==="checkin" && (
        <div style={{padding:"20px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
            <div>
              <h2 style={{margin:0,fontSize:20,fontWeight:700,color:"#f0f0f8"}}>Daily Check-in</h2>
              <div style={{fontSize:12,color:"#555",marginTop:2}}>
                {new Date().toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"})}
              </div>
            </div>
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:24,fontWeight:700,color:scoreColor(parseFloat(avgMood))}}>{avgMood}</div>
              <div style={{fontSize:10,color:"#555"}}>avg mood</div>
            </div>
          </div>

          <div style={{background:"rgba(255,255,255,0.03)",borderRadius:14,
            border:"1px solid rgba(255,255,255,0.06)",padding:"16px",marginBottom:14}}>
            <div style={{fontSize:11,color:"#555",letterSpacing:1,textTransform:"uppercase",marginBottom:14}}>Mood</div>
            {MOOD_PERIODS.map(period=>(
              <div key={period} style={{marginBottom:14}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                  <span style={{fontSize:13,color:"#aaa"}}>{period}</span>
                  <span style={{fontSize:14,fontWeight:700,color:scoreColor(entry.moods[period])}}>{entry.moods[period]}</span>
                </div>
                <Slider value={entry.moods[period]} onChange={v=>set(`moods.${period}`,v)} />
              </div>
            ))}
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
            {[
              {key:"energyLevel",label:"Energy",icon:"⚡"},
              {key:"stressLevel",label:"Stress",icon:"🌊",invert:true},
              {key:"workHours",label:"Work hrs",icon:"💼",min:0,max:16,step:0.5,raw:true},
              {key:"sleepHours",label:"Sleep hrs",icon:"🌙",min:3,max:12,step:0.5,raw:true},
            ].map(m=>{
              const v=entry[m.key];
              const c=m.raw
                ?(m.key==="sleepHours"?(v>=7.5?"#4ade80":v>=6?"#facc15":"#f87171"):(v<=8?"#4ade80":v<=10?"#facc15":"#f87171"))
                :(m.invert?(v<=4?"#4ade80":v<=6?"#facc15":"#f87171"):scoreColor(v));
              return (
                <div key={m.key} style={{background:"rgba(255,255,255,0.03)",borderRadius:12,
                  border:"1px solid rgba(255,255,255,0.06)",padding:"12px 14px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                    <span style={{fontSize:12,color:"#888"}}>{m.icon} {m.label}</span>
                    <span style={{fontSize:15,fontWeight:700,color:c}}>{v}{m.raw?"h":""}</span>
                  </div>
                  <Slider value={v} min={m.min||1} max={m.max||10} step={m.step||0.5} onChange={val=>set(m.key,val)} color={c} />
                </div>
              );
            })}
          </div>

          <div style={{background:"rgba(255,255,255,0.03)",borderRadius:12,
            border:"1px solid rgba(255,255,255,0.06)",padding:"12px 16px",
            display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div>
              <div style={{fontSize:13,color:"#ccc",fontWeight:500}}>🤝 Social Activity</div>
              <div style={{fontSize:11,color:"#555",marginTop:2}}>Did you spend time with others today?</div>
            </div>
            <button onClick={()=>set("social",!entry.social)} style={{
              background:entry.social?"rgba(74,222,128,0.2)":"rgba(255,255,255,0.05)",
              border:`1px solid ${entry.social?"#4ade8066":"rgba(255,255,255,0.1)"}`,
              borderRadius:20,padding:"6px 16px",cursor:"pointer",
              color:entry.social?"#4ade80":"#666",fontSize:13,fontWeight:600,transition:"all 0.2s",
            }}>
              {entry.social?"Yes ✓":"No"}
            </button>
          </div>

          <div style={{background:"rgba(255,255,255,0.03)",borderRadius:14,
            border:"1px solid rgba(255,255,255,0.06)",padding:"16px",marginBottom:14}}>
            <div onClick={()=>setExpandWol(!expandWol)}
              style={{display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"}}>
              <div style={{fontSize:11,color:"#555",letterSpacing:1,textTransform:"uppercase"}}>Wheel of Life</div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:16,fontWeight:700,color:scoreColor(parseFloat(wolAvg))}}>{wolAvg}</span>
                <span style={{fontSize:12,color:"#555"}}>{expandWol?"▲":"▼"}</span>
              </div>
            </div>
            {expandWol ? (
              <div style={{marginTop:16}}>
                {WOL_DIMS.map(dim=>(
                  <div key={dim.key} style={{marginBottom:14}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                      <span style={{fontSize:13,color:"#aaa"}}>{dim.icon} {dim.label}</span>
                      <span style={{fontSize:14,fontWeight:700,color:scoreColor(entry.wol[dim.key])}}>{entry.wol[dim.key]}</span>
                    </div>
                    <Slider value={entry.wol[dim.key]} onChange={v=>set(`wol.${dim.key}`,v)} />
                  </div>
                ))}
              </div>
            ) : (
              <div style={{display:"flex",gap:4,marginTop:12,flexWrap:"wrap"}}>
                {WOL_DIMS.map(dim=>(
                  <div key={dim.key} title={dim.label} style={{
                    width:28,height:28,borderRadius:6,background:scoreBg(entry.wol[dim.key]),
                    border:`1px solid ${scoreColor(entry.wol[dim.key])}44`,
                    display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,
                  }}>{dim.icon}</div>
                ))}
              </div>
            )}
          </div>

          <textarea placeholder="How was your day? Any observations…" value={entry.notes}
            onChange={e=>set("notes",e.target.value)}
            style={{width:"100%",minHeight:80,background:"rgba(255,255,255,0.03)",
              border:"1px solid rgba(255,255,255,0.08)",borderRadius:12,
              padding:"12px 14px",color:"#ddd",fontSize:13,resize:"none",
              outline:"none",boxSizing:"border-box",fontFamily:"inherit",marginBottom:14}} />

          {saved ? (
            <div style={{textAlign:"center",padding:"14px",background:"rgba(74,222,128,0.1)",
              borderRadius:12,color:"#4ade80",fontSize:14,fontWeight:600}}>✓  Saved to Supabase</div>
          ) : (
            <button onClick={saveEntry} style={{
              width:"100%",padding:"14px",borderRadius:12,border:"none",
              background:"linear-gradient(135deg,#6366f1,#8b5cf6)",
              color:"#fff",fontSize:15,fontWeight:600,cursor:"pointer"}}>
              Save Check-in
            </button>
          )}
        </div>
      )}

      {tab==="history" && (
        <div style={{padding:"20px"}}>
          {mentalLogs.length===0 ? (
            <div style={{textAlign:"center",padding:"60px 20px",color:"#555"}}>
              <div style={{fontSize:36,marginBottom:12}}>📓</div>
              <div>No entries yet. Complete your first check-in!</div>
            </div>
          ) : mentalLogs.map(log=>(
            <div key={log.id} style={{background:"rgba(255,255,255,0.03)",borderRadius:14,
              border:"1px solid rgba(255,255,255,0.06)",padding:"16px",marginBottom:12}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
                <div>
                  <div style={{fontSize:14,fontWeight:600,color:"#ddd"}}>{fmt(log.date)}</div>
                  <div style={{fontSize:11,color:"#555",marginTop:2}}>
                    {log.workHours}h work · {log.sleepHours}h sleep · {log.social?"social ✓":"solo"}
                  </div>
                </div>
                <div style={{display:"flex",gap:10}}>
                  <div style={{textAlign:"center"}}>
                    <div style={{fontSize:18,fontWeight:700,color:scoreColor(log.avgMood)}}>{log.avgMood?.toFixed(1)}</div>
                    <div style={{fontSize:9,color:"#555"}}>mood</div>
                  </div>
                  <div style={{textAlign:"center"}}>
                    <div style={{fontSize:18,fontWeight:700,color:scoreColor(log.wolAvg)}}>{log.wolAvg?.toFixed(1)}</div>
                    <div style={{fontSize:9,color:"#555"}}>life</div>
                  </div>
                </div>
              </div>
              <div style={{display:"flex",gap:6,marginBottom:8}}>
                {MOOD_PERIODS.map(p=>(
                  <div key={p} style={{flex:1,background:scoreBg(log.moods?.[p]||5),
                    border:`1px solid ${scoreColor(log.moods?.[p]||5)}33`,
                    borderRadius:8,padding:"6px 4px",textAlign:"center"}}>
                    <div style={{fontSize:13,fontWeight:700,color:scoreColor(log.moods?.[p]||5)}}>{log.moods?.[p]||"-"}</div>
                    <div style={{fontSize:9,color:"#555"}}>{p.slice(0,3)}</div>
                  </div>
                ))}
              </div>
              {log.notes && (
                <div style={{fontSize:12,color:"#666",fontStyle:"italic",
                  borderTop:"1px solid rgba(255,255,255,0.05)",paddingTop:8,marginTop:4}}>
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