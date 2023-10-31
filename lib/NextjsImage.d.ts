import { Function as LambdaFunction, FunctionOptions } from 'aws-cdk-lib/aws-lambda';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { NextjsBaseProps } from './NextjsBase';
import type { NextjsBuild } from './NextjsBuild';
export interface NextjsImageProps extends NextjsBaseProps {
    /**
     * The S3 bucket holding application images.
     */
    readonly bucket: IBucket;
    /**
     * Override function properties.
     */
    readonly lambdaOptions?: FunctionOptions;
    /**
     * The `NextjsBuild` instance representing the built Nextjs application.
     */
    readonly nextBuild: NextjsBuild;
}
/**
 * This lambda handles image optimization.
 */
export declare class NextjsImage extends LambdaFunction {
    constructor(scope: Construct, id: string, props: NextjsImageProps);
}
