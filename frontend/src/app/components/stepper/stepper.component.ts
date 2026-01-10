import { Component, computed, input } from '@angular/core';

@Component({
  selector: 'app-stepper',
  standalone: true,
  imports: [],
  templateUrl: './stepper.component.html',
  styleUrl: './stepper.component.scss'
})
export class StepperComponent {
  totalSteps = input<number>(0);
  currentStep = input<number>(1);
  showLabel = input<boolean>(true);

  steps = computed(() => 
    Array.from({ length: this.totalSteps() }, (_, i) => i + 1)
  );

  isStepCompleted(step: number): boolean {
    return step <= this.currentStep();
  }
}
