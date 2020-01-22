"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const air_assembly_1 = require("@guildofweavers/air-assembly");
const air_script_1 = require("@guildofweavers/air-script");
const Stark_1 = require("./lib/Stark");
const utils_1 = require("./lib/utils");
// RE-EXPORTS
// ================================================================================================
var Stark_2 = require("./lib/Stark");
exports.Stark = Stark_2.Stark;
var utils_2 = require("./lib/utils");
exports.inline = utils_2.inline;
var merkle_1 = require("@guildofweavers/merkle");
exports.MerkleTree = merkle_1.MerkleTree;
exports.createHash = merkle_1.createHash;
var galois_1 = require("@guildofweavers/galois");
exports.createPrimeField = galois_1.createPrimeField;
// PUBLIC FUNCTIONS
// ================================================================================================
function instantiate(source, component, options, logger) {
    if (logger === null) {
        logger = utils_1.noopLogger;
    }
    else if (logger === undefined) {
        logger = new utils_1.Logger();
    }
    if (source instanceof air_assembly_1.AirSchema) {
        return new Stark_1.Stark(source, component, options, logger);
    }
    else {
        const schema = air_assembly_1.compile(source);
        return new Stark_1.Stark(schema, component, options, logger);
    }
}
exports.instantiate = instantiate;
function instantiateScript(source, options, logger) {
    if (logger === null) {
        logger = utils_1.noopLogger;
    }
    else if (logger === undefined) {
        logger = new utils_1.Logger();
    }
    const schema = air_script_1.compile(source);
    return instantiate(schema, 'default', options, logger);
}
exports.instantiateScript = instantiateScript;
//# sourceMappingURL=index.js.map