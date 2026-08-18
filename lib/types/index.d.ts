/**
 * dsh-usage-dashboard host half.
 *
 * Serves the DeepSeek account balance (official `GET /user/balance`) to the
 * browser panel through a `webServer` prefix route, and exposes the same
 * query to the agent as the `dev_usage_balance` tool. The API key never
 * leaves the host: the panel only ever sees the query result.
 *
 * Route contract (all GET, JSON):
 *   /dsh-usage/api/balance  →  balance + platform usage link + key state
 *   anything else           →  404 { ok: false, error }
 */
import type { Context } from 'cordis';
import type { IncomingMessage, ServerResponse } from 'node:http';
import z from 'schemastery';
export declare const name = "dsh-usage-dashboard";
export declare const inject: string[];
/**
 * Structurally-typed host surface this plugin touches. External packages do
 * not inherit the harness's cordis declaration merging, so the touched
 * services are typed in place (the dsh-market pattern).
 */
interface HostSurface {
    webServer: {
        register(route: {
            kind: 'prefix';
            path: string;
            handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;
        }): () => void;
    };
    credentials: {
        resolve(ref: string): Promise<{
            value: string;
            source: string;
        } | undefined>;
    };
    tools: {
        register(tool: unknown): () => void;
    };
}
type PluginContext = Context & HostSurface;
export interface Config {
    /** Credential reference holding the DeepSeek API key. */
    keyRef: string;
    /** API base; the balance endpoint appends `/user/balance`. */
    baseURL: string;
    /** Platform usage page the panel links out to. */
    platformUsageURL: string;
    /** Balance request timeout. */
    timeoutMs: number;
}
export declare const Config: z<Schemastery.ObjectS<{
    keyRef: z<string, string>;
    baseURL: z<string, string>;
    platformUsageURL: z<string, string>;
    timeoutMs: z<number, number>;
}>, Schemastery.ObjectT<{
    keyRef: z<string, string>;
    baseURL: z<string, string>;
    platformUsageURL: z<string, string>;
    timeoutMs: z<number, number>;
}>>;
export declare function apply(ctx: PluginContext, config: Config): void;
export {};
