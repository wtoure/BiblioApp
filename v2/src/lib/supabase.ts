import { createClient } from '@supabase/supabase-js'

// La clé anon Supabase est publique par design (client-side).
// Valeurs par défaut = projet de production ; surchargeable via variables Vercel.
const url =
  import.meta.env.VITE_SUPABASE_URL || 'https://ktknaajjtmhevsafrpjv.supabase.co'
const anonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt0a25hYWpqdG1oZXZzYWZycGp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3NjQzMTMsImV4cCI6MjA5NjM0MDMxM30.-g5AA1lnvMYEOp9HrHayTant_FXKhJRoW65oX9JOwJ4'

export const supabase = createClient(url, anonKey)
