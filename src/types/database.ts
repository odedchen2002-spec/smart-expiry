/**
 * Database types (to be generated from Supabase)
 * For now, defining manually based on schema
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      businesses: {
        Row: {
          id: string;
          name: string;
          timezone: string;
          notification_time: string;
          currency: string | null;
          notification_days_before: number;
          notification_channels: string[];
          retention_days_after_expiry: number;
          plan: string;
          backup_enabled: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          timezone?: string;
          notification_time?: string;
          currency?: string | null;
          notification_days_before?: number;
          notification_channels?: string[];
          retention_days_after_expiry?: number;
          plan?: string;
          backup_enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          timezone?: string;
          notification_time?: string;
          currency?: string | null;
          notification_days_before?: number;
          notification_channels?: string[];
          retention_days_after_expiry?: number;
          plan?: string;
          backup_enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      business_users: {
        Row: {
          id: string;
          business_id: string;
          user_id: string;
          role: 'owner' | 'manager' | 'staff';
          email: string;
          display_name: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          user_id: string;
          role?: 'owner' | 'manager' | 'staff';
          email: string;
          display_name?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          user_id?: string;
          role?: 'owner' | 'manager' | 'staff';
          email?: string;
          display_name?: string | null;
          created_at?: string;
        };
      };
      locations: {
        Row: {
          id: string;
          owner_id: string | null;
          business_id: string | null;
          name: string;
          display_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id?: string | null;
          business_id?: string | null;
          name: string;
          display_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string | null;
          business_id?: string | null;
          name?: string;
          display_order?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      collaborations: {
        Row: {
          owner_id: string;
          member_id: string;
          role: 'editor' | 'viewer';
          status: 'active' | 'inactive' | 'pending' | 'revoked';
          created_at: string;
        };
        Insert: {
          owner_id: string;
          member_id: string;
          role: 'editor' | 'viewer';
          status?: 'active' | 'inactive' | 'pending' | 'revoked';
          created_at?: string;
        };
        Update: {
          owner_id?: string;
          member_id?: string;
          role?: 'editor' | 'viewer';
          status?: 'active' | 'inactive' | 'pending' | 'revoked';
          created_at?: string;
        };
      };
      products: {
        Row: {
          id: string;
          business_id: string;
          barcode: string | null;
          name: string;
          category: string | null;
          image_url: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          barcode?: string | null;
          name: string;
          category?: string | null;
          image_url?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          barcode?: string | null;
          name?: string;
          category?: string | null;
          image_url?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      items: {
        Row: {
          id: string;
          business_id: string;
          product_id: string | null;
          expiry_date: string;
          status: 'ok' | 'soon' | 'expired' | 'resolved';
          resolved_reason: 'sold' | 'disposed' | 'other' | null;
          note: string | null;
          barcode_snapshot: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          product_id?: string | null;
          expiry_date: string;
          status?: 'ok' | 'soon' | 'expired' | 'resolved';
          resolved_reason?: 'sold' | 'disposed' | 'other' | null;
          note?: string | null;
          barcode_snapshot?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          product_id?: string | null;
          expiry_date?: string;
          status?: 'ok' | 'soon' | 'expired' | 'resolved';
          resolved_reason?: 'sold' | 'disposed' | 'other' | null;
          note?: string | null;
          barcode_snapshot?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      events: {
        Row: {
          id: string;
          business_id: string;
          type: 'scan_add' | 'edit' | 'resolve' | 'delete' | 'notif_sent';
          actor_uid: string | null;
          item_id: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          type: 'scan_add' | 'edit' | 'resolve' | 'delete' | 'notif_sent';
          actor_uid?: string | null;
          item_id?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          type?: 'scan_add' | 'edit' | 'resolve' | 'delete' | 'notif_sent';
          actor_uid?: string | null;
          item_id?: string | null;
          metadata?: Json;
          created_at?: string;
        };
      };
    };
    Views: {
      items_with_details: {
        Row: {
          id: string;
          owner_id: string;
          product_id: string | null;
          expiry_date: string;
          location_id: string;
          status: 'ok' | 'soon' | 'expired' | 'resolved';
          resolved_reason: 'sold' | 'disposed' | 'other' | null;
          note: string | null;
          barcode_snapshot: string | null;
          created_at: string;
          updated_at: string;
          is_plan_locked: boolean;
          product_name: string | null;
          product_barcode: string | null;
          product_category: string | null;
          product_image_url: string | null;
          location_name: string | null;
          location_order: number | null;
        };
      };
      profiles: {
        Row: {
          id: string;
          email: string | null;
          accepted_terms_at: string | null;
          terms_hash: string | null;
          subscription_tier: string | null;
          subscription_valid_until: string | null;
          subscription_created_at: string | null;
          auto_renew: boolean | null;
          username: string | null;
          profile_name: string | null;
          full_name: string | null;
          contact_email: string | null;
          is_profile_complete: boolean;
          ai_analysis_count?: number | null;
          iap_platform?: string | null;
          iap_original_transaction_id?: string | null;
          iap_purchase_token?: string | null;
          iap_receipt?: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          accepted_terms_at?: string | null;
          terms_hash?: string | null;
          subscription_tier?: string | null;
          subscription_valid_until?: string | null;
          subscription_created_at?: string | null;
          auto_renew?: boolean | null;
          username?: string | null;
          business_name?: string | null;
          full_name?: string | null;
          contact_email?: string | null;
          is_profile_complete?: boolean;
          ai_analysis_count?: number | null;
          iap_platform?: string | null;
          iap_original_transaction_id?: string | null;
          iap_purchase_token?: string | null;
          iap_receipt?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string | null;
          accepted_terms_at?: string | null;
          terms_hash?: string | null;
          subscription_tier?: string | null;
          subscription_valid_until?: string | null;
          subscription_created_at?: string | null;
          auto_renew?: boolean | null;
          username?: string | null;
          business_name?: string | null;
          full_name?: string | null;
          contact_email?: string | null;
          is_profile_complete?: boolean;
          ai_analysis_count?: number | null;
          iap_platform?: string | null;
          iap_original_transaction_id?: string | null;
          iap_purchase_token?: string | null;
          iap_receipt?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
  };
}

