"use strict";
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.NextjsDistribution = void 0;
const JSII_RTTI_SYMBOL_1 = Symbol.for("jsii.rtti");
const fs = require("node:fs");
const path = require("path");
const aws_cdk_lib_1 = require("aws-cdk-lib");
const acm = require("aws-cdk-lib/aws-certificatemanager");
const cloudfront = require("aws-cdk-lib/aws-cloudfront");
const aws_cloudfront_1 = require("aws-cdk-lib/aws-cloudfront");
const origins = require("aws-cdk-lib/aws-cloudfront-origins");
const aws_iam_1 = require("aws-cdk-lib/aws-iam");
const lambda = require("aws-cdk-lib/aws-lambda");
const aws_lambda_1 = require("aws-cdk-lib/aws-lambda");
const route53 = require("aws-cdk-lib/aws-route53");
const route53Patterns = require("aws-cdk-lib/aws-route53-patterns");
const route53Targets = require("aws-cdk-lib/aws-route53-targets");
const constructs_1 = require("constructs");
const constants_1 = require("./constants");
/**
 * Create a CloudFront distribution to serve a Next.js application.
 */
class NextjsDistribution extends constructs_1.Construct {
    constructor(scope, id, props) {
        super(scope, id);
        this.commonBehaviorOptions = {
            viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
            compress: true,
        };
        this.edgeLambdas = [];
        this.props = props;
        // Create Custom Domain
        this.validateCustomDomainSettings();
        this.hostedZone = this.lookupHostedZone();
        this.certificate = this.createCertificate();
        // Create Behaviors
        this.s3Origin = new origins.S3Origin(this.props.staticAssetsBucket);
        this.staticBehaviorOptions = this.createStaticBehaviorOptions();
        if (this.isFnUrlIamAuth) {
            this.edgeLambdas.push(this.createEdgeLambda());
        }
        this.serverBehaviorOptions = this.createServerBehaviorOptions();
        this.imageBehaviorOptions = this.createImageBehaviorOptions();
        // Create CloudFront Distribution
        this.distribution = this.getCloudFrontDistribution();
        this.addStaticBehaviorsToDistribution();
        this.addRootPathBehavior();
        // Connect Custom Domain to CloudFront Distribution
        this.createRoute53Records();
    }
    /**
     * The CloudFront URL of the website.
     */
    get url() {
        return `https://${this.distribution.distributionDomainName}`;
    }
    get customDomainName() {
        const { customDomain } = this.props;
        if (!customDomain) {
            return;
        }
        if (typeof customDomain === 'string') {
            return customDomain;
        }
        return customDomain.domainName;
    }
    /**
     * If the custom domain is enabled, this is the URL of the website with the
     * custom domain.
     */
    get customDomainUrl() {
        const customDomainName = this.customDomainName;
        return customDomainName ? `https://${customDomainName}` : undefined;
    }
    /**
     * The ID of the internally created CloudFront Distribution.
     */
    get distributionId() {
        return this.distribution.distributionId;
    }
    /**
     * The domain name of the internally created CloudFront Distribution.
     */
    get distributionDomain() {
        return this.distribution.distributionDomainName;
    }
    get isFnUrlIamAuth() {
        return this.props.functionUrlAuthType === lambda.FunctionUrlAuthType.AWS_IAM;
    }
    createStaticBehaviorOptions() {
        const staticClientMaxAge = this.props.cachePolicies?.staticClientMaxAgeDefault || constants_1.DEFAULT_STATIC_MAX_AGE;
        // TODO: remove this response headers policy once S3 files have correct cache control headers with new asset deployment technique
        const responseHeadersPolicy = this.props.cachePolicies?.staticResponseHeaderPolicy ??
            new aws_cloudfront_1.ResponseHeadersPolicy(this, 'StaticResponseHeadersPolicy', {
                // add default header for static assets
                customHeadersBehavior: {
                    customHeaders: [
                        {
                            header: 'cache-control',
                            override: false,
                            // by default tell browser to cache static files for this long
                            // this is separate from the origin cache policy
                            value: `public,max-age=${staticClientMaxAge},immutable`,
                        },
                    ],
                },
            });
        const cachePolicy = this.props.cachePolicies?.staticCachePolicy ?? cloudfront.CachePolicy.CACHING_OPTIMIZED;
        return {
            ...this.commonBehaviorOptions,
            origin: this.s3Origin,
            allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
            cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
            cachePolicy,
            responseHeadersPolicy,
        };
    }
    get fnUrlAuthType() {
        return this.props.functionUrlAuthType || lambda.FunctionUrlAuthType.NONE;
    }
    /**
     * Once CloudFront OAC is released, remove this to reduce latency.
     */
    createEdgeLambda() {
        const signFnUrlDir = path.resolve(__dirname, '..', 'assets', 'lambdas', 'sign-fn-url');
        const originRequestEdgeFn = new cloudfront.experimental.EdgeFunction(this, 'EdgeFn', {
            runtime: aws_lambda_1.Runtime.NODEJS_18_X,
            handler: 'index.handler',
            code: lambda.Code.fromAsset(signFnUrlDir),
            currentVersionOptions: {
                removalPolicy: aws_cdk_lib_1.RemovalPolicy.DESTROY,
                retryAttempts: 1, // async retry attempts
            },
        });
        originRequestEdgeFn.currentVersion.grantInvoke(new aws_iam_1.ServicePrincipal('edgelambda.amazonaws.com'));
        originRequestEdgeFn.currentVersion.grantInvoke(new aws_iam_1.ServicePrincipal('lambda.amazonaws.com'));
        originRequestEdgeFn.addToRolePolicy(new aws_iam_1.PolicyStatement({
            actions: ['lambda:InvokeFunctionUrl'],
            resources: [this.props.serverFunction.functionArn, this.props.imageOptFunction.functionArn],
        }));
        const originRequestEdgeFnVersion = lambda.Version.fromVersionArn(this, 'Version', originRequestEdgeFn.currentVersion.functionArn);
        return {
            eventType: cloudfront.LambdaEdgeEventType.ORIGIN_REQUEST,
            functionVersion: originRequestEdgeFnVersion,
            includeBody: true,
        };
    }
    createServerBehaviorOptions() {
        const fnUrl = this.props.serverFunction.addFunctionUrl({ authType: this.fnUrlAuthType });
        const origin = new origins.HttpOrigin(aws_cdk_lib_1.Fn.parseDomainName(fnUrl.url));
        const originRequestPolicy = this.props.originRequestPolicies?.serverOriginRequestPolicy ??
            cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER;
        const cachePolicy = this.props.cachePolicies?.serverCachePolicy ??
            new cloudfront.CachePolicy(this, 'ServerCachePolicy', NextjsDistribution.serverCachePolicyProps);
        return {
            ...this.commonBehaviorOptions,
            origin,
            allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
            originRequestPolicy,
            cachePolicy,
            edgeLambdas: this.edgeLambdas.length ? this.edgeLambdas : undefined,
            functionAssociations: this.createCloudFrontFnAssociations(),
        };
    }
    /**
     * If this doesn't run, then Next.js Server's `request.url` will be Lambda Function
     * URL instead of domain
     */
    createCloudFrontFnAssociations() {
        const cloudFrontFn = new cloudfront.Function(this, 'CloudFrontFn', {
            code: cloudfront.FunctionCode.fromInline(`
      function handler(event) {
        var request = event.request;
        request.headers["x-forwarded-host"] = request.headers.host;
        return request;
      }
      `),
        });
        return [{ eventType: cloudfront.FunctionEventType.VIEWER_REQUEST, function: cloudFrontFn }];
    }
    createImageBehaviorOptions() {
        const imageOptFnUrl = this.props.imageOptFunction.addFunctionUrl({ authType: this.fnUrlAuthType });
        const origin = new origins.HttpOrigin(aws_cdk_lib_1.Fn.parseDomainName(imageOptFnUrl.url));
        const originRequestPolicy = this.props.originRequestPolicies?.imageOptimizationOriginRequestPolicy ??
            cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER;
        const cachePolicy = this.props.cachePolicies?.imageCachePolicy ??
            new cloudfront.CachePolicy(this, 'ImageCachePolicy', NextjsDistribution.imageCachePolicyProps);
        return {
            ...this.commonBehaviorOptions,
            origin,
            allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
            cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
            cachePolicy,
            originRequestPolicy,
            edgeLambdas: this.edgeLambdas,
        };
    }
    /**
     * Creates or uses user specified CloudFront Distribution adding behaviors
     * needed for Next.js.
     */
    getCloudFrontDistribution() {
        let distribution;
        if (this.props.distribution) {
            if (this.props.cdk?.distribution) {
                throw new Error('You can either pass an existing "distribution" or pass configs to create one via "cdk.distribution".');
            }
            distribution = this.props.distribution;
        }
        else {
            distribution = this.createCloudFrontDistribution();
        }
        distribution.addBehavior(this.getPathPattern('api/*'), this.serverBehaviorOptions.origin, this.serverBehaviorOptions);
        distribution.addBehavior(this.getPathPattern('_next/data/*'), this.serverBehaviorOptions.origin, this.serverBehaviorOptions);
        distribution.addBehavior(this.getPathPattern('_next/image*'), this.imageBehaviorOptions.origin, this.imageBehaviorOptions);
        return distribution;
    }
    /**
     * Creates default CloudFront Distribution. Note, this construct will not
     * create a CloudFront Distribution if one is passed in by user.
     */
    createCloudFrontDistribution(cfDistributionProps) {
        // build domainNames
        const domainNames = this.buildDistributionDomainNames();
        return new cloudfront.Distribution(this, 'Distribution', {
            // defaultRootObject: "index.html",
            defaultRootObject: '',
            minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
            // Override props.
            ...cfDistributionProps,
            // these values can NOT be overwritten by cfDistributionProps
            domainNames,
            certificate: this.certificate,
            defaultBehavior: this.serverBehaviorOptions,
        });
    }
    /**
     * this needs to be added last so that it doesn't override any other behaviors
     * when basePath is set, we emulate the "default behavior" (*) and / as `/base-path/*`
     * @private
     */
    addRootPathBehavior() {
        // if we don't have a static file called index.html then we should
        // redirect to the lambda handler
        const hasIndexHtml = this.props.nextBuild.readPublicFileList().includes('index.html');
        if (hasIndexHtml)
            return; // don't add root path behavior
        const { origin, ...options } = this.serverBehaviorOptions;
        // when basePath is set, we emulate the "default behavior" (*) for the site as `/base-path/*`
        if (this.props.basePath) {
            this.distribution.addBehavior(this.getPathPattern(''), origin, options);
            this.distribution.addBehavior(this.getPathPattern('*'), origin, options);
        }
        else {
            this.distribution.addBehavior(this.getPathPattern('/'), origin, options);
        }
    }
    addStaticBehaviorsToDistribution() {
        const publicFiles = fs.readdirSync(path.join(this.props.nextjsPath, constants_1.NEXTJS_BUILD_DIR, constants_1.NEXTJS_STATIC_DIR), {
            withFileTypes: true,
        });
        if (publicFiles.length >= 25) {
            throw new Error(`Too many public/ files in Next.js build. CloudFront limits Distributions to 25 Cache Behaviors. See documented limit here: https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cloudfront-limits.html#limits-web-distributions`);
        }
        for (const publicFile of publicFiles) {
            const pathPattern = publicFile.isDirectory() ? `${publicFile.name}/*` : publicFile.name;
            if (!/^[a-zA-Z0-9_\-\.\*\$/~"'@:+?&]+$/.test(pathPattern)) {
                throw new Error(`Invalid CloudFront Distribution Cache Behavior Path Pattern: ${pathPattern}. Please see documentation here: https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/distribution-web-values-specify.html#DownloadDistValuesPathPattern`);
            }
            const finalPathPattern = this.getPathPattern(pathPattern);
            this.distribution.addBehavior(finalPathPattern, this.s3Origin, this.staticBehaviorOptions);
        }
    }
    /**
     * Optionally prepends base path to given path pattern.
     */
    getPathPattern(pathPattern) {
        if (this.props.basePath) {
            // because we already have a basePath we don't use / instead we use /base-path
            if (pathPattern === '')
                return this.props.basePath;
            return `${this.props.basePath}/${pathPattern}`;
        }
        return pathPattern;
    }
    buildDistributionDomainNames() {
        const customDomain = typeof this.props.customDomain === 'string' ? this.props.customDomain : this.props.customDomain?.domainName;
        const alternateNames = typeof this.props.customDomain === 'string' ? [] : this.props.customDomain?.alternateNames || [];
        return customDomain ? [customDomain, ...alternateNames] : [];
    }
    /////////////////////
    // Custom Domain
    /////////////////////
    validateCustomDomainSettings() {
        const { customDomain } = this.props;
        if (!customDomain) {
            return;
        }
        if (typeof customDomain === 'string') {
            return;
        }
        if (customDomain.isExternalDomain === true) {
            if (!customDomain.certificate) {
                throw new Error('A valid certificate is required when "isExternalDomain" is set to "true".');
            }
            if (customDomain.domainAlias) {
                throw new Error('Domain alias is only supported for domains hosted on Amazon Route 53. Do not set the "customDomain.domainAlias" when "isExternalDomain" is enabled.');
            }
            if (customDomain.hostedZone) {
                throw new Error('Hosted zones can only be configured for domains hosted on Amazon Route 53. Do not set the "customDomain.hostedZone" when "isExternalDomain" is enabled.');
            }
        }
    }
    lookupHostedZone() {
        const { customDomain } = this.props;
        // Skip if customDomain is not configured
        if (!customDomain) {
            return;
        }
        let hostedZone;
        if (typeof customDomain === 'string') {
            hostedZone = route53.HostedZone.fromLookup(this, 'HostedZone', {
                domainName: customDomain,
            });
        }
        else if (typeof customDomain.hostedZone === 'string') {
            hostedZone = route53.HostedZone.fromLookup(this, 'HostedZone', {
                domainName: customDomain.hostedZone,
            });
        }
        else if (customDomain.hostedZone) {
            hostedZone = customDomain.hostedZone;
        }
        else if (typeof customDomain.domainName === 'string') {
            // Skip if domain is not a Route53 domain
            if (customDomain.isExternalDomain === true) {
                return;
            }
            hostedZone = route53.HostedZone.fromLookup(this, 'HostedZone', {
                domainName: customDomain.domainName,
            });
        }
        else {
            hostedZone = customDomain.hostedZone;
        }
        return hostedZone;
    }
    createCertificate() {
        const { customDomain } = this.props;
        if (!customDomain) {
            return;
        }
        let acmCertificate;
        // HostedZone is set for Route 53 domains
        if (this.hostedZone) {
            if (typeof customDomain === 'string') {
                acmCertificate = new acm.DnsValidatedCertificate(this, 'Certificate', {
                    domainName: customDomain,
                    hostedZone: this.hostedZone,
                    region: 'us-east-1',
                });
            }
            else if (customDomain.certificate) {
                acmCertificate = customDomain.certificate;
            }
            else {
                acmCertificate = new acm.DnsValidatedCertificate(this, 'Certificate', {
                    domainName: customDomain.domainName,
                    hostedZone: this.hostedZone,
                    region: 'us-east-1',
                });
            }
        }
        // HostedZone is NOT set for non-Route 53 domains
        else {
            if (typeof customDomain !== 'string') {
                acmCertificate = customDomain.certificate;
            }
        }
        return acmCertificate;
    }
    createRoute53Records() {
        const { customDomain } = this.props;
        if (!customDomain || !this.hostedZone) {
            return;
        }
        let recordName;
        let domainAlias;
        if (typeof customDomain === 'string') {
            recordName = customDomain;
        }
        else {
            recordName = customDomain.domainName;
            domainAlias = customDomain.domainAlias;
        }
        // Create DNS record
        const recordProps = {
            recordName,
            zone: this.hostedZone,
            target: route53.RecordTarget.fromAlias(new route53Targets.CloudFrontTarget(this.distribution)),
        };
        new route53.ARecord(this, 'AliasRecord', recordProps);
        new route53.AaaaRecord(this, 'AliasRecordAAAA', recordProps);
        // Create Alias redirect record
        if (domainAlias) {
            new route53Patterns.HttpsRedirect(this, 'Redirect', {
                zone: this.hostedZone,
                recordNames: [domainAlias],
                targetDomain: recordName,
            });
        }
    }
}
_a = JSII_RTTI_SYMBOL_1;
NextjsDistribution[_a] = { fqn: "cdk-nextjs-standalone.NextjsDistribution", version: "0.0.0" };
/**
 * The default CloudFront cache policy properties for dynamic requests to server handler.
 */
NextjsDistribution.serverCachePolicyProps = {
    queryStringBehavior: cloudfront.CacheQueryStringBehavior.all(),
    headerBehavior: cloudfront.CacheHeaderBehavior.allowList('accept', 'rsc', 'next-router-prefetch', 'next-router-state-tree', 'next-url'),
    cookieBehavior: cloudfront.CacheCookieBehavior.all(),
    defaultTtl: aws_cdk_lib_1.Duration.seconds(0),
    maxTtl: aws_cdk_lib_1.Duration.days(365),
    minTtl: aws_cdk_lib_1.Duration.seconds(0),
    enableAcceptEncodingBrotli: true,
    enableAcceptEncodingGzip: true,
    comment: 'Nextjs Server Default Cache Policy',
};
/**
 * The default CloudFront Cache Policy properties for images.
 */
NextjsDistribution.imageCachePolicyProps = {
    queryStringBehavior: cloudfront.CacheQueryStringBehavior.all(),
    headerBehavior: cloudfront.CacheHeaderBehavior.allowList('accept'),
    cookieBehavior: cloudfront.CacheCookieBehavior.all(),
    defaultTtl: aws_cdk_lib_1.Duration.days(1),
    maxTtl: aws_cdk_lib_1.Duration.days(365),
    minTtl: aws_cdk_lib_1.Duration.days(0),
    enableAcceptEncodingBrotli: true,
    enableAcceptEncodingGzip: true,
    comment: 'Nextjs Image Default Cache Policy',
};
exports.NextjsDistribution = NextjsDistribution;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTmV4dGpzRGlzdHJpYnV0aW9uLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL05leHRqc0Rpc3RyaWJ1dGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7OztBQUFBLDhCQUE4QjtBQUM5Qiw2QkFBNkI7QUFDN0IsNkNBQTBEO0FBQzFELDBEQUEwRDtBQUMxRCx5REFBeUQ7QUFDekQsK0RBQWlGO0FBQ2pGLDhEQUE4RDtBQUM5RCxpREFBd0U7QUFDeEUsaURBQWlEO0FBQ2pELHVEQUFpRDtBQUNqRCxtREFBbUQ7QUFDbkQsb0VBQW9FO0FBQ3BFLGtFQUFrRTtBQUVsRSwyQ0FBdUM7QUFDdkMsMkNBQTBGO0FBb0kxRjs7R0FFRztBQUNILE1BQWEsa0JBQW1CLFNBQVEsc0JBQVM7SUFzRS9DLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBOEI7UUFDdEUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQWhCWCwwQkFBcUIsR0FBMEU7WUFDckcsb0JBQW9CLEVBQUUsVUFBVSxDQUFDLG9CQUFvQixDQUFDLGlCQUFpQjtZQUN2RSxRQUFRLEVBQUUsSUFBSTtTQUNmLENBQUM7UUFNTSxnQkFBVyxHQUE0QixFQUFFLENBQUM7UUFTaEQsSUFBSSxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUM7UUFFbkIsdUJBQXVCO1FBQ3ZCLElBQUksQ0FBQyw0QkFBNEIsRUFBRSxDQUFDO1FBQ3BDLElBQUksQ0FBQyxVQUFVLEdBQUcsSUFBSSxDQUFDLGdCQUFnQixFQUFFLENBQUM7UUFDMUMsSUFBSSxDQUFDLFdBQVcsR0FBRyxJQUFJLENBQUMsaUJBQWlCLEVBQUUsQ0FBQztRQUU1QyxtQkFBbUI7UUFDbkIsSUFBSSxDQUFDLFFBQVEsR0FBRyxJQUFJLE9BQU8sQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO1FBQ3BFLElBQUksQ0FBQyxxQkFBcUIsR0FBRyxJQUFJLENBQUMsMkJB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QVUsRUFBRSxzQkFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7SUFDL0IsTUFBTSxFQUFFLHNCQUFRLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQztJQUMxQixNQUFNLEVBQUUsc0JBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO0lBQzNCLDBCQUEwQixFQUFFLElBQUk7SUFDaEMsd0JBQXdCLEVBQUUsSUFBSTtJQUM5QixPQUFPLEVBQUUsb0NBQW9DO0NBQzlDLEFBaEJtQyxDQWdCbEM7QUFFRjs7R0FFRztBQUNXLHdDQUFxQixHQUFnQztJQUNqRSxtQkFBbUIsRUFBRSxVQUFVLENBQUMsd0JBQXdCLENBQUMsR0FBRyxFQUFFO0lBQzlELGNBQWMsRUFBRSxVQUFVLENBQUMsbUJBQW1CLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQztJQUNsRSxjQUFjLEVBQUUsVUFBVSxDQUFDLG1CQUFtQixDQUFDLEdBQUcsRUFBRTtJQUNwRCxVQUFVLEVBQUUsc0JBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO0lBQzVCLE1BQU0sRUFBRSxzQkFBUSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUM7SUFDMUIsTUFBTSxFQUFFLHNCQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztJQUN4QiwwQkFBMEIsRUFBRSxJQUFJO0lBQ2hDLHdCQUF3QixFQUFFLElBQUk7SUFDOUIsT0FBTyxFQUFFLG1DQUFtQztDQUM3QyxBQVZrQyxDQVVqQztBQW5DUyxnREFBa0IiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBmcyBmcm9tICdub2RlOmZzJztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XG5pbXBvcnQgeyBEdXJhdGlvbiwgRm4sIFJlbW92YWxQb2xpY3kgfSBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgKiBhcyBhY20gZnJvbSAnYXdzLWNkay1saWIvYXdzLWNlcnRpZmljYXRlbWFuYWdlcic7XG5pbXBvcnQgKiBhcyBjbG91ZGZyb250IGZyb20gJ2F3cy1jZGstbGliL2F3cy1jbG91ZGZyb250JztcbmltcG9ydCB7IERpc3RyaWJ1dGlvbiwgUmVzcG9uc2VIZWFkZXJzUG9saWN5IH0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWNsb3VkZnJvbnQnO1xuaW1wb3J0ICogYXMgb3JpZ2lucyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY2xvdWRmcm9udC1vcmlnaW5zJztcbmltcG9ydCB7IFBvbGljeVN0YXRlbWVudCwgU2VydmljZVByaW5jaXBhbCB9IGZyb20gJ2F3cy1jZGstbGliL2F3cy1pYW0nO1xuaW1wb3J0ICogYXMgbGFtYmRhIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sYW1iZGEnO1xuaW1wb3J0IHsgUnVudGltZSB9IGZyb20gJ2F3cy1jZGstbGliL2F3cy1sYW1iZGEnO1xuaW1wb3J0ICogYXMgcm91dGU1MyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtcm91dGU1Myc7XG5pbXBvcnQgKiBhcyByb3V0ZTUzUGF0dGVybnMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXJvdXRlNTMtcGF0dGVybnMnO1xuaW1wb3J0ICogYXMgcm91dGU1M1RhcmdldHMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXJvdXRlNTMtdGFyZ2V0cyc7XG5pbXBvcnQgKiBhcyBzMyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtczMnO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5pbXBvcnQgeyBERUZBVUxUX1NUQVRJQ19NQVhfQUdFLCBORVhUSlNfQlVJTERfRElSLCBORVhUSlNfU1RBVElDX0RJUiB9IGZyb20gJy4vY29uc3RhbnRzJztcbmltcG9ydCB7IEJhc2VTaXRlRG9tYWluUHJvcHMsIE5leHRqc0Jhc2VQcm9wcyB9IGZyb20gJy4vTmV4dGpzQmFzZSc7XG5pbXBvcnQgeyBOZXh0anNCdWlsZCB9IGZyb20gJy4vTmV4dGpzQnVpbGQnO1xuXG5leHBvcnQgaW50ZXJmYWNlIE5leHRqc0RvbWFpblByb3BzIGV4dGVuZHMgQmFzZVNpdGVEb21haW5Qcm9wcyB7fVxuXG5leHBvcnQgdHlwZSBOZXh0anNEaXN0cmlidXRpb25DZGtPdmVycmlkZVByb3BzID0gY2xvdWRmcm9udC5EaXN0cmlidXRpb25Qcm9wcztcblxuZXhwb3J0IGludGVyZmFjZSBOZXh0anNEaXN0cmlidXRpb25DZGtQcm9wcyB7XG4gIC8qKlxuICAgKiBQYXNzIGluIGEgdmFsdWUgdG8gb3ZlcnJpZGUgdGhlIGRlZmF1bHQgc2V0dGluZ3MgdGhpcyBjb25zdHJ1Y3QgdXNlcyB0b1xuICAgKiBjcmVhdGUgdGhlIENsb3VkRnJvbnQgYERpc3RyaWJ1dGlvbmAgaW50ZXJuYWxseS5cbiAgICovXG4gIHJlYWRvbmx5IGRpc3RyaWJ1dGlvbj86IE5leHRqc0Rpc3RyaWJ1dGlvbkNka092ZXJyaWRlUHJvcHM7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTmV4dGpzQ2FjaGVQb2xpY3lQcm9wcyB7XG4gIHJlYWRvbmx5IHN0YXRpY1Jlc3BvbnNlSGVhZGVyUG9saWN5PzogUmVzcG9uc2VIZWFkZXJzUG9saWN5O1xuICByZWFkb25seSBzdGF0aWNDYWNoZVBvbGljeT86IGNsb3VkZnJvbnQuSUNhY2hlUG9saWN5O1xuICByZWFkb25seSBzZXJ2ZXJDYWNoZVBvbGljeT86IGNsb3VkZnJvbnQuSUNhY2hlUG9saWN5O1xuICByZWFkb25seSBpbWFnZUNhY2hlUG9saWN5PzogY2xvdWRmcm9udC5JQ2FjaGVQb2xpY3k7XG5cbiAgLyoqXG4gICAqIENhY2hlLWNvbnRyb2wgbWF4LWFnZSBkZWZhdWx0IGZvciBzdGF0aWMgYXNzZXRzICgvX25leHQvKikuXG4gICAqIERlZmF1bHQ6IDMwIGRheXMuXG4gICAqL1xuICByZWFkb25seSBzdGF0aWNDbGllbnRNYXhBZ2VEZWZhdWx0PzogRHVyYXRpb247XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTmV4dGpzT3JpZ2luUmVxdWVzdFBvbGljeVByb3BzIHtcbiAgcmVhZG9ubHkgc2VydmVyT3JpZ2luUmVxdWVzdFBvbGljeT86IGNsb3VkZnJvbnQuSU9yaWdpblJlcXVlc3RQb2xpY3k7XG4gIHJlYWRvbmx5IGltYWdlT3B0aW1pemF0aW9uT3JpZ2luUmVxdWVzdFBvbGljeT86IGNsb3VkZnJvbnQuSU9yaWdpblJlcXVlc3RQb2xpY3k7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTmV4dGpzRGlzdHJpYnV0aW9uUHJvcHMgZXh0ZW5kcyBOZXh0anNCYXNlUHJvcHMge1xuICAvKipcbiAgICogQnVja2V0IGNvbnRhaW5pbmcgc3RhdGljIGFzc2V0cy5cbiAgICogTXVzdCBiZSBwcm92aWRlZCBpZiB5b3Ugd2FudCB0byBzZXJ2ZSBzdGF0aWMgZmlsZXMuXG4gICAqL1xuICByZWFkb25seSBzdGF0aWNBc3NldHNCdWNrZXQ6IHMzLklCdWNrZXQ7XG5cbiAgLyoqXG4gICAqIExhbWJkYSBmdW5jdGlvbiB0byByb3V0ZSBhbGwgbm9uLXN0YXRpYyByZXF1ZXN0cyB0by5cbiAgICogTXVzdCBiZSBwcm92aWRlZCBpZiB5b3Ugd2FudCB0byBzZXJ2ZSBkeW5hbWljIHJlcXVlc3RzLlxuICAgKi9cbiAgcmVhZG9ubHkgc2VydmVyRnVuY3Rpb246IGxhbWJkYS5JRnVuY3Rpb247XG5cbiAgLyoqXG4gICAqIExhbWJkYSBmdW5jdGlvbiB0byBvcHRpbWl6ZSBpbWFnZXMuXG4gICAqIE11c3QgYmUgcHJvdmlkZWQgaWYgeW91IHdhbnQgdG8gc2VydmUgZHluYW1pYyByZXF1ZXN0cy5cbiAgICovXG4gIHJlYWRvbmx5IGltYWdlT3B0RnVuY3Rpb246IGxhbWJkYS5JRnVuY3Rpb247XG5cbiAgLyoqXG4gICAqIE92ZXJyaWRlcyBmb3IgY3JlYXRlZCBDREsgcmVzb3VyY2VzLlxuICAgKi9cbiAgcmVhZG9ubHkgY2RrPzogTmV4dGpzRGlzdHJpYnV0aW9uQ2RrUHJvcHM7XG5cbiAgLyoqXG4gICAqIEJ1aWx0IE5leHRKUyBhcHAuXG4gICAqL1xuICByZWFkb25seSBuZXh0QnVpbGQ6IE5leHRqc0J1aWxkO1xuXG4gIC8qKlxuICAgKiBPdmVycmlkZSB0aGUgZGVmYXVsdCBDbG91ZEZyb250IGNhY2hlIHBvbGljaWVzIGNyZWF0ZWQgaW50ZXJuYWxseS5cbiAgICovXG4gIHJlYWRvbmx5IGNhY2hlUG9saWNpZXM/OiBOZXh0anNDYWNoZVBvbGljeVByb3BzO1xuXG4gIC8qKlxuICAgKiBPdmVycmlkZSB0aGUgZGVmYXVsdCBDbG91ZEZyb250IG9yaWdpbiByZXF1ZXN0IHBvbGljaWVzIGNyZWF0ZWQgaW50ZXJuYWxseS5cbiAgICovXG4gIHJlYWRvbmx5IG9yaWdpblJlcXVlc3RQb2xpY2llcz86IE5leHRqc09yaWdpblJlcXVlc3RQb2xpY3lQcm9wcztcblxuICAvKipcbiAgICogVGhlIGN1c3RvbURvbWFpbiBmb3IgdGhpcyB3ZWJzaXRlLiBTdXBwb3J0cyBkb21haW5zIHRoYXQgYXJlIGhvc3RlZFxuICAgKiBlaXRoZXIgb24gW1JvdXRlIDUzXShodHRwczovL2F3cy5hbWF6b24uY29tL3JvdXRlNTMvKSBvciBleHRlcm5hbGx5LlxuICAgKlxuICAgKiBOb3RlIHRoYXQgeW91IGNhbiBhbHNvIG1pZ3JhdGUgZXh0ZXJuYWxseSBob3N0ZWQgZG9tYWlucyB0byBSb3V0ZSA1MyBieVxuICAgKiBbZm9sbG93aW5nIHRoaXMgZ3VpZGVdKGh0dHBzOi8vZG9jcy5hd3MuYW1hem9uLmNvbS9Sb3V0ZTUzL2xhdGVzdC9EZXZlbG9wZXJHdWlkZS9NaWdyYXRpbmdETlMuaHRtbCkuXG4gICAqXG4gICAqIEBleGFtcGxlXG4gICAqIG5ldyBOZXh0anNEaXN0cmlidXRpb24odGhpcywgXCJEaXN0XCIsIHtcbiAgICogICBjdXN0b21Eb21haW46IFwiZG9tYWluLmNvbVwiLFxuICAgKiB9KTtcbiAgICpcbiAgICogbmV3IE5leHRqc0Rpc3RyaWJ1dGlvbih0aGlzLCBcIkRpc3RcIiwge1xuICAgKiAgIGN1c3RvbURvbWFpbjoge1xuICAgKiAgICAgZG9tYWluTmFtZTogXCJkb21haW4uY29tXCIsXG4gICAqICAgICBkb21haW5BbGlhczogXCJ3d3cuZG9tYWluLmNvbVwiLFxuICAgKiAgICAgaG9zdGVkWm9uZTogXCJkb21haW4uY29tXCJcbiAgICogICB9LFxuICAgKiB9KTtcbiAgICovXG4gIHJlYWRvbmx5IGN1c3RvbURvbWFpbj86IHN0cmluZyB8IE5leHRqc0RvbWFpblByb3BzO1xuXG4gIC8qKlxuICAgKiBJbmNsdWRlIHRoZSBuYW1lIG9mIHlvdXIgZGVwbG95bWVudCBzdGFnZSBpZiBwcmVzZW50LlxuICAgKiBVc2VkIHRvIG5hbWUgdGhlIGVkZ2UgZnVuY3Rpb25zIHN0YWNrLlxuICAgKiBSZXF1aXJlZCBpZiB1c2luZyBTU1QuXG4gICAqL1xuICByZWFkb25seSBzdGFnZU5hbWU/OiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIE9wdGlvbmFsIHZhbHVlIHRvIHByZWZpeCB0aGUgZWRnZSBmdW5jdGlvbiBzdGFja1xuICAgKiBJdCBkZWZhdWx0cyB0byBcIk5leHRqc1wiXG4gICAqL1xuICByZWFkb25seSBzdGFja1ByZWZpeD86IHN0cmluZztcblxuICAvKipcbiAgICogT3ZlcnJpZGUgbGFtYmRhIGZ1bmN0aW9uIHVybCBhdXRoIHR5cGVcbiAgICogQGRlZmF1bHQgXCJOT05FXCJcbiAgICovXG4gIHJlYWRvbmx5IGZ1bmN0aW9uVXJsQXV0aFR5cGU/OiBsYW1iZGEuRnVuY3Rpb25VcmxBdXRoVHlwZTtcblxuICAvKipcbiAgICogT3B0aW9uYWwgdmFsdWUgdG8gcHJlZml4IHRoZSBOZXh0LmpzIHNpdGUgdW5kZXIgYSAvcHJlZml4IHBhdGggb24gQ2xvdWRGcm9udC5cbiAgICogVXN1YWxseSB1c2VkIHdoZW4geW91IGRlcGxveSBtdWx0aXBsZSBOZXh0LmpzIHNpdGVzIG9uIHNhbWUgZG9tYWluIHVzaW5nIC9zdWItcGF0aFxuICAgKlxuICAgKiBOb3RlLCB5b3UnbGwgbmVlZCB0byBzZXQgW2Jhc2VQYXRoXShodHRwczovL25leHRqcy5vcmcvZG9jcy9hcHAvYXBpLXJlZmVyZW5jZS9uZXh0LWNvbmZpZy1qcy9iYXNlUGF0aClcbiAgICogaW4geW91ciBgbmV4dC5jb25maWcudHNgIHRvIHRoaXMgdmFsdWUgYW5kIGVuc3VyZSBhbnkgZmlsZXMgaW4gYHB1YmxpY2BcbiAgICogZm9sZGVyIGhhdmUgY29ycmVjdCBwcmVmaXguXG4gICAqIEBleGFtcGxlIFwiL215LWJhc2UtcGF0aFwiXG4gICAqL1xuICByZWFkb25seSBiYXNlUGF0aD86IHN0cmluZztcblxuICAvKipcbiAgICogT3B0aW9uYWwgQ2xvdWRGcm9udCBEaXN0cmlidXRpb24gY3JlYXRlZCBvdXRzaWRlIG9mIHRoaXMgY29uc3RydWN0IHRoYXQgd2lsbFxuICAgKiBiZSB1c2VkIHRvIGFkZCBOZXh0LmpzIGJlaGF2aW9ycyBhbmQgb3JpZ2lucyBvbnRvLiBVc2VmdWwgd2l0aCBgYmFzZVBhdGhgLlxuICAgKi9cbiAgcmVhZG9ubHkgZGlzdHJpYnV0aW9uPzogRGlzdHJpYnV0aW9uO1xufVxuXG4vKipcbiAqIENyZWF0ZSBhIENsb3VkRnJvbnQgZGlzdHJpYnV0aW9uIHRvIHNlcnZlIGEgTmV4dC5qcyBhcHBsaWNhdGlvbi5cbiAqL1xuZXhwb3J0IGNsYXNzIE5leHRqc0Rpc3RyaWJ1dGlvbiBleHRlbmRzIENvbnN0cnVjdCB7XG4gIC8qKlxuICAgKiBUaGUgZGVmYXVsdCBDbG91ZEZyb250IGNhY2hlIHBvbGljeSBwcm9wZXJ0aWVzIGZvciBkeW5hbWljIHJlcXVlc3RzIHRvIHNlcnZlciBoYW5kbGVyLlxuICAgKi9cbiAgcHVibGljIHN0YXRpYyBzZXJ2ZXJDYWNoZVBvbGljeVByb3BzOiBjbG91ZGZyb250LkNhY2hlUG9saWN5UHJvcHMgPSB7XG4gICAgcXVlcnlTdHJpbmdCZWhhdmlvcjogY2xvdWRmcm9udC5DYWNoZVF1ZXJ5U3RyaW5nQmVoYXZpb3IuYWxsKCksXG4gICAgaGVhZGVyQmVoYXZpb3I6IGNsb3VkZnJvbnQuQ2FjaGVIZWFkZXJCZWhhdmlvci5hbGxvd0xpc3QoXG4gICAgICAnYWNjZXB0JyxcbiAgICAgICdyc2MnLFxuICAgICAgJ25leHQtcm91dGVyLXByZWZldGNoJyxcbiAgICAgICduZXh0LXJvdXRlci1zdGF0ZS10cmVlJyxcbiAgICAgICduZXh0LXVybCdcbiAgICApLFxuICAgIGNvb2tpZUJlaGF2aW9yOiBjbG91ZGZyb250LkNhY2hlQ29va2llQmVoYXZpb3IuYWxsKCksXG4gICAgZGVmYXVsdFR0bDogRHVyYXRpb24uc2Vjb25kcygwKSxcbiAgICBtYXhUdGw6IER1cmF0aW9uLmRheXMoMzY1KSxcbiAgICBtaW5UdGw6IER1cmF0aW9uLnNlY29uZHMoMCksXG4gICAgZW5hYmxlQWNjZXB0RW5jb2RpbmdCcm90bGk6IHRydWUsXG4gICAgZW5hYmxlQWNjZXB0RW5jb2RpbmdHemlwOiB0cnVlLFxuICAgIGNvbW1lbnQ6ICdOZXh0anMgU2VydmVyIERlZmF1bHQgQ2FjaGUgUG9saWN5JyxcbiAgfTtcblxuICAvKipcbiAgICogVGhlIGRlZmF1bHQgQ2xvdWRGcm9udCBDYWNoZSBQb2xpY3kgcHJvcGVydGllcyBmb3IgaW1hZ2VzLlxuICAgKi9cbiAgcHVibGljIHN0YXRpYyBpbWFnZUNhY2hlUG9saWN5UHJvcHM6IGNsb3VkZnJvbnQuQ2FjaGVQb2xpY3lQcm9wcyA9IHtcbiAgICBxdWVyeVN0cmluZ0JlaGF2aW9yOiBjbG91ZGZyb250LkNhY2hlUXVlcnlTdHJpbmdCZWhhdmlvci5hbGwoKSxcbiAgICBoZWFkZXJCZWhhdmlvcjogY2xvdWRmcm9udC5DYWNoZUhlYWRlckJlaGF2aW9yLmFsbG93TGlzdCgnYWNjZXB0JyksXG4gICAgY29va2llQmVoYXZpb3I6IGNsb3VkZnJvbnQuQ2FjaGVDb29raWVCZWhhdmlvci5hbGwoKSxcbiAgICBkZWZhdWx0VHRsOiBEdXJhdGlvbi5kYXlzKDEpLFxuICAgIG1heFR0bDogRHVyYXRpb24uZGF5cygzNjUpLFxuICAgIG1pblR0bDogRHVyYXRpb24uZGF5cygwKSxcbiAgICBlbmFibGVBY2NlcHRFbmNvZGluZ0Jyb3RsaTogdHJ1ZSxcbiAgICBlbmFibGVBY2NlcHRFbmNvZGluZ0d6aXA6IHRydWUsXG4gICAgY29tbWVudDogJ05leHRqcyBJbWFnZSBEZWZhdWx0IENhY2hlIFBvbGljeScsXG4gIH07XG5cbiAgcHJvdGVjdGVkIHByb3BzOiBOZXh0anNEaXN0cmlidXRpb25Qcm9wcztcblxuICAvLy8vLy8vLy8vLy8vLy8vLy8vLy9cbiAgLy8gUHVibGljIFByb3BlcnRpZXNcbiAgLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG4gIC8qKlxuICAgKiBUaGUgaW50ZXJuYWxseSBjcmVhdGVkIENsb3VkRnJvbnQgYERpc3RyaWJ1dGlvbmAgaW5zdGFuY2UuXG4gICAqL1xuICBwdWJsaWMgZGlzdHJpYnV0aW9uOiBEaXN0cmlidXRpb247XG4gIC8qKlxuICAgKiBUaGUgUm91dGUgNTMgaG9zdGVkIHpvbmUgZm9yIHRoZSBjdXN0b20gZG9tYWluLlxuICAgKi9cbiAgaG9zdGVkWm9uZT86IHJvdXRlNTMuSUhvc3RlZFpvbmU7XG4gIC8qKlxuICAgKiBUaGUgQVdTIENlcnRpZmljYXRlIE1hbmFnZXIgY2VydGlmaWNhdGUgZm9yIHRoZSBjdXN0b20gZG9tYWluLlxuICAgKi9cbiAgY2VydGlmaWNhdGU/OiBhY20uSUNlcnRpZmljYXRlO1xuXG4gIHByaXZhdGUgY29tbW9uQmVoYXZpb3JPcHRpb25zOiBQaWNrPGNsb3VkZnJvbnQuQmVoYXZpb3JPcHRpb25zLCAndmlld2VyUHJvdG9jb2xQb2xpY3knIHwgJ2NvbXByZXNzJz4gPSB7XG4gICAgdmlld2VyUHJvdG9jb2xQb2xpY3k6IGNsb3VkZnJvbnQuVmlld2VyUHJvdG9jb2xQb2xpY3kuUkVESVJFQ1RfVE9fSFRUUFMsXG4gICAgY29tcHJlc3M6IHRydWUsXG4gIH07XG5cbiAgcHJpdmF0ZSBzM09yaWdpbjogb3JpZ2lucy5TM09yaWdpbjtcblxuICBwcml2YXRlIHN0YXRpY0JlaGF2aW9yT3B0aW9uczogY2xvdWRmcm9udC5CZWhhdmlvck9wdGlvbnM7XG5cbiAgcHJpdmF0ZSBlZGdlTGFtYmRhczogY2xvdWRmcm9udC5FZGdlTGFtYmRhW10gPSBbXTtcblxuICBwcml2YXRlIHNlcnZlckJlaGF2aW9yT3B0aW9uczogY2xvdWRmcm9udC5CZWhhdmlvck9wdGlvbnM7XG5cbiAgcHJpdmF0ZSBpbWFnZUJlaGF2aW9yT3B0aW9uczogY2xvdWRmcm9udC5CZWhhdmlvck9wdGlvbnM7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IE5leHRqc0Rpc3RyaWJ1dGlvblByb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkKTtcblxuICAgIHRoaXMucHJvcHMgPSBwcm9wcztcblxuICAgIC8vIENyZWF0ZSBDdXN0b20gRG9tYWluXG4gICAgdGhpcy52YWxpZGF0ZUN1c3RvbURvbWFpblNldHRpbmdzKCk7XG4gICAgdGhpcy5ob3N0ZWRab25lID0gdGhpcy5sb29rdXBIb3N0ZWRab25lKCk7XG4gICAgdGhpcy5jZXJ0aWZpY2F0ZSA9IHRoaXMuY3JlYXRlQ2VydGlmaWNhdGUoKTtcblxuICAgIC8vIENyZWF0ZSBCZWhhdmlvcnNcbiAgICB0aGlzLnMzT3JpZ2luID0gbmV3IG9yaWdpbnMuUzNPcmlnaW4odGhpcy5wcm9wcy5zdGF0aWNBc3NldHNCdWNrZXQpO1xuICAgIHRoaXMuc3RhdGljQmVoYXZpb3JPcHRpb25zID0gdGhpcy5jcmVhdGVTdGF0aWNCZWhhdmlvck9wdGlvbnMoKTtcbiAgICBpZiAodGhpcy5pc0ZuVXJsSWFtQXV0aCkge1xuICAgICAgdGhpcy5lZGdlTGFtYmRhcy5wdXNoKHRoaXMuY3JlYXRlRWRnZUxhbWJkYSgpKTtcbiAgICB9XG4gICAgdGhpcy5zZXJ2ZXJCZWhhdmlvck9wdGlvbnMgPSB0aGlzLmNyZWF0ZVNlcnZlckJlaGF2aW9yT3B0aW9ucygpO1xuICAgIHRoaXMuaW1hZ2VCZWhhdmlvck9wdGlvbnMgPSB0aGlzLmNyZWF0ZUltYWdlQmVoYXZpb3JPcHRpb25zKCk7XG5cbiAgICAvLyBDcmVhdGUgQ2xvdWRGcm9udCBEaXN0cmlidXRpb25cbiAgICB0aGlzLmRpc3RyaWJ1dGlvbiA9IHRoaXMuZ2V0Q2xvdWRGcm9udERpc3RyaWJ1dGlvbigpO1xuICAgIHRoaXMuYWRkU3RhdGljQmVoYXZpb3JzVG9EaXN0cmlidXRpb24oKTtcbiAgICB0aGlzLmFkZFJvb3RQYXRoQmVoYXZpb3IoKTtcblxuICAgIC8vIENvbm5lY3QgQ3VzdG9tIERvbWFpbiB0byBDbG91ZEZyb250IERpc3RyaWJ1dGlvblxuICAgIHRoaXMuY3JlYXRlUm91dGU1M1JlY29yZHMoKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBUaGUgQ2xvdWRGcm9udCBVUkwgb2YgdGhlIHdlYnNpdGUuXG4gICAqL1xuICBwdWJsaWMgZ2V0IHVybCgpOiBzdHJpbmcge1xuICAgIHJldHVybiBgaHR0cHM6Ly8ke3RoaXMuZGlzdHJpYnV0aW9uLmRpc3RyaWJ1dGlvbkRvbWFpbk5hbWV9YDtcbiAgfVxuXG4gIGdldCBjdXN0b21Eb21haW5OYW1lKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG4gICAgY29uc3QgeyBjdXN0b21Eb21haW4gfSA9IHRoaXMucHJvcHM7XG5cbiAgICBpZiAoIWN1c3RvbURvbWFpbikge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlmICh0eXBlb2YgY3VzdG9tRG9tYWluID09PSAnc3RyaW5nJykge1xuICAgICAgcmV0dXJuIGN1c3RvbURvbWFpbjtcbiAgICB9XG5cbiAgICByZXR1cm4gY3VzdG9tRG9tYWluLmRvbWFpbk5hbWU7XG4gIH1cblxuICAvKipcbiAgICogSWYgdGhlIGN1c3RvbSBkb21haW4gaXMgZW5hYmxlZCwgdGhpcyBpcyB0aGUgVVJMIG9mIHRoZSB3ZWJzaXRlIHdpdGggdGhlXG4gICAqIGN1c3RvbSBkb21haW4uXG4gICAqL1xuICBwdWJsaWMgZ2V0IGN1c3RvbURvbWFpblVybCgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuICAgIGNvbnN0IGN1c3RvbURvbWFpbk5hbWUgPSB0aGlzLmN1c3RvbURvbWFpbk5hbWU7XG4gICAgcmV0dXJuIGN1c3RvbURvbWFpbk5hbWUgPyBgaHR0cHM6Ly8ke2N1c3RvbURvbWFpbk5hbWV9YCA6IHVuZGVmaW5lZDtcbiAgfVxuXG4gIC8qKlxuICAgKiBUaGUgSUQgb2YgdGhlIGludGVybmFsbHkgY3JlYXRlZCBDbG91ZEZyb250IERpc3RyaWJ1dGlvbi5cbiAgICovXG4gIHB1YmxpYyBnZXQgZGlzdHJpYnV0aW9uSWQoKTogc3RyaW5nIHtcbiAgICByZXR1cm4gdGhpcy5kaXN0cmlidXRpb24uZGlzdHJpYnV0aW9uSWQ7XG4gIH1cblxuICAvKipcbiAgICogVGhlIGRvbWFpbiBuYW1lIG9mIHRoZSBpbnRlcm5hbGx5IGNyZWF0ZWQgQ2xvdWRGcm9udCBEaXN0cmlidXRpb24uXG4gICAqL1xuICBwdWJsaWMgZ2V0IGRpc3RyaWJ1dGlvbkRvbWFpbigpOiBzdHJpbmcge1xuICAgIHJldHVybiB0aGlzLmRpc3RyaWJ1dGlvbi5kaXN0cmlidXRpb25Eb21haW5OYW1lO1xuICB9XG5cbiAgcHJpdmF0ZSBnZXQgaXNGblVybElhbUF1dGgoKSB7XG4gICAgcmV0dXJuIHRoaXMucHJvcHMuZnVuY3Rpb25VcmxBdXRoVHlwZSA9PT0gbGFtYmRhLkZ1bmN0aW9uVXJsQXV0aFR5cGUuQVdTX0lBTTtcbiAgfVxuXG4gIHByaXZhdGUgY3JlYXRlU3RhdGljQmVoYXZpb3JPcHRpb25zKCk6IGNsb3VkZnJvbnQuQmVoYXZpb3JPcHRpb25zIHtcbiAgICBjb25zdCBzdGF0aWNDbGllbnRNYXhBZ2UgPSB0aGlzLnByb3BzLmNhY2hlUG9saWNpZXM/LnN0YXRpY0NsaWVudE1heEFnZURlZmF1bHQgfHwgREVGQVVMVF9TVEFUSUNfTUFYX0FHRTtcbiAgICAvLyBUT0RPOiByZW1vdmUgdGhpcyByZXNwb25zZSBoZWFkZXJzIHBvbGljeSBvbmNlIFMzIGZpbGVzIGhhdmUgY29ycmVjdCBjYWNoZSBjb250cm9sIGhlYWRlcnMgd2l0aCBuZXcgYXNzZXQgZGVwbG95bWVudCB0ZWNobmlxdWVcbiAgICBjb25zdCByZXNwb25zZUhlYWRlcnNQb2xpY3kgPVxuICAgICAgdGhpcy5wcm9wcy5jYWNoZVBvbGljaWVzPy5zdGF0aWNSZXNwb25zZUhlYWRlclBvbGljeSA/P1xuICAgICAgbmV3IFJlc3BvbnNlSGVhZGVyc1BvbGljeSh0aGlzLCAnU3RhdGljUmVzcG9uc2VIZWFkZXJzUG9saWN5Jywge1xuICAgICAgICAvLyBhZGQgZGVmYXVsdCBoZWFkZXIgZm9yIHN0YXRpYyBhc3NldHNcbiAgICAgICAgY3VzdG9tSGVhZGVyc0JlaGF2aW9yOiB7XG4gICAgICAgICAgY3VzdG9tSGVhZGVyczogW1xuICAgICAgICAgICAge1xuICAgICAgICAgICAgICBoZWFkZXI6ICdjYWNoZS1jb250cm9sJyxcbiAgICAgICAgICAgICAgb3ZlcnJpZGU6IGZhbHNlLFxuICAgICAgICAgICAgICAvLyBieSBkZWZhdWx0IHRlbGwgYnJvd3NlciB0byBjYWNoZSBzdGF0aWMgZmlsZXMgZm9yIHRoaXMgbG9uZ1xuICAgICAgICAgICAgICAvLyB0aGlzIGlzIHNlcGFyYXRlIGZyb20gdGhlIG9yaWdpbiBjYWNoZSBwb2xpY3lcbiAgICAgICAgICAgICAgdmFsdWU6IGBwdWJsaWMsbWF4LWFnZT0ke3N0YXRpY0NsaWVudE1heEFnZX0saW1tdXRhYmxlYCxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgXSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgIGNvbnN0IGNhY2hlUG9saWN5ID0gdGhpcy5wcm9wcy5jYWNoZVBvbGljaWVzPy5zdGF0aWNDYWNoZVBvbGljeSA/PyBjbG91ZGZyb250LkNhY2hlUG9saWN5LkNBQ0hJTkdfT1BUSU1JWkVEO1xuICAgIHJldHVybiB7XG4gICAgICAuLi50aGlzLmNvbW1vbkJlaGF2aW9yT3B0aW9ucyxcbiAgICAgIG9yaWdpbjogdGhpcy5zM09yaWdpbixcbiAgICAgIGFsbG93ZWRNZXRob2RzOiBjbG91ZGZyb250LkFsbG93ZWRNZXRob2RzLkFMTE9XX0dFVF9IRUFEX09QVElPTlMsXG4gICAgICBjYWNoZWRNZXRob2RzOiBjbG91ZGZyb250LkNhY2hlZE1ldGhvZHMuQ0FDSEVfR0VUX0hFQURfT1BUSU9OUyxcbiAgICAgIGNhY2hlUG9saWN5LFxuICAgICAgcmVzcG9uc2VIZWFkZXJzUG9saWN5LFxuICAgIH07XG4gIH1cblxuICBwcml2YXRlIGdldCBmblVybEF1dGhUeXBlKCk6IGxhbWJkYS5GdW5jdGlvblVybEF1dGhUeXBlIHtcbiAgICByZXR1cm4gdGhpcy5wcm9wcy5mdW5jdGlvblVybEF1dGhUeXBlIHx8IGxhbWJkYS5GdW5jdGlvblVybEF1dGhUeXBlLk5PTkU7XG4gIH1cblxuICAvKipcbiAgICogT25jZSBDbG91ZEZyb250IE9BQyBpcyByZWxlYXNlZCwgcmVtb3ZlIHRoaXMgdG8gcmVkdWNlIGxhdGVuY3kuXG4gICAqL1xuICBwcml2YXRlIGNyZWF0ZUVkZ2VMYW1iZGEoKTogY2xvdWRmcm9udC5FZGdlTGFtYmRhIHtcbiAgICBjb25zdCBzaWduRm5VcmxEaXIgPSBwYXRoLnJlc29sdmUoX19kaXJuYW1lLCAnLi4nLCAnYXNzZXRzJywgJ2xhbWJkYXMnLCAnc2lnbi1mbi11cmwnKTtcbiAgICBjb25zdCBvcmlnaW5SZXF1ZXN0RWRnZUZuID0gbmV3IGNsb3VkZnJvbnQuZXhwZXJpbWVudGFsLkVkZ2VGdW5jdGlvbih0aGlzLCAnRWRnZUZuJywge1xuICAgICAgcnVudGltZTogUnVudGltZS5OT0RFSlNfMThfWCxcbiAgICAgIGhhbmRsZXI6ICdpbmRleC5oYW5kbGVyJyxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChzaWduRm5VcmxEaXIpLFxuICAgICAgY3VycmVudFZlcnNpb25PcHRpb25zOiB7XG4gICAgICAgIHJlbW92YWxQb2xpY3k6IFJlbW92YWxQb2xpY3kuREVTVFJPWSwgLy8gZGVzdHJveSBvbGQgdmVyc2lvbnNcbiAgICAgICAgcmV0cnlBdHRlbXB0czogMSwgLy8gYXN5bmMgcmV0cnkgYXR0ZW1wdHNcbiAgICAgIH0sXG4gICAgfSk7XG4gICAgb3JpZ2luUmVxdWVzdEVkZ2VGbi5jdXJyZW50VmVyc2lvbi5ncmFudEludm9rZShuZXcgU2VydmljZVByaW5jaXBhbCgnZWRnZWxhbWJkYS5hbWF6b25hd3MuY29tJykpO1xuICAgIG9yaWdpblJlcXVlc3RFZGdlRm4uY3VycmVudFZlcnNpb24uZ3JhbnRJbnZva2UobmV3IFNlcnZpY2VQcmluY2lwYWwoJ2xhbWJkYS5hbWF6b25hd3MuY29tJykpO1xuICAgIG9yaWdpblJlcXVlc3RFZGdlRm4uYWRkVG9Sb2xlUG9saWN5KFxuICAgICAgbmV3IFBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGFjdGlvbnM6IFsnbGFtYmRhOkludm9rZUZ1bmN0aW9uVXJsJ10sXG4gICAgICAgIHJlc291cmNlczogW3RoaXMucHJvcHMuc2VydmVyRnVuY3Rpb24uZnVuY3Rpb25Bcm4sIHRoaXMucHJvcHMuaW1hZ2VPcHRGdW5jdGlvbi5mdW5jdGlvbkFybl0sXG4gICAgICB9KVxuICAgICk7XG4gICAgY29uc3Qgb3JpZ2luUmVxdWVzdEVkZ2VGblZlcnNpb24gPSBsYW1iZGEuVmVyc2lvbi5mcm9tVmVyc2lvbkFybihcbiAgICAgIHRoaXMsXG4gICAgICAnVmVyc2lvbicsXG4gICAgICBvcmlnaW5SZXF1ZXN0RWRnZUZuLmN1cnJlbnRWZXJzaW9uLmZ1bmN0aW9uQXJuXG4gICAgKTtcbiAgICByZXR1cm4ge1xuICAgICAgZXZlbnRUeXBlOiBjbG91ZGZyb250LkxhbWJkYUVkZ2VFdmVudFR5cGUuT1JJR0lOX1JFUVVFU1QsXG4gICAgICBmdW5jdGlvblZlcnNpb246IG9yaWdpblJlcXVlc3RFZGdlRm5WZXJzaW9uLFxuICAgICAgaW5jbHVkZUJvZHk6IHRydWUsXG4gICAgfTtcbiAgfVxuXG4gIHByaXZhdGUgY3JlYXRlU2VydmVyQmVoYXZpb3JPcHRpb25zKCk6IGNsb3VkZnJvbnQuQmVoYXZpb3JPcHRpb25zIHtcbiAgICBjb25zdCBmblVybCA9IHRoaXMucHJvcHMuc2VydmVyRnVuY3Rpb24uYWRkRnVuY3Rpb25VcmwoeyBhdXRoVHlwZTogdGhpcy5mblVybEF1dGhUeXBlIH0pO1xuICAgIGNvbnN0IG9yaWdpbiA9IG5ldyBvcmlnaW5zLkh0dHBPcmlnaW4oRm4ucGFyc2VEb21haW5OYW1lKGZuVXJsLnVybCkpO1xuICAgIGNvbnN0IG9yaWdpblJlcXVlc3RQb2xpY3kgPVxuICAgICAgdGhpcy5wcm9wcy5vcmlnaW5SZXF1ZXN0UG9saWNpZXM/LnNlcnZlck9yaWdpblJlcXVlc3RQb2xpY3kgPz9cbiAgICAgIGNsb3VkZnJvbnQuT3JpZ2luUmVxdWVzdFBvbGljeS5BTExfVklFV0VSX0VYQ0VQVF9IT1NUX0hFQURFUjtcbiAgICBjb25zdCBjYWNoZVBvbGljeSA9XG4gICAgICB0aGlzLnByb3BzLmNhY2hlUG9saWNpZXM/LnNlcnZlckNhY2hlUG9saWN5ID8/XG4gICAgICBuZXcgY2xvdWRmcm9udC5DYWNoZVBvbGljeSh0aGlzLCAnU2VydmVyQ2FjaGVQb2xpY3knLCBOZXh0anNEaXN0cmlidXRpb24uc2VydmVyQ2FjaGVQb2xpY3lQcm9wcyk7XG4gICAgcmV0dXJuIHtcbiAgICAgIC4uLnRoaXMuY29tbW9uQmVoYXZpb3JPcHRpb25zLFxuICAgICAgb3JpZ2luLFxuICAgICAgYWxsb3dlZE1ldGhvZHM6IGNsb3VkZnJvbnQuQWxsb3dlZE1ldGhvZHMuQUxMT1dfQUxMLFxuICAgICAgb3JpZ2luUmVxdWVzdFBvbGljeSxcbiAgICAgIGNhY2hlUG9saWN5LFxuICAgICAgZWRnZUxhbWJkYXM6IHRoaXMuZWRnZUxhbWJkYXMubGVuZ3RoID8gdGhpcy5lZGdlTGFtYmRhcyA6IHVuZGVmaW5lZCxcbiAgICAgIGZ1bmN0aW9uQXNzb2NpYXRpb25zOiB0aGlzLmNyZWF0ZUNsb3VkRnJvbnRGbkFzc29jaWF0aW9ucygpLFxuICAgIH07XG4gIH1cblxuICAvKipcbiAgICogSWYgdGhpcyBkb2Vzbid0IHJ1biwgdGhlbiBOZXh0LmpzIFNlcnZlcidzIGByZXF1ZXN0LnVybGAgd2lsbCBiZSBMYW1iZGEgRnVuY3Rpb25cbiAgICogVVJMIGluc3RlYWQgb2YgZG9tYWluXG4gICAqL1xuICBwcml2YXRlIGNyZWF0ZUNsb3VkRnJvbnRGbkFzc29jaWF0aW9ucygpIHtcbiAgICBjb25zdCBjbG91ZEZyb250Rm4gPSBuZXcgY2xvdWRmcm9udC5GdW5jdGlvbih0aGlzLCAnQ2xvdWRGcm9udEZuJywge1xuICAgICAgY29kZTogY2xvdWRmcm9udC5GdW5jdGlvbkNvZGUuZnJvbUlubGluZShgXG4gICAgICBmdW5jdGlvbiBoYW5kbGVyKGV2ZW50KSB7XG4gICAgICAgIHZhciByZXF1ZXN0ID0gZXZlbnQucmVxdWVzdDtcbiAgICAgICAgcmVxdWVzdC5oZWFkZXJzW1wieC1mb3J3YXJkZWQtaG9zdFwiXSA9IHJlcXVlc3QuaGVhZGVycy5ob3N0O1xuICAgICAgICByZXR1cm4gcmVxdWVzdDtcbiAgICAgIH1cbiAgICAgIGApLFxuICAgIH0pO1xuICAgIHJldHVybiBbeyBldmVudFR5cGU6IGNsb3VkZnJvbnQuRnVuY3Rpb25FdmVudFR5cGUuVklFV0VSX1JFUVVFU1QsIGZ1bmN0aW9uOiBjbG91ZEZyb250Rm4gfV07XG4gIH1cblxuICBwcml2YXRlIGNyZWF0ZUltYWdlQmVoYXZpb3JPcHRpb25zKCk6IGNsb3VkZnJvbnQuQmVoYXZpb3JPcHRpb25zIHtcbiAgICBjb25zdCBpbWFnZU9wdEZuVXJsID0gdGhpcy5wcm9wcy5pbWFnZU9wdEZ1bmN0aW9uLmFkZEZ1bmN0aW9uVXJsKHsgYXV0aFR5cGU6IHRoaXMuZm5VcmxBdXRoVHlwZSB9KTtcbiAgICBjb25zdCBvcmlnaW4gPSBuZXcgb3JpZ2lucy5IdHRwT3JpZ2luKEZuLnBhcnNlRG9tYWluTmFtZShpbWFnZU9wdEZuVXJsLnVybCkpO1xuICAgIGNvbnN0IG9yaWdpblJlcXVlc3RQb2xpY3kgPVxuICAgICAgdGhpcy5wcm9wcy5vcmlnaW5SZXF1ZXN0UG9saWNpZXM/LmltYWdlT3B0aW1pemF0aW9uT3JpZ2luUmVxdWVzdFBvbGljeSA/P1xuICAgICAgY2xvdWRmcm9udC5PcmlnaW5SZXF1ZXN0UG9saWN5LkFMTF9WSUVXRVJfRVhDRVBUX0hPU1RfSEVBREVSO1xuICAgIGNvbnN0IGNhY2hlUG9saWN5ID1cbiAgICAgIHRoaXMucHJvcHMuY2FjaGVQb2xpY2llcz8uaW1hZ2VDYWNoZVBvbGljeSA/P1xuICAgICAgbmV3IGNsb3VkZnJvbnQuQ2FjaGVQb2xpY3kodGhpcywgJ0ltYWdlQ2FjaGVQb2xpY3knLCBOZXh0anNEaXN0cmlidXRpb24uaW1hZ2VDYWNoZVBvbGljeVByb3BzKTtcbiAgICByZXR1cm4ge1xuICAgICAgLi4udGhpcy5jb21tb25CZWhhdmlvck9wdGlvbnMsXG4gICAgICBvcmlnaW4sXG4gICAgICBhbGxvd2VkTWV0aG9kczogY2xvdWRmcm9udC5BbGxvd2VkTWV0aG9kcy5BTExPV19HRVRfSEVBRF9PUFRJT05TLFxuICAgICAgY2FjaGVkTWV0aG9kczogY2xvdWRmcm9udC5DYWNoZWRNZXRob2RzLkNBQ0hFX0dFVF9IRUFEX09QVElPTlMsXG4gICAgICBjYWNoZVBvbGljeSxcbiAgICAgIG9yaWdpblJlcXVlc3RQb2xpY3ksXG4gICAgICBlZGdlTGFtYmRhczogdGhpcy5lZGdlTGFtYmRhcyxcbiAgICB9O1xuICB9XG5cbiAgLyoqXG4gICAqIENyZWF0ZXMgb3IgdXNlcyB1c2VyIHNwZWNpZmllZCBDbG91ZEZyb250IERpc3RyaWJ1dGlvbiBhZGRpbmcgYmVoYXZpb3JzXG4gICAqIG5lZWRlZCBmb3IgTmV4dC5qcy5cbiAgICovXG4gIHByaXZhdGUgZ2V0Q2xvdWRGcm9udERpc3RyaWJ1dGlvbigpOiBjbG91ZGZyb250LkRpc3RyaWJ1dGlvbiB7XG4gICAgbGV0IGRpc3RyaWJ1dGlvbjogY2xvdWRmcm9udC5EaXN0cmlidXRpb247XG4gICAgaWYgKHRoaXMucHJvcHMuZGlzdHJpYnV0aW9uKSB7XG4gICAgICBpZiAodGhpcy5wcm9wcy5jZGs/LmRpc3RyaWJ1dGlvbikge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgJ1lvdSBjYW4gZWl0aGVyIHBhc3MgYW4gZXhpc3RpbmcgXCJkaXN0cmlidXRpb25cIiBvciBwYXNzIGNvbmZpZ3MgdG8gY3JlYXRlIG9uZSB2aWEgXCJjZGsuZGlzdHJpYnV0aW9uXCIuJ1xuICAgICAgICApO1xuICAgICAgfVxuXG4gICAgICBkaXN0cmlidXRpb24gPSB0aGlzLnByb3BzLmRpc3RyaWJ1dGlvbjtcbiAgICB9IGVsc2Uge1xuICAgICAgZGlzdHJpYnV0aW9uID0gdGhpcy5jcmVhdGVDbG91ZEZyb250RGlzdHJpYnV0aW9uKCk7XG4gICAgfVxuXG4gICAgZGlzdHJpYnV0aW9uLmFkZEJlaGF2aW9yKFxuICAgICAgdGhpcy5nZXRQYXRoUGF0dGVybignYXBpLyonKSxcbiAgICAgIHRoaXMuc2VydmVyQmVoYXZpb3JPcHRpb25zLm9yaWdpbixcbiAgICAgIHRoaXMuc2VydmVyQmVoYXZpb3JPcHRpb25zXG4gICAgKTtcbiAgICBkaXN0cmlidXRpb24uYWRkQmVoYXZpb3IoXG4gICAgICB0aGlzLmdldFBhdGhQYXR0ZXJuKCdfbmV4dC9kYXRhLyonKSxcbiAgICAgIHRoaXMuc2VydmVyQmVoYXZpb3JPcHRpb25zLm9yaWdpbixcbiAgICAgIHRoaXMuc2VydmVyQmVoYXZpb3JPcHRpb25zXG4gICAgKTtcbiAgICBkaXN0cmlidXRpb24uYWRkQmVoYXZpb3IoXG4gICAgICB0aGlzLmdldFBhdGhQYXR0ZXJuKCdfbmV4dC9pbWFnZSonKSxcbiAgICAgIHRoaXMuaW1hZ2VCZWhhdmlvck9wdGlvbnMub3JpZ2luLFxuICAgICAgdGhpcy5pbWFnZUJlaGF2aW9yT3B0aW9uc1xuICAgICk7XG5cbiAgICByZXR1cm4gZGlzdHJpYnV0aW9uO1xuICB9XG5cbiAgLyoqXG4gICAqIENyZWF0ZXMgZGVmYXVsdCBDbG91ZEZyb250IERpc3RyaWJ1dGlvbi4gTm90ZSwgdGhpcyBjb25zdHJ1Y3Qgd2lsbCBub3RcbiAgICogY3JlYXRlIGEgQ2xvdWRGcm9udCBEaXN0cmlidXRpb24gaWYgb25lIGlzIHBhc3NlZCBpbiBieSB1c2VyLlxuICAgKi9cbiAgcHJpdmF0ZSBjcmVhdGVDbG91ZEZyb250RGlzdHJpYnV0aW9uKGNmRGlzdHJpYnV0aW9uUHJvcHM/OiBOZXh0anNEaXN0cmlidXRpb25DZGtPdmVycmlkZVByb3BzKSB7XG4gICAgLy8gYnVpbGQgZG9tYWluTmFtZXNcbiAgICBjb25zdCBkb21haW5OYW1lcyA9IHRoaXMuYnVpbGREaXN0cmlidXRpb25Eb21haW5OYW1lcygpO1xuXG4gICAgcmV0dXJuIG5ldyBjbG91ZGZyb250LkRpc3RyaWJ1dGlvbih0aGlzLCAnRGlzdHJpYnV0aW9uJywge1xuICAgICAgLy8gZGVmYXVsdFJvb3RPYmplY3Q6IFwiaW5kZXguaHRtbFwiLFxuICAgICAgZGVmYXVsdFJvb3RPYmplY3Q6ICcnLFxuICAgICAgbWluaW11bVByb3RvY29sVmVyc2lvbjogY2xvdWRmcm9udC5TZWN1cml0eVBvbGljeVByb3RvY29sLlRMU19WMV8yXzIwMjEsXG5cbiAgICAgIC8vIE92ZXJyaWRlIHByb3BzLlxuICAgICAgLi4uY2ZEaXN0cmlidXRpb25Qcm9wcyxcblxuICAgICAgLy8gdGhlc2UgdmFsdWVzIGNhbiBOT1QgYmUgb3ZlcndyaXR0ZW4gYnkgY2ZEaXN0cmlidXRpb25Qcm9wc1xuICAgICAgZG9tYWluTmFtZXMsXG4gICAgICBjZXJ0aWZpY2F0ZTogdGhpcy5jZXJ0aWZpY2F0ZSxcbiAgICAgIGRlZmF1bHRCZWhhdmlvcjogdGhpcy5zZXJ2ZXJCZWhhdmlvck9wdGlvbnMsXG4gICAgfSk7XG4gIH1cblxuICAvKipcbiAgICogdGhpcyBuZWVkcyB0byBiZSBhZGRlZCBsYXN0IHNvIHRoYXQgaXQgZG9lc24ndCBvdmVycmlkZSBhbnkgb3RoZXIgYmVoYXZpb3JzXG4gICAqIHdoZW4gYmFzZVBhdGggaXMgc2V0LCB3ZSBlbXVsYXRlIHRoZSBcImRlZmF1bHQgYmVoYXZpb3JcIiAoKikgYW5kIC8gYXMgYC9iYXNlLXBhdGgvKmBcbiAgICogQHByaXZhdGVcbiAgICovXG4gIHByaXZhdGUgYWRkUm9vdFBhdGhCZWhhdmlvcigpIHtcbiAgICAvLyBpZiB3ZSBkb24ndCBoYXZlIGEgc3RhdGljIGZpbGUgY2FsbGVkIGluZGV4Lmh0bWwgdGhlbiB3ZSBzaG91bGRcbiAgICAvLyByZWRpcmVjdCB0byB0aGUgbGFtYmRhIGhhbmRsZXJcbiAgICBjb25zdCBoYXNJbmRleEh0bWwgPSB0aGlzLnByb3BzLm5leHRCdWlsZC5yZWFkUHVibGljRmlsZUxpc3QoKS5pbmNsdWRlcygnaW5kZXguaHRtbCcpO1xuICAgIGlmIChoYXNJbmRleEh0bWwpIHJldHVybjsgLy8gZG9uJ3QgYWRkIHJvb3QgcGF0aCBiZWhhdmlvclxuXG4gICAgY29uc3QgeyBvcmlnaW4sIC4uLm9wdGlvbnMgfSA9IHRoaXMuc2VydmVyQmVoYXZpb3JPcHRpb25zO1xuXG4gICAgLy8gd2hlbiBiYXNlUGF0aCBpcyBzZXQsIHdlIGVtdWxhdGUgdGhlIFwiZGVmYXVsdCBiZWhhdmlvclwiICgqKSBmb3IgdGhlIHNpdGUgYXMgYC9iYXNlLXBhdGgvKmBcbiAgICBpZiAodGhpcy5wcm9wcy5iYXNlUGF0aCkge1xuICAgICAgdGhpcy5kaXN0cmlidXRpb24uYWRkQmVoYXZpb3IodGhpcy5nZXRQYXRoUGF0dGVybignJyksIG9yaWdpbiwgb3B0aW9ucyk7XG4gICAgICB0aGlzLmRpc3RyaWJ1dGlvbi5hZGRCZWhhdmlvcih0aGlzLmdldFBhdGhQYXR0ZXJuKCcqJyksIG9yaWdpbiwgb3B0aW9ucyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuZGlzdHJpYnV0aW9uLmFkZEJlaGF2aW9yKHRoaXMuZ2V0UGF0aFBhdHRlcm4oJy8nKSwgb3JpZ2luLCBvcHRpb25zKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFkZFN0YXRpY0JlaGF2aW9yc1RvRGlzdHJpYnV0aW9uKCkge1xuICAgIGNvbnN0IHB1YmxpY0ZpbGVzID0gZnMucmVhZGRpclN5bmMocGF0aC5qb2luKHRoaXMucHJvcHMubmV4dGpzUGF0aCwgTkVYVEpTX0JVSUxEX0RJUiwgTkVYVEpTX1NUQVRJQ19ESVIpLCB7XG4gICAgICB3aXRoRmlsZVR5cGVzOiB0cnVlLFxuICAgIH0pO1xuICAgIGlmIChwdWJsaWNGaWxlcy5sZW5ndGggPj0gMjUpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgYFRvbyBtYW55IHB1YmxpYy8gZmlsZXMgaW4gTmV4dC5qcyBidWlsZC4gQ2xvdWRGcm9udCBsaW1pdHMgRGlzdHJpYnV0aW9ucyB0byAyNSBDYWNoZSBCZWhhdmlvcnMuIFNlZSBkb2N1bWVudGVkIGxpbWl0IGhlcmU6IGh0dHBzOi8vZG9jcy5hd3MuYW1hem9uLmNvbS9BbWF6b25DbG91ZEZyb250L2xhdGVzdC9EZXZlbG9wZXJHdWlkZS9jbG91ZGZyb250LWxpbWl0cy5odG1sI2xpbWl0cy13ZWItZGlzdHJpYnV0aW9uc2BcbiAgICAgICk7XG4gICAgfVxuICAgIGZvciAoY29uc3QgcHVibGljRmlsZSBvZiBwdWJsaWNGaWxlcykge1xuICAgICAgY29uc3QgcGF0aFBhdHRlcm4gPSBwdWJsaWNGaWxlLmlzRGlyZWN0b3J5KCkgPyBgJHtwdWJsaWNGaWxlLm5hbWV9LypgIDogcHVibGljRmlsZS5uYW1lO1xuICAgICAgaWYgKCEvXlthLXpBLVowLTlfXFwtXFwuXFwqXFwkL35cIidAOis/Jl0rJC8udGVzdChwYXRoUGF0dGVybikpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICAgIGBJbnZhbGlkIENsb3VkRnJvbnQgRGlzdHJpYnV0aW9uIENhY2hlIEJlaGF2aW9yIFBhdGggUGF0dGVybjogJHtwYXRoUGF0dGVybn0uIFBsZWFzZSBzZWUgZG9jdW1lbnRhdGlvbiBoZXJlOiBodHRwczovL2RvY3MuYXdzLmFtYXpvbi5jb20vQW1hem9uQ2xvdWRGcm9udC9sYXRlc3QvRGV2ZWxvcGVyR3VpZGUvZGlzdHJpYnV0aW9uLXdlYi12YWx1ZXMtc3BlY2lmeS5odG1sI0Rvd25sb2FkRGlzdFZhbHVlc1BhdGhQYXR0ZXJuYFxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgY29uc3QgZmluYWxQYXRoUGF0dGVybiA9IHRoaXMuZ2V0UGF0aFBhdHRlcm4ocGF0aFBhdHRlcm4pO1xuICAgICAgdGhpcy5kaXN0cmlidXRpb24uYWRkQmVoYXZpb3IoZmluYWxQYXRoUGF0dGVybiwgdGhpcy5zM09yaWdpbiwgdGhpcy5zdGF0aWNCZWhhdmlvck9wdGlvbnMpO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBPcHRpb25hbGx5IHByZXBlbmRzIGJhc2UgcGF0aCB0byBnaXZlbiBwYXRoIHBhdHRlcm4uXG4gICAqL1xuICBwcml2YXRlIGdldFBhdGhQYXR0ZXJuKHBhdGhQYXR0ZXJuOiBzdHJpbmcpIHtcbiAgICBpZiAodGhpcy5wcm9wcy5iYXNlUGF0aCkge1xuICAgICAgLy8gYmVjYXVzZSB3ZSBhbHJlYWR5IGhhdmUgYSBiYXNlUGF0aCB3ZSBkb24ndCB1c2UgLyBpbnN0ZWFkIHdlIHVzZSAvYmFzZS1wYXRoXG4gICAgICBpZiAocGF0aFBhdHRlcm4gPT09ICcnKSByZXR1cm4gdGhpcy5wcm9wcy5iYXNlUGF0aDtcbiAgICAgIHJldHVybiBgJHt0aGlzLnByb3BzLmJhc2VQYXRofS8ke3BhdGhQYXR0ZXJufWA7XG4gICAgfVxuXG4gICAgcmV0dXJuIHBhdGhQYXR0ZXJuO1xuICB9XG5cbiAgcHJpdmF0ZSBidWlsZERpc3RyaWJ1dGlvbkRvbWFpbk5hbWVzKCk6IHN0cmluZ1tdIHtcbiAgICBjb25zdCBjdXN0b21Eb21haW4gPVxuICAgICAgdHlwZW9mIHRoaXMucHJvcHMuY3VzdG9tRG9tYWluID09PSAnc3RyaW5nJyA/IHRoaXMucHJvcHMuY3VzdG9tRG9tYWluIDogdGhpcy5wcm9wcy5jdXN0b21Eb21haW4/LmRvbWFpbk5hbWU7XG5cbiAgICBjb25zdCBhbHRlcm5hdGVOYW1lcyA9XG4gICAgICB0eXBlb2YgdGhpcy5wcm9wcy5jdXN0b21Eb21haW4gPT09ICdzdHJpbmcnID8gW10gOiB0aGlzLnByb3BzLmN1c3RvbURvbWFpbj8uYWx0ZXJuYXRlTmFtZXMgfHwgW107XG5cbiAgICByZXR1cm4gY3VzdG9tRG9tYWluID8gW2N1c3RvbURvbWFpbiwgLi4uYWx0ZXJuYXRlTmFtZXNdIDogW107XG4gIH1cblxuICAvLy8vLy8vLy8vLy8vLy8vLy8vLy9cbiAgLy8gQ3VzdG9tIERvbWFpblxuICAvLy8vLy8vLy8vLy8vLy8vLy8vLy9cblxuICBwcm90ZWN0ZWQgdmFsaWRhdGVDdXN0b21Eb21haW5TZXR0aW5ncygpIHtcbiAgICBjb25zdCB7IGN1c3RvbURvbWFpbiB9ID0gdGhpcy5wcm9wcztcblxuICAgIGlmICghY3VzdG9tRG9tYWluKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKHR5cGVvZiBjdXN0b21Eb21haW4gPT09ICdzdHJpbmcnKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKGN1c3RvbURvbWFpbi5pc0V4dGVybmFsRG9tYWluID09PSB0cnVlKSB7XG4gICAgICBpZiAoIWN1c3RvbURvbWFpbi5jZXJ0aWZpY2F0ZSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0EgdmFsaWQgY2VydGlmaWNhdGUgaXMgcmVxdWlyZWQgd2hlbiBcImlzRXh0ZXJuYWxEb21haW5cIiBpcyBzZXQgdG8gXCJ0cnVlXCIuJyk7XG4gICAgICB9XG4gICAgICBpZiAoY3VzdG9tRG9tYWluLmRvbWFpbkFsaWFzKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgICAnRG9tYWluIGFsaWFzIGlzIG9ubHkgc3VwcG9ydGVkIGZvciBkb21haW5zIGhvc3RlZCBvbiBBbWF6b24gUm91dGUgNTMuIERvIG5vdCBzZXQgdGhlIFwiY3VzdG9tRG9tYWluLmRvbWFpbkFsaWFzXCIgd2hlbiBcImlzRXh0ZXJuYWxEb21haW5cIiBpcyBlbmFibGVkLidcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIGlmIChjdXN0b21Eb21haW4uaG9zdGVkWm9uZSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgJ0hvc3RlZCB6b25lcyBjYW4gb25seSBiZSBjb25maWd1cmVkIGZvciBkb21haW5zIGhvc3RlZCBvbiBBbWF6b24gUm91dGUgNTMuIERvIG5vdCBzZXQgdGhlIFwiY3VzdG9tRG9tYWluLmhvc3RlZFpvbmVcIiB3aGVuIFwiaXNFeHRlcm5hbERvbWFpblwiIGlzIGVuYWJsZWQuJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHByb3RlY3RlZCBsb29rdXBIb3N0ZWRab25lKCk6IHJvdXRlNTMuSUhvc3RlZFpvbmUgfCB1bmRlZmluZWQge1xuICAgIGNvbnN0IHsgY3VzdG9tRG9tYWluIH0gPSB0aGlzLnByb3BzO1xuXG4gICAgLy8gU2tpcCBpZiBjdXN0b21Eb21haW4gaXMgbm90IGNvbmZpZ3VyZWRcbiAgICBpZiAoIWN1c3RvbURvbWFpbikge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGxldCBob3N0ZWRab25lO1xuXG4gICAgaWYgKHR5cGVvZiBjdXN0b21Eb21haW4gPT09ICdzdHJpbmcnKSB7XG4gICAgICBob3N0ZWRab25lID0gcm91dGU1My5Ib3N0ZWRab25lLmZyb21Mb29rdXAodGhpcywgJ0hvc3RlZFpvbmUnLCB7XG4gICAgICAgIGRvbWFpbk5hbWU6IGN1c3RvbURvbWFpbixcbiAgICAgIH0pO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIGN1c3RvbURvbWFpbi5ob3N0ZWRab25lID09PSAnc3RyaW5nJykge1xuICAgICAgaG9zdGVkWm9uZSA9IHJvdXRlNTMuSG9zdGVkWm9uZS5mcm9tTG9va3VwKHRoaXMsICdIb3N0ZWRab25lJywge1xuICAgICAgICBkb21haW5OYW1lOiBjdXN0b21Eb21haW4uaG9zdGVkWm9uZSxcbiAgICAgIH0pO1xuICAgIH0gZWxzZSBpZiAoY3VzdG9tRG9tYWluLmhvc3RlZFpvbmUpIHtcbiAgICAgIGhvc3RlZFpvbmUgPSBjdXN0b21Eb21haW4uaG9zdGVkWm9uZTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBjdXN0b21Eb21haW4uZG9tYWluTmFtZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgIC8vIFNraXAgaWYgZG9tYWluIGlzIG5vdCBhIFJvdXRlNTMgZG9tYWluXG4gICAgICBpZiAoY3VzdG9tRG9tYWluLmlzRXh0ZXJuYWxEb21haW4gPT09IHRydWUpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBob3N0ZWRab25lID0gcm91dGU1My5Ib3N0ZWRab25lLmZyb21Mb29rdXAodGhpcywgJ0hvc3RlZFpvbmUnLCB7XG4gICAgICAgIGRvbWFpbk5hbWU6IGN1c3RvbURvbWFpbi5kb21haW5OYW1lLFxuICAgICAgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGhvc3RlZFpvbmUgPSBjdXN0b21Eb21haW4uaG9zdGVkWm9uZTtcbiAgICB9XG5cbiAgICByZXR1cm4gaG9zdGVkWm9uZTtcbiAgfVxuXG4gIHByaXZhdGUgY3JlYXRlQ2VydGlmaWNhdGUoKTogYWNtLklDZXJ0aWZpY2F0ZSB8IHVuZGVmaW5lZCB7XG4gICAgY29uc3QgeyBjdXN0b21Eb21haW4gfSA9IHRoaXMucHJvcHM7XG5cbiAgICBpZiAoIWN1c3RvbURvbWFpbikge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGxldCBhY21DZXJ0aWZpY2F0ZTtcblxuICAgIC8vIEhvc3RlZFpvbmUgaXMgc2V0IGZvciBSb3V0ZSA1MyBkb21haW5zXG4gICAgaWYgKHRoaXMuaG9zdGVkWm9uZSkge1xuICAgICAgaWYgKHR5cGVvZiBjdXN0b21Eb21haW4gPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIGFjbUNlcnRpZmljYXRlID0gbmV3IGFjbS5EbnNWYWxpZGF0ZWRDZXJ0aWZpY2F0ZSh0aGlzLCAnQ2VydGlmaWNhdGUnLCB7XG4gICAgICAgICAgZG9tYWluTmFtZTogY3VzdG9tRG9tYWluLFxuICAgICAgICAgIGhvc3RlZFpvbmU6IHRoaXMuaG9zdGVkWm9uZSxcbiAgICAgICAgICByZWdpb246ICd1cy1lYXN0LTEnLFxuICAgICAgICB9KTtcbiAgICAgIH0gZWxzZSBpZiAoY3VzdG9tRG9tYWluLmNlcnRpZmljYXRlKSB7XG4gICAgICAgIGFjbUNlcnRpZmljYXRlID0gY3VzdG9tRG9tYWluLmNlcnRpZmljYXRlO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgYWNtQ2VydGlmaWNhdGUgPSBuZXcgYWNtLkRuc1ZhbGlkYXRlZENlcnRpZmljYXRlKHRoaXMsICdDZXJ0aWZpY2F0ZScsIHtcbiAgICAgICAgICBkb21haW5OYW1lOiBjdXN0b21Eb21haW4uZG9tYWluTmFtZSxcbiAgICAgICAgICBob3N0ZWRab25lOiB0aGlzLmhvc3RlZFpvbmUsXG4gICAgICAgICAgcmVnaW9uOiAndXMtZWFzdC0xJyxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICAgIC8vIEhvc3RlZFpvbmUgaXMgTk9UIHNldCBmb3Igbm9uLVJvdXRlIDUzIGRvbWFpbnNcbiAgICBlbHNlIHtcbiAgICAgIGlmICh0eXBlb2YgY3VzdG9tRG9tYWluICE9PSAnc3RyaW5nJykge1xuICAgICAgICBhY21DZXJ0aWZpY2F0ZSA9IGN1c3RvbURvbWFpbi5jZXJ0aWZpY2F0ZTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gYWNtQ2VydGlmaWNhdGU7XG4gIH1cblxuICBwcml2YXRlIGNyZWF0ZVJvdXRlNTNSZWNvcmRzKCk6IHZvaWQge1xuICAgIGNvbnN0IHsgY3VzdG9tRG9tYWluIH0gPSB0aGlzLnByb3BzO1xuXG4gICAgaWYgKCFjdXN0b21Eb21haW4gfHwgIXRoaXMuaG9zdGVkWm9uZSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGxldCByZWNvcmROYW1lO1xuICAgIGxldCBkb21haW5BbGlhcztcbiAgICBpZiAodHlwZW9mIGN1c3RvbURvbWFpbiA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHJlY29yZE5hbWUgPSBjdXN0b21Eb21haW47XG4gICAgfSBlbHNlIHtcbiAgICAgIHJlY29yZE5hbWUgPSBjdXN0b21Eb21haW4uZG9tYWluTmFtZTtcbiAgICAgIGRvbWFpbkFsaWFzID0gY3VzdG9tRG9tYWluLmRvbWFpbkFsaWFzO1xuICAgIH1cblxuICAgIC8vIENyZWF0ZSBETlMgcmVjb3JkXG4gICAgY29uc3QgcmVjb3JkUHJvcHMgPSB7XG4gICAgICByZWNvcmROYW1lLFxuICAgICAgem9uZTogdGhpcy5ob3N0ZWRab25lLFxuICAgICAgdGFyZ2V0OiByb3V0ZTUzLlJlY29yZFRhcmdldC5mcm9tQWxpYXMobmV3IHJvdXRlNTNUYXJnZXRzLkNsb3VkRnJvbnRUYXJnZXQodGhpcy5kaXN0cmlidXRpb24pKSxcbiAgICB9O1xuICAgIG5ldyByb3V0ZTUzLkFSZWNvcmQodGhpcywgJ0FsaWFzUmVjb3JkJywgcmVjb3JkUHJvcHMpO1xuICAgIG5ldyByb3V0ZTUzLkFhYWFSZWNvcmQodGhpcywgJ0FsaWFzUmVjb3JkQUFBQScsIHJlY29yZFByb3BzKTtcblxuICAgIC8vIENyZWF0ZSBBbGlhcyByZWRpcmVjdCByZWNvcmRcbiAgICBpZiAoZG9tYWluQWxpYXMpIHtcbiAgICAgIG5ldyByb3V0ZTUzUGF0dGVybnMuSHR0cHNSZWRpcmVjdCh0aGlzLCAnUmVkaXJlY3QnLCB7XG4gICAgICAgIHpvbmU6IHRoaXMuaG9zdGVkWm9uZSxcbiAgICAgICAgcmVjb3JkTmFtZXM6IFtkb21haW5BbGlhc10sXG4gICAgICAgIHRhcmdldERvbWFpbjogcmVjb3JkTmFtZSxcbiAgICAgIH0pO1xuICAgIH1cbiAgfVxufVxuIl19