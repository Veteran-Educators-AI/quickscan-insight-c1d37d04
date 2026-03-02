import { useCallback } from 'react';
import { useSettings } from './useSettings';

interface GradeFloorSettings {
  gradeFloor: number;
  gradeFloorWithEffort: number;
}

const DEFAULT_SETTINGS: GradeFloorSettings = {
  gradeFloor: 55,
  gradeFloorWithEffort: 65,
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
    const effectiveFloor = gradeFloor || 55;
    const effectiveEffortFloor = gradeFloorWithEffort || 65;
    
    // Even blank submissions get the minimum grade floor (55)
    if (!hasWork) {
      return effectiveFloor;
    }

    const maxCalculatedGrade = 100;

    // If regents score is available, use it for conversion
    if (regentsScore !== undefined && regentsScore >= 0) {
      const regentsToGrade: Record<number, number> = {
        4: 95,
        3: 80,
        2: 65,
        1: 55,
        0: 55,  // Minimum floor applied
      };
      const convertedGrade = regentsToGrade[regentsScore] ?? effectiveFloor;
      return Math.max(effectiveFloor, Math.min(maxCalculatedGrade, convertedGrade));
    }

    // Calculate from percentage
    if (percentage > 0) {
      const scaledGrade = Math.round((percentage / 100) * maxCalculatedGrade);
      return Math.max(effectiveEffortFloor, Math.min(maxCalculatedGrade, scaledGrade));
    }

    // Has work but no percentage = effort floor
    return effectiveEffortFloor;
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