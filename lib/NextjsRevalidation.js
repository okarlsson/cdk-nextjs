"use strict";
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.NextjsRevalidation = void 0;
const JSII_RTTI_SYMBOL_1 = Symbol.for("jsii.rtti");
const fs = require("fs");
const aws_cdk_lib_1 = require("aws-cdk-lib");
const aws_dynamodb_1 = require("aws-cdk-lib/aws-dynamodb");
const aws_iam_1 = require("aws-cdk-lib/aws-iam");
const aws_lambda_1 = require("aws-cdk-lib/aws-lambda");
const aws_lambda_event_sources_1 = require("aws-cdk-lib/aws-lambda-event-sources");
const aws_logs_1 = require("aws-cdk-lib/aws-logs");
const aws_sqs_1 = require("aws-cdk-lib/aws-sqs");
const custom_resources_1 = require("aws-cdk-lib/custom-resources");
const constructs_1 = require("constructs");
const common_lambda_props_1 = require("./utils/common-lambda-props");
/**
 * Builds the system for revalidating Next.js resources. This includes a Lambda function handler and queue system as well
 * as the DynamoDB table and provider function.
 *
 * @see {@link https://github.com/serverless-stack/open-next/blob/main/README.md?plain=1#L65}
 *
 */
class NextjsRevalidation extends constructs_1.Construct {
    constructor(scope, id, props) {
        super(scope, id);
        this.props = props;
        this.queue = this.createQueue();
        this.queueFunction = this.createQueueFunction();
        this.table = this.createRevalidationTable();
        this.tableFunction = this.createRevalidationInsertFunction(this.table);
        this.props.serverFunction.lambdaFunction.addEnvironment('CACHE_DYNAMO_TABLE', this.table.tableName);
        if (this.props.serverFunction.lambdaFunction.role) {
            this.table.grantReadWriteData(this.props.serverFunction.lambdaFunction.role);
        }
        this.props.serverFunction.lambdaFunction // allow server fn to send messages to queue
            ?.addEnvironment('REVALIDATION_QUEUE_URL', this.queue.queueUrl);
        props.serverFunction.lambdaFunction?.addEnvironment('REVALIDATION_QUEUE_REGION', aws_cdk_lib_1.Stack.of(this).region);
    }
    createQueue() {
        const queue = new aws_sqs_1.Queue(this, 'Queue', {
            fifo: true,
            receiveMessageWaitTime: aws_cdk_lib_1.Duration.seconds(20),
        });
        // https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-least-privilege-policy.html
        queue.addToResourcePolicy(new aws_iam_1.PolicyStatement({
            sid: 'DenyUnsecureTransport',
            actions: ['sqs:*'],
            effect: aws_iam_1.Effect.DENY,
            principals: [new aws_iam_1.AnyPrincipal()],
            resources: [queue.queueArn],
            conditions: {
                Bool: { 'aws:SecureTransport': 'false' },
            },
        }));
        // Allow server to send messages to the queue
        queue.grantSendMessages(this.props.serverFunction.lambdaFunction);
        return queue;
    }
    createQueueFunction() {
        const commonFnProps = (0, common_lambda_props_1.getCommonFunctionProps)(this);
        const fn = new aws_lambda_1.Function(this, 'QueueFn', {
            ...commonFnProps,
            // open-next revalidation-function
            // see: https://github.com/serverless-stack/open-next/blob/274d446ed7e940cfbe7ce05a21108f4c854ee37a/README.md?plain=1#L65
            code: aws_lambda_1.Code.fromAsset(this.props.nextBuild.nextRevalidateFnDir),
            handler: 'index.handler',
            description: 'Next.js Queue Revalidation Function',
            timeout: aws_cdk_lib_1.Duration.seconds(30),
        });
        fn.addEventSource(new aws_lambda_event_sources_1.SqsEventSource(this.queue, { batchSize: 5 }));
        return fn;
    }
    createRevalidationTable() {
        return new aws_dynamodb_1.TableV2(this, 'Table', {
            partitionKey: { name: 'tag', type: aws_dynamodb_1.AttributeType.STRING },
            sortKey: { name: 'path', type: aws_dynamodb_1.AttributeType.STRING },
            billing: aws_dynamodb_1.Billing.onDemand(),
            globalSecondaryIndexes: [
                {
                    indexName: 'revalidate',
                    partitionKey: { name: 'path', type: aws_dynamodb_1.AttributeType.STRING },
                    sortKey: { name: 'revalidatedAt', type: aws_dynamodb_1.AttributeType.NUMBER },
                },
            ],
            removalPolicy: aws_cdk_lib_1.RemovalPolicy.DESTROY,
        });
    }
    /**
     * This function will insert the initial batch of tag / path / revalidation data into the DynamoDB table during deployment.
     * @see: {@link https://open-next.js.org/inner_workings/isr#tags}
     *
     * @param revalidationTable table to grant function access to
     * @returns the revalidation insert provider function
     */
    createRevalidationInsertFunction(revalidationTable) {
        const dynamodbProviderPath = this.props.nextBuild.nextRevalidateDynamoDBProviderFnDir;
        // note the function may not exist - it only exists if there are cache tags values defined in Next.js build meta files to be inserted
        // see: https://github.com/sst/open-next/blob/c2b05e3a5f82de40da1181e11c087265983c349d/packages/open-next/src/build.ts#L426-L458
        if (fs.existsSync(dynamodbProviderPath)) {
            const commonFnProps = (0, common_lambda_props_1.getCommonFunctionProps)(this);
            const insertFn = new aws_lambda_1.Function(this, 'DynamoDBProviderFn', {
                ...commonFnProps,
                // open-next revalidation-function
                // see: https://github.com/serverless-stack/open-next/blob/274d446ed7e940cfbe7ce05a21108f4c854ee37a/README.md?plain=1#L65
                code: aws_lambda_1.Code.fromAsset(this.props.nextBuild.nextRevalidateDynamoDBProviderFnDir),
                handler: 'index.handler',
                description: 'Next.js Revalidation DynamoDB Provider',
                timeout: aws_cdk_lib_1.Duration.minutes(1),
                environment: {
                    CACHE_DYNAMO_TABLE: revalidationTable.tableName,
                },
            });
            revalidationTable.grantReadWriteData(insertFn);
            const provider = new custom_resources_1.Provider(this, 'DynamoDBProvider', {
                onEventHandler: insertFn,
                logRetention: aws_logs_1.RetentionDays.ONE_DAY,
            });
            new aws_cdk_lib_1.CustomResource(this, 'DynamoDBResource', {
                serviceToken: provider.serviceToken,
                properties: {
                    version: Date.now().toString(),
                },
            });
            return insertFn;
        }
        return undefined;
    }
}
_a = JSII_RTTI_SYMBOL_1;
NextjsRevalidation[_a] = { fqn: "cdk-nextjs-standalone.NextjsRevalidation", version: "0.0.0" };
exports.NextjsRevalidation = NextjsRevalidation;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTmV4dGpzUmV2YWxpZGF0aW9uLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL05leHRqc1JldmFsaWRhdGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7OztBQUFBLHlCQUF5QjtBQUN6Qiw2Q0FBNkU7QUFDN0UsMkRBQW9GO0FBQ3BGLGlEQUE0RTtBQUM1RSx1REFBMkY7QUFDM0YsbUZBQXNFO0FBQ3RFLG1EQUFxRDtBQUNyRCxpREFBNEM7QUFDNUMsbUVBQXdEO0FBQ3hELDJDQUF1QztBQUl2QyxxRUFBcUU7QUFtQnJFOzs7Ozs7R0FNRztBQUNILE1BQWEsa0JBQW1CLFNBQVEsc0JBQVM7SUFPL0MsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUE4QjtRQUN0RSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ2pCLElBQUksQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDO1FBRW5CLElBQUksQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDO1FBQ2hDLElBQUksQ0FBQyxhQUFhLEdBQUcsSUFBSSxDQUFDLG1CQUFtQixFQUFFLENBQUM7UUFFaEQsSUFBSSxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUMsdUJBQXVCLEVBQUUsQ0FBQztRQUM1QyxJQUFJLENBQUMsYUFBYSxHQUFHLElBQUksQ0FBQyxnQ0FBZ0MsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7UUFFdkUsSUFBSSxDQUFDLEtBQUssQ0FBQyxjQUFjLENBQUMsY0FBYyxDQUFDLGNBQWMsQ0FBQyxvQkFBb0IsRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBRXBHLElBQUksSUFBSSxDQUFDLEtBQUssQ0FBQyxjQUFjLENBQUMsY0FBYyxDQUFDLElBQUksRUFBRTtZQUNqRCxJQUFJLENBQUMsS0FBSyxDQUFDLGtCQUFrQixDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsY0FBYyxDQUFDLGNBQWMs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QyxHQUFHLEVBQUUsQ0FBQyxRQUFRLEVBQUU7aUJBQy9CO2FBQ0YsQ0FBQyxDQUFDO1lBRUgsT0FBTyxRQUFRLENBQUM7U0FDakI7UUFFRCxPQUFPLFNBQVMsQ0FBQztJQUNuQixDQUFDOzs7O0FBL0hVLGdEQUFrQiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzJztcbmltcG9ydCB7IEN1c3RvbVJlc291cmNlLCBEdXJhdGlvbiwgUmVtb3ZhbFBvbGljeSwgU3RhY2sgfSBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBBdHRyaWJ1dGVUeXBlLCBCaWxsaW5nLCBUYWJsZVYyIGFzIFRhYmxlIH0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWR5bmFtb2RiJztcbmltcG9ydCB7IEFueVByaW5jaXBhbCwgRWZmZWN0LCBQb2xpY3lTdGF0ZW1lbnQgfSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtaWFtJztcbmltcG9ydCB7IENvZGUsIEZ1bmN0aW9uIGFzIExhbWJkYUZ1bmN0aW9uLCBGdW5jdGlvbk9wdGlvbnMgfSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbGFtYmRhJztcbmltcG9ydCB7IFNxc0V2ZW50U291cmNlIH0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWxhbWJkYS1ldmVudC1zb3VyY2VzJztcbmltcG9ydCB7IFJldGVudGlvbkRheXMgfSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbG9ncyc7XG5pbXBvcnQgeyBRdWV1ZSB9IGZyb20gJ2F3cy1jZGstbGliL2F3cy1zcXMnO1xuaW1wb3J0IHsgUHJvdmlkZXIgfSBmcm9tICdhd3MtY2RrLWxpYi9jdXN0b20tcmVzb3VyY2VzJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0IHsgTmV4dGpzQmFzZVByb3BzIH0gZnJvbSAnLi9OZXh0anNCYXNlJztcbmltcG9ydCB7IE5leHRqc0J1aWxkIH0gZnJvbSAnLi9OZXh0anNCdWlsZCc7XG5pbXBvcnQgeyBOZXh0anNTZXJ2ZXIgfSBmcm9tICcuL05leHRqc1NlcnZlcic7XG5pbXBvcnQgeyBnZXRDb21tb25GdW5jdGlvblByb3BzIH0gZnJvbSAnLi91dGlscy9jb21tb24tbGFtYmRhLXByb3BzJztcblxuZXhwb3J0IGludGVyZmFjZSBOZXh0anNSZXZhbGlkYXRpb25Qcm9wcyBleHRlbmRzIE5leHRqc0Jhc2VQcm9wcyB7XG4gIC8qKlxuICAgKiBPdmVycmlkZSBmdW5jdGlvbiBwcm9wZXJ0aWVzLlxuICAgKi9cbiAgcmVhZG9ubHkgbGFtYmRhT3B0aW9ucz86IEZ1bmN0aW9uT3B0aW9ucztcblxuICAvKipcbiAgICogVGhlIGBOZXh0anNCdWlsZGAgaW5zdGFuY2UgcmVwcmVzZW50aW5nIHRoZSBidWlsdCBOZXh0anMgYXBwbGljYXRpb24uXG4gICAqL1xuICByZWFkb25seSBuZXh0QnVpbGQ6IE5leHRqc0J1aWxkO1xuXG4gIC8qKlxuICAgKiBUaGUgbWFpbiBOZXh0SlMgc2VydmVyIGhhbmRsZXIgbGFtYmRhIGZ1bmN0aW9uLlxuICAgKi9cbiAgcmVhZG9ubHkgc2VydmVyRnVuY3Rpb246IE5leHRqc1NlcnZlcjtcbn1cblxuLyoqXG4gKiBCdWlsZHMgdGhlIHN5c3RlbSBmb3IgcmV2YWxpZGF0aW5nIE5leHQuanMgcmVzb3VyY2VzLiBUaGlzIGluY2x1ZGVzIGEgTGFtYmRhIGZ1bmN0aW9uIGhhbmRsZXIgYW5kIHF1ZXVlIHN5c3RlbSBhcyB3ZWxsXG4gKiBhcyB0aGUgRHluYW1vREIgdGFibGUgYW5kIHByb3ZpZGVyIGZ1bmN0aW9uLlxuICpcbiAqIEBzZWUge0BsaW5rIGh0dHBzOi8vZ2l0aHViLmNvbS9zZXJ2ZXJsZXNzLXN0YWNrL29wZW4tbmV4dC9ibG9iL21haW4vUkVBRE1FLm1kP3BsYWluPTEjTDY1fVxuICpcbiAqL1xuZXhwb3J0IGNsYXNzIE5leHRqc1JldmFsaWRhdGlvbiBleHRlbmRzIENvbnN0cnVjdCB7XG4gIHF1ZXVlOiBRdWV1ZTtcbiAgdGFibGU6IFRhYmxlO1xuICBxdWV1ZUZ1bmN0aW9uOiBMYW1iZGFGdW5jdGlvbjtcbiAgdGFibGVGdW5jdGlvbjogTGFtYmRhRnVuY3Rpb24gfCB1bmRlZmluZWQ7XG4gIHByaXZhdGUgcHJvcHM6IE5leHRqc1JldmFsaWRhdGlvblByb3BzO1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBOZXh0anNSZXZhbGlkYXRpb25Qcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCk7XG4gICAgdGhpcy5wcm9wcyA9IHByb3BzO1xuXG4gICAgdGhpcy5xdWV1ZSA9IHRoaXMuY3JlYXRlUXVldWUoKTtcbiAgICB0aGlzLnF1ZXVlRnVuY3Rpb24gPSB0aGlzLmNyZWF0ZVF1ZXVlRnVuY3Rpb24oKTtcblxuICAgIHRoaXMudGFibGUgPSB0aGlzLmNyZWF0ZVJldmFsaWRhdGlvblRhYmxlKCk7XG4gICAgdGhpcy50YWJsZUZ1bmN0aW9uID0gdGhpcy5jcmVhdGVSZXZhbGlkYXRpb25JbnNlcnRGdW5jdGlvbih0aGlzLnRhYmxlKTtcblxuICAgIHRoaXMucHJvcHMuc2VydmVyRnVuY3Rpb24ubGFtYmRhRnVuY3Rpb24uYWRkRW52aXJvbm1lbnQoJ0NBQ0hFX0RZTkFNT19UQUJMRScsIHRoaXMudGFibGUudGFibGVOYW1lKTtcblxuICAgIGlmICh0aGlzLnByb3BzLnNlcnZlckZ1bmN0aW9uLmxhbWJkYUZ1bmN0aW9uLnJvbGUpIHtcbiAgICAgIHRoaXMudGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKHRoaXMucHJvcHMuc2VydmVyRnVuY3Rpb24ubGFtYmRhRnVuY3Rpb24ucm9sZSk7XG4gICAgfVxuXG4gICAgdGhpcy5wcm9wcy5zZXJ2ZXJGdW5jdGlvbi5sYW1iZGFGdW5jdGlvbiAvLyBhbGxvdyBzZXJ2ZXIgZm4gdG8gc2VuZCBtZXNzYWdlcyB0byBxdWV1ZVxuICAgICAgPy5hZGRFbnZpcm9ubWVudCgnUkVWQUxJREFUSU9OX1FVRVVFX1VSTCcsIHRoaXMucXVldWUucXVldWVVcmwpO1xuICAgIHByb3BzLnNlcnZlckZ1bmN0aW9uLmxhbWJkYUZ1bmN0aW9uPy5hZGRFbnZpcm9ubWVudCgnUkVWQUxJREFUSU9OX1FVRVVFX1JFR0lPTicsIFN0YWNrLm9mKHRoaXMpLnJlZ2lvbik7XG4gIH1cblxuICBwcml2YXRlIGNyZWF0ZVF1ZXVlKCk6IFF1ZXVlIHtcbiAgICBjb25zdCBxdWV1ZSA9IG5ldyBRdWV1ZSh0aGlzLCAnUXVldWUnLCB7XG4gICAgICBmaWZvOiB0cnVlLFxuICAgICAgcmVjZWl2ZU1lc3NhZ2VXYWl0VGltZTogRHVyYXRpb24uc2Vjb25kcygyMCksXG4gICAgfSk7XG4gICAgLy8gaHR0cHM6Ly9kb2NzLmF3cy5hbWF6b24uY29tL0FXU1NpbXBsZVF1ZXVlU2VydmljZS9sYXRlc3QvU1FTRGV2ZWxvcGVyR3VpZGUvc3FzLWxlYXN0LXByaXZpbGVnZS1wb2xpY3kuaHRtbFxuICAgIHF1ZXVlLmFkZFRvUmVzb3VyY2VQb2xpY3koXG4gICAgICBuZXcgUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgc2lkOiAnRGVueVVuc2VjdXJlVHJhbnNwb3J0JyxcbiAgICAgICAgYWN0aW9uczogWydzcXM6KiddLFxuICAgICAgICBlZmZlY3Q6IEVmZmVjdC5ERU5ZLFxuICAgICAgICBwcmluY2lwYWxzOiBbbmV3IEFueVByaW5jaXBhbCgpXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbcXVldWUucXVldWVBcm5dLFxuICAgICAgICBjb25kaXRpb25zOiB7XG4gICAgICAgICAgQm9vbDogeyAnYXdzOlNlY3VyZVRyYW5zcG9ydCc6ICdmYWxzZScgfSxcbiAgICAgICAgfSxcbiAgICAgIH0pXG4gICAgKTtcbiAgICAvLyBBbGxvdyBzZXJ2ZXIgdG8gc2VuZCBtZXNzYWdlcyB0byB0aGUgcXVldWVcbiAgICBxdWV1ZS5ncmFudFNlbmRNZXNzYWdlcyh0aGlzLnByb3BzLnNlcnZlckZ1bmN0aW9uLmxhbWJkYUZ1bmN0aW9uKTtcbiAgICByZXR1cm4gcXVldWU7XG4gIH1cblxuICBwcml2YXRlIGNyZWF0ZVF1ZXVlRnVuY3Rpb24oKTogTGFtYmRhRnVuY3Rpb24ge1xuICAgIGNvbnN0IGNvbW1vbkZuUHJvcHMgPSBnZXRDb21tb25GdW5jdGlvblByb3BzKHRoaXMpO1xuICAgIGNvbnN0IGZuID0gbmV3IExhbWJkYUZ1bmN0aW9uKHRoaXMsICdRdWV1ZUZuJywge1xuICAgICAgLi4uY29tbW9uRm5Qcm9wcyxcbiAgICAgIC8vIG9wZW4tbmV4dCByZXZhbGlkYXRpb24tZnVuY3Rpb25cbiAgICAgIC8vIHNlZTogaHR0cHM6Ly9naXRodWIuY29tL3NlcnZlcmxlc3Mtc3RhY2svb3Blbi1uZXh0L2Jsb2IvMjc0ZDQ0NmVkN2U5NDBjZmJlN2NlMDVhMjExMDhmNGM4NTRlZTM3YS9SRUFETUUubWQ/cGxhaW49MSNMNjVcbiAgICAgIGNvZGU6IENvZGUuZnJvbUFzc2V0KHRoaXMucHJvcHMubmV4dEJ1aWxkLm5leHRSZXZhbGlkYXRlRm5EaXIpLFxuICAgICAgaGFuZGxlcjogJ2luZGV4LmhhbmRsZXInLFxuICAgICAgZGVzY3JpcHRpb246ICdOZXh0LmpzIFF1ZXVlIFJldmFsaWRhdGlvbiBGdW5jdGlvbicsXG4gICAgICB0aW1lb3V0OiBEdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICB9KTtcbiAgICBmbi5hZGRFdmVudFNvdXJjZShuZXcgU3FzRXZlbnRTb3VyY2UodGhpcy5xdWV1ZSwgeyBiYXRjaFNpemU6IDUgfSkpO1xuICAgIHJldHVybiBmbjtcbiAgfVxuXG4gIHByaXZhdGUgY3JlYXRlUmV2YWxpZGF0aW9uVGFibGUoKSB7XG4gICAgcmV0dXJuIG5ldyBUYWJsZSh0aGlzLCAnVGFibGUnLCB7XG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogJ3RhZycsIHR5cGU6IEF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICBzb3J0S2V5OiB7IG5hbWU6ICdwYXRoJywgdHlwZTogQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIGJpbGxpbmc6IEJpbGxpbmcub25EZW1hbmQoKSxcbiAgICAgIGdsb2JhbFNlY29uZGFyeUluZGV4ZXM6IFtcbiAgICAgICAge1xuICAgICAgICAgIGluZGV4TmFtZTogJ3JldmFsaWRhdGUnLFxuICAgICAgICAgIHBhcnRpdGlvbktleTogeyBuYW1lOiAncGF0aCcsIHR5cGU6IEF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICAgICAgc29ydEtleTogeyBuYW1lOiAncmV2YWxpZGF0ZWRBdCcsIHR5cGU6IEF0dHJpYnV0ZVR5cGUuTlVNQkVSIH0sXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgICAgcmVtb3ZhbFBvbGljeTogUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIFRoaXMgZnVuY3Rpb24gd2lsbCBpbnNlcnQgdGhlIGluaXRpYWwgYmF0Y2ggb2YgdGFnIC8gcGF0aCAvIHJldmFsaWRhdGlvbiBkYXRhIGludG8gdGhlIER5bmFtb0RCIHRhYmxlIGR1cmluZyBkZXBsb3ltZW50LlxuICAgKiBAc2VlOiB7QGxpbmsgaHR0cHM6Ly9vcGVuLW5leHQuanMub3JnL2lubmVyX3dvcmtpbmdzL2lzciN0YWdzfVxuICAgKlxuICAgKiBAcGFyYW0gcmV2YWxpZGF0aW9uVGFibGUgdGFibGUgdG8gZ3JhbnQgZnVuY3Rpb24gYWNjZXNzIHRvXG4gICAqIEByZXR1cm5zIHRoZSByZXZhbGlkYXRpb24gaW5zZXJ0IHByb3ZpZGVyIGZ1bmN0aW9uXG4gICAqL1xuICBwcml2YXRlIGNyZWF0ZVJldmFsaWRhdGlvbkluc2VydEZ1bmN0aW9uKHJldmFsaWRhdGlvblRhYmxlOiBUYWJsZSkge1xuICAgIGNvbnN0IGR5bmFtb2RiUHJvdmlkZXJQYXRoID0gdGhpcy5wcm9wcy5uZXh0QnVpbGQubmV4dFJldmFsaWRhdGVEeW5hbW9EQlByb3ZpZGVyRm5EaXI7XG5cbiAgICAvLyBub3RlIHRoZSBmdW5jdGlvbiBtYXkgbm90IGV4aXN0IC0gaXQgb25seSBleGlzdHMgaWYgdGhlcmUgYXJlIGNhY2hlIHRhZ3MgdmFsdWVzIGRlZmluZWQgaW4gTmV4dC5qcyBidWlsZCBtZXRhIGZpbGVzIHRvIGJlIGluc2VydGVkXG4gICAgLy8gc2VlOiBodHRwczovL2dpdGh1Yi5jb20vc3N0L29wZW4tbmV4dC9ibG9iL2MyYjA1ZTNhNWY4MmRlNDBkYTExODFlMTFjMDg3MjY1OTgzYzM0OWQvcGFja2FnZXMvb3Blbi1uZXh0L3NyYy9idWlsZC50cyNMNDI2LUw0NThcbiAgICBpZiAoZnMuZXhpc3RzU3luYyhkeW5hbW9kYlByb3ZpZGVyUGF0aCkpIHtcbiAgICAgIGNvbnN0IGNvbW1vbkZuUHJvcHMgPSBnZXRDb21tb25GdW5jdGlvblByb3BzKHRoaXMpO1xuICAgICAgY29uc3QgaW5zZXJ0Rm4gPSBuZXcgTGFtYmRhRnVuY3Rpb24odGhpcywgJ0R5bmFtb0RCUHJvdmlkZXJGbicsIHtcbiAgICAgICAgLi4uY29tbW9uRm5Qcm9wcyxcbiAgICAgICAgLy8gb3Blbi1uZXh0IHJldmFsaWRhdGlvbi1mdW5jdGlvblxuICAgICAgICAvLyBzZWU6IGh0dHBzOi8vZ2l0aHViLmNvbS9zZXJ2ZXJsZXNzLXN0YWNrL29wZW4tbmV4dC9ibG9iLzI3NGQ0NDZlZDdlOTQwY2ZiZTdjZTA1YTIxMTA4ZjRjODU0ZWUzN2EvUkVBRE1FLm1kP3BsYWluPTEjTDY1XG4gICAgICAgIGNvZGU6IENvZGUuZnJvbUFzc2V0KHRoaXMucHJvcHMubmV4dEJ1aWxkLm5leHRSZXZhbGlkYXRlRHluYW1vREJQcm92aWRlckZuRGlyKSxcbiAgICAgICAgaGFuZGxlcjogJ2luZGV4LmhhbmRsZXInLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ05leHQuanMgUmV2YWxpZGF0aW9uIER5bmFtb0RCIFByb3ZpZGVyJyxcbiAgICAgICAgdGltZW91dDogRHVyYXRpb24ubWludXRlcygxKSxcbiAgICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgICBDQUNIRV9EWU5BTU9fVEFCTEU6IHJldmFsaWRhdGlvblRhYmxlLnRhYmxlTmFtZSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuXG4gICAgICByZXZhbGlkYXRpb25UYWJsZS5ncmFudFJlYWRXcml0ZURhdGEoaW5zZXJ0Rm4pO1xuXG4gICAgICBjb25zdCBwcm92aWRlciA9IG5ldyBQcm92aWRlcih0aGlzLCAnRHluYW1vREJQcm92aWRlcicsIHtcbiAgICAgICAgb25FdmVudEhhbmRsZXI6IGluc2VydEZuLFxuICAgICAgICBsb2dSZXRlbnRpb246IFJldGVudGlvbkRheXMuT05FX0RBWSxcbiAgICAgIH0pO1xuXG4gICAgICBuZXcgQ3VzdG9tUmVzb3VyY2UodGhpcywgJ0R5bmFtb0RCUmVzb3VyY2UnLCB7XG4gICAgICAgIHNlcnZpY2VUb2tlbjogcHJvdmlkZXIuc2VydmljZVRva2VuLFxuICAgICAgICBwcm9wZXJ0aWVzOiB7XG4gICAgICAgICAgdmVyc2lvbjogRGF0ZS5ub3coKS50b1N0cmluZygpLFxuICAgICAgICB9LFxuICAgICAgfSk7XG5cbiAgICAgIHJldHVybiBpbnNlcnRGbjtcbiAgICB9XG5cbiAgICByZXR1cm4gdW5kZWZpbmVkO1xuICB9XG59XG4iXX0=