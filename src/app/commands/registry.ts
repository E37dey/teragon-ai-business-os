// Command registry — the typed list of palette commands. Every command here
// ACTUALLY WORKS through its run(ctx): navigation, quick-create dialogs,
// search mode, rail toggle, shortcuts dialog. No placeholder commands.
import type { IconName } from "@/design-system/icons";
import type { QuickCreateKind } from "@/app/quick-create/QuickCreateHost";

export interface CommandContext {
  navigate: (path: string) => void;
  openQuickCreate: (kind: QuickCreateKind) => void;
  /** switch the palette to global-search mode */
  openSearch: () => void;
  /** toggle the left intelligence rail collapsed state (persisted) */
  toggleRail: () => void;
  openShortcuts: () => void;
  /** close the palette (run() calls it unless it switches palette mode) */
  close: () => void;
}

export interface Command {
  id: string;
  title: string;
  icon: IconName;
  /** extra Hebrew/English keywords for filtering */
  keywords: readonly string[];
  run: (ctx: CommandContext) => void;
}

export const COMMANDS: readonly Command[] = [
  {
    id: "open-command-center",
    title: "פתח מרכז שליטה",
    icon: "home",
    keywords: ["דשבורד", "בית", "home", "dashboard"],
    run: (ctx) => {
      ctx.close();
      ctx.navigate("/");
    },
  },
  {
    id: "create-lead",
    title: "צור ליד חדש",
    icon: "users",
    keywords: ["ליד", "lead", "מכירות"],
    run: (ctx) => {
      ctx.close();
      ctx.openQuickCreate("lead");
    },
  },
  {
    id: "create-customer",
    title: "צור לקוח חדש",
    icon: "users",
    keywords: ["לקוח", "customer"],
    run: (ctx) => {
      ctx.close();
      ctx.openQuickCreate("customer");
    },
  },
  {
    id: "create-ticket",
    title: "צור קריאת שירות",
    icon: "wrench",
    keywords: ["שירות", "תקלה", "ticket", "service"],
    run: (ctx) => {
      ctx.close();
      ctx.openQuickCreate("ticket");
    },
  },
  {
    id: "create-task",
    title: "צור משימה",
    icon: "clock",
    keywords: ["משימה", "task", "todo"],
    run: (ctx) => {
      ctx.close();
      ctx.openQuickCreate("task");
    },
  },
  {
    id: "create-meeting",
    title: "קבע פגישה",
    icon: "clock",
    keywords: ["פגישה", "meeting", "יומן"],
    run: (ctx) => {
      ctx.close();
      ctx.openQuickCreate("meeting");
    },
  },
  {
    id: "open-search",
    title: "פתח חיפוש",
    icon: "search",
    keywords: ["חיפוש", "search", "find"],
    run: (ctx) => {
      // stays open — switches the palette into search mode
      ctx.openSearch();
    },
  },
  {
    id: "open-agents",
    title: "פתח סוכני AI",
    icon: "bot",
    keywords: ["סוכנים", "agents", "ai"],
    run: (ctx) => {
      ctx.close();
      ctx.navigate("/agents");
    },
  },
  {
    id: "open-submission",
    title: "פתח מרכז ההגשה",
    icon: "evidence",
    keywords: ["הגשה", "ראיות", "submission"],
    run: (ctx) => {
      ctx.close();
      ctx.navigate("/submission");
    },
  },
  {
    id: "toggle-rail",
    title: "החלף מצב תצוגה (כיווץ סרגל ההקשר)",
    icon: "gauge",
    keywords: ["סרגל", "rail", "תצוגה", "layout"],
    run: (ctx) => {
      ctx.close();
      ctx.toggleRail();
    },
  },
  {
    id: "show-shortcuts",
    title: "הצג קיצורי מקלדת",
    icon: "book",
    keywords: ["קיצורים", "מקלדת", "shortcuts", "keyboard"],
    run: (ctx) => {
      ctx.close();
      ctx.openShortcuts();
    },
  },
];

/** filter commands by query over title + keywords (case-insensitive) */
export function filterCommands(query: string): readonly Command[] {
  const q = query.trim().toLowerCase();
  if (q === "") return COMMANDS;
  return COMMANDS.filter(
    (c) => c.title.toLowerCase().includes(q) || c.keywords.some((k) => k.toLowerCase().includes(q)),
  );
}
