"use strict";
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.NextjsStaticAssets = void 0;
const JSII_RTTI_SYMBOL_1 = Symbol.for("jsii.rtti");
const fs = require("node:fs");
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
const aws_cdk_lib_1 = require("aws-cdk-lib");
const s3 = require("aws-cdk-lib/aws-s3");
const aws_s3_assets_1 = require("aws-cdk-lib/aws-s3-assets");
const constructs_1 = require("constructs");
const constants_1 = require("./constants");
const NextjsBucketDeployment_1 = require("./NextjsBucketDeployment");
/**
 * Uploads Nextjs built static and public files to S3.
 *
 * Will inject resolved environment variables that are unresolved at synthesis
 * in CloudFormation Custom Resource.
 */
class NextjsStaticAssets extends constructs_1.Construct {
    get buildEnvVars() {
        const buildEnvVars = {};
        for (const [k, v] of Object.entries(this.props.environment || {})) {
            if (k.startsWith('NEXT_PUBLIC')) {
                buildEnvVars[k] = v;
            }
        }
        return buildEnvVars;
    }
    constructor(scope, id, props) {
        super(scope, id);
        this.props = props;
        this.bucket = this.createBucket();
        // when `cdk deploy "NonNextjsStack" --exclusively` is run, don't bundle assets since they will not exist
        if (aws_cdk_lib_1.Stack.of(this).bundlingRequired) {
            const asset = this.createAsset();
            this.createBucketDeployment(asset);
        }
    }
    createBucket() {
        return (this.props.bucket ??
            new s3.Bucket(this, 'Bucket', {
                removalPolicy: aws_cdk_lib_1.RemovalPolicy.DESTROY,
                autoDeleteObjects: true,
                enforceSSL: true,
                blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
                encryption: s3.BucketEncryption.S3_MANAGED,
            }));
    }
    createAsset() {
        // create temporary directory to join open-next's static output with cache output
        const tmpAssetsDir = fs.mkdtempSync((0, node_path_1.resolve)((0, node_os_1.tmpdir)(), 'cdk-nextjs-assets-'));
        fs.cpSync(this.props.nextBuild.nextStaticDir, tmpAssetsDir, { recursive: true });
        fs.cpSync(this.props.nextBuild.nextCacheDir, (0, node_path_1.resolve)(tmpAssetsDir, constants_1.CACHE_BUCKET_KEY_PREFIX), { recursive: true });
        const asset = new aws_s3_assets_1.Asset(this, 'Asset', {
            path: tmpAssetsDir,
        });
        fs.rmSync(tmpAssetsDir, { recursive: true });
        return asset;
    }
    createBucketDeployment(asset) {
        const basePath = this.props.basePath?.replace(/^\//, ''); // remove leading slash (if present)
        const allFiles = basePath ? `${basePath}/**/*` : '**/*';
        const staticFiles = basePath ? `${basePath}/_next/static/**/*'` : '_next/static/**/*';
        return new NextjsBucketDeployment_1.NextjsBucketDeployment(this, 'BucketDeployment', {
            asset,
            destinationBucket: this.bucket,
            destinationKeyPrefix: basePath,
            debug: true,
            // only put env vars that are placeholders in custom resource properties
            // to be replaced. other env vars were injected at build time.
            substitutionConfig: NextjsBucketDeployment_1.NextjsBucketDeployment.getSubstitutionConfig(this.buildEnvVars),
            prune: true,
            putConfig: {
                [allFiles]: {
                    CacheControl: 'public, max-age=0, must-revalidate',
                },
                [staticFiles]: {
                    CacheControl: 'public, max-age=31536000, immutable',
                },
            },
        });
    }
}
_a = JSII_RTTI_SYMBOL_1;
NextjsStaticAssets[_a] = { fqn: "cdk-nextjs-standalone.NextjsStaticAssets", version: "0.0.0" };
exports.NextjsStaticAssets = NextjsStaticAssets;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTmV4dGpzU3RhdGljQXNzZXRzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL05leHRqc1N0YXRpY0Fzc2V0cy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7OztBQUFBLDhCQUE4QjtBQUM5QixxQ0FBaUM7QUFDakMseUNBQW9DO0FBQ3BDLDZDQUFtRDtBQUNuRCx5Q0FBeUM7QUFDekMsNkRBQWtEO0FBQ2xELDJDQUF1QztBQUN2QywyQ0FBc0Q7QUFDdEQscUVBQWtFO0FBNEJsRTs7Ozs7R0FLRztBQUNILE1BQWEsa0JBQW1CLFNBQVEsc0JBQVM7SUFRL0MsSUFBWSxZQUFZO1FBQ3RCLE1BQU0sWUFBWSxHQUEyQixFQUFFLENBQUM7UUFDaEQsS0FBSyxNQUFNLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxJQUFJLE1BQU0sQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxXQUFXLElBQUksRUFBRSxDQUFDLEVBQUU7WUFDakUsSUFBSSxDQUFDLENBQUMsVUFBVSxDQUFDLGFBQWEsQ0FBQyxFQUFFO2dCQUMvQixZQUFZLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDO2FBQ3JCO1NBQ0Y7UUFDRCxPQUFPLFlBQVksQ0FBQztJQUN0QixDQUFDO0lBRUQsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUE4QjtRQUN0RSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ2pCLElBQUksQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDO1FBRW5CLElBQUksQ0FBQyxNQUFNLEdBQUcsSUFBSSxDQUFDLFlBQVksRUFBRSxDQUFDO1FBRWxDLHlHQUF5RztRQUN6RyxJQUFJLG1CQUFLLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDLGdCQUFnQixFQUFFO1lBQ25DLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQztZQUNqQyxJQUFJLENBQUMsc0JBQXNCLENBQUMsS0FBSyxDQUFDLENBQUM7U0FDcEM7SUFDSCxDQUFDO0lBRU8sWUFBWTtRQUNsQixPQUFPLENBQ0wsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNO1lBQ2pCLElBQUksRUFBRSxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsUUFBUSxFQUFFO2dCQUM1QixhQUFhLEVBQUUsMkJBQWEsQ0FBQyxPQUFPO2dCQUNwQyxpQkFBaUIsRUFBRSxJQUFJO2dCQUN2QixVQUFVLEVBQUUsSUFBSTtnQkFDaEIsaUJBQWlCLEVBQUUsRUFBRSxDQUFDLGlCQUFpQixDQUFDLFNBQVM7Z0JBQ2pELFVBQVUsRUFBRSxFQUFFLENBQUMsZ0JBQWdCLENBQUMsVUFBVTthQUMzQyxDQUFDLENBQ0gsQ0FBQztJQUNKLENBQUM7SUFFTyxXQUFXO1FBQ2pCLGlGQUFpRjtRQUNqRixNQUFNLFlBQVksR0FBRyxFQUFFLENBQUMsV0FBVyxDQUFDLElBQUEsbUJBQU8sRUFBQyxJQUFBLGdCQUFNLEdBQUUsRUFBRSxvQkFBb0IsQ0FBQyxDQUFDLENBQUM7UUFDN0UsRUFBRSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxhQUFhLEVBQUUsWUFBWSxFQUFFLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7UUFDakYsRUFBRSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxZQUFZLEVBQUUsSUFBQSxtQkFBTyxFQUFDLFlBQVksRUFBRSxtQ0FBdUIsQ0FBQyxFQUFFLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7UUFDbEgsTUFBTSxLQUFLLEdBQUcsSUFBSSxxQkFBSyxDQUFDLElBQUksRUFBRSxPQUFPLEVBQUU7WUFDckMsSUFBSSxFQUFFLFlBQVk7U0FDbkIsQ0FBQyxDQUFDO1FBQ0gsRUFBRSxDQUFDLE1BQU0sQ0FBQyxZQUFZLEVBQUUsRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztRQUM3QyxPQUFPLEtBQUssQ0FBQztJQUNmLENBQUM7SUFFTyxzQkFBc0IsQ0FBQyxLQUFZO1FBQ3pDLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsUUFBUSxFQUFFLE9BQU8sQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxvQ0FBb0M7UUFDOUYsTUFBTSxRQUFRLEdBQUcsUUFBUSxDQUFDLENBQUMsQ0FBQyxHQUFHLFFBQVEsT0FBTyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUM7UUFDeEQsTUFBTSxXQUFXLEdBQUcsUUFBUSxDQUFDLENBQUMsQ0FBQyxHQUFHLFFBQVEscUJBQXFCLENBQUMsQ0FBQyxDQUFDLG1CQUFtQixDQUFDO1FBRXRGLE9BQU8sSUFBSSwrQ0FBc0IsQ0FBQyxJQUFJLEVBQUUsa0JBQWtCLEVBQUU7WUFDMUQsS0FBSztZQUNMLGlCQUFpQixFQUFFLElBQUksQ0FBQyxNQUFNO1lBQzlCLG9CQUFvQixFQUFFLFFBQVE7WUFDOUIsS0FBSyxFQUFFLElBQUk7WUFDWCx3RUFBd0U7WUFDeEUsOERBQThEO1lBQzlELGtCQUFrQixFQUFFLCtDQUFzQixDQUFDLHFCQUFxQixDQUFDLElBQUksQ0FBQyxZQUFZLENBQUM7WUFDbkYsS0FBSyxFQUFFLElBQUk7WUFDWCxTQUFTLEVBQUU7Z0JBQ1QsQ0FBQyxRQUFRLENBQUMsRUFBRTtvQkFDVixZQUFZLEVBQUUsb0NBQW9DO2lCQUNuRDtnQkFDRCxDQUFDLFdBQVcsQ0FBQyxFQUFFO29CQUNiLFlBQVksRUFBRSxxQ0FBcUM7aUJBQ3BEO2FBQ0Y7U0FDRixDQUFDLENBQUM7SUFDTCxDQUFDOzs7O0FBL0VVLGdEQUFrQiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGZzIGZyb20gJ25vZGU6ZnMnO1xuaW1wb3J0IHsgdG1wZGlyIH0gZnJvbSAnbm9kZTpvcyc7XG5pbXBvcnQgeyByZXNvbHZlIH0gZnJvbSAnbm9kZTpwYXRoJztcbmltcG9ydCB7IFJlbW92YWxQb2xpY3ksIFN0YWNrIH0gZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0ICogYXMgczMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXMzJztcbmltcG9ydCB7IEFzc2V0IH0gZnJvbSAnYXdzLWNkay1saWIvYXdzLXMzLWFzc2V0cyc7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcbmltcG9ydCB7IENBQ0hFX0JVQ0tFVF9LRVlfUFJFRklYIH0gZnJvbSAnLi9jb25zdGFudHMnO1xuaW1wb3J0IHsgTmV4dGpzQnVja2V0RGVwbG95bWVudCB9IGZyb20gJy4vTmV4dGpzQnVja2V0RGVwbG95bWVudCc7XG5pbXBvcnQgeyBOZXh0anNCdWlsZCB9IGZyb20gJy4vTmV4dGpzQnVpbGQnO1xuXG5leHBvcnQgaW50ZXJmYWNlIE5leHRqc1N0YXRpY0Fzc2V0c1Byb3BzIHtcbiAgLyoqXG4gICAqIERlZmluZSB5b3VyIG93biBidWNrZXQgdG8gc3RvcmUgc3RhdGljIGFzc2V0cy5cbiAgICovXG4gIHJlYWRvbmx5IGJ1Y2tldD86IHMzLklCdWNrZXQgfCB1bmRlZmluZWQ7XG4gIC8qKlxuICAgKiBUaGUgYE5leHRqc0J1aWxkYCBpbnN0YW5jZSByZXByZXNlbnRpbmcgdGhlIGJ1aWx0IE5leHRqcyBhcHBsaWNhdGlvbi5cbiAgICovXG4gIHJlYWRvbmx5IG5leHRCdWlsZDogTmV4dGpzQnVpbGQ7XG4gIC8qKlxuICAgKiBDdXN0b20gZW52aXJvbm1lbnQgdmFyaWFibGVzIHRvIHBhc3MgdG8gdGhlIE5leHRKUyBidWlsZCBhbmQgcnVudGltZS5cbiAgICovXG4gIHJlYWRvbmx5IGVudmlyb25tZW50PzogUmVjb3JkPHN0cmluZywgc3RyaW5nPjtcbiAgLyoqXG4gICAqIE9wdGlvbmFsIHZhbHVlIHRvIHByZWZpeCB0aGUgTmV4dC5qcyBzaXRlIHVuZGVyIGEgL3ByZWZpeCBwYXRoIG9uIENsb3VkRnJvbnQuXG4gICAqIFVzdWFsbHkgdXNlZCB3aGVuIHlvdSBkZXBsb3kgbXVsdGlwbGUgTmV4dC5qcyBzaXRlcyBvbiBzYW1lIGRvbWFpbiB1c2luZyAvc3ViLXBhdGhcbiAgICpcbiAgICogTm90ZSwgeW91J2xsIG5lZWQgdG8gc2V0IFtiYXNlUGF0aF0oaHR0cHM6Ly9uZXh0anMub3JnL2RvY3MvYXBwL2FwaS1yZWZlcmVuY2UvbmV4dC1jb25maWctanMvYmFzZVBhdGgpXG4gICAqIGluIHlvdXIgYG5leHQuY29uZmlnLnRzYCB0byB0aGlzIHZhbHVlIGFuZCBlbnN1cmUgYW55IGZpbGVzIGluIGBwdWJsaWNgXG4gICAqIGZvbGRlciBoYXZlIGNvcnJlY3QgcHJlZml4LlxuICAgKiBAZXhhbXBsZSBcIi9teS1iYXNlLXBhdGhcIlxuICAgKi9cbiAgcmVhZG9ubHkgYmFzZVBhdGg/OiBzdHJpbmc7XG59XG5cbi8qKlxuICogVXBsb2FkcyBOZXh0anMgYnVpbHQgc3RhdGljIGFuZCBwdWJsaWMgZmlsZXMgdG8gUzMuXG4gKlxuICogV2lsbCBpbmplY3QgcmVzb2x2ZWQgZW52aXJvbm1lbnQgdmFyaWFibGVzIHRoYXQgYXJlIHVucmVzb2x2ZWQgYXQgc3ludGhlc2lzXG4gKiBpbiBDbG91ZEZvcm1hdGlvbiBDdXN0b20gUmVzb3VyY2UuXG4gKi9cbmV4cG9ydCBjbGFzcyBOZXh0anNTdGF0aWNBc3NldHMgZXh0ZW5kcyBDb25zdHJ1Y3Qge1xuICAvKipcbiAgICogQnVja2V0IGNvbnRhaW5pbmcgYXNzZXRzLlxuICAgKi9cbiAgYnVja2V0OiBzMy5JQnVja2V0O1xuXG4gIHByb3RlY3RlZCBwcm9wczogTmV4dGpzU3RhdGljQXNzZXRzUHJvcHM7XG5cbiAgcHJpdmF0ZSBnZXQgYnVpbGRFbnZWYXJzKCkge1xuICAgIGNvbnN0IGJ1aWxkRW52VmFyczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHt9O1xuICAgIGZvciAoY29uc3QgW2ssIHZdIG9mIE9iamVjdC5lbnRyaWVzKHRoaXMucHJvcHMuZW52aXJvbm1lbnQgfHwge30pKSB7XG4gICAgICBpZiAoay5zdGFydHNXaXRoKCdORVhUX1BVQkxJQycpKSB7XG4gICAgICAgIGJ1aWxkRW52VmFyc1trXSA9IHY7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBidWlsZEVudlZhcnM7XG4gIH1cblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogTmV4dGpzU3RhdGljQXNzZXRzUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuICAgIHRoaXMucHJvcHMgPSBwcm9wcztcblxuICAgIHRoaXMuYnVja2V0ID0gdGhpcy5jcmVhdGVCdWNrZXQoKTtcblxuICAgIC8vIHdoZW4gYGNkayBkZXBsb3kgXCJOb25OZXh0anNTdGFja1wiIC0tZXhjbHVzaXZlbHlgIGlzIHJ1biwgZG9uJ3QgYnVuZGxlIGFzc2V0cyBzaW5jZSB0aGV5IHdpbGwgbm90IGV4aXN0XG4gICAgaWYgKFN0YWNrLm9mKHRoaXMpLmJ1bmRsaW5nUmVxdWlyZWQpIHtcbiAgICAgIGNvbnN0IGFzc2V0ID0gdGhpcy5jcmVhdGVBc3NldCgpO1xuICAgICAgdGhpcy5jcmVhdGVCdWNrZXREZXBsb3ltZW50KGFzc2V0KTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGNyZWF0ZUJ1Y2tldCgpOiBzMy5JQnVja2V0IHtcbiAgICByZXR1cm4gKFxuICAgICAgdGhpcy5wcm9wcy5idWNrZXQgPz9cbiAgICAgIG5ldyBzMy5CdWNrZXQodGhpcywgJ0J1Y2tldCcsIHtcbiAgICAgICAgcmVtb3ZhbFBvbGljeTogUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgICBhdXRvRGVsZXRlT2JqZWN0czogdHJ1ZSxcbiAgICAgICAgZW5mb3JjZVNTTDogdHJ1ZSxcbiAgICAgICAgYmxvY2tQdWJsaWNBY2Nlc3M6IHMzLkJsb2NrUHVibGljQWNjZXNzLkJMT0NLX0FMTCxcbiAgICAgICAgZW5jcnlwdGlvbjogczMuQnVja2V0RW5jcnlwdGlvbi5TM19NQU5BR0VELFxuICAgICAgfSlcbiAgICApO1xuICB9XG5cbiAgcHJpdmF0ZSBjcmVhdGVBc3NldCgpOiBBc3NldCB7XG4gICAgLy8gY3JlYXRlIHRlbXBvcmFyeSBkaXJlY3RvcnkgdG8gam9pbiBvcGVuLW5leHQncyBzdGF0aWMgb3V0cHV0IHdpdGggY2FjaGUgb3V0cHV0XG4gICAgY29uc3QgdG1wQXNzZXRzRGlyID0gZnMubWtkdGVtcFN5bmMocmVzb2x2ZSh0bXBkaXIoKSwgJ2Nkay1uZXh0anMtYXNzZXRzLScpKTtcbiAgICBmcy5jcFN5bmModGhpcy5wcm9wcy5uZXh0QnVpbGQubmV4dFN0YXRpY0RpciwgdG1wQXNzZXRzRGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcbiAgICBmcy5jcFN5bmModGhpcy5wcm9wcy5uZXh0QnVpbGQubmV4dENhY2hlRGlyLCByZXNvbHZlKHRtcEFzc2V0c0RpciwgQ0FDSEVfQlVDS0VUX0tFWV9QUkVGSVgpLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcbiAgICBjb25zdCBhc3NldCA9IG5ldyBBc3NldCh0aGlzLCAnQXNzZXQnLCB7XG4gICAgICBwYXRoOiB0bXBBc3NldHNEaXIsXG4gICAgfSk7XG4gICAgZnMucm1TeW5jKHRtcEFzc2V0c0RpciwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG4gICAgcmV0dXJuIGFzc2V0O1xuICB9XG5cbiAgcHJpdmF0ZSBjcmVhdGVCdWNrZXREZXBsb3ltZW50KGFzc2V0OiBBc3NldCkge1xuICAgIGNvbnN0IGJhc2VQYXRoID0gdGhpcy5wcm9wcy5iYXNlUGF0aD8ucmVwbGFjZSgvXlxcLy8sICcnKTsgLy8gcmVtb3ZlIGxlYWRpbmcgc2xhc2ggKGlmIHByZXNlbnQpXG4gICAgY29uc3QgYWxsRmlsZXMgPSBiYXNlUGF0aCA/IGAke2Jhc2VQYXRofS8qKi8qYCA6ICcqKi8qJztcbiAgICBjb25zdCBzdGF0aWNGaWxlcyA9IGJhc2VQYXRoID8gYCR7YmFzZVBhdGh9L19uZXh0L3N0YXRpYy8qKi8qJ2AgOiAnX25leHQvc3RhdGljLyoqLyonO1xuXG4gICAgcmV0dXJuIG5ldyBOZXh0anNCdWNrZXREZXBsb3ltZW50KHRoaXMsICdCdWNrZXREZXBsb3ltZW50Jywge1xuICAgICAgYXNzZXQsXG4gICAgICBkZXN0aW5hdGlvbkJ1Y2tldDogdGhpcy5idWNrZXQsXG4gICAgICBkZXN0aW5hdGlvbktleVByZWZpeDogYmFzZVBhdGgsXG4gICAgICBkZWJ1ZzogdHJ1ZSxcbiAgICAgIC8vIG9ubHkgcHV0IGVudiB2YXJzIHRoYXQgYXJlIHBsYWNlaG9sZGVycyBpbiBjdXN0b20gcmVzb3VyY2UgcHJvcGVydGllc1xuICAgICAgLy8gdG8gYmUgcmVwbGFjZWQuIG90aGVyIGVudiB2YXJzIHdlcmUgaW5qZWN0ZWQgYXQgYnVpbGQgdGltZS5cbiAgICAgIHN1YnN0aXR1dGlvbkNvbmZpZzogTmV4dGpzQnVja2V0RGVwbG95bWVudC5nZXRTdWJzdGl0dXRpb25Db25maWcodGhpcy5idWlsZEVudlZhcnMpLFxuICAgICAgcHJ1bmU6IHRydWUsXG4gICAgICBwdXRDb25maWc6IHtcbiAgICAgICAgW2FsbEZpbGVzXToge1xuICAgICAgICAgIENhY2hlQ29udHJvbDogJ3B1YmxpYywgbWF4LWFnZT0wLCBtdXN0LXJldmFsaWRhdGUnLFxuICAgICAgICB9LFxuICAgICAgICBbc3RhdGljRmlsZXNdOiB7XG4gICAgICAgICAgQ2FjaGVDb250cm9sOiAncHVibGljLCBtYXgtYWdlPTMxNTM2MDAwLCBpbW11dGFibGUnLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICB9KTtcbiAgfVxufVxuIl19