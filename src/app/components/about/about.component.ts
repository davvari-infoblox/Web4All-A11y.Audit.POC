import { Component } from '@angular/core';

interface ContactForm {
  name: string;
  email: string;
  message: string;
}

@Component({
  selector: 'app-about',
  templateUrl: './about.component.html',
  styleUrls: ['./about.component.css']
})
export class AboutComponent {
  contactForm: ContactForm = {
    name: '',
    email: '',
    message: ''
  };

  submitting = false;
  submitSuccess = false;

  onSubmit(): void {
    if (!this.contactForm.name || !this.contactForm.email || !this.contactForm.message) {
      // Announce validation error to screen readers
      const announcement = document.createElement('div');
      announcement.setAttribute('aria-live', 'assertive');
      announcement.textContent = 'Please fill in all required fields';
      document.body.appendChild(announcement);
      setTimeout(() => document.body.removeChild(announcement), 1000);
      return;
    }

    this.submitting = true;

    // Simulate form submission
    setTimeout(() => {
      this.submitting = false;
      this.submitSuccess = true;
      this.contactForm = {
        name: '',
        email: '',
        message: ''
      };
      
      // Reset success message after 5 seconds
      setTimeout(() => {
        this.submitSuccess = false;
      }, 5000);
    }, 1500);
  }
}
