import { Pipe, PipeTransform } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Pipe({
  name: 'highlight'
})
export class HighlightPipe implements PipeTransform {
  constructor(private sanitizer: DomSanitizer) {}

  transform(text: string, search: string): SafeHtml {
    if (!search) {
      return text;
    }
    // Escape special characters in search term
    const escapedSearch = search.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const re = new RegExp(escapedSearch, 'gi');
    const replacedText = text.replace(re, match => `<span style="background-color: yellow;">${match}</span>`);
    return this.sanitizer.bypassSecurityTrustHtml(replacedText);
  }
}
