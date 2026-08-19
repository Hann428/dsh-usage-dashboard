import { defineTool } from '@deepseek-ai/dsh-tools';
import { credentialRef } from '@deepseek-ai/dsh-credentials';
import z from 'schemastery';
export const name = 'dsh-usage-dashboard';
export const inject = ['tools', 'webServer', 'credentials'];
export const Config = z.object({
    keyRef: z.string().default('DEEPSEEK_API_KEY'),
    baseURL: z.string().default('https://api.deepseek.com'),
    platformUsageURL: z.string().default('https://platform.deepseek.com/usage'),
    timeoutMs: z.number().default(10_000),
    healthCurrency: z.string().default('CNY'),
    alertBalance: z.number().min(0).default(0),
    alertBalancePercent: z.number().min(0).max(100).default(0),
    balancePercentBase: z.number().min(0).default(0),
});
const PRICING_DOCS_URL = 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing';
function sendJson(res, status, body) {
    const text = JSON.stringify(body);
    res.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
    });
    res.end(text);
}
function getBeijingClock(now = new Date()) {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Shanghai',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).formatToParts(now);
    const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0');
    const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? '0');
    return { text: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`, minutes: hour * 60 + minute };
}
function getBillingPeriod(now = new Date()) {
    const clock = getBeijingClock(now);
    const peak = (clock.minutes >= 9 * 60 && clock.minutes < 12 * 60) || (clock.minutes >= 14 * 60 && clock.minutes < 18 * 60);
    return {
        period: peak ? 'peak' : 'off_peak',
        periodLabel: peak ? '高峰时段' : '空闲时段',
        rateLabel: peak ? '全价' : '半价',
        beijingTime: clock.text,
    };
}
function textCell(value) {
    return value.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').trim();
}
function extractPricePair(html, label, periodLabel) {
    const start = html.indexOf(label);
    if (start === -1)
        return undefined;
    const slice = html.slice(start, start + 900);
    const cell = String.raw `<td(?:\s+[^>]*)?>`;
    const pattern = new RegExp(`${cell}\\s*${periodLabel}\\s*</td>\\s*${cell}\\s*([^<]+?)\\s*</td>\\s*${cell}\\s*([^<]+?)\\s*</td>`);
    const match = slice.match(pattern);
    return match === null ? undefined : { flash: textCell(match[1]), pro: textCell(match[2]) };
}
function parsePricingRows(html, period) {
    const periodLabel = period === 'peak' ? '高峰时段' : '空闲时段';
    const cacheHitInput = extractPricePair(html, '百万tokens输入（缓存命中）', periodLabel);
    const cacheMissInput = extractPricePair(html, '百万tokens输入（缓存未命中）', periodLabel);
    const output = extractPricePair(html, '百万tokens输出', periodLabel);
    if (cacheHitInput === undefined || cacheMissInput === undefined || output === undefined) {
        throw new Error('官方价格表格式未匹配');
    }
    return { cacheHitInput, cacheMissInput, output };
}
function parseAmount(value) {
    const amount = Number(value.replace(/,/g, '').trim());
    return Number.isFinite(amount) ? amount : undefined;
}
function balanceHealth(payload, config) {
    const currency = config.healthCurrency.trim().toUpperCase() || 'CNY';
    const info = payload?.balance_infos.find((entry) => entry.currency.toUpperCase() === currency);
    const amount = info === undefined ? undefined : parseAmount(info.total_balance);
    if (payload === undefined || !payload.is_available || amount === undefined) {
        return { level: 'unknown', currency, triggeredBy: [] };
    }
    const triggeredBy = [];
    if (config.alertBalance > 0 && amount < config.alertBalance) {
        triggeredBy.push('amount');
    }
    const percentBase = config.balancePercentBase > 0 ? config.balancePercentBase : undefined;
    const percent = percentBase === undefined ? undefined : amount / percentBase * 100;
    if (percent !== undefined && config.alertBalancePercent > 0 && percent < config.alertBalancePercent) {
        triggeredBy.push('percent');
    }
    return { level: triggeredBy.length > 0 ? 'warning' : 'ok', currency, amount, percent, percentBase, triggeredBy };
}
export function apply(ctx, config) {
    const ref = credentialRef(config.keyRef);
    const fetchBalance = async () => {
        try {
            const credential = await ctx.credentials.resolve(ref);
            if (credential === undefined) {
                return {
                    ok: false,
                    code: 'NO_KEY',
                    message: `${config.keyRef} 未配置（设置 → 模型 → API key）`,
                };
            }
            const response = await fetch(`${config.baseURL}/user/balance`, {
                headers: { authorization: `Bearer ${credential.value}` },
                signal: AbortSignal.timeout(config.timeoutMs),
            });
            if (!response.ok) {
                return {
                    ok: false,
                    code: `HTTP_${response.status}`,
                    message: `余额接口返回 ${response.status} ${response.statusText}`,
                };
            }
            const payload = (await response.json());
            return { ok: true, payload, source: credential.source };
        }
        catch (error) {
            return {
                ok: false,
                code: 'FETCH_FAILED',
                message: error instanceof Error ? error.message : String(error),
            };
        }
    };
    const fetchPricing = async () => {
        const period = getBillingPeriod();
        try {
            const response = await fetch(PRICING_DOCS_URL, {
                signal: AbortSignal.timeout(config.timeoutMs),
            });
            if (!response.ok) {
                return {
                    ...period,
                    docsURL: PRICING_DOCS_URL,
                    updatedAt: Date.now(),
                    error: { code: `HTTP_${response.status}`, message: `官方价格页返回 ${response.status} ${response.statusText}` },
                };
            }
            const html = await response.text();
            return {
                ...period,
                docsURL: PRICING_DOCS_URL,
                updatedAt: Date.now(),
                rows: parsePricingRows(html, period.period),
            };
        }
        catch (error) {
            return {
                ...period,
                docsURL: PRICING_DOCS_URL,
                updatedAt: Date.now(),
                error: { code: 'PRICING_FETCH_FAILED', message: error instanceof Error ? error.message : String(error) },
            };
        }
    };
    ctx.effect(() => ctx.webServer.register({
        kind: 'prefix',
        path: '/dsh-usage/api',
        handler: async (req, res) => {
            if (req.method !== 'GET') {
                sendJson(res, 405, { ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: `仅支持 GET（收到 ${req.method}）` } });
                return;
            }
            const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
            if (pathname !== '/dsh-usage/api/balance') {
                sendJson(res, 404, { ok: false, error: { code: 'NOT_FOUND', message: '未知端点' } });
                return;
            }
            const [result, pricing] = await Promise.all([fetchBalance(), fetchPricing()]);
            sendJson(res, 200, {
                ok: true,
                ts: Date.now(),
                keyRef: config.keyRef,
                baseURL: config.baseURL,
                platformUsageURL: config.platformUsageURL,
                pricing,
                ...(result.ok
                    ? { configured: true, balance: result.payload, source: result.source, health: balanceHealth(result.payload, config) }
                    : { configured: false, health: balanceHealth(undefined, config), error: { code: result.code, message: result.message } }),
            });
        },
    }), 'dsh-usage-dashboard: api route');
    ctx.effect(() => ctx.tools.register(defineTool({
        name: 'dev_usage_balance',
        description: '查询 DeepSeek 账户余额（官方 GET /user/balance）与平台用量页地址。',
        parameters: {},
        output: {
            schema: { type: 'string' },
            render: (_args, value) => [{ type: 'text', text: String(value) }],
        },
        async execute() {
            const result = await fetchBalance();
            const pricing = await fetchPricing();
            const lines = [`平台用量页: ${config.platformUsageURL}`, `Key: ${config.keyRef}`, `当前计费: ${pricing.periodLabel}（${pricing.rateLabel}，北京时间 ${pricing.beijingTime}）`];
            if (pricing.rows !== undefined) {
                lines.push(`当前官方价格: Flash 命中/未命中/输出 ${pricing.rows.cacheHitInput.flash}/${pricing.rows.cacheMissInput.flash}/${pricing.rows.output.flash}；Pro ${pricing.rows.cacheHitInput.pro}/${pricing.rows.cacheMissInput.pro}/${pricing.rows.output.pro}`);
            }
            if (!result.ok) {
                lines.push(`查询失败 [${result.code}]: ${result.message}`);
            }
            else {
                lines.push(`账户可用: ${result.payload.is_available ? '是' : '否'}`);
                const health = balanceHealth(result.payload, config);
                lines.push(`余额灯: ${health.level === 'warning' ? '告警' : health.level === 'ok' ? '正常' : '未知'}（${health.currency}）`);
                for (const info of result.payload.balance_infos) {
                    lines.push(`${info.currency}: 总额 ${info.total_balance}（赠送 ${info.granted_balance} / 充值 ${info.topped_up_balance}）`);
                }
            }
            return lines.join('\n');
        },
    })), 'dsh-usage-dashboard: balance tool');
}
//# sourceMappingURL=index.js.map