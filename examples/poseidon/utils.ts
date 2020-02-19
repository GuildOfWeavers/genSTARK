// IMPORTS
// ================================================================================================
import * as assert from 'assert';
import * as crypto from 'crypto';
import { FiniteField } from "@guildofweavers/galois";

// MODULE VARIABLES
// ================================================================================================
const CONSTANT_SEED = 'Hades';

// INTERFACES
// ================================================================================================
export interface HashFunction {
    (inputs: bigint[]): bigint[];
}

// PUBLIC FUNCTIONS
// ================================================================================================
export function createHash(field: FiniteField, exp: bigint, rf: number, rp: number, stateWidth: number): HashFunction {
    const m = stateWidth;
    const mds = field.newMatrixFrom(getMdsMatrix(field, m));
    const ark = getRoundConstants(field, m, rf + rp).map(v => field.newVectorFrom(v));

    return function(inputs: bigint[]) {
        let stateValues: bigint[] = [];
        assert(inputs.length < m);
        assert(inputs.length > 0);
        for (let i = 0; i < inputs.length; i++) stateValues[i] = inputs[i];
        for (let i = inputs.length; i < m; i++) stateValues[i] = field.zero;
    
        let state = field.newVectorFrom(stateValues);
        for (let i = 0; i < rf + rp; i++) {
            state = field.addVectorElements(state, ark[i]);
            
            if ((i < rf / 2) || (i >= rf / 2 + rp)) {
                state = field.expVectorElements(state, exp);
            } else {
                stateValues = state.toValues();
                stateValues[m - 1] = field.exp(stateValues[m - 1], exp);
                state = field.newVectorFrom(stateValues);
            }
    
            state = field.mulMatrixByVector(mds, state);
        }
        return state.toValues().slice(0, 2);
    }
}

export function createHash2(field: FiniteField, exp: bigint, rf: number, rp: number, stateWidth: number, rc: bigint[][]): HashFunction {
    const m = stateWidth;
    const mds = field.newMatrixFrom(getMdsMatrix(field, m));
    const ark = rc.map(v => field.newVectorFrom(v));

    return function(inputs: bigint[]) {
        let stateValues: bigint[] = [];
        assert(inputs.length < m);
        assert(inputs.length > 0);
        for (let i = 0; i < inputs.length; i++) stateValues[i] = inputs[i];
        for (let i = inputs.length; i < m; i++) stateValues[i] = field.zero;
    
        let state = field.newVectorFrom(stateValues);
        for (let i = 0; i < rf + rp; i++) {
            state = field.addVectorElements(state, ark[i]);
            
            if ((i < rf / 2) || (i >= rf / 2 + rp)) {
                state = field.expVectorElements(state, exp);
            } else {
                stateValues = state.toValues();
                stateValues[m - 1] = field.exp(stateValues[m - 1], exp);
                state = field.newVectorFrom(stateValues);
            }
    
            state = field.mulMatrixByVector(mds, state);
        }
        return state.toValues().slice(0, 2);
    }
}

export function getRoundConstants(field: FiniteField, width: number, rounds: number): bigint[][] {
    const result = new Array<bigint[]>(rounds);
    for (let i = 0, c = 0; i < rounds; i++) {
        let values = new Array<bigint>(width);
        for (let j = 0; j < width; j++, c++) {
            let value = crypto.createHash('sha256').update(`${CONSTANT_SEED}${c}`).digest();
            values[j] = field.add(BigInt(`0x${value.toString('hex')}`), 0n);
        }   
        result[i] = values;
    }
    return result;
}

export function getMdsMatrix(field: FiniteField, width: number): bigint[][] {
    const xValues = getConstants(field, 'HadesMDSx', width);
    const yValues = getConstants(field, 'HadesMDSy', width);

    const values = [...xValues, ...yValues];
    if (new Set(values).size !== width * 2) throw new Error('MDS values are not all different');

    const result = new Array<bigint[]>(width);
    for (let i = 0; i < width; i++) {
        result[i] = new Array<bigint>(width);
        for (let j = 0; j < width; j++) {
            result[i][j] = field.inv(field.sub(xValues[i], yValues[j]));
        }
    }
    return result;
};

export function transpose(matrix: bigint[][]): bigint[][] {
    const rowCount = matrix.length;
    const colCount = matrix[0].length;

    const result = new Array<bigint[]>(colCount);
    for (let i = 0; i < colCount; i++) {
        result[i] = new Array<bigint>(rowCount);
        for (let j = 0; j < rowCount; j++) {
            result[i][j] = matrix[j][i];
        }
    }

    return result;
}

export function getRoundControls(fRounds: number, pRounds: number, steps: number) {
    const result: bigint[] = [];
    for (let i = 0; i < fRounds + pRounds; i++) {
        if ((i < fRounds / 2) || (i >= fRounds / 2 + pRounds)) {
            result.push(1n);
        } else {
            result.push(0n);
        }
    }

    while (result.length < steps) {
        result.push(0n);
    }

    return result;
}

// HELPER FUNCTION
// ================================================================================================
function getConstants(field: FiniteField, seed: string, count: number): bigint[] {
    const result = new Array<bigint>(count);
    for (let i = 0; i < count; i++) {
        let value = crypto.createHash('sha256').update(`${seed}${i}`).digest();
        result[i] = field.add(BigInt(`0x${value.toString('hex')}`), 0n);
    }
    return result;
}

// MERKLE TREE
// ================================================================================================
export class MerkleTree {

    readonly nodes: Array<[bigint,bigint]>;

    constructor(values: Array<[bigint,bigint]>, hash: HashFunction) {
        this.nodes = [...new Array(values.length), ...values];
        for (let i = values.length - 1; i > 0; i--) {
            this.nodes[i] = hash(this.nodes[i * 2].concat(this.nodes[i * 2 + 1])) as [bigint, bigint];
        }
    }

    get root(): [bigint,bigint] {
        return this.nodes[1];
    }

    prove(index: number): Array<[bigint,bigint]> {
        index += Math.floor(this.nodes.length / 2);
        const proof = [this.nodes[index]];
        while (index > 1) {
            proof.push(this.nodes[index ^ 1]);
            index = index >> 1;
        }
        return proof;
    }

    static verify(root: [bigint,bigint], index: number, proof: Array<[bigint,bigint]>, hash: HashFunction): boolean {
        index += 2**proof.length;

        let v = proof[0];
        for (let i = 1; i < proof.length; i++) {
            if (index & 1) {
                v = hash(proof[i].concat(v)) as [bigint, bigint];
            }
            else {
                v = hash(v.concat(proof[i])) as [bigint, bigint];
            }
            index = index >> 1;
        }

        return root[0] === v[0] && root[1] === v[1];
    }
}

export class MerkleTree2 {

    readonly nodes: bigint[];

    constructor(values: bigint[], hash: HashFunction) {
        this.nodes = [...new Array(values.length), ...values];
        for (let i = values.length - 1; i > 0; i--) {
            this.nodes[i] = hash([this.nodes[i * 2], this.nodes[i * 2 + 1]])[0];
        }
    }

    get root(): bigint {
        return this.nodes[1];
    }

    prove(index: number): bigint[] {
        index += Math.floor(this.nodes.length / 2);
        const proof = [this.nodes[index]];
        while (index > 1) {
            proof.push(this.nodes[index ^ 1]);
            index = index >> 1;
        }
        return proof;
    }

    static verify(root: bigint, index: number, proof: bigint[], hash: HashFunction): boolean {
        index += 2**proof.length;

        let v = proof[0];
        for (let i = 1; i < proof.length; i++) {
            if (index & 1) {
                v = hash([proof[i], v])[0];
            }
            else {
                v = hash([v, proof[i]])[0];
            }
            index = index >> 1;
        }

        return root === v;
    }
}