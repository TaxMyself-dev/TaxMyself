import { Directive, inject, Injector, input, TemplateRef } from '@angular/core';

@Directive({
  selector: '[appSegmentContent]',
  standalone: true,
})
export class SegmentContentDirective {
  forValue = input.required<string>();
  templateRef = inject(TemplateRef<unknown>);
  // Captures the declaration-site injector so formControlName inside
  // the projected template can resolve its parent ControlContainer.
  injector = inject(Injector);
}
