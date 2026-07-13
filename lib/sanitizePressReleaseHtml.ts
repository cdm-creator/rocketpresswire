import sanitizeHtml from "sanitize-html"

export function sanitizePressReleaseHtml(value: unknown): string {
    if (typeof value !== "string" || !value.trim()) {
        return ""
    }

    return sanitizeHtml(value, {
        allowedTags: [
            "p",
            "br",
            "h1",
            "h2",
            "h3",
            "h4",
            "h5",
            "h6",
            "strong",
            "b",
            "em",
            "i",
            "u",
            "s",
            "ul",
            "ol",
            "li",
            "blockquote",
            "a",
            "img",
            "figure",
            "figcaption",
            "table",
            "thead",
            "tbody",
            "tr",
            "th",
            "td",
            "hr",
            "span",
        ],

        allowedAttributes: {
            a: ["href", "title", "target", "rel"],
            img: [
                "src",
                "alt",
                "title",
                "width",
                "height",
                "loading",
            ],
            th: ["colspan", "rowspan"],
            td: ["colspan", "rowspan"],
        },

        allowedSchemes: ["http", "https", "mailto", "tel"],

        allowedSchemesByTag: {
            a: ["http", "https", "mailto", "tel"],
            img: ["http", "https"],
        },

        allowProtocolRelative: false,

        transformTags: {
            a: (_tagName, attribs) => ({
                tagName: "a",
                attribs: {
                    ...attribs,
                    target: "_blank",
                    rel: "noopener noreferrer nofollow",
                },
            }),

            img: (_tagName, attribs) => ({
                tagName: "img",
                attribs: {
                    ...attribs,
                    loading: "lazy",
                },
            }),
        },

        disallowedTagsMode: "discard",
    })
}
