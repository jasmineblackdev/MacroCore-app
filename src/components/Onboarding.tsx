import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useProfile } from "@/context/ProfileContext";
import { ArrowRight, ArrowLeft, Target, Activity, User, Ruler, Scale, Zap } from "lucide-react";

const STEPS = ["welcome", "basics", "body", "activity", "goal", "results"] as const;
type Step = typeof STEPS[number];

export const Onboarding = () => {
  const { profile, updateProfile, completeOnboarding } = useProfile();
  const [step, setStep] = useState<Step>("welcome");
  const stepIndex = STEPS.indexOf(step);

  const next = () => {
    if (stepIndex < STEPS.length - 1) setStep(STEPS[stepIndex + 1]);
  };
  const back = () => {
    if (stepIndex > 0) setStep(STEPS[stepIndex - 1]);
  };

  const finish = () => {
    completeOnboarding();
  };

  // Compute preview macros for results step
  const calcPreview = () => {
    const { age, sex, heightFt, heightIn, weight, activityLevel, goal, rate } = profile;
    const heightCm = (heightFt * 12 + heightIn) * 2.54;
    const weightKg = weight * 0.453592;
    let bmr = sex === "male"
      ? 10 * weightKg + 6.25 * heightCm - 5 * age + 5
      : 10 * weightKg + 6.25 * heightCm - 5 * age - 161;
    const multipliers = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9 };
    let tdee = bmr * multipliers[activityLevel];
    if (goal === "lose") tdee -= rate * 500;
    else if (goal === "gain") tdee += rate * 250;
    const calories = Math.round(Math.max(tdee, 1200));
    const protein = Math.round(Math.max(weightKg * 2.0, 50));
    const fats = Math.round(Math.max((calories * 0.25) / 9, 30));
    const carbs = Math.round(Math.max((calories - protein * 4 - fats * 9) / 4, 50));
    return { calories, protein, carbs, fats };
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Progress bar */}
      {step !== "welcome" && (
        <div className="px-5 pt-14 pb-2">
          <div className="flex items-center gap-2">
            {stepIndex > 0 && (
              <button onClick={back} className="p-1 text-muted-foreground hover:text-foreground">
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <div className="flex-1 flex gap-1.5">
              {STEPS.slice(1).map((s, i) => (
                <div
                  key={s}
                  className={`h-1 rounded-full flex-1 transition-colors ${
                    i < stepIndex ? "bg-primary" : i === stepIndex - 1 ? "bg-primary" : "bg-border"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 flex flex-col px-5">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            transition={{ duration: 0.25 }}
            className="flex-1 flex flex-col"
          >
            {step === "welcome" && (
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                <motion.div
                  className="w-20 h-20 rounded-3xl bg-primary/10 flex items-center justify-center mb-6"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", delay: 0.2 }}
                >
                  <Zap className="w-10 h-10 text-primary" />
                </motion.div>
                <h1 className="text-3xl font-display font-bold text-foreground mb-3">MacroCore</h1>
                <p className="text-muted-foreground max-w-xs mx-auto leading-relaxed">
                  Smart nutrition that adapts to you. One number, not a spreadsheet.
                </p>
                <motion.button
                  onClick={next}
                  className="mt-10 w-full max-w-xs bg-primary text-primary-foreground py-3.5 rounded-2xl font-display font-semibold flex items-center justify-center gap-2"
                  whileTap={{ scale: 0.97 }}
                >
                  Get Started <ArrowRight className="w-4 h-4" />
                </motion.button>
                <p className="text-xs text-muted-foreground mt-4">Takes about 60 seconds</p>
              </div>
            )}

            {step === "basics" && (
              <div className="flex-1 flex flex-col pt-8">
                <div className="flex items-center gap-2 mb-1">
                  <User className="w-5 h-5 text-primary" />
                  <h2 className="text-xl font-display font-bold text-foreground">About You</h2>
                </div>
                <p className="text-sm text-muted-foreground mb-6">We'll use this to personalize your targets</p>

                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Name</label>
                    <input
                      type="text"
                      value={profile.name}
                      onChange={e => updateProfile({ name: e.target.value })}
                      placeholder="Your name"
                      className="w-full px-4 py-3 bg-surface rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Age</label>
                      <input
                        type="number"
                        value={profile.age}
                        onChange={e => updateProfile({ age: parseInt(e.target.value) || 0 })}
                        className="w-full px-4 py-3 bg-surface rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Sex</label>
                      <div className="flex gap-2">
                        {(["male", "female"] as const).map(s => (
                          <button
                            key={s}
                            onClick={() => updateProfile({ sex: s })}
                            className={`flex-1 py-3 rounded-xl text-sm font-medium transition-colors ${
                              profile.sex === s ? "bg-primary text-primary-foreground" : "bg-surface text-muted-foreground"
                            }`}
                          >
                            {s === "male" ? "Male" : "Female"}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-auto pb-8">
                  <motion.button
                    onClick={next}
                    disabled={!profile.name.trim()}
                    className="w-full bg-primary text-primary-foreground py-3.5 rounded-2xl font-display font-semibold flex items-center justify-center gap-2 disabled:opacity-40"
                    whileTap={{ scale: 0.97 }}
                  >
                    Continue <ArrowRight className="w-4 h-4" />
                  </motion.button>
                </div>
              </div>
            )}

            {step === "body" && (
              <div className="flex-1 flex flex-col pt-8">
                <div className="flex items-center gap-2 mb-1">
                  <Ruler className="w-5 h-5 text-primary" />
                  <h2 className="text-xl font-display font-bold text-foreground">Body Stats</h2>
                </div>
                <p className="text-sm text-muted-foreground mb-6">Used for accurate calorie calculation</p>

                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Height</label>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="relative">
                        <input
                          type="number"
                          value={profile.heightFt}
                          onChange={e => updateProfile({ heightFt: parseInt(e.target.value) || 0 })}
                          className="w-full px-4 py-3 bg-surface rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 pr-10"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">ft</span>
                      </div>
                      <div className="relative">
                        <input
                          type="number"
                          value={profile.heightIn}
                          onChange={e => updateProfile({ heightIn: parseInt(e.target.value) || 0 })}
                          className="w-full px-4 py-3 bg-surface rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 pr-10"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">in</span>
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Current Weight</label>
                    <div className="relative">
                      <input
                        type="number"
                        value={profile.weight}
                        onChange={e => updateProfile({ weight: parseInt(e.target.value) || 0 })}
                        className="w-full px-4 py-3 bg-surface rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 pr-12"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">lbs</span>
                    </div>
                  </div>
                </div>

                <div className="mt-auto pb-8">
                  <motion.button onClick={next} className="w-full bg-primary text-primary-foreground py-3.5 rounded-2xl font-display font-semibold flex items-center justify-center gap-2" whileTap={{ scale: 0.97 }}>
                    Continue <ArrowRight className="w-4 h-4" />
                  </motion.button>
                </div>
              </div>
            )}

            {step === "activity" && (
              <div className="flex-1 flex flex-col pt-8">
                <div className="flex items-center gap-2 mb-1">
                  <Activity className="w-5 h-5 text-primary" />
                  <h2 className="text-xl font-display font-bold text-foreground">Activity Level</h2>
                </div>
                <p className="text-sm text-muted-foreground mb-6">How active are you on a typical week?</p>

                <div className="space-y-2">
                  {([
                    { value: "sedentary", label: "Sedentary", desc: "Little to no exercise" },
                    { value: "light", label: "Lightly Active", desc: "Light exercise 1-3 days/week" },
                    { value: "moderate", label: "Moderately Active", desc: "Moderate exercise 3-5 days/week" },
                    { value: "active", label: "Active", desc: "Hard exercise 6-7 days/week" },
                    { value: "very_active", label: "Very Active", desc: "Very hard exercise + physical job" },
                  ] as const).map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => updateProfile({ activityLevel: opt.value })}
                      className={`w-full text-left p-4 rounded-2xl border transition-all ${
                        profile.activityLevel === opt.value
                          ? "border-primary bg-primary/5"
                          : "border-border bg-card hover:bg-muted/50"
                      }`}
                    >
                      <p className={`text-sm font-medium ${profile.activityLevel === opt.value ? "text-primary" : "text-foreground"}`}>{opt.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                    </button>
                  ))}
                </div>

                <div className="mt-auto pb-8 pt-4">
                  <motion.button onClick={next} className="w-full bg-primary text-primary-foreground py-3.5 rounded-2xl font-display font-semibold flex items-center justify-center gap-2" whileTap={{ scale: 0.97 }}>
                    Continue <ArrowRight className="w-4 h-4" />
                  </motion.button>
                </div>
              </div>
            )}

            {step === "goal" && (
              <div className="flex-1 flex flex-col pt-8">
                <div className="flex items-center gap-2 mb-1">
                  <Target className="w-5 h-5 text-primary" />
                  <h2 className="text-xl font-display font-bold text-foreground">Your Goal</h2>
                </div>
                <p className="text-sm text-muted-foreground mb-6">We'll adjust your macros to match</p>

                <div className="space-y-2 mb-6">
                  {([
                    { value: "lose", label: "Lose Weight", emoji: "📉" },
                    { value: "maintain", label: "Maintain Weight", emoji: "⚖️" },
                    { value: "gain", label: "Build Muscle", emoji: "💪" },
                  ] as const).map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => updateProfile({ goal: opt.value })}
                      className={`w-full text-left p-4 rounded-2xl border transition-all flex items-center gap-3 ${
                        profile.goal === opt.value
                          ? "border-primary bg-primary/5"
                          : "border-border bg-card hover:bg-muted/50"
                      }`}
                    >
                      <span className="text-2xl">{opt.emoji}</span>
                      <p className={`text-sm font-medium ${profile.goal === opt.value ? "text-primary" : "text-foreground"}`}>{opt.label}</p>
                    </button>
                  ))}
                </div>

                {profile.goal !== "maintain" && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-2 block">
                      Rate: {profile.rate} lb/week
                    </label>
                    <div className="flex gap-2">
                      {[0.5, 1, 1.5, 2].map(r => (
                        <button
                          key={r}
                          onClick={() => updateProfile({ rate: r })}
                          className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                            profile.rate === r ? "bg-primary text-primary-foreground" : "bg-surface text-muted-foreground"
                          }`}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      {profile.goal === "lose" ? "0.5-1 lb/week is recommended for sustainable loss" : "0.5-1 lb/week is ideal for lean gains"}
                    </p>
                  </div>
                )}

                <div className="mt-auto pb-8 pt-4">
                  <motion.button onClick={next} className="w-full bg-primary text-primary-foreground py-3.5 rounded-2xl font-display font-semibold flex items-center justify-center gap-2" whileTap={{ scale: 0.97 }}>
                    See My Plan <ArrowRight className="w-4 h-4" />
                  </motion.button>
                </div>
              </div>
            )}

            {step === "results" && (() => {
              const m = calcPreview();
              return (
                <div className="flex-1 flex flex-col pt-8 items-center text-center">
                  <motion.div
                    className="w-16 h-16 rounded-2xl bg-success/10 flex items-center justify-center mb-4"
                    initial={{ scale: 0, rotate: -20 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: "spring", delay: 0.1 }}
                  >
                    <Scale className="w-8 h-8 text-success" />
                  </motion.div>
                  <h2 className="text-xl font-display font-bold text-foreground mb-1">Your Plan is Ready</h2>
                  <p className="text-sm text-muted-foreground mb-6">Here are your personalized daily targets</p>

                  <motion.div
                    className="w-full bg-card rounded-2xl p-6 border border-border mb-4"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                  >
                    <p className="text-5xl font-display font-bold text-foreground">{m.calories}</p>
                    <p className="text-sm text-muted-foreground mt-1">calories per day</p>

                    <div className="grid grid-cols-3 gap-3 mt-5">
                      <div className="bg-surface rounded-xl p-3">
                        <p className="text-xs font-medium text-protein">Protein</p>
                        <p className="text-xl font-display font-bold text-foreground mt-1">{m.protein}g</p>
                      </div>
                      <div className="bg-surface rounded-xl p-3">
                        <p className="text-xs font-medium text-carbs">Carbs</p>
                        <p className="text-xl font-display font-bold text-foreground mt-1">{m.carbs}g</p>
                      </div>
                      <div className="bg-surface rounded-xl p-3">
                        <p className="text-xs font-medium text-fats">Fats</p>
                        <p className="text-xl font-display font-bold text-foreground mt-1">{m.fats}g</p>
                      </div>
                    </div>
                  </motion.div>

                  <p className="text-xs text-muted-foreground mb-6 max-w-xs">
                    These targets adapt weekly based on your progress and adherence
                  </p>

                  <div className="mt-auto pb-8 w-full">
                    <motion.button
                      onClick={finish}
                      className="w-full bg-primary text-primary-foreground py-3.5 rounded-2xl font-display font-semibold flex items-center justify-center gap-2"
                      whileTap={{ scale: 0.97 }}
                    >
                      Start Tracking <Zap className="w-4 h-4" />
                    </motion.button>
                  </div>
                </div>
              );
            })()}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};
