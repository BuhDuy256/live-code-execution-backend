export interface CodeSession {
  id: string;
  user_id: string;
  language: string;
  title: string | null;
  source_code: string;
  status: string;
  created_at: string;
  updated_at: string;
}
