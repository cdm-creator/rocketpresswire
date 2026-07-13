import type { User } from "@supabase/supabase-js"
import { supabaseAdmin } from "@/lib/supabase-admin"

type AdminRow = {
    email: string
    name?: string | null
    is_active: boolean
}

export type ActiveAdmin = {
    user: User
    email: string
    admin: {
        email: string
        name: string | null
        is_active: boolean
    }
}

export class AdminAuthorizationError extends Error {
    status: 401 | 403

    constructor(message: string, status: 401 | 403) {
        super(message)
        this.name = "AdminAuthorizationError"
        this.status = status
    }
}

function getBearerToken(request: Request) {
    const authorization = request.headers.get("authorization")

    if (!authorization) {
        throw new AdminAuthorizationError("Unauthorized", 401)
    }

    const parts = authorization.split(" ")

    if (parts.length !== 2) {
        throw new AdminAuthorizationError("Unauthorized", 401)
    }

    const [scheme, token] = parts

    if (scheme.toLowerCase() !== "bearer" || !token.trim()) {
        throw new AdminAuthorizationError("Unauthorized", 401)
    }

    return token.trim()
}

export async function requireActiveAdmin(request: Request): Promise<ActiveAdmin> {
    const accessToken = getBearerToken(request)

    const {
        data: { user },
        error: authError,
    } = await supabaseAdmin.auth.getUser(accessToken)

    if (authError || !user) {
        throw new AdminAuthorizationError("Unauthorized", 401)
    }

    const email = user.email?.trim().toLowerCase()

    if (!email) {
        throw new AdminAuthorizationError("Unauthorized", 401)
    }

    const { data: admin, error: adminError } = await supabaseAdmin
        .from("admin_users")
        .select("email,name,is_active")
        .ilike("email", email)
        .eq("is_active", true)
        .maybeSingle<AdminRow>()

    if (adminError) {
        throw adminError
    }

    if (!admin) {
        throw new AdminAuthorizationError("Forbidden", 403)
    }

    return {
        user,
        email,
        admin: {
            email: admin.email.trim().toLowerCase(),
            name: typeof admin.name === "string" ? admin.name : null,
            is_active: admin.is_active,
        },
    }
}
