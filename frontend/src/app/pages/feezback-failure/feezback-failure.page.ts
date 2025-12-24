import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonSize } from '../../components/button/button.enum';
import { ButtonColor } from '../../components/button/button.enum';

@Component({
  selector: 'app-feezback-failure',
  templateUrl: './feezback-failure.page.html',
  styleUrls: ['./feezback-failure.page.scss'],
  standalone: false,
})
export class FeezbackFailurePage implements OnInit {
  readonly buttonSize = ButtonSize;
  readonly buttonColor = ButtonColor;
  
  flowId: string = '';
  context: string = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit() {
    this.route.params.subscribe(params => {
      this.flowId = params['flowId'] || 'default';
    });

    this.route.queryParams.subscribe(queryParams => {
      this.context = queryParams['context'] || '';
    });
  }

  navigateToHome() {
    this.router.navigate(['/my-account']);
  }

  tryAgain() {
    // אפשר להוסיף לוגיקה לנסות שוב
    this.router.navigate(['/my-account']);
  }
}

