import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://pbqgmvshxkhkrhoxvyws.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBicWdtdnNoeGhrcmhveHZ5d3MiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTc0OTQ2MjE0NCwiZXhwIjoyMDY1MDM4MTQ0fQ.JsySVF_HUpkzxxNokNITdujeoCfTeWut2SxuNhjWK_w";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
