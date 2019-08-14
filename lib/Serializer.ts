// IMPORTS
// ================================================================================================
import { StarkProof, FriComponent, HashAlgorithm } from "@guildofweavers/genstark";
import { FiniteField, Matrix, Vector } from '@guildofweavers/air-script';
import { getHashDigestSize } from '@guildofweavers/merkle';
import * as utils from './utils';

// INTERFACES
// ================================================================================================
interface SerializerConfig {
    readonly field              : FiniteField;
    readonly stateWidth         : number;
    readonly secretInputCount   : number;
}

// CLASS DEFINITION
// ================================================================================================
export class Serializer {

    readonly fieldElementSize   : number;
    readonly stateWidth         : number;
    readonly secretInputCount   : number;

    // CONSTRUCTOR
    // --------------------------------------------------------------------------------------------
    constructor(config: SerializerConfig) {
        this.fieldElementSize = config.field.elementSize;
        this.stateWidth = config.stateWidth;
        this.secretInputCount = config.secretInputCount;
    }

    // EVALUATION SERIALIZER/PARSER
    // --------------------------------------------------------------------------------------------
    mergeValues(pValues: Matrix, sValues: Vector[], position: number): Buffer {
        const valueSize = this.fieldElementSize;
        const valueCount = this.getValueCount();
        const buffer = Buffer.allocUnsafe(valueCount * valueSize);

        let offset = 0;

        for (let register = 0; register < this.stateWidth; register++) {
            offset += pValues.copyValue(register, position, buffer, offset);
        }

        for (let register = 0; register < this.secretInputCount; register++) {
            offset += sValues[register].copyValue(position, buffer, offset);
        }

        return buffer;
    }

    parseValues(buffer: Buffer): [bigint[], bigint[]] {
        const elementSize = this.fieldElementSize;

        let offset = 0;

        const pValues = new Array<bigint>(this.stateWidth);
        for (let i = 0; i < this.stateWidth; i++, offset += elementSize) {
            pValues[i] = utils.readBigInt(buffer, offset, this.fieldElementSize);
        }

        const sValues = new Array<bigint>(this.secretInputCount);
        for (let i = 0; i < this.secretInputCount; i++, offset += elementSize) {
            sValues[i] = utils.readBigInt(buffer, offset, this.fieldElementSize);
        }

        return [pValues, sValues];
    }

    // PROOF SERIALIZER/PARSER
    // --------------------------------------------------------------------------------------------
    serializeProof(proof: StarkProof, hashAlgorithm: HashAlgorithm): Buffer {
        const nodeSize = getHashDigestSize(hashAlgorithm);

        const size = utils.sizeOf(proof, hashAlgorithm);
        const buffer = Buffer.allocUnsafe(size.total);
        let offset = 0;

        // values
        offset = utils.writeArray(buffer, offset, proof.values);

        // evProof
        offset += proof.evProof.root.copy(buffer, offset);
        offset = buffer.writeUInt8(proof.evProof.depth, offset);
        offset = utils.writeMatrix(buffer, offset, proof.evProof.nodes);

        // lcProof
        offset += proof.lcProof.root.copy(buffer, offset);
        offset = buffer.writeUInt8(proof.lcProof.depth, offset);
        offset = utils.writeMatrix(buffer, offset, proof.lcProof.nodes);

        // ldProof
        offset = buffer.writeUInt8(proof.ldProof.components.length, offset);
        for (let i = 0; i < proof.ldProof.components.length; i++) {
            let component = proof.ldProof.components[i];
            offset += component.columnRoot.copy(buffer, offset);
            offset = utils.writeMerkleProof(buffer, offset, component.columnProof, nodeSize);
            offset = utils.writeMerkleProof(buffer, offset, component.polyProof, nodeSize);
        }
        offset = utils.writeArray(buffer, offset, proof.ldProof.remainder);

        // return the buffer
        return buffer;
    }

    parseProof(buffer: Buffer, hashAlgorithm: HashAlgorithm): StarkProof {
        const nodeSize = getHashDigestSize(hashAlgorithm);
        let offset = 0;

        // values
        const valueCount = this.getValueCount();
        const valueSize = valueCount * this.fieldElementSize;
        const valueInfo = utils.readArray(buffer, offset, valueSize); offset = valueInfo.offset;

        // evProof
        const evRoot = Buffer.allocUnsafe(nodeSize);
        offset += buffer.copy(evRoot, 0, offset, offset + nodeSize);
        const evDepth = buffer.readUInt8(offset); offset += 1;
        const evNodeInfo = utils.readMatrix(buffer, offset, nodeSize); offset = evNodeInfo.offset;

        // lcProof
        const lcRoot = Buffer.allocUnsafe(nodeSize);
        offset += buffer.copy(lcRoot, 0, offset, offset + nodeSize);
        const lcDepth = buffer.readUInt8(offset); offset += 1;
        const lcNodeInfo = utils.readMatrix(buffer, offset, nodeSize); offset = lcNodeInfo.offset;

        // ldProof
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
            values      : valueInfo.values,
            evProof: {
                root    : evRoot,
                nodes   : evNodeInfo.matrix,
                depth   : evDepth
            },
            lcProof: {
                root    : lcRoot,
                nodes   : lcNodeInfo.matrix,
                depth   : lcDepth,
            },
            ldProof     : { components, remainder: remainderInfo.values }
        };
    }

    // PRIVATE METHODS
    // --------------------------------------------------------------------------------------------
    private getValueCount(): number {
        return this.stateWidth + this.secretInputCount;
    }
}