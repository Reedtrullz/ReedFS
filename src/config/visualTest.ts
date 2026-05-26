export function isVisualTestMode(value: string | undefined = import.meta.env.VITE_RFS_VISUAL_TEST): boolean {
  return value === '1';
}
