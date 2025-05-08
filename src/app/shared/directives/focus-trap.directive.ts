import { Directive, ElementRef, HostListener } from '@angular/core';

@Directive({
  selector: '[appFocusTrap]'
})
export class FocusTrapDirective {
  private focusableElements: HTMLElement[] = [];

  constructor(private el: ElementRef) {
    this.initFocusableElements();
  }

  private initFocusableElements() {
    const focusableSelectors = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    this.focusableElements = Array.from(
      this.el.nativeElement.querySelectorAll(focusableSelectors)
    );
  }

  @HostListener('keydown', ['$event'])
  onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Tab') {
      if (this.focusableElements.length === 0) return;

      const firstFocusableElement = this.focusableElements[0];
      const lastFocusableElement = this.focusableElements[this.focusableElements.length - 1];

      if (event.shiftKey) {
        // If shift key pressed for shift + tab combination
        if (document.activeElement === firstFocusableElement) {
          lastFocusableElement.focus();
          event.preventDefault();
        }
      } else {
        // If tab key pressed
        if (document.activeElement === lastFocusableElement) {
          firstFocusableElement.focus();
          event.preventDefault();
        }
      }
    }
  }

  @HostListener('focusin')
  onFocusIn() {
    // Refresh focusable elements when focus enters the container
    this.initFocusableElements();
  }
}