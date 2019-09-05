"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const galois_1 = require("@guildofweavers/galois");
const utils_1 = require("./utils");
const F = galois_1.createPrimeField(2n ** 125n + 266n * 2n ** 64n + 1n);
const rf = 8;
const rp = 81;
const r = 2;
const c = 2;
const poseidon = utils_1.createHash(F, 3n, rf, rp, r + c);
console.log(poseidon([1n, 2n]));
console.log(poseidon([3n, 4n]));
console.log('done!');
//# sourceMappingURL=run.js.map