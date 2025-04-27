import { Directive, ElementRef, AfterViewInit, Renderer2 } from '@angular/core';

@Directive({
  selector: '[appTruncatePointer]',
  standalone: true,
  exportAs: 'truncatePointer'
})
export class TruncatePointerDirective implements AfterViewInit {
  constructor(private el: ElementRef, private renderer: Renderer2) {}
  isTruncated = false;

  ngAfterViewInit(): void {
    // Use a timeout to ensure styles are applied
    setTimeout(() => {
      const element = this.el.nativeElement;
      // Check if the content overflows its container
      this.isTruncated =  element.scrollWidth > element.clientWidth;
      this.renderer.setStyle(element, 'cursor', this.isTruncated ? 'pointer' : 'default');

    },1000);
  }
}
