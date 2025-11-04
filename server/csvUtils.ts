import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import type { Customer } from '@shared/schema';

export interface CustomerCSVRow {
  name: string;
  email?: string;
  phone?: string;
  gender?: string;
  birthday?: string;
  address_street?: string;
  address_city?: string;
  address_area?: string;
  address_emirate?: string;
  notes?: string;
}

export function parseCustomersCSV(csvContent: string): CustomerCSVRow[] {
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relaxColumnCount: true,
    bom: true,
  });
  return records;
}

export function customersToCSV(customers: Customer[]): string {
  const rows = customers.map(customer => ({
    name: customer.name,
    email: customer.email || '',
    phone: customer.phone || '',
    gender: customer.gender || '',
    birthday: customer.birthday ? new Date(customer.birthday).toISOString().split('T')[0] : '',
    address_street: (customer.address as any)?.street || '',
    address_city: (customer.address as any)?.city || '',
    address_area: (customer.address as any)?.area || '',
    address_emirate: (customer.address as any)?.emirate || '',
    loyalty_points: customer.loyaltyPoints || 0,
    wallet_balance: customer.walletBalance || '0.00',
    total_spent: customer.totalSpent || '0.00',
    blocked: customer.blocked ? 'Yes' : 'No',
    blocked_reason: customer.blockedReason || '',
    notes: customer.notes || '',
    created_at: new Date(customer.createdAt).toISOString(),
  }));

  return stringify(rows, {
    header: true,
    columns: [
      { key: 'name', header: 'name' },
      { key: 'email', header: 'email' },
      { key: 'phone', header: 'phone' },
      { key: 'gender', header: 'gender' },
      { key: 'birthday', header: 'birthday' },
      { key: 'address_street', header: 'address_street' },
      { key: 'address_city', header: 'address_city' },
      { key: 'address_area', header: 'address_area' },
      { key: 'address_emirate', header: 'address_emirate' },
      { key: 'loyalty_points', header: 'loyalty_points' },
      { key: 'wallet_balance', header: 'wallet_balance' },
      { key: 'total_spent', header: 'total_spent' },
      { key: 'blocked', header: 'blocked' },
      { key: 'blocked_reason', header: 'blocked_reason' },
      { key: 'notes', header: 'notes' },
      { key: 'created_at', header: 'created_at' },
    ],
  });
}
