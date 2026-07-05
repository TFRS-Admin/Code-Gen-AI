import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { User } from "@/entities/User";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Home,
  FilePlus2,
  History,
  Settings as SettingsIcon,
  ChevronsLeft,
  ChevronsRight,
  Star,
  Clock,
  FolderGit2,
  Lock,
  ChevronsUpDown,
  LogIn,
} from "lucide-react";

const NAV_ITEMS = [
  { key: "home", title: "Home", url: createPageUrl("Dashboard"), icon: Home },
  { key: "new-job", title: "New Job", url: createPageUrl("Dashboard") + "?new=true", icon: FilePlus2 },
  { key: "history", title: "Job History", url: createPageUrl("Projects"), icon: History },
  { key: "settings", title: "Settings", url: createPageUrl("Settings"), icon: SettingsIcon },
];

const EXPANDED_WIDTH_DEFAULT = 280;
const COLLAPSED_WIDTH = 60;
const MIN_WIDTH = 220;
const MAX_WIDTH = 420;

const FAVORITES_KEY = "blair_favorite_repos";
const RECENTS_KEY = "blair_recent_repos";
const RECENTS_LIMIT = 8;

function readList(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeList(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // localStorage may be unavailable (private browsing, quota) — non-fatal.
  }
}

function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

// Blair's Base44-pattern left rail: branding, primary nav, a searchable repo
// picker, starred/recent repos, and the user's account footer. Owns its own
// collapse/width state (persisted) since neither affects Dashboard's layout —
// it's a flex child with an explicit pixel width, so the chat/preview columns
// simply fill whatever space remains.
export default function Sidebar({
  repos = [],
  reposLoading = false,
  selectedRepo,
  onSelectRepo,
  tier = "desktop",
  forceExpanded = false,
}) {
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("blair_sidebar_collapsed") === "true");
  const [width, setWidth] = useState(() => Number(localStorage.getItem("blair_sidebar_width")) || EXPANDED_WIDTH_DEFAULT);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [favorites, setFavorites] = useState(() => readList(FAVORITES_KEY));
  const [recents, setRecents] = useState(() => readList(RECENTS_KEY));

  useEffect(() => {
    setUser(User.me());
  }, []);

  // Tablet viewports default to the collapsed icon rail to leave room for the
  // stacked chat + right panel; the user can still expand it back manually.
  useEffect(() => {
    if (tier === "tablet") setCollapsed(true);
  }, [tier]);

  useEffect(() => {
    localStorage.setItem("blair_sidebar_collapsed", String(collapsed));
  }, [collapsed]);

  useEffect(() => {
    localStorage.setItem("blair_sidebar_width", String(width));
  }, [width]);

  // Track the selected repo as a recent, most-recent first, capped and deduped.
  useEffect(() => {
    if (!selectedRepo) return;
    setRecents((prev) => {
      const next = [
        { ...selectedRepo, lastAccessed: new Date().toISOString() },
        ...prev.filter((r) => r.full_name !== selectedRepo.full_name),
      ].slice(0, RECENTS_LIMIT);
      writeList(RECENTS_KEY, next);
      return next;
    });
  }, [selectedRepo]);

  const toggleFavorite = (repo) => {
    setFavorites((prev) => {
      const isFav = prev.some((r) => r.full_name === repo.full_name);
      const next = isFav ? prev.filter((r) => r.full_name !== repo.full_name) : [...prev, repo];
      writeList(FAVORITES_KEY, next);
      return next;
    });
  };

  const isFavorite = (fullName) => favorites.some((r) => r.full_name === fullName);

  const isOnDashboard = location.pathname === "/" || location.pathname === "/Dashboard";
  const isNewJob = location.search.includes("new=true");
  const activeNavKey = useMemo(() => {
    if (isOnDashboard && isNewJob) return "new-job";
    if (isOnDashboard) return "home";
    if (location.pathname === "/Projects") return "history";
    if (location.pathname === "/Settings") return "settings";
    return null;
  }, [isOnDashboard, isNewJob, location.pathname]);

  const startResize = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;
    const onMove = (moveEvent) => {
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + (moveEvent.clientX - startX)));
      setWidth(next);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const isCollapsed = collapsed && !forceExpanded;
  const effectiveWidth = isCollapsed ? COLLAPSED_WIDTH : width;

  const handleSelectRepo = (repo) => {
    onSelectRepo?.(repo);
    setPickerOpen(false);
  };

  return (
    <TooltipProvider delayDuration={200}>
      <aside
        data-testid="blair-sidebar"
        style={{ width: effectiveWidth }}
        className="blair-sidebar-transition relative flex flex-col h-full bg-blair-sidebar border-r border-blair-border shrink-0 overflow-hidden"
      >
        {/* Branding */}
        <div className="h-14 flex items-center justify-between px-4 border-b border-blair-border shrink-0">
          {!isCollapsed ? (
            <>
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-blair-primary text-white flex items-center justify-center font-bold text-sm shrink-0">
                  B
                </div>
                <span className="font-bold text-blair-text text-lg truncate">Blair</span>
              </div>
              {!forceExpanded && (
                <button
                  type="button"
                  aria-label="Collapse sidebar"
                  onClick={() => setCollapsed(true)}
                  className="text-blair-muted hover:text-blair-primary transition-colors shrink-0"
                >
                  <ChevronsLeft className="w-4 h-4" />
                </button>
              )}
            </>
          ) : (
            <button
              type="button"
              aria-label="Expand sidebar"
              onClick={() => setCollapsed(false)}
              className="w-7 h-7 rounded-lg bg-blair-primary text-white flex items-center justify-center font-bold text-sm mx-auto hover:opacity-90"
            >
              <ChevronsRight className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Primary nav */}
        <nav className="px-2 py-3 space-y-1 shrink-0">
          {NAV_ITEMS.map((item) => {
            const active = activeNavKey === item.key;
            const link = (
              <Link
                key={item.key}
                to={item.url}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isCollapsed ? "justify-center px-0" : ""
                } ${
                  active
                    ? "bg-blair-primary-soft text-blair-primary"
                    : "text-blair-muted hover:text-blair-text hover:bg-black/5"
                }`}
              >
                <item.icon className="w-4 h-4 shrink-0" />
                {!isCollapsed && <span className="truncate">{item.title}</span>}
              </Link>
            );
            if (!isCollapsed) return link;
            return (
              <Tooltip key={item.key}>
                <TooltipTrigger asChild>{link}</TooltipTrigger>
                <TooltipContent side="right">{item.title}</TooltipContent>
              </Tooltip>
            );
          })}
        </nav>

        {/* Repo picker + Favorites + Recents */}
        <div className="flex-1 overflow-y-auto blair-scrollbar-thin px-2 space-y-4 min-h-0">
          <div className={isCollapsed ? "flex justify-center" : ""}>
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                {isCollapsed ? (
                  <button
                    type="button"
                    aria-label="Select repository"
                    className="w-9 h-9 flex items-center justify-center rounded-lg text-blair-muted hover:text-blair-primary hover:bg-black/5"
                  >
                    <FolderGit2 className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="w-full flex items-center justify-between gap-2 rounded-lg border border-blair-border bg-white px-3 py-2 text-sm text-blair-text hover:border-blair-primary transition-colors"
                  >
                    <span className="flex items-center gap-2 truncate">
                      <FolderGit2 className="w-4 h-4 text-blair-muted shrink-0" />
                      <span className="truncate">
                        {selectedRepo ? selectedRepo.full_name : reposLoading ? "Loading repos..." : "Select repository..."}
                      </span>
                    </span>
                    <ChevronsUpDown className="w-3.5 h-3.5 text-blair-muted shrink-0" />
                  </button>
                )}
              </PopoverTrigger>
              <PopoverContent align="start" className="w-72 p-0">
                <Command>
                  <CommandInput placeholder="Search repositories..." />
                  <CommandList>
                    <CommandEmpty className="py-4 text-center text-sm text-blair-muted">
                      {reposLoading ? "Loading..." : "No repositories found."}
                    </CommandEmpty>
                    <CommandGroup>
                      {repos.map((repo) => (
                        <CommandItem
                          key={repo.full_name}
                          value={repo.full_name}
                          onSelect={() => handleSelectRepo(repo)}
                          className="flex items-center justify-between gap-2"
                        >
                          <span className="flex items-center gap-2 truncate">
                            {repo.private && <Lock className="w-3 h-3 shrink-0" />}
                            <span className="truncate">{repo.full_name}</span>
                          </span>
                          <button
                            type="button"
                            aria-label={isFavorite(repo.full_name) ? "Unstar repository" : "Star repository"}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleFavorite(repo);
                            }}
                            className="shrink-0"
                          >
                            <Star
                              className={`w-3.5 h-3.5 ${
                                isFavorite(repo.full_name) ? "fill-blair-primary text-blair-primary" : "text-blair-muted"
                              }`}
                            />
                          </button>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {!isCollapsed && favorites.length > 0 && (
            <SidebarSection
              title="Favorites"
              icon={Star}
              items={favorites}
              selectedRepo={selectedRepo}
              onSelect={handleSelectRepo}
            />
          )}

          {!isCollapsed && (
            <SidebarSection
              title="Recents"
              icon={Clock}
              items={recents}
              selectedRepo={selectedRepo}
              onSelect={handleSelectRepo}
              showTimestamp
              emptyLabel="No recent repositories yet."
            />
          )}
        </div>

        {/* User profile footer */}
        <div className="border-t border-blair-border p-3 shrink-0">
          {user ? (
            <div className={`flex items-center gap-2 ${isCollapsed ? "justify-center" : ""}`}>
              <Avatar className="w-8 h-8">
                <AvatarFallback className="bg-blair-primary text-white text-xs font-bold">
                  {(user.full_name || user.email || "U").charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              {!isCollapsed && (
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-blair-text truncate">{user.full_name || "User"}</p>
                  <Link to={createPageUrl("Settings")} className="text-[11px] text-blair-muted hover:text-blair-primary truncate block">
                    {user.email}
                  </Link>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => User.login()}
              className={`w-full flex items-center justify-center gap-2 text-xs font-medium text-white bg-blair-primary rounded-lg py-2 hover:bg-blair-primary-hover transition-colors`}
            >
              <LogIn className="w-3.5 h-3.5" />
              {!isCollapsed && "Sign In"}
            </button>
          )}
        </div>

        {/* Drag-resize handle */}
        {!isCollapsed && !forceExpanded && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize sidebar"
            onMouseDown={startResize}
            className="absolute top-0 right-0 h-full w-1 cursor-col-resize hover:bg-blair-primary/40"
          />
        )}
      </aside>
    </TooltipProvider>
  );
}

function SidebarSection({ title, icon: Icon, items, selectedRepo, onSelect, showTimestamp = false, emptyLabel }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 px-2 mb-1 text-[11px] font-semibold uppercase tracking-wide text-blair-muted">
        <Icon className="w-3 h-3" />
        {title}
      </div>
      {items.length === 0 && emptyLabel ? (
        <p className="px-2 text-xs text-blair-muted">{emptyLabel}</p>
      ) : (
        <ul className="space-y-0.5">
          {items.map((repo) => (
            <li key={repo.full_name}>
              <button
                type="button"
                onClick={() => onSelect(repo)}
                className={`w-full flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-xs text-left transition-colors ${
                  selectedRepo?.full_name === repo.full_name
                    ? "bg-blair-primary-soft text-blair-primary"
                    : "text-blair-text hover:bg-black/5"
                }`}
              >
                <span className="truncate">{repo.full_name}</span>
                {showTimestamp && repo.lastAccessed && (
                  <span className="text-[10px] text-blair-muted shrink-0">{timeAgo(repo.lastAccessed)}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
