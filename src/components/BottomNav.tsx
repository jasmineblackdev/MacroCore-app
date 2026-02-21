import { NavLink as RouterNavLink, useLocation } from "react-router-dom";
import { Home, TrendingUp, Settings, Target, UtensilsCrossed } from "lucide-react";
import { motion } from "framer-motion";

const NAV_ITEMS = [
  { path: "/", label: "Today", icon: Home },
  { path: "/meals", label: "Meals", icon: UtensilsCrossed },
  { path: "/progress", label: "Progress", icon: TrendingUp },
  { path: "/goals", label: "Goals", icon: Target },
  { path: "/settings", label: "Settings", icon: Settings },
];

export const BottomNav = () => {
  const location = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-card/80 backdrop-blur-xl border-t border-border z-30">
      <div className="max-w-lg mx-auto flex items-center justify-around py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {NAV_ITEMS.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <RouterNavLink
              key={item.path}
              to={item.path}
              className="flex flex-col items-center gap-0.5 py-1 px-3 relative"
            >
              <div className="relative">
                {isActive && (
                  <motion.div
                    layoutId="nav-indicator"
                    className="absolute -inset-2 bg-primary/10 rounded-xl"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                <item.icon className={`w-5 h-5 relative z-10 transition-colors ${isActive ? "text-primary" : "text-muted-foreground"}`} />
              </div>
              <span className={`text-[10px] font-medium transition-colors ${isActive ? "text-primary" : "text-muted-foreground"}`}>
                {item.label}
              </span>
            </RouterNavLink>
          );
        })}
      </div>
    </nav>
  );
};
