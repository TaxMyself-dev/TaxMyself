import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { OpenBankingManagementComponent } from './open-banking-management.component';

/** Consent management remains reachable even when subscription access expires. */
@Component({
  standalone: true,
  imports: [RouterLink, OpenBankingManagementComponent],
  template: `<main dir="rtl"><a routerLink="/my-account">חזרה לאזור האישי</a><h1>ניהול החיבור לבנקאות פתוחה</h1><app-open-banking-management /></main>`,
  styles: [`:host { display: block; min-height: 0; overflow-y: auto; height: 100%; } main { max-width: 56rem; padding: 1rem; margin: auto; }`],
})
export class OpenBankingManagementPage {}
