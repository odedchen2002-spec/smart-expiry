/**
 * Status type definitions and utilities
 */

export type ItemStatus = 'ok' | 'soon' | 'expired' | 'resolved';
export type ResolvedReason = 'sold' | 'disposed' | 'other';
export type UserRole = 'owner' | 'manager' | 'staff';
export type EventType = 'scan_add' | 'edit' | 'resolve' | 'delete' | 'notif_sent';

export const ITEM_STATUSES: ItemStatus[] = ['ok', 'soon', 'expired', 'resolved'];
export const RESOLVED_REASONS: ResolvedReason[] = ['sold', 'disposed', 'other'];
export const USER_ROLES: UserRole[] = ['owner', 'manager', 'staff'];

