import { useCallback } from 'react';
import { useSettings } from './useSettings';

interface GradeFloorSettings {
  gradeFloor: number;
  gradeFloorWithEffort: number;
}

const DEFAULT_SETTINGS: GradeFloorSettings = {
  gradeFloor: 0,
  gradeFloorWithEffort: 0,
};

/**
 * Grade Floor settings hook - now uses unified settings to avoid duplicate API calls
 * Previously made a separate API call to the settings table
 * Now shares the unified settings query with other hooks
 */
export function useGradeFloorSettings() {
  const { settings: unifiedSettings, isLoading } = useSettings();

  const settings: GradeFloorSettings = {
    gradeFloor: unifiedSettings.gradeFloor,
    gradeFloorWithEffort: unifiedSettings.gradeFloorWithEffort,
  };

  const calculateGrade = useCallback((
    percentage: number, 
    hasWork: boolean, 
    regentsScore?: number
  ): number => {
    const { gradeFloor, gradeFloorWithEffort } = settings;
    
    // CRITICAL: No work shown = 0% — do not use grade floor for blank submissions
    if (!hasWork) {
      return 0;
    }

    // Student showed work - grade is determined by the backend decision tree
    // The backend already applies the correct tier (0-97) based on boolean analysis
    // Frontend should NOT inflate grades beyond what the backend computed
    
    // Maximum grade from calculation is 100 (MASTERY tier achievable)
    const maxCalculatedGrade = 100;

    // If regents score is available, use it for conversion
    if (regentsScore !== undefined && regentsScore >= 0) {
      const regentsToGrade: Record<number, number> = {
        4: 95,  // EXEMPLARY — Correct + complete + organized
        3: 80,  // PROFICIENT_PLUS — Correct + organized but incomplete
        2: 65,  // APPROACHING — Valid approach, complete work, wrong answer
        1: 50,  // ANSWER_ONLY — Correct but no work shown
        0: 0,   // No understanding
      };
      const convertedGrade = regentsToGrade[regentsScore] ?? 0;
      return Math.min(maxCalculatedGrade, convertedGrade);
    }

    // Calculate from percentage - scale between 0 and max (95)
    if (percentage > 0) {
      const scaledGrade = Math.round((percentage / 100) * maxCalculatedGrade);
      return Math.min(maxCalculatedGrade, scaledGrade);
    }

    // Has work but no percentage calculated = 0 (let backend decide)
    return 0;
  }, [settings]);

  const refreshSettings = useCallback(() => {
    // No longer needed - React Query handles refetching
  }, []);

  return {
    ...settings,
    isLoading,
    calculateGrade,
    refreshSettings,
  };
}