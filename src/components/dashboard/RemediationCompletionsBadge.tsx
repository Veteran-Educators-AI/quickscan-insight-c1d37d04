import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Gamepad2, ChevronRight, Trophy, Star, Check, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useRemediationCompletions } from '@/hooks/useRemediationCompletions';
import { formatDistanceToNow } from 'date-fns';
import { useStudentNames } from '@/lib/StudentNameContext';

export function RemediationCompletionsBadge() {
  const { count, completions, markAsViewed } = useRemediationCompletions();
  const [showDetails, setShowDetails] = useState(false);
  const { getDisplayName } = useStudentNames();

  if (count === 0) return null;

  const handleMarkAllViewed = async () => {
    await markAsViewed();
    setShowDetails(false);
  };

  const getStudentName = (completion: typeof completions[0]) => {
    if (completion.student) {
      if (!completion.student_id) return 'Student';
      return getDisplayName(
        completion.student_id,
        completion.student.first_name,
        completion.student.last_name,
      );
    }
    if (completion.data?.student_name) {
      return completion.data.student_name;
    }
    return 'Unknown Student';
  };

  return (
    <>
      <Card 
        className="border-emerald-300 dark:border-emerald-700 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 hover:shadow-md transition-all cursor-pointer"
        onClick={() => setShowDetails(true)}
      >
        <CardContent className="p-3 flex items-center gap-3">
          <div className="relative">
            <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/50">
              <Gamepad2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white text-[10px] font-bold animate-pulse">
              {count > 9 ? '9+' : count}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-foreground text-sm">
              {count} remediation {count === 1 ? 'completion' : 'completions'}
            </p>
            <p className="text-muted-foreground text-xs">from NYCLogic Scholar</p>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        </CardContent>
      </Card>

      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gamepad2 className="h-5 w-5 text-emerald-600" />
              Student Remediation Completions
            </DialogTitle>
            <DialogDescription>
              Students completed practice on NYCLogic Scholar
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[400px] pr-4">
            <div className="space-y-3">
              {completions.map((completion) => (
                <div 
                  key={completion.id}
                  className="p-3 rounded-lg border bg-card hover:bg-accent/5 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">
                        {getStudentName(completion)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {completion.data?.activity_name || completion.data?.topic_name || 'Remediation Practice'}
                      </p>
                    </div>
                    {completion.data?.score !== undefined && (
                      <div className="flex items-center gap-1 text-xs font-medium">
                        <Star className="h-3.5 w-3.5 text-amber-500" />
                        {completion.data.score}%
                      </div>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                    {completion.data?.xp_earned && (
                      <span className="flex items-center gap-1">
                        <Trophy className="h-3 w-3 text-purple-500" />
                        +{completion.data.xp_earned} XP
                      </span>
                    )}
                    {completion.data?.coins_earned && (
                      <span className="flex items-center gap-1">
                        🪙 +{completion.data.coins_earned}
                      </span>
                    )}
                    <span className="ml-auto">
                      {formatDistanceToNow(new Date(completion.created_at), { addSuffix: true })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>

          <div className="flex items-center justify-between pt-2 border-t">
            <Button variant="ghost" size="sm" onClick={() => setShowDetails(false)}>
              <X className="h-4 w-4 mr-1" />
              Close
            </Button>
            <Button size="sm" onClick={handleMarkAllViewed}>
              <Check className="h-4 w-4 mr-1" />
              Mark All as Viewed
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
