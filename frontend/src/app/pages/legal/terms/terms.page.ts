import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { Title } from '@angular/platform-browser';

@Component({
  selector: 'app-terms',
  templateUrl: './terms.page.html',
  styleUrls: ['../legal.scss'],
  standalone: true,
  imports: [CommonModule, RouterModule],
})
export class TermsPage implements OnInit {
  constructor(private readonly title: Title) {}

  ngOnInit(): void {
    this.title.setTitle('תנאי שימוש | KeepInTax');
  }
}
