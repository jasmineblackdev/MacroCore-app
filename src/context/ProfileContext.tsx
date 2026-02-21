import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export interface UserProfile {
  name: string;
  age: number;
  sex: "male" | "female";
  heightFt: number;
  heightIn: number;
  weight: number;
  activityLevel: "sedentary" | "light" | "moderate" | "active" | "very_active";
  goal: "lose" | "maintain" | "gain";
  rate: number; // lbs per week
  units: "imperial" | "metric";
  reminderEnabled: boolean;
  reminderTime: string;
  onboarded: boolean;
  // Computed targets
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
}

const DEFAULT_PROFILE: UserProfile = {
  name: "",
  age: 30,
  sex: "male",
  heightFt: 5,
  heightIn: 10,
  weight: 180,
  activityLevel: "moderate",
  goal: "lose",
  rate: 1,
  units: "imperial",
  reminderEnabled: true,
  reminderTime: "12:00",
  onboarded: false,
  calories: 2200,
  protein: 165,
  carbs: 220,
  fats: 73,
};

function calculateMacros(profile: Partial<UserProfile>): Pick<UserProfile, "calories" | "protein" | "carbs" | "fats"> {
  const { age = 30, sex = "male", heightFt = 5, heightIn = 10, weight = 180, activityLevel = "moderate", goal = "lose", rate = 1 } = profile;
  const heightCm = (heightFt * 12 + heightIn) * 2.54;
  const weightKg = weight * 0.453592;

  // Mifflin-St Jeor
  let bmr: number;
  if (sex === "male") {
    bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + 5;
  } else {
    bmr = 10 * weightKg + 6.25 * heightCm - 5 * age - 161;
  }

  const multipliers = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9 };
  let tdee = bmr * multipliers[activityLevel];

  if (goal === "lose") tdee -= rate * 500;
  else if (goal === "gain") tdee += rate * 250;

  const calories = Math.round(Math.max(tdee, 1200));
  const protein = Math.round(weightKg * 2.0); // 2g/kg
  const fats = Math.round((calories * 0.25) / 9);
  const carbs = Math.round((calories - protein * 4 - fats * 9) / 4);

  return { calories, protein: Math.max(protein, 50), carbs: Math.max(carbs, 50), fats: Math.max(fats, 30) };
}

interface ProfileContextType {
  profile: UserProfile;
  updateProfile: (updates: Partial<UserProfile>) => void;
  recalculate: () => void;
  completeOnboarding: () => void;
}

const ProfileContext = createContext<ProfileContextType | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<UserProfile>(() => {
    const saved = localStorage.getItem("macrocore_profile");
    if (saved) {
      try { return { ...DEFAULT_PROFILE, ...JSON.parse(saved) }; } catch { /* ignore */ }
    }
    return DEFAULT_PROFILE;
  });

  useEffect(() => {
    localStorage.setItem("macrocore_profile", JSON.stringify(profile));
  }, [profile]);

  const updateProfile = (updates: Partial<UserProfile>) => {
    setProfile(prev => ({ ...prev, ...updates }));
  };

  const recalculate = () => {
    setProfile(prev => {
      const macros = calculateMacros(prev);
      return { ...prev, ...macros };
    });
  };

  const completeOnboarding = () => {
    setProfile(prev => {
      const macros = calculateMacros(prev);
      return { ...prev, ...macros, onboarded: true };
    });
  };

  return (
    <ProfileContext.Provider value={{ profile, updateProfile, recalculate, completeOnboarding }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile must be used within ProfileProvider");
  return ctx;
}
