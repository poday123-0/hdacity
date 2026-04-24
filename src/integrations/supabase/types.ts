export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      ad_banners: {
        Row: {
          created_at: string
          id: string
          image_url: string
          is_active: boolean
          link_url: string | null
          sort_order: number
          target_audience: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_url: string
          is_active?: boolean
          link_url?: string | null
          sort_order?: number
          target_audience?: string
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string
          is_active?: boolean
          link_url?: string | null
          sort_order?: number
          target_audience?: string
        }
        Relationships: []
      }
      banks: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          logo_url: string | null
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name?: string
        }
        Relationships: []
      }
      center_payments: {
        Row: {
          admin_notes: string | null
          amount: number
          approved_at: string | null
          approved_by: string | null
          created_at: string
          driver_id: string
          id: string
          notes: string | null
          payment_month: string
          slip_url: string | null
          status: string
          submitted_at: string | null
          updated_at: string
          vehicle_id: string | null
          vehicle_type_id: string | null
        }
        Insert: {
          admin_notes?: string | null
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          driver_id: string
          id?: string
          notes?: string | null
          payment_month: string
          slip_url?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
          vehicle_id?: string | null
          vehicle_type_id?: string | null
        }
        Update: {
          admin_notes?: string | null
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          driver_id?: string
          id?: string
          notes?: string | null
          payment_month?: string
          slip_url?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
          vehicle_id?: string | null
          vehicle_type_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "center_payments_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "center_payments_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "center_payments_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "center_payments_vehicle_type_id_fkey"
            columns: ["vehicle_type_id"]
            isOneToOne: false
            referencedRelation: "vehicle_types"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          created_at: string
          discount_pct: number
          fee_free: boolean
          id: string
          is_active: boolean
          logo_url: string | null
          monthly_fee: number
          name: string
        }
        Insert: {
          created_at?: string
          discount_pct?: number
          fee_free?: boolean
          id?: string
          is_active?: boolean
          logo_url?: string | null
          monthly_fee?: number
          name: string
        }
        Update: {
          created_at?: string
          discount_pct?: number
          fee_free?: boolean
          id?: string
          is_active?: boolean
          logo_url?: string | null
          monthly_fee?: number
          name?: string
        }
        Relationships: []
      }
      competition_entries: {
        Row: {
          competition_id: string
          created_at: string
          driver_id: string
          id: string
          prize_awarded: boolean
          prize_id: string | null
          rank: number | null
          trip_count: number
          updated_at: string
        }
        Insert: {
          competition_id: string
          created_at?: string
          driver_id: string
          id?: string
          prize_awarded?: boolean
          prize_id?: string | null
          rank?: number | null
          trip_count?: number
          updated_at?: string
        }
        Update: {
          competition_id?: string
          created_at?: string
          driver_id?: string
          id?: string
          prize_awarded?: boolean
          prize_id?: string | null
          rank?: number | null
          trip_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "competition_entries_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competition_entries_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competition_entries_prize_id_fkey"
            columns: ["prize_id"]
            isOneToOne: false
            referencedRelation: "competition_prizes"
            referencedColumns: ["id"]
          },
        ]
      }
      competition_prizes: {
        Row: {
          badge_label: string | null
          competition_id: string
          created_at: string
          custom_description: string | null
          fee_free_months: number
          id: string
          prize_type: string
          tier_name: string
          tier_rank: number
          wallet_amount: number
        }
        Insert: {
          badge_label?: string | null
          competition_id: string
          created_at?: string
          custom_description?: string | null
          fee_free_months?: number
          id?: string
          prize_type?: string
          tier_name?: string
          tier_rank?: number
          wallet_amount?: number
        }
        Update: {
          badge_label?: string | null
          competition_id?: string
          created_at?: string
          custom_description?: string | null
          fee_free_months?: number
          id?: string
          prize_type?: string
          tier_name?: string
          tier_rank?: number
          wallet_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "competition_prizes_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
        ]
      }
      competitions: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          end_date: string
          id: string
          is_active: boolean
          metric: string
          period_type: string
          rules_text: string | null
          service_location_id: string | null
          start_date: string
          status: string
          title: string
          trip_source: string
          updated_at: string
          vehicle_type_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date: string
          id?: string
          is_active?: boolean
          metric?: string
          period_type?: string
          rules_text?: string | null
          service_location_id?: string | null
          start_date: string
          status?: string
          title: string
          trip_source?: string
          updated_at?: string
          vehicle_type_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date?: string
          id?: string
          is_active?: boolean
          metric?: string
          period_type?: string
          rules_text?: string | null
          service_location_id?: string | null
          start_date?: string
          status?: string
          title?: string
          trip_source?: string
          updated_at?: string
          vehicle_type_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "competitions_service_location_id_fkey"
            columns: ["service_location_id"]
            isOneToOne: false
            referencedRelation: "service_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitions_vehicle_type_id_fkey"
            columns: ["vehicle_type_id"]
            isOneToOne: false
            referencedRelation: "vehicle_types"
            referencedColumns: ["id"]
          },
        ]
      }
      debug_logs: {
        Row: {
          app_version: string | null
          created_at: string
          details: Json
          device: string | null
          driver_id: string | null
          event: string
          id: string
          platform: string | null
          source: string
          trip_id: string | null
        }
        Insert: {
          app_version?: string | null
          created_at?: string
          details?: Json
          device?: string | null
          driver_id?: string | null
          event: string
          id?: string
          platform?: string | null
          source?: string
          trip_id?: string | null
        }
        Update: {
          app_version?: string | null
          created_at?: string
          details?: Json
          device?: string | null
          driver_id?: string | null
          event?: string
          id?: string
          platform?: string | null
          source?: string
          trip_id?: string | null
        }
        Relationships: []
      }
      device_tokens: {
        Row: {
          created_at: string
          device_type: string
          id: string
          is_active: boolean
          token: string
          updated_at: string
          user_id: string
          user_type: string
        }
        Insert: {
          created_at?: string
          device_type?: string
          id?: string
          is_active?: boolean
          token: string
          updated_at?: string
          user_id: string
          user_type?: string
        }
        Update: {
          created_at?: string
          device_type?: string
          id?: string
          is_active?: boolean
          token?: string
          updated_at?: string
          user_id?: string
          user_type?: string
        }
        Relationships: []
      }
      dispatch_duty_sessions: {
        Row: {
          clock_in: string
          clock_out: string | null
          created_at: string
          dispatcher_id: string
          id: string
          ip_address: string | null
        }
        Insert: {
          clock_in?: string
          clock_out?: string | null
          created_at?: string
          dispatcher_id: string
          id?: string
          ip_address?: string | null
        }
        Update: {
          clock_in?: string
          clock_out?: string | null
          created_at?: string
          dispatcher_id?: string
          id?: string
          ip_address?: string | null
        }
        Relationships: []
      }
      driver_bank_accounts: {
        Row: {
          account_name: string
          account_number: string
          bank_name: string
          created_at: string
          driver_id: string
          id: string
          is_active: boolean
          is_primary: boolean
        }
        Insert: {
          account_name?: string
          account_number: string
          bank_name: string
          created_at?: string
          driver_id: string
          id?: string
          is_active?: boolean
          is_primary?: boolean
        }
        Update: {
          account_name?: string
          account_number?: string
          bank_name?: string
          created_at?: string
          driver_id?: string
          id?: string
          is_active?: boolean
          is_primary?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "driver_bank_accounts_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_favara_accounts: {
        Row: {
          created_at: string
          driver_id: string
          favara_id: string
          favara_name: string
          id: string
          is_active: boolean
          is_primary: boolean
        }
        Insert: {
          created_at?: string
          driver_id: string
          favara_id: string
          favara_name?: string
          id?: string
          is_active?: boolean
          is_primary?: boolean
        }
        Update: {
          created_at?: string
          driver_id?: string
          favara_id?: string
          favara_name?: string
          id?: string
          is_active?: boolean
          is_primary?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "driver_favara_accounts_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_locations: {
        Row: {
          driver_id: string
          heading: number | null
          id: string
          is_on_trip: boolean
          is_online: boolean
          lat: number
          lng: number
          session_id: string | null
          updated_at: string
          vehicle_id: string | null
          vehicle_type_id: string | null
        }
        Insert: {
          driver_id: string
          heading?: number | null
          id?: string
          is_on_trip?: boolean
          is_online?: boolean
          lat: number
          lng: number
          session_id?: string | null
          updated_at?: string
          vehicle_id?: string | null
          vehicle_type_id?: string | null
        }
        Update: {
          driver_id?: string
          heading?: number | null
          id?: string
          is_on_trip?: boolean
          is_online?: boolean
          lat?: number
          lng?: number
          session_id?: string | null
          updated_at?: string
          vehicle_id?: string | null
          vehicle_type_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "driver_locations_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_locations_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_locations_vehicle_type_id_fkey"
            columns: ["vehicle_type_id"]
            isOneToOne: false
            referencedRelation: "vehicle_types"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_payments: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          created_at: string
          driver_id: string
          id: string
          notes: string | null
          payment_month: string
          rejection_reason: string | null
          slip_url: string | null
          status: string
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          driver_id: string
          id?: string
          notes?: string | null
          payment_month: string
          rejection_reason?: string | null
          slip_url?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          driver_id?: string
          id?: string
          notes?: string | null
          payment_month?: string
          rejection_reason?: string | null
          slip_url?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_payments_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_payments_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_swipe_accounts: {
        Row: {
          created_at: string
          driver_id: string
          id: string
          is_active: boolean
          is_primary: boolean
          swipe_name: string
          swipe_username: string
        }
        Insert: {
          created_at?: string
          driver_id: string
          id?: string
          is_active?: boolean
          is_primary?: boolean
          swipe_name?: string
          swipe_username: string
        }
        Update: {
          created_at?: string
          driver_id?: string
          id?: string
          is_active?: boolean
          is_primary?: boolean
          swipe_name?: string
          swipe_username?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_swipe_accounts_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_vehicle_types: {
        Row: {
          created_at: string
          driver_id: string
          id: string
          status: string
          vehicle_id: string | null
          vehicle_type_id: string
        }
        Insert: {
          created_at?: string
          driver_id: string
          id?: string
          status?: string
          vehicle_id?: string | null
          vehicle_type_id: string
        }
        Update: {
          created_at?: string
          driver_id?: string
          id?: string
          status?: string
          vehicle_id?: string | null
          vehicle_type_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_vehicle_types_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_vehicle_types_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_vehicle_types_vehicle_type_id_fkey"
            columns: ["vehicle_type_id"]
            isOneToOne: false
            referencedRelation: "vehicle_types"
            referencedColumns: ["id"]
          },
        ]
      }
      emergency_contacts: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          phone_number: string
          relationship: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          phone_number: string
          relationship?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          phone_number?: string
          relationship?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "emergency_contacts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fare_surcharges: {
        Row: {
          amount: number
          created_at: string
          destination_area_id: string | null
          end_time: string | null
          id: string
          is_active: boolean
          luggage_threshold: number | null
          name: string
          start_time: string | null
          surcharge_type: string
          vehicle_type_id: string | null
        }
        Insert: {
          amount?: number
          created_at?: string
          destination_area_id?: string | null
          end_time?: string | null
          id?: string
          is_active?: boolean
          luggage_threshold?: number | null
          name: string
          start_time?: string | null
          surcharge_type?: string
          vehicle_type_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          destination_area_id?: string | null
          end_time?: string | null
          id?: string
          is_active?: boolean
          luggage_threshold?: number | null
          name?: string
          start_time?: string | null
          surcharge_type?: string
          vehicle_type_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fare_surcharges_destination_area_id_fkey"
            columns: ["destination_area_id"]
            isOneToOne: false
            referencedRelation: "service_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fare_surcharges_vehicle_type_id_fkey"
            columns: ["vehicle_type_id"]
            isOneToOne: false
            referencedRelation: "vehicle_types"
            referencedColumns: ["id"]
          },
        ]
      }
      fare_zones: {
        Row: {
          created_at: string
          fixed_fare: number
          from_area: string
          id: string
          is_active: boolean
          name: string
          to_area: string
          vehicle_type_id: string | null
        }
        Insert: {
          created_at?: string
          fixed_fare: number
          from_area: string
          id?: string
          is_active?: boolean
          name: string
          to_area: string
          vehicle_type_id?: string | null
        }
        Update: {
          created_at?: string
          fixed_fare?: number
          from_area?: string
          id?: string
          is_active?: boolean
          name?: string
          to_area?: string
          vehicle_type_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fare_zones_vehicle_type_id_fkey"
            columns: ["vehicle_type_id"]
            isOneToOne: false
            referencedRelation: "vehicle_types"
            referencedColumns: ["id"]
          },
        ]
      }
      lost_item_reports: {
        Row: {
          created_at: string
          created_by: string | null
          description: string
          id: string
          reporter_id: string | null
          reporter_name: string | null
          reporter_phone: string | null
          status: string
          trip_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          reporter_id?: string | null
          reporter_name?: string | null
          reporter_phone?: string | null
          status?: string
          trip_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          reporter_id?: string | null
          reporter_name?: string | null
          reporter_phone?: string | null
          status?: string
          trip_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lost_item_reports_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lost_item_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lost_item_reports_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      named_locations: {
        Row: {
          address: string
          approved_at: string | null
          approved_by: string | null
          created_at: string
          description: string | null
          group_name: string | null
          id: string
          is_active: boolean
          lat: number
          lng: number
          name: string
          road_name: string | null
          status: string
          suggested_by: string | null
          suggested_by_type: string | null
          updated_at: string
        }
        Insert: {
          address?: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          description?: string | null
          group_name?: string | null
          id?: string
          is_active?: boolean
          lat: number
          lng: number
          name: string
          road_name?: string | null
          status?: string
          suggested_by?: string | null
          suggested_by_type?: string | null
          updated_at?: string
        }
        Update: {
          address?: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          description?: string | null
          group_name?: string | null
          id?: string
          is_active?: boolean
          lat?: number
          lng?: number
          name?: string
          road_name?: string | null
          status?: string
          suggested_by?: string | null
          suggested_by_type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "named_locations_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "named_locations_suggested_by_fkey"
            columns: ["suggested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_sounds: {
        Row: {
          category: string
          created_at: string
          file_url: string
          id: string
          is_active: boolean
          is_default: boolean
          name: string
        }
        Insert: {
          category?: string
          created_at?: string
          file_url: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
        }
        Update: {
          category?: string
          created_at?: string
          file_url?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          image_url: string | null
          is_read: boolean
          message: string
          read_by: Json
          scheduled_at: string | null
          sent_at: string | null
          status: string
          target_type: string
          target_user_id: string | null
          title: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          image_url?: string | null
          is_read?: boolean
          message?: string
          read_by?: Json
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string
          target_type?: string
          target_user_id?: string | null
          title: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          image_url?: string | null
          is_read?: boolean
          message?: string
          read_by?: Json
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string
          target_type?: string
          target_user_id?: string | null
          title?: string
        }
        Relationships: []
      }
      otp_codes: {
        Row: {
          code: string
          created_at: string
          expires_at: string
          id: string
          phone_number: string
          verified: boolean
        }
        Insert: {
          code: string
          created_at?: string
          expires_at?: string
          id?: string
          phone_number: string
          verified?: boolean
        }
        Update: {
          code?: string
          created_at?: string
          expires_at?: string
          id?: string
          phone_number?: string
          verified?: boolean
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bank_account_name: string | null
          bank_account_number: string | null
          bank_id: string | null
          bank_name: string | null
          company_id: string | null
          company_name: string | null
          country_code: string
          created_at: string
          email: string | null
          fee_free_until: string | null
          first_name: string
          gender: string | null
          id: string
          id_card_back_url: string | null
          id_card_expiry: string | null
          id_card_front_url: string | null
          last_name: string
          legacy_id: number | null
          license_back_url: string | null
          license_expiry: string | null
          license_front_url: string | null
          monthly_fee: number
          phone_number: string
          rejection_reason: string | null
          status: string
          taxi_permit_back_url: string | null
          taxi_permit_front_url: string | null
          trip_radius_km: number
          trip_sound_id: string | null
          updated_at: string
          user_type: string
        }
        Insert: {
          avatar_url?: string | null
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_id?: string | null
          bank_name?: string | null
          company_id?: string | null
          company_name?: string | null
          country_code?: string
          created_at?: string
          email?: string | null
          fee_free_until?: string | null
          first_name?: string
          gender?: string | null
          id?: string
          id_card_back_url?: string | null
          id_card_expiry?: string | null
          id_card_front_url?: string | null
          last_name?: string
          legacy_id?: number | null
          license_back_url?: string | null
          license_expiry?: string | null
          license_front_url?: string | null
          monthly_fee?: number
          phone_number: string
          rejection_reason?: string | null
          status?: string
          taxi_permit_back_url?: string | null
          taxi_permit_front_url?: string | null
          trip_radius_km?: number
          trip_sound_id?: string | null
          updated_at?: string
          user_type?: string
        }
        Update: {
          avatar_url?: string | null
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_id?: string | null
          bank_name?: string | null
          company_id?: string | null
          company_name?: string | null
          country_code?: string
          created_at?: string
          email?: string | null
          fee_free_until?: string | null
          first_name?: string
          gender?: string | null
          id?: string
          id_card_back_url?: string | null
          id_card_expiry?: string | null
          id_card_front_url?: string | null
          last_name?: string
          legacy_id?: number | null
          license_back_url?: string | null
          license_expiry?: string | null
          license_front_url?: string | null
          monthly_fee?: number
          phone_number?: string
          rejection_reason?: string | null
          status?: string
          taxi_permit_back_url?: string | null
          taxi_permit_front_url?: string | null
          trip_radius_km?: number
          trip_sound_id?: string | null
          updated_at?: string
          user_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_bank_id_fkey"
            columns: ["bank_id"]
            isOneToOne: false
            referencedRelation: "banks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      promo_watermelons: {
        Row: {
          amount: number
          claim_radius_m: number
          claimed_at: string | null
          claimed_by: string | null
          created_at: string
          created_by: string | null
          expires_at: string | null
          fee_free_months: number
          free_trips: number
          icon_url: string | null
          id: string
          lat: number
          lng: number
          promo_type: string
          service_location_id: string | null
          status: string
          target_user_type: string
        }
        Insert: {
          amount?: number
          claim_radius_m?: number
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          fee_free_months?: number
          free_trips?: number
          icon_url?: string | null
          id?: string
          lat: number
          lng: number
          promo_type?: string
          service_location_id?: string | null
          status?: string
          target_user_type?: string
        }
        Update: {
          amount?: number
          claim_radius_m?: number
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          fee_free_months?: number
          free_trips?: number
          icon_url?: string | null
          id?: string
          lat?: number
          lng?: number
          promo_type?: string
          service_location_id?: string | null
          status?: string
          target_user_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "promo_watermelons_service_location_id_fkey"
            columns: ["service_location_id"]
            isOneToOne: false
            referencedRelation: "service_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      road_closures: {
        Row: {
          closure_type: string
          coordinates: Json
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          is_active: boolean
          notes: string | null
          reported_by: string | null
          reported_by_type: string | null
          schedule_days: string[] | null
          schedule_end_time: string | null
          schedule_start_time: string | null
          schedule_type: string
          scheduled_date: string | null
          severity: string
          status: string
          updated_at: string
        }
        Insert: {
          closure_type?: string
          coordinates?: Json
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          reported_by?: string | null
          reported_by_type?: string | null
          schedule_days?: string[] | null
          schedule_end_time?: string | null
          schedule_start_time?: string | null
          schedule_type?: string
          scheduled_date?: string | null
          severity?: string
          status?: string
          updated_at?: string
        }
        Update: {
          closure_type?: string
          coordinates?: Json
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          reported_by?: string | null
          reported_by_type?: string | null
          schedule_days?: string[] | null
          schedule_end_time?: string | null
          schedule_start_time?: string | null
          schedule_type?: string
          scheduled_date?: string | null
          severity?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      saved_locations: {
        Row: {
          address: string
          created_at: string
          icon: string
          id: string
          label: string
          lat: number
          lng: number
          name: string
          user_id: string
        }
        Insert: {
          address?: string
          created_at?: string
          icon?: string
          id?: string
          label?: string
          lat: number
          lng: number
          name: string
          user_id: string
        }
        Update: {
          address?: string
          created_at?: string
          icon?: string
          id?: string
          label?: string
          lat?: number
          lng?: number
          name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_locations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      service_locations: {
        Row: {
          address: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          lat: number
          lng: number
          name: string
          polygon: Json | null
          updated_at: string
        }
        Insert: {
          address?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          lat: number
          lng: number
          name: string
          polygon?: Json | null
          updated_at?: string
        }
        Update: {
          address?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          lat?: number
          lng?: number
          name?: string
          polygon?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      sos_alerts: {
        Row: {
          created_at: string
          id: string
          lat: number | null
          lng: number | null
          notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          trip_id: string | null
          user_id: string
          user_name: string
          user_phone: string
          user_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          lat?: number | null
          lng?: number | null
          notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          trip_id?: string | null
          user_id: string
          user_name?: string
          user_phone?: string
          user_type?: string
        }
        Update: {
          created_at?: string
          id?: string
          lat?: number | null
          lng?: number | null
          notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          trip_id?: string | null
          user_id?: string
          user_name?: string
          user_phone?: string
          user_type?: string
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          description: string | null
          id: string
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          description?: string | null
          id?: string
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          description?: string | null
          id?: string
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      topup_card_batches: {
        Row: {
          amount: number
          card_count: number
          created_at: string
          created_by: string | null
          id: string
          name: string
        }
        Insert: {
          amount?: number
          card_count?: number
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
        }
        Update: {
          amount?: number
          card_count?: number
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      topup_cards: {
        Row: {
          amount: number
          batch_id: string | null
          claimed_at: string | null
          claimed_by: string | null
          code: string
          created_at: string
          id: string
          status: string
        }
        Insert: {
          amount?: number
          batch_id?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          code: string
          created_at?: string
          id?: string
          status?: string
        }
        Update: {
          amount?: number
          batch_id?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          code?: string
          created_at?: string
          id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "topup_cards_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "topup_card_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_declines: {
        Row: {
          declined_at: string
          driver_id: string
          id: string
          trip_id: string
        }
        Insert: {
          declined_at?: string
          driver_id: string
          id?: string
          trip_id: string
        }
        Update: {
          declined_at?: string
          driver_id?: string
          id?: string
          trip_id?: string
        }
        Relationships: []
      }
      trip_dispatch_waves: {
        Row: {
          created_at: string
          driver_ids: string[]
          expires_at: string
          id: string
          is_final_broadcast: boolean
          promoted_at: string | null
          trip_id: string
          wave_number: number
        }
        Insert: {
          created_at?: string
          driver_ids?: string[]
          expires_at: string
          id?: string
          is_final_broadcast?: boolean
          promoted_at?: string | null
          trip_id: string
          wave_number: number
        }
        Update: {
          created_at?: string
          driver_ids?: string[]
          expires_at?: string
          id?: string
          is_final_broadcast?: boolean
          promoted_at?: string | null
          trip_id?: string
          wave_number?: number
        }
        Relationships: []
      }
      trip_messages: {
        Row: {
          created_at: string
          id: string
          message: string
          sender_id: string | null
          sender_type: string
          trip_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          sender_id?: string | null
          sender_type?: string
          trip_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          sender_id?: string | null
          sender_type?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_messages_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_stops: {
        Row: {
          address: string
          arrived_at: string | null
          completed_at: string | null
          created_at: string
          id: string
          lat: number | null
          lng: number | null
          stop_order: number
          trip_id: string
        }
        Insert: {
          address?: string
          arrived_at?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          lat?: number | null
          lng?: number | null
          stop_order?: number
          trip_id: string
        }
        Update: {
          address?: string
          arrived_at?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          lat?: number | null
          lng?: number | null
          stop_order?: number
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_stops_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trips: {
        Row: {
          accepted_at: string | null
          actual_fare: number | null
          arrived_at: string | null
          booking_notes: string | null
          booking_type: string
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          cancelled_by_name: string | null
          cancelled_by_type: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          customer_name: string | null
          customer_phone: string | null
          dispatch_attempt: number | null
          dispatch_type: string | null
          distance_km: number | null
          driver_id: string | null
          driver_rating: number | null
          dropoff_address: string
          dropoff_lat: number | null
          dropoff_lng: number | null
          duration_minutes: number | null
          estimated_fare: number | null
          fare_type: string
          fare_zone_id: string | null
          feedback_text: string | null
          hourly_ended_at: string | null
          hourly_started_at: string | null
          id: string
          is_loss: boolean
          luggage_count: number
          passenger_bonus: number
          passenger_count: number
          passenger_id: string | null
          passenger_lat: number | null
          passenger_lng: number | null
          payment_confirmed_method: string | null
          payment_method: string
          pickup_address: string
          pickup_lat: number | null
          pickup_lng: number | null
          rating: number | null
          requested_at: string
          scheduled_at: string | null
          started_at: string | null
          status: string
          target_driver_id: string | null
          updated_at: string
          vehicle_id: string | null
          vehicle_type_id: string | null
        }
        Insert: {
          accepted_at?: string | null
          actual_fare?: number | null
          arrived_at?: string | null
          booking_notes?: string | null
          booking_type?: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_by_name?: string | null
          cancelled_by_type?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          dispatch_attempt?: number | null
          dispatch_type?: string | null
          distance_km?: number | null
          driver_id?: string | null
          driver_rating?: number | null
          dropoff_address?: string
          dropoff_lat?: number | null
          dropoff_lng?: number | null
          duration_minutes?: number | null
          estimated_fare?: number | null
          fare_type?: string
          fare_zone_id?: string | null
          feedback_text?: string | null
          hourly_ended_at?: string | null
          hourly_started_at?: string | null
          id?: string
          is_loss?: boolean
          luggage_count?: number
          passenger_bonus?: number
          passenger_count?: number
          passenger_id?: string | null
          passenger_lat?: number | null
          passenger_lng?: number | null
          payment_confirmed_method?: string | null
          payment_method?: string
          pickup_address?: string
          pickup_lat?: number | null
          pickup_lng?: number | null
          rating?: number | null
          requested_at?: string
          scheduled_at?: string | null
          started_at?: string | null
          status?: string
          target_driver_id?: string | null
          updated_at?: string
          vehicle_id?: string | null
          vehicle_type_id?: string | null
        }
        Update: {
          accepted_at?: string | null
          actual_fare?: number | null
          arrived_at?: string | null
          booking_notes?: string | null
          booking_type?: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_by_name?: string | null
          cancelled_by_type?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          dispatch_attempt?: number | null
          dispatch_type?: string | null
          distance_km?: number | null
          driver_id?: string | null
          driver_rating?: number | null
          dropoff_address?: string
          dropoff_lat?: number | null
          dropoff_lng?: number | null
          duration_minutes?: number | null
          estimated_fare?: number | null
          fare_type?: string
          fare_zone_id?: string | null
          feedback_text?: string | null
          hourly_ended_at?: string | null
          hourly_started_at?: string | null
          id?: string
          is_loss?: boolean
          luggage_count?: number
          passenger_bonus?: number
          passenger_count?: number
          passenger_id?: string | null
          passenger_lat?: number | null
          passenger_lng?: number | null
          payment_confirmed_method?: string | null
          payment_method?: string
          pickup_address?: string
          pickup_lat?: number | null
          pickup_lng?: number | null
          rating?: number | null
          requested_at?: string
          scheduled_at?: string | null
          started_at?: string | null
          status?: string
          target_driver_id?: string | null
          updated_at?: string
          vehicle_id?: string | null
          vehicle_type_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trips_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_fare_zone_id_fkey"
            columns: ["fare_zone_id"]
            isOneToOne: false
            referencedRelation: "fare_zones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_passenger_id_fkey"
            columns: ["passenger_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_vehicle_type_id_fkey"
            columns: ["vehicle_type_id"]
            isOneToOne: false
            referencedRelation: "vehicle_types"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          permissions: Json
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          permissions?: Json
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          permissions?: Json
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vehicle_makes: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          logo_url: string | null
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name?: string
        }
        Relationships: []
      }
      vehicle_models: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          make_id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          make_id: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          make_id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_models_make_id_fkey"
            columns: ["make_id"]
            isOneToOne: false
            referencedRelation: "vehicle_makes"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_types: {
        Row: {
          base_fare: number
          capacity: number
          center_fee: number
          created_at: string
          description: string | null
          driver_tax_pct: number
          icon: string | null
          id: string
          image_url: string | null
          is_active: boolean
          map_icon_url: string | null
          minimum_fare: number
          monthly_fee: number
          name: string
          passenger_tax_pct: number
          per_hour_rate: number
          per_km_rate: number
          per_minute_rate: number
          pre_booking_fee: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          base_fare?: number
          capacity?: number
          center_fee?: number
          created_at?: string
          description?: string | null
          driver_tax_pct?: number
          icon?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          map_icon_url?: string | null
          minimum_fare?: number
          monthly_fee?: number
          name: string
          passenger_tax_pct?: number
          per_hour_rate?: number
          per_km_rate?: number
          per_minute_rate?: number
          pre_booking_fee?: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          base_fare?: number
          capacity?: number
          center_fee?: number
          created_at?: string
          description?: string | null
          driver_tax_pct?: number
          icon?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          map_icon_url?: string | null
          minimum_fare?: number
          monthly_fee?: number
          name?: string
          passenger_tax_pct?: number
          per_hour_rate?: number
          per_km_rate?: number
          per_minute_rate?: number
          pre_booking_fee?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      vehicles: {
        Row: {
          app_fee_comment: string | null
          blocked_until: string | null
          center_code: string | null
          center_fee_exempt: boolean
          center_fee_note: string | null
          color: string | null
          created_at: string
          custom_center_fee: number | null
          driver_id: string | null
          id: string
          image_url: string | null
          insurance_url: string | null
          is_active: boolean
          make: string | null
          model: string | null
          pays_app_fee: boolean
          plate_number: string
          registration_url: string | null
          rejection_reason: string | null
          updated_at: string
          vehicle_status: string
          vehicle_type_id: string | null
          year: number | null
        }
        Insert: {
          app_fee_comment?: string | null
          blocked_until?: string | null
          center_code?: string | null
          center_fee_exempt?: boolean
          center_fee_note?: string | null
          color?: string | null
          created_at?: string
          custom_center_fee?: number | null
          driver_id?: string | null
          id?: string
          image_url?: string | null
          insurance_url?: string | null
          is_active?: boolean
          make?: string | null
          model?: string | null
          pays_app_fee?: boolean
          plate_number: string
          registration_url?: string | null
          rejection_reason?: string | null
          updated_at?: string
          vehicle_status?: string
          vehicle_type_id?: string | null
          year?: number | null
        }
        Update: {
          app_fee_comment?: string | null
          blocked_until?: string | null
          center_code?: string | null
          center_fee_exempt?: boolean
          center_fee_note?: string | null
          color?: string | null
          created_at?: string
          custom_center_fee?: number | null
          driver_id?: string | null
          id?: string
          image_url?: string | null
          insurance_url?: string | null
          is_active?: boolean
          make?: string | null
          model?: string | null
          pays_app_fee?: boolean
          plate_number?: string
          registration_url?: string | null
          rejection_reason?: string | null
          updated_at?: string
          vehicle_status?: string
          vehicle_type_id?: string | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicles_vehicle_type_id_fkey"
            columns: ["vehicle_type_id"]
            isOneToOne: false
            referencedRelation: "vehicle_types"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_transactions: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          processed_at: string | null
          processed_by: string | null
          proof_url: string | null
          reason: string
          status: string
          trip_id: string | null
          type: string
          user_id: string
          wallet_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          processed_at?: string | null
          processed_by?: string | null
          proof_url?: string | null
          reason?: string
          status?: string
          trip_id?: string | null
          type?: string
          user_id: string
          wallet_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          processed_at?: string | null
          processed_by?: string | null
          proof_url?: string | null
          reason?: string
          status?: string
          trip_id?: string | null
          type?: string
          user_id?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_transactions_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_transactions_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_withdrawals: {
        Row: {
          admin_notes: string | null
          amount: number
          created_at: string
          id: string
          notes: string | null
          processed_at: string | null
          processed_by: string | null
          status: string
          user_id: string
          wallet_id: string
        }
        Insert: {
          admin_notes?: string | null
          amount: number
          created_at?: string
          id?: string
          notes?: string | null
          processed_at?: string | null
          processed_by?: string | null
          status?: string
          user_id: string
          wallet_id: string
        }
        Update: {
          admin_notes?: string | null
          amount?: number
          created_at?: string
          id?: string
          notes?: string | null
          processed_at?: string | null
          processed_by?: string | null
          status?: string
          user_id?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_withdrawals_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      wallets: {
        Row: {
          balance: number
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user" | "dispatcher"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user", "dispatcher"],
    },
  },
} as const
