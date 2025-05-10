import { Component, OnInit, HostListener } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css']
})
export class HomeComponent implements OnInit {
  constructor(private router: Router) { }

  ngOnInit() {
  }

  navigateToProducts(): void {
    this.router.navigate(['/products']);
  }

  products = [
    { id: 1, name: 'Mountain Bike', price: 299.99, img: 'https://assets.specialized.com/i/specialized/95224-00_LEVO-SW-CARBON-G4-GCLMET-REDPRL-BLKPRL_HERO-PDP-DARK?$scom-pdp-gallery-image-premium$&fmt=webp', alt: 'Red mountain bike on trail' },
    { id: 2, name: 'Camping Tent', price: 149.99, img: 'https://m.media-amazon.com/images/I/619kbj04wKL._SL1500_.jpg', alt: 'Green camping tent pitched in woods' },
    { id: 3, name: 'Hiking Boots', price: 89.99, img: 'https://cdn.runrepeat.com/storage/gallery/buying_guide_primary/43/best-lightweight-hiking-boots-20020534-1440.jpg', alt: 'Pair of hiking boots on rock' },
    { id: 4, name: 'Insulated Hiking Jacket', price: 299.99, img: 'https://images-cdn.ubuy.co.in/655e3b22fd52d3432c687547-alomoc-womens-winter-hiking-jacket.jpg', alt: 'Alomoc Waterproof Winter Hiking Jacket' },
    { id: 5, name: 'Adventure Headlamp', price: 149.99, img: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSwJdQfrhMTk4Od0n6hg4AMxgmCdtmyI35bww&s', alt: 'Green camping tent pitched in woods' },
    { id: 6, name: 'Portable Solar Charger', price: 89.99, img: 'https://5.imimg.com/data5/LY/DG/MY-24869305/portable-solar-charger-250x250.jpg', alt: 'Pair of hiking boots on rock' },
    { id: 7, name: 'Trekking Poles (Pair)', price: 299.99, img: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQedaAvToiIc5MAT9lcFGTJD3JYTrruAZ6V0g&s', alt: 'Red mountain bike on trail' },
    { id: 8, name: 'Waterproof Dry Bag', price: 149.99, img: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSD3GWXwbOGVSt4ne0IarWHjTYKV32NDPNZtQ&s', alt: 'Green camping tent pitched in woods' }
  ];

  // smooth scroll to products section
  scrollToProducts() {
    const el = document.getElementById('products');
    el?.scrollIntoView({ behavior: 'smooth' });
  }

  // track keyboard for focus outlines
  isKeyboard = false;
  @HostListener('window:keydown.tab') onKeyDown() { this.isKeyboard = true; }
  @HostListener('window:mousedown') onMouseDown() { this.isKeyboard = false; }
}
