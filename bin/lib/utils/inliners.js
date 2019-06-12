"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
function vector(v) {
    return `[${v.join(', ')}]`;
}
exports.vector = vector;
function matrix(m) {
    const rows = [];
    for (let i = 0; i < m.length; i++) {
        rows.push(`[${m[i].join(', ')}]`);
    }
    return `[${rows.join(', ')}]`;
}
exports.matrix = matrix;
//# sourceMappingURL=inliners.js.map