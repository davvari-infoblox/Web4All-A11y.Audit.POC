import { Component } from '@angular/core';

@Component({
  selector: 'app-details',
  templateUrl: './details.component.html',
  styleUrls: ['./details.component.scss']
})
export class DetailsComponent {
  expandedSections: { [key: number]: boolean } = {};

  toggleSection(sectionId: number) {
    this.expandedSections[sectionId] = !this.expandedSections[sectionId];
    
    // Update ARIA attributes
    const button = document.querySelector(`button[aria-expanded][onclick*="${sectionId}"]`);
    const content = button?.nextElementSibling;
    
    if (button && content) {
      button.setAttribute('aria-expanded', this.expandedSections[sectionId].toString());
      content.setAttribute('aria-hidden', (!this.expandedSections[sectionId]).toString());
    }
  }

  onKeydown(event: KeyboardEvent) {
    // Handle keyboard interactions for accessibility
    switch (event.key) {
      case 'Enter':
      case ' ':
        event.preventDefault();
        (event.target as HTMLElement).click();
        break;
      case 'Escape':
        // Close expanded section if open
        const button = event.target as HTMLButtonElement;
        const sectionId = parseInt(button.getAttribute('data-section-id') || '0');
        if (this.expandedSections[sectionId]) {
          this.toggleSection(sectionId);
        }
        break;
    }
  }
}
