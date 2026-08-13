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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      appointment_types: {
        Row: {
          color: Database["public"]["Enums"]["appointment_color"]
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          duration_units: number
          id: string
          name: string
          patient_bookable: boolean
          post_buffer_units: number
          pre_buffer_units: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          color?: Database["public"]["Enums"]["appointment_color"]
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          duration_units: number
          id?: string
          name: string
          patient_bookable?: boolean
          post_buffer_units?: number
          pre_buffer_units?: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          color?: Database["public"]["Enums"]["appointment_color"]
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          duration_units?: number
          id?: string
          name?: string
          patient_bookable?: boolean
          post_buffer_units?: number
          pre_buffer_units?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      feedback_reports: {
        Row: {
          body: string
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          duplicate_of_id: string | null
          id: string
          kind: Database["public"]["Enums"]["feedback_kind"]
          path: string | null
          reporter_id: string
          reporter_role: Database["public"]["Enums"]["app_role"]
          resolved_at: string | null
          resolved_by: string | null
          severity: Database["public"]["Enums"]["feedback_severity"]
          status: Database["public"]["Enums"]["feedback_status"]
          title: string
          triage_note: string | null
          updated_at: string
          user_agent: string | null
          viewport: string | null
        }
        Insert: {
          body: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          duplicate_of_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["feedback_kind"]
          path?: string | null
          reporter_id: string
          reporter_role: Database["public"]["Enums"]["app_role"]
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: Database["public"]["Enums"]["feedback_severity"]
          status?: Database["public"]["Enums"]["feedback_status"]
          title: string
          triage_note?: string | null
          updated_at?: string
          user_agent?: string | null
          viewport?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          duplicate_of_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["feedback_kind"]
          path?: string | null
          reporter_id?: string
          reporter_role?: Database["public"]["Enums"]["app_role"]
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: Database["public"]["Enums"]["feedback_severity"]
          status?: Database["public"]["Enums"]["feedback_status"]
          title?: string
          triage_note?: string | null
          updated_at?: string
          user_agent?: string | null
          viewport?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feedback_reports_duplicate_of_id_fkey"
            columns: ["duplicate_of_id"]
            isOneToOne: false
            referencedRelation: "feedback_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lookup_categories: {
        Row: {
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          id: string
          key: string
          label: string
          sort_order: number
          updated_at: string
          value_kind: Database["public"]["Enums"]["lookup_value_kind"]
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string
          key: string
          label: string
          sort_order?: number
          updated_at?: string
          value_kind?: Database["public"]["Enums"]["lookup_value_kind"]
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string
          key?: string
          label?: string
          sort_order?: number
          updated_at?: string
          value_kind?: Database["public"]["Enums"]["lookup_value_kind"]
        }
        Relationships: []
      }
      lookup_values: {
        Row: {
          amount: number | null
          category_id: string
          code: string | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          id: string
          is_system: boolean
          label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          amount?: number | null
          category_id: string
          code?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          is_system?: boolean
          label: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          amount?: number | null
          category_id?: string
          code?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          is_system?: boolean
          label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lookup_values_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "lookup_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      operatories: {
        Row: {
          created_at: string
          default_provider_id: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          is_hygiene: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_provider_id?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          is_hygiene?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_provider_id?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          is_hygiene?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "operatories_default_provider_id_fkey"
            columns: ["default_provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      patients: {
        Row: {
          address: string | null
          consent_given_at: string | null
          consent_version: string | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          dob: string | null
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          first_name: string
          full_name: string | null
          id: string
          is_provisional: boolean
          last_name: string
          marketing_opt_in: boolean
          marketing_opt_in_at: string | null
          merged_into_id: string | null
          middle_name: string | null
          patient_number: string
          phone: string | null
          phone_norm: string | null
          primary_provider_id: string | null
          profile_id: string | null
          recall_disabled: boolean
          sex: Database["public"]["Enums"]["patient_sex"]
          updated_at: string
        }
        Insert: {
          address?: string | null
          consent_given_at?: string | null
          consent_version?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          dob?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          first_name: string
          full_name?: string | null
          id?: string
          is_provisional?: boolean
          last_name: string
          marketing_opt_in?: boolean
          marketing_opt_in_at?: string | null
          merged_into_id?: string | null
          middle_name?: string | null
          patient_number?: string
          phone?: string | null
          phone_norm?: string | null
          primary_provider_id?: string | null
          profile_id?: string | null
          recall_disabled?: boolean
          sex?: Database["public"]["Enums"]["patient_sex"]
          updated_at?: string
        }
        Update: {
          address?: string | null
          consent_given_at?: string | null
          consent_version?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          dob?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          first_name?: string
          full_name?: string | null
          id?: string
          is_provisional?: boolean
          last_name?: string
          marketing_opt_in?: boolean
          marketing_opt_in_at?: string | null
          merged_into_id?: string | null
          middle_name?: string | null
          patient_number?: string
          phone?: string | null
          phone_norm?: string | null
          primary_provider_id?: string | null
          profile_id?: string | null
          recall_disabled?: boolean
          sex?: Database["public"]["Enums"]["patient_sex"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patients_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patients_primary_provider_id_fkey"
            columns: ["primary_provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patients_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          is_active: boolean
          phone: string | null
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          is_active?: boolean
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: []
      }
      providers: {
        Row: {
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          display_name: string
          id: string
          is_hygiene: boolean
          profile_id: string | null
          sort_order: number
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          display_name: string
          id?: string
          is_hygiene?: boolean
          profile_id?: string | null
          sort_order?: number
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          display_name?: string
          id?: string
          is_hygiene?: boolean
          profile_id?: string | null
          sort_order?: number
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "providers_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_preferences: {
        Row: {
          created_at: string
          font_size: Database["public"]["Enums"]["font_size_pref"]
          gamification: Json
          reduce_motion: boolean
          theme: Database["public"]["Enums"]["theme_pref"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          font_size?: Database["public"]["Enums"]["font_size_pref"]
          gamification?: Json
          reduce_motion?: boolean
          theme?: Database["public"]["Enums"]["theme_pref"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          font_size?: Database["public"]["Enums"]["font_size_pref"]
          gamification?: Json
          reduce_motion?: boolean
          theme?: Database["public"]["Enums"]["theme_pref"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      clinic_branding: {
        Row: {
          brand_hue: number | null
          clinic_name: string | null
          currency: string | null
          logo_url: string | null
          tagline: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      claim_or_create_patient: {
        Args: {
          p_address?: string
          p_consent_version?: string
          p_dob?: string
          p_emergency_name?: string
          p_emergency_phone?: string
          p_first_name: string
          p_last_name: string
          p_marketing_opt_in?: boolean
          p_middle_name?: string
          p_phone?: string
          p_sex?: Database["public"]["Enums"]["patient_sex"]
        }
        Returns: string
      }
      find_patient_duplicates: {
        Args: {
          p_dob?: string
          p_email?: string
          p_exclude?: string
          p_last_name?: string
          p_phone?: string
        }
        Returns: {
          confidence: string
          dob: string
          email: string
          full_name: string
          id: string
          is_provisional: boolean
          match_reason: string
          patient_number: string
          phone: string
        }[]
      }
      jwt_role: { Args: never; Returns: string }
      log_read: {
        Args: { p_entity: string; p_entity_id?: string; p_patient_id?: string }
        Returns: undefined
      }
      update_clinic_branding: {
        Args: {
          p_brand_hue: number
          p_clinic_name: string
          p_logo_url?: string
          p_tagline?: string
        }
        Returns: undefined
      }
      update_own_patient: {
        Args: {
          p_address?: string
          p_dob?: string
          p_emergency_name?: string
          p_emergency_phone?: string
          p_first_name: string
          p_last_name: string
          p_marketing_opt_in?: boolean
          p_middle_name?: string
          p_phone?: string
          p_sex?: Database["public"]["Enums"]["patient_sex"]
        }
        Returns: string
      }
    }
    Enums: {
      app_role: "patient" | "doctor" | "staff" | "superadmin"
      appointment_color:
        | "teal"
        | "indigo"
        | "violet"
        | "sky"
        | "emerald"
        | "amber"
        | "rose"
        | "slate"
      feedback_kind: "bug" | "idea" | "question" | "data_issue"
      feedback_severity: "blocker" | "major" | "minor" | "cosmetic"
      feedback_status:
        | "new"
        | "triaged"
        | "in_progress"
        | "resolved"
        | "wont_fix"
        | "duplicate"
      font_size_pref: "auto" | "standard" | "comfortable" | "large" | "xlarge"
      lookup_value_kind: "label" | "money"
      patient_sex: "female" | "male" | "other" | "undisclosed"
      theme_pref: "light" | "dark" | "system"
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
      app_role: ["patient", "doctor", "staff", "superadmin"],
      appointment_color: [
        "teal",
        "indigo",
        "violet",
        "sky",
        "emerald",
        "amber",
        "rose",
        "slate",
      ],
      feedback_kind: ["bug", "idea", "question", "data_issue"],
      feedback_severity: ["blocker", "major", "minor", "cosmetic"],
      feedback_status: [
        "new",
        "triaged",
        "in_progress",
        "resolved",
        "wont_fix",
        "duplicate",
      ],
      font_size_pref: ["auto", "standard", "comfortable", "large", "xlarge"],
      lookup_value_kind: ["label", "money"],
      patient_sex: ["female", "male", "other", "undisclosed"],
      theme_pref: ["light", "dark", "system"],
    },
  },
} as const
