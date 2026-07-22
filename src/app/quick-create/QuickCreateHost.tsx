// Quick-create host — the "+" menu and the six zod-validated RTL creation
// forms. Each form writes through the canonical repository actions
// (actions.ts), shows Hebrew field errors, then toasts success + navigates to
// the module page with an honest "העורך המלא יגיע בגל X" note.
import { useState } from "react";
import type { ChangeEvent, ReactElement } from "react";
import { useNavigate } from "react-router-dom";
import { Modal, OsButton, OsIcon, useToast, type IconName } from "@/design-system";
import { APP_ROUTES } from "@/app/routes";
import {
  createCustomer,
  createLead,
  createMeeting,
  createQuotation,
  createTask,
  createTicket,
  customerInputSchema,
  leadInputSchema,
  meetingInputSchema,
  quotationInputSchema,
  taskInputSchema,
  ticketInputSchema,
} from "./actions";
import type { z } from "zod";

export type QuickCreateKind = "lead" | "customer" | "task" | "meeting" | "ticket" | "quotation";

export interface QuickCreateState {
  view: "menu" | QuickCreateKind;
}

interface FieldDef {
  name: string;
  label: string;
  type: "text" | "date" | "datetime-local" | "number" | "select" | "textarea";
  options?: readonly string[];
  /** map raw string → value for the schema (default: identity) */
  parse?: (raw: string) => unknown;
  placeholder?: string;
}

interface KindDef {
  kind: QuickCreateKind;
  title: string;
  icon: IconName;
  /** destination route after a successful create */
  destination: string;
  fields: readonly FieldDef[];
  schema: z.ZodType<unknown>;
  submit: (input: never) => Promise<{ id: string }>;
  successLabel: string;
}

const num = (raw: string): unknown => (raw.trim() === "" ? undefined : Number(raw));
/** datetime-local gives "YYYY-MM-DDTHH:mm" — the domain isoDate needs seconds */
const datetime = (raw: string): unknown => (raw.length === 16 ? `${raw}:00` : raw);

const KINDS: readonly KindDef[] = [
  {
    kind: "lead",
    title: "ליד חדש",
    icon: "users",
    destination: "/crm",
    schema: leadInputSchema,
    submit: createLead as KindDef["submit"],
    successLabel: "הליד נוצר בהצלחה",
    fields: [
      { name: "name", label: "שם מלא", type: "text" },
      { name: "phone", label: "טלפון", type: "text" },
      { name: "email", label: "אימייל", type: "text" },
      {
        name: "source",
        label: "מקור",
        type: "select",
        options: ["אתר", "וואטסאפ", "טלפון", "פייסבוק", "אינסטגרם", "המלצה", "לקוח חוזר"],
      },
      { name: "interest", label: "תחום עניין", type: "text", placeholder: "למשל: קורס Fusion 360" },
      { name: "notes", label: "הערות", type: "textarea" },
    ],
  },
  {
    kind: "customer",
    title: "לקוח חדש",
    icon: "users",
    destination: "/customers",
    schema: customerInputSchema,
    submit: createCustomer as KindDef["submit"],
    successLabel: "הלקוח נוצר בהצלחה",
    fields: [
      { name: "name", label: "שם הלקוח", type: "text" },
      { name: "type", label: "סוג", type: "select", options: ["פרטי", "עסק", "בית ספר", "ארגון"] },
      { name: "phone", label: "טלפון", type: "text" },
      { name: "email", label: "אימייל", type: "text" },
      { name: "city", label: "עיר", type: "text" },
    ],
  },
  {
    kind: "task",
    title: "משימה חדשה",
    icon: "clock",
    destination: "/tasks",
    schema: taskInputSchema,
    submit: createTask as KindDef["submit"],
    successLabel: "המשימה נוצרה בהצלחה",
    fields: [
      { name: "title", label: "כותרת", type: "text" },
      { name: "description", label: "תיאור", type: "textarea" },
      { name: "priority", label: "עדיפות", type: "select", options: ["גבוהה", "בינונית", "נמוכה"] },
      { name: "due", label: "תאריך יעד", type: "date" },
    ],
  },
  {
    kind: "meeting",
    title: "פגישה חדשה",
    icon: "clock",
    destination: "/tasks",
    schema: meetingInputSchema,
    submit: createMeeting as KindDef["submit"],
    successLabel: "הפגישה נקבעה בהצלחה",
    fields: [
      { name: "title", label: "כותרת", type: "text" },
      { name: "scheduledAt", label: "מועד", type: "datetime-local", parse: datetime },
      { name: "durationMinutes", label: "משך (דקות)", type: "number", parse: num },
      { name: "location", label: "מיקום", type: "text", placeholder: "זום / משרד" },
      { name: "agenda", label: "אג'נדה", type: "textarea" },
    ],
  },
  {
    kind: "ticket",
    title: "קריאת שירות חדשה",
    icon: "wrench",
    destination: "/service",
    schema: ticketInputSchema,
    submit: createTicket as KindDef["submit"],
    successLabel: "קריאת השירות נפתחה בהצלחה",
    fields: [
      { name: "customerName", label: "שם הלקוח", type: "text" },
      { name: "printer", label: "מדפסת", type: "text", placeholder: "למשל: Bambu Lab A1" },
      { name: "issue", label: "תקלה", type: "text" },
      { name: "description", label: "תיאור", type: "textarea" },
      { name: "priority", label: "עדיפות", type: "select", options: ["גבוהה", "בינונית", "נמוכה"] },
    ],
  },
  {
    kind: "quotation",
    title: "הצעת מחיר חדשה",
    icon: "doc",
    destination: "/sales",
    schema: quotationInputSchema,
    submit: createQuotation as KindDef["submit"],
    successLabel: "הצעת המחיר נוצרה בהצלחה",
    fields: [
      { name: "customerName", label: "שם הלקוח", type: "text" },
      { name: "title", label: "כותרת ההצעה", type: "text" },
      { name: "lineDescription", label: "תיאור השורה", type: "text" },
      { name: "quantity", label: "כמות", type: "number", parse: num },
      { name: "unitPrice", label: "מחיר ליחידה (₪)", type: "number", parse: num },
      { name: "validUntil", label: "בתוקף עד", type: "date" },
    ],
  },
];

function waveOf(destination: string): number | null {
  const route = APP_ROUTES.find((r) => r.path === destination);
  return route ? route.wave : null;
}

const SELECT_DEFAULTS: Record<string, string> = {};
for (const kind of KINDS) {
  for (const f of kind.fields) {
    if (f.type === "select" && f.options && f.options.length > 0) {
      SELECT_DEFAULTS[`${kind.kind}:${f.name}`] = f.options[0] ?? "";
    }
  }
}

function initialValues(def: KindDef): Record<string, string> {
  const values: Record<string, string> = {};
  for (const f of def.fields) {
    values[f.name] = f.type === "select" ? (SELECT_DEFAULTS[`${def.kind}:${f.name}`] ?? "") : "";
  }
  return values;
}

interface QuickCreateFormProps {
  def: KindDef;
  onDone: () => void;
}

function QuickCreateForm({ def, onDone }: QuickCreateFormProps): ReactElement {
  const [values, setValues] = useState<Record<string, string>>(() => initialValues(def));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const onSubmit = async (): Promise<void> => {
    const mapped: Record<string, unknown> = {};
    for (const f of def.fields) {
      const raw = values[f.name] ?? "";
      mapped[f.name] = f.parse ? f.parse(raw) : raw;
    }
    const parsed = def.schema.safeParse(mapped);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "");
        if (key && !(key in next)) next[key] = issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await def.submit(parsed.data as never);
      const wave = waveOf(def.destination);
      toast(
        wave === null
          ? def.successLabel
          : `${def.successLabel} · העורך המלא של המודול יגיע בגל ${wave}`,
        "success",
        6000,
      );
      onDone();
      void navigate(def.destination);
    } catch {
      toast("השמירה נכשלה — נסו שוב", "danger");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="os-qc-form"
      onSubmit={(e) => {
        e.preventDefault();
        void onSubmit();
      }}
      noValidate
    >
      {def.fields.map((f) => {
        const fieldId = `qc-${def.kind}-${f.name}`;
        const errorId = `${fieldId}-error`;
        const error = errors[f.name];
        const common = {
          id: fieldId,
          value: values[f.name] ?? "",
          "aria-invalid": error ? true : undefined,
          "aria-describedby": error ? errorId : undefined,
          onChange: (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
            setValues((v) => ({ ...v, [f.name]: e.target.value })),
        } as const;
        return (
          <div key={f.name} className="os-qc-field">
            <label className="os-qc-label" htmlFor={fieldId}>
              {f.label}
            </label>
            {f.type === "select" ? (
              <select className="os-qc-input" {...common}>
                {(f.options ?? []).map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            ) : f.type === "textarea" ? (
              <textarea className="os-qc-input os-qc-input--area" rows={3} {...common} />
            ) : (
              <input
                className="os-qc-input"
                type={f.type}
                placeholder={f.placeholder}
                {...common}
              />
            )}
            {error && (
              <span className="os-qc-error" id={errorId} role="alert">
                {error}
              </span>
            )}
          </div>
        );
      })}
      <div className="os-qc-actions">
        {busy ? (
          <OsButton type="submit" variant="primary" disabled disabledReason="שמירה מתבצעת…">
            שומר…
          </OsButton>
        ) : (
          <OsButton type="submit" variant="primary">
            שמירה
          </OsButton>
        )}
        <OsButton type="button" variant="ghost" onClick={onDone}>
          ביטול
        </OsButton>
      </div>
    </form>
  );
}

export interface QuickCreateHostProps {
  state: QuickCreateState | null;
  onClose: () => void;
  onSelectKind: (kind: QuickCreateKind) => void;
}

/** The quick-create modal: menu of six creations, or the selected form. */
export function QuickCreateHost({
  state,
  onClose,
  onSelectKind,
}: QuickCreateHostProps): ReactElement | null {
  if (state === null) return null;
  if (state.view === "menu") {
    return (
      <Modal open onClose={onClose} title="הוספה מהירה">
        <div className="os-qc-menu">
          {KINDS.map((k) => (
            <button
              key={k.kind}
              type="button"
              className="os-qc-menu__item"
              onClick={() => onSelectKind(k.kind)}
            >
              <OsIcon name={k.icon} size={16} />
              <span>{k.title}</span>
            </button>
          ))}
        </div>
      </Modal>
    );
  }
  const def = KINDS.find((k) => k.kind === state.view);
  if (!def) return null;
  return (
    <Modal open onClose={onClose} title={def.title}>
      <QuickCreateForm def={def} onDone={onClose} />
    </Modal>
  );
}
