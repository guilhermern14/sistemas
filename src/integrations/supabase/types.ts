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
      boletos: {
        Row: {
          created_at: string
          created_by: string | null
          descricao: string | null
          estoque_entrada_ref: string | null
          fornecedor: string | null
          id: string
          origem: string
          pago: boolean
          pago_em: string | null
          valor: number
          vencimento: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          estoque_entrada_ref?: string | null
          fornecedor?: string | null
          id?: string
          origem?: string
          pago?: boolean
          pago_em?: string | null
          valor?: number
          vencimento: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          estoque_entrada_ref?: string | null
          fornecedor?: string | null
          id?: string
          origem?: string
          pago?: boolean
          pago_em?: string | null
          valor?: number
          vencimento?: string
        }
        Relationships: []
      }
      clientes: {
        Row: {
          bairro: string | null
          cidade: string | null
          created_at: string
          created_by: string | null
          email: string | null
          endereco: string | null
          id: string
          nome: string
          numero: string | null
          observacoes: string | null
          telefone: string | null
        }
        Insert: {
          bairro?: string | null
          cidade?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          endereco?: string | null
          id?: string
          nome: string
          numero?: string | null
          observacoes?: string | null
          telefone?: string | null
        }
        Update: {
          bairro?: string | null
          cidade?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          endereco?: string | null
          id?: string
          nome?: string
          numero?: string | null
          observacoes?: string | null
          telefone?: string | null
        }
        Relationships: []
      }
      estoque: {
        Row: {
          codigo: string | null
          created_at: string
          id: string
          observacoes: string | null
          produto: string
          quantidade: number
          unidade: string
          valor_custo: number
          valor_venda: number
        }
        Insert: {
          codigo?: string | null
          created_at?: string
          id?: string
          observacoes?: string | null
          produto: string
          quantidade?: number
          unidade?: string
          valor_custo?: number
          valor_venda?: number
        }
        Update: {
          codigo?: string | null
          created_at?: string
          id?: string
          observacoes?: string | null
          produto?: string
          quantidade?: number
          unidade?: string
          valor_custo?: number
          valor_venda?: number
        }
        Relationships: []
      }
      financeiro_lancamentos: {
        Row: {
          categoria: string
          conta: string
          contraparte: string | null
          created_at: string
          created_by: string | null
          data: string
          descricao: string
          forma: string
          id: string
          observacoes: string | null
          origem: string
          tipo: string
          updated_at: string
          valor: number
        }
        Insert: {
          categoria?: string
          conta?: string
          contraparte?: string | null
          created_at?: string
          created_by?: string | null
          data?: string
          descricao?: string
          forma?: string
          id?: string
          observacoes?: string | null
          origem?: string
          tipo: string
          updated_at?: string
          valor?: number
        }
        Update: {
          categoria?: string
          conta?: string
          contraparte?: string | null
          created_at?: string
          created_by?: string | null
          data?: string
          descricao?: string
          forma?: string
          id?: string
          observacoes?: string | null
          origem?: string
          tipo?: string
          updated_at?: string
          valor?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          id: string
          nome: string
          telefone: string | null
        }
        Insert: {
          created_at?: string
          id: string
          nome?: string
          telefone?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
          telefone?: string | null
        }
        Relationships: []
      }
      servico_centrais: {
        Row: {
          created_at: string
          foto_path: string | null
          foto_url: string | null
          id: string
          mac: string | null
          nome: string
          senha: string | null
          servico_id: string
          usuario: string | null
        }
        Insert: {
          created_at?: string
          foto_path?: string | null
          foto_url?: string | null
          id?: string
          mac?: string | null
          nome?: string
          senha?: string | null
          servico_id: string
          usuario?: string | null
        }
        Update: {
          created_at?: string
          foto_path?: string | null
          foto_url?: string | null
          id?: string
          mac?: string | null
          nome?: string
          senha?: string | null
          servico_id?: string
          usuario?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "servico_centrais_servico_id_fkey"
            columns: ["servico_id"]
            isOneToOne: false
            referencedRelation: "servicos"
            referencedColumns: ["id"]
          },
        ]
      }
      servico_fotos: {
        Row: {
          created_at: string
          id: string
          servico_id: string
          storage_path: string
          url: string
        }
        Insert: {
          created_at?: string
          id?: string
          servico_id: string
          storage_path: string
          url: string
        }
        Update: {
          created_at?: string
          id?: string
          servico_id?: string
          storage_path?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "servico_fotos_servico_id_fkey"
            columns: ["servico_id"]
            isOneToOne: false
            referencedRelation: "servicos"
            referencedColumns: ["id"]
          },
        ]
      }
      servico_produtos: {
        Row: {
          codigo: string | null
          created_at: string
          estoque_id: string | null
          id: string
          produto: string
          quantidade: number
          servico_id: string
          valor_unitario: number
        }
        Insert: {
          codigo?: string | null
          created_at?: string
          estoque_id?: string | null
          id?: string
          produto: string
          quantidade?: number
          servico_id: string
          valor_unitario?: number
        }
        Update: {
          codigo?: string | null
          created_at?: string
          estoque_id?: string | null
          id?: string
          produto?: string
          quantidade?: number
          servico_id?: string
          valor_unitario?: number
        }
        Relationships: [
          {
            foreignKeyName: "servico_produtos_estoque_id_fkey"
            columns: ["estoque_id"]
            isOneToOne: false
            referencedRelation: "estoque"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "servico_produtos_servico_id_fkey"
            columns: ["servico_id"]
            isOneToOne: false
            referencedRelation: "servicos"
            referencedColumns: ["id"]
          },
        ]
      }
      servicos: {
        Row: {
          cliente_id: string
          concluido_em: string | null
          created_at: string
          created_by: string | null
          data_agendada: string
          desconto: number
          descricao: string | null
          horas_mao_obra: number
          id: string
          numero_pedido: number
          pago_em: string | null
          pos_venda: string | null
          pos_venda_em: string | null
          produtos_usados: string | null
          relatorio: string | null
          status: Database["public"]["Enums"]["servico_status"]
          tecnico_id: string | null
          tipo: Database["public"]["Enums"]["servico_tipo"]
          valor: number | null
          valor_bruto: number
          valor_mao_obra: number
        }
        Insert: {
          cliente_id: string
          concluido_em?: string | null
          created_at?: string
          created_by?: string | null
          data_agendada?: string
          desconto?: number
          descricao?: string | null
          horas_mao_obra?: number
          id?: string
          numero_pedido?: number
          pago_em?: string | null
          pos_venda?: string | null
          pos_venda_em?: string | null
          produtos_usados?: string | null
          relatorio?: string | null
          status?: Database["public"]["Enums"]["servico_status"]
          tecnico_id?: string | null
          tipo?: Database["public"]["Enums"]["servico_tipo"]
          valor?: number | null
          valor_bruto?: number
          valor_mao_obra?: number
        }
        Update: {
          cliente_id?: string
          concluido_em?: string | null
          created_at?: string
          created_by?: string | null
          data_agendada?: string
          desconto?: number
          descricao?: string | null
          horas_mao_obra?: number
          id?: string
          numero_pedido?: number
          pago_em?: string | null
          pos_venda?: string | null
          pos_venda_em?: string | null
          produtos_usados?: string | null
          relatorio?: string | null
          status?: Database["public"]["Enums"]["servico_status"]
          tecnico_id?: string | null
          tipo?: Database["public"]["Enums"]["servico_tipo"]
          valor?: number | null
          valor_bruto?: number
          valor_mao_obra?: number
        }
        Relationships: [
          {
            foreignKeyName: "servicos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      whatsapp_topicos: {
        Row: {
          created_at: string
          id: string
          ordem: number
          pergunta: string
          resposta: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          ordem?: number
          pergunta: string
          resposta: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          ordem?: number
          pergunta?: string
          resposta?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
      notas_fiscais: {
        Row: {
          id: string
          tipo: "compra" | "emitida"
          data_emissao: string
          fornecedor: string | null
          numero: string | null
          serie: string | null
          chave: string | null
          valor_total: number
          origem: string
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          tipo: "compra" | "emitida"
          data_emissao?: string
          fornecedor?: string | null
          numero?: string | null
          serie?: string | null
          chave?: string | null
          valor_total?: number
          origem?: string
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          tipo?: "compra" | "emitida"
          data_emissao?: string
          fornecedor?: string | null
          numero?: string | null
          serie?: string | null
          chave?: string | null
          valor_total?: number
          origem?: string
          created_by?: string | null
          created_at?: string
        }
        Relationships: []
      }
      notas_fiscais_itens: {
        Row: {
          id: string
          nota_fiscal_id: string
          codigo: string | null
          produto: string
          unidade: string
          quantidade: number
          valor_custo: number
          valor_venda: number
          created_at: string
        }
        Insert: {
          id?: string
          nota_fiscal_id: string
          codigo?: string | null
          produto: string
          unidade?: string
          quantidade?: number
          valor_custo?: number
          valor_venda?: number
          created_at?: string
        }
        Update: {
          id?: string
          nota_fiscal_id?: string
          codigo?: string | null
          produto?: string
          unidade?: string
          quantidade?: number
          valor_custo?: number
          valor_venda?: number
          created_at?: string
        }
        Relationships: []
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
      importar_nota_fiscal: {
        Args: {
          p_tipo: "compra" | "emitida"
          p_data_emissao: string
          p_fornecedor: string | null
          p_numero: string | null
          p_serie: string | null
          p_chave: string | null
          p_valor_total: number
          p_itens: Json
          p_origem?: string
        }
        Returns: string
      }
    Enums: {
      app_role: "admin" | "atendente" | "campo" | "financeiro"
      servico_status:
        | "agendado"
        | "em_andamento"
        | "pronto"
        | "a_cobrar"
        | "pago"
      servico_tipo: "instalacao" | "manutencao" | "orcamento"
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
      app_role: ["admin", "atendente", "campo", "financeiro"],
      servico_status: [
        "agendado",
        "em_andamento",
        "pronto",
        "a_cobrar",
        "pago",
      ],
      servico_tipo: ["instalacao", "manutencao", "orcamento"],
    },
  },
} as const
