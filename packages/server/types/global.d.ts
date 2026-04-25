// Minimal ambient declarations for third-party packages that don't ship their
// own types in this workspace. Each module is kept intentionally loose — callers
// should add inline types when stronger guarantees are needed.

// express: the project pulls in `@types/express-serve-static-core` transitively
// but not `@types/express`. Re-export the core types under the 'express' name
// so our route handlers stay typed.
declare module 'express' {
    import type {
        Application as CoreApplication,
        Request as CoreRequest,
        Response as CoreResponse,
        NextFunction as CoreNextFunction,
        RequestHandler as CoreRequestHandler,
    } from 'express-serve-static-core';
    export type Application = CoreApplication;
    export type Request = CoreRequest;
    export type Response = CoreResponse;
    export type NextFunction = CoreNextFunction;
    export type RequestHandler = CoreRequestHandler;
    export interface Express extends Application {}
    function express(): Application;
    namespace express {
        function json(options?: { limit?: string }): RequestHandler;
        function urlencoded(options?: { limit?: string; extended?: boolean }): RequestHandler;
    }
    export default express;
}

declare module 'request' {
    type RequestOptions = {
        url: string;
        method?: string;
        headers?: Record<string, string>;
    };
    type RequestFn = (options: RequestOptions) => NodeJS.ReadWriteStream;
    const request: RequestFn;
    export = request;
}
declare module 'node-fetch';
declare module 'node-schedule';
// `flexsearch` ships its own types (node_modules/flexsearch/index.d.ts); no custom
// declaration here. Callers use the module's own types directly.
declare module 'jsforce' {
    export class OAuth2 {
        constructor(options: {
            clientId?: string;
            clientSecret?: string;
            redirectUri?: string;
            loginUrl?: string;
        });
    }
    export class Connection {
        constructor(options: { oauth2?: OAuth2 });
        accessToken?: string;
        instanceUrl?: string;
        refreshToken?: string;
        authorize(code: string): Promise<{ url: string; [key: string]: unknown }>;
    }
    const jsforce: { OAuth2: typeof OAuth2; Connection: typeof Connection };
    export default jsforce;
}
declare module 'serve-handler';
declare module 'lwr';
