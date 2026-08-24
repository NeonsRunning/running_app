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
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: {
      account_type: "runner" | "organizer";
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
