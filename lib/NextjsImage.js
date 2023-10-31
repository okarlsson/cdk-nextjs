"use strict";
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.NextjsImage = void 0;
const JSII_RTTI_SYMBOL_1 = Symbol.for("jsii.rtti");
const aws_lambda_1 = require("aws-cdk-lib/aws-lambda");
const common_lambda_props_1 = require("./utils/common-lambda-props");
/**
 * This lambda handles image optimization.
 */
class NextjsImage extends aws_lambda_1.Function {
    constructor(scope, id, props) {
        const { lambdaOptions, bucket } = props;
        const commonFnProps = (0, common_lambda_props_1.getCommonFunctionProps)(scope);
        super(scope, id, {
            ...commonFnProps,
            code: aws_lambda_1.Code.fromAsset(props.nextBuild.nextImageFnDir),
            handler: 'index.handler',
            description: 'Next.js Image Optimization Function',
            ...lambdaOptions,
            environment: {
                BUCKET_NAME: bucket.bucketName,
                ...lambdaOptions?.environment,
            },
        });
        bucket.grantRead(this);
    }
}
_a = JSII_RTTI_SYMBOL_1;
NextjsImage[_a] = { fqn: "cdk-nextjs-standalone.NextjsImage", version: "0.0.0" };
exports.NextjsImage = NextjsImage;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTmV4dGpzSW1hZ2UuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvTmV4dGpzSW1hZ2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFBQSx1REFBMkY7QUFLM0YscUVBQXFFO0FBaUJyRTs7R0FFRztBQUNILE1BQWEsV0FBWSxTQUFRLHFCQUFjO0lBQzdDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBdUI7UUFDL0QsTUFBTSxFQUFFLGFBQWEsRUFBRSxNQUFNLEVBQUUsR0FBRyxLQUFLLENBQUM7UUFFeEMsTUFBTSxhQUFhLEdBQUcsSUFBQSw0Q0FBc0IsRUFBQyxLQUFLLENBQUMsQ0FBQztRQUNwRCxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRTtZQUNmLEdBQUcsYUFBYTtZQUNoQixJQUFJLEVBQUUsaUJBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxjQUFjLENBQUM7WUFDcEQsT0FBTyxFQUFFLGVBQWU7WUFDeEIsV0FBVyxFQUFFLHFDQUFxQztZQUNsRCxHQUFHLGFBQWE7WUFDaEIsV0FBVyxFQUFFO2dCQUNYLFdBQVcsRUFBRSxNQUFNLENBQUMsVUFBVTtnQkFDOUIsR0FBRyxhQUFhLEVBQUUsV0FBVzthQUM5QjtTQUNGLENBQUMsQ0FBQztRQUVILE1BQU0sQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDekIsQ0FBQzs7OztBQWxCVSxrQ0FBVyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IENvZGUsIEZ1bmN0aW9uIGFzIExhbWJkYUZ1bmN0aW9uLCBGdW5jdGlvbk9wdGlvbnMgfSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbGFtYmRhJztcbmltcG9ydCB7IElCdWNrZXQgfSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtczMnO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5pbXBvcnQgeyBOZXh0anNCYXNlUHJvcHMgfSBmcm9tICcuL05leHRqc0Jhc2UnO1xuaW1wb3J0IHR5cGUgeyBOZXh0anNCdWlsZCB9IGZyb20gJy4vTmV4dGpzQnVpbGQnO1xuaW1wb3J0IHsgZ2V0Q29tbW9uRnVuY3Rpb25Qcm9wcyB9IGZyb20gJy4vdXRpbHMvY29tbW9uLWxhbWJkYS1wcm9wcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgTmV4dGpzSW1hZ2VQcm9wcyBleHRlbmRzIE5leHRqc0Jhc2VQcm9wcyB7XG4gIC8qKlxuICAgKiBUaGUgUzMgYnVja2V0IGhvbGRpbmcgYXBwbGljYXRpb24gaW1hZ2VzLlxuICAgKi9cbiAgcmVhZG9ubHkgYnVja2V0OiBJQnVja2V0O1xuICAvKipcbiAgICogT3ZlcnJpZGUgZnVuY3Rpb24gcHJvcGVydGllcy5cbiAgICovXG4gIHJlYWRvbmx5IGxhbWJkYU9wdGlvbnM/OiBGdW5jdGlvbk9wdGlvbnM7XG4gIC8qKlxuICAgKiBUaGUgYE5leHRqc0J1aWxkYCBpbnN0YW5jZSByZXByZXNlbnRpbmcgdGhlIGJ1aWx0IE5leHRqcyBhcHBsaWNhdGlvbi5cbiAgICovXG4gIHJlYWRvbmx5IG5leHRCdWlsZDogTmV4dGpzQnVpbGQ7XG59XG5cbi8qKlxuICogVGhpcyBsYW1iZGEgaGFuZGxlcyBpbWFnZSBvcHRpbWl6YXRpb24uXG4gKi9cbmV4cG9ydCBjbGFzcyBOZXh0anNJbWFnZSBleHRlbmRzIExhbWJkYUZ1bmN0aW9uIHtcbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IE5leHRqc0ltYWdlUHJvcHMpIHtcbiAgICBjb25zdCB7IGxhbWJkYU9wdGlvbnMsIGJ1Y2tldCB9ID0gcHJvcHM7XG5cbiAgICBjb25zdCBjb21tb25GblByb3BzID0gZ2V0Q29tbW9uRnVuY3Rpb25Qcm9wcyhzY29wZSk7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCB7XG4gICAgICAuLi5jb21tb25GblByb3BzLFxuICAgICAgY29kZTogQ29kZS5mcm9tQXNzZXQocHJvcHMubmV4dEJ1aWxkLm5leHRJbWFnZUZuRGlyKSxcbiAgICAgIGhhbmRsZXI6ICdpbmRleC5oYW5kbGVyJyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnTmV4dC5qcyBJbWFnZSBPcHRpbWl6YXRpb24gRnVuY3Rpb24nLFxuICAgICAgLi4ubGFtYmRhT3B0aW9ucyxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIEJVQ0tFVF9OQU1FOiBidWNrZXQuYnVja2V0TmFtZSxcbiAgICAgICAgLi4ubGFtYmRhT3B0aW9ucz8uZW52aXJvbm1lbnQsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgYnVja2V0LmdyYW50UmVhZCh0aGlzKTtcbiAgfVxufVxuIl19