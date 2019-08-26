// IMPORTS
// ================================================================================================
import { Matrix, FiniteField, Vector } from "@guildofweavers/galois";
import { Assertion } from "@guildofweavers/genstark";
import { EvaluationContext, ProofContext, VerificationContext, ConstraintSpecs } from "@guildofweavers/air-script";
import { BoundaryConstraints } from "./BoundaryConstraints";
import { ZeroPolynomial } from "./ZeroPolynomial";
import { StarkError } from "../StarkError";

// CLASS DEFINITION
// ================================================================================================
export class CompositionPolynomial {
    
    readonly field                  : FiniteField;
    
    readonly combinationDegree      : number;
    readonly compositionDegree      : number;
    readonly constraintGroups       : { degree: number; indexes: number[]; }[];

    private readonly dCoefficients  : Vector;
    private readonly bCoefficients  : Vector;

    private readonly bPoly          : BoundaryConstraints;
    private readonly zPoly          : ZeroPolynomial;

    // CONSTRUCTOR
    // --------------------------------------------------------------------------------------------
    constructor(constraints: ConstraintSpecs[], assertions: Assertion[], seed: Buffer, context: EvaluationContext) {

        this.field = context.field;
        this.combinationDegree = getCombinationDegree(constraints, context.traceLength);

        const zeroPolyDegree = context.traceLength;
        this.compositionDegree = this.combinationDegree - zeroPolyDegree;

        // group transition constraints together by their degree
        this.constraintGroups = groupTransitionConstraints(constraints, context.traceLength);

        this.bPoly = new BoundaryConstraints(assertions, context);
        this.zPoly = new ZeroPolynomial(context);

        // create coefficients needed for linear combination
        let dCoefficientCount = constraints.length;
        for (let { degree } of this.constraintGroups) {
            if (degree < this.combinationDegree) dCoefficientCount++;
        }

        let bCoefficientCount = this.bPoly.count;
        if (this.compositionDegree > context.traceLength) {
            bCoefficientCount = bCoefficientCount * 2;
        }

        const coefficients = this.field.prng(seed, dCoefficientCount + bCoefficientCount).toValues();
        this.dCoefficients = this.field.newVectorFrom(coefficients.slice(0, bCoefficientCount));
        this.bCoefficients = this.field.newVectorFrom(coefficients.slice(bCoefficientCount))
    }

    // PUBLIC ACCESSORS
    // --------------------------------------------------------------------------------------------
    get coefficientCount(): number {
        return this.dCoefficients.length + this.bCoefficients.length;
    }

    // PROOF METHODS
    // --------------------------------------------------------------------------------------------
    evaluateAll(pPolys: Matrix, pEvaluations: Matrix, context: ProofContext) {
        const field = context.field;
        
        // 1 ----- evaluate transition constraints over composition domain
        let qEvaluations: Matrix;
        try {
            qEvaluations = context.evaluateTracePolynomials(pPolys);
        }
        catch (error) {
            throw new StarkError('Failed to evaluate transition constraints', error);
        }
        //this.logger.log(label, 'Computed Q(x) polynomials');

        // 2 ----- adjusted transition constraint degrees
        const compositionFactor = context.evaluationDomain.length / context.compositionDomain.length;
        const compositionRou = field.exp(context.rootOfUnity, BigInt(compositionFactor));
        const qaEvaluations = field.matrixRowsToVectors(qEvaluations);

        for (let { degree, indexes } of this.constraintGroups) {
            if (degree === this.combinationDegree) continue;
    
            // compute the sequence of powers for the incremental degree
            let incrementalDegree = BigInt(this.combinationDegree - degree);
            let powerSeed = this.field.exp(compositionRou, incrementalDegree);
            let powers = this.field.getPowerSeries(powerSeed, context.compositionDomain.length);
    
            // raise the degree of evaluations and add adjusted evaluations the list
            for (let i of indexes) {
                qaEvaluations.push(this.field.mulVectorElements(qaEvaluations[i], powers));
            }
        }
        //this.logger.log(label, 'Adjusted degrees of Q(x) polynomials');

        // 3 ----- merge transition constraints into a single polynomial
        // first, compute linear combination of adjusted evaluations
        const qcEvaluations = field.combineManyVectors(qaEvaluations, this.dCoefficients);
        // this.logger.log(label, 'Computed linear combination of Q(x) polynomials');

        // then, perform low-degree extension from composition domain to evaluation domain
        const qcPoly = field.interpolateRoots(context.compositionDomain, qcEvaluations);
        const qeEvaluations = field.evalPolyAtRoots(qcPoly, context.evaluationDomain);
        //this.logger.log(label, 'Performed low degree extensions of Q(x) polynomial');

        // 4 ----- compute D(x) = Q(x) / Z(x)
        const zEvaluations = this.zPoly.evaluateAll(context.evaluationDomain);
        //this.logger.log(label, 'Computed Z(x) polynomial');

        const zInverses = field.divVectorElements(zEvaluations.denominators, zEvaluations.numerators);
        //this.logger.log(label, 'Computed Z(x) inverses');

        const dEvaluations = field.mulVectorElements(qeEvaluations, zInverses);
        // this.logger.log(label, 'Computed D(x) polynomial');

        // 5 ------- compute boundary constraints B(x)
        const bEvaluations = this.bPoly.evaluateAll(pEvaluations, context.evaluationDomain);

        // 6 ------- Adjust degrees of boundary constraints
        const baEvaluations = field.matrixRowsToVectors(bEvaluations);
        const bIncrementalDegree = BigInt(this.compositionDegree - context.traceLength);
        if (bIncrementalDegree > 0n) {
            const powerSeed = this.field.exp(context.rootOfUnity, bIncrementalDegree);
            const psbPowers = this.field.getPowerSeries(powerSeed, context.evaluationDomain.length);
            
            // raise the degree of evaluations and add adjusted evaluations the list
            for (let i = 0; i < this.bPoly.count; i++) {
                baEvaluations.push(this.field.mulVectorElements(baEvaluations[i], psbPowers));
            }
        }
        //this.logger.log(label, 'Adjusted degrees of B(x) polynomials');

        // 7 ----- Merge boundary constraints into a single polynomial
        const bcEvaluations = field.combineManyVectors(baEvaluations, this.bCoefficients);
        // this.logger.log(label, 'Computed linear combination of B(x) polynomials');

        return this.field.addVectorElements(dEvaluations, bcEvaluations);
    }

    // VERIFICATION METHODS
    // --------------------------------------------------------------------------------------------
    evaluateAt(x: bigint, pValues: bigint[], nValues: bigint[], sValues: bigint[], context: VerificationContext): bigint {

        // evaluate transition constraints at x
        const qValues = context.evaluateConstraintsAt(x, pValues, nValues, sValues);

        // adjust transition constraint degrees
        const qaValues = qValues.slice();
        for (let { degree, indexes } of this.constraintGroups) {
            if (degree === this.combinationDegree) continue;

            let constraintIncrementalDegree = BigInt(this.combinationDegree - degree);
            let power = this.field.exp(x, constraintIncrementalDegree);
            for (let i of indexes) {
                qaValues.push(this.field.mul(qValues[i], power));
            }
        }

        // merge transition constraint evaluations into a single value
        const qaVector = this.field.newVectorFrom(qaValues);
        const cValue = this.field.combineVectors(qaVector, this.dCoefficients);

        // compute D(x) = Q(x) / Z(x)
        const zValue = this.zPoly.evaluateAt(x);
        const dValue = this.field.div(cValue, zValue);

        // evaluate boundary constraints at x
        const bValues = this.bPoly.evaluateAt(pValues, x);

        // adjust boundary constraint degrees
        const baValues = bValues.slice();
        const bIncrementalDegree = BigInt(this.compositionDegree - context.traceLength);
        if (bIncrementalDegree > 0n) {
            let power = this.field.exp(x, bIncrementalDegree);
            for (let bValue of bValues) {
                baValues.push(this.field.mul(bValue, power));
            }
        }

        // merge boundary constraint evaluations into a single value
        const baVector = this.field.newVectorFrom(baValues);
        const bValue = this.field.combineVectors(baVector, this.bCoefficients);

        return this.field.add(dValue, bValue);
    }
}

// HELPER FUNCTIONS
// ================================================================================================
function getCombinationDegree(constraints: ConstraintSpecs[], traceLength: number) {

    let maxConstraintDegree = 1;
    for (let constraint of constraints) {
        if (maxConstraintDegree < constraint.degree) {
            maxConstraintDegree = constraint.degree;
        }
    }

    return 2**Math.ceil(Math.log2(maxConstraintDegree)) * traceLength;
}

function groupTransitionConstraints(constraints: ConstraintSpecs[], traceLength: number) {
    
    const constraintGroups = new Map<number, number[]>();
    for (let i = 0; i < constraints.length; i++) {
        let degree = (constraints[i].degree * traceLength);
        let group = constraintGroups.get(degree);
        if (!group) {
            group = [];
            constraintGroups.set(degree, group);
        }
        group.push(i);
    }

    const result = [] as { degree: number; indexes: number[]; }[];
    for (let [degree, indexes] of constraintGroups) {
        result.push({ degree, indexes });
    }

    return result;
}