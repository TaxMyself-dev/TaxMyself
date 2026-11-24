import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MyAgentComponent } from '../../components/my-agent/my-agent.component';
import { MyAgentService } from '../../components/my-agent/my-agent.service';

@Component({
  selector: 'app-ai-automation', standalone: true, imports: [RouterLink, MyAgentComponent],
  template: `<main class="ai-page" dir="rtl"><a routerLink="/ai">חזרה ל־AI</a>
    @if (access.context()) { <app-my-agent /> }
    @else { <p>הסוכן האישי זמין בחשבון שלך. יש לצאת מתצוגת הלקוח כדי לנהל אותו.</p> }
    </main>`,
  styleUrls: ['./ai.page.scss'],
})
export class AiAutomationPage { readonly access = inject(MyAgentService); }
