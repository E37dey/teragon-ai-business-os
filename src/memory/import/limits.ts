// TERAGON AI BUSINESS OS — secure import limits + typed Hebrew error map
// (Wave 6, W6-B, Phase 6.6). Every limit is a tested constant; every
// rejection maps to a safe Hebrew message (no stack traces / internals leak).

export const IMPORT_ALLOWED_EXTENSIONS = [".md", ".markdown", ".zip"] as const;
/** total selected payload cap */
export const IMPORT_MAX_TOTAL_BYTES = 20 * 1024 * 1024; // 20MB
/** max files per import (zip entries included) */
export const IMPORT_MAX_FILES = 200;
/** max single (uncompressed) file size */
export const IMPORT_MAX_FILE_BYTES = 2 * 1024 * 1024; // 2MB
/** zip-bomb guard: declared uncompressed/compressed ratio cap */
export const IMPORT_MAX_COMPRESSION_RATIO = 100;
/** max directory depth inside an archive */
export const IMPORT_MAX_DIR_DEPTH = 8;
/** max markdown length (chars) of a single note */
export const IMPORT_MAX_MARKDOWN_CHARS = 500_000;

/** extensions rejected as hidden executables / scripts inside archives */
export const IMPORT_EXECUTABLE_EXTENSIONS = [
  ".exe", ".dll", ".msi", ".scr", ".com", ".bat", ".cmd", ".ps1", ".psm1",
  ".sh", ".bash", ".zsh", ".js", ".mjs", ".cjs", ".ts", ".vbs", ".vbe",
  ".wsf", ".hta", ".jar", ".apk", ".app", ".deb", ".rpm", ".py", ".rb",
  ".php", ".pl", ".lnk", ".svg",
] as const;

/** nested archives are rejected (no recursive extraction) */
export const IMPORT_NESTED_ARCHIVE_EXTENSIONS = [
  ".zip", ".7z", ".rar", ".tar", ".gz", ".bz2", ".xz", ".tgz", ".cab", ".iso",
] as const;

/** image extensions — recorded as non-executable references only (no preview fetch) */
export const IMPORT_IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".avif"] as const;

export type ImportErrorCode =
  | "EXTENSION_NOT_ALLOWED"
  | "TOTAL_TOO_LARGE"
  | "TOO_MANY_FILES"
  | "FILE_TOO_LARGE"
  | "COMPRESSION_RATIO_EXCEEDED"
  | "DIR_DEPTH_EXCEEDED"
  | "MARKDOWN_TOO_LONG"
  | "ZIP_PATH_TRAVERSAL"
  | "ZIP_SYMLINK"
  | "ZIP_NESTED_ARCHIVE"
  | "ZIP_EXECUTABLE"
  | "ZIP_DUPLICATE_NAME"
  | "ZIP_ENCRYPTED"
  | "ZIP_MALFORMED"
  | "ZIP_CRC_MISMATCH"
  | "ZIP_INFLATE_UNAVAILABLE"
  | "BINARY_REJECTED"
  | "EMPTY_FILE"
  | "EMPTY_SELECTION";

export const IMPORT_ERROR_HE: Record<ImportErrorCode, string> = {
  EXTENSION_NOT_ALLOWED: "סוג קובץ לא נתמך — מותרים רק ‎.md‎, ‎.markdown‎ ו-‎.zip",
  TOTAL_TOO_LARGE: `סך הקבצים חורג מהמגבלה (${IMPORT_MAX_TOTAL_BYTES / (1024 * 1024)}MB) — הייבוא נדחה`,
  TOO_MANY_FILES: `מספר הקבצים חורג מהמגבלה (${IMPORT_MAX_FILES}) — הייבוא נדחה`,
  FILE_TOO_LARGE: `קובץ בודד חורג מהמגבלה (${IMPORT_MAX_FILE_BYTES / (1024 * 1024)}MB) — הקובץ נדחה`,
  COMPRESSION_RATIO_EXCEEDED: `יחס דחיסה חשוד (מעל ×${IMPORT_MAX_COMPRESSION_RATIO}) — חסימת פצצת ZIP לפני חילוץ`,
  DIR_DEPTH_EXCEEDED: `עומק תיקיות חורג מהמגבלה (${IMPORT_MAX_DIR_DEPTH}) — הקובץ נדחה`,
  MARKDOWN_TOO_LONG: `אורך ה-Markdown חורג מהמגבלה (${IMPORT_MAX_MARKDOWN_CHARS.toLocaleString()} תווים) — הקובץ נדחה`,
  ZIP_PATH_TRAVERSAL: "נתיב חשוד בארכיון (יציאה מהתיקייה / נתיב מוחלט) — הקובץ נדחה",
  ZIP_SYMLINK: "קישור סמלי (symlink) בארכיון אינו מותר — הקובץ נדחה",
  ZIP_NESTED_ARCHIVE: "ארכיון בתוך ארכיון אינו מותר — הקובץ נדחה",
  ZIP_EXECUTABLE: "קובץ הרצה/סקריפט בארכיון אינו מותר — הקובץ נדחה",
  ZIP_DUPLICATE_NAME: "שני קבצים באותו שם בארכיון — התנגשות שמות; הייבוא נדחה",
  ZIP_ENCRYPTED: "ארכיון מוצפן אינו נתמך — הקובץ נדחה",
  ZIP_MALFORMED: "מבנה ה-ZIP אינו תקין — הקובץ נדחה",
  ZIP_CRC_MISMATCH: "בדיקת CRC נכשלה — תוכן הארכיון פגום; הקובץ נדחה",
  ZIP_INFLATE_UNAVAILABLE: "פענוח deflate אינו זמין בדפדפן זה — לא ניתן לחלץ את הארכיון",
  BINARY_REJECTED: "קובץ בינארי אינו נתמך בייבוא — רק Markdown (תמונות נרשמות כהפניה בלבד)",
  EMPTY_FILE: "קובץ ריק — אין תוכן לייבוא",
  EMPTY_SELECTION: "לא נבחרו קבצים לייבוא",
};

export class MemoryImportError extends Error {
  readonly code: ImportErrorCode;
  /** the offending path/file, when known */
  readonly path: string | null;
  constructor(code: ImportErrorCode, path: string | null = null) {
    super(path ? `${IMPORT_ERROR_HE[code]}: ${path}` : IMPORT_ERROR_HE[code]);
    this.name = "MemoryImportError";
    this.code = code;
    this.path = path;
  }
}

function extOf(name: string): string {
  const clean = name.toLowerCase();
  const dot = clean.lastIndexOf(".");
  return dot === -1 ? "" : clean.slice(dot);
}

export function isMarkdownFileName(name: string): boolean {
  const e = extOf(name);
  return e === ".md" || e === ".markdown";
}

export function isZipFileName(name: string): boolean {
  return extOf(name) === ".zip";
}

export function isExecutableFileName(name: string): boolean {
  return (IMPORT_EXECUTABLE_EXTENSIONS as readonly string[]).includes(extOf(name));
}

export function isNestedArchiveFileName(name: string): boolean {
  return (IMPORT_NESTED_ARCHIVE_EXTENSIONS as readonly string[]).includes(extOf(name));
}

export function isImageFileName(name: string): boolean {
  return (IMPORT_IMAGE_EXTENSIONS as readonly string[]).includes(extOf(name));
}
