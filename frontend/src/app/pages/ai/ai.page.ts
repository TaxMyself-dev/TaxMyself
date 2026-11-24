import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-ai', standalone: true, imports: [RouterLink],
  template: `
    <main class="ai-page" dir="rtl">
      <header><h1>AI</h1><p>הסוכן שלך, שמכיר אותך ועוזר בניהול העסק.</p></header>
      <nav aria-label="כלי AI">
        <a routerLink="/agent/chat"><i class="pi pi-comments" aria-hidden="true"></i><div><h2>צ׳אט AI</h2><p>שאלות, מידע ועזרה בפעולות בעסק.</p></div><span>פתיחת שיחה</span></a>
        <a routerLink="/agent/onboarding"><i class="pi pi-user" aria-hidden="true"></i><div><h2>היכרות עם הסוכן</h2><p>ספרו עליכם ועל העסק, כדי שהעזרה תתאים לכם.</p></div><span>להיכרות</span></a>
        <a routerLink="/agent/automation"><i class="pi pi-sliders-h" aria-hidden="true"></i><div><h2>הסוכן שלי</h2><p>הגדרות הסיווג האוטומטי, התקדמות והודעות מהסוכן.</p></div><span>לניהול הסוכן</span></a>
      </nav>
    </main>`,
  styleUrls: ['./ai.page.scss'],
})
export class AiPage {}
