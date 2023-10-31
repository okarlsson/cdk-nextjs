import { TableV2 as Table } from 'aws-cdk-lib/aws-dynamodb';
import { Function as LambdaFunction, FunctionOptions } from 'aws-cdk-lib/aws-lambda';
import { Queue } from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';
import { NextjsBaseProps } from './NextjsBase';
import { NextjsBuild } from './NextjsBuild';
import { NextjsServer } from './NextjsServer';
export interface NextjsRevalidationProps extends NextjsBaseProps {
    /**
     * Override function properties.
     */
    readonly lambdaOptions?: FunctionOptions;
    /**
     * The `NextjsBuild` instance representing the built Nextjs application.
     */
    readonly nextBuild: NextjsBuild;
    /**
     * The main NextJS server handler lambda function.
     */
    readonly serverFunction: NextjsServer;
}
/**
 * Builds the system for revalidating Next.js resources. This includes a Lambda function handler and queue system as well
 * as the DynamoDB table and provider function.
 *
 * @see {@link https://github.com/serverless-stack/open-next/blob/main/README.md?plain=1#L65}
 *
 */
export declare class NextjsRevalidation extends Construct {
    queue: Queue;
    table: Table;
    queueFunction: LambdaFunction;
    tableFunction: LambdaFunction | undefined;
    private props;
    constructor(scope: Construct, id: string, props: NextjsRevalidationProps);
    private createQueue;
    private createQueueFunction;
    private createRevalidationTable;
    /**
     * This function will insert the initial batch of tag / path / revalidation data into the DynamoDB table during deployment.
     * @see: {@link https://open-next.js.org/inner_workings/isr#tags}
     *
     * @param revalidationTable table to grant function access to
     * @returns the revalidation insert provider function
     */
    private createRevalidationInsertFunction;
}
