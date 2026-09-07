import { Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useStudentNames } from '@/lib/StudentNameContext';

/**
 * Small teacher-facing status control for the FERPA pseudonym layer.
 * Display-only: it flips the shared reveal state and surfaces the auto-revert countdown.
 */
export function NameVisibilityControl({ compact = false }: { compact?: boolean }) {
  const { revealRealNames, toggleRevealNames, remainingSeconds } = useStudentNames();

  const countdown =
    revealRealNames && remainingSeconds != null
      ? `${Math.floor(remainingSeconds / 60)}:${String(remainingSeconds % 60).padStart(2, '0')}`
      : null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant={revealRealNames ? 'destructive' : 'secondary'} className="gap-1">
        {revealRealNames ? <Eye className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}
        {revealRealNames ? 'Real names visible' : 'Names hidden — pseudonyms'}
      </Badge>
      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={toggleRevealNames}>
        {revealRealNames ? <EyeOff className="h-3.5 w-3.5 mr-1" /> : <Eye className="h-3.5 w-3.5 mr-1" />}
        {revealRealNames ? 'Hide names' : 'Show real names'}
      </Button>
      {countdown && !compact ? (
        <span className="text-xs text-muted-foreground">Hides again in {countdown}</span>
      ) : null}
      {countdown && compact ? <span className="text-xs text-muted-foreground">{countdown}</span> : null}
    </div>
  );
}

/** Filename-safe slug for a display name (pseudonym or real, whichever is showing). */
export function displayNameSlug(displayName: string): string {
  return (
    displayName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'student'
  );
}

/** Escape a string for safe interpolation into printed popup HTML. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
