export interface DocumentRetryResult {
  fileId: string;
  status: string;
}
export interface DocumentRetrySummary {
  results: DocumentRetryResult[];
  retried: number;
  skipped: number;
  nextCursor?: number;
}
const reasons: Record<string, string> = {
  UNKNOWN_OUTCOME: "תוצאת ניתוח קודמת אינה ודאית ונדרשת בדיקה ידנית",
  PASSWORD_REQUIRED: "נדרש עותק פתוח ללא סיסמה",
  ALREADY_ACTIVE: "המסמך כבר בתהליך",
  NOT_RETRYABLE: "המסמך כבר טופל או אינו מתאים לניסיון חוזר",
  BUSY: "המסמך בטיפול כרגע; אפשר לנסות מאוחר יותר",
  OTHER_WORKER: "יש לנסות בסביבה שבה בוצע הייבוא",
  CONTENT_CHANGED: "תוכן הקובץ השתנה ונדרשת בדיקה",
  FILE_UNAVAILABLE: "הקובץ אינו זמין בתיקיית העסק",
  CONFIGURATION_MISMATCH: "הגדרות התור השתנו ונדרשת בדיקה לפני חידוש העבודה",
  NOT_FOUND: "המסמך לא נמצא בעסק שנבחר",
  FAILED: "לא ניתן לשחרר את המסמך כרגע",
};
export function documentRetryMessage(result: DocumentRetrySummary): string {
  const counts = new Map<string, number>();
  for (const item of result.results)
    if (!["REQUEUED", "RESUMED", "EXISTING_RESULT"].includes(item.status))
      counts.set(item.status, (counts.get(item.status) || 0) + 1);
  return [
    result.retried + " מסמכים הוחזרו לעיבוד.",
    ...Array.from(
      counts,
      ([status, count]) => count + " — " + (reasons[status] || "נדרשת בדיקה")
    ),
  ].join(" ");
}
export function documentRetryError(status: number): string {
  return status === 503
    ? "הגדרות העיבוד אינן מוכנות. יש לתקן את הגדרות השרת לפני ניסיון חוזר."
    : "לא ניתן לחדש את העיבוד. נסה שוב מאוחר יותר.";
}
