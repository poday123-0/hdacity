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
      driver_locations: {
        Row: {
          driver_id: string
          heading: number | null
          id: string
          is_on_trip: boolean
          is_online: boolean
          lat: number
          lng: number
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
          end_time: string | null
          id: string
          is_active: boolean
          luggage_threshold: number | null
          name: string
          start_time: string | null
          surcharge_type: string
        }
        Insert: {
          amount?: number
          created_at?: string
          end_time?: string | null
          id?: string
          is_active?: boolean
          luggage_threshold?: number | null
          name: string
          start_time?: string | null
          surcharge_type?: string
        }
        Update: {
          amount?: number
          created_at?: string
          end_time?: string | null
          id?: string
          is_active?: boolean
          luggage_threshold?: number | null
          name?: string
          start_time?: string | null
          surcharge_type?: string
        }
        Relationships: []
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
          description: string
          id: string
          reporter_id: string | null
          status: string
          trip_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          reporter_id?: string | null
          status?: string
          trip_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          reporter_id?: string | null
          status?: string
          trip_id?: string
          updated_at?: string
        }
        Relationships: [
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
          id_card_front_url: string | null
          last_name: string
          legacy_id: number | null
          license_back_url: string | null
          license_front_url: string | null
          monthly_fee: number
          phone_number: string
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
          id_card_front_url?: string | null
          last_name?: string
          legacy_id?: number | null
          license_back_url?: string | null
          license_front_url?: string | null
          monthly_fee?: number
          phone_number: string
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
          id_card_front_url?: string | null
          last_name?: string
          legacy_id?: number | null
          license_back_url?: string | null
          license_front_url?: string | null
          monthly_fee?: number
          phone_number?: string
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
          cancel_reason: string | null
          cancelled_at: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          customer_name: string | null
          customer_phone: string | null
          dispatch_attempt: number | null
          dispatch_type: string | null
          distance_km: number | null
          driver_id: string | null
          dropoff_address: string
          dropoff_lat: number | null
          dropoff_lng: number | null
          duration_minutes: number | null
          estimated_fare: number | null
          fare_type: string
          fare_zone_id: string | null
          feedback_text: string | null
          id: string
          luggage_count: number
          passenger_count: number
          passenger_id: string | null
          pickup_address: string
          pickup_lat: number | null
          pickup_lng: number | null
          rating: number | null
          requested_at: string
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
          cancel_reason?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          dispatch_attempt?: number | null
          dispatch_type?: string | null
          distance_km?: number | null
          driver_id?: string | null
          dropoff_address?: string
          dropoff_lat?: number | null
          dropoff_lng?: number | null
          duration_minutes?: number | null
          estimated_fare?: number | null
          fare_type?: string
          fare_zone_id?: string | null
          feedback_text?: string | null
          id?: string
          luggage_count?: number
          passenger_count?: number
          passenger_id?: string | null
          pickup_address?: string
          pickup_lat?: number | null
          pickup_lng?: number | null
          rating?: number | null
          requested_at?: string
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
          cancel_reason?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          dispatch_attempt?: number | null
          dispatch_type?: string | null
          distance_km?: number | null
          driver_id?: string | null
          dropoff_address?: string
          dropoff_lat?: number | null
          dropoff_lng?: number | null
          duration_minutes?: number | null
          estimated_fare?: number | null
          fare_type?: string
          fare_zone_id?: string | null
          feedback_text?: string | null
          id?: string
          luggage_count?: number
          passenger_count?: number
          passenger_id?: string | null
          pickup_address?: string
          pickup_lat?: number | null
          pickup_lng?: number | null
          rating?: number | null
          requested_at?: string
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
      vehicle_types: {
        Row: {
          base_fare: number
          capacity: number
          created_at: string
          description: string | null
          driver_tax_pct: number
          icon: string | null
          id: string
          image_url: string | null
          is_active: boolean
          map_icon_url: string | null
          minimum_fare: number
          name: string
          passenger_tax_pct: number
          per_hour_rate: number
          per_km_rate: number
          per_minute_rate: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          base_fare?: number
          capacity?: number
          created_at?: string
          description?: string | null
          driver_tax_pct?: number
          icon?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          map_icon_url?: string | null
          minimum_fare?: number
          name: string
          passenger_tax_pct?: number
          per_hour_rate?: number
          per_km_rate?: number
          per_minute_rate?: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          base_fare?: number
          capacity?: number
          created_at?: string
          description?: string | null
          driver_tax_pct?: number
          icon?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          map_icon_url?: string | null
          minimum_fare?: number
          name?: string
          passenger_tax_pct?: number
          per_hour_rate?: number
          per_km_rate?: number
          per_minute_rate?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      vehicles: {
        Row: {
          color: string | null
          created_at: string
          driver_id: string | null
          id: string
          is_active: boolean
          make: string | null
          model: string | null
          plate_number: string
          updated_at: string
          vehicle_type_id: string | null
          year: number | null
        }
        Insert: {
          color?: string | null
          created_at?: string
          driver_id?: string | null
          id?: string
          is_active?: boolean
          make?: string | null
          model?: string | null
          plate_number: string
          updated_at?: string
          vehicle_type_id?: string | null
          year?: number | null
        }
        Update: {
          color?: string | null
          created_at?: string
          driver_id?: string | null
          id?: string
          is_active?: boolean
          make?: string | null
          model?: string | null
          plate_number?: string
          updated_at?: string
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
