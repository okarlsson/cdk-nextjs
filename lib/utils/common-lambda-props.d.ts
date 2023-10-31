import { FunctionProps } from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
export declare function getCommonFunctionProps(scope: Construct): Omit<FunctionProps, 'code' | 'handler'>;
