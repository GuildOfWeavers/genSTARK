"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const utils = require("./utils");
// CLASS DEFINITION
// ================================================================================================
class Serializer {
    // CONSTRUCTOR
    // --------------------------------------------------------------------------------------------
    constructor(config, hashDigestSize) {
        this.fieldElementSize = config.field.elementSize;
        this.stateWidth = config.stateWidth;
        this.secretInputCount = config.secretInputCount;
        this.hashDigestSize = hashDigestSize;
    }
    // EVALUATION SERIALIZER/PARSER
    // --------------------------------------------------------------------------------------------
    mergeValues(pValues, sValues, position) {
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
    parseValues(buffer) {
        const elementSize = this.fieldElementSize;
        let offset = 0;
        const pValues = new Array(this.stateWidth);
        for (let i = 0; i < this.stateWidth; i++, offset += elementSize) {
            pValues[i] = utils.readBigInt(buffer, offset, this.fieldElementSize);
        }
        const sValues = new Array(this.secretInputCount);
        for (let i = 0; i < this.secretInputCount; i++, offset += elementSize) {
            sValues[i] = utils.readBigInt(buffer, offset, this.fieldElementSize);
        }
        return [pValues, sValues];
    }
    // PROOF SERIALIZER/PARSER
    // --------------------------------------------------------------------------------------------
    serializeProof(proof) {
        const size = utils.sizeOf(proof, this.hashDigestSize);
        const buffer = Buffer.allocUnsafe(size.total);
        let offset = 0;
        // values
        offset = utils.writeArray(buffer, offset, proof.values);
        // evProof
        offset += proof.evProof.root.copy(buffer, offset);
        offset = buffer.writeUInt8(proof.evProof.depth, offset);
        offset = utils.writeMatrix(buffer, offset, proof.evProof.nodes, this.hashDigestSize);
        // lcProof
        offset += proof.lcProof.root.copy(buffer, offset);
        offset = buffer.writeUInt8(proof.lcProof.depth, offset);
        offset = utils.writeMatrix(buffer, offset, proof.lcProof.nodes, this.fieldElementSize);
        // ldProof
        offset = buffer.writeUInt8(proof.ldProof.components.length, offset);
        for (let i = 0; i < proof.ldProof.components.length; i++) {
            let component = proof.ldProof.components[i];
            offset += component.columnRoot.copy(buffer, offset);
            offset = utils.writeMerkleProof(buffer, offset, component.columnProof, this.fieldElementSize);
            offset = utils.writeMerkleProof(buffer, offset, component.polyProof, this.fieldElementSize);
        }
        offset = utils.writeArray(buffer, offset, proof.ldProof.remainder);
        // return the buffer
        return buffer;
    }
    parseProof(buffer) {
        let offset = 0;
        // values
        const valueCount = this.getValueCount();
        const valueSize = valueCount * this.fieldElementSize;
        const valueInfo = utils.readArray(buffer, offset, valueSize);
        offset = valueInfo.offset;
        // evProof
        const evRoot = Buffer.allocUnsafe(this.hashDigestSize);
        offset += buffer.copy(evRoot, 0, offset, offset + this.hashDigestSize);
        const evDepth = buffer.readUInt8(offset);
        offset += 1;
        const evNodeInfo = utils.readMatrix(buffer, offset, this.hashDigestSize, this.hashDigestSize);
        offset = evNodeInfo.offset;
        // lcProof
        const lcRoot = Buffer.allocUnsafe(this.hashDigestSize);
        offset += buffer.copy(lcRoot, 0, offset, offset + this.hashDigestSize);
        const lcDepth = buffer.readUInt8(offset);
        offset += 1;
        const lcNodeInfo = utils.readMatrix(buffer, offset, this.fieldElementSize, this.hashDigestSize);
        offset = lcNodeInfo.offset;
        // ldProof
        const componentCount = buffer.readUInt8(offset);
        offset += 1;
        const components = new Array(componentCount);
        for (let i = 0; i < componentCount; i++) {
            let columnRoot = Buffer.allocUnsafe(this.hashDigestSize);
            offset += buffer.copy(columnRoot, 0, offset, offset + this.hashDigestSize);
            let columnProofInfo = utils.readMerkleProof(buffer, offset, this.fieldElementSize, this.hashDigestSize);
            offset = columnProofInfo.offset;
            let polyProofInfo = utils.readMerkleProof(buffer, offset, this.fieldElementSize, this.hashDigestSize);
            offset = polyProofInfo.offset;
            components[i] = { columnRoot, columnProof: columnProofInfo.proof, polyProof: polyProofInfo.proof };
        }
        const remainderInfo = utils.readArray(buffer, offset, this.fieldElementSize);
        offset = remainderInfo.offset;
        // build and return the proof
        return {
            values: valueInfo.values,
            evProof: {
                root: evRoot,
                nodes: evNodeInfo.matrix,
                depth: evDepth
            },
            lcProof: {
                root: lcRoot,
                nodes: lcNodeInfo.matrix,
                depth: lcDepth,
            },
            ldProof: { components, remainder: remainderInfo.values }
        };
    }
    // PRIVATE METHODS
    // --------------------------------------------------------------------------------------------
    getValueCount() {
        return this.stateWidth + this.secretInputCount;
    }
}
exports.Serializer = Serializer;
//# sourceMappingURL=Serializer.js.map