export function vector(v: bigint[]): string {
    return `[${v.join(', ')}]`;
}

export function matrix(m: bigint[][]): string {
    const rows: string[] = [];
    for (let i = 0; i < m.length; i++) {
        rows.push(`[${m[i].join(', ')}]`);
    }
    return `[${rows.join(', ')}]`;
}