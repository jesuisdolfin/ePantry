// scripts/addSamplePantryItems.ts
// Run this script in your app to populate the pantry with sample items for testing.
import { useInventoryStore } from '../src/state/inventory';

import type { Unit } from '../src/state/inventory';
const sampleItems: { name: string; qty: number; unit: Unit }[] = [
  { name: 'Egg', qty: 12, unit: 'ea' },
  { name: 'Milk', qty: 1, unit: 'ml' },
  { name: 'Chicken', qty: 2, unit: 'lb' },
  { name: 'Pasta', qty: 500, unit: 'g' },
  { name: 'Tomato', qty: 4, unit: 'ea' },
  { name: 'Onion', qty: 2, unit: 'ea' },
  { name: 'Cheese', qty: 200, unit: 'g' },
  { name: 'Rice', qty: 1, unit: 'lb' },
  { name: 'Beef', qty: 1, unit: 'lb' },
  { name: 'Potato', qty: 5, unit: 'ea' },
  { name: 'Garlic', qty: 3, unit: 'ea' },
  { name: 'Bread', qty: 1, unit: 'ea' },
  { name: 'Coriander', qty: 1, unit: 'ea' },
  { name: 'Shrimp', qty: 10, unit: 'ea' },
  { name: 'Cream', qty: 250, unit: 'ml' },
];

export function addSamplePantryItems() {
  const addOrIncrementByUpc = useInventoryStore.getState().addOrIncrementByUpc;
  sampleItems.forEach(item => {
    addOrIncrementByUpc({ ...item });
  });
  console.log('Sample pantry items added!');
}

// To use: import and call addSamplePantryItems() from your app or a test screen.
