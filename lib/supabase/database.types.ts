/**
 * The database as TypeScript sees it.
 *
 * Kept in the generated shape so it can be replaced wholesale once the schema
 * grows past hand-editing:
 *
 *     npm run db:types
 *
 * Every client is parameterised with this type, which is what makes
 * `supabase.from("profiles").select()` return rows instead of `any` and what
 * catches a column rename at the type level rather than at runtime.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          handle: string;
          full_name: string;
          account_type: Database["public"]["Enums"]["account_type"];
          avatar_url: string | null;
          bio: string | null;
          city: string | null;
          club: string | null;
          is_public: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          handle: string;
          full_name: string;
          account_type?: Database["public"]["Enums"]["account_type"];
          avatar_url?: string | null;
          bio?: string | null;
          city?: string | null;
          club?: string | null;
          is_public?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          handle?: string;
          full_name?: string;
          account_type?: Database["public"]["Enums"]["account_type"];
          avatar_url?: string | null;
          bio?: string | null;
          city?: string | null;
          club?: string | null;
          is_public?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      profile_private: {
        Row: {
          id: string;
          birth_date: string | null;
          gender: Database["public"]["Enums"]["profile_gender"] | null;
          shirt_size: Database["public"]["Enums"]["shirt_size"] | null;
          phone: string | null;
          emergency_contact_name: string | null;
          emergency_contact_phone: string | null;
          locale: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          birth_date?: string | null;
          gender?: Database["public"]["Enums"]["profile_gender"] | null;
          shirt_size?: Database["public"]["Enums"]["shirt_size"] | null;
          phone?: string | null;
          emergency_contact_name?: string | null;
          emergency_contact_phone?: string | null;
          locale?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          birth_date?: string | null;
          gender?: Database["public"]["Enums"]["profile_gender"] | null;
          shirt_size?: Database["public"]["Enums"]["shirt_size"] | null;
          phone?: string | null;
          emergency_contact_name?: string | null;
          emergency_contact_phone?: string | null;
          locale?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profile_private_id_fkey";
            columns: ["id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      events: {
        Row: {
          id: string;
          organizer_id: string;
          slug: string;
          status: Database["public"]["Enums"]["event_status"];
          published_at: string | null;
          name: string;
          description: string;
          type: Database["public"]["Enums"]["event_type"] | null;
          event_date: string | null;
          end_date: string | null;
          last_day: string | null;
          start_time: string | null;
          registration_opens: string | null;
          registration_closes: string | null;
          venue: string | null;
          address: string;
          city: string | null;
          region: string;
          postal_code: string | null;
          country: string;
          difficulty: Database["public"]["Enums"]["event_difficulty"];
          terrain: string;
          elevation_gain: number;
          cutoff: string;
          capacity: number | null;
          minimum_age: number;
          maximum_age: number | null;
          shirt_sizes: Database["public"]["Enums"]["shirt_size"][];
          offers_shirt: boolean;
          shirt_price: number;
          offers_photos: boolean;
          photo_price: number;
          accepts_donations: boolean;
          donation_recipient: string;
          aid_stations: Json;
          schedule: Json;
          parking: string;
          directions: string;
          image_path: string | null;
          route_image_path: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organizer_id: string;
          slug: string;
          status?: Database["public"]["Enums"]["event_status"];
          published_at?: string | null;
          name: string;
          description?: string;
          type?: Database["public"]["Enums"]["event_type"] | null;
          event_date?: string | null;
          end_date?: string | null;
          start_time?: string | null;
          registration_opens?: string | null;
          registration_closes?: string | null;
          venue?: string | null;
          address?: string;
          city?: string | null;
          region?: string;
          postal_code?: string | null;
          country?: string;
          difficulty?: Database["public"]["Enums"]["event_difficulty"];
          terrain?: string;
          elevation_gain?: number;
          cutoff?: string;
          capacity?: number | null;
          minimum_age?: number;
          maximum_age?: number | null;
          shirt_sizes?: Database["public"]["Enums"]["shirt_size"][];
          offers_shirt?: boolean;
          shirt_price?: number;
          offers_photos?: boolean;
          photo_price?: number;
          accepts_donations?: boolean;
          donation_recipient?: string;
          aid_stations?: Json;
          schedule?: Json;
          parking?: string;
          directions?: string;
          image_path?: string | null;
          route_image_path?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organizer_id?: string;
          slug?: string;
          status?: Database["public"]["Enums"]["event_status"];
          published_at?: string | null;
          name?: string;
          description?: string;
          type?: Database["public"]["Enums"]["event_type"] | null;
          event_date?: string | null;
          end_date?: string | null;
          start_time?: string | null;
          registration_opens?: string | null;
          registration_closes?: string | null;
          venue?: string | null;
          address?: string;
          city?: string | null;
          region?: string;
          postal_code?: string | null;
          country?: string;
          difficulty?: Database["public"]["Enums"]["event_difficulty"];
          terrain?: string;
          elevation_gain?: number;
          cutoff?: string;
          capacity?: number | null;
          minimum_age?: number;
          maximum_age?: number | null;
          shirt_sizes?: Database["public"]["Enums"]["shirt_size"][];
          offers_shirt?: boolean;
          shirt_price?: number;
          offers_photos?: boolean;
          photo_price?: number;
          accepts_donations?: boolean;
          donation_recipient?: string;
          aid_stations?: Json;
          schedule?: Json;
          parking?: string;
          directions?: string;
          image_path?: string | null;
          route_image_path?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "events_organizer_id_fkey";
            columns: ["organizer_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      event_categories: {
        Row: {
          id: string;
          event_id: string;
          distance: Database["public"]["Enums"]["race_distance"];
          distance_km: number;
          price: number;
          capacity: number;
          start_time: string | null;
          position: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          event_id: string;
          distance: Database["public"]["Enums"]["race_distance"];
          distance_km: number;
          price: number;
          capacity: number;
          start_time?: string | null;
          position?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          event_id?: string;
          distance?: Database["public"]["Enums"]["race_distance"];
          distance_km?: number;
          price?: number;
          capacity?: number;
          start_time?: string | null;
          position?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "event_categories_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
        ];
      };
      registrations: {
        Row: {
          id: string;
          event_id: string;
          category_id: string;
          runner_id: string;
          /** Null until the payment is confirmed. */
          bib: number | null;
          first_name: string;
          last_name: string;
          email: string;
          phone: string;
          birth_date: string;
          gender: Database["public"]["Enums"]["profile_gender"];
          emergency_contact_name: string;
          emergency_contact_phone: string;
          club: string | null;
          shirt_size: Database["public"]["Enums"]["shirt_size"] | null;
          wants_photos: boolean;
          donation: number;
          amount: number;
          created_at: string;
          status: Database["public"]["Enums"]["registration_status"];
          hold_expires_at: string | null;
          payment_intent_id: string | null;
          paid_at: string | null;
          confirmation_email_sent_at: string | null;
        };
        Insert: never;
        /**
         * Service role only: the server records the PaymentIntent it opened
         * and when the confirmation email went out.
         */
        Update: {
          payment_intent_id?: string | null;
          confirmation_email_sent_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "registrations_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "registrations_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "event_categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "registrations_runner_id_fkey";
            columns: ["runner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      saved_events: {
        Row: {
          runner_id: string;
          event_slug: string;
          created_at: string;
        };
        Insert: {
          runner_id?: string;
          event_slug: string;
          created_at?: string;
        };
        Update: never;
        Relationships: [
          {
            foreignKeyName: "saved_events_runner_id_fkey";
            columns: ["runner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      is_organizer: { Args: Record<PropertyKey, never>; Returns: boolean };
      platform_stats: {
        Args: Record<PropertyKey, never>;
        Returns: {
          races: number;
          runners: number;
          organizers: number;
          clubs: number;
        }[];
      };
      registration_counts: {
        Args: { p_event_ids: string[] };
        Returns: { category_id: string; registered: number }[];
      };
      save_event: {
        Args: {
          p_id: string | null;
          p_slug: string;
          p_event: Json;
          p_categories: Json;
        };
        Returns: Database["public"]["Tables"]["events"]["Row"];
      };
      register_for_event: {
        Args: { p_category_id: string; p_details: Json };
        Returns: Database["public"]["Tables"]["registrations"]["Row"];
      };
      confirm_registration_payment: {
        Args: {
          p_registration_id: string;
          p_payment_intent_id: string;
          p_amount_cents: number;
        };
        Returns: Database["public"]["Tables"]["registrations"]["Row"];
      };
    };
    Enums: {
      account_type: "runner" | "organizer";
      event_type:
        | "Road Race"
        | "Trail"
        | "Track"
        | "Fun Run"
        | "Charity Run"
        | "Virtual Race"
        | "Relay"
        | "Kids Race";
      race_distance:
        | "1 Mile"
        | "3K"
        | "5K"
        | "10K"
        | "Half Marathon"
        | "Marathon"
        | "Ultra";
      event_difficulty: "Easy" | "Moderate" | "Hard";
      event_status: "draft" | "published";
      registration_status: "pending" | "confirmed";
      profile_gender: "f" | "m" | "x";
      shirt_size: "XS" | "S" | "M" | "L" | "XL" | "XXL";
    };
    CompositeTypes: { [_ in never]: never };
  };
};

type PublicSchema = Database["public"];

export type Tables<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Row"];

export type TablesInsert<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Insert"];

export type TablesUpdate<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Update"];

export type Enums<T extends keyof PublicSchema["Enums"]> =
  PublicSchema["Enums"][T];
