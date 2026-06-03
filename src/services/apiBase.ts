// Base-aware API URL helper.
//
// `import.meta.env.BASE_URL` is the Vite `base` value (e.g. '/' or '/gaze/'), which
// is derived from the APP_BASE_PATH env at build time (see vite.config.ts). Using it
// here keeps every /api call correct whether the app is served at the domain root or
// mounted under a sub-path such as /gaze on ultrassom.ai.
//
// Examples:
//   base '/'      -> apiUrl('/api/x') === '/api/x'
//   base '/gaze/' -> apiUrl('/api/x') === '/gaze/api/x'
export function apiUrl(path: string): string {
  const base = import.meta.env.BASE_URL || '/';
  const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base; // '' or '/gaze'
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${cleanBase}${cleanPath}`;
}
