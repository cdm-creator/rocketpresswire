export const SOURCE_DOCUMENT_BUCKET = "release-source-documents"
export const SOURCE_DOCUMENT_MAX_SIZE_BYTES = 20 * 1024 * 1024

const EXTENSION_MIME_FALLBACKS = {
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".csv": "text/csv",
} as const

const COMPATIBLE_MIME_TYPES: Record<SourceDocumentExtension, Set<string>> = {
    ".pdf": new Set(["application/pdf"]),
    ".doc": new Set(["application/msword"]),
    ".docx": new Set([
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ]),
    ".xls": new Set(["application/vnd.ms-excel"]),
    ".xlsx": new Set([
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ]),
    ".csv": new Set([
        "text/csv",
        "application/csv",
        "application/vnd.ms-excel",
        "text/plain",
    ]),
}

type SourceDocumentExtension = keyof typeof EXTENSION_MIME_FALLBACKS

export type SourceDocumentMetadata = {
    source_document_path: string | null
    source_document_name: string | null
    source_document_mime_type: string | null
    source_document_size_bytes: number | null
}

export function sanitizeSourceDocumentFilename(filename: string) {
    const fallbackName = "source-document"
    const trimmedName = filename.trim() || fallbackName

    return trimmedName
        .replace(/[/\\]/g, "-")
        .replace(/[^a-zA-Z0-9._-]/g, "-")
        .replace(/-+/g, "-")
}

export function getSourceDocumentExtension(filename: string) {
    const trimmedName = filename.trim()
    const extensionStart = trimmedName.lastIndexOf(".")

    if (extensionStart <= 0 || extensionStart === trimmedName.length - 1) {
        return null
    }

    const extension = trimmedName.slice(extensionStart).toLowerCase()

    return isAllowedSourceDocumentExtension(extension) ? extension : null
}

export function isAllowedSourceDocumentExtension(
    extension: string
): extension is SourceDocumentExtension {
    return Object.hasOwn(EXTENSION_MIME_FALLBACKS, extension)
}

export function normalizeSourceDocumentMimeType(
    extension: SourceDocumentExtension,
    mimeType: string | null | undefined
) {
    const normalizedMimeType = mimeType?.trim().toLowerCase() ?? ""

    if (
        normalizedMimeType &&
        normalizedMimeType !== "application/octet-stream" &&
        COMPATIBLE_MIME_TYPES[extension].has(normalizedMimeType)
    ) {
        return normalizedMimeType
    }

    return EXTENSION_MIME_FALLBACKS[extension]
}

export function isValidSourceDocumentSize(sizeBytes: unknown) {
    return (
        typeof sizeBytes === "number" &&
        Number.isSafeInteger(sizeBytes) &&
        sizeBytes > 0 &&
        sizeBytes <= SOURCE_DOCUMENT_MAX_SIZE_BYTES
    )
}

function optionalMetadataString(value: unknown) {
    if (value === undefined || value === null) {
        return null
    }

    if (typeof value !== "string") {
        return undefined
    }

    const trimmedValue = value.trim()

    return trimmedValue === "" ? null : trimmedValue
}

function optionalMetadataSize(value: unknown) {
    if (value === undefined || value === null) {
        return null
    }

    return isValidSourceDocumentSize(value) ? value : undefined
}

function isSafeStoredPath(path: string) {
    return (
        !path.includes("\\") &&
        path
            .split("/")
            .every((segment) => segment && segment !== "." && segment !== "..")
    )
}

export function normalizeSourceDocumentMetadata(
    input: {
        source_document_path?: unknown
        source_document_name?: unknown
        source_document_mime_type?: unknown
        source_document_size_bytes?: unknown
    },
    userId: string
): SourceDocumentMetadata | null {
    const path = optionalMetadataString(input.source_document_path)
    const name = optionalMetadataString(input.source_document_name)
    const mimeType = optionalMetadataString(input.source_document_mime_type)
    const sizeBytes = optionalMetadataSize(input.source_document_size_bytes)
    const values = [path, name, mimeType, sizeBytes]

    if (values.every((value) => value === null)) {
        return {
            source_document_path: null,
            source_document_name: null,
            source_document_mime_type: null,
            source_document_size_bytes: null,
        } satisfies SourceDocumentMetadata
    }

    if (
        typeof path !== "string" ||
        typeof name !== "string" ||
        sizeBytes === undefined ||
        typeof sizeBytes !== "number" ||
        mimeType === undefined ||
        !path.startsWith(`${userId}/`) ||
        !isSafeStoredPath(path)
    ) {
        return null
    }

    const pathExtension = getSourceDocumentExtension(path)
    const nameExtension = getSourceDocumentExtension(name)

    if (!pathExtension || !nameExtension || pathExtension !== nameExtension) {
        return null
    }

    return {
        source_document_path: path,
        source_document_name: sanitizeSourceDocumentFilename(name),
        source_document_mime_type: normalizeSourceDocumentMimeType(
            pathExtension,
            mimeType
        ),
        source_document_size_bytes: sizeBytes,
    } satisfies SourceDocumentMetadata
}
