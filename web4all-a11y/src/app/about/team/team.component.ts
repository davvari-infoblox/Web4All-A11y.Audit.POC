import { Component } from '@angular/core';

@Component({
  selector: 'app-team',
  templateUrl: './team.component.html',
  styleUrls: ['./team.component.scss']
})
export class TeamComponent {
  contactMessage: string = '';

  contactMember(email: string) {
    this.contactMessage = `Contact request sent to ${email}`;
    // Clear message after 5 seconds
    setTimeout(() => {
      this.contactMessage = '';
    }, 5000);
  }

  onKeydown(event: KeyboardEvent) {
    switch (event.key) {
      case 'Enter':
      case ' ':
        event.preventDefault();
        (event.target as HTMLElement).click();
        break;
      case 'Escape':
        // Clear any displayed messages
        this.contactMessage = '';
        break;
    }
  }
}
