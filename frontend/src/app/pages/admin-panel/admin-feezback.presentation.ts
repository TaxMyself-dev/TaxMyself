import type { FeezbackAdminRow } from "./admin-feezback.component";

export type ProviderState = "yes" | "no" | "unknown";
export const localDemoData = (row: FeezbackAdminRow) =>
  row.localDataIsDemo === true || row.synthetic;

export function providerState(row: FeezbackAdminRow): ProviderState {
  if (row.stale) return "unknown";
  if (row.primaryUnits === 1 || row.spouseUnits === 1) return "yes";
  return row.primaryUnits === 0 && row.spouseUnits === 0 ? "no" : "unknown";
}

export function requiresAttention(row: FeezbackAdminRow): boolean {
  const state = providerState(row);
  if (row.lastError) return true;
  if (state === "unknown")
    return !row.synthetic || row.primaryUnits === 1 || row.spouseUnits === 1;
  if (state === "yes")
    return (
      localDemoData(row) ||
      !row.hasOpenBanking ||
      row.entitlement.eligible !== true ||
      row.expectedUnits === null
    );
  return row.hasOpenBanking && !localDemoData(row);
}

export function connectionExplanation(row: FeezbackAdminRow): string {
  if (row.lastError)
    return "לא הצלחנו להשלים את הבדיקה מול פיזבק. יש לנסות שוב.";
  const state = providerState(row);
  if (state === "unknown") {
    if (row.synthetic && row.primaryUnits !== 1 && row.spouseUnits !== 1)
      return "נתוני דמו מקומיים. מצב ההרשאות בפיזבק לא אומת.";
    return row.stale
      ? "נדרשת בדיקה עדכנית מול פיזבק."
      : "מצב ההרשאות בפיזבק עדיין לא ידוע. יש לבצע בדיקה.";
  }
  if (state === "yes") {
    if (localDemoData(row))
      return "יש הרשאות אמיתיות בפיזבק לצד נתוני דמו. נדרשת בדיקה.";
    if (!row.hasOpenBanking)
      return "יש הרשאה בפיזבק, אבל אצלנו לא מסומן חיבור.";
    if (row.entitlement.eligible === false)
      return "יש הרשאה בפיזבק ללא זכאות. יש לבדוק אם צריך לנתק.";
    if (row.entitlement.eligible === null)
      return "יש הרשאה בפיזבק, אך חסרים נתוני מנוי לבדיקת הזכאות.";
    if (row.expectedUnits === null)
      return "יש הרשאה בפיזבק; הבדיקה של אחת הזהויות אינה מלאה.";
    return "אין פער.";
  }
  if (row.hasOpenBanking && localDemoData(row))
    return "נתוני דמו בלבד — מדמים חיבור לצורך בדיקות. אין הרשאות בפיזבק.";
  if (row.hasOpenBanking)
    return "אצלנו מסומן חיבור, אך לא נמצאו הרשאות בפיזבק. יש לבדוק את הסימון המקומי.";
  return "אין פער — אין הרשאות בפיזבק ואין חיבור שמור אצלנו.";
}
