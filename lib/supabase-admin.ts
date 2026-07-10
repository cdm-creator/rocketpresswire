import { createClient } from "@supabase/supabase-js"

if (!process.env.SUPABASE_URL) {
    throw new Error("Missing SUPABASE_URL")
}

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!serviceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY")
}

export const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    serviceRoleKey,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    }
)
