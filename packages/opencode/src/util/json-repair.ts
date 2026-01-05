
/**
 * Robustly parses JSON that might have common LLM-generated errors.
 * 
 * Features:
 * 1. Normalizes trailing commas
 * 2. Escapes control characters (newlines, tabs) inside string literals
 * 3. Strips markdown code block wrappers (```json ... ```)
 * 
 * @param raw The raw JSON string to parse
 * @returns The parsed object
 * @throws Error if parsing fails even after repair
 */
export function repairAndParseJson(raw: string): any {
    let text = raw.trim()

    // Phase 1: Basic structural cleaning
    // Normalize trailing commas in objects and arrays
    // Matches , followed by whitespace and a closing brace/bracket
    text = text.replace(/,\s*([\]}])/g, '$1')

    // Phase 2: Structural Character Walk
    // We walk the string to correctly identify and escape content inside string literals
    // without affecting the JSON structure itself.
    let inString = false
    let escaped = false
    let repaired = ""

    for (let i = 0; i < text.length; i++) {
        const char = text[i]

        if (char === '"' && !escaped) {
            if (!inString) {
                inString = true
                repaired += char
            } else {
                // We are in a string and found a quote. Is it a closing quote or an unescaped inner quote?
                // We look ahead to see if the next non-whitespace character is a structural delimiter (:, }, ], ,)
                // or if we are at the end of the string.
                const remainder = text.slice(i + 1)
                const isDelimiter = /^(\s*[,}\]:])|^\s*$/.test(remainder)

                if (isDelimiter) {
                    inString = false
                    repaired += char
                } else {
                    // It's likely an inner quote (e.g. "some "quoted" text") -> escape it
                    repaired += '\\"'
                }
            }
        } else if (inString) {
            // Inside a string literal - escape or transform problematic chars
            if (char === '\n') repaired += '\\n'
            else if (char === '\r') repaired += '\\r'
            else if (char === '\t') repaired += '\\t'
            else if (char === '\\' && !escaped) {
                escaped = true
                repaired += char
            } else {
                repaired += char
                escaped = false
            }
        } else {
            repaired += char
            escaped = false
        }
    }

    // Phase 3: Content-specific repair (Triple Backticks)
    // Now that we have valid JSON-escaped strings, we can specifically strip 
    // markdown markers that AI hallucinates inside suggestion/body fields.
    // We use a simplified regex because control chars are now escaped.
    repaired = repaired
        .replace(/```[a-z]*\\n?/gi, '') // Remove opening blocks (escaped)
        .replace(/\\\\n?```/gi, '')     // Remove closing blocks (escaped)
        .replace(/```[a-z]*\\n?/gi, '') // Remove opening blocks (raw, though unlikely now)
        .replace(/\\n?```/gi, '')       // Remove closing blocks (raw, though unlikely now)

    try {
        return JSON.parse(repaired)
    } catch (e: any) {
        console.error("JSON parse failed after repair. Repaired string:", repaired)
        throw new Error(`JSON Repair failed: ${e.message}`)
    }
}
