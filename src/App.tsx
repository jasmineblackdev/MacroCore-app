import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { ProfileProvider, useProfile } from "@/context/ProfileContext";
import Index from "./pages/Index";
import Progress from "./pages/Progress";
import Goals from "./pages/Goals";
import MealPlan from "./pages/MealPlan";
import SettingsPage from "./pages/SettingsPage";
import NotFound from "./pages/NotFound";
import { BottomNav } from "./components/BottomNav";
import { Onboarding } from "./components/Onboarding";

const queryClient = new QueryClient();

function AppContent() {
  const { profile } = useProfile();

  if (!profile.onboarded) {
    return <Onboarding />;
  }

  return (
    <div className="max-w-lg mx-auto relative">
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/meals" element={<MealPlan />} />
        <Route path="/progress" element={<Progress />} />
        <Route path="/goals" element={<Goals />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      <BottomNav />
    </div>
  );
}

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <ProfileProvider>
          <BrowserRouter>
            <AppContent />
          </BrowserRouter>
        </ProfileProvider>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
