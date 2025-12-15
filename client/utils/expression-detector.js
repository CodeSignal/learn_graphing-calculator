/**
 * Expression Detector Utility
 * Detects expression types (single variable, assignment) using AST parsing.
 */

import * as math from 'mathjs';

/**
 * Check if an expression is just a single variable name (not x or y)
 * @param {string} expression - Expression string to check
 * @returns {{isVariable: boolean, varName: string|null}} Result object
 */
export function isSingleVariable(expression) {
    if (!expression || typeof expression !== 'string') {
        return { isVariable: false, varName: null };
    }

    const trimmed = expression.trim();
    if (!trimmed) {
        return { isVariable: false, varName: null };
    }

    try {
        const node = math.parse(trimmed);

        // Check if it's just a SymbolNode (single variable)
        if (node.type === 'SymbolNode') {
            const varName = node.name;

            // Reject reserved variables x and y
            if (varName === 'x' || varName === 'y') {
                return { isVariable: false, varName: null };
            }

            // Check if it's a valid variable name (not a constant or function)
            const constants = ['e', 'pi', 'PI', 'E', 'i', 'Infinity', 'NaN', 'true', 'false'];
            if (constants.includes(varName)) {
                return { isVariable: false, varName: null };
            }

            return { isVariable: true, varName };
        }

        return { isVariable: false, varName: null };
    } catch (error) {
        // Parsing failed - not a single variable
        return { isVariable: false, varName: null };
    }
}

/**
 * Check if an expression is a variable assignment using AST parsing
 * @param {string} expression - Expression string to check
 * @param {boolean} debug - Whether to log debug warnings
 * @returns {{isAssignment: boolean, varName: string|null, value: number|null}} Result object
 */
export function isAssignmentExpression(expression, debug = false) {
    if (!expression || typeof expression !== 'string') {
        return { isAssignment: false, varName: null, value: null };
    }

    try {
        const node = math.parse(expression.trim());

        // Check if root node is an AssignmentNode
        if (node.type !== 'AssignmentNode') {
            return { isAssignment: false, varName: null, value: null };
        }

        // Extract variable name from left-hand side (should be a SymbolNode)
        let varName = null;
        if (node.object && node.object.type === 'SymbolNode') {
            varName = node.object.name;
        } else {
            // Not a simple variable assignment (e.g., array[index] = value)
            return { isAssignment: false, varName: null, value: null };
        }

        // Reject reserved variables x and y
        if (varName === 'x' || varName === 'y') {
            return { isAssignment: false, varName: null, value: null };
        }

        // Extract value from right-hand side
        let value = null;
        if (node.value) {
            if (node.value.type === 'ConstantNode') {
                // Direct constant (e.g., 5, -3.14)
                value = node.value.value;
            } else {
                // Try to evaluate the expression (e.g., 1 + 2, pi, sin(1))
                try {
                    const compiled = node.value.compile();
                    value = compiled.evaluate();
                    // Ensure it's a finite number
                    if (!isFinite(value) || isNaN(value)) {
                        value = null;
                    }
                } catch (e) {
                    // Evaluation failed (e.g., contains variables)
                    if (debug) {
                        console.warn(`[ExpressionDetector] Could not evaluate assignment value: ${expression}`, e);
                    }
                    return { isAssignment: false, varName: null, value: null };
                }
            }
        }

        // Only return success if we have both variable name and numeric value
        if (varName && value !== null && isFinite(value)) {
            return { isAssignment: true, varName, value };
        }

        return { isAssignment: false, varName: null, value: null };
    } catch (error) {
        // Parsing failed - not an assignment or invalid expression
        return { isAssignment: false, varName: null, value: null };
    }
}

