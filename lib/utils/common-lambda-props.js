"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCommonFunctionProps = void 0;
const aws_cdk_lib_1 = require("aws-cdk-lib");
const aws_lambda_1 = require("aws-cdk-lib/aws-lambda");
function getCommonFunctionProps(scope) {
    return {
        architecture: aws_lambda_1.Architecture.ARM_64,
        /**
         * 1536mb costs 1.5x but runs twice as fast for most scenarios.
         * @see {@link https://dev.to/dashbird/4-tips-for-aws-lambda-optimization-for-production-3if1}
         */
        memorySize: 1536,
        runtime: aws_lambda_1.Runtime.NODEJS_18_X,
        timeout: aws_cdk_lib_1.Duration.seconds(10),
        // prevents "Resolution error: Cannot use resource in a cross-environment
        // fashion, the resource's physical name must be explicit set or use
        // PhysicalName.GENERATE_IF_NEEDED."
        functionName: aws_cdk_lib_1.Stack.of(scope).region !== 'us-east-1' ? aws_cdk_lib_1.PhysicalName.GENERATE_IF_NEEDED : undefined,
    };
}
exports.getCommonFunctionProps = getCommonFunctionProps;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tbW9uLWxhbWJkYS1wcm9wcy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy91dGlscy9jb21tb24tbGFtYmRhLXByb3BzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLDZDQUE0RDtBQUM1RCx1REFBOEU7QUFHOUUsU0FBZ0Isc0JBQXNCLENBQUMsS0FBZ0I7SUFDckQsT0FBTztRQUNMLFlBQVksRUFBRSx5QkFBWSxDQUFDLE1BQU07UUFDakM7OztXQUdHO1FBQ0gsVUFBVSxFQUFFLElBQUk7UUFDaEIsT0FBTyxFQUFFLG9CQUFPLENBQUMsV0FBVztRQUM1QixPQUFPLEVBQUUsc0JBQVEsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1FBQzdCLHlFQUF5RTtRQUN6RSxvRUFBb0U7UUFDcEUsb0NBQW9DO1FBQ3BDLFlBQVksRUFBRSxtQkFBSyxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxNQUFNLEtBQUssV0FBVyxDQUFDLENBQUMsQ0FBQywwQkFBWSxDQUFDLGtCQUFrQixDQUFDLENBQUMsQ0FBQyxTQUFTO0tBQ25HLENBQUM7QUFDSixDQUFDO0FBZkQsd0RBZUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBEdXJhdGlvbiwgUGh5c2ljYWxOYW1lLCBTdGFjayB9IGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IEFyY2hpdGVjdHVyZSwgRnVuY3Rpb25Qcm9wcywgUnVudGltZSB9IGZyb20gJ2F3cy1jZGstbGliL2F3cy1sYW1iZGEnO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRDb21tb25GdW5jdGlvblByb3BzKHNjb3BlOiBDb25zdHJ1Y3QpOiBPbWl0PEZ1bmN0aW9uUHJvcHMsICdjb2RlJyB8ICdoYW5kbGVyJz4ge1xuICByZXR1cm4ge1xuICAgIGFyY2hpdGVjdHVyZTogQXJjaGl0ZWN0dXJlLkFSTV82NCxcbiAgICAvKipcbiAgICAgKiAxNTM2bWIgY29zdHMgMS41eCBidXQgcnVucyB0d2ljZSBhcyBmYXN0IGZvciBtb3N0IHNjZW5hcmlvcy5cbiAgICAgKiBAc2VlIHtAbGluayBodHRwczovL2Rldi50by9kYXNoYmlyZC80LXRpcHMtZm9yLWF3cy1sYW1iZGEtb3B0aW1pemF0aW9uLWZvci1wcm9kdWN0aW9uLTNpZjF9XG4gICAgICovXG4gICAgbWVtb3J5U2l6ZTogMTUzNixcbiAgICBydW50aW1lOiBSdW50aW1lLk5PREVKU18xOF9YLFxuICAgIHRpbWVvdXQ6IER1cmF0aW9uLnNlY29uZHMoMTApLFxuICAgIC8vIHByZXZlbnRzIFwiUmVzb2x1dGlvbiBlcnJvcjogQ2Fubm90IHVzZSByZXNvdXJjZSBpbiBhIGNyb3NzLWVudmlyb25tZW50XG4gICAgLy8gZmFzaGlvbiwgdGhlIHJlc291cmNlJ3MgcGh5c2ljYWwgbmFtZSBtdXN0IGJlIGV4cGxpY2l0IHNldCBvciB1c2VcbiAgICAvLyBQaHlzaWNhbE5hbWUuR0VORVJBVEVfSUZfTkVFREVELlwiXG4gICAgZnVuY3Rpb25OYW1lOiBTdGFjay5vZihzY29wZSkucmVnaW9uICE9PSAndXMtZWFzdC0xJyA/IFBoeXNpY2FsTmFtZS5HRU5FUkFURV9JRl9ORUVERUQgOiB1bmRlZmluZWQsXG4gIH07XG59XG4iXX0=