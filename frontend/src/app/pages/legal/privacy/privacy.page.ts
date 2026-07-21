import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { Title } from '@angular/platform-browser';

@Component({
  selector: 'app-privacy',
  templateUrl: './privacy.page.html',
  styleUrls: ['../legal.scss'],
  standalone: true,
  imports: [CommonModule, RouterModule],
})
export class PrivacyPage implements OnInit {
  constructor(private readonly title: Title) {}

  ngOnInit(): void {
    this.title.setTitle('מדיניות פרטיות | KeepInTax');
  }
}
