import { randomUUID } from 'node:crypto';

export function newId(): string {
  return randomUUID();
}

export function nowMs(): number {
  return Date.now();
}
