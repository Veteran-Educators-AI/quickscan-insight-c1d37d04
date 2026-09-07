import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Users, 
  BookOpen, 
  ClipboardList, 
  Camera, 
  BarChart3, 
  Settings, 
  Menu, 
  X,
  LogOut,
  Eye,
  EyeOff,
  FolderOpen
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuth } from '@/lib/auth';
import { useStudentNames } from '@/lib/StudentNameContext';
import { cn } from '@/lib/utils';
import nycologicHeadLogo from '@/assets/nycologic-head-logo.png';
import { ThemeToggle } from '@/components/ThemeToggle';
import { HelpBot } from '@/components/HelpBot';
import { useSchoolBranding } from '@/hooks/useSchoolBranding';
import { getPoweredByBranding } from '@/lib/schoolBranding';

interface AppLayoutProps {
  children: React.ReactNode;
}

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/classes', label: 'Classes', icon: Users },
  { href: '/questions', label: 'Assessment', icon: ClipboardList },
  { href: '/scan', label: 'Scan', icon: Camera },
  { href: '/library', label: 'Library', icon: FolderOpen },
  { href: '/reports', label: 'Reports', icon: BarChart3 },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function AppLayout({ children }: AppLayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, user } = useAuth();
  const { revealRealNames, toggleRevealNames, remainingSeconds } = useStudentNames();
  const { branding, isCustomBranding } = useSchoolBranding();
  const poweredBy = getPoweredByBranding();

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Top Navigation */}
      <header className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="container flex h-16 items-center justify-between">
          {/* Logo */}
          <Link to="/dashboard" className="flex items-center gap-2">
            {/* Logo stack: School logo in front, company logo as backdrop */}
            <div className="relative flex items-center justify-center">
              {isCustomBranding && (
                <img 
                  src={poweredBy.logo} 
                  alt="Nyclogic Ai" 
                  className="absolute h-12 w-auto opacity-15 -left-1 top-1/2 -translate-y-1/2"
                />
              )}
              <img 
                src={isCustomBranding ? branding.logo : nycologicHeadLogo} 
                alt={isCustomBranding ? branding.name : "NYClogic Ai"} 
                className="relative h-10 w-auto drop-shadow-[0_0_8px_rgba(139,92,246,0.3)] transition-transform duration-200 hover:scale-110 z-10"
              />
            </div>
            <span className="flex flex-col leading-tight">
              <span className="font-display text-lg font-semibold text-foreground" style={{ fontFamily: "'Darker Grotesque', sans-serif" }}>
                {branding.displayName} <span className="text-primary">{branding.aiSuffix}<sup className="text-[8px] align-super ml-0.5">™</sup></span>
              </span>
              <span className="hidden md:inline text-[10px] text-muted-foreground">
                Differentiation, built into every sheet.
              </span>
            </span>
            <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded border border-amber-500/30">
              Beta
            </span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.href || 
                (item.href !== '/dashboard' && location.pathname.startsWith(item.href));
              const tourId = item.href.replace('/', 'nav-');
              
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  data-tour={tourId}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                    isActive 
                      ? "bg-primary/10 text-primary" 
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden lg:inline">{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* User Menu */}
          <div className="flex items-center gap-3">
            {/* Admin Name Reveal Toggle */}
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary/50 border border-border">
                  {revealRealNames ? (
                    <Eye className="h-4 w-4 text-amber-500" />
                  ) : (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  )}
                  <Switch
                    checked={revealRealNames}
                    onCheckedChange={toggleRevealNames}
                    className="data-[state=checked]:bg-amber-500"
                  />
                  {revealRealNames && remainingSeconds !== null && (
                    <span className={cn(
                      "text-xs font-mono font-medium min-w-[36px]",
                      remainingSeconds <= 60 ? "text-destructive" : "text-amber-500"
                    )}>
                      {formatTime(remainingSeconds)}
                    </span>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p className="font-medium">{revealRealNames ? 'Real Names Visible' : 'FERPA Mode Active'}</p>
                <p className="text-xs text-muted-foreground">
                  {revealRealNames 
                    ? `Auto-reverts in ${formatTime(remainingSeconds || 0)} (resets on activity)` 
                    : 'Toggle to reveal real student names'}
                </p>
              </TooltipContent>
            </Tooltip>

            {/* Dark Mode Toggle */}
            <ThemeToggle />

            <Avatar className="h-8 w-8">
              <AvatarImage 
                src={user?.user_metadata?.avatar_url || user?.user_metadata?.picture} 
                alt={user?.user_metadata?.full_name || user?.email || 'User'} 
              />
              <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
                {(user?.user_metadata?.full_name || user?.email || 'U').charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="hidden text-sm text-muted-foreground sm:inline max-w-[150px] truncate">
              {user?.user_metadata?.full_name || user?.email}
            </span>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={handleSignOut}
              className="hidden md:flex"
            >
              <LogOut className="h-4 w-4" />
            </Button>

            {/* Mobile Menu Toggle */}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>
      </header>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div 
            className="fixed inset-0 bg-foreground/20 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          />
          <nav className="fixed right-0 top-16 bottom-0 w-64 bg-card border-l border-border p-4 animate-slide-up">
            <div className="flex flex-col gap-2">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.href || 
                  (item.href !== '/dashboard' && location.pathname.startsWith(item.href));
                
                return (
                  <Link
                    key={item.href}
                    to={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors",
                      isActive 
                        ? "bg-primary/10 text-primary" 
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    {item.label}
                  </Link>
                );
              })}
              <hr className="my-2 border-border" />
              {/* Mobile Name Reveal Toggle */}
              <div className="flex items-center justify-between px-4 py-3 rounded-lg bg-secondary/50">
                <div className="flex items-center gap-2">
                  {revealRealNames ? (
                    <Eye className="h-5 w-5 text-amber-500" />
                  ) : (
                    <EyeOff className="h-5 w-5 text-muted-foreground" />
                  )}
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">
                      {revealRealNames ? 'Real Names' : 'FERPA Mode'}
                    </span>
                    {revealRealNames && remainingSeconds !== null && (
                      <span className={cn(
                        "text-xs font-mono",
                        remainingSeconds <= 60 ? "text-destructive" : "text-amber-500"
                      )}>
                        Auto-reverts in {formatTime(remainingSeconds)}
                      </span>
                    )}
                  </div>
                </div>
                <Switch
                  checked={revealRealNames}
                  onCheckedChange={toggleRevealNames}
                  className="data-[state=checked]:bg-amber-500"
                />
              </div>
              <hr className="my-2 border-border" />
              <button
                onClick={handleSignOut}
                className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
              >
                <LogOut className="h-5 w-5" />
                Sign Out
              </button>
            </div>
          </nav>
        </div>
      )}

      {/* Main Content */}
      <main className="container py-6">
        {children}
      </main>

      {/* Help Bot */}
      <HelpBot />
    </div>
  );
}
