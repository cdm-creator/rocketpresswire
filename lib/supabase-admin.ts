import { createClient } from "@supabase/supabase-js"

if (!process.env.SUPABASE_URL) {
    throw new Error("Missing SUPABASE_URL")
}

if (!process.env.SUPABASE_SECRET_KEY) {
    throw new Error("Missing SUPABASE_SECRET_KEY")
}

export const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SECRET_KEY,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    }
)
