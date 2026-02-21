import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";

interface CalorieRingProps {
  current: number;
  target: number;
  protein: { current: number; target: number };
  carbs: { current: number; target: number };
  fats: { current: number; target: number };
}

export const CalorieRing = ({ current, target, protein, carbs, fats }: CalorieRingProps) => {
  const [expanded, setExpanded] = useState(false);
  const percentage = Math.min((current / target) * 100, 100);
  const circumference = 2 * Math.PI * 45;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;
  const remaining = target - current;

  return (
    <motion.div
      className="flex flex-col items-center"
      layout
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex flex-col items-center focus:outline-none"
      >
        <div className="relative w-52 h-52">
          {/* Background ring */}
          <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
            <circle
              cx="50" cy="50" r="45"
              fill="none"
              stroke="hsl(var(--border))"
              strokeWidth="6"
            />
            <motion.circle
              cx="50" cy="50" r="45"
              fill="none"
              stroke="hsl(var(--primary))"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={circumference}
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset }}
              transition={{ duration: 1.2, ease: "easeOut" }}
              className="drop-shadow-[0_0_8px_hsl(var(--primary)/0.5)]"
            />
          </svg>
          {/* Center text */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <motion.span
              className="text-4xl font-display font-bold text-foreground"
              key={current}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              {current.toLocaleString()}
            </motion.span>
            <span className="text-sm text-muted-foreground mt-0.5">
              of {target.toLocaleString()} cal
            </span>
          </div>
        </div>

        {/* Remaining label */}
        <div className="mt-3 flex items-center gap-1.5 text-muted-foreground">
          <span className="text-sm font-medium">
            {remaining > 0 ? `${remaining} cal remaining` : "Goal reached! 🎉"}
          </span>
          <motion.div
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronDown className="w-4 h-4" />
          </motion.div>
        </div>
      </button>

      {/* Expanded macro breakdown */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="w-full overflow-hidden mt-4"
          >
            <div className="grid grid-cols-3 gap-3">
              <MacroCard label="Protein" current={protein.current} target={protein.target} color="protein" unit="g" />
              <MacroCard label="Carbs" current={carbs.current} target={carbs.target} color="carbs" unit="g" />
              <MacroCard label="Fats" current={fats.current} target={fats.target} color="fats" unit="g" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

function MacroCard({ label, current, target, color, unit }: {
  label: string;
  current: number;
  target: number;
  color: "protein" | "carbs" | "fats";
  unit: string;
}) {
  const pct = Math.min((current / target) * 100, 100);

  return (
    <div className="bg-surface rounded-xl p-3 text-center">
      <span className={`text-xs font-medium text-${color}`}>{label}</span>
      <p className="text-lg font-display font-bold text-foreground mt-1">
        {current}<span className="text-xs text-muted-foreground font-normal">/{target}{unit}</span>
      </p>
      <div className="w-full h-1.5 bg-border rounded-full mt-2 overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${color === "protein" ? "macro-gradient-protein" : color === "carbs" ? "macro-gradient-carbs" : "macro-gradient-fats"}`}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
        />
      </div>
    </div>
  );
}
