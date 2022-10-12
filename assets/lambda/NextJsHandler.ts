// based on:
// - https://github.com/iiroj/iiro.fi/commit/bd43222032d0dbb765e1111825f64dbb5db851d9
// - https://github.com/sladg/nextjs-lambda/blob/master/lib/standalone/server-handler.ts

import fs from 'node:fs';
import path from 'node:path';
import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import type { NextConfig } from 'next';
import { NodeNextRequest, NodeNextResponse } from 'next/dist/server/base-http/node';
import type { NodeRequestHandler, Options } from 'next/dist/server/next-server';
import * as nss from 'next/dist/server/next-server';
// import { convertRequest, convertResponse, makeResponse } from './LambdaNextCompat';
import slsHttp from 'serverless-http';
import { ServerResponse } from 'node:http';

const getErrMessage = (e: any) => ({ message: 'Server failed to respond.', details: e });

// invoked by Lambda URL; the format is the same as API Gateway v2
// https://docs.aws.amazon.com/lambda/latest/dg/urls-invocation.html#urls-payloads
type LambdaUrlFunctionHandler = APIGatewayProxyHandlerV2;

// somehow the default export gets buried inside itself...
const NextNodeServer: typeof nss.default = (nss.default as any)?.default ?? nss.default;

// load config
const nextDir = path.join(__dirname, '.next');
const requiredServerFilesPath = path.join(nextDir, 'required-server-files.json');
const json = fs.readFileSync(requiredServerFilesPath, 'utf-8');
const requiredServerFiles = JSON.parse(json) as { version: number; config: NextConfig };
const config: Options = {
  // Next.js compression should be disabled because of a bug
  // in the bundled `compression` package. See:
  // https://github.com/vercel/next.js/issues/11669
  conf: { ...requiredServerFiles.config, compress: false },
  customServer: false,
  dev: false,
  dir: __dirname,
  minimalMode: true,
};

// next request handler
const nextHandler = new NextNodeServer(config).getRequestHandler();

// wrap next request handler with serverless-http
// to translate from API Gateway v2 to next request/response
const server = slsHttp(
  async (req: any, res: ServerResponse) => {
    await nextHandler(req, res).catch((e) => {
      console.error(`NextJS request failed due to:`);
      console.error(e);

      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(getErrMessage(e), null, 3));
    });
  },
  {
    binary: false,
    provider: 'aws',
  }
);

export const handler: LambdaUrlFunctionHandler = server;

// export const handler: LambdaUrlFunctionHandler = async (event, context, callback) => {
//   // const { req, res, responsePromise } = reqResMapper(event, callback);
//   // convert from lambda event to node incoming message
//   // const req = convertRequest(event);

//   // response object
//   // const res = makeResponse(req);

//   if (!requestHandler) {
//     const nextDir = path.join(__dirname, '.next');
//     const requiredServerFilesPath = path.join(nextDir, 'required-server-files.json');
//     const json = await fs.readFile(requiredServerFilesPath, 'utf-8');
//     const requiredServerFiles = JSON.parse(json) as { version: number; config: NextConfig };

//     requestHandler = new NextNodeServer({
//       // Next.js compression should be disabled because of a bug
//       // in the bundled `compression` package. See:
//       // https://github.com/vercel/next.js/issues/11669
//       conf: { ...requiredServerFiles.config, compress: false },
//       customServer: false,
//       dev: false,
//       dir: __dirname,
//       minimalMode: true,
//     }).getRequestHandler();
//   }

//   const nextRequest = new NodeNextRequest(req);
//   const nextResponse = new NodeNextResponse(res);

//   await requestHandler(nextRequest, nextResponse);

//   return convertResponse(nextResponse);
// };
