/**
 * dsh-usage-dashboard client half: the 用量 (Usage) tab in the conversation
 * view. Renders the DeepSeek account balance served by the host route
 * `/dsh-usage/api/balance` and links out to the platform usage page. Plain
 * React via createElement (no JSX), structured typing of the touched host
 * surface like dsh-market, so this external package stays free of
 * monorepo-internal type dependencies.
 */
import { createElement as h, useEffect, useMemo, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react'

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
      label: () => h(UsageTabLabel, {}),
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

interface BalanceHealth {
  level: 'ok' | 'warning' | 'unknown'
  currency: string
  amount?: number
  percent?: number
  percentBase?: number
  updatedAt?: number
  triggeredBy: ('amount' | 'percent')[]
}

interface ApiResponse {
  ok: boolean
  ts: number
  keyRef: string
  baseURL: string
  platformUsageURL: string
  pricing?: PricingInfo
  health?: BalanceHealth
  configured?: boolean
  balance?: { is_available: boolean; balance_infos: BalanceInfo[] }
  source?: string
  error?: { code: string; message: string }
}

type State =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; data: ApiResponse }

interface ThresholdDraft {
  alertBalance: string
  alertBalancePercent: string
  alertBalanceEnabled: boolean
  alertBalancePercentEnabled: boolean
}

const HEALTH_LEVEL_STORAGE_KEY = 'dsh-usage-dashboard:health-thresholds'
const DEFAULT_PERCENT_BASE = 100
const DEFAULT_THRESHOLDS: ThresholdDraft = {
  alertBalance: '',
  alertBalancePercent: '',
  alertBalanceEnabled: false,
  alertBalancePercentEnabled: false,
}

const healthStore = (() => {
  let snapshot: BalanceHealth = { level: 'unknown', currency: 'CNY', triggeredBy: [], updatedAt: Date.now() }
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    publish: (next: BalanceHealth) => {
      const now = Date.now()
      const updatedAt = next.level === 'warning' && snapshot.level === 'warning'
        ? snapshot.updatedAt ?? now
        : now
      snapshot = { ...next, updatedAt }
      for (const listener of listeners) listener()
    },
  }
})()

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
  const [thresholds, setThresholds] = useState(loadThresholds)
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
  const editThreshold = (field: 'alertBalance' | 'alertBalancePercent', value: string): void => {
    setThresholds((current) => {
      const next = { ...current, [field]: value }
      saveThresholds(next)
      return next
    })
  }
  const toggleThreshold = (field: 'alertBalanceEnabled' | 'alertBalancePercentEnabled', value: boolean): void => {
    setThresholds((current) => {
      const next = { ...current, [field]: value }
      saveThresholds(next)
      return next
    })
  }
  const readyData = state.phase === 'ready' ? state.data : undefined
  const health = useMemo((): BalanceHealth =>
    readyData === undefined
      ? { level: 'unknown', currency: 'CNY', triggeredBy: [], updatedAt: Date.now() }
      : computeHealth(readyData, thresholds),
  [readyData, thresholds])

  useEffect(() => {
    healthStore.publish(health)
  }, [health])

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
        thresholdRow('告警金额', thresholds.alertBalance, 'alertBalance', thresholds.alertBalanceEnabled, (value) => { editThreshold('alertBalance', value) }, (value) => { toggleThreshold('alertBalanceEnabled', value) }),
        thresholdRow('告警金额（按百分比）', thresholds.alertBalancePercent, 'alertBalancePercent', thresholds.alertBalancePercentEnabled, (value) => { editThreshold('alertBalancePercent', value) }, (value) => { toggleThreshold('alertBalancePercentEnabled', value) }, '%'),
        pricingRows(data.pricing, now),
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

const healthDotBaseStyle: CSSProperties = {
  width: '8px',
  height: '8px',
  borderRadius: '50%',
  display: 'inline-block',
  flex: '0 0 auto',
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

const thresholdInputStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  minWidth: 0,
  border: 0,
  background: 'transparent',
  color: '#d6dae2',
  padding: 0,
  fontFamily: 'monospace',
  fontSize: '12px',
  outline: 'none',
}

const thresholdInputBoxStyle: CSSProperties = {
  width: '96px',
  boxSizing: 'border-box',
  border: '1px solid #343b4d',
  borderRadius: '4px',
  background: '#111318',
  color: '#d6dae2',
  padding: '2px 6px',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '3px',
}

const thresholdInputWrapStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  fontFamily: 'monospace',
}

const thresholdSuffixStyle: CSSProperties = {
  color: '#8b93a7',
  minWidth: '10px',
}

const switchKnobStyle: CSSProperties = {
  width: '10px',
  height: '10px',
  borderRadius: '50%',
  background: '#d6dae2',
  transition: 'transform 140ms ease',
}

const tabLabelStyle: CSSProperties = {
  position: 'relative',
  display: 'inline-block',
  paddingRight: '10px',
}

const tabDotStyle: CSSProperties = {
  position: 'absolute',
  top: '-4px',
  right: '-2px',
}

function UsageTabLabel(): ReactNode {
  const health = useSyncExternalStore(healthStore.subscribe, healthStore.getSnapshot)
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 500)
    return () => window.clearInterval(id)
  }, [])
  return h('span', { style: tabLabelStyle },
    '用量',
    h('span', { style: tabDotStyle }, healthDot(health, now)))
}

function healthDot(health: BalanceHealth | undefined, now: Date): ReactNode {
  const level = health?.level ?? 'unknown'
  const color = level === 'warning' ? '#ffb454' : level === 'ok' ? '#58c777' : '#596070'
  const elapsed = now.getTime() - (health?.updatedAt ?? 0)
  const blinking = level === 'warning' && elapsed >= 0 && elapsed < 42_000
  const visible = !blinking || Math.floor(elapsed / 750) % 2 === 0
  return h('span', {
    'aria-hidden': true,
    title: level === 'warning' ? '余额低于告警值' : level === 'ok' ? '余额正常' : '余额状态未知',
    style: {
      ...healthDotBaseStyle,
      background: color,
      opacity: visible ? 1 : 0.38,
      boxShadow: level === 'unknown' ? 'none' : `0 0 ${level === 'warning' ? 11 : 7}px ${level === 'warning' ? 3 : 0}px ${color}`,
      transition: 'opacity 180ms ease',
    },
  })
}

function thresholdRow(
  label: string,
  value: string,
  id: string,
  enabled: boolean,
  onEdit: (value: string) => void,
  onToggle: (value: boolean) => void,
  suffix?: string,
): ReactNode {
  return h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', padding: '3px 0' } },
    h('label', { htmlFor: id, style: thresholdLabelStyle }, label),
    h('span', { style: thresholdInputWrapStyle },
      h('button', {
        type: 'button',
        role: 'switch',
        'aria-checked': enabled,
        title: `${label}${enabled ? '已启用' : '已关闭'}`,
        onClick: () => { onToggle(!enabled) },
        style: thresholdSwitchStyle(enabled),
      }, h('span', { style: { ...switchKnobStyle, transform: enabled ? 'translateX(12px)' : 'translateX(0)' } })),
      h('span', { style: thresholdInputBoxStyle },
        h('input', {
          id,
          type: 'text',
          inputMode: 'decimal',
          value,
          placeholder: '0',
          style: thresholdInputStyle,
          onChange: (event: { target: { value: string } }) => { onEdit(event.target.value) },
        }),
        suffix === undefined ? null : h('span', { style: thresholdSuffixStyle }, suffix))))
}

function computeHealth(data: ApiResponse, thresholds: ThresholdDraft): BalanceHealth {
  const base = data.health ?? { level: 'unknown' as const, currency: 'CNY', triggeredBy: [] }
  if (!data.configured || data.balance === undefined || base.amount === undefined) {
    return { ...base, level: 'unknown', triggeredBy: [], updatedAt: data.ts }
  }
  const alertBalance = parseOptionalNumber(thresholds.alertBalance)
  const alertBalancePercent = parseOptionalNumber(thresholds.alertBalancePercent)
  const percentBase = base.percentBase ?? DEFAULT_PERCENT_BASE
  const percent = percentBase > 0 ? base.amount / percentBase * 100 : undefined
  if (!thresholds.alertBalanceEnabled && !thresholds.alertBalancePercentEnabled) {
    return { ...base, level: 'unknown', percent, percentBase, triggeredBy: [], updatedAt: data.ts }
  }
  const triggeredBy: ('amount' | 'percent')[] = []
  if (thresholds.alertBalanceEnabled && alertBalance !== undefined && base.amount < alertBalance) triggeredBy.push('amount')
  if (thresholds.alertBalancePercentEnabled && percent !== undefined && alertBalancePercent !== undefined && percent < alertBalancePercent) triggeredBy.push('percent')
  return {
    ...base,
    percent,
    percentBase,
    level: triggeredBy.length > 0 ? 'warning' : 'ok',
    triggeredBy,
    updatedAt: data.ts,
  }
}

function parseOptionalNumber(value: string): number | undefined {
  const trimmed = value.trim()
  if (trimmed === '') return undefined
  const number = Number(trimmed.endsWith('%') ? trimmed.slice(0, -1).trim() : trimmed)
  return Number.isFinite(number) && number > 0 ? number : undefined
}

function loadThresholds(): ThresholdDraft {
  try {
    const raw = window.localStorage.getItem(HEALTH_LEVEL_STORAGE_KEY)
    if (raw === null) return DEFAULT_THRESHOLDS
    const parsed = JSON.parse(raw) as Partial<ThresholdDraft>
    return {
      alertBalance: typeof parsed.alertBalance === 'string' ? parsed.alertBalance : '',
      alertBalancePercent: typeof parsed.alertBalancePercent === 'string' ? parsed.alertBalancePercent : '',
      alertBalanceEnabled: typeof parsed.alertBalanceEnabled === 'boolean'
        ? parsed.alertBalanceEnabled
        : typeof parsed.alertBalance === 'string' && parsed.alertBalance.trim() !== '',
      alertBalancePercentEnabled: typeof parsed.alertBalancePercentEnabled === 'boolean'
        ? parsed.alertBalancePercentEnabled
        : typeof parsed.alertBalancePercent === 'string' && parsed.alertBalancePercent.trim() !== '',
    }
  } catch {
    return DEFAULT_THRESHOLDS
  }
}

function saveThresholds(thresholds: ThresholdDraft): void {
  try {
    window.localStorage.setItem(HEALTH_LEVEL_STORAGE_KEY, JSON.stringify(thresholds))
  } catch {
    // Storage failures leave the current in-memory threshold active.
  }
}

function pricingRows(pricing: PricingInfo | undefined, now: Date): ReactNode {
  if (pricing === undefined) {
    return null
  }
  const periodColor = pricing.period === 'peak' ? '#f6a04d' : '#58c777'
  const transition = nextTransition(now)
  const hint = pricing.period === 'peak' ? '长任务建议等空闲时段' : '适合运行长上下文任务'
  return h('div', { style: { borderTop: '1px solid #2a3040', marginTop: '4px', paddingTop: '4px' } },
    h('div', { style: statusBarStyle },
      h('span', { style: { color: periodColor, fontWeight: 700 } }, `${pricing.periodLabel}（${pricing.rateLabel}）`),
      h('span', {}, `距${transition.nextLabel} `, h('span', { style: { color: periodColor } }, transition.countdown)),
      h('span', {}, hint)),
    pricing.rows !== undefined
      ? priceRows(pricing.rows)
      : row('官方当前价格', `暂不可用${pricing.error !== undefined ? `（${pricing.error.code}）` : ''}`),
    row('价格同步', '官方文档'))
}

function priceRows(rows: NonNullable<PricingInfo['rows']>): ReactNode {
  return h('div', { style: priceGridStyle },
    h('span', { style: priceLabelStyle },
      h('span', {}, '官方当前价格'),
      h('span', { style: { fontSize: '12px' } }, '（元/百万tokens）')),
    h('span', { style: priceValueStyle },
      modelPriceLine('Flash', rows.cacheHitInput.flash, rows.cacheMissInput.flash, rows.output.flash),
      modelPriceLine('Pro', rows.cacheHitInput.pro, rows.cacheMissInput.pro, rows.output.pro)))
}

function modelPriceLine(label: string, cacheHit: string, cacheMiss: string, output: string): ReactNode {
  return h('span', { style: highlightedPriceLineStyle },
    `${label} ${formatPrices(cacheHit, cacheMiss, output)}`)
}

const statusBarStyle: CSSProperties = {
  display: 'flex',
  gap: '14px',
  alignItems: 'center',
  flexWrap: 'wrap',
  padding: '6px 0 8px',
  color: '#8b93a7',
}

const thresholdLabelStyle: CSSProperties = {
  ...labelStyle,
  flex: '0 0 150px',
}

function thresholdSwitchStyle(enabled: boolean): CSSProperties {
  const color = enabled ? '#58c777' : '#343b4d'
  return {
    width: '28px',
    height: '16px',
    borderRadius: '999px',
    border: `1px solid ${color}`,
    background: enabled ? 'rgba(88, 199, 119, 0.28)' : 'rgba(52, 59, 77, 0.42)',
    padding: '2px',
    display: 'inline-flex',
    alignItems: 'center',
    cursor: 'pointer',
    boxSizing: 'border-box',
  }
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
