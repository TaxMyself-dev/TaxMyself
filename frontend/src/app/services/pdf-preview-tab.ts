/** Static status page: no document/customer content or upstream error details. */
export function writePdfPreviewStatus(tab: Window | null, failed = false): void {
  if (!tab || tab.closed) return;
  try {
    tab.document.open();
    tab.document.write(`<!doctype html><html lang="he" dir="rtl"><head>
      <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
      <title>תצוגה מקדימה</title><style>
      *{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f6f8f7;color:#1c2230;font:17px Arial,sans-serif;text-align:center;padding:24px}
      main{max-width:440px}h1{font-size:24px;margin:24px 0 12px}p{line-height:1.6;color:#505967}
      .spinner{width:48px;height:48px;border:4px solid #dbe7e1;border-top-color:#287c60;border-radius:50%;margin:auto;animation:spin 1s linear infinite}
      button{padding:10px 22px;border:1px solid #b9c7c0;border-radius:6px;background:white;color:#1c2230;font:inherit;cursor:pointer}
      @keyframes spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.spinner{animation:none}}
      </style></head><body><main role="${failed ? 'alert' : 'status'}" aria-live="polite">
      ${failed ? '' : '<div class="spinner" aria-hidden="true"></div>'}
      <h1>${failed ? 'לא הצלחנו להכין את התצוגה המקדימה' : 'מכינים את התצוגה המקדימה'}</h1>
      <p>${failed ? 'אפשר לחזור למסך המסמך ולנסות שוב.' : 'המסמך יופיע כאן מיד כשהוא יהיה מוכן.'}</p>
      <button onclick="window.close()">סגור</button></main></body></html>`);
    tab.document.close();
  } catch { /* A closed or navigated tab must not prevent request cleanup. */ }
}
