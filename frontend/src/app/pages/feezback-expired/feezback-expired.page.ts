import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonSize } from '../../components/button/button.enum';
import { ButtonColor } from '../../components/button/button.enum';

@Component({
  selector: 'app-feezback-expired',
  templateUrl: './feezback-expired.page.html',
  styleUrls: ['./feezback-expired.page.scss'],
  standalone: false,
})
export class FeezbackExpiredPage implements OnInit {
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

  generateNewLink() {
    // אפשר להוסיף קריאה ל-API ליצירת לינק חדש
    this.router.navigate(['/my-account']);
  }
}

