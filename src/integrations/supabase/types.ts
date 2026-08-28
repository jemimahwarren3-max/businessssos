export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15";
  };
  public: {
    Tables: {
      admin_audit_log: {
        Row: {
          action: string;
          business_id: string | null;
          created_at: string;
          detail: Json | null;
          id: string;
        };
        Insert: {
          action: string;
          business_id?: string | null;
          created_at?: string;
          detail?: Json | null;
          id?: string;
        };
        Update: {
          action?: string;
          business_id?: string | null;
          created_at?: string;
          detail?: Json | null;
          id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "admin_audit_log_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_logs: {
        Row: {
          action: string;
          business_id: string;
          created_at: string;
          entity_id: string | null;
          entity_type: string;
          id: string;
          ip_address: string | null;
          new_values: Json | null;
          old_values: Json | null;
          result: string;
          summary: string | null;
          user_agent: string | null;
          user_id: string | null;
        };
        Insert: {
          action: string;
          business_id: string;
          created_at?: string;
          entity_id?: string | null;
          entity_type: string;
          id?: string;
          ip_address?: string | null;
          new_values?: Json | null;
          old_values?: Json | null;
          result?: string;
          summary?: string | null;
          user_agent?: string | null;
          user_id?: string | null;
        };
        Update: {
          action?: string;
          business_id?: string;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string;
          id?: string;
          ip_address?: string | null;
          new_values?: Json | null;
          old_values?: Json | null;
          result?: string;
          summary?: string | null;
          user_agent?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "audit_logs_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      business_counters: {
        Row: {
          business_id: string;
          invoice_seq: number;
          po_seq: number;
          quote_seq: number;
          sale_seq: number;
        };
        Insert: {
          business_id: string;
          invoice_seq?: number;
          po_seq?: number;
          quote_seq?: number;
          sale_seq?: number;
        };
        Update: {
          business_id?: string;
          invoice_seq?: number;
          po_seq?: number;
          quote_seq?: number;
          sale_seq?: number;
        };
        Relationships: [
          {
            foreignKeyName: "business_counters_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: true;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      business_invites: {
        Row: {
          accepted_at: string | null;
          accepted_by: string | null;
          business_id: string;
          created_at: string;
          created_by: string;
          expires_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          status: string;
          token: string;
        };
        Insert: {
          accepted_at?: string | null;
          accepted_by?: string | null;
          business_id: string;
          created_at?: string;
          created_by: string;
          expires_at: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          status?: string;
          token: string;
        };
        Update: {
          accepted_at?: string | null;
          accepted_by?: string | null;
          business_id?: string;
          created_at?: string;
          created_by?: string;
          expires_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          status?: string;
          token?: string;
        };
        Relationships: [
          {
            foreignKeyName: "business_invites_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      business_members: {
        Row: {
          business_id: string;
          created_at: string;
          id: string;
          invited_by: string | null;
          is_active: boolean;
          role: Database["public"]["Enums"]["app_role"];
          staff_name: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          business_id: string;
          created_at?: string;
          id?: string;
          invited_by?: string | null;
          is_active?: boolean;
          role?: Database["public"]["Enums"]["app_role"];
          staff_name?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          business_id?: string;
          created_at?: string;
          id?: string;
          invited_by?: string | null;
          is_active?: boolean;
          role?: Database["public"]["Enums"]["app_role"];
          staff_name?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "business_members_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      business_settings: {
        Row: {
          allow_negative_stock: boolean;
          business_id: string;
          created_at: string;
          invoice_notes: string | null;
          invoice_terms: string | null;
          low_stock_threshold: number;
          receipt_footer: string | null;
          updated_at: string;
        };
        Insert: {
          allow_negative_stock?: boolean;
          business_id: string;
          created_at?: string;
          invoice_notes?: string | null;
          invoice_terms?: string | null;
          low_stock_threshold?: number;
          receipt_footer?: string | null;
          updated_at?: string;
        };
        Update: {
          allow_negative_stock?: boolean;
          business_id?: string;
          created_at?: string;
          invoice_notes?: string | null;
          invoice_terms?: string | null;
          low_stock_threshold?: number;
          receipt_footer?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "business_settings_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: true;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      businesses: {
        Row: {
          address: string | null;
          business_type: Database["public"]["Enums"]["business_type"];
          created_at: string;
          created_by: string;
          currency: string;
          default_tax_rate: number;
          email: string | null;
          id: string;
          invoice_prefix: string;
          logo_url: string | null;
          name: string;
          onboarding_completed: boolean;
          phone: string | null;
          quote_prefix: string;
          staff_code: string | null;
          staff_password_hash: string | null;
          updated_at: string;
        };
        Insert: {
          address?: string | null;
          business_type?: Database["public"]["Enums"]["business_type"];
          created_at?: string;
          created_by: string;
          currency?: string;
          default_tax_rate?: number;
          email?: string | null;
          id?: string;
          invoice_prefix?: string;
          logo_url?: string | null;
          name: string;
          onboarding_completed?: boolean;
          phone?: string | null;
          quote_prefix?: string;
          staff_code?: string | null;
          staff_password_hash?: string | null;
          updated_at?: string;
        };
        Update: {
          address?: string | null;
          business_type?: Database["public"]["Enums"]["business_type"];
          created_at?: string;
          created_by?: string;
          currency?: string;
          default_tax_rate?: number;
          email?: string | null;
          id?: string;
          invoice_prefix?: string;
          logo_url?: string | null;
          name?: string;
          onboarding_completed?: boolean;
          phone?: string | null;
          quote_prefix?: string;
          staff_code?: string | null;
          staff_password_hash?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      categories: {
        Row: {
          business_id: string;
          created_at: string;
          description: string | null;
          id: string;
          name: string;
          updated_at: string;
        };
        Insert: {
          business_id: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          name: string;
          updated_at?: string;
        };
        Update: {
          business_id?: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          name?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "categories_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      customers: {
        Row: {
          address: string | null;
          business_id: string;
          created_at: string;
          deleted_at: string | null;
          email: string | null;
          id: string;
          name: string;
          notes: string | null;
          outstanding_balance: number;
          phone: string | null;
          updated_at: string;
        };
        Insert: {
          address?: string | null;
          business_id: string;
          created_at?: string;
          deleted_at?: string | null;
          email?: string | null;
          id?: string;
          name: string;
          notes?: string | null;
          outstanding_balance?: number;
          phone?: string | null;
          updated_at?: string;
        };
        Update: {
          address?: string | null;
          business_id?: string;
          created_at?: string;
          deleted_at?: string | null;
          email?: string | null;
          id?: string;
          name?: string;
          notes?: string | null;
          outstanding_balance?: number;
          phone?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "customers_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      expenses: {
        Row: {
          amount: number;
          business_id: string;
          category: string;
          created_at: string;
          created_by: string | null;
          description: string | null;
          expense_date: string;
          id: string;
          method: Database["public"]["Enums"]["payment_method"];
          receipt_url: string | null;
          updated_at: string;
          vendor: string | null;
        };
        Insert: {
          amount: number;
          business_id: string;
          category?: string;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          expense_date?: string;
          id?: string;
          method?: Database["public"]["Enums"]["payment_method"];
          receipt_url?: string | null;
          updated_at?: string;
          vendor?: string | null;
        };
        Update: {
          amount?: number;
          business_id?: string;
          category?: string;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          expense_date?: string;
          id?: string;
          method?: Database["public"]["Enums"]["payment_method"];
          receipt_url?: string | null;
          updated_at?: string;
          vendor?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "expenses_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      inventory_movements: {
        Row: {
          business_id: string;
          created_at: string;
          created_by: string | null;
          id: string;
          movement_type: Database["public"]["Enums"]["movement_type"];
          product_id: string | null;
          quantity: number;
          reason: string | null;
          reference_id: string | null;
          reference_type: string | null;
          stock_after: number;
          stock_before: number;
        };
        Insert: {
          business_id: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          movement_type: Database["public"]["Enums"]["movement_type"];
          product_id?: string | null;
          quantity: number;
          reason?: string | null;
          reference_id?: string | null;
          reference_type?: string | null;
          stock_after: number;
          stock_before: number;
        };
        Update: {
          business_id?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          movement_type?: Database["public"]["Enums"]["movement_type"];
          product_id?: string | null;
          quantity?: number;
          reason?: string | null;
          reference_id?: string | null;
          reference_type?: string | null;
          stock_after?: number;
          stock_before?: number;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_movements_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_movements_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      invoice_items: {
        Row: {
          business_id: string;
          created_at: string;
          discount: number;
          id: string;
          invoice_id: string;
          line_total: number;
          name: string;
          product_id: string | null;
          quantity: number;
          tax: number;
          unit_price: number;
        };
        Insert: {
          business_id: string;
          created_at?: string;
          discount?: number;
          id?: string;
          invoice_id: string;
          line_total: number;
          name: string;
          product_id?: string | null;
          quantity: number;
          tax?: number;
          unit_price: number;
        };
        Update: {
          business_id?: string;
          created_at?: string;
          discount?: number;
          id?: string;
          invoice_id?: string;
          line_total?: number;
          name?: string;
          product_id?: string | null;
          quantity?: number;
          tax?: number;
          unit_price?: number;
        };
        Relationships: [
          {
            foreignKeyName: "invoice_items_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invoice_items_invoice_id_fkey";
            columns: ["invoice_id"];
            isOneToOne: false;
            referencedRelation: "invoices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invoice_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      invoices: {
        Row: {
          amount_paid: number;
          business_id: string;
          created_at: string;
          created_by: string | null;
          customer_id: string | null;
          discount: number;
          due_date: string | null;
          id: string;
          idempotency_key: string | null;
          invoice_number: string;
          issue_date: string;
          notes: string | null;
          status: Database["public"]["Enums"]["doc_status"];
          subtotal: number;
          tax: number;
          terms: string | null;
          total: number;
          updated_at: string;
        };
        Insert: {
          amount_paid?: number;
          business_id: string;
          created_at?: string;
          created_by?: string | null;
          customer_id?: string | null;
          discount?: number;
          due_date?: string | null;
          id?: string;
          idempotency_key?: string | null;
          invoice_number: string;
          issue_date?: string;
          notes?: string | null;
          status?: Database["public"]["Enums"]["doc_status"];
          subtotal?: number;
          tax?: number;
          terms?: string | null;
          total?: number;
          updated_at?: string;
        };
        Update: {
          amount_paid?: number;
          business_id?: string;
          created_at?: string;
          created_by?: string | null;
          customer_id?: string | null;
          discount?: number;
          due_date?: string | null;
          id?: string;
          idempotency_key?: string | null;
          invoice_number?: string;
          issue_date?: string;
          notes?: string | null;
          status?: Database["public"]["Enums"]["doc_status"];
          subtotal?: number;
          tax?: number;
          terms?: string | null;
          total?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "invoices_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invoices_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
        ];
      };
      legal_acceptances: {
        Row: {
          accepted_at: string;
          id: string;
          ip_address: string | null;
          privacy_version: string;
          terms_version: string;
          user_id: string;
        };
        Insert: {
          accepted_at?: string;
          id?: string;
          ip_address?: string | null;
          privacy_version: string;
          terms_version: string;
          user_id: string;
        };
        Update: {
          accepted_at?: string;
          id?: string;
          ip_address?: string | null;
          privacy_version?: string;
          terms_version?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      notifications: {
        Row: {
          business_id: string;
          created_at: string;
          id: string;
          is_read: boolean;
          link: string | null;
          message: string | null;
          severity: string;
          title: string;
          type: string;
          user_id: string | null;
        };
        Insert: {
          business_id: string;
          created_at?: string;
          id?: string;
          is_read?: boolean;
          link?: string | null;
          message?: string | null;
          severity?: string;
          title: string;
          type: string;
          user_id?: string | null;
        };
        Update: {
          business_id?: string;
          created_at?: string;
          id?: string;
          is_read?: boolean;
          link?: string | null;
          message?: string | null;
          severity?: string;
          title?: string;
          type?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      payments: {
        Row: {
          amount: number;
          business_id: string;
          created_at: string;
          created_by: string | null;
          customer_id: string | null;
          id: string;
          idempotency_key: string | null;
          invoice_id: string | null;
          method: Database["public"]["Enums"]["payment_method"];
          paid_at: string;
          reference: string | null;
          sale_id: string | null;
        };
        Insert: {
          amount: number;
          business_id: string;
          created_at?: string;
          created_by?: string | null;
          customer_id?: string | null;
          id?: string;
          idempotency_key?: string | null;
          invoice_id?: string | null;
          method?: Database["public"]["Enums"]["payment_method"];
          paid_at?: string;
          reference?: string | null;
          sale_id?: string | null;
        };
        Update: {
          amount?: number;
          business_id?: string;
          created_at?: string;
          created_by?: string | null;
          customer_id?: string | null;
          id?: string;
          idempotency_key?: string | null;
          invoice_id?: string | null;
          method?: Database["public"]["Enums"]["payment_method"];
          paid_at?: string;
          reference?: string | null;
          sale_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "payments_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_invoice_id_fkey";
            columns: ["invoice_id"];
            isOneToOne: false;
            referencedRelation: "invoices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_sale_id_fkey";
            columns: ["sale_id"];
            isOneToOne: false;
            referencedRelation: "sales";
            referencedColumns: ["id"];
          },
        ];
      };
      permissions: {
        Row: { key: string; category: string; label: string };
        Insert: { key: string; category: string; label: string };
        Update: { key?: string; category?: string; label?: string };
        Relationships: [];
      };
      business_role_permissions: {
        Row: {
          business_id: string;
          role: Database["public"]["Enums"]["app_role"];
          permission_key: string;
        };
        Insert: {
          business_id: string;
          role: Database["public"]["Enums"]["app_role"];
          permission_key: string;
        };
        Update: {
          business_id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          permission_key?: string;
        };
        Relationships: [
          {
            foreignKeyName: "business_role_permissions_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "business_role_permissions_permission_key_fkey";
            columns: ["permission_key"];
            isOneToOne: false;
            referencedRelation: "permissions";
            referencedColumns: ["key"];
          },
        ];
      };
      products: {
        Row: {
          barcode: string | null;
          business_id: string;
          category_id: string | null;
          cost_price: number;
          created_at: string;
          deleted_at: string | null;
          description: string | null;
          id: string;
          image_url: string | null;
          is_active: boolean;
          min_stock: number;
          name: string;
          selling_price: number;
          sku: string | null;
          stock: number;
          supplier_id: string | null;
          tax_rate: number;
          unit: string;
          updated_at: string;
        };
        Insert: {
          barcode?: string | null;
          business_id: string;
          category_id?: string | null;
          cost_price?: number;
          created_at?: string;
          deleted_at?: string | null;
          description?: string | null;
          id?: string;
          image_url?: string | null;
          is_active?: boolean;
          min_stock?: number;
          name: string;
          selling_price?: number;
          sku?: string | null;
          stock?: number;
          supplier_id?: string | null;
          tax_rate?: number;
          unit?: string;
          updated_at?: string;
        };
        Update: {
          barcode?: string | null;
          business_id?: string;
          category_id?: string | null;
          cost_price?: number;
          created_at?: string;
          deleted_at?: string | null;
          description?: string | null;
          id?: string;
          image_url?: string | null;
          is_active?: boolean;
          min_stock?: number;
          name?: string;
          selling_price?: number;
          sku?: string | null;
          stock?: number;
          supplier_id?: string | null;
          tax_rate?: number;
          unit?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "products_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "products_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "products_supplier_id_fkey";
            columns: ["supplier_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          full_name: string | null;
          id: string;
          phone: string | null;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          full_name?: string | null;
          id: string;
          phone?: string | null;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          full_name?: string | null;
          id?: string;
          phone?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      purchase_order_items: {
        Row: {
          business_id: string;
          created_at: string;
          id: string;
          line_total: number;
          name: string;
          product_id: string | null;
          purchase_order_id: string;
          quantity: number;
          tax: number;
          unit_cost: number;
        };
        Insert: {
          business_id: string;
          created_at?: string;
          id?: string;
          line_total: number;
          name: string;
          product_id?: string | null;
          purchase_order_id: string;
          quantity: number;
          tax?: number;
          unit_cost: number;
        };
        Update: {
          business_id?: string;
          created_at?: string;
          id?: string;
          line_total?: number;
          name?: string;
          product_id?: string | null;
          purchase_order_id?: string;
          quantity?: number;
          tax?: number;
          unit_cost?: number;
        };
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_order_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_order_items_purchase_order_id_fkey";
            columns: ["purchase_order_id"];
            isOneToOne: false;
            referencedRelation: "purchase_orders";
            referencedColumns: ["id"];
          },
        ];
      };
      purchase_orders: {
        Row: {
          business_id: string;
          created_at: string;
          created_by: string | null;
          id: string;
          notes: string | null;
          order_date: string;
          po_number: string;
          status: Database["public"]["Enums"]["purchase_order_status"];
          subtotal: number;
          supplier_id: string | null;
          tax: number;
          total: number;
          updated_at: string;
        };
        Insert: {
          business_id: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          notes?: string | null;
          order_date?: string;
          po_number: string;
          status?: Database["public"]["Enums"]["purchase_order_status"];
          subtotal?: number;
          supplier_id?: string | null;
          tax?: number;
          total?: number;
          updated_at?: string;
        };
        Update: {
          business_id?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          notes?: string | null;
          order_date?: string;
          po_number?: string;
          status?: Database["public"]["Enums"]["purchase_order_status"];
          subtotal?: number;
          supplier_id?: string | null;
          tax?: number;
          total?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "purchase_orders_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey";
            columns: ["supplier_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["id"];
          },
        ];
      };
      quote_items: {
        Row: {
          business_id: string;
          created_at: string;
          discount: number;
          id: string;
          line_total: number;
          name: string;
          product_id: string | null;
          quantity: number;
          quote_id: string;
          tax: number;
          unit_price: number;
        };
        Insert: {
          business_id: string;
          created_at?: string;
          discount?: number;
          id?: string;
          line_total: number;
          name: string;
          product_id?: string | null;
          quantity: number;
          quote_id: string;
          tax?: number;
          unit_price: number;
        };
        Update: {
          business_id?: string;
          created_at?: string;
          discount?: number;
          id?: string;
          line_total?: number;
          name?: string;
          product_id?: string | null;
          quantity?: number;
          quote_id?: string;
          tax?: number;
          unit_price?: number;
        };
        Relationships: [
          {
            foreignKeyName: "quote_items_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "quote_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "quote_items_quote_id_fkey";
            columns: ["quote_id"];
            isOneToOne: false;
            referencedRelation: "quotes";
            referencedColumns: ["id"];
          },
        ];
      };
      quotes: {
        Row: {
          business_id: string;
          converted_invoice_id: string | null;
          created_at: string;
          created_by: string | null;
          customer_id: string | null;
          discount: number;
          id: string;
          issue_date: string;
          notes: string | null;
          quote_number: string;
          status: Database["public"]["Enums"]["quote_status"];
          subtotal: number;
          tax: number;
          terms: string | null;
          total: number;
          updated_at: string;
          valid_until: string | null;
        };
        Insert: {
          business_id: string;
          converted_invoice_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          customer_id?: string | null;
          discount?: number;
          id?: string;
          issue_date?: string;
          notes?: string | null;
          quote_number: string;
          status?: Database["public"]["Enums"]["quote_status"];
          subtotal?: number;
          tax?: number;
          terms?: string | null;
          total?: number;
          updated_at?: string;
          valid_until?: string | null;
        };
        Update: {
          business_id?: string;
          converted_invoice_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          customer_id?: string | null;
          discount?: number;
          id?: string;
          issue_date?: string;
          notes?: string | null;
          quote_number?: string;
          status?: Database["public"]["Enums"]["quote_status"];
          subtotal?: number;
          tax?: number;
          terms?: string | null;
          total?: number;
          updated_at?: string;
          valid_until?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "quotes_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "quotes_converted_invoice_id_fkey";
            columns: ["converted_invoice_id"];
            isOneToOne: false;
            referencedRelation: "invoices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "quotes_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
        ];
      };
      rate_limit_hits: {
        Row: {
          count: number;
          key: string;
          window_start: string;
        };
        Insert: {
          count?: number;
          key: string;
          window_start: string;
        };
        Update: {
          count?: number;
          key?: string;
          window_start?: string;
        };
        Relationships: [];
      };
      recurring_invoices: {
        Row: {
          business_id: string;
          created_at: string;
          created_by: string | null;
          customer_id: string | null;
          discount: number;
          due_days: number;
          id: string;
          interval: Database["public"]["Enums"]["recurrence_interval"];
          is_active: boolean;
          items: Json;
          last_invoice_id: string | null;
          next_issue_date: string;
          notes: string | null;
          terms: string | null;
          updated_at: string;
        };
        Insert: {
          business_id: string;
          created_at?: string;
          created_by?: string | null;
          customer_id?: string | null;
          discount?: number;
          due_days?: number;
          id?: string;
          interval: Database["public"]["Enums"]["recurrence_interval"];
          is_active?: boolean;
          items: Json;
          last_invoice_id?: string | null;
          next_issue_date: string;
          notes?: string | null;
          terms?: string | null;
          updated_at?: string;
        };
        Update: {
          business_id?: string;
          created_at?: string;
          created_by?: string | null;
          customer_id?: string | null;
          discount?: number;
          due_days?: number;
          id?: string;
          interval?: Database["public"]["Enums"]["recurrence_interval"];
          is_active?: boolean;
          items?: Json;
          last_invoice_id?: string | null;
          next_issue_date?: string;
          notes?: string | null;
          terms?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recurring_invoices_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recurring_invoices_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recurring_invoices_last_invoice_id_fkey";
            columns: ["last_invoice_id"];
            isOneToOne: false;
            referencedRelation: "invoices";
            referencedColumns: ["id"];
          },
        ];
      };
      sale_items: {
        Row: {
          business_id: string;
          cost_price: number;
          created_at: string;
          discount: number;
          id: string;
          line_total: number;
          name: string;
          product_id: string | null;
          quantity: number;
          sale_id: string;
          sku: string | null;
          tax: number;
          unit_price: number;
        };
        Insert: {
          business_id: string;
          cost_price?: number;
          created_at?: string;
          discount?: number;
          id?: string;
          line_total: number;
          name: string;
          product_id?: string | null;
          quantity: number;
          sale_id: string;
          sku?: string | null;
          tax?: number;
          unit_price: number;
        };
        Update: {
          business_id?: string;
          cost_price?: number;
          created_at?: string;
          discount?: number;
          id?: string;
          line_total?: number;
          name?: string;
          product_id?: string | null;
          quantity?: number;
          sale_id?: string;
          sku?: string | null;
          tax?: number;
          unit_price?: number;
        };
        Relationships: [
          {
            foreignKeyName: "sale_items_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sale_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sale_items_sale_id_fkey";
            columns: ["sale_id"];
            isOneToOne: false;
            referencedRelation: "sales";
            referencedColumns: ["id"];
          },
        ];
      };
      sale_refund_items: {
        Row: {
          business_id: string;
          id: string;
          line_total: number;
          quantity: number;
          sale_item_id: string;
          sale_refund_id: string;
          tax: number;
          unit_price: number;
        };
        Insert: {
          business_id: string;
          id?: string;
          line_total: number;
          quantity: number;
          sale_item_id: string;
          sale_refund_id: string;
          tax?: number;
          unit_price: number;
        };
        Update: {
          business_id?: string;
          id?: string;
          line_total?: number;
          quantity?: number;
          sale_item_id?: string;
          sale_refund_id?: string;
          tax?: number;
          unit_price?: number;
        };
        Relationships: [
          {
            foreignKeyName: "sale_refund_items_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sale_refund_items_sale_item_id_fkey";
            columns: ["sale_item_id"];
            isOneToOne: false;
            referencedRelation: "sale_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sale_refund_items_sale_refund_id_fkey";
            columns: ["sale_refund_id"];
            isOneToOne: false;
            referencedRelation: "sale_refunds";
            referencedColumns: ["id"];
          },
        ];
      };
      sale_refunds: {
        Row: {
          business_id: string;
          created_at: string;
          created_by: string | null;
          id: string;
          reason: string | null;
          sale_id: string;
          subtotal: number;
          tax: number;
          total: number;
        };
        Insert: {
          business_id: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          reason?: string | null;
          sale_id: string;
          subtotal?: number;
          tax?: number;
          total?: number;
        };
        Update: {
          business_id?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          reason?: string | null;
          sale_id?: string;
          subtotal?: number;
          tax?: number;
          total?: number;
        };
        Relationships: [
          {
            foreignKeyName: "sale_refunds_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sale_refunds_sale_id_fkey";
            columns: ["sale_id"];
            isOneToOne: false;
            referencedRelation: "sales";
            referencedColumns: ["id"];
          },
        ];
      };
      sales: {
        Row: {
          amount_paid: number;
          business_id: string;
          cost_total: number;
          created_at: string;
          created_by: string | null;
          customer_id: string | null;
          discount: number;
          id: string;
          idempotency_key: string | null;
          notes: string | null;
          payment_method: Database["public"]["Enums"]["payment_method"];
          sale_number: string;
          status: Database["public"]["Enums"]["sale_status"];
          subtotal: number;
          tax: number;
          total: number;
          updated_at: string;
        };
        Insert: {
          amount_paid?: number;
          business_id: string;
          cost_total?: number;
          created_at?: string;
          created_by?: string | null;
          customer_id?: string | null;
          discount?: number;
          id?: string;
          idempotency_key?: string | null;
          notes?: string | null;
          payment_method?: Database["public"]["Enums"]["payment_method"];
          sale_number: string;
          status?: Database["public"]["Enums"]["sale_status"];
          subtotal?: number;
          tax?: number;
          total?: number;
          updated_at?: string;
        };
        Update: {
          amount_paid?: number;
          business_id?: string;
          cost_total?: number;
          created_at?: string;
          created_by?: string | null;
          customer_id?: string | null;
          discount?: number;
          id?: string;
          idempotency_key?: string | null;
          notes?: string | null;
          payment_method?: Database["public"]["Enums"]["payment_method"];
          sale_number?: string;
          status?: Database["public"]["Enums"]["sale_status"];
          subtotal?: number;
          tax?: number;
          total?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sales_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sales_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
        ];
      };
      subscription_events: {
        Row: {
          business_id: string;
          created_at: string;
          event_type: string;
          id: string;
          payload: Json | null;
        };
        Insert: {
          business_id: string;
          created_at?: string;
          event_type: string;
          id?: string;
          payload?: Json | null;
        };
        Update: {
          business_id?: string;
          created_at?: string;
          event_type?: string;
          id?: string;
          payload?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: "subscription_events_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      subscription_payments: {
        Row: {
          amount: number;
          business_id: string;
          created_at: string;
          currency: string;
          id: string;
          interval: string;
          paid_at: string | null;
          plan: Database["public"]["Enums"]["plan_tier"];
          poll_url: string;
          provider: string;
          provider_reference: string | null;
          raw_status: string | null;
          reference: string;
          status: string;
        };
        Insert: {
          amount: number;
          business_id: string;
          created_at?: string;
          currency?: string;
          id?: string;
          interval?: string;
          paid_at?: string | null;
          plan: Database["public"]["Enums"]["plan_tier"];
          poll_url: string;
          provider?: string;
          provider_reference?: string | null;
          raw_status?: string | null;
          reference: string;
          status?: string;
        };
        Update: {
          amount?: number;
          business_id?: string;
          created_at?: string;
          currency?: string;
          id?: string;
          interval?: string;
          paid_at?: string | null;
          plan?: Database["public"]["Enums"]["plan_tier"];
          poll_url?: string;
          provider?: string;
          provider_reference?: string | null;
          raw_status?: string | null;
          reference?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "subscription_payments_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      subscriptions: {
        Row: {
          business_id: string;
          created_at: string;
          current_period_end: string | null;
          current_period_start: string | null;
          id: string;
          interval: string;
          plan: Database["public"]["Enums"]["plan_tier"];
          provider: string;
          provider_customer_id: string | null;
          provider_subscription_id: string | null;
          status: Database["public"]["Enums"]["subscription_status"];
          trial_ends_at: string | null;
          updated_at: string;
        };
        Insert: {
          business_id: string;
          created_at?: string;
          current_period_end?: string | null;
          current_period_start?: string | null;
          id?: string;
          interval?: string;
          plan?: Database["public"]["Enums"]["plan_tier"];
          provider?: string;
          provider_customer_id?: string | null;
          provider_subscription_id?: string | null;
          status?: Database["public"]["Enums"]["subscription_status"];
          trial_ends_at?: string | null;
          updated_at?: string;
        };
        Update: {
          business_id?: string;
          created_at?: string;
          current_period_end?: string | null;
          current_period_start?: string | null;
          id?: string;
          interval?: string;
          plan?: Database["public"]["Enums"]["plan_tier"];
          provider?: string;
          provider_customer_id?: string | null;
          provider_subscription_id?: string | null;
          status?: Database["public"]["Enums"]["subscription_status"];
          trial_ends_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "subscriptions_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: true;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      suppliers: {
        Row: {
          address: string | null;
          business_id: string;
          contact_person: string | null;
          created_at: string;
          deleted_at: string | null;
          email: string | null;
          id: string;
          name: string;
          notes: string | null;
          outstanding_amount: number;
          phone: string | null;
          updated_at: string;
        };
        Insert: {
          address?: string | null;
          business_id: string;
          contact_person?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          email?: string | null;
          id?: string;
          name: string;
          notes?: string | null;
          outstanding_amount?: number;
          phone?: string | null;
          updated_at?: string;
        };
        Update: {
          address?: string | null;
          business_id?: string;
          contact_person?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          email?: string | null;
          id?: string;
          name?: string;
          notes?: string | null;
          outstanding_amount?: number;
          phone?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "suppliers_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      adjust_stock: {
        Args: {
          _business_id: string;
          _movement_type: Database["public"]["Enums"]["movement_type"];
          _product_id: string;
          _quantity: number;
          _reason: string;
        };
        Returns: number;
      };
      admin_list_payments: {
        Args: { _limit?: number };
        Returns: {
          amount: number;
          business_id: string;
          business_name: string;
          created_at: string;
          currency: string;
          interval: string;
          paid_at: string;
          plan: Database["public"]["Enums"]["plan_tier"];
          reference: string;
          status: string;
        }[];
      };
      admin_list_subscriptions: {
        Args: never;
        Returns: {
          business_created_at: string;
          business_id: string;
          business_name: string;
          business_type: Database["public"]["Enums"]["business_type"];
          current_period_end: string;
          interval: string;
          plan: Database["public"]["Enums"]["plan_tier"];
          status: Database["public"]["Enums"]["subscription_status"];
          trial_ends_at: string;
        }[];
      };
      admin_override_subscription: {
        Args: {
          _business_id: string;
          _current_period_end: string;
          _plan: Database["public"]["Enums"]["plan_tier"];
          _reason: string;
          _status: Database["public"]["Enums"]["subscription_status"];
        };
        Returns: undefined;
      };
      admin_platform_stats: { Args: never; Returns: Json };
      check_rate_limit: {
        Args: { _key: string; _limit: number; _window_seconds: number };
        Returns: boolean;
      };
      clear_login_failures: {
        Args: { _key: string };
        Returns: undefined;
      };
      peek_login_failures: {
        Args: { _key: string; _window_seconds: number };
        Returns: number;
      };
      record_login_failure: {
        Args: { _key: string; _window_seconds: number };
        Returns: number;
      };
      convert_quote_to_invoice: {
        Args: { _business_id: string; _due_date: string; _quote_id: string };
        Returns: string;
      };
      create_business_with_owner: {
        Args: {
          _address: string;
          _business_type: Database["public"]["Enums"]["business_type"];
          _currency: string;
          _name: string;
          _phone: string;
        };
        Returns: string;
      };
      create_invoice: {
        Args: {
          _business_id: string;
          _customer_id: string;
          _discount: number;
          _due_date: string;
          _idempotency_key?: string;
          _issue_date: string;
          _items: Json;
          _notes: string;
          _terms: string;
        };
        Returns: string;
      };
      create_product: {
        Args: {
          _barcode: string;
          _business_id: string;
          _cost_price: number;
          _description: string;
          _min_stock: number;
          _name: string;
          _selling_price: number;
          _sku: string;
          _stock: number;
          _supplier_id?: string | null;
          _tax_rate: number;
          _unit: string;
        };
        Returns: {
          id: string;
          name: string;
          stock: number;
        }[];
      };
      create_quote: {
        Args: {
          _business_id: string;
          _customer_id: string;
          _discount: number;
          _issue_date: string;
          _items: Json;
          _notes: string;
          _terms: string;
          _valid_until: string;
        };
        Returns: string;
      };
      create_purchase_order: {
        Args: {
          _business_id: string;
          _items: Json;
          _notes: string;
          _order_date: string;
          _supplier_id: string;
        };
        Returns: string;
      };
      create_recurring_invoice: {
        Args: {
          _business_id: string;
          _customer_id: string;
          _discount: number;
          _due_days: number;
          _interval: Database["public"]["Enums"]["recurrence_interval"];
          _items: Json;
          _notes: string;
          _start_date: string;
          _terms: string;
        };
        Returns: string;
      };
      delete_recurring_invoice: {
        Args: { _business_id: string; _id: string };
        Returns: undefined;
      };
      generate_due_recurring_invoices: { Args: never; Returns: number };
      set_recurring_invoice_active: {
        Args: { _active: boolean; _business_id: string; _id: string };
        Returns: undefined;
      };
      create_sale: {
        Args: {
          _business_id: string;
          _customer_id: string;
          _discount: number;
          _idempotency_key?: string;
          _items: Json;
          _notes: string;
          _payment_method: Database["public"]["Enums"]["payment_method"];
        };
        Returns: string;
      };
      accept_business_invite: { Args: { _token: string }; Returns: string };
      create_business_invite: {
        Args: {
          _business_id: string;
          _role: Database["public"]["Enums"]["app_role"];
        };
        Returns: string;
      };
      get_invite_preview: {
        Args: { _token: string };
        Returns: {
          business_name: string | null;
          role: Database["public"]["Enums"]["app_role"] | null;
          valid: boolean;
          reason: string | null;
        }[];
      };
      get_or_create_staff_code: { Args: { _business_id: string }; Returns: string };
      get_or_create_role_permissions: {
        Args: { _business_id: string };
        Returns: {
          role: Database["public"]["Enums"]["app_role"];
          permission_key: string;
        }[];
      };
      has_permission: { Args: { _business_id: string; _permission: string }; Returns: boolean };
      get_my_permissions: { Args: { _business_id: string }; Returns: string[] };
      set_role_permission: {
        Args: {
          _business_id: string;
          _role: Database["public"]["Enums"]["app_role"];
          _permission_key: string;
          _granted: boolean;
        };
        Returns: undefined;
      };
      resolve_staff_login: {
        Args: { _business_name: string; _staff_name: string };
        Returns: string | null;
      };
      set_staff_password: { Args: { _business_id: string; _password: string }; Returns: undefined };
      verify_shop_login: {
        Args: { _business_name: string; _password: string };
        Returns: {
          valid: boolean;
          business_id: string | null;
          business_name: string | null;
          staff_names: string[] | null;
        }[];
      };
      list_team_members: {
        Args: { _business_id: string };
        Returns: {
          id: string;
          user_id: string;
          role: Database["public"]["Enums"]["app_role"];
          email: string;
          full_name: string;
          staff_name: string | null;
          created_at: string;
        }[];
      };
      list_audit_logs: {
        Args: { _business_id: string; _limit?: number; _offset?: number };
        Returns: {
          id: string;
          created_at: string;
          actor_name: string;
          action: string;
          entity_type: string;
          entity_id: string | null;
          summary: string | null;
          result: string;
        }[];
      };
      remove_team_member: {
        Args: { _business_id: string; _member_user_id: string };
        Returns: undefined;
      };
      revoke_business_invite: {
        Args: { _business_id: string; _invite_id: string };
        Returns: undefined;
      };
      update_team_member_role: {
        Args: {
          _business_id: string;
          _member_user_id: string;
          _role: Database["public"]["Enums"]["app_role"];
        };
        Returns: undefined;
      };
      delete_owned_businesses: { Args: never; Returns: undefined };
      has_business_role: {
        Args: {
          _business_id: string;
          _roles: Database["public"]["Enums"]["app_role"][];
        };
        Returns: boolean;
      };
      import_sale_history_row: {
        Args: {
          _business_id: string;
          _cost: number;
          _description: string;
          _sale_date: string;
          _total: number;
        };
        Returns: string;
      };
      import_sale_line: {
        Args: {
          _business_id: string;
          _customer_id: string | null;
          _notes: string | null;
          _payment_method: Database["public"]["Enums"]["payment_method"];
          _product_id: string;
          _quantity: number;
          _sale_date: string;
          _unit_price: number | null;
        };
        Returns: string;
      };
      is_business_member: { Args: { _business_id: string }; Returns: boolean };
      my_role: {
        Args: { _business_id: string };
        Returns: Database["public"]["Enums"]["app_role"];
      };
      paynow_confirm_payment: {
        Args: {
          _paid: boolean;
          _provider_reference: string;
          _raw_status: string;
          _reference: string;
        };
        Returns: undefined;
      };
      record_invoice_payment: {
        Args: {
          _amount: number;
          _business_id: string;
          _idempotency_key: string;
          _invoice_id: string;
          _method: Database["public"]["Enums"]["payment_method"];
          _reference: string;
        };
        Returns: string;
      };
      record_subscription_payment: {
        Args: {
          _amount: number;
          _business_id: string;
          _currency: string;
          _interval: string;
          _plan: Database["public"]["Enums"]["plan_tier"];
          _poll_url: string;
          _reference: string;
        };
        Returns: string;
      };
      refund_sale: {
        Args: {
          _business_id: string;
          _items: Json;
          _reason: string;
          _sale_id: string;
        };
        Returns: string;
      };
      set_invoice_status: {
        Args: {
          _business_id: string;
          _invoice_id: string;
          _status: Database["public"]["Enums"]["doc_status"];
        };
        Returns: undefined;
      };
      set_purchase_order_status: {
        Args: {
          _business_id: string;
          _po_id: string;
          _status: Database["public"]["Enums"]["purchase_order_status"];
        };
        Returns: undefined;
      };
    };
    Enums: {
      app_role: "owner" | "admin" | "manager" | "cashier" | "accountant";
      business_type:
        | "grocery"
        | "boutique"
        | "hardware"
        | "electronics"
        | "pharmacy"
        | "salon"
        | "restaurant"
        | "bakery"
        | "wholesale"
        | "services"
        | "other";
      doc_status: "draft" | "sent" | "partially_paid" | "paid" | "overdue" | "cancelled";
      movement_type: "stock_in" | "stock_out" | "adjustment" | "return" | "sale" | "purchase";
      payment_method: "cash" | "card" | "mobile_money" | "bank_transfer" | "credit";
      plan_tier: "free" | "starter" | "business" | "pro";
      purchase_order_status: "sent" | "received" | "cancelled";
      quote_status: "draft" | "sent" | "accepted" | "declined" | "expired" | "converted";
      recurrence_interval: "weekly" | "monthly" | "quarterly" | "yearly";
      sale_status: "completed" | "refunded" | "partially_refunded" | "cancelled";
      subscription_status:
        "trialing" | "active" | "past_due" | "canceled" | "incomplete" | "unpaid";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["owner", "admin", "manager", "cashier", "accountant"],
      business_type: [
        "grocery",
        "boutique",
        "hardware",
        "electronics",
        "pharmacy",
        "salon",
        "restaurant",
        "bakery",
        "wholesale",
        "services",
        "other",
      ],
      doc_status: ["draft", "sent", "partially_paid", "paid", "overdue", "cancelled"],
      movement_type: ["stock_in", "stock_out", "adjustment", "return", "sale", "purchase"],
      payment_method: ["cash", "card", "mobile_money", "bank_transfer", "credit"],
      plan_tier: ["free", "starter", "business", "pro"],
      purchase_order_status: ["sent", "received", "cancelled"],
      quote_status: ["draft", "sent", "accepted", "declined", "expired", "converted"],
      recurrence_interval: ["weekly", "monthly", "quarterly", "yearly"],
      sale_status: ["completed", "refunded", "partially_refunded", "cancelled"],
      subscription_status: ["trialing", "active", "past_due", "canceled", "incomplete", "unpaid"],
    },
  },
} as const;
