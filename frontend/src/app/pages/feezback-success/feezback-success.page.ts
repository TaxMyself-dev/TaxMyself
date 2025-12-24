import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonSize } from '../../components/button/button.enum';
import { ButtonColor } from '../../components/button/button.enum';

@Component({
  selector: 'app-feezback-success',
  templateUrl: './feezback-success.page.html',
  styleUrls: ['./feezback-success.page.scss'],
  standalone: false,
})
export class FeezbackSuccessPage implements OnInit {
  readonly buttonSize = ButtonSize;
  readonly buttonColor = ButtonColor;
  
  flowId: string = '';
  context: string = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit() {
    // Get flowId from route params
    this.route.params.subscribe(params => {
      this.flowId = params['flowId'] || 'default';
    });

    // Get context from query params
    this.route.queryParams.subscribe(queryParams => {
      this.context = queryParams['context'] || '';
    });
  }

  navigateToHome() {
    this.router.navigate(['/my-account']);
  }
}

