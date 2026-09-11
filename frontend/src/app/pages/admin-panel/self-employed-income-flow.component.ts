import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { GuideSlide } from './self-employed-guide.content';

@Component({ selector:'app-self-employed-income-flow', templateUrl:'./self-employed-income-flow.component.html', styleUrls:['./self-employed-income-flow.component.scss'], standalone:true, imports:[CommonModule,IonicModule] })
export class SelfEmployedIncomeFlowComponent { @Input({ required:true }) slide!: GuideSlide; }
