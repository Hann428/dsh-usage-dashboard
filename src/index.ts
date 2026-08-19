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
import type { Context } from 'cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import z from 'schemastery'

export const name = 'dsh-usage-dashboard'
export const inject = ['tools', 'webServer', 'credentials']

/**
 * Structurally-typed host surface this plugin touches. External packages do
 * not inherit the harness's cordis declaration merging, so the touched
 * services are typed in place (the dsh-market pattern).
 */
interface HostSurface {
  webServer: {
    register(route: {
      kind: 'prefix'
      path: string
      handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
    }): () => void
  }
  credentials: {
    resolve(ref: string): Promise<{ value: string; source: string } | undefined>
  }
  tools: {
    register(tool: unknown): () => void
  }
}

type PluginContext = Context & HostSurface

export interface Config {
  /** Credential reference holding the DeepSeek API key. */
  keyRef: string
  /** API base; the balance endpoint appends `/user/balance`. */
  baseURL: string
  /** Platform usage page the panel links out to. */
  platformUsageURL: string
  /** Balance request timeout. */
  timeoutMs: number
  /** Balance currency used by the health indicator. */
  healthCurrency: string
  /** Orange-light threshold; 0 disables the amount check. */
  alertBalance: number
  /** Orange-light percentage threshold; 0 disables the percentage check. */
  alertBalancePercent: number
  /** Balance value treated as 100% for percentage checks. */
  balancePercentBase: number
}

export const Config = z.object({
  keyRef: z.string().default('DEEPSEEK_API_KEY'),
  baseURL: z.string().default('https://api.deepseek.com'),
  platformUsageURL: z.string().default('https://platform.deepseek.com/usage'),
  timeoutMs: z.number().default(10_000),
  healthCurrency: z.string().default('CNY'),
  alertBalance: z.number().min(0).default(0),
  alertBalancePercent: z.number().min(0).max(100).default(0),
  balancePercentBase: z.number().min(0).default(0),
})

interface BalanceInfo {
  currency: string
  total_balance: string
  granted_balance: string
  topped_up_balance: string
}

interface BalancePayload {
  is_available: boolean
  balance_infos: BalanceInfo[]
}

type BalanceResult =
  | { ok: true; payload: BalancePayload; source: string }
  | { ok: false; code: string; message: string }

type BillingPeriod = 'peak' | 'off_peak'

interface PricePair {
  flash: string
  pro: string
}

interface PricingInfo {
  period: BillingPeriod
  periodLabel: string
  rateLabel: string
  beijingTime: string
  docsURL: string
  updatedAt: number
  rows?: {
    cacheHitInput: PricePair
    cacheMissInput: PricePair
    output: PricePair
  }
  error?: { code: string; message: string }
}

interface BalanceHealth {
  level: 'ok' | 'warning' | 'unknown'
  currency: string
  amount?: number
  percent?: number
  percentBase?: number
  triggeredBy: ('amount' | 'percent')[]
}

const PRICING_DOCS_URL = 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing'

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(text)
}

function getBeijingClock(now = new Date()): { text: string; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now)
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0')
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? '0')
  return { text: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`, minutes: hour * 60 + minute }
}

function getBillingPeriod(now = new Date()): Pick<PricingInfo, 'period' | 'periodLabel' | 'rateLabel' | 'beijingTime'> {
  const clock = getBeijingClock(now)
  const peak = (clock.minutes >= 9 * 60 && clock.minutes < 12 * 60) || (clock.minutes >= 14 * 60 && clock.minutes < 18 * 60)
  return {
    period: peak ? 'peak' : 'off_peak',
    periodLabel: peak ? '高峰时段' : '空闲时段',
    rateLabel: peak ? '全价' : '半价',
    beijingTime: clock.text,
  }
}

function textCell(value: string): string {
  return value.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').trim()
}

function extractPricePair(html: string, label: string, periodLabel: string): PricePair | undefined {
  const start = html.indexOf(label)
  if (start === -1) return undefined
  const slice = html.slice(start, start + 900)
  const cell = String.raw`<td(?:\s+[^>]*)?>`
  const pattern = new RegExp(`${cell}\\s*${periodLabel}\\s*</td>\\s*${cell}\\s*([^<]+?)\\s*</td>\\s*${cell}\\s*([^<]+?)\\s*</td>`)
  const match = slice.match(pattern)
  return match === null ? undefined : { flash: textCell(match[1]), pro: textCell(match[2]) }
}

function parsePricingRows(html: string, period: BillingPeriod): PricingInfo['rows'] {
  const periodLabel = period === 'peak' ? '高峰时段' : '空闲时段'
  const cacheHitInput = extractPricePair(html, '百万tokens输入（缓存命中）', periodLabel)
  const cacheMissInput = extractPricePair(html, '百万tokens输入（缓存未命中）', periodLabel)
  const output = extractPricePair(html, '百万tokens输出', periodLabel)
  if (cacheHitInput === undefined || cacheMissInput === undefined || output === undefined) {
    throw new Error('官方价格表格式未匹配')
  }
  return { cacheHitInput, cacheMissInput, output }
}

function parseAmount(value: string): number | undefined {
  const amount = Number(value.replace(/,/g, '').trim())
  return Number.isFinite(amount) ? amount : undefined
}

function balanceHealth(payload: BalancePayload | undefined, config: Config): BalanceHealth {
  const currency = config.healthCurrency.trim().toUpperCase() || 'CNY'
  const info = payload?.balance_infos.find((entry) => entry.currency.toUpperCase() === currency)
  const amount = info === undefined ? undefined : parseAmount(info.total_balance)
  if (payload === undefined || !payload.is_available || amount === undefined) {
    return { level: 'unknown', currency, triggeredBy: [] }
  }
  const triggeredBy: ('amount' | 'percent')[] = []
  if (config.alertBalance > 0 && amount < config.alertBalance) {
    triggeredBy.push('amount')
  }
  const percentBase = config.balancePercentBase > 0 ? config.balancePercentBase : undefined
  const percent = percentBase === undefined ? undefined : amount / percentBase * 100
  if (percent !== undefined && config.alertBalancePercent > 0 && percent < config.alertBalancePercent) {
    triggeredBy.push('percent')
  }
  return { level: triggeredBy.length > 0 ? 'warning' : 'ok', currency, amount, percent, percentBase, triggeredBy }
}

export function apply(ctx: PluginContext, config: Config): void {
  const ref = credentialRef(config.keyRef)

  const fetchBalance = async (): Promise<BalanceResult> => {
    try {
      const credential = await ctx.credentials.resolve(ref)
      if (credential === undefined) {
        return {
          ok: false,
          code: 'NO_KEY',
          message: `${config.keyRef} 未配置（设置 → 模型 → API key）`,
        }
      }
      const response = await fetch(`${config.baseURL}/user/balance`, {
        headers: { authorization: `Bearer ${credential.value}` },
        signal: AbortSignal.timeout(config.timeoutMs),
      })
      if (!response.ok) {
        return {
          ok: false,
          code: `HTTP_${response.status}`,
          message: `余额接口返回 ${response.status} ${response.statusText}`,
        }
      }
      const payload = (await response.json()) as BalancePayload
      return { ok: true, payload, source: credential.source }
    } catch (error) {
      return {
        ok: false,
        code: 'FETCH_FAILED',
        message: error instanceof Error ? error.message : String(error),
      }
    }
  }

  const fetchPricing = async (): Promise<PricingInfo> => {
    const period = getBillingPeriod()
    try {
      const response = await fetch(PRICING_DOCS_URL, {
        signal: AbortSignal.timeout(config.timeoutMs),
      })
      if (!response.ok) {
        return {
          ...period,
          docsURL: PRICING_DOCS_URL,
          updatedAt: Date.now(),
          error: { code: `HTTP_${response.status}`, message: `官方价格页返回 ${response.status} ${response.statusText}` },
        }
      }
      const html = await response.text()
      return {
        ...period,
        docsURL: PRICING_DOCS_URL,
        updatedAt: Date.now(),
        rows: parsePricingRows(html, period.period),
      }
    } catch (error) {
      return {
        ...period,
        docsURL: PRICING_DOCS_URL,
        updatedAt: Date.now(),
        error: { code: 'PRICING_FETCH_FAILED', message: error instanceof Error ? error.message : String(error) },
      }
    }
  }

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/dsh-usage/api',
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      if (req.method !== 'GET') {
        sendJson(res, 405, { ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: `仅支持 GET（收到 ${req.method}）` } })
        return
      }
      const pathname = new URL(req.url ?? '/', 'http://localhost').pathname
      if (pathname !== '/dsh-usage/api/balance') {
        sendJson(res, 404, { ok: false, error: { code: 'NOT_FOUND', message: '未知端点' } })
        return
      }
      const [result, pricing] = await Promise.all([fetchBalance(), fetchPricing()])
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
      })
    },
  }), 'dsh-usage-dashboard: api route')

  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'dev_usage_balance',
    description: '查询 DeepSeek 账户余额（官方 GET /user/balance）与平台用量页地址。',
    parameters: {},
    output: {
      schema: { type: 'string' },
      render: (_args: unknown, value: unknown) => [{ type: 'text', text: String(value) }],
    },
    async execute() {
      const result = await fetchBalance()
      const pricing = await fetchPricing()
      const lines: string[] = [`平台用量页: ${config.platformUsageURL}`, `Key: ${config.keyRef}`, `当前计费: ${pricing.periodLabel}（${pricing.rateLabel}，北京时间 ${pricing.beijingTime}）`]
      if (pricing.rows !== undefined) {
        lines.push(`当前官方价格: Flash 命中/未命中/输出 ${pricing.rows.cacheHitInput.flash}/${pricing.rows.cacheMissInput.flash}/${pricing.rows.output.flash}；Pro ${pricing.rows.cacheHitInput.pro}/${pricing.rows.cacheMissInput.pro}/${pricing.rows.output.pro}`)
      }
      if (!result.ok) {
        lines.push(`查询失败 [${result.code}]: ${result.message}`)
      } else {
        lines.push(`账户可用: ${result.payload.is_available ? '是' : '否'}`)
        const health = balanceHealth(result.payload, config)
        lines.push(`余额灯: ${health.level === 'warning' ? '告警' : health.level === 'ok' ? '正常' : '未知'}（${health.currency}）`)
        for (const info of result.payload.balance_infos) {
          lines.push(`${info.currency}: 总额 ${info.total_balance}（赠送 ${info.granted_balance} / 充值 ${info.topped_up_balance}）`)
        }
      }
      return lines.join('\n')
    },
  })), 'dsh-usage-dashboard: balance tool')
}
