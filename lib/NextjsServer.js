"use strict";
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.NextjsServer = void 0;
const JSII_RTTI_SYMBOL_1 = Symbol.for("jsii.rtti");
const node_crypto_1 = require("node:crypto");
const node_fs_1 = require("node:fs");
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
const aws_cdk_lib_1 = require("aws-cdk-lib");
const aws_lambda_1 = require("aws-cdk-lib/aws-lambda");
const aws_s3_assets_1 = require("aws-cdk-lib/aws-s3-assets");
const constructs_1 = require("constructs");
const constants_1 = require("./constants");
const NextjsBucketDeployment_1 = require("./NextjsBucketDeployment");
const common_lambda_props_1 = require("./utils/common-lambda-props");
const create_archive_1 = require("./utils/create-archive");
/**
 * Build a lambda function from a NextJS application to handle server-side rendering, API routes, and image optimization.
 */
class NextjsServer extends constructs_1.Construct {
    get environment() {
        return {
            ...this.props.environment,
            ...this.props.lambda?.environment,
            CACHE_BUCKET_NAME: this.props.staticAssetBucket.bucketName,
            CACHE_BUCKET_REGION: aws_cdk_lib_1.Stack.of(this.props.staticAssetBucket).region,
            CACHE_BUCKET_KEY_PREFIX: constants_1.CACHE_BUCKET_KEY_PREFIX,
        };
    }
    constructor(scope, id, props) {
        super(scope, id);
        this.props = props;
        // must create code asset separately (typically it is implicitly created in
        //`Function` construct) b/c we need to substitute unresolve env vars
        const sourceAsset = this.createSourceCodeAsset();
        // source and destination assets are defined separately so that source
        // assets are immutable (easier debugging). Technically we could overwrite
        // source asset
        const destinationAsset = this.createDestinationCodeAsset();
        const bucketDeployment = this.createBucketDeployment(sourceAsset, destinationAsset);
        this.lambdaFunction = this.createFunction(destinationAsset);
        // don't update lambda function until bucket deployment is complete
        this.lambdaFunction.node.addDependency(bucketDeployment);
    }
    createSourceCodeAsset() {
        const archivePath = (0, create_archive_1.createArchive)({
            directory: this.props.nextBuild.nextServerFnDir,
            quiet: this.props.quiet,
            zipFileName: 'server-fn.zip',
        });
        const asset = new aws_s3_assets_1.Asset(this, 'SourceCodeAsset', {
            path: archivePath,
        });
        // new Asset() creates copy of zip into cdk.out/. This cleans up tmp folder
        (0, node_fs_1.rmSync)(archivePath, { recursive: true });
        return asset;
    }
    createDestinationCodeAsset() {
        // create dummy directory to upload with random values so it's uploaded each time
        // TODO: look into caching?
        const assetsTmpDir = (0, node_fs_1.mkdtempSync)((0, node_path_1.resolve)((0, node_os_1.tmpdir)(), 'bucket-deployment-dest-asset-'));
        // this code will never run b/c we explicitly declare dependency between
        // lambda function and bucket deployment.
        (0, node_fs_1.writeFileSync)((0, node_path_1.resolve)(assetsTmpDir, 'index.mjs'), `export function handler() { return '${(0, node_crypto_1.randomUUID)()}' }`);
        const destinationAsset = new aws_s3_assets_1.Asset(this, 'DestinationCodeAsset', {
            path: assetsTmpDir,
        });
        (0, node_fs_1.rmSync)(assetsTmpDir, { recursive: true });
        return destinationAsset;
    }
    createBucketDeployment(sourceAsset, destinationAsset) {
        const bucketDeployment = new NextjsBucketDeployment_1.NextjsBucketDeployment(this, 'BucketDeployment', {
            asset: sourceAsset,
            debug: true,
            destinationBucket: destinationAsset.bucket,
            destinationKeyPrefix: destinationAsset.s3ObjectKey,
            prune: true,
            // this.props.environment is for build time, not this.environment which is for runtime
            substitutionConfig: NextjsBucketDeployment_1.NextjsBucketDeployment.getSubstitutionConfig(this.props.environment || {}),
            zip: true,
        });
        return bucketDeployment;
    }
    createFunction(asset) {
        // until after the build time env vars in code zip asset are substituted
        const fn = new aws_lambda_1.Function(this, 'Fn', {
            ...(0, common_lambda_props_1.getCommonFunctionProps)(this),
            code: aws_lambda_1.Code.fromBucket(asset.bucket, asset.s3ObjectKey),
            handler: 'index.handler',
            description: 'Next.js Server Handler',
            ...this.props.lambda,
            // `environment` needs to go after `this.props.lambda` b/c if
            // `this.props.lambda.environment` is defined, it will override
            // CACHE_* environment variables which are required
            environment: { ...this.environment, ...this.props.lambda?.environment },
        });
        this.props.staticAssetBucket.grantReadWrite(fn);
        return fn;
    }
}
_a = JSII_RTTI_SYMBOL_1;
NextjsServer[_a] = { fqn: "cdk-nextjs-standalone.NextjsServer", version: "0.0.0" };
exports.NextjsServer = NextjsServer;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTmV4dGpzU2VydmVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL05leHRqc1NlcnZlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7OztBQUFBLDZDQUF5QztBQUN6QyxxQ0FBNkQ7QUFDN0QscUNBQWlDO0FBQ2pDLHlDQUFvQztBQUNwQyw2Q0FBb0M7QUFDcEMsdURBQXlFO0FBRXpFLDZEQUFrRDtBQUNsRCwyQ0FBdUM7QUFDdkMsMkNBQXNEO0FBRXRELHFFQUFrRTtBQUVsRSxxRUFBcUU7QUFDckUsMkRBQXVEO0FBcUJ2RDs7R0FFRztBQUNILE1BQWEsWUFBYSxTQUFRLHNCQUFTO0lBS3pDLElBQVksV0FBVztRQUNyQixPQUFPO1lBQ0wsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLFdBQVc7WUFDekIsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sRUFBRSxXQUFXO1lBQ2pDLGlCQUFpQixFQUFFLElBQUksQ0FBQyxLQUFLLENBQUMsaUJBQWlCLENBQUMsVUFBVTtZQUMxRCxtQkFBbUIsRUFBRSxtQkFBSyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLGlCQUFpQixDQUFDLENBQUMsTUFBTTtZQUNsRSx1QkFBdUIsRUFBdkIsbUNBQXVCO1NBQ3hCLENBQUM7SUFDSixDQUFDO0lBRUQsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUF3QjtRQUNoRSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ2pCLElBQUksQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDO1FBRW5CLDJFQUEyRTtRQUMzRSxvRUFBb0U7UUFDcEUsTUFBTSxXQUFXLEdBQUcsSUFBSSxDQUFDLHFCQUFxQixFQUFFLENBQUM7UUFDakQsc0VBQXNFO1FBQ3RFLDBFQUEwRTtRQUMxRSxlQUFlO1FBQ2YsTUFBTSxnQkFBZ0IsR0FBRyxJQUFJLENBQUMsMEJBQTBCLEVBQUUsQ0FBQztRQUMzRCxNQUFNLGdCQUFnQixHQUFH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QUFFLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLEVBQUUsV0FBVyxFQUFFO1NBQ3hFLENBQUMsQ0FBQztRQUNILElBQUksQ0FBQyxLQUFLLENBQUMsaUJBQWlCLENBQUMsY0FBYyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBRWhELE9BQU8sRUFBRSxDQUFDO0lBQ1osQ0FBQzs7OztBQTFGVSxvQ0FBWSIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IHJhbmRvbVVVSUQgfSBmcm9tICdub2RlOmNyeXB0byc7XG5pbXBvcnQgeyBta2R0ZW1wU3luYywgcm1TeW5jLCB3cml0ZUZpbGVTeW5jIH0gZnJvbSAnbm9kZTpmcyc7XG5pbXBvcnQgeyB0bXBkaXIgfSBmcm9tICdub2RlOm9zJztcbmltcG9ydCB7IHJlc29sdmUgfSBmcm9tICdub2RlOnBhdGgnO1xuaW1wb3J0IHsgU3RhY2sgfSBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBDb2RlLCBGdW5jdGlvbiwgRnVuY3Rpb25PcHRpb25zIH0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWxhbWJkYSc7XG5pbXBvcnQgeyBCdWNrZXQsIElCdWNrZXQgfSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtczMnO1xuaW1wb3J0IHsgQXNzZXQgfSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtczMtYXNzZXRzJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0IHsgQ0FDSEVfQlVDS0VUX0tFWV9QUkVGSVggfSBmcm9tICcuL2NvbnN0YW50cyc7XG5pbXBvcnQgeyBOZXh0anNCYXNlUHJvcHMgfSBmcm9tICcuL05leHRqc0Jhc2UnO1xuaW1wb3J0IHsgTmV4dGpzQnVja2V0RGVwbG95bWVudCB9IGZyb20gJy4vTmV4dGpzQnVja2V0RGVwbG95bWVudCc7XG5pbXBvcnQgeyBOZXh0anNCdWlsZCB9IGZyb20gJy4vTmV4dGpzQnVpbGQnO1xuaW1wb3J0IHsgZ2V0Q29tbW9uRnVuY3Rpb25Qcm9wcyB9IGZyb20gJy4vdXRpbHMvY29tbW9uLWxhbWJkYS1wcm9wcyc7XG5pbXBvcnQgeyBjcmVhdGVBcmNoaXZlIH0gZnJvbSAnLi91dGlscy9jcmVhdGUtYXJjaGl2ZSc7XG5cbmV4cG9ydCB0eXBlIEVudmlyb25tZW50VmFycyA9IFJlY29yZDxzdHJpbmcsIHN0cmluZz47XG5cbmV4cG9ydCBpbnRlcmZhY2UgTmV4dGpzU2VydmVyUHJvcHMgZXh0ZW5kcyBOZXh0anNCYXNlUHJvcHMge1xuICAvKipcbiAgICogQnVpbHQgbmV4dEpTIGFwcGxpY2F0aW9uLlxuICAgKi9cbiAgcmVhZG9ubHkgbmV4dEJ1aWxkOiBOZXh0anNCdWlsZDtcblxuICAvKipcbiAgICogT3ZlcnJpZGUgZnVuY3Rpb24gcHJvcGVydGllcy5cbiAgICovXG4gIHJlYWRvbmx5IGxhbWJkYT86IEZ1bmN0aW9uT3B0aW9ucztcblxuICAvKipcbiAgICogU3RhdGljIGFzc2V0IGJ1Y2tldC4gRnVuY3Rpb24gbmVlZHMgYnVja2V0IHRvIHJlYWQgZnJvbSBjYWNoZS5cbiAgICovXG4gIHJlYWRvbmx5IHN0YXRpY0Fzc2V0QnVja2V0OiBJQnVja2V0O1xufVxuXG4vKipcbiAqIEJ1aWxkIGEgbGFtYmRhIGZ1bmN0aW9uIGZyb20gYSBOZXh0SlMgYXBwbGljYXRpb24gdG8gaGFuZGxlIHNlcnZlci1zaWRlIHJlbmRlcmluZywgQVBJIHJvdXRlcywgYW5kIGltYWdlIG9wdGltaXphdGlvbi5cbiAqL1xuZXhwb3J0IGNsYXNzIE5leHRqc1NlcnZlciBleHRlbmRzIENvbnN0cnVjdCB7XG4gIGNvbmZpZ0J1Y2tldD86IEJ1Y2tldDtcbiAgbGFtYmRhRnVuY3Rpb246IEZ1bmN0aW9uO1xuXG4gIHByaXZhdGUgcHJvcHM6IE5leHRqc1NlcnZlclByb3BzO1xuICBwcml2YXRlIGdldCBlbnZpcm9ubWVudCgpOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+IHtcbiAgICByZXR1cm4ge1xuICAgICAgLi4udGhpcy5wcm9wcy5lbnZpcm9ubWVudCxcbiAgICAgIC4uLnRoaXMucHJvcHMubGFtYmRhPy5lbnZpcm9ubWVudCxcbiAgICAgIENBQ0hFX0JVQ0tFVF9OQU1FOiB0aGlzLnByb3BzLnN0YXRpY0Fzc2V0QnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgICBDQUNIRV9CVUNLRVRfUkVHSU9OOiBTdGFjay5vZih0aGlzLnByb3BzLnN0YXRpY0Fzc2V0QnVja2V0KS5yZWdpb24sXG4gICAgICBDQUNIRV9CVUNLRVRfS0VZX1BSRUZJWCxcbiAgICB9O1xuICB9XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IE5leHRqc1NlcnZlclByb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkKTtcbiAgICB0aGlzLnByb3BzID0gcHJvcHM7XG5cbiAgICAvLyBtdXN0IGNyZWF0ZSBjb2RlIGFzc2V0IHNlcGFyYXRlbHkgKHR5cGljYWxseSBpdCBpcyBpbXBsaWNpdGx5IGNyZWF0ZWQgaW5cbiAgICAvL2BGdW5jdGlvbmAgY29uc3RydWN0KSBiL2Mgd2UgbmVlZCB0byBzdWJzdGl0dXRlIHVucmVzb2x2ZSBlbnYgdmFyc1xuICAgIGNvbnN0IHNvdXJjZUFzc2V0ID0gdGhpcy5jcmVhdGVTb3VyY2VDb2RlQXNzZXQoKTtcbiAgICAvLyBzb3VyY2UgYW5kIGRlc3RpbmF0aW9uIGFzc2V0cyBhcmUgZGVmaW5lZCBzZXBhcmF0ZWx5IHNvIHRoYXQgc291cmNlXG4gICAgLy8gYXNzZXRzIGFyZSBpbW11dGFibGUgKGVhc2llciBkZWJ1Z2dpbmcpLiBUZWNobmljYWxseSB3ZSBjb3VsZCBvdmVyd3JpdGVcbiAgICAvLyBzb3VyY2UgYXNzZXRcbiAgICBjb25zdCBkZXN0aW5hdGlvbkFzc2V0ID0gdGhpcy5jcmVhdGVEZXN0aW5hdGlvbkNvZGVBc3NldCgpO1xuICAgIGNvbnN0IGJ1Y2tldERlcGxveW1lbnQgPSB0aGlzLmNyZWF0ZUJ1Y2tldERlcGxveW1lbnQoc291cmNlQXNzZXQsIGRlc3RpbmF0aW9uQXNzZXQpO1xuICAgIHRoaXMubGFtYmRhRnVuY3Rpb24gPSB0aGlzLmNyZWF0ZUZ1bmN0aW9uKGRlc3RpbmF0aW9uQXNzZXQpO1xuICAgIC8vIGRvbid0IHVwZGF0ZSBsYW1iZGEgZnVuY3Rpb24gdW50aWwgYnVja2V0IGRlcGxveW1lbnQgaXMgY29tcGxldGVcbiAgICB0aGlzLmxhbWJkYUZ1bmN0aW9uLm5vZGUuYWRkRGVwZW5kZW5jeShidWNrZXREZXBsb3ltZW50KTtcbiAgfVxuXG4gIHByaXZhdGUgY3JlYXRlU291cmNlQ29kZUFzc2V0KCkge1xuICAgIGNvbnN0IGFyY2hpdmVQYXRoID0gY3JlYXRlQXJjaGl2ZSh7XG4gICAgICBkaXJlY3Rvcnk6IHRoaXMucHJvcHMubmV4dEJ1aWxkLm5leHRTZXJ2ZXJGbkRpcixcbiAgICAgIHF1aWV0OiB0aGlzLnByb3BzLnF1aWV0LFxuICAgICAgemlwRmlsZU5hbWU6ICdzZXJ2ZXItZm4uemlwJyxcbiAgICB9KTtcbiAgICBjb25zdCBhc3NldCA9IG5ldyBBc3NldCh0aGlzLCAnU291cmNlQ29kZUFzc2V0Jywge1xuICAgICAgcGF0aDogYXJjaGl2ZVBhdGgsXG4gICAgfSk7XG4gICAgLy8gbmV3IEFzc2V0KCkgY3JlYXRlcyBjb3B5IG9mIHppcCBpbnRvIGNkay5vdXQvLiBUaGlzIGNsZWFucyB1cCB0bXAgZm9sZGVyXG4gICAgcm1TeW5jKGFyY2hpdmVQYXRoLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcbiAgICByZXR1cm4gYXNzZXQ7XG4gIH1cblxuICBwcml2YXRlIGNyZWF0ZURlc3RpbmF0aW9uQ29kZUFzc2V0KCkge1xuICAgIC8vIGNyZWF0ZSBkdW1teSBkaXJlY3RvcnkgdG8gdXBsb2FkIHdpdGggcmFuZG9tIHZhbHVlcyBzbyBpdCdzIHVwbG9hZGVkIGVhY2ggdGltZVxuICAgIC8vIFRPRE86IGxvb2sgaW50byBjYWNoaW5nP1xuICAgIGNvbnN0IGFzc2V0c1RtcERpciA9IG1rZHRlbXBTeW5jKHJlc29sdmUodG1wZGlyKCksICdidWNrZXQtZGVwbG95bWVudC1kZXN0LWFzc2V0LScpKTtcbiAgICAvLyB0aGlzIGNvZGUgd2lsbCBuZXZlciBydW4gYi9jIHdlIGV4cGxpY2l0bHkgZGVjbGFyZSBkZXBlbmRlbmN5IGJldHdlZW5cbiAgICAvLyBsYW1iZGEgZnVuY3Rpb24gYW5kIGJ1Y2tldCBkZXBsb3ltZW50LlxuICAgIHdyaXRlRmlsZVN5bmMocmVzb2x2ZShhc3NldHNUbXBEaXIsICdpbmRleC5tanMnKSwgYGV4cG9ydCBmdW5jdGlvbiBoYW5kbGVyKCkgeyByZXR1cm4gJyR7cmFuZG9tVVVJRCgpfScgfWApO1xuICAgIGNvbnN0IGRlc3RpbmF0aW9uQXNzZXQgPSBuZXcgQXNzZXQodGhpcywgJ0Rlc3RpbmF0aW9uQ29kZUFzc2V0Jywge1xuICAgICAgcGF0aDogYXNzZXRzVG1wRGlyLFxuICAgIH0pO1xuICAgIHJtU3luYyhhc3NldHNUbXBEaXIsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuICAgIHJldHVybiBkZXN0aW5hdGlvbkFzc2V0O1xuICB9XG5cbiAgcHJpdmF0ZSBjcmVhdGVCdWNrZXREZXBsb3ltZW50KHNvdXJjZUFzc2V0OiBBc3NldCwgZGVzdGluYXRpb25Bc3NldDogQXNzZXQpIHtcbiAgICBjb25zdCBidWNrZXREZXBsb3ltZW50ID0gbmV3IE5leHRqc0J1Y2tldERlcGxveW1lbnQodGhpcywgJ0J1Y2tldERlcGxveW1lbnQnLCB7XG4gICAgICBhc3NldDogc291cmNlQXNzZXQsXG4gICAgICBkZWJ1ZzogdHJ1ZSxcbiAgICAgIGRlc3RpbmF0aW9uQnVja2V0OiBkZXN0aW5hdGlvbkFzc2V0LmJ1Y2tldCxcbiAgICAgIGRlc3RpbmF0aW9uS2V5UHJlZml4OiBkZXN0aW5hdGlvbkFzc2V0LnMzT2JqZWN0S2V5LFxuICAgICAgcHJ1bmU6IHRydWUsXG4gICAgICAvLyB0aGlzLnByb3BzLmVudmlyb25tZW50IGlzIGZvciBidWlsZCB0aW1lLCBub3QgdGhpcy5lbnZpcm9ubWVudCB3aGljaCBpcyBmb3IgcnVudGltZVxuICAgICAgc3Vic3RpdHV0aW9uQ29uZmlnOiBOZXh0anNCdWNrZXREZXBsb3ltZW50LmdldFN1YnN0aXR1dGlvbkNvbmZpZyh0aGlzLnByb3BzLmVudmlyb25tZW50IHx8IHt9KSxcbiAgICAgIHppcDogdHJ1ZSxcbiAgICB9KTtcbiAgICByZXR1cm4gYnVja2V0RGVwbG95bWVudDtcbiAgfVxuXG4gIHByaXZhdGUgY3JlYXRlRnVuY3Rpb24oYXNzZXQ6IEFzc2V0KSB7XG4gICAgLy8gdW50aWwgYWZ0ZXIgdGhlIGJ1aWxkIHRpbWUgZW52IHZhcnMgaW4gY29kZSB6aXAgYXNzZXQgYXJlIHN1YnN0aXR1dGVkXG4gICAgY29uc3QgZm4gPSBuZXcgRnVuY3Rpb24odGhpcywgJ0ZuJywge1xuICAgICAgLi4uZ2V0Q29tbW9uRnVuY3Rpb25Qcm9wcyh0aGlzKSxcbiAgICAgIGNvZGU6IENvZGUuZnJvbUJ1Y2tldChhc3NldC5idWNrZXQsIGFzc2V0LnMzT2JqZWN0S2V5KSxcbiAgICAgIGhhbmRsZXI6ICdpbmRleC5oYW5kbGVyJyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnTmV4dC5qcyBTZXJ2ZXIgSGFuZGxlcicsXG4gICAgICAuLi50aGlzLnByb3BzLmxhbWJkYSxcbiAgICAgIC8vIGBlbnZpcm9ubWVudGAgbmVlZHMgdG8gZ28gYWZ0ZXIgYHRoaXMucHJvcHMubGFtYmRhYCBiL2MgaWZcbiAgICAgIC8vIGB0aGlzLnByb3BzLmxhbWJkYS5lbnZpcm9ubWVudGAgaXMgZGVmaW5lZCwgaXQgd2lsbCBvdmVycmlkZVxuICAgICAgLy8gQ0FDSEVfKiBlbnZpcm9ubWVudCB2YXJpYWJsZXMgd2hpY2ggYXJlIHJlcXVpcmVkXG4gICAgICBlbnZpcm9ubWVudDogeyAuLi50aGlzLmVudmlyb25tZW50LCAuLi50aGlzLnByb3BzLmxhbWJkYT8uZW52aXJvbm1lbnQgfSxcbiAgICB9KTtcbiAgICB0aGlzLnByb3BzLnN0YXRpY0Fzc2V0QnVja2V0LmdyYW50UmVhZFdyaXRlKGZuKTtcblxuICAgIHJldHVybiBmbjtcbiAgfVxufVxuIl19