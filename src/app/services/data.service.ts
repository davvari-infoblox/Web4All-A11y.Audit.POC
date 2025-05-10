import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';

export interface Product {
  id: number;
  name: string;
  category: string;
  price: number;
  description: string;
}

@Injectable({
  providedIn: 'root'
})
export class DataService {
  private products: Product[] = [
    {
      id: 1,
      name: "All‑Terrain Mountain Bike",
      category: "Cycling",
      price: 499.99,
      description: "Durable aluminum frame with 27.5” wheels and hydraulic disc brakes"
    },
    {
      id: 2,
      name: "4‑Person Camping Tent",
      category: "Camping",
      price: 199.99,
      description: "Waterproof, quick‑pitch tent with full‑mesh ventilation and UV‑protected rainfly"
    },
    {
      id: 3,
      name: "Insulated Hiking Jacket",
      category: "Clothing",
      price: 149.99,
      description: "Lightweight, water‑resistant jacket with ThermoCore insulation for cold weather"
    },
    {
      id: 4,
      name: "Trekker’s Daypack",
      category: "Backpacks",
      price: 89.99,
      description: "30L ergonomic pack with ventilated back panel and integrated rain cover"
    },
    {
      id: 5,
      name: "Adventure Headlamp",
      category: "Accessories",
      price: 39.99,
      description: "USB‑rechargeable LED headlamp with 800‑lumen output and red‑light mode"
    },
    {
      id: 6,
      name: "Climbing Rope (9.8 mm × 60 m)",
      category: "Climbing",
      price: 129.99,
      description: "Dynamic kernmantle rope rated UIAA for rock and ice climbing"
    },
    {
      id: 7,
      name: "Portable Camping Stove",
      category: "Cooking",
      price: 59.99,
      description: "Compact canister stove with wind‑resistant burner and fold‑out pot supports"
    },
    {
      id: 8,
      name: "Hydration Reservoir (2 L)",
      category: "Hydration",
      price: 34.99,
      description: "Leak‑proof bladder with quick‑connect hose and bite valve"
    },
    {
      id: 9,
      name: "Ultralight Sleeping Bag",
      category: "Camping",
      price: 119.99,
      description: "Three‑season down sleeping bag rated to 20°F, packs to a 5L stuff sack"
    },
    {
      id: 10,
      name: "GPS Handheld Navigator",
      category: "Navigation",
      price: 229.99,
      description: "Rugged handheld GPS with topo maps, 20‑hour battery life, and GLONASS support"
    },
    {
      id: 11,
      name: "Portable Solar Charger",
      category: "Electronics",
      price: 49.99,
      description: "Foldable 10W solar panel with USB‑C output to keep your devices powered off‑grid"
    },
    {
      id: 12,
      name: "Emergency Survival Kit",
      category: "Safety",
      price: 59.99,
      description: "All‑in‑one kit with first‑aid supplies, emergency blanket, whistle, and multi‑tool"
    },
    {
      id: 13,
      name: "Trekking Poles (Pair)",
      category: "Hiking",
      price: 69.99,
      description: "Adjustable aluminum poles with ergonomic grips and anti‑shock springs"
    },
    {
      id: 14,
      name: "Waterproof Dry Bag (20 L)",
      category: "Gear Storage",
      price: 24.99,
      description: "Heavy‑duty roll‑top dry bag to keep your gear safe from water and dust"
    }
  ];
  

  getProducts(): Observable<Product[]> {
    return of(this.products);
  }
}
