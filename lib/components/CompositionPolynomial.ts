// IMPORTS
// ================================================================================================
import { FiniteField, Vector, Matrix, Assertion, LogFunction } from "@guildofweavers/genstark";
import { EvaluationContext, ProofContext, VerificationContext, ConstraintSpecs } from "@guildofweavers/air-script";
import { BoundaryConstraints } from "./BoundaryConstraints";
import { ZeroPolynomial } from "./ZeroPolynomial";
import { StarkError } from "../StarkError";

// CLASS DEFINITION
// ================================================================================================
export class CompositionPolynomial {
    
    private readonly field              : FiniteField;
    private readonly combinationDegree  : number;
    private readonly constraintGroups   : { degree: number; indexes: number[]; }[];

    private readonly dCoefficients      : Vector;
    private readonly bCoefficients      : Vector;

    private readonly bPoly              : BoundaryConstraints;
    private readonly zPoly              : ZeroPolynomial;

    private readonly log                : LogFunction;

    readonly compositionDegree          : number;

    // CONSTRUCTOR
    // --------------------------------------------------------------------------------------------
    constructor(constraints: ConstraintSpecs[], assertions: Assertion[], seed: Buffer, context: EvaluationContext, logger: LogFunction) {

        this.field = context.field;
        this.bPoly = new BoundaryConstraints(assertions, context);
        this.zPoly = new ZeroPolynomial(context);
        this.log = logger;

        // degree of trace polynomial combination
        this.combinationDegree = getCombinationDegree(constraints, context.traceLength);

        // degree of composition polynomial is deg(C(x)) = deg(Q(x)) - deg(Z(x))
        this.compositionDegree = this.combinationDegree - context.traceLength;

        // group transition constraints together by their degree
        this.constraintGroups = groupTransitionConstraints(constraints, context.traceLength);

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
        
        // 1 ----- evaluate transition constraints over composition domain
        let qEvaluations: Matrix;
        try {
            qEvaluations = context.evaluateTracePolynomials(pPolys);
        }
        catch (error) {
            throw new StarkError('Failed to evaluate transition constraints', error);
        }
        this.log('Computed transition constraint polynomials Q(x)');

        // 2 ----- adjusted transition constraint degrees
        const compositionFactor = context.evaluationDomain.length / context.compositionDomain.length;
        const compositionRou = this.field.exp(context.rootOfUnity, BigInt(compositionFactor));
        const qaEvaluations = this.field.matrixRowsToVectors(qEvaluations);

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
        this.log('Adjusted degrees of Q(x) polynomials');

        // 3 ----- merge transition constraints into a single polynomial
        // first, compute linear combination of adjusted evaluations
        const qcEvaluations = this.field.combineManyVectors(qaEvaluations, this.dCoefficients);
        this.log('Computed linear combination of Q(x) polynomials');

        // then, perform low-degree extension from composition domain to evaluation domain
        const qcPoly = this.field.interpolateRoots(context.compositionDomain, qcEvaluations);
        const qeEvaluations = this.field.evalPolyAtRoots(qcPoly, context.evaluationDomain);
        this.log('Performed low degree extensions of Q(x) polynomial');

        // 4 ----- compute D(x) = Q(x) / Z(x)
        const zEvaluations = this.zPoly.evaluateAll(context.evaluationDomain);
        this.log('Computed Z(x) polynomial');

        const zInverses = this.field.divVectorElements(zEvaluations.denominators, zEvaluations.numerators);
        this.log('Computed Z(x) inverses');

        const dEvaluations = this.field.mulVectorElements(qeEvaluations, zInverses);
        this.log('Computed D(x) polynomial');

        // 5 ------- compute boundary constraints B(x)
        const bEvaluations = this.bPoly.evaluateAll(pEvaluations, context.evaluationDomain);
        this.log('Computed boundary constraint polynomials B(x)');

        // 6 ------- Adjust degrees of boundary constraints
        const baEvaluations = this.field.matrixRowsToVectors(bEvaluations);
        const bIncrementalDegree = BigInt(this.compositionDegree - context.traceLength);
        if (bIncrementalDegree > 0n) {
            const powerSeed = this.field.exp(context.rootOfUnity, bIncrementalDegree);
            const psbPowers = this.field.getPowerSeries(powerSeed, context.evaluationDomain.length);
            
            // raise the degree of evaluations and add adjusted evaluations the list
            for (let i = 0; i < this.bPoly.count; i++) {
                baEvaluations.push(this.field.mulVectorElements(baEvaluations[i], psbPowers));
            }
        }
        this.log('Adjusted degrees of B(x) polynomials');

        // 7 ----- Merge boundary constraints into a single polynomial
        const bcEvaluations = this.field.combineManyVectors(baEvaluations, this.bCoefficients);
        this.log('Computed linear combination of B(x) polynomials');

        return this.field.addVectorElements(dEvaluations, bcEvaluations);
    }

    // VERIFICATION METHODS
    // --------------------------------------------------------------------------------------------
    evaluateAt(x: bigint, pValues: bigint[], nValues: bigint[], sValues: bigint[], context: VerificationContext): bigint {

        // evaluate transition constraints at x
        const qValues = context.evaluateConstraintsAt(x, pValues, nValues, sValues);

        // adjust transition constraint degrees
        for (let { degree, indexes } of this.constraintGroups) {
            if (degree === this.combinationDegree) continue;

            let constraintIncrementalDegree = BigInt(this.combinationDegree - degree);
            let power = this.field.exp(x, constraintIncrementalDegree);
            for (let i of indexes) {
                qValues.push(this.field.mul(qValues[i], power));
            }
        }

        // merge transition constraint evaluations into a single value
        const qVector = this.field.newVectorFrom(qValues);
        const qcValue = this.field.combineVectors(qVector, this.dCoefficients);

        // compute D(x) = Q(x) / Z(x)
        const zValue = this.zPoly.evaluateAt(x);
        const dValue = this.field.div(qcValue, zValue);

        // evaluate boundary constraints at x
        const bValues = this.bPoly.evaluateAt(pValues, x);

        // adjust boundary constraint degrees
        const bIncrementalDegree = BigInt(this.compositionDegree - context.traceLength);
        if (bIncrementalDegree > 0n) {
            let power = this.field.exp(x, bIncrementalDegree);
            for (let i = 0; i < this.bPoly.count; i++) {
                bValues.push(this.field.mul(bValues[i], power));
            }
        }

        // merge boundary constraint evaluations into a single value
        const bVector = this.field.newVectorFrom(bValues);
        const bValue = this.field.combineVectors(bVector, this.bCoefficients);

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