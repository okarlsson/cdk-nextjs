import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { NextjsBuild } from './NextjsBuild';
export interface NextjsStaticAssetsProps {
    /**
     * Define your own bucket to store static assets.
     */
    readonly bucket?: s3.IBucket | undefined;
    /**
     * The `NextjsBuild` instance representing the built Nextjs application.
     */
    readonly nextBuild: NextjsBuild;
    /**
     * Custom environment variables to pass to the NextJS build and runtime.
     */
    readonly environment?: Record<string, string>;
    /**
     * Optional value to prefix the Next.js site under a /prefix path on CloudFront.
     * Usually used when you deploy multiple Next.js sites on same domain using /sub-path
     *
     * Note, you'll need to set [basePath](https://nextjs.org/docs/app/api-reference/next-config-js/basePath)
     * in your `next.config.ts` to this value and ensure any files in `public`
     * folder have correct prefix.
     * @example "/my-base-path"
     */
    readonly basePath?: string;
}
/**
 * Uploads Nextjs built static and public files to S3.
 *
 * Will inject resolved environment variables that are unresolved at synthesis
 * in CloudFormation Custom Resource.
 */
export declare class NextjsStaticAssets extends Construct {
    /**
     * Bucket containing assets.
     */
    bucket: s3.IBucket;
    protected props: NextjsStaticAssetsProps;
    private get buildEnvVars();
    constructor(scope: Construct, id: string, props: NextjsStaticAssetsProps);
    private createBucket;
    private createAsset;
    private createBucketDeployment;
}
