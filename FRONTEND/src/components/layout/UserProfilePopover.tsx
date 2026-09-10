import { useState, useRef, useEffect } from 'react';
import { useAuth, initialsOf } from '../../features/auth/useAuth';
import { useThemeStore } from '../../store/themeStore';
import { LogOut, User, Moon, Sun, Monitor, Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function UserProfilePopover() {
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const { user, roleId, canManageUsersAndRoles, displayName, logout } = useAuth();
  const { theme, setTheme } = useThemeStore();
  const navigate = useNavigate();

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!user) return null;

  const handleLogout = async () => {
    // Revokes the shared session server-side, so it also ends in
    // SIGInstallations and SIGInventory.
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="relative" ref={popoverRef}>
      <button 
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="User profile and theme settings"
        aria-expanded={isOpen}
        aria-haspopup="true"
        className="w-10 h-10 rounded-full bg-surface-container-high border border-border/50 flex items-center justify-center text-on-surface font-bold hover:border-primary/50 transition-all"
      >
        {initialsOf(displayName)}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-12 w-64 bg-surface-container-lowest/95 backdrop-blur-2xl border border-border/50 rounded-2xl shadow-xl shadow-black/10 dark:shadow-black/50 overflow-hidden z-50 animate-in slide-in-from-top-2">
          {/* Header */}
          <div className="px-5 py-4 border-b border-border/40 bg-surface-container-low/50">
            <p className="text-sm font-bold text-on-surface truncate">{displayName}</p>
            <p className="text-xs text-on-surface-variant truncate mt-0.5">{user.email}</p>
            {/* SIG-DESK's own role is singular (TODO-088) and GET /me only
                reports its id, not a display name — resolving that name
                needs a separate call this popover doesn't make, so this
                shows the real, known fact instead: whether a role is
                assigned at all, and whether it grants admin capability. */}
            <div className="mt-2 flex flex-wrap gap-1">
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-primary/10 text-primary border border-primary/20">
                {roleId ? (canManageUsersAndRoles ? 'Administrator' : 'Role assigned') : 'No role assigned'}
              </span>
            </div>
          </div>

          <div className="p-2 space-y-1">
            <button type="button" className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-on-surface/5 text-sm text-on-surface-variant transition-colors">
              <User className="w-4 h-4 text-on-surface-variant" />
              My Profile
            </button>
            <button type="button" className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-on-surface/5 text-sm text-on-surface-variant transition-colors">
              <Settings className="w-4 h-4 text-on-surface-variant" />
              Preferences
            </button>
          </div>

          <div className="px-5 py-3 border-t border-border/40">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary mb-3">Theme</p>
            <div className="flex bg-surface-container rounded-lg p-1 border border-border/50" role="group" aria-label="Theme preference">
              <button 
                type="button"
                onClick={() => setTheme('light')}
                aria-label="Switch to Light theme"
                title="Light theme"
                aria-pressed={theme === 'light'}
                className={`flex-1 flex items-center justify-center py-1.5 rounded-md transition-all ${theme === 'light' ? 'bg-surface shadow text-primary font-bold' : 'text-on-surface-variant hover:text-on-surface'}`}
              >
                <Sun className="w-4 h-4" />
              </button>
              <button 
                type="button"
                onClick={() => setTheme('dark')}
                aria-label="Switch to Dark theme"
                title="Dark theme"
                aria-pressed={theme === 'dark'}
                className={`flex-1 flex items-center justify-center py-1.5 rounded-md transition-all ${theme === 'dark' ? 'bg-surface shadow text-primary font-bold' : 'text-on-surface-variant hover:text-on-surface'}`}
              >
                <Moon className="w-4 h-4" />
              </button>
              <button 
                type="button"
                onClick={() => setTheme('system')}
                aria-label="Switch to System theme"
                title="System theme"
                aria-pressed={theme === 'system'}
                className={`flex-1 flex items-center justify-center py-1.5 rounded-md transition-all ${theme === 'system' ? 'bg-surface shadow text-primary font-bold' : 'text-on-surface-variant hover:text-on-surface'}`}
              >
                <Monitor className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="p-2 border-t border-border/40 bg-gradient-to-b from-transparent to-red-500/5">
            <button 
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-red-500/10 text-sm text-on-surface-variant hover:text-red-400 transition-colors group"
            >
              <LogOut className="w-4 h-4 text-on-surface-variant group-hover:text-red-400 transition-colors" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
