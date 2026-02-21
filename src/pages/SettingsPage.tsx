import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "next-themes";
import { useProfile } from "@/context/ProfileContext";
import { User, Scale, Target, Bell, Sun, Moon, Info, ChevronRight, ArrowLeft, Check } from "lucide-react";

type SettingsPanel = null | "profile" | "units" | "goal" | "reminders" | "appearance" | "about";

const SettingsPage = () => {
  const { profile, updateProfile, recalculate } = useProfile();
  const [panel, setPanel] = useState<SettingsPanel>(null);

  const items = [
    { id: "profile" as const, icon: User, label: "Profile", desc: `${profile.name || "Not set"}, ${profile.age}y, ${profile.sex}` },
    { id: "units" as const, icon: Scale, label: "Units", desc: profile.units === "imperial" ? "Imperial (lbs, ft)" : "Metric (kg, cm)" },
    { id: "goal" as const, icon: Target, label: "Goal", desc: `${profile.goal === "lose" ? "Lose weight" : profile.goal === "gain" ? "Build muscle" : "Maintain"} · ${profile.rate} lb/week` },
    { id: "reminders" as const, icon: Bell, label: "Reminders", desc: profile.reminderEnabled ? `On · ${profile.reminderTime}` : "Off" },
    { id: "appearance" as const, icon: Sun, label: "Appearance", desc: "Theme" },
    { id: "about" as const, icon: Info, label: "About MacroCore", desc: "Version 1.0.0" },
  ];

  return (
    <div className="min-h-screen bg-background pb-24">
      <motion.header className="px-5 pt-12 pb-4" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-xl font-display font-bold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">Customize your experience</p>
      </motion.header>

      <div className="px-5 space-y-2">
        {items.map((item, i) => (
          <motion.button
            key={item.id}
            onClick={() => setPanel(item.id)}
            className="w-full flex items-center gap-4 bg-card rounded-2xl p-4 border border-border text-left hover:bg-muted/50 transition-colors"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
          >
            <div className="w-10 h-10 rounded-xl bg-surface flex items-center justify-center">
              <item.icon className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">{item.label}</p>
              <p className="text-xs text-muted-foreground truncate">{item.desc}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </motion.button>
        ))}

        {/* Reset onboarding */}
        <motion.button
          onClick={() => {
            updateProfile({ onboarded: false });
          }}
          className="w-full text-center py-3 text-sm text-destructive font-medium mt-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          Reset Onboarding
        </motion.button>
      </div>

      {/* Panels */}
      <AnimatePresence>
        {panel && (
          <>
            <motion.div className="fixed inset-0 bg-background/60 backdrop-blur-sm z-40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setPanel(null)} />
            <motion.div
              className="fixed inset-y-0 right-0 w-full max-w-lg bg-background z-50 overflow-y-auto"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
            >
              <div className="px-5 pt-14 pb-8">
                <button onClick={() => setPanel(null)} className="flex items-center gap-1 text-sm text-muted-foreground mb-6 hover:text-foreground">
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>

                {panel === "profile" && <ProfilePanel />}
                {panel === "units" && <UnitsPanel />}
                {panel === "goal" && <GoalPanel />}
                {panel === "reminders" && <RemindersPanel />}
                {panel === "appearance" && <AppearancePanel />}
                {panel === "about" && <AboutPanel />}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

function ProfilePanel() {
  const { profile, updateProfile, recalculate } = useProfile();
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-display font-bold text-foreground">Profile</h2>
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Name</label>
        <input type="text" value={profile.name} onChange={e => updateProfile({ name: e.target.value })} className="w-full px-4 py-3 bg-surface rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Age</label>
          <input type="number" value={profile.age} onChange={e => updateProfile({ age: parseInt(e.target.value) || 0 })} className="w-full px-4 py-3 bg-surface rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Sex</label>
          <div className="flex gap-2">
            {(["male", "female"] as const).map(s => (
              <button key={s} onClick={() => updateProfile({ sex: s })} className={`flex-1 py-3 rounded-xl text-sm font-medium transition-colors ${profile.sex === s ? "bg-primary text-primary-foreground" : "bg-surface text-muted-foreground"}`}>
                {s === "male" ? "Male" : "Female"}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Height</label>
        <div className="grid grid-cols-2 gap-3">
          <div className="relative">
            <input type="number" value={profile.heightFt} onChange={e => updateProfile({ heightFt: parseInt(e.target.value) || 0 })} className="w-full px-4 py-3 bg-surface rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 pr-10" />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">ft</span>
          </div>
          <div className="relative">
            <input type="number" value={profile.heightIn} onChange={e => updateProfile({ heightIn: parseInt(e.target.value) || 0 })} className="w-full px-4 py-3 bg-surface rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 pr-10" />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">in</span>
          </div>
        </div>
      </div>
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Weight (lbs)</label>
        <input type="number" value={profile.weight} onChange={e => updateProfile({ weight: parseInt(e.target.value) || 0 })} className="w-full px-4 py-3 bg-surface rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
      </div>
      <button onClick={() => recalculate()} className="w-full bg-primary text-primary-foreground py-3 rounded-2xl font-display font-semibold mt-4 flex items-center justify-center gap-2">
        <Check className="w-4 h-4" /> Recalculate Targets
      </button>
    </div>
  );
}

function UnitsPanel() {
  const { profile, updateProfile } = useProfile();
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-display font-bold text-foreground">Units</h2>
      {(["imperial", "metric"] as const).map(u => (
        <button
          key={u}
          onClick={() => updateProfile({ units: u })}
          className={`w-full text-left p-4 rounded-2xl border transition-all ${profile.units === u ? "border-primary bg-primary/5" : "border-border bg-card"}`}
        >
          <p className={`text-sm font-medium ${profile.units === u ? "text-primary" : "text-foreground"}`}>{u === "imperial" ? "Imperial" : "Metric"}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{u === "imperial" ? "Pounds, feet, inches" : "Kilograms, centimeters"}</p>
        </button>
      ))}
    </div>
  );
}

function GoalPanel() {
  const { profile, updateProfile, recalculate } = useProfile();
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-display font-bold text-foreground">Goal</h2>
      {([
        { value: "lose" as const, label: "Lose Weight", emoji: "📉" },
        { value: "maintain" as const, label: "Maintain Weight", emoji: "⚖️" },
        { value: "gain" as const, label: "Build Muscle", emoji: "💪" },
      ]).map(opt => (
        <button
          key={opt.value}
          onClick={() => updateProfile({ goal: opt.value })}
          className={`w-full text-left p-4 rounded-2xl border flex items-center gap-3 transition-all ${profile.goal === opt.value ? "border-primary bg-primary/5" : "border-border bg-card"}`}
        >
          <span className="text-2xl">{opt.emoji}</span>
          <p className={`text-sm font-medium ${profile.goal === opt.value ? "text-primary" : "text-foreground"}`}>{opt.label}</p>
        </button>
      ))}
      {profile.goal !== "maintain" && (
        <div className="mt-4">
          <label className="text-xs font-medium text-muted-foreground mb-2 block">Rate: {profile.rate} lb/week</label>
          <div className="flex gap-2">
            {[0.5, 1, 1.5, 2].map(r => (
              <button key={r} onClick={() => updateProfile({ rate: r })} className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors ${profile.rate === r ? "bg-primary text-primary-foreground" : "bg-surface text-muted-foreground"}`}>
                {r}
              </button>
            ))}
          </div>
        </div>
      )}
      <button onClick={() => recalculate()} className="w-full bg-primary text-primary-foreground py-3 rounded-2xl font-display font-semibold mt-4 flex items-center justify-center gap-2">
        <Check className="w-4 h-4" /> Update Targets
      </button>
    </div>
  );
}

function RemindersPanel() {
  const { profile, updateProfile } = useProfile();
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-display font-bold text-foreground">Reminders</h2>
      <div className="flex items-center justify-between bg-card rounded-2xl p-4 border border-border">
        <div>
          <p className="text-sm font-medium text-foreground">Meal Reminders</p>
          <p className="text-xs text-muted-foreground">Get nudged to log meals</p>
        </div>
        <button
          onClick={() => updateProfile({ reminderEnabled: !profile.reminderEnabled })}
          className={`w-12 h-7 rounded-full transition-colors relative ${profile.reminderEnabled ? "bg-primary" : "bg-border"}`}
        >
          <motion.div
            className="absolute top-0.5 w-6 h-6 bg-card rounded-full shadow-sm"
            animate={{ left: profile.reminderEnabled ? 22 : 2 }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
          />
        </button>
      </div>
      {profile.reminderEnabled && (
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Reminder Time</label>
          <input
            type="time"
            value={profile.reminderTime}
            onChange={e => updateProfile({ reminderTime: e.target.value })}
            className="w-full px-4 py-3 bg-surface rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
      )}
    </div>
  );
}

function AppearancePanel() {
  const { theme, setTheme } = useTheme();
  const options = [
    { value: "light", label: "Light", icon: Sun, desc: "Clean and bright" },
    { value: "dark", label: "Dark", icon: Moon, desc: "Easy on the eyes" },
  ];
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-display font-bold text-foreground">Appearance</h2>
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => setTheme(opt.value)}
          className={`w-full text-left p-4 rounded-2xl border flex items-center gap-3 transition-all ${theme === opt.value ? "border-primary bg-primary/5" : "border-border bg-card"}`}
        >
          <div className="w-10 h-10 rounded-xl bg-surface flex items-center justify-center">
            <opt.icon className={`w-5 h-5 ${theme === opt.value ? "text-primary" : "text-muted-foreground"}`} />
          </div>
          <div>
            <p className={`text-sm font-medium ${theme === opt.value ? "text-primary" : "text-foreground"}`}>{opt.label}</p>
            <p className="text-xs text-muted-foreground">{opt.desc}</p>
          </div>
        </button>
      ))}
    </div>
  );
}

function AboutPanel() {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-display font-bold text-foreground">About MacroCore</h2>
      <div className="bg-card rounded-2xl p-5 border border-border space-y-3">
        <div className="flex justify-between">
          <span className="text-sm text-muted-foreground">Version</span>
          <span className="text-sm text-foreground font-medium">1.0.0</span>
        </div>
        <div className="flex justify-between">
          <span className="text-sm text-muted-foreground">Algorithm</span>
          <span className="text-sm text-foreground font-medium">Mifflin-St Jeor</span>
        </div>
        <div className="flex justify-between">
          <span className="text-sm text-muted-foreground">Adjustment Cycle</span>
          <span className="text-sm text-foreground font-medium">Weekly</span>
        </div>
      </div>
      <div className="bg-card rounded-2xl p-5 border border-border">
        <p className="text-sm text-foreground font-medium mb-2">How It Works</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          MacroCore uses the Mifflin-St Jeor equation to calculate your basal metabolic rate, then applies an activity multiplier and goal adjustment. Each week, your targets are recalculated based on your 7-day average weight and adherence patterns.
        </p>
      </div>
    </div>
  );
}

export default SettingsPage;
