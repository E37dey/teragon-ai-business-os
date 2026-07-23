// TERAGON AI BUSINESS OS — zod schemas for the presentation domain (W7-F,
// 7.21). Mirrors src/presentation/types.ts exactly; Hebrew messages. The
// bootstrap validates every record against these before writing.
import { z } from "zod";
import {
  BACKUP_ASSET_KEYS,
  PRESENTATION_SECTION_KEYS,
  PRESENTATION_SECTION_TITLES,
} from "./types";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z)?$/, "תאריך ISO לא תקין");

const baseEntity = {
  id: z.string().min(1, "מזהה חסר"),
  createdAt: isoDate,
  updatedAt: isoDate,
};

const nonEmpty = (msg: string) => z.string().min(1, msg);

export const presentationVisualKeySchema = z.enum([
  "as-is-to-be",
  "training-matrix",
  "roadmap-summary",
  "quick-start-microlearning",
  "metrics-summary",
]);

export const presentationTimingSchema = z.object({
  targetSeconds: z.number().int().positive("יעד הזמן חייב להיות חיובי"),
  // honest: null ⇒ "טרם נמדד" — a fabricated rehearsal number is forbidden
  actualRehearsalSeconds: z.number().int().nonnegative().nullable(),
  lastRehearsedAt: isoDate.nullable(),
});

export const presentationDemoLinkSchema = z.object({
  route: z.string().regex(/^\/[a-z0-9/-]*$/, "נתיב דמו חייב להיות ראוט אמיתי באפליקציה"),
  labelHe: nonEmpty("חסרה תווית לקישור הדמו"),
  noteHe: nonEmpty("חסרה הנחיה מה להראות בדמו"),
});

export const presentationBackupImageSchema = z.object({
  sourceFile: z
    .string()
    .regex(/^docs\/screenshots\/wave\d+\/.+\.png$/, "צילום גיבוי חייב להפנות לקובץ אמיתי"),
  assetKey: z.enum(BACKUP_ASSET_KEYS),
  capturedRoute: nonEmpty("חסר ראוט המקור של הצילום"),
  capturedWave: z.number().int().min(1).max(9),
  captionHe: nonEmpty("חסרה כותרת לצילום הגיבוי"),
  honestyNoteHe: nonEmpty("חסרה הערת כנות — מה הצילום באמת מציג"),
});

export const presentationSectionSchema = z.object({
  ...baseEntity,
  order: z.number().int().min(1).max(5),
  key: z.enum(PRESENTATION_SECTION_KEYS),
  titleHe: z.enum(PRESENTATION_SECTION_TITLES),
  objectiveHe: nonEmpty("חסרה מטרת השקף"),
  mainMessageHe: nonEmpty("חסר המסר המרכזי"),
  visual: presentationVisualKeySchema,
  visualDescriptionHe: nonEmpty("חסר תיאור הוויזואל החי"),
  demoLink: presentationDemoLinkSchema,
  backupImage: presentationBackupImageSchema,
  timing: presentationTimingSchema,
  sourceNoteHe: nonEmpty("חסר ייחוס מקור התוכן"),
  contentVersion: z.number().int().positive(),
});

export const presenterNoteSchema = z.object({
  ...baseEntity,
  sectionId: z.string().regex(/^ps-[1-5]$/, "הערת מרצה חייבת להשתייך לשקף קיים"),
  order: z.number().int().positive(),
  textHe: nonEmpty("הערת מרצה ריקה"),
  emphasis: z.enum(["רגיל", "מסר מרכזי", "הערת כנות"]),
});

export const demoStepSchema = z.object({
  ...baseEntity,
  order: z.number().int().min(1).max(11),
  titleHe: nonEmpty("חסרה כותרת לצעד הדמו"),
  objectiveHe: nonEmpty("חסרה מטרת צעד הדמו"),
  route: z.string().regex(/^\/[a-z0-9/-]*$/, "צעד דמו חייב ראוט אמיתי"),
  evidenceHe: nonEmpty("חסרה ראיה מוצגת לצעד הדמו"),
  status: z.enum(["לא בוצע", "בוצע"]),
  completedAt: isoDate.nullable(),
});

export type PresentationSectionInput = z.infer<typeof presentationSectionSchema>;
export type PresenterNoteInput = z.infer<typeof presenterNoteSchema>;
export type DemoStepInput = z.infer<typeof demoStepSchema>;
