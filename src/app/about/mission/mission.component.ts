import { Component } from '@angular/core';

@Component({
  selector: 'app-mission',
  templateUrl: './mission.component.html',
  styleUrls: ['./mission.component.scss']
})
export class MissionComponent {
  visionExpanded = false;

  toggleVisionDetails() {
    this.visionExpanded = !this.visionExpanded;
    const button = document.querySelector('.learn-more-btn');
    const details = document.querySelector('.vision-details');
    
    if (button && details) {
      button.setAttribute('aria-expanded', this.visionExpanded.toString());
      details.setAttribute('aria-hidden', (!this.visionExpanded).toString());
    }
  }

  onKeydown(event: KeyboardEvent) {
    switch (event.key) {
      case 'Enter':
      case ' ':
        event.preventDefault();
        this.toggleVisionDetails();
        break;
      case 'Escape':
        if (this.visionExpanded) {
          this.toggleVisionDetails();
          const button = document.querySelector('.learn-more-btn');
          if (button instanceof HTMLElement) {
            button.focus();
          }
        }
        break;
    }
  }
}
