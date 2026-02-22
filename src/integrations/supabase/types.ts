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
      ai_analysis_feedback: {
        Row: {
          ai_feedback: string | null
          ai_grade: number | null
          ai_justification: string | null
          ai_misconceptions: string[] | null
          attempt_id: string | null
          corrected_grade: number | null
          created_at: string
          critique_text: string
          critique_type: string
          grade_history_id: string | null
          id: string
          is_processed: boolean
          preferred_approach: string | null
          processed_at: string | null
          student_id: string | null
          teacher_id: string
          topic_name: string
          what_ai_got_wrong: string | null
          what_ai_missed: string | null
        }
        Insert: {
          ai_feedback?: string | null
          ai_grade?: number | null
          ai_justification?: string | null
          ai_misconceptions?: string[] | null
          attempt_id?: string | null
          corrected_grade?: number | null
          created_at?: string
          critique_text: string
          critique_type: string
          grade_history_id?: string | null
          id?: string
          is_processed?: boolean
          preferred_approach?: string | null
          processed_at?: string | null
          student_id?: string | null
          teacher_id: string
          topic_name: string
          what_ai_got_wrong?: string | null
          what_ai_missed?: string | null
        }
        Update: {
          ai_feedback?: string | null
          ai_grade?: number | null
          ai_justification?: string | null
          ai_misconceptions?: string[] | null
          attempt_id?: string | null
          corrected_grade?: number | null
          created_at?: string
          critique_text?: string
          critique_type?: string
          grade_history_id?: string | null
          id?: string
          is_processed?: boolean
          preferred_approach?: string | null
          processed_at?: string | null
          student_id?: string | null
          teacher_id?: string
          topic_name?: string
          what_ai_got_wrong?: string | null
          what_ai_missed?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_analysis_feedback_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_analysis_feedback_grade_history_id_fkey"
            columns: ["grade_history_id"]
            isOneToOne: false
            referencedRelation: "grade_history"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_analysis_feedback_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_analysis_feedback_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_generated_images: {
        Row: {
          created_at: string
          id: string
          image_url: string
          prompt: string
          rejection_reason: string | null
          reviewed_at: string | null
          source: string
          status: string
          subject: string | null
          tags: string[] | null
          teacher_id: string
          topic: string | null
          updated_at: string
          usage_count: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          image_url: string
          prompt: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          source?: string
          status?: string
          subject?: string | null
          tags?: string[] | null
          teacher_id: string
          topic?: string | null
          updated_at?: string
          usage_count?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string
          prompt?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          source?: string
          status?: string
          subject?: string | null
          tags?: string[] | null
          teacher_id?: string
          topic?: string | null
          updated_at?: string
          usage_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_generated_images_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage_logs: {
        Row: {
          completion_tokens: number | null
          created_at: string | null
          function_name: string
          id: string
          latency_ms: number | null
          prompt_tokens: number | null
          total_tokens: number | null
          user_id: string
        }
        Insert: {
          completion_tokens?: number | null
          created_at?: string | null
          function_name: string
          id?: string
          latency_ms?: number | null
          prompt_tokens?: number | null
          total_tokens?: number | null
          user_id: string
        }
        Update: {
          completion_tokens?: number | null
          created_at?: string | null
          function_name?: string
          id?: string
          latency_ms?: number | null
          prompt_tokens?: number | null
          total_tokens?: number | null
          user_id?: string
        }
        Relationships: []
      }
      analysis_misconceptions: {
        Row: {
          attempt_id: string | null
          created_at: string
          grade_history_id: string | null
          grade_impact: number | null
          id: string
          misconception_text: string
          severity: string | null
          student_id: string
          suggested_remedies: string[] | null
          teacher_id: string
          topic_name: string
        }
        Insert: {
          attempt_id?: string | null
          created_at?: string
          grade_history_id?: string | null
          grade_impact?: number | null
          id?: string
          misconception_text: string
          severity?: string | null
          student_id: string
          suggested_remedies?: string[] | null
          teacher_id: string
          topic_name: string
        }
        Update: {
          attempt_id?: string | null
          created_at?: string
          grade_history_id?: string | null
          grade_impact?: number | null
          id?: string
          misconception_text?: string
          severity?: string | null
          student_id?: string
          suggested_remedies?: string[] | null
          teacher_id?: string
          topic_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "analysis_misconceptions_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analysis_misconceptions_grade_history_id_fkey"
            columns: ["grade_history_id"]
            isOneToOne: false
            referencedRelation: "grade_history"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analysis_misconceptions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analysis_misconceptions_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_questions: {
        Row: {
          assessment_id: string
          id: string
          question_id: string
          sort_order: number | null
        }
        Insert: {
          assessment_id: string
          id?: string
          question_id: string
          sort_order?: number | null
        }
        Update: {
          assessment_id?: string
          id?: string
          question_id?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "assessment_questions_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_questions_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      assessments: {
        Row: {
          class_id: string | null
          created_at: string
          id: string
          instructions: string | null
          name: string
          teacher_id: string
          updated_at: string
        }
        Insert: {
          class_id?: string | null
          created_at?: string
          id?: string
          instructions?: string | null
          name: string
          teacher_id: string
          updated_at?: string
        }
        Update: {
          class_id?: string | null
          created_at?: string
          id?: string
          instructions?: string | null
          name?: string
          teacher_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessments_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      assignment_attendance: {
        Row: {
          assignment_name: string
          class_id: string
          created_at: string
          id: string
          notes: string | null
          status: string
          student_id: string
          teacher_id: string
          updated_at: string
        }
        Insert: {
          assignment_name: string
          class_id: string
          created_at?: string
          id?: string
          notes?: string | null
          status: string
          student_id: string
          teacher_id: string
          updated_at?: string
        }
        Update: {
          assignment_name?: string
          class_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          status?: string
          student_id?: string
          teacher_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignment_attendance_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_attendance_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_attendance_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      attempt_images: {
        Row: {
          attempt_id: string
          created_at: string
          id: string
          image_url: string
          ocr_text: string | null
          processed_image_url: string | null
        }
        Insert: {
          attempt_id: string
          created_at?: string
          id?: string
          image_url: string
          ocr_text?: string | null
          processed_image_url?: string | null
        }
        Update: {
          attempt_id?: string
          created_at?: string
          id?: string
          image_url?: string
          ocr_text?: string | null
          processed_image_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attempt_images_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "attempts"
            referencedColumns: ["id"]
          },
        ]
      }
      attempt_misconceptions: {
        Row: {
          attempt_id: string
          confidence: number | null
          misconception_id: string
        }
        Insert: {
          attempt_id: string
          confidence?: number | null
          misconception_id: string
        }
        Update: {
          attempt_id?: string
          confidence?: number | null
          misconception_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attempt_misconceptions_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attempt_misconceptions_misconception_id_fkey"
            columns: ["misconception_id"]
            isOneToOne: false
            referencedRelation: "misconception_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      attempts: {
        Row: {
          assessment_id: string | null
          created_at: string
          id: string
          qr_code: string | null
          question_id: string
          status: Database["public"]["Enums"]["attempt_status"]
          student_id: string
          updated_at: string
        }
        Insert: {
          assessment_id?: string | null
          created_at?: string
          id?: string
          qr_code?: string | null
          question_id: string
          status?: Database["public"]["Enums"]["attempt_status"]
          student_id: string
          updated_at?: string
        }
        Update: {
          assessment_id?: string | null
          created_at?: string
          id?: string
          qr_code?: string | null
          question_id?: string
          status?: Database["public"]["Enums"]["attempt_status"]
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attempts_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attempts_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attempts_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      batch_queue: {
        Row: {
          batch_id: string | null
          completed_at: string | null
          created_at: string | null
          id: number
          metadata: Json | null
          payload: string
          result: string | null
          source_bot: string | null
          status: string
          task_type: string
        }
        Insert: {
          batch_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          id?: never
          metadata?: Json | null
          payload: string
          result?: string | null
          source_bot?: string | null
          status?: string
          task_type: string
        }
        Update: {
          batch_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          id?: never
          metadata?: Json | null
          payload?: string
          result?: string | null
          source_bot?: string | null
          status?: string
          task_type?: string
        }
        Relationships: []
      }
      batch_runs: {
        Row: {
          batch_id: string
          completed_at: string | null
          errors_count: number | null
          id: number
          results_count: number | null
          status: string
          submitted_at: string | null
          task_count: number
          task_type_filter: string | null
        }
        Insert: {
          batch_id: string
          completed_at?: string | null
          errors_count?: number | null
          id?: never
          results_count?: number | null
          status?: string
          submitted_at?: string | null
          task_count?: number
          task_type_filter?: string | null
        }
        Update: {
          batch_id?: string
          completed_at?: string | null
          errors_count?: number | null
          id?: never
          results_count?: number | null
          status?: string
          submitted_at?: string | null
          task_count?: number
          task_type_filter?: string | null
        }
        Relationships: []
      }
      beta_feedback: {
        Row: {
          created_at: string
          description: string
          email: string | null
          feedback_type: string
          id: string
          page_url: string | null
          status: string
          title: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          description: string
          email?: string | null
          feedback_type: string
          id?: string
          page_url?: string | null
          status?: string
          title: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string
          email?: string | null
          feedback_type?: string
          id?: string
          page_url?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      classes: {
        Row: {
          archived_at: string | null
          class_period: string | null
          created_at: string
          id: string
          join_code: string
          name: string
          school_year: string | null
          teacher_id: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          class_period?: string | null
          created_at?: string
          id?: string
          join_code: string
          name: string
          school_year?: string | null
          teacher_id: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          class_period?: string | null
          created_at?: string
          id?: string
          join_code?: string
          name?: string
          school_year?: string | null
          teacher_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "classes_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      diagnostic_results: {
        Row: {
          created_at: string
          id: string
          level_a_score: number | null
          level_a_total: number | null
          level_b_score: number | null
          level_b_total: number | null
          level_c_score: number | null
          level_c_total: number | null
          level_d_score: number | null
          level_d_total: number | null
          level_e_score: number | null
          level_e_total: number | null
          level_f_score: number | null
          level_f_total: number | null
          notes: string | null
          recommended_level: string | null
          standard: string | null
          student_id: string
          teacher_id: string
          topic_name: string
          updated_at: string
          worksheet_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          level_a_score?: number | null
          level_a_total?: number | null
          level_b_score?: number | null
          level_b_total?: number | null
          level_c_score?: number | null
          level_c_total?: number | null
          level_d_score?: number | null
          level_d_total?: number | null
          level_e_score?: number | null
          level_e_total?: number | null
          level_f_score?: number | null
          level_f_total?: number | null
          notes?: string | null
          recommended_level?: string | null
          standard?: string | null
          student_id: string
          teacher_id: string
          topic_name: string
          updated_at?: string
          worksheet_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          level_a_score?: number | null
          level_a_total?: number | null
          level_b_score?: number | null
          level_b_total?: number | null
          level_c_score?: number | null
          level_c_total?: number | null
          level_d_score?: number | null
          level_d_total?: number | null
          level_e_score?: number | null
          level_e_total?: number | null
          level_f_score?: number | null
          level_f_total?: number | null
          notes?: string | null
          recommended_level?: string | null
          standard?: string | null
          student_id?: string
          teacher_id?: string
          topic_name?: string
          updated_at?: string
          worksheet_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "diagnostic_results_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diagnostic_results_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diagnostic_results_worksheet_id_fkey"
            columns: ["worksheet_id"]
            isOneToOne: false
            referencedRelation: "worksheets"
            referencedColumns: ["id"]
          },
        ]
      }
      external_students: {
        Row: {
          class_id: string | null
          class_name: string | null
          coin_potential: number | null
          created_at: string
          email: string | null
          external_id: string
          first_name: string | null
          full_name: string | null
          grades: Json | null
          id: string
          last_name: string | null
          linked_user_id: string | null
          misconceptions: Json | null
          overall_average: number | null
          remediation_recommendations: string[] | null
          skill_tags: string[] | null
          source: string | null
          sync_timestamp: string | null
          teacher_name: string | null
          updated_at: string
          weak_topics: Json | null
          xp_potential: number | null
        }
        Insert: {
          class_id?: string | null
          class_name?: string | null
          coin_potential?: number | null
          created_at?: string
          email?: string | null
          external_id: string
          first_name?: string | null
          full_name?: string | null
          grades?: Json | null
          id?: string
          last_name?: string | null
          linked_user_id?: string | null
          misconceptions?: Json | null
          overall_average?: number | null
          remediation_recommendations?: string[] | null
          skill_tags?: string[] | null
          source?: string | null
          sync_timestamp?: string | null
          teacher_name?: string | null
          updated_at?: string
          weak_topics?: Json | null
          xp_potential?: number | null
        }
        Update: {
          class_id?: string | null
          class_name?: string | null
          coin_potential?: number | null
          created_at?: string
          email?: string | null
          external_id?: string
          first_name?: string | null
          full_name?: string | null
          grades?: Json | null
          id?: string
          last_name?: string | null
          linked_user_id?: string | null
          misconceptions?: Json | null
          overall_average?: number | null
          remediation_recommendations?: string[] | null
          skill_tags?: string[] | null
          source?: string | null
          sync_timestamp?: string | null
          teacher_name?: string | null
          updated_at?: string
          weak_topics?: Json | null
          xp_potential?: number | null
        }
        Relationships: []
      }
      feature_usage_log: {
        Row: {
          action: string
          created_at: string
          feature_category: string
          feature_name: string
          id: string
          metadata: Json | null
          teacher_id: string
        }
        Insert: {
          action?: string
          created_at?: string
          feature_category?: string
          feature_name: string
          id?: string
          metadata?: Json | null
          teacher_id: string
        }
        Update: {
          action?: string
          created_at?: string
          feature_category?: string
          feature_name?: string
          id?: string
          metadata?: Json | null
          teacher_id?: string
        }
        Relationships: []
      }
      ferpa_audit_log: {
        Row: {
          action: string
          created_at: string
          id: string
          ip_address: string | null
          teacher_id: string
          user_agent: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          ip_address?: string | null
          teacher_id: string
          user_agent?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          teacher_id?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      grade_history: {
        Row: {
          attempt_id: string | null
          created_at: string
          grade: number
          grade_justification: string | null
          id: string
          nys_standard: string | null
          raw_score_earned: number | null
          raw_score_possible: number | null
          regents_justification: string | null
          regents_score: number | null
          student_id: string
          teacher_id: string
          topic_id: string | null
          topic_name: string
        }
        Insert: {
          attempt_id?: string | null
          created_at?: string
          grade: number
          grade_justification?: string | null
          id?: string
          nys_standard?: string | null
          raw_score_earned?: number | null
          raw_score_possible?: number | null
          regents_justification?: string | null
          regents_score?: number | null
          student_id: string
          teacher_id: string
          topic_id?: string | null
          topic_name: string
        }
        Update: {
          attempt_id?: string | null
          created_at?: string
          grade?: number
          grade_justification?: string | null
          id?: string
          nys_standard?: string | null
          raw_score_earned?: number | null
          raw_score_possible?: number | null
          regents_justification?: string | null
          regents_score?: number | null
          student_id?: string
          teacher_id?: string
          topic_id?: string | null
          topic_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "grade_history_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grade_history_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grade_history_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grade_history_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      grading_corrections: {
        Row: {
          ai_grade: number
          ai_justification: string | null
          ai_regents_score: number | null
          attempt_id: string | null
          corrected_grade: number
          corrected_regents_score: number | null
          correction_reason: string | null
          created_at: string
          grading_focus: string[] | null
          id: string
          strictness_indicator: string | null
          student_id: string | null
          teacher_id: string
          topic_name: string
        }
        Insert: {
          ai_grade: number
          ai_justification?: string | null
          ai_regents_score?: number | null
          attempt_id?: string | null
          corrected_grade: number
          corrected_regents_score?: number | null
          correction_reason?: string | null
          created_at?: string
          grading_focus?: string[] | null
          id?: string
          strictness_indicator?: string | null
          student_id?: string | null
          teacher_id: string
          topic_name: string
        }
        Update: {
          ai_grade?: number
          ai_justification?: string | null
          ai_regents_score?: number | null
          attempt_id?: string | null
          corrected_grade?: number
          corrected_regents_score?: number | null
          correction_reason?: string | null
          created_at?: string
          grading_focus?: string[] | null
          id?: string
          strictness_indicator?: string | null
          student_id?: string | null
          teacher_id?: string
          topic_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "grading_corrections_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grading_corrections_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grading_corrections_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      interpretation_verifications: {
        Row: {
          attempt_id: string | null
          context: string | null
          correct_interpretation: string | null
          created_at: string
          decision: string
          id: string
          interpretation: string
          original_text: string
          student_id: string | null
          teacher_id: string
        }
        Insert: {
          attempt_id?: string | null
          context?: string | null
          correct_interpretation?: string | null
          created_at?: string
          decision: string
          id?: string
          interpretation: string
          original_text: string
          student_id?: string | null
          teacher_id: string
        }
        Update: {
          attempt_id?: string | null
          context?: string | null
          correct_interpretation?: string | null
          created_at?: string
          decision?: string
          id?: string
          interpretation?: string
          original_text?: string
          student_id?: string | null
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "interpretation_verifications_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interpretation_verifications_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interpretation_verifications_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_plans: {
        Row: {
          class_id: string | null
          created_at: string
          duration: string
          id: string
          is_favorite: boolean
          objective: string
          recommended_worksheets: Json
          slides: Json
          standard: string
          subject: string | null
          teacher_id: string
          title: string
          topic_name: string
          updated_at: string
        }
        Insert: {
          class_id?: string | null
          created_at?: string
          duration: string
          id?: string
          is_favorite?: boolean
          objective: string
          recommended_worksheets?: Json
          slides?: Json
          standard: string
          subject?: string | null
          teacher_id: string
          title: string
          topic_name: string
          updated_at?: string
        }
        Update: {
          class_id?: string | null
          created_at?: string
          duration?: string
          id?: string
          is_favorite?: boolean
          objective?: string
          recommended_worksheets?: Json
          slides?: Json
          standard?: string
          subject?: string | null
          teacher_id?: string
          title?: string
          topic_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_plans_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_plans_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      live_presentation_sessions: {
        Row: {
          class_id: string
          created_at: string
          credit_for_participation: number
          current_slide_index: number
          deduction_for_non_participation: number
          ended_at: string | null
          id: string
          participation_mode: string
          presentation_id: string
          session_code: string
          status: string
          teacher_id: string
          title: string
          topic: string
          updated_at: string
        }
        Insert: {
          class_id: string
          created_at?: string
          credit_for_participation?: number
          current_slide_index?: number
          deduction_for_non_participation?: number
          ended_at?: string | null
          id?: string
          participation_mode?: string
          presentation_id: string
          session_code: string
          status?: string
          teacher_id: string
          title: string
          topic: string
          updated_at?: string
        }
        Update: {
          class_id?: string
          created_at?: string
          credit_for_participation?: number
          current_slide_index?: number
          deduction_for_non_participation?: number
          ended_at?: string | null
          id?: string
          participation_mode?: string
          presentation_id?: string
          session_code?: string
          status?: string
          teacher_id?: string
          title?: string
          topic?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_presentation_sessions_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_presentation_sessions_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      live_session_answers: {
        Row: {
          answered_at: string
          id: string
          is_correct: boolean | null
          participant_id: string
          question_id: string
          selected_answer: string
          time_taken_seconds: number | null
        }
        Insert: {
          answered_at?: string
          id?: string
          is_correct?: boolean | null
          participant_id: string
          question_id: string
          selected_answer: string
          time_taken_seconds?: number | null
        }
        Update: {
          answered_at?: string
          id?: string
          is_correct?: boolean | null
          participant_id?: string
          question_id?: string
          selected_answer?: string
          time_taken_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "live_session_answers_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "live_session_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_session_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "live_session_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      live_session_participants: {
        Row: {
          correct_answers: number
          credit_awarded: number
          id: string
          joined_at: string
          last_active_at: string
          partner_student_id: string | null
          session_id: string
          status: string
          student_id: string
          total_questions_answered: number
        }
        Insert: {
          correct_answers?: number
          credit_awarded?: number
          id?: string
          joined_at?: string
          last_active_at?: string
          partner_student_id?: string | null
          session_id: string
          status?: string
          student_id: string
          total_questions_answered?: number
        }
        Update: {
          correct_answers?: number
          credit_awarded?: number
          id?: string
          joined_at?: string
          last_active_at?: string
          partner_student_id?: string | null
          session_id?: string
          status?: string
          student_id?: string
          total_questions_answered?: number
        }
        Relationships: [
          {
            foreignKeyName: "live_session_participants_partner_student_id_fkey"
            columns: ["partner_student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_session_participants_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "live_presentation_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_session_participants_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      live_session_questions: {
        Row: {
          activated_at: string | null
          closed_at: string | null
          correct_answer: string | null
          created_at: string
          explanation: string | null
          id: string
          is_active: boolean
          options: Json
          question_prompt: string
          session_id: string
          slide_index: number
          time_limit_seconds: number | null
        }
        Insert: {
          activated_at?: string | null
          closed_at?: string | null
          correct_answer?: string | null
          created_at?: string
          explanation?: string | null
          id?: string
          is_active?: boolean
          options?: Json
          question_prompt: string
          session_id: string
          slide_index: number
          time_limit_seconds?: number | null
        }
        Update: {
          activated_at?: string | null
          closed_at?: string | null
          correct_answer?: string | null
          created_at?: string
          explanation?: string | null
          id?: string
          is_active?: boolean
          options?: Json
          question_prompt?: string
          session_id?: string
          slide_index?: number
          time_limit_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "live_session_questions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "live_presentation_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      mfa_recovery_codes: {
        Row: {
          code_hash: string
          created_at: string
          id: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          code_hash: string
          created_at?: string
          id?: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          code_hash?: string
          created_at?: string
          id?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      misconception_tags: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          topic_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          topic_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          topic_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "misconception_tags_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      name_corrections: {
        Row: {
          class_id: string
          correct_student_id: string
          created_at: string
          handwritten_name: string
          id: string
          normalized_name: string
          teacher_id: string
          times_used: number
          updated_at: string
        }
        Insert: {
          class_id: string
          correct_student_id: string
          created_at?: string
          handwritten_name: string
          id?: string
          normalized_name: string
          teacher_id: string
          times_used?: number
          updated_at?: string
        }
        Update: {
          class_id?: string
          correct_student_id?: string
          created_at?: string
          handwritten_name?: string
          id?: string
          normalized_name?: string
          teacher_id?: string
          times_used?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "name_corrections_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "name_corrections_correct_student_id_fkey"
            columns: ["correct_student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "name_corrections_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      nycologic_presentations: {
        Row: {
          created_at: string
          id: string
          is_favorite: boolean
          slides: Json
          subtitle: string | null
          teacher_id: string
          title: string
          topic: string
          updated_at: string
          visual_theme: Json | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_favorite?: boolean
          slides?: Json
          subtitle?: string | null
          teacher_id: string
          title: string
          topic: string
          updated_at?: string
          visual_theme?: Json | null
        }
        Update: {
          created_at?: string
          id?: string
          is_favorite?: boolean
          slides?: Json
          subtitle?: string | null
          teacher_id?: string
          title?: string
          topic?: string
          updated_at?: string
          visual_theme?: Json | null
        }
        Relationships: []
      }
      pending_scans: {
        Row: {
          class_id: string | null
          created_at: string
          id: string
          image_url: string
          notes: string | null
          status: string
          student_id: string | null
          teacher_id: string
          updated_at: string
        }
        Insert: {
          class_id?: string | null
          created_at?: string
          id?: string
          image_url: string
          notes?: string | null
          status?: string
          student_id?: string | null
          teacher_id: string
          updated_at?: string
        }
        Update: {
          class_id?: string | null
          created_at?: string
          id?: string
          image_url?: string
          notes?: string | null
          status?: string
          student_id?: string | null
          teacher_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_scans_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_scans_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_scans_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          id: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_id?: string
        }
        Relationships: []
      }
      question_topics: {
        Row: {
          question_id: string
          topic_id: string
        }
        Insert: {
          question_id: string
          topic_id: string
        }
        Update: {
          question_id?: string
          topic_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_topics_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_topics_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      questions: {
        Row: {
          answer_image_url: string | null
          answer_text: string | null
          assessment_mode: string
          created_at: string
          difficulty: number | null
          id: string
          jmap_id: string | null
          jmap_url: string | null
          prompt_image_url: string | null
          prompt_text: string | null
          teacher_id: string
          updated_at: string
        }
        Insert: {
          answer_image_url?: string | null
          answer_text?: string | null
          assessment_mode?: string
          created_at?: string
          difficulty?: number | null
          id?: string
          jmap_id?: string | null
          jmap_url?: string | null
          prompt_image_url?: string | null
          prompt_text?: string | null
          teacher_id: string
          updated_at?: string
        }
        Update: {
          answer_image_url?: string | null
          answer_text?: string | null
          assessment_mode?: string
          created_at?: string
          difficulty?: number | null
          id?: string
          jmap_id?: string | null
          jmap_url?: string | null
          prompt_image_url?: string | null
          prompt_text?: string | null
          teacher_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "questions_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      regents_shape_library: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_verified: boolean | null
          nys_standard: string | null
          parameters: Json | null
          shape_type: string
          source_exam: string | null
          source_image_url: string | null
          source_question_number: number | null
          subject: string
          svg_data: string | null
          tags: string[]
          teacher_id: string | null
          thumbnail_url: string | null
          updated_at: string
          usage_count: number | null
          vertices: Json | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_verified?: boolean | null
          nys_standard?: string | null
          parameters?: Json | null
          shape_type: string
          source_exam?: string | null
          source_image_url?: string | null
          source_question_number?: number | null
          subject: string
          svg_data?: string | null
          tags?: string[]
          teacher_id?: string | null
          thumbnail_url?: string | null
          updated_at?: string
          usage_count?: number | null
          vertices?: Json | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_verified?: boolean | null
          nys_standard?: string | null
          parameters?: Json | null
          shape_type?: string
          source_exam?: string | null
          source_image_url?: string | null
          source_question_number?: number | null
          subject?: string
          svg_data?: string | null
          tags?: string[]
          teacher_id?: string | null
          thumbnail_url?: string | null
          updated_at?: string
          usage_count?: number | null
          vertices?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "regents_shape_library_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      result_comments: {
        Row: {
          attempt_id: string
          author_name: string | null
          author_type: string
          content: string
          created_at: string
          id: string
          is_read: boolean
        }
        Insert: {
          attempt_id: string
          author_name?: string | null
          author_type: string
          content: string
          created_at?: string
          id?: string
          is_read?: boolean
        }
        Update: {
          attempt_id?: string
          author_name?: string | null
          author_type?: string
          content?: string
          created_at?: string
          id?: string
          is_read?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "result_comments_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "attempts"
            referencedColumns: ["id"]
          },
        ]
      }
      rubrics: {
        Row: {
          created_at: string
          description: string
          id: string
          points: number
          question_id: string
          step_number: number
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          points?: number
          question_id: string
          step_number: number
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          points?: number
          question_id?: string
          step_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "rubrics_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      scores: {
        Row: {
          attempt_id: string
          created_at: string
          id: string
          is_auto_scored: boolean | null
          notes: string | null
          points_earned: number | null
          rubric_id: string | null
          teacher_override: boolean | null
          updated_at: string
        }
        Insert: {
          attempt_id: string
          created_at?: string
          id?: string
          is_auto_scored?: boolean | null
          notes?: string | null
          points_earned?: number | null
          rubric_id?: string | null
          teacher_override?: boolean | null
          updated_at?: string
        }
        Update: {
          attempt_id?: string
          created_at?: string
          id?: string
          is_auto_scored?: boolean | null
          notes?: string | null
          points_earned?: number | null
          rubric_id?: string | null
          teacher_override?: boolean | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scores_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scores_rubric_id_fkey"
            columns: ["rubric_id"]
            isOneToOne: false
            referencedRelation: "rubrics"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          ai_auto_reject_enabled: boolean | null
          ai_daily_limit: number | null
          ai_detection_enabled: boolean | null
          ai_detection_threshold: number | null
          ai_feedback_verbosity: string | null
          ai_hourly_limit: number | null
          ai_training_mode: string | null
          analysis_provider: string | null
          auto_handwriting_grouping_enabled: boolean | null
          auto_push_enabled: boolean | null
          auto_push_regents_threshold: number | null
          auto_push_threshold: number | null
          auto_push_worksheet_count: number | null
          auto_qr_scan_enabled: boolean | null
          blank_page_auto_score: boolean | null
          blank_page_comment: string | null
          blank_page_score: number | null
          created_at: string
          grade_curve_percent: number | null
          grade_floor: number | null
          grade_floor_with_effort: number | null
          grading_scale: Json | null
          id: string
          integration_webhook_api_key: string | null
          integration_webhook_enabled: boolean | null
          integration_webhook_url: string | null
          level_a_notifications: boolean | null
          level_drop_notifications: boolean | null
          low_regents_alerts_enabled: boolean | null
          low_regents_parent_alerts_enabled: boolean | null
          low_regents_threshold: number | null
          parent_ai_notifications: boolean | null
          sister_app_coin_multiplier: number | null
          sister_app_sync_enabled: boolean | null
          sister_app_xp_multiplier: number | null
          teacher_id: string
          updated_at: string
        }
        Insert: {
          ai_auto_reject_enabled?: boolean | null
          ai_daily_limit?: number | null
          ai_detection_enabled?: boolean | null
          ai_detection_threshold?: number | null
          ai_feedback_verbosity?: string | null
          ai_hourly_limit?: number | null
          ai_training_mode?: string | null
          analysis_provider?: string | null
          auto_handwriting_grouping_enabled?: boolean | null
          auto_push_enabled?: boolean | null
          auto_push_regents_threshold?: number | null
          auto_push_threshold?: number | null
          auto_push_worksheet_count?: number | null
          auto_qr_scan_enabled?: boolean | null
          blank_page_auto_score?: boolean | null
          blank_page_comment?: string | null
          blank_page_score?: number | null
          created_at?: string
          grade_curve_percent?: number | null
          grade_floor?: number | null
          grade_floor_with_effort?: number | null
          grading_scale?: Json | null
          id?: string
          integration_webhook_api_key?: string | null
          integration_webhook_enabled?: boolean | null
          integration_webhook_url?: string | null
          level_a_notifications?: boolean | null
          level_drop_notifications?: boolean | null
          low_regents_alerts_enabled?: boolean | null
          low_regents_parent_alerts_enabled?: boolean | null
          low_regents_threshold?: number | null
          parent_ai_notifications?: boolean | null
          sister_app_coin_multiplier?: number | null
          sister_app_sync_enabled?: boolean | null
          sister_app_xp_multiplier?: number | null
          teacher_id: string
          updated_at?: string
        }
        Update: {
          ai_auto_reject_enabled?: boolean | null
          ai_daily_limit?: number | null
          ai_detection_enabled?: boolean | null
          ai_detection_threshold?: number | null
          ai_feedback_verbosity?: string | null
          ai_hourly_limit?: number | null
          ai_training_mode?: string | null
          analysis_provider?: string | null
          auto_handwriting_grouping_enabled?: boolean | null
          auto_push_enabled?: boolean | null
          auto_push_regents_threshold?: number | null
          auto_push_threshold?: number | null
          auto_push_worksheet_count?: number | null
          auto_qr_scan_enabled?: boolean | null
          blank_page_auto_score?: boolean | null
          blank_page_comment?: string | null
          blank_page_score?: number | null
          created_at?: string
          grade_curve_percent?: number | null
          grade_floor?: number | null
          grade_floor_with_effort?: number | null
          grading_scale?: Json | null
          id?: string
          integration_webhook_api_key?: string | null
          integration_webhook_enabled?: boolean | null
          integration_webhook_url?: string | null
          level_a_notifications?: boolean | null
          level_drop_notifications?: boolean | null
          low_regents_alerts_enabled?: boolean | null
          low_regents_parent_alerts_enabled?: boolean | null
          low_regents_threshold?: number | null
          parent_ai_notifications?: boolean | null
          sister_app_coin_multiplier?: number | null
          sister_app_sync_enabled?: boolean | null
          sister_app_xp_multiplier?: number | null
          teacher_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "settings_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      shared_assignments: {
        Row: {
          class_id: string | null
          coin_reward: number
          created_at: string
          description: string | null
          due_at: string | null
          id: string
          questions: Json
          source_app: string
          status: string
          teacher_id: string
          title: string
          topics: Json
          updated_at: string
          worksheet_id: string | null
          xp_reward: number
        }
        Insert: {
          class_id?: string | null
          coin_reward?: number
          created_at?: string
          description?: string | null
          due_at?: string | null
          id?: string
          questions?: Json
          source_app?: string
          status?: string
          teacher_id: string
          title: string
          topics?: Json
          updated_at?: string
          worksheet_id?: string | null
          xp_reward?: number
        }
        Update: {
          class_id?: string | null
          coin_reward?: number
          created_at?: string
          description?: string | null
          due_at?: string | null
          id?: string
          questions?: Json
          source_app?: string
          status?: string
          teacher_id?: string
          title?: string
          topics?: Json
          updated_at?: string
          worksheet_id?: string | null
          xp_reward?: number
        }
        Relationships: [
          {
            foreignKeyName: "shared_assignments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shared_assignments_worksheet_id_fkey"
            columns: ["worksheet_id"]
            isOneToOne: false
            referencedRelation: "worksheets"
            referencedColumns: ["id"]
          },
        ]
      }
      simple_mode_suggestions: {
        Row: {
          approval_token: string | null
          approved_at: string | null
          class_id: string | null
          created_at: string
          id: string
          lesson_plan_id: string | null
          reason: string
          source_data: Json | null
          status: string
          suggested_standard: string | null
          suggested_topic: string
          teacher_id: string
          token_expires_at: string | null
          worksheet_id: string | null
        }
        Insert: {
          approval_token?: string | null
          approved_at?: string | null
          class_id?: string | null
          created_at?: string
          id?: string
          lesson_plan_id?: string | null
          reason: string
          source_data?: Json | null
          status?: string
          suggested_standard?: string | null
          suggested_topic: string
          teacher_id: string
          token_expires_at?: string | null
          worksheet_id?: string | null
        }
        Update: {
          approval_token?: string | null
          approved_at?: string | null
          class_id?: string | null
          created_at?: string
          id?: string
          lesson_plan_id?: string | null
          reason?: string
          source_data?: Json | null
          status?: string
          suggested_standard?: string | null
          suggested_topic?: string
          teacher_id?: string
          token_expires_at?: string | null
          worksheet_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "simple_mode_suggestions_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "simple_mode_suggestions_lesson_plan_id_fkey"
            columns: ["lesson_plan_id"]
            isOneToOne: false
            referencedRelation: "lesson_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "simple_mode_suggestions_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "simple_mode_suggestions_worksheet_id_fkey"
            columns: ["worksheet_id"]
            isOneToOne: false
            referencedRelation: "worksheets"
            referencedColumns: ["id"]
          },
        ]
      }
      sister_app_sync_log: {
        Row: {
          action: string
          created_at: string
          data: Json
          id: string
          processed: boolean
          processed_at: string | null
          source_app: string
          student_id: string | null
          teacher_id: string
        }
        Insert: {
          action: string
          created_at?: string
          data?: Json
          id?: string
          processed?: boolean
          processed_at?: string | null
          source_app?: string
          student_id?: string | null
          teacher_id: string
        }
        Update: {
          action?: string
          created_at?: string
          data?: Json
          id?: string
          processed?: boolean
          processed_at?: string | null
          source_app?: string
          student_id?: string | null
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sister_app_sync_log_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      student_activity_feed: {
        Row: {
          activity_type: string
          created_at: string
          description: string | null
          id: string
          is_read: boolean
          metadata: Json | null
          student_id: string
          title: string
        }
        Insert: {
          activity_type: string
          created_at?: string
          description?: string | null
          id?: string
          is_read?: boolean
          metadata?: Json | null
          student_id: string
          title: string
        }
        Update: {
          activity_type?: string
          created_at?: string
          description?: string | null
          id?: string
          is_read?: boolean
          metadata?: Json | null
          student_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_activity_feed_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_assignment_submissions: {
        Row: {
          answers: Json
          assignment_id: string
          created_at: string
          graded_at: string | null
          id: string
          score: number | null
          started_at: string | null
          status: string
          student_id: string
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          answers?: Json
          assignment_id: string
          created_at?: string
          graded_at?: string | null
          id?: string
          score?: number | null
          started_at?: string | null
          status?: string
          student_id: string
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          answers?: Json
          assignment_id?: string
          created_at?: string
          graded_at?: string | null
          id?: string
          score?: number | null
          started_at?: string | null
          status?: string
          student_id?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_assignment_submissions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "shared_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_assignment_submissions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_magic_links: {
        Row: {
          class_id: string
          created_at: string
          email: string
          expires_at: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          class_id: string
          created_at?: string
          email: string
          expires_at: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          class_id?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_magic_links_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      student_rewards: {
        Row: {
          coin_cost: number | null
          earned_at: string
          id: string
          reward_data: Json | null
          reward_name: string
          reward_type: string
          student_id: string
        }
        Insert: {
          coin_cost?: number | null
          earned_at?: string
          id?: string
          reward_data?: Json | null
          reward_name: string
          reward_type: string
          student_id: string
        }
        Update: {
          coin_cost?: number | null
          earned_at?: string
          id?: string
          reward_data?: Json | null
          reward_name?: string
          reward_type?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_rewards_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_xp_ledger: {
        Row: {
          coin_change: number
          created_at: string
          id: string
          reason: string
          reference_id: string | null
          source: string
          student_id: string
          xp_change: number
        }
        Insert: {
          coin_change?: number
          created_at?: string
          id?: string
          reason: string
          reference_id?: string | null
          source?: string
          student_id: string
          xp_change?: number
        }
        Update: {
          coin_change?: number
          created_at?: string
          id?: string
          reason?: string
          reference_id?: string | null
          source?: string
          student_id?: string
          xp_change?: number
        }
        Relationships: [
          {
            foreignKeyName: "student_xp_ledger_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_xp_summary: {
        Row: {
          current_level: number
          student_id: string
          total_coins: number
          total_xp: number
          updated_at: string
        }
        Insert: {
          current_level?: number
          student_id: string
          total_coins?: number
          total_xp?: number
          updated_at?: string
        }
        Update: {
          current_level?: number
          student_id?: string
          total_coins?: number
          total_xp?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_xp_summary_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: true
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          class_id: string
          created_at: string
          custom_pseudonym: string | null
          email: string | null
          first_name: string
          id: string
          last_name: string
          parent_email: string | null
          student_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          class_id: string
          created_at?: string
          custom_pseudonym?: string | null
          email?: string | null
          first_name: string
          id?: string
          last_name: string
          parent_email?: string | null
          student_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          class_id?: string
          created_at?: string
          custom_pseudonym?: string | null
          email?: string | null
          first_name?: string
          id?: string
          last_name?: string
          parent_email?: string | null
          student_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "students_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_answer_samples: {
        Row: {
          created_at: string
          grading_emphasis: string | null
          id: string
          image_url: string
          key_steps: string[] | null
          notes: string | null
          nys_standard: string | null
          ocr_text: string | null
          question_context: string | null
          teacher_id: string
          topic_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          grading_emphasis?: string | null
          id?: string
          image_url: string
          key_steps?: string[] | null
          notes?: string | null
          nys_standard?: string | null
          ocr_text?: string | null
          question_context?: string | null
          teacher_id: string
          topic_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          grading_emphasis?: string | null
          id?: string
          image_url?: string
          key_steps?: string[] | null
          notes?: string | null
          nys_standard?: string | null
          ocr_text?: string | null
          question_context?: string | null
          teacher_id?: string
          topic_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_answer_samples_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_api_keys: {
        Row: {
          api_key_hash: string
          api_key_prefix: string
          created_at: string
          id: string
          is_active: boolean
          last_used_at: string | null
          name: string
          teacher_id: string
        }
        Insert: {
          api_key_hash: string
          api_key_prefix: string
          created_at?: string
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          name?: string
          teacher_id: string
        }
        Update: {
          api_key_hash?: string
          api_key_prefix?: string
          created_at?: string
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          name?: string
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_api_keys_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      topics: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_default: boolean | null
          name: string
          parent_id: string | null
          sort_order: number | null
          teacher_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean | null
          name: string
          parent_id?: string | null
          sort_order?: number | null
          teacher_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean | null
          name?: string
          parent_id?: string | null
          sort_order?: number | null
          teacher_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "topics_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "topics_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      worksheet_submissions: {
        Row: {
          class_id: string
          created_at: string
          feedback: string | null
          id: string
          score: number | null
          status: string
          student_id: string
          submitted_at: string | null
          updated_at: string
          worksheet_id: string
        }
        Insert: {
          class_id: string
          created_at?: string
          feedback?: string | null
          id?: string
          score?: number | null
          status?: string
          student_id: string
          submitted_at?: string | null
          updated_at?: string
          worksheet_id: string
        }
        Update: {
          class_id?: string
          created_at?: string
          feedback?: string | null
          id?: string
          score?: number | null
          status?: string
          student_id?: string
          submitted_at?: string | null
          updated_at?: string
          worksheet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worksheet_submissions_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worksheet_submissions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worksheet_submissions_worksheet_id_fkey"
            columns: ["worksheet_id"]
            isOneToOne: false
            referencedRelation: "worksheets"
            referencedColumns: ["id"]
          },
        ]
      }
      worksheets: {
        Row: {
          class_id: string | null
          created_at: string
          due_date: string | null
          id: string
          is_assigned: boolean | null
          is_shared: boolean
          questions: Json
          settings: Json
          share_code: string | null
          teacher_id: string
          teacher_name: string | null
          title: string
          topics: Json
          updated_at: string
        }
        Insert: {
          class_id?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          is_assigned?: boolean | null
          is_shared?: boolean
          questions?: Json
          settings?: Json
          share_code?: string | null
          teacher_id: string
          teacher_name?: string | null
          title: string
          topics?: Json
          updated_at?: string
        }
        Update: {
          class_id?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          is_assigned?: boolean | null
          is_shared?: boolean
          questions?: Json
          settings?: Json
          share_code?: string | null
          teacher_id?: string
          teacher_name?: string | null
          title?: string
          topics?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "worksheets_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worksheets_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      batch_cost_summary: {
        Row: {
          completed_tasks: number | null
          failed_tasks: number | null
          first_task: string | null
          last_completed: string | null
          pending_tasks: number | null
          task_type: string | null
          total_tasks: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      check_ai_rate_limit: {
        Args: {
          p_daily_limit?: number
          p_hourly_limit?: number
          p_user_id: string
        }
        Returns: Json
      }
      get_ai_learning_stats: { Args: { teacher_uuid: string }; Returns: Json }
      get_classes_with_student_counts: {
        Args: { teacher_uuid: string }
        Returns: {
          archived_at: string
          class_period: string
          created_at: string
          id: string
          join_code: string
          name: string
          school_year: string
          student_count: number
        }[]
      }
      get_dashboard_stats: { Args: { teacher_uuid: string }; Returns: Json }
      get_struggling_students: {
        Args: { student_limit?: number; teacher_uuid: string }
        Returns: Json
      }
      get_student_dashboard: { Args: { p_student_id: string }; Returns: Json }
      get_verification_stats: {
        Args: { days_back?: number; teacher_uuid: string }
        Returns: Json
      }
      is_student_in_class: {
        Args: { p_class_id: string; p_user_id: string }
        Returns: boolean
      }
      join_class_with_code: {
        Args: { p_join_code: string; p_user_email: string }
        Returns: Json
      }
    }
    Enums: {
      attempt_status: "pending" | "analyzed" | "reviewed"
      user_role: "teacher" | "student" | "admin"
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
      attempt_status: ["pending", "analyzed", "reviewed"],
      user_role: ["teacher", "student", "admin"],
    },
  },
} as const
