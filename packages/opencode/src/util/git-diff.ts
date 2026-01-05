
/**
 * Parse a git patch string to identify valid line numbers for inline comments.
 * 
 * GitHub only allows inline PR comments on the RIGHT side for:
 * 1. Added lines (starting with +)
 * 2. Context lines (starting with space)
 * Deleted lines (starting with -) are not valid for RIGHT side comments.
 * 
 * @param patch The raw git patch string
 * @returns Set of valid line numbers (typically new/right side line numbers)
 */
export function parsePatchForValidLines(patch: string): Set<number> {
    const validLines = new Set<number>()
    const lines = patch.split('\n')
    let currentNewLine = 0

    for (const line of lines) {
        // Parse hunk header: @@ -oldStart,oldCount +newStart,newCount @@
        const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
        if (hunkMatch) {
            currentNewLine = parseInt(hunkMatch[1], 10)
            continue
        }

        if (currentNewLine === 0) continue // Before first hunk

        // Lines starting with '+' are additions (valid)
        // Lines starting with ' ' are context (valid)
        // Lines starting with '-' are deletions (not valid for RIGHT side comments)
        if (line.startsWith('+') || line.startsWith(' ')) {
            validLines.add(currentNewLine)
            currentNewLine++
        } else if (line.startsWith('-')) {
            // Deletion - don't increment newLine counter
        }
    }

    return validLines
}
