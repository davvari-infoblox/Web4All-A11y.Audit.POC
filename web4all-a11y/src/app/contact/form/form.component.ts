import { Component, OnInit } from '@angular/core';

interface FormData {
  name: string;
  email: string;
  message: string;
}

@Component({
  selector: 'app-form',
  templateUrl: './form.component.html',
  styleUrls: ['./form.component.scss']
})
export class FormComponent implements OnInit {
  formData: FormData = {
    name: '',
    email: '',
    message: ''
  };
  submitMessage = '';
  formSubmitted = false;

  ngOnInit() {
    // Set initial focus to name input for keyboard users
    const nameInput = document.getElementById('name');
    if (nameInput) {
      nameInput.focus();
    }
  }

  onSubmit() {
    this.formSubmitted = true;
    if (this.isFormValid()) {
      this.submitMessage = 'Thank you for your message. We will contact you soon!';
      
      // Announce success message to screen readers
      const statusElement = document.querySelector('[role="status"]');
      if (statusElement) {
        statusElement.textContent = this.submitMessage;
      }

      // Reset form after successful submission
      setTimeout(() => {
        this.resetForm();
      }, 3000);
    } else {
      this.submitMessage = 'Please correct the errors in the form.';
    }
  }

  private isFormValid(): boolean {
    return !!(
      this.formData.name &&
      this.formData.email &&
      this.formData.email.includes('@') &&
      this.formData.message
    );
  }

  private resetForm() {
    this.formData = {
      name: '',
      email: '',
      message: ''
    };
    this.formSubmitted = false;
    this.submitMessage = '';
  }

  onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      this.resetForm();
      // Return focus to first input
      const nameInput = document.getElementById('name');
      if (nameInput) {
        nameInput.focus();
      }
    }
  }
}
