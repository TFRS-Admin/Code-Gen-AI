import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { User } from "@/entities/User";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Lock, GitBranch, LayoutGrid, MonitorPlay, Files, Settings as SettingsIcon, LogOut, Menu } from "lucide-react";

const TABS = [
  { key: "preview", label: "Preview", icon: MonitorPlay },
  { key: "dashboard", label: "Dashboard", icon: LayoutGrid },
  { key: "files", label: "Files", icon: Files },
];

// Top bar of the Blair Dashboard: repo/branch context on the left, the
// Preview | Dashboard | Files view switcher in the center (mirrors
// RightPanel's own tabs and drives which pane is visible on narrow
// viewports), and the account menu on the right.
export default function TopNav({ repo, branch, activeTab, onTabChange, onOpenMenu, showMenuButton = false }) {
  const user = User.me();

  return (
    <header className="h-14 flex items-center justify-between gap-4 px-4 border-b border-blair-border bg-blair-bg shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        {showMenuButton && (
          <button
            type="button"
            aria-label="Open menu"
            onClick={onOpenMenu}
            className="text-blair-muted hover:text-blair-primary shrink-0 -ml-1 p-1"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}
        {repo ? (
          <>
            {repo.private && <Lock className="w-3.5 h-3.5 text-blair-muted shrink-0" />}
            <span className="text-sm font-semibold text-blair-text truncate">{repo.full_name}</span>
            {branch && (
              <span className="flex items-center gap-1 text-xs text-blair-muted bg-blair-sidebar rounded-full px-2 py-0.5 shrink-0">
                <GitBranch className="w-3 h-3" />
                {branch}
              </span>
            )}
          </>
        ) : (
          <span className="text-sm text-blair-muted">No repository selected</span>
        )}
      </div>

      <nav className="flex items-center gap-1 bg-blair-sidebar rounded-full p-1 shrink-0">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            aria-label={label}
            onClick={() => onTabChange(key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              activeTab === key ? "bg-blair-primary text-white" : "text-blair-muted hover:text-blair-text"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </nav>

      <div className="shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label="User menu" className="block">
              <Avatar className="w-8 h-8">
                <AvatarFallback className="bg-blair-primary text-white text-xs font-bold">
                  {(user?.full_name || user?.email || "U").charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <div className="px-2 py-1.5 text-xs text-muted-foreground truncate">{user?.email || "Not signed in"}</div>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to={createPageUrl("Settings")} className="flex items-center gap-2 cursor-pointer">
                <SettingsIcon className="w-4 h-4" />
                Settings
              </Link>
            </DropdownMenuItem>
            {user && (
              <DropdownMenuItem onClick={() => User.logout()} className="flex items-center gap-2 cursor-pointer">
                <LogOut className="w-4 h-4" />
                Logout
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
