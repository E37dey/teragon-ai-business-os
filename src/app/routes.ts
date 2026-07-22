// Canonical route table — single source of truth for the router, the shell nav
// and the router smoke tests. Hebrew titles follow docs/SCREEN_SPECS_HE.md.

export interface AppRouteDef {
  /** router path (may contain params) */
  path: string;
  /** concrete sample path used by nav links and smoke tests */
  navPath: string;
  /** Hebrew screen name */
  title: string;
  /** wave in which the real screen is built */
  wave: number;
  /** show in the placeholder shell nav */
  inNav: boolean;
}

export const APP_ROUTES: readonly AppRouteDef[] = [
  { path: "/", navPath: "/", title: "מרכז הפיקוד", wave: 3, inNav: true },
  { path: "/crm", navPath: "/crm", title: "ניהול לקוחות ולידים (CRM)", wave: 3, inNav: true },
  { path: "/customers", navPath: "/customers", title: "לקוחות", wave: 3, inNav: true },
  {
    path: "/customers/:id",
    navPath: "/customers/cu-1",
    title: "כרטיס לקוח",
    wave: 3,
    inNav: false,
  },
  { path: "/sales", navPath: "/sales", title: "מכירות והצעות מחיר", wave: 3, inNav: true },
  { path: "/courses", navPath: "/courses", title: "קורסים ולמידה", wave: 4, inNav: true },
  { path: "/service", navPath: "/service", title: "שירות ותיקונים", wave: 4, inNav: true },
  { path: "/printers", navPath: "/printers", title: "מדפסות ודגמים", wave: 4, inNav: true },
  { path: "/organizations", navPath: "/organizations", title: "ארגונים", wave: 4, inNav: true },
  { path: "/tasks", navPath: "/tasks", title: "משימות ופגישות", wave: 4, inNav: true },
  { path: "/documents", navPath: "/documents", title: "מסמכים והצעות מחיר", wave: 3, inNav: true },
  { path: "/automations", navPath: "/automations", title: "אוטומציות", wave: 5, inNav: true },
  { path: "/agents", navPath: "/agents", title: "סוכני AI", wave: 5, inNav: true },
  {
    path: "/agents/collaboration",
    navPath: "/agents/collaboration",
    title: "חדר התיאום של הסוכנים",
    wave: 5,
    inNav: true,
  },
  { path: "/memory", navPath: "/memory", title: "זיכרון ארגוני · Obsidian", wave: 6, inNav: true },
  { path: "/knowledge", navPath: "/knowledge", title: "מאגר ידע", wave: 6, inNav: true },
  { path: "/learning", navPath: "/learning", title: "מרכז למידה ושיפור", wave: 6, inNav: true },
  { path: "/analytics", navPath: "/analytics", title: "דוחות וניתוחים", wave: 4, inNav: true },
  { path: "/governance", navPath: "/governance", title: "ממשל ובקרת AI", wave: 4, inNav: true },
  {
    path: "/implementation",
    navPath: "/implementation",
    title: "תכנית ההטמעה",
    wave: 7,
    inNav: true,
  },
  { path: "/personas", navPath: "/personas", title: "פרסונות ומסלולי הדרכה", wave: 7, inNav: true },
  {
    path: "/stage-gates",
    navPath: "/stage-gates",
    title: "Stage Gates · שערי מעבר וראיות",
    wave: 7,
    inNav: true,
  },
  {
    path: "/training-materials",
    navPath: "/training-materials",
    title: "מרכז חומרי ההדרכה",
    wave: 7,
    inNav: true,
  },
  {
    path: "/quick-start",
    navPath: "/quick-start",
    title: "התחלה מהירה ושימוש נכון",
    wave: 7,
    inNav: true,
  },
  { path: "/faq", navPath: "/faq", title: "FAQ והתנגדויות", wave: 7, inNav: true },
  { path: "/support", navPath: "/support", title: "תמיכה לאחר ההשקה", wave: 7, inNav: true },
  {
    path: "/administration",
    navPath: "/administration",
    title: "ניהול המערכת",
    wave: 4,
    inNav: true,
  },
  {
    path: "/submission",
    navPath: "/submission",
    title: "מרכז ההגשה והראיות",
    wave: 7,
    inNav: true,
  },
  {
    path: "/submission/presentation",
    navPath: "/submission/presentation",
    title: "מצגת ההגשה",
    wave: 7,
    inNav: true,
  },
] as const;
