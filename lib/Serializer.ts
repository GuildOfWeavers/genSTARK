// IMPORTS
// ================================================================================================
import { StarkProof, FriComponent } from "@guildofweavers/genstark";
import { FiniteField, Vector } from '@guildofweavers/air-script';
import { MAX_ARRAY_LENGTH } from "./utils/sizeof";
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
    readonly hashDigestSize     : number;

    // CONSTRUCTOR
    // --------------------------------------------------------------------------------------------
    constructor(config: SerializerConfig, hashDigestSize: number) {
        this.fieldElementSize = config.field.elementSize;
        this.stateWidth = config.stateWidth;
        this.secretInputCount = config.secretInputCount;
        this.hashDigestSize = hashDigestSize;
    }

    // EVALUATION SERIALIZER/PARSER
    // --------------------------------------------------------------------------------------------
    mergeValues(values: Vector[], positions: number[]): Buffer[] {
        const bufferSize = values.length * this.fieldElementSize;    
        const result: Buffer[] = [];
        for (let position of positions) {
            let buffer = Buffer.allocUnsafe(bufferSize), offset = 0;
            for (let vector of values) {
                offset += vector.copyValue(position, buffer, offset);
            }
            result.push(buffer);
        }
    
        return result;
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
    serializeProof(proof: StarkProof): Buffer {
        
        const size = utils.sizeOf(proof, this.fieldElementSize, this.hashDigestSize);
        const buffer = Buffer.allocUnsafe(size.total);

        // root
        let offset = proof.evRoot.copy(buffer, 0);

        // evProof
        const evLeafSize = this.getValueCount() * this.fieldElementSize;
        offset = utils.writeMerkleProof(buffer, offset, proof.evProof, evLeafSize);

        // ldProof
        const ldLeafSize = this.fieldElementSize * 4;
        offset += proof.ldProof.lcRoot.copy(buffer, offset);
        offset = utils.writeMerkleProof(buffer, offset, proof.ldProof.lcProof, ldLeafSize);

        offset = buffer.writeUInt8(proof.ldProof.components.length, offset);
        for (let component of proof.ldProof.components) {
            offset += component.columnRoot.copy(buffer, offset);
            offset = utils.writeMerkleProof(buffer, offset, component.columnProof, ldLeafSize);
            offset = utils.writeMerkleProof(buffer, offset, component.polyProof, ldLeafSize);
        }

        offset = buffer.writeUInt8(proof.ldProof.remainder.length, offset);
        for (let value of proof.ldProof.remainder) {
            offset = utils.writeBigInt(value, buffer, offset, this.fieldElementSize);
        }

        // return the buffer
        return buffer;
    }

    parseProof(buffer: Buffer): StarkProof {
        
        // root
        const evRoot = Buffer.allocUnsafe(this.hashDigestSize);
        let offset = buffer.copy(evRoot, 0, 0, this.hashDigestSize);

        // evProof
        const evLeafSize = this.getValueCount() * this.fieldElementSize;
        const evProof = utils.readMerkleProof(buffer, offset, evLeafSize, this.hashDigestSize);
        offset = evProof.offset;

        // ldProof
        const ldLeafSize = this.fieldElementSize * 4;
        const lcRoot = Buffer.allocUnsafe(this.hashDigestSize);
        let lcProof = utils.readMerkleProof(buffer, offset, ldLeafSize, this.hashDigestSize);
        offset = lcProof.offset;

        const componentCount = buffer.readUInt8(offset); offset += 1;
        const friComponents = new Array<FriComponent>(componentCount);
        for (let i = 0; i < componentCount; i++) {
            let columnRoot = Buffer.allocUnsafe(this.hashDigestSize);
            offset += buffer.copy(columnRoot, 0, offset, offset + this.hashDigestSize);
            let columnProofInfo = utils.readMerkleProof(buffer, offset, ldLeafSize, this.hashDigestSize);
            offset = columnProofInfo.offset;
            let polyProofInfo = utils.readMerkleProof(buffer, offset, ldLeafSize, this.hashDigestSize);
            offset = polyProofInfo.offset;
            friComponents[i] = { columnRoot, columnProof: columnProofInfo.proof, polyProof: polyProofInfo.proof };
        }

        // for remainder array length, zero means 256
        const friRemainderLength = buffer.readUInt8(offset) || MAX_ARRAY_LENGTH; offset += 1;
        const friRemainder = new Array<bigint>(friRemainderLength);
        for (let i = 0; i < friRemainderLength; i++, offset += this.fieldElementSize) {
            utils.readBigInt(buffer, offset, this.fieldElementSize);
        }

        // build and return the proof
        return {
            evRoot          : evRoot,
            evProof         : evProof.proof,
            ldProof: {
                lcRoot      : lcRoot,
                lcProof     : lcProof.proof,
                components  : friComponents, 
                remainder   : friRemainder
            }
        };
    }

    // PRIVATE METHODS
    // --------------------------------------------------------------------------------------------
    private getValueCount(): number {
        return this.stateWidth + this.secretInputCount;
    }
}