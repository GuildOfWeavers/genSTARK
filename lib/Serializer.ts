// IMPORTS
// ================================================================================================
import { StarkProof, FriComponent, HashAlgorithm } from "@guildofweavers/genstark";
import { FiniteField } from '@guildofweavers/air-script';
import { getHashDigestSize } from '@guildofweavers/merkle';
import * as utils from './utils';

// INTERFACES
// ================================================================================================
interface SerializerConfig {
    readonly field              : FiniteField;
    readonly stateWidth         : number;
    readonly secretInputCount   : number;
    readonly constraintCount    : number;
}

// CLASS DEFINITION
// ================================================================================================
export class Serializer {

    readonly fieldElementSize   : number;

    readonly registerCount      : number;
    readonly constraintCount    : number;

    // CONSTRUCTOR
    // --------------------------------------------------------------------------------------------
    constructor(config: SerializerConfig) {
        this.fieldElementSize = config.field.elementSize;
        this.registerCount = config.stateWidth;
        this.constraintCount = config.constraintCount;
    }

    // EVALUATION SERIALIZER/PARSER
    // --------------------------------------------------------------------------------------------
    mergeEvaluations([pEvaluations, bEvaluations, dEvaluations]: bigint[][][],  bCount: number, position: number): Buffer {
        const elementCount = this.registerCount + bCount + this.constraintCount;
        const buffer = Buffer.allocUnsafe(elementCount * this.fieldElementSize);

        let offset = 0;

        for (let i = 0; i < this.registerCount; i++, offset += this.fieldElementSize) {
            let hex = pEvaluations[i][position].toString(16).padStart(this.fieldElementSize * 2, '0');
            buffer.write(hex, offset, this.fieldElementSize, 'hex');
        }

        for (let i = 0; i < bCount; i++, offset += this.fieldElementSize) {
            let hex = bEvaluations[i][position].toString(16).padStart(this.fieldElementSize * 2, '0');
            buffer.write(hex, offset, this.fieldElementSize, 'hex');
        }
    
        for (let i = 0; i < this.constraintCount; i++, offset += this.fieldElementSize) {
            let hex = dEvaluations[i][position].toString(16).padStart(this.fieldElementSize * 2, '0');
            buffer.write(hex, offset, this.fieldElementSize, 'hex');
        }

        return buffer;    
    }

    parseEvaluations(buffer: Buffer, bCount: number): [bigint[], bigint[], bigint[]] {
        
        let offset = 0;

        const pEvaluations = new Array<bigint>(this.registerCount);
        for (let i = 0; i < this.registerCount; i++, offset += this.fieldElementSize) {
            pEvaluations[i] = BigInt('0x' + buffer.toString('hex', offset, offset + this.fieldElementSize));
        }

        const bEvaluations = new Array<bigint>(bCount);
        for (let i = 0; i < bCount; i++, offset += this.fieldElementSize) {
            bEvaluations[i] = BigInt('0x' + buffer.toString('hex', offset, offset + this.fieldElementSize));
        }

        const dEvaluations = new Array<bigint>(this.constraintCount);
        for (let i = 0; i < this.constraintCount; i++, offset += this.fieldElementSize) {
            dEvaluations[i] = BigInt('0x' + buffer.toString('hex', offset, offset + this.fieldElementSize));
        }

        return [pEvaluations, bEvaluations, dEvaluations];
    }

    // PROOF SERIALIZER/PARSER
    // --------------------------------------------------------------------------------------------
    serializeProof(proof: StarkProof, hashAlgorithm: HashAlgorithm): Buffer {
        const nodeSize = getHashDigestSize(hashAlgorithm);
        const valueCount = this.registerCount + this.constraintCount + proof.evaluations.bpc;
        const valueSize = valueCount * this.fieldElementSize;

        const size = utils.sizeOf(proof, valueSize, hashAlgorithm);
        const buffer = Buffer.allocUnsafe(size.total);
        let offset = 0;

        // evaluations
        offset += proof.evaluations.root.copy(buffer, offset);
        offset = buffer.writeUInt8(proof.evaluations.bpc, offset);
        offset = buffer.writeUInt8(proof.evaluations.depth, offset);
        offset = utils.writeArray(buffer, offset, proof.evaluations.values);
        offset = utils.writeMatrix(buffer, offset, proof.evaluations.nodes);

        // degree
        offset += proof.degree.root.copy(buffer, offset);
        offset = utils.writeMerkleProof(buffer, offset, proof.degree.lcProof, nodeSize);
        offset = buffer.writeUInt8(proof.degree.ldProof.components.length, offset);
        for (let i = 0; i < proof.degree.ldProof.components.length; i++) {
            let component = proof.degree.ldProof.components[i];
            offset += component.columnRoot.copy(buffer, offset);
            offset = utils.writeMerkleProof(buffer, offset, component.columnProof, nodeSize);
            offset = utils.writeMerkleProof(buffer, offset, component.polyProof, nodeSize);
        }
        offset = utils.writeArray(buffer, offset, proof.degree.ldProof.remainder);

        // return the buffer
        return buffer;
    }

    parseProof(buffer: Buffer, hashAlgorithm: HashAlgorithm): StarkProof {
        const nodeSize = getHashDigestSize(hashAlgorithm);
        
        // evaluations
        let offset = 0;
        const eRoot = Buffer.allocUnsafe(nodeSize);
        offset += buffer.copy(eRoot, 0, offset, offset + nodeSize);
        const bpc = buffer.readUInt8(offset); offset += 1;
        const eDepth = buffer.readUInt8(offset); offset += 1;
        const valueCount = this.registerCount + this.constraintCount + bpc;
        const valueSize = valueCount * this.fieldElementSize;
        const eValueInfo = utils.readArray(buffer, offset, valueSize); offset = eValueInfo.offset;
        const eNodeInfo = utils.readMatrix(buffer, offset, nodeSize); offset = eNodeInfo.offset;

        // degree
        const dRoot = Buffer.allocUnsafe(nodeSize);
        offset += buffer.copy(dRoot, 0, offset, offset + nodeSize);
        const lcProofInfo = utils.readMerkleProof(buffer, offset, nodeSize); offset = lcProofInfo.offset;
        const componentCount = buffer.readUInt8(offset); offset += 1;

        const components = new Array<FriComponent>(componentCount);
        for (let i = 0; i < componentCount; i++) {
            let columnRoot = Buffer.allocUnsafe(nodeSize);
            offset += buffer.copy(columnRoot, 0, offset, offset + nodeSize);
            let columnProofInfo = utils.readMerkleProof(buffer, offset, nodeSize); offset = columnProofInfo.offset;
            let polyProofInfo = utils.readMerkleProof(buffer, offset, nodeSize); offset = polyProofInfo.offset;
            components[i] = { columnRoot, columnProof: columnProofInfo.proof, polyProof: polyProofInfo.proof };
        }
        const remainderInfo = utils.readArray(buffer, offset, nodeSize);
        offset = remainderInfo.offset;

        // build and return the proof
        return {
            evaluations: {
                root: eRoot,
                values: eValueInfo.values,
                nodes: eNodeInfo.matrix,
                depth: eDepth,
                bpc: bpc
            },
            degree: {
                root: dRoot,
                lcProof: lcProofInfo.proof,
                ldProof: { components, remainder: remainderInfo.values }
            }
        };
    }
}