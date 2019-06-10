// DIMENSIONS
// ================================================================================================
export type Dimensions = [number, number];

export function isScalar(dim: Dimensions) {
    return (dim[0] === 1 && dim[1] === 1);
}

export function isVector(dim: Dimensions) {
    return (dim[0] > 1 && dim[1] === 1);
}

export function isMatrix(dim: Dimensions) {
    return (dim[1] > 1);
}