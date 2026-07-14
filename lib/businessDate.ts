const ROCKET_PRESS_WIRE_BUSINESS_TIME_ZONE = "America/Chicago"
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

// Rocket Press Wire evaluates business deadlines in America/Chicago.
// Intl handles CST/CDT transitions for this IANA timezone without hardcoded offsets.
const businessDateFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: ROCKET_PRESS_WIRE_BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
})

function padDatePart(value: number) {
    return String(value).padStart(2, "0")
}

function formatUtcDate(date: Date) {
    return `${date.getUTCFullYear()}-${padDatePart(
        date.getUTCMonth() + 1
    )}-${padDatePart(date.getUTCDate())}`
}

function isValidDateOnly(value: string) {
    if (!DATE_ONLY_PATTERN.test(value)) return false

    const [year, month, day] = value.split("-").map(Number)
    const date = new Date(Date.UTC(year, month - 1, day))

    return (
        date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day
    )
}

function formatInBusinessTimeZone(date: Date) {
    const parts = businessDateFormatter.formatToParts(date)
    const getPart = (type: string) =>
        parts.find((part) => part.type === type)?.value

    const year = getPart("year")
    const month = getPart("month")
    const day = getPart("day")

    if (!year || !month || !day) {
        throw new Error("Unable to format business date")
    }

    return `${year}-${month}-${day}`
}

export function getCurrentBusinessDate() {
    return formatInBusinessTimeZone(new Date())
}

export function addDaysToBusinessDate(dateString: string, days: number) {
    if (!isValidDateOnly(dateString)) {
        return null
    }

    const [year, month, day] = dateString.split("-").map(Number)
    const date = new Date(Date.UTC(year, month - 1, day + days))

    return formatUtcDate(date)
}

export function businessDateToUtcNoonISOString(dateString: string) {
    if (!isValidDateOnly(dateString)) {
        return null
    }

    return `${dateString}T12:00:00.000Z`
}

export function normalizeToBusinessDate(value: string | null | undefined) {
    const trimmedValue = value?.trim()

    if (!trimmedValue) {
        return null
    }

    if (DATE_ONLY_PATTERN.test(trimmedValue)) {
        return isValidDateOnly(trimmedValue) ? trimmedValue : null
    }

    const parsedDate = new Date(trimmedValue)

    if (Number.isNaN(parsedDate.getTime())) {
        return null
    }

    return formatInBusinessTimeZone(parsedDate)
}
