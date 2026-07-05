import React, { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { User } from "@/entities/User";
import { LayoutDashboard, FilePlus2, History, Settings as SettingsIcon, LayoutGrid } from "lucide-react";

const navigationItems = [
  { title: "Dashboard", url: createPageUrl("Dashboard"), icon: LayoutDashboard },
  { title: "New Job", url: createPageUrl("Dashboard") + "?new=true", icon: FilePlus2 },
  { title: "Job History", url: createPageUrl("Projects"), icon: History },
  { title: "Harvester", url: createPageUrl("Harvester"), icon: LayoutGrid },
  { title: "Settings", url: createPageUrl("Settings"), icon: SettingsIcon },
];

export default function Sidebar() {
  const location = useLocation();
  const [user, setUser] = useState(null);

  useEffect(() => {
    setUser(User.me());
  }, []);

  const isOnDashboard = location.pathname === "/" || location.pathname === "/Dashboard";
  const isNewJob = location.search.includes("new=true");

  return (
    <div className="fixed inset-y-0 left-0 z-40 w-64 bg-tfrs-surface border-r border-tfrs-border flex flex-col">
      {/* Wordmark */}
      <div className="h-16 flex items-center px-6 border-b border-tfrs-border">
        <span className="font-mono text-xl font-bold tracking-widest text-tfrs-gold">BLAIR</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4">
        {navigationItems.map((item) => {
          let active = false;
          if (item.title === "Dashboard") active = isOnDashboard && !isNewJob;
          else if (item.title === "New Job") active = isOnDashboard && isNewJob;
          else if (item.title === "Job History") active = location.pathname === "/Projects";
          else if (item.title === "Harvester") active = location.pathname === "/Harvester";
          else if (item.title === "Settings") active = location.pathname === "/Settings";
          return (
            <Link
              key={item.title}
              to={item.url}
              className={`flex items-center gap-3 px-6 py-3 text-sm font-mono uppercase tracking-wide border-l-4 transition-colors ${
                active
                  ? "border-tfrs-red bg-black/20 text-tfrs-text"
                  : "border-transparent text-tfrs-muted hover:text-tfrs-text hover:bg-black/10"
              }`}
            >
              <item.icon className="w-4 h-4" />
              {item.title}
            </Link>
          );
        })}
      </nav>

      {/* User footer */}
      <div className="border-t border-tfrs-border p-4">
        {user ? (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 flex items-center justify-center bg-tfrs-red text-tfrs-text font-mono font-bold text-sm">
              {(user.full_name || user.email || "U").charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-mono text-tfrs-text truncate">{user.full_name || "User"}</p>
              <p className="text-xs text-tfrs-muted truncate">{user.email}</p>
            </div>
          </div>
        ) : (
          <button
            onClick={() => User.login()}
            className="w-full text-xs font-mono uppercase text-tfrs-text bg-tfrs-red py-2 hover:opacity-90"
          >
            Sign In
          </button>
        )}
      </div>
    </div>
  );
}
