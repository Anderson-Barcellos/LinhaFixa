export const loadExercisePlayerModule = () => import('@/screens/ExercisePlayerScreen');
export const loadDashboardModule = () => import('@/screens/DashboardScreen');
export const loadExerciseLibraryModule = () => import('@/screens/ExerciseLibraryScreen');
export const loadSettingsModule = () => import('@/screens/SettingsScreen');
export const loadEyeTrackingTestModule = () => import('@/screens/EyeTrackingTestScreen');
export const loadHistoryModule = () => import('@/screens/HistoryScreen');

export async function preloadCameraRouteCode(): Promise<void> {
  await Promise.all([loadExercisePlayerModule(), loadEyeTrackingTestModule()]);
}
