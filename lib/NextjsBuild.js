"use strict";
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.NextjsBuild = void 0;
const JSII_RTTI_SYMBOL_1 = Symbol.for("jsii.rtti");
const child_process_1 = require("child_process");
const fs = require("fs");
const path = require("path");
const aws_cdk_lib_1 = require("aws-cdk-lib");
const constructs_1 = require("constructs");
const constants_1 = require("./constants");
const NextjsBucketDeployment_1 = require("./NextjsBucketDeployment");
const list_directories_1 = require("./utils/list-directories");
/**
 * Build Next.js app.
 */
class NextjsBuild extends constructs_1.Construct {
    /**
     * Contains server code and dependencies.
     */
    get nextServerFnDir() {
        const dir = path.join(this.getNextBuildDir(), constants_1.NEXTJS_BUILD_SERVER_FN_DIR);
        this.warnIfMissing(dir);
        return dir;
    }
    /**
     * Contains function for processessing image requests.
     * Should be arm64.
     */
    get nextImageFnDir() {
        const fnPath = path.join(this.getNextBuildDir(), constants_1.NEXTJS_BUILD_IMAGE_FN_DIR);
        this.warnIfMissing(fnPath);
        return fnPath;
    }
    /**
     * Contains function for processing items from revalidation queue.
     */
    get nextRevalidateFnDir() {
        const fnPath = path.join(this.getNextBuildDir(), constants_1.NEXTJS_BUILD_REVALIDATE_FN_DIR);
        this.warnIfMissing(fnPath);
        return fnPath;
    }
    /**
     * Contains function for inserting revalidation items into the table.
     */
    get nextRevalidateDynamoDBProviderFnDir() {
        const fnPath = path.join(this.getNextBuildDir(), constants_1.NEXTJS_BUILD_DYNAMODB_PROVIDER_FN_DIR);
        this.warnIfMissing(fnPath);
        return fnPath;
    }
    /**
     * Static files containing client-side code.
     */
    get nextStaticDir() {
        const dir = path.join(this.getNextBuildDir(), constants_1.NEXTJS_STATIC_DIR);
        this.warnIfMissing(dir);
        return dir;
    }
    /**
     * Cache directory for generated data.
     */
    get nextCacheDir() {
        const dir = path.join(this.getNextBuildDir(), constants_1.NEXTJS_CACHE_DIR);
        this.warnIfMissing(dir);
        return dir;
    }
    constructor(scope, id, props) {
        super(scope, id);
        this.props = props;
        this.validatePaths();
        // when `cdk deploy "NonNextjsStack" --exclusively` is run, don't run build
        if (aws_cdk_lib_1.Stack.of(this).bundlingRequired && !this.props.skipBuild) {
            this.build();
        }
    }
    /**
     * Validate required paths/files for NextjsBuild
     */
    validatePaths() {
        const nextjsPath = this.props.nextjsPath;
        // validate site path exists
        if (!fs.existsSync(nextjsPath)) {
            throw new Error(`Invalid nextjsPath ${nextjsPath} - directory does not exist at "${path.resolve(nextjsPath)}"`);
        }
        // Ensure that the site has a build script defined
        if (!fs.existsSync(path.join(nextjsPath, 'package.json'))) {
            throw new Error(`No package.json found at "${nextjsPath}".`);
        }
        const packageJson = JSON.parse(fs.readFileSync(path.join(nextjsPath, 'package.json'), 'utf8'));
        if (!packageJson.scripts || !packageJson.scripts.build) {
            throw new Error(`No "build" script found within package.json in "${nextjsPath}".`);
        }
    }
    build() {
        const buildPath = this.props.buildPath ?? this.props.nextjsPath;
        const buildCommand = this.props.buildCommand ?? 'npx open-next@^2 build';
        // run build
        if (!this.props.quiet) {
            console.debug(`├ Running "${buildCommand}" in`, buildPath);
        }
        // will throw if build fails - which is desired
        (0, child_process_1.execSync)(buildCommand, {
            cwd: buildPath,
            stdio: this.props.quiet ? 'ignore' : 'inherit',
            env: this.getBuildEnvVars(),
        });
    }
    /**
     * Gets environment variables for build time (when `open-next build` is called).
     * Unresolved tokens are replace with placeholders like {{ TOKEN_NAME }} and
     * will be resolved later in `NextjsBucketDeployment` custom resource.
     */
    getBuildEnvVars() {
        const env = {};
        for (const [k, v] of Object.entries(process.env)) {
            if (v) {
                env[k] = v;
            }
        }
        for (const [k, v] of Object.entries(this.props.environment || {})) {
            // don't replace server only env vars for static assets
            if (aws_cdk_lib_1.Token.isUnresolved(v) && k.startsWith('NEXT_PUBLIC_')) {
                env[k] = NextjsBucketDeployment_1.NextjsBucketDeployment.getSubstitutionValue(k);
            }
            else {
                env[k] = v;
            }
        }
        return env;
    }
    readPublicFileList() {
        if (!fs.existsSync(this.nextStaticDir))
            return [];
        return (0, list_directories_1.listDirectory)(this.nextStaticDir).map((file) => path.join('/', path.relative(this.nextStaticDir, file)));
    }
    getNextBuildDir() {
        const dir = path.resolve(this.props.nextjsPath, constants_1.NEXTJS_BUILD_DIR);
        this.warnIfMissing(dir);
        return dir;
    }
    warnIfMissing(dir) {
        if (!fs.existsSync(dir)) {
            console.warn(`Warning: ${dir} does not exist.`);
        }
    }
}
_a = JSII_RTTI_SYMBOL_1;
NextjsBuild[_a] = { fqn: "cdk-nextjs-standalone.NextjsBuild", version: "0.0.0" };
exports.NextjsBuild = NextjsBuild;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTmV4dGpzQnVpbGQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvTmV4dGpzQnVpbGQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFBQSxpREFBeUM7QUFDekMseUJBQXlCO0FBQ3pCLDZCQUE2QjtBQUM3Qiw2Q0FBMkM7QUFDM0MsMkNBQXVDO0FBQ3ZDLDJDQVFxQjtBQUVyQixxRUFBa0U7QUFDbEUsK0RBQXlEO0FBU3pEOztHQUVHO0FBQ0gsTUFBYSxXQUFZLFNBQVEsc0JBQVM7SUFDeEM7O09BRUc7SUFDSCxJQUFXLGVBQWU7UUFDeEIsTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsZUFBZSxFQUFFLEVBQUUsc0NBQTBCLENBQUMsQ0FBQztRQUMxRSxJQUFJLENBQUMsYUFBYSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ3hCLE9BQU8sR0FBRyxDQUFDO0lBQ2IsQ0FBQztJQUNEOzs7T0FHRztJQUNILElBQVcsY0FBYztRQUN2QixNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxlQUFlLEVBQUUsRUFBRSxxQ0FBeUIsQ0FBQyxDQUFDO1FBQzVFLElBQUksQ0FBQyxhQUFhLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDM0IsT0FBTyxNQUFNLENBQUM7SUFDaEIsQ0FBQztJQUNEOztPQUVHO0lBQ0gsSUFBVyxtQkFBbUI7UUFDNUIsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsZUFBZSxFQUFFLEVBQUUsMENBQThCLENBQUMsQ0FBQztRQUNqRixJQUFJLENBQUMsYUFBYSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQzNCLE9BQU8sTUFBTSxDQUFDO0lBQ2hCLENBQUM7SUFDRDs7T0FFRztJQUNILElBQVcsbUNBQW1DO1FBQzVDLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLGVBQWUsRUFBRSxFQUFF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SUFBSSxDQUFDLGFBQWEsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDbEgsQ0FBQztJQUVPLGVBQWU7UUFDckIsTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLFVBQVUsRUFBRSw0QkFBZ0IsQ0FBQyxDQUFDO1FBQ2xFLElBQUksQ0FBQyxhQUFhLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDeEIsT0FBTyxHQUFHLENBQUM7SUFDYixDQUFDO0lBRU8sYUFBYSxDQUFDLEdBQVc7UUFDL0IsSUFBSSxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLEVBQUU7WUFDdkIsT0FBTyxDQUFDLElBQUksQ0FBQyxZQUFZLEdBQUcsa0JBQWtCLENBQUMsQ0FBQztTQUNqRDtJQUNILENBQUM7Ozs7QUF2SVUsa0NBQVciLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBleGVjU3luYyB9IGZyb20gJ2NoaWxkX3Byb2Nlc3MnO1xuaW1wb3J0ICogYXMgZnMgZnJvbSAnZnMnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcbmltcG9ydCB7IFN0YWNrLCBUb2tlbiB9IGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0IHtcbiAgTkVYVEpTX0JVSUxEX0RJUixcbiAgTkVYVEpTX0JVSUxEX0lNQUdFX0ZOX0RJUixcbiAgTkVYVEpTX0JVSUxEX1JFVkFMSURBVEVfRk5fRElSLFxuICBORVhUSlNfQlVJTERfU0VSVkVSX0ZOX0RJUixcbiAgTkVYVEpTX1NUQVRJQ19ESVIsXG4gIE5FWFRKU19DQUNIRV9ESVIsXG4gIE5FWFRKU19CVUlMRF9EWU5BTU9EQl9QUk9WSURFUl9GTl9ESVIsXG59IGZyb20gJy4vY29uc3RhbnRzJztcbmltcG9ydCB7IE5leHRqc0Jhc2VQcm9wcyB9IGZyb20gJy4vTmV4dGpzQmFzZSc7XG5pbXBvcnQgeyBOZXh0anNCdWNrZXREZXBsb3ltZW50IH0gZnJvbSAnLi9OZXh0anNCdWNrZXREZXBsb3ltZW50JztcbmltcG9ydCB7IGxpc3REaXJlY3RvcnkgfSBmcm9tICcuL3V0aWxzL2xpc3QtZGlyZWN0b3JpZXMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIE5leHRqc0J1aWxkUHJvcHMgZXh0ZW5kcyBOZXh0anNCYXNlUHJvcHMge1xuICAvKipcbiAgICogQHNlZSBgTmV4dGpzUHJvcHMuc2tpcEJ1aWxkYFxuICAgKi9cbiAgcmVhZG9ubHkgc2tpcEJ1aWxkPzogYm9vbGVhbjtcbn1cblxuLyoqXG4gKiBCdWlsZCBOZXh0LmpzIGFwcC5cbiAqL1xuZXhwb3J0IGNsYXNzIE5leHRqc0J1aWxkIGV4dGVuZHMgQ29uc3RydWN0IHtcbiAgLyoqXG4gICAqIENvbnRhaW5zIHNlcnZlciBjb2RlIGFuZCBkZXBlbmRlbmNpZXMuXG4gICAqL1xuICBwdWJsaWMgZ2V0IG5leHRTZXJ2ZXJGbkRpcigpOiBzdHJpbmcge1xuICAgIGNvbnN0IGRpciA9IHBhdGguam9pbih0aGlzLmdldE5leHRCdWlsZERpcigpLCBORVhUSlNfQlVJTERfU0VSVkVSX0ZOX0RJUik7XG4gICAgdGhpcy53YXJuSWZNaXNzaW5nKGRpcik7XG4gICAgcmV0dXJuIGRpcjtcbiAgfVxuICAvKipcbiAgICogQ29udGFpbnMgZnVuY3Rpb24gZm9yIHByb2Nlc3Nlc3NpbmcgaW1hZ2UgcmVxdWVzdHMuXG4gICAqIFNob3VsZCBiZSBhcm02NC5cbiAgICovXG4gIHB1YmxpYyBnZXQgbmV4dEltYWdlRm5EaXIoKTogc3RyaW5nIHtcbiAgICBjb25zdCBmblBhdGggPSBwYXRoLmpvaW4odGhpcy5nZXROZXh0QnVpbGREaXIoKSwgTkVYVEpTX0JVSUxEX0lNQUdFX0ZOX0RJUik7XG4gICAgdGhpcy53YXJuSWZNaXNzaW5nKGZuUGF0aCk7XG4gICAgcmV0dXJuIGZuUGF0aDtcbiAgfVxuICAvKipcbiAgICogQ29udGFpbnMgZnVuY3Rpb24gZm9yIHByb2Nlc3NpbmcgaXRlbXMgZnJvbSByZXZhbGlkYXRpb24gcXVldWUuXG4gICAqL1xuICBwdWJsaWMgZ2V0IG5leHRSZXZhbGlkYXRlRm5EaXIoKTogc3RyaW5nIHtcbiAgICBjb25zdCBmblBhdGggPSBwYXRoLmpvaW4odGhpcy5nZXROZXh0QnVpbGREaXIoKSwgTkVYVEpTX0JVSUxEX1JFVkFMSURBVEVfRk5fRElSKTtcbiAgICB0aGlzLndhcm5JZk1pc3NpbmcoZm5QYXRoKTtcbiAgICByZXR1cm4gZm5QYXRoO1xuICB9XG4gIC8qKlxuICAgKiBDb250YWlucyBmdW5jdGlvbiBmb3IgaW5zZXJ0aW5nIHJldmFsaWRhdGlvbiBpdGVtcyBpbnRvIHRoZSB0YWJsZS5cbiAgICovXG4gIHB1YmxpYyBnZXQgbmV4dFJldmFsaWRhdGVEeW5hbW9EQlByb3ZpZGVyRm5EaXIoKTogc3RyaW5nIHtcbiAgICBjb25zdCBmblBhdGggPSBwYXRoLmpvaW4odGhpcy5nZXROZXh0QnVpbGREaXIoKSwgTkVYVEpTX0JVSUxEX0RZTkFNT0RCX1BST1ZJREVSX0ZOX0RJUik7XG4gICAgdGhpcy53YXJuSWZNaXNzaW5nKGZuUGF0aCk7XG4gICAgcmV0dXJuIGZuUGF0aDtcbiAgfVxuICAvKipcbiAgICogU3RhdGljIGZpbGVzIGNvbnRhaW5pbmcgY2xpZW50LXNpZGUgY29kZS5cbiAgICovXG4gIHB1YmxpYyBnZXQgbmV4dFN0YXRpY0RpcigpOiBzdHJpbmcge1xuICAgIGNvbnN0IGRpciA9IHBhdGguam9pbih0aGlzLmdldE5leHRCdWlsZERpcigpLCBORVhUSlNfU1RBVElDX0RJUik7XG4gICAgdGhpcy53YXJuSWZNaXNzaW5nKGRpcik7XG4gICAgcmV0dXJuIGRpcjtcbiAgfVxuICAvKipcbiAgICogQ2FjaGUgZGlyZWN0b3J5IGZvciBnZW5lcmF0ZWQgZGF0YS5cbiAgICovXG4gIHB1YmxpYyBnZXQgbmV4dENhY2hlRGlyKCk6IHN0cmluZyB7XG4gICAgY29uc3QgZGlyID0gcGF0aC5qb2luKHRoaXMuZ2V0TmV4dEJ1aWxkRGlyKCksIE5FWFRKU19DQUNIRV9ESVIpO1xuICAgIHRoaXMud2FybklmTWlzc2luZyhkaXIpO1xuICAgIHJldHVybiBkaXI7XG4gIH1cblxuICBwdWJsaWMgcHJvcHM6IE5leHRqc0J1aWxkUHJvcHM7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IE5leHRqc0J1aWxkUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuICAgIHRoaXMucHJvcHMgPSBwcm9wcztcbiAgICB0aGlzLnZhbGlkYXRlUGF0aHMoKTtcbiAgICAvLyB3aGVuIGBjZGsgZGVwbG95IFwiTm9uTmV4dGpzU3RhY2tcIiAtLWV4Y2x1c2l2ZWx5YCBpcyBydW4sIGRvbid0IHJ1biBidWlsZFxuICAgIGlmIChTdGFjay5vZih0aGlzKS5idW5kbGluZ1JlcXVpcmVkICYmICF0aGlzLnByb3BzLnNraXBCdWlsZCkge1xuICAgICAgdGhpcy5idWlsZCgpO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBWYWxpZGF0ZSByZXF1aXJlZCBwYXRocy9maWxlcyBmb3IgTmV4dGpzQnVpbGRcbiAgICovXG4gIHByaXZhdGUgdmFsaWRhdGVQYXRocygpIHtcbiAgICBjb25zdCBuZXh0anNQYXRoID0gdGhpcy5wcm9wcy5uZXh0anNQYXRoO1xuICAgIC8vIHZhbGlkYXRlIHNpdGUgcGF0aCBleGlzdHNcbiAgICBpZiAoIWZzLmV4aXN0c1N5bmMobmV4dGpzUGF0aCkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgSW52YWxpZCBuZXh0anNQYXRoICR7bmV4dGpzUGF0aH0gLSBkaXJlY3RvcnkgZG9lcyBub3QgZXhpc3QgYXQgXCIke3BhdGgucmVzb2x2ZShuZXh0anNQYXRoKX1cImApO1xuICAgIH1cbiAgICAvLyBFbnN1cmUgdGhhdCB0aGUgc2l0ZSBoYXMgYSBidWlsZCBzY3JpcHQgZGVmaW5lZFxuICAgIGlmICghZnMuZXhpc3RzU3luYyhwYXRoLmpvaW4obmV4dGpzUGF0aCwgJ3BhY2thZ2UuanNvbicpKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBObyBwYWNrYWdlLmpzb24gZm91bmQgYXQgXCIke25leHRqc1BhdGh9XCIuYCk7XG4gICAgfVxuICAgIGNvbnN0IHBhY2thZ2VKc29uID0gSlNPTi5wYXJzZShmcy5yZWFkRmlsZVN5bmMocGF0aC5qb2luKG5leHRqc1BhdGgsICdwYWNrYWdlLmpzb24nKSwgJ3V0ZjgnKSk7XG4gICAgaWYgKCFwYWNrYWdlSnNvbi5zY3JpcHRzIHx8ICFwYWNrYWdlSnNvbi5zY3JpcHRzLmJ1aWxkKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYE5vIFwiYnVpbGRcIiBzY3JpcHQgZm91bmQgd2l0aGluIHBhY2thZ2UuanNvbiBpbiBcIiR7bmV4dGpzUGF0aH1cIi5gKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGJ1aWxkKCkge1xuICAgIGNvbnN0IGJ1aWxkUGF0aCA9IHRoaXMucHJvcHMuYnVpbGRQYXRoID8/IHRoaXMucHJvcHMubmV4dGpzUGF0aDtcbiAgICBjb25zdCBidWlsZENvbW1hbmQgPSB0aGlzLnByb3BzLmJ1aWxkQ29tbWFuZCA/PyAnbnB4IG9wZW4tbmV4dEBeMiBidWlsZCc7XG4gICAgLy8gcnVuIGJ1aWxkXG4gICAgaWYgKCF0aGlzLnByb3BzLnF1aWV0KSB7XG4gICAgICBjb25zb2xlLmRlYnVnKGDilJwgUnVubmluZyBcIiR7YnVpbGRDb21tYW5kfVwiIGluYCwgYnVpbGRQYXRoKTtcbiAgICB9XG4gICAgLy8gd2lsbCB0aHJvdyBpZiBidWlsZCBmYWlscyAtIHdoaWNoIGlzIGRlc2lyZWRcbiAgICBleGVjU3luYyhidWlsZENvbW1hbmQsIHtcbiAgICAgIGN3ZDogYnVpbGRQYXRoLFxuICAgICAgc3RkaW86IHRoaXMucHJvcHMucXVpZXQgPyAnaWdub3JlJyA6ICdpbmhlcml0JyxcbiAgICAgIGVudjogdGhpcy5nZXRCdWlsZEVudlZhcnMoKSxcbiAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBHZXRzIGVudmlyb25tZW50IHZhcmlhYmxlcyBmb3IgYnVpbGQgdGltZSAod2hlbiBgb3Blbi1uZXh0IGJ1aWxkYCBpcyBjYWxsZWQpLlxuICAgKiBVbnJlc29sdmVkIHRva2VucyBhcmUgcmVwbGFjZSB3aXRoIHBsYWNlaG9sZGVycyBsaWtlIHt7IFRPS0VOX05BTUUgfX0gYW5kXG4gICAqIHdpbGwgYmUgcmVzb2x2ZWQgbGF0ZXIgaW4gYE5leHRqc0J1Y2tldERlcGxveW1lbnRgIGN1c3RvbSByZXNvdXJjZS5cbiAgICovXG4gIHByaXZhdGUgZ2V0QnVpbGRFbnZWYXJzKCkge1xuICAgIGNvbnN0IGVudjogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHt9O1xuICAgIGZvciAoY29uc3QgW2ssIHZdIG9mIE9iamVjdC5lbnRyaWVzKHByb2Nlc3MuZW52KSkge1xuICAgICAgaWYgKHYpIHtcbiAgICAgICAgZW52W2tdID0gdjtcbiAgICAgIH1cbiAgICB9XG4gICAgZm9yIChjb25zdCBbaywgdl0gb2YgT2JqZWN0LmVudHJpZXModGhpcy5wcm9wcy5lbnZpcm9ubWVudCB8fCB7fSkpIHtcbiAgICAgIC8vIGRvbid0IHJlcGxhY2Ugc2VydmVyIG9ubHkgZW52IHZhcnMgZm9yIHN0YXRpYyBhc3NldHNcbiAgICAgIGlmIChUb2tlbi5pc1VucmVzb2x2ZWQodikgJiYgay5zdGFydHNXaXRoKCdORVhUX1BVQkxJQ18nKSkge1xuICAgICAgICBlbnZba10gPSBOZXh0anNCdWNrZXREZXBsb3ltZW50LmdldFN1YnN0aXR1dGlvblZhbHVlKGspO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZW52W2tdID0gdjtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGVudjtcbiAgfVxuXG4gIHJlYWRQdWJsaWNGaWxlTGlzdCgpIHtcbiAgICBpZiAoIWZzLmV4aXN0c1N5bmModGhpcy5uZXh0U3RhdGljRGlyKSkgcmV0dXJuIFtdO1xuICAgIHJldHVybiBsaXN0RGlyZWN0b3J5KHRoaXMubmV4dFN0YXRpY0RpcikubWFwKChmaWxlKSA9PiBwYXRoLmpvaW4oJy8nLCBwYXRoLnJlbGF0aXZlKHRoaXMubmV4dFN0YXRpY0RpciwgZmlsZSkpKTtcbiAgfVxuXG4gIHByaXZhdGUgZ2V0TmV4dEJ1aWxkRGlyKCk6IHN0cmluZyB7XG4gICAgY29uc3QgZGlyID0gcGF0aC5yZXNvbHZlKHRoaXMucHJvcHMubmV4dGpzUGF0aCwgTkVYVEpTX0JVSUxEX0RJUik7XG4gICAgdGhpcy53YXJuSWZNaXNzaW5nKGRpcik7XG4gICAgcmV0dXJuIGRpcjtcbiAgfVxuXG4gIHByaXZhdGUgd2FybklmTWlzc2luZyhkaXI6IHN0cmluZykge1xuICAgIGlmICghZnMuZXhpc3RzU3luYyhkaXIpKSB7XG4gICAgICBjb25zb2xlLndhcm4oYFdhcm5pbmc6ICR7ZGlyfSBkb2VzIG5vdCBleGlzdC5gKTtcbiAgICB9XG4gIH1cbn1cbiJdfQ==