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
          avatar_path: string | null;
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
          avatar_path?: string | null;
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
          avatar_path?: string | null;
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
          address_line1: string | null;
          address_line2: string | null;
          address_city: string | null;
          address_state: string | null;
          address_postal_code: string | null;
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
          address_line1?: string | null;
          address_line2?: string | null;
          address_city?: string | null;
          address_state?: string | null;
          address_postal_code?: string | null;
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
          address_line1?: string | null;
          address_line2?: string | null;
          address_city?: string | null;
          address_state?: string | null;
          address_postal_code?: string | null;
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
          anywhere: boolean;
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
          offers_mail: boolean;
          shipping_price: number;
          accepts_donations: boolean;
          donation_recipient: string;
          aid_stations: Json;
          schedule: Json;
          parking: string;
          directions: string;
          image_path: string | null;
          route_image_path: string | null;
          medal_image_path: string | null;
          ath_movil_account_id: string | null;
          /** Runners may submit finish evidence for review. */
          accepts_results: boolean;
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
          anywhere?: boolean;
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
          offers_mail?: boolean;
          shipping_price?: number;
          accepts_donations?: boolean;
          donation_recipient?: string;
          aid_stations?: Json;
          schedule?: Json;
          parking?: string;
          directions?: string;
          image_path?: string | null;
          route_image_path?: string | null;
          medal_image_path?: string | null;
          ath_movil_account_id?: string | null;
          accepts_results?: boolean;
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
          anywhere?: boolean;
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
          offers_mail?: boolean;
          shipping_price?: number;
          accepts_donations?: boolean;
          donation_recipient?: string;
          aid_stations?: Json;
          schedule?: Json;
          parking?: string;
          directions?: string;
          image_path?: string | null;
          route_image_path?: string | null;
          medal_image_path?: string | null;
          ath_movil_account_id?: string | null;
          accepts_results?: boolean;
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
          {
            foreignKeyName: "events_ath_movil_account_id_fkey";
            columns: ["ath_movil_account_id"];
            isOneToOne: false;
            referencedRelation: "ath_movil_accounts";
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
          ships_by_mail: boolean;
          mailing_address: string | null;
          donation: number;
          /** Our fee on this sign-up; $2.90 before the sales tax arrived. */
          service_fee: number;
          /** Puerto Rico sales tax (IVU) included in the amount. */
          sales_tax: number;
          amount: number;
          created_at: string;
          status: Database["public"]["Enums"]["registration_status"];
          hold_expires_at: string | null;
          payment_intent_id: string | null;
          paid_at: string | null;
          confirmation_email_sent_at: string | null;
          payment_method: Database["public"]["Enums"]["payment_method"] | null;
          /** The reference number on the runner's ATH Móvil receipt. */
          payment_reference: string | null;
          /** Set while an ATH Móvil payment waits for an admin's review. */
          payment_submitted_at: string | null;
          payment_reviewed_at: string | null;
          payment_reviewed_by: string | null;
          payment_rejected_at: string | null;
          /** The ATH Móvil account the runner was told to pay. */
          ath_movil_account_id: string | null;
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
          {
            foreignKeyName: "registrations_ath_movil_account_id_fkey";
            columns: ["ath_movil_account_id"];
            isOneToOne: false;
            referencedRelation: "ath_movil_accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      ath_movil_accounts: {
        Row: {
          id: string;
          label: string;
          /** The business path runners search for: "/NeonsRunning". */
          path: string;
          /** Object path in the ath-movil-qr bucket. */
          qr_path: string | null;
          active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          label: string;
          path: string;
          qr_path?: string | null;
          active?: boolean;
          created_at?: string;
        };
        Update: {
          label?: string;
          path?: string;
          qr_path?: string | null;
          active?: boolean;
        };
        Relationships: [];
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
          {
            foreignKeyName: "saved_events_event_slug_fkey";
            columns: ["event_slug"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["slug"];
          },
        ];
      };
      race_results: {
        Row: {
          id: string;
          registration_id: string;
          event_id: string;
          category_id: string;
          runner_id: string;
          finish_seconds: number;
          /** Object path in the private race-evidence bucket. */
          evidence_path: string;
          status: Database["public"]["Enums"]["result_status"];
          /** The organizer's reason, on a rejection. */
          review_note: string | null;
          submitted_at: string;
          reviewed_at: string | null;
          reviewed_by: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: "race_results_registration_id_fkey";
            columns: ["registration_id"];
            isOneToOne: true;
            referencedRelation: "registrations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "race_results_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "race_results_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "event_categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "race_results_runner_id_fkey";
            columns: ["runner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      event_moderation_log: {
        Row: {
          id: string;
          /** Null once the event itself is gone; the name and slug remain. */
          event_id: string | null;
          event_name: string;
          event_slug: string;
          action: "removed" | "restored";
          /** Why an admin removed it; null on a restore. */
          reason: string | null;
          actor_id: string | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: "event_moderation_log_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
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
      search_events: {
        Args: {
          p_today: string;
          p_query?: string;
          p_distances?: Database["public"]["Enums"]["race_distance"][];
          p_types?: Database["public"]["Enums"]["event_type"][];
          p_difficulties?: Database["public"]["Enums"]["event_difficulty"][];
          p_statuses?: string[];
          p_max_price?: number;
          p_until?: string;
          p_sort?: string;
          p_limit?: number;
          p_offset?: number;
        };
        Returns: { id: string; total: number }[];
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
      is_platform_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      submit_ath_movil_payment: {
        Args: { p_registration_id: string; p_reference: string };
        Returns: Database["public"]["Tables"]["registrations"]["Row"];
      };
      ath_movil_review_queue: {
        Args: Record<PropertyKey, never>;
        Returns: {
          id: string;
          event_name: string;
          event_date: string;
          first_name: string;
          last_name: string;
          email: string;
          phone: string;
          amount: number;
          payment_reference: string;
          payment_submitted_at: string;
          /** Null for payments submitted before accounts were rows. */
          account_label: string | null;
          account_path: string | null;
        }[];
      };
      delete_event: {
        Args: { p_event_id: string };
        Returns: Database["public"]["Tables"]["events"]["Row"];
      };
      remove_registration: {
        Args: { p_registration_id: string };
        Returns: Database["public"]["Tables"]["registrations"]["Row"];
      };
      return_registration_to_pending: {
        Args: { p_registration_id: string };
        Returns: Database["public"]["Tables"]["registrations"]["Row"];
      };
      review_ath_movil_payment: {
        Args: { p_registration_id: string; p_approve: boolean };
        Returns: Database["public"]["Tables"]["registrations"]["Row"];
      };
      submit_race_result: {
        Args: {
          p_event_id: string;
          p_finish_seconds: number;
          p_evidence_path: string;
        };
        Returns: Database["public"]["Tables"]["race_results"]["Row"];
      };
      review_race_result: {
        Args: { p_result_id: string; p_accept: boolean; p_note?: string | null };
        Returns: Database["public"]["Tables"]["race_results"]["Row"];
      };
      admin_remove_event: {
        Args: { p_event_id: string; p_reason: string };
        Returns: Database["public"]["Tables"]["events"]["Row"];
      };
      admin_restore_event: {
        Args: { p_event_id: string };
        Returns: Database["public"]["Tables"]["events"]["Row"];
      };
      admin_list_events: {
        Args: { p_query?: string; p_removed?: boolean };
        Returns: {
          id: string;
          slug: string;
          name: string;
          status: Database["public"]["Enums"]["event_status"];
          event_date: string | null;
          last_day: string | null;
          organizer_name: string | null;
          paid_runners: number;
          accepted_results: number;
          payments_under_review: number;
          /** Only for a removed event: its latest removal. */
          removed_at: string | null;
          removal_reason: string | null;
        }[];
      };
      removed_event_visible: {
        Args: { p_event_id: string };
        Returns: boolean;
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
      event_status: "draft" | "published" | "removed";
      registration_status: "pending" | "confirmed";
      payment_method: "stripe" | "ath_movil";
      result_status: "pending" | "accepted" | "rejected";
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
