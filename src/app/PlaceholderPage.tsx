// Honest RTL placeholder page — Wave 1 only. No design-system imports (that layer
// belongs to the Design agent); neutral dark inline styles that the Wave 2 shell
// replaces. States plainly that the screen is not built yet — no fake content.
import { Link } from "react-router-dom";

export interface PlaceholderPageProps {
  /** Hebrew screen name per docs/SCREEN_SPECS_HE.md */
  title: string;
  /** wave in which the real screen is built */
  wave: number;
  /** current route path, shown LTR for orientation */
  path: string;
}

export default function PlaceholderPage({ title, wave, path }: PlaceholderPageProps) {
  return (
    <div
      dir="rtl"
      style={{
        minHeight: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: "0.75rem",
        padding: "2.5rem",
        color: "#98A8BD",
      }}
    >
      <span
        style={{
          fontSize: "0.75rem",
          border: "1px solid rgba(112,158,220,.17)",
          borderRadius: "999px",
          padding: "0.15rem 0.7rem",
          color: "#75879F",
        }}
      >
        נתוני הדגמה · מצב הדגמה מקומי
      </span>
      <h1 style={{ color: "#F5F8FD", fontSize: "1.6rem", margin: 0 }}>{title}</h1>
      <p style={{ margin: 0 }}>
        המסך ייבנה בגל {wave}. בשלב זה מוצג עמוד מחזיק־מקום כן — ללא תוכן מדומה.
      </p>
      <code dir="ltr" style={{ color: "#75879F", fontSize: "0.8rem" }}>
        {path}
      </code>
      <Link to="/" style={{ color: "#20C4E8", marginBlockStart: "0.5rem" }}>
        חזרה למרכז הפיקוד
      </Link>
    </div>
  );
}
