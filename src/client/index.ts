/**
 * dsh-usage-dashboard client half: the 用量 (Usage) tab in the conversation
 * view. Renders the DeepSeek account balance served by the host route
 * `/dsh-usage/api/balance` and links out to the platform usage page. Plain
 * React via createElement (no JSX), structured typing of the touched host
 * surface like dsh-market, so this external package stays free of
 * monorepo-internal type dependencies.
 */
import { createElement as h, useEffect, useState, type CSSProperties, type ReactNode } from 'react'

interface SlotsService {
  inject(slot: string, register: () => unknown): void
  register(meta: Record<string, unknown>, component: () => unknown): unknown
}

interface ClientContext {
  effect(callback: () => unknown, label?: string): void
  slots: SlotsService
}

export const name = 'dsh-usage-dashboard'
export const inject = ['slots']

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.slots.inject('conversation.view', () =>
    ctx.slots.register({
      name: 'conversation.view',
      id: 'dsh-usage-dashboard',
      order: 20,
      label: () => '用量',
    }, () => h(UsagePanel, {})),
  ), 'dsh-usage-dashboard: panel')
}

interface BalanceInfo {
  currency: string
  total_balance: string
  granted_balance: string
  topped_up_balance: string
}

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

interface ApiResponse {
  ok: boolean
  ts: number
  keyRef: string
  baseURL: string
  platformUsageURL: string
  pricing?: PricingInfo
  defaultModel?: string
  configured?: boolean
  balance?: { is_available: boolean; balance_infos: BalanceInfo[] }
  source?: string
  error?: { code: string; message: string }
}

type State =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; data: ApiResponse }

const row = (label: string, value: string): ReactNode =>
  h('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '4px 0' } },
    h('span', { style: labelStyle }, label),
    h('span', { style: { fontFamily: 'monospace' } }, value))

const labelStyle: CSSProperties = {
  color: '#8b93a7',
  flex: '0 0 112px',
  whiteSpace: 'nowrap',
}

const box: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  padding: '16px',
  fontFamily: 'system-ui, sans-serif',
  fontSize: '13px',
  color: '#d6dae2',
  maxWidth: '640px',
}

function UsagePanel(): ReactNode {
  const [tick, setTick] = useState(0)
  const [now, setNow] = useState(() => new Date())
  const [state, setState] = useState<State>({ phase: 'loading' })

  useEffect(() => {
    let cancelled = false
    setState({ phase: 'loading' })
    fetch('/dsh-usage/api/balance', { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`用量服务返回 ${res.status}`)
        }
        return await res.json() as ApiResponse
      })
      .then((data) => { if (!cancelled) setState({ phase: 'ready', data }) })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({ phase: 'error', message: error instanceof Error ? error.message : String(error) })
        }
      })
    return () => { cancelled = true }
  }, [tick])

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const refresh = (): void => setTick((t) => t + 1)

  if (state.phase === 'loading') {
    return h('div', { style: box }, '加载中…')
  }
  if (state.phase === 'error') {
    return h('div', { style: box },
      h('div', { style: { fontWeight: 600 } }, '无法连接用量服务'),
      h('div', { style: { color: '#e06c75' } }, state.message),
      buttonBar(refresh))
  }
  const data = state.data
  const updated = new Date(data.ts).toLocaleTimeString()
  return h('div', { style: box },
    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
      h('span', { style: { fontWeight: 600, fontSize: '14px' } }, 'DeepSeek 用量'),
      h('a', {
        href: data.platformUsageURL,
        target: '_blank',
        rel: 'noopener noreferrer',
        style: linkStyle,
      }, '打开平台用量页 →')),
    data.configured && data.balance !== undefined
      ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
        row('账户可用', data.balance.is_available ? '是' : '否'),
        pricingRows(data.pricing, data.defaultModel, now),
        ...data.balance.balance_infos.map((info) =>
          h('div', { key: info.currency, style: { borderTop: '1px solid #2a3040', marginTop: '4px', paddingTop: '4px' } },
            row(`${info.currency} 总额`, info.total_balance),
            row('　赠送额度', info.granted_balance),
            row('　充值额度', info.topped_up_balance))))
      : h('div', { style: { color: '#e06c75' } }, `查询失败 [${data.error?.code ?? 'UNKNOWN'}]: ${data.error?.message ?? '未知错误'}`),
    h('div', { style: { color: '#8b93a7', fontSize: '12px' } },
      `${data.keyRef} · ${data.baseURL}${data.source !== undefined ? ` · 来源 ${data.source}` : ''} · 更新于 ${updated}`),
    buttonBar(refresh))
}

const linkStyle: CSSProperties = {
  color: '#7aa2f7',
  textDecoration: 'none',
  fontWeight: 600,
}

const buttonStyle: CSSProperties = {
  background: 'transparent',
  border: '1px solid #3b4252',
  borderRadius: '6px',
  color: '#d6dae2',
  padding: '6px 14px',
  cursor: 'pointer',
  fontFamily: 'system-ui, sans-serif',
  fontSize: '13px',
}

function pricingRows(pricing: PricingInfo | undefined, defaultModel: string | undefined, now: Date): ReactNode {
  if (pricing === undefined) {
    return null
  }
  const periodColor = pricing.period === 'peak' ? '#f6a04d' : '#58c777'
  const transition = nextTransition(now)
  const hint = pricing.period === 'peak' ? '长任务建议等空闲时段' : '适合运行长上下文任务'
  return h('div', { style: { borderTop: '1px solid #2a3040', marginTop: '4px', paddingTop: '4px' } },
    h('div', { style: statusBarStyle },
      h('span', { style: { color: periodColor, fontWeight: 700 } }, `${pricing.periodLabel}（${pricing.rateLabel}）`),
      h('span', {}, `距${transition.nextLabel} ${transition.countdown}`),
      h('span', {}, hint)),
    pricing.rows !== undefined
      ? priceRows(pricing.rows, defaultModel)
      : row('官方当前价格', `暂不可用${pricing.error !== undefined ? `（${pricing.error.code}）` : ''}`),
    row('价格同步', '官方文档'))
}

function priceRows(rows: NonNullable<PricingInfo['rows']>, defaultModel: string | undefined): ReactNode {
  return h('div', { style: priceGridStyle },
    h('span', { style: priceLabelStyle },
      h('span', {}, '官方当前价格'),
      h('span', { style: { fontSize: '12px' } }, '（元/百万tokens）')),
    h('span', { style: priceValueStyle },
      modelPriceLine('deepseek-v4-flash', 'Flash', rows.cacheHitInput.flash, rows.cacheMissInput.flash, rows.output.flash, defaultModel),
      modelPriceLine('deepseek-v4-pro', 'Pro', rows.cacheHitInput.pro, rows.cacheMissInput.pro, rows.output.pro, defaultModel)))
}

function modelPriceLine(model: string, label: string, cacheHit: string, cacheMiss: string, output: string, defaultModel: string | undefined): ReactNode {
  const current = defaultModel === model
  return h('span', { style: current ? highlightedPriceLineStyle : undefined },
    `${label}${current ? '（默认）' : ''} ${formatPrices(cacheHit, cacheMiss, output)}`)
}

const statusBarStyle: CSSProperties = {
  display: 'flex',
  gap: '14px',
  alignItems: 'center',
  flexWrap: 'wrap',
  padding: '6px 0 8px',
  color: '#8b93a7',
}

const priceGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '184px minmax(0, 1fr)',
  gap: '12px',
  padding: '6px 0',
  alignItems: 'start',
}

const priceLabelStyle: CSSProperties = {
  color: '#8b93a7',
  display: 'flex',
  flexDirection: 'column',
  whiteSpace: 'nowrap',
}

const priceValueStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '5px',
  alignItems: 'flex-start',
  fontFamily: 'monospace',
  whiteSpace: 'nowrap',
}

const highlightedPriceLineStyle: CSSProperties = {
  color: '#d6dae2',
  fontWeight: 700,
}

function formatPrices(cacheHit: string, cacheMiss: string, output: string): string {
  return `命中 ${cacheHit} / 未命中 ${cacheMiss} / 输出 ${output}`
}

function nextTransition(now: Date): { nextLabel: string; countdown: string } {
  const seconds = beijingSeconds(now)
  const next = seconds < 9 * 3600
    ? { label: '高峰', at: 9 * 3600 }
    : seconds < 12 * 3600
      ? { label: '空闲', at: 12 * 3600 }
      : seconds < 14 * 3600
        ? { label: '高峰', at: 14 * 3600 }
        : seconds < 18 * 3600
          ? { label: '空闲', at: 18 * 3600 }
          : { label: '高峰', at: 24 * 3600 + 9 * 3600 }
  return { nextLabel: next.label, countdown: formatDuration(next.at - seconds) }
}

function beijingSeconds(now: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(now)
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0')
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? '0')
  const second = Number(parts.find((part) => part.type === 'second')?.value ?? '0')
  return hour * 3600 + minute * 60 + second
}

function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, totalSeconds)
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = seconds % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
}

function buttonBar(onRefresh: () => void): ReactNode {
  return h('div', { style: { display: 'flex', gap: '8px' } },
    h('button', { onClick: onRefresh, style: buttonStyle }, '刷新'))
}
