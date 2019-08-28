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
    mergeValues(values, positions) {
        const bufferSize = values.length * this.fieldElementSize;
        const result = [];
        for (let position of positions) {
            let buffer = Buffer.allocUnsafe(bufferSize), offset = 0;
            for (let vector of values) {
                offset += vector.copyValue(position, buffer, offset);
            }
            result.push(buffer);
        }
        return result;
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
        offset = utils.writeMatrix(buffer, offset, proof.lcProof.nodes, this.hashDigestSize);
        offset = utils.writeArray(buffer, offset, proof.lcProof.values);
        // ldProof
        const ldLeafSize = this.fieldElementSize * 4;
        offset = buffer.writeUInt8(proof.ldProof.components.length, offset);
        for (let i = 0; i < proof.ldProof.components.length; i++) {
            let component = proof.ldProof.components[i];
            offset += component.columnRoot.copy(buffer, offset);
            offset = utils.writeMerkleProof(buffer, offset, component.columnProof, ldLeafSize);
            offset = utils.writeMerkleProof(buffer, offset, component.polyProof, ldLeafSize);
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
        const lcValues = utils.readArray(buffer, offset, this.fieldElementSize * 4);
        offset = lcValues.offset;
        // ldProof
        const ldLeafSize = this.fieldElementSize * 4;
        const componentCount = buffer.readUInt8(offset);
        offset += 1;
        const components = new Array(componentCount);
        for (let i = 0; i < componentCount; i++) {
            let columnRoot = Buffer.allocUnsafe(this.hashDigestSize);
            offset += buffer.copy(columnRoot, 0, offset, offset + this.hashDigestSize);
            let columnProofInfo = utils.readMerkleProof(buffer, offset, ldLeafSize, this.hashDigestSize);
            offset = columnProofInfo.offset;
            let polyProofInfo = utils.readMerkleProof(buffer, offset, ldLeafSize, this.hashDigestSize);
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
                values: lcValues.values,
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