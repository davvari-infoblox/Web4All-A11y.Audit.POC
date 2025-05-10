import { Component, Input } from '@angular/core';
import { Product } from '../../services/data.service';

@Component({
  selector: 'app-table-view',
  templateUrl: './table-view.component.html',
  styleUrls: ['./table-view.component.css']
})
export class TableViewComponent {
  @Input() products: Product[] = [];
  @Input() caption: string = '';
  
  sortColumn: keyof Product = 'name';
  sortDirection: 'asc' | 'desc' = 'asc';

  // Helper method to convert sort direction to valid ARIA value
  getAriaSortValue(column: keyof Product): 'none' | 'ascending' | 'descending' {
    if (this.sortColumn !== column) {
      return 'none';
    }
    return this.sortDirection === 'asc' ? 'ascending' : 'descending';
  }

  sortData(column: keyof Product): void {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'asc';
    }

    this.products = [...this.products].sort((a, b) => {
      const aValue = a[column];
      const bValue = b[column];
      const multiplier = this.sortDirection === 'asc' ? 1 : -1;
      
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return (aValue - bValue) * multiplier;
      }
      return String(aValue).localeCompare(String(bValue)) * multiplier;
    });

    // Announce sort to screen readers
    const announcement = document.createElement('div');
    announcement.setAttribute('aria-live', 'polite');
    announcement.textContent = `Table sorted by ${column} in ${this.sortDirection === 'asc' ? 'ascending' : 'descending'} order`;
    document.body.appendChild(announcement);
    setTimeout(() => document.body.removeChild(announcement), 1000);
  }
}
