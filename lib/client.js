window.__ModuleLoader__.load({
	id: "dsh-usage-dashboard",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		//#region src/client/index.ts
		/**
		* dsh-usage-dashboard client half: the 用量 (Usage) tab in the conversation
		* view. Renders the DeepSeek account balance served by the host route
		* `/dsh-usage/api/balance` and links out to the platform usage page. Plain
		* React via createElement (no JSX), structured typing of the touched host
		* surface like dsh-market, so this external package stays free of
		* monorepo-internal type dependencies.
		*/
		const name = "dsh-usage-dashboard";
		const inject = ["slots"];
		function apply(ctx) {
			ctx.effect(() => ctx.slots.inject("conversation.view", () => ctx.slots.register({
				name: "conversation.view",
				id: "dsh-usage-dashboard",
				order: 20,
				label: () => (0, react.createElement)(UsageTabLabel, {})
			}, () => (0, react.createElement)(UsagePanel, {}))), "dsh-usage-dashboard: panel");
		}
		const HEALTH_LEVEL_STORAGE_KEY = "dsh-usage-dashboard:health-thresholds";
		const DEFAULT_PERCENT_BASE = 100;
		const DEFAULT_THRESHOLDS = {
			alertBalance: "",
			alertBalancePercent: ""
		};
		const healthStore = (() => {
			let snapshot = {
				level: "unknown",
				currency: "CNY",
				triggeredBy: []
			};
			const listeners = /* @__PURE__ */ new Set();
			return {
				getSnapshot: () => snapshot,
				subscribe: (listener) => {
					listeners.add(listener);
					return () => {
						listeners.delete(listener);
					};
				},
				publish: (next) => {
					snapshot = next;
					for (const listener of listeners) listener();
				}
			};
		})();
		const row = (label, value) => (0, react.createElement)("div", { style: {
			display: "flex",
			justifyContent: "space-between",
			gap: "12px",
			padding: "4px 0"
		} }, (0, react.createElement)("span", { style: labelStyle }, label), (0, react.createElement)("span", { style: { fontFamily: "monospace" } }, value));
		const labelStyle = {
			color: "#8b93a7",
			flex: "0 0 112px",
			whiteSpace: "nowrap"
		};
		const box = {
			display: "flex",
			flexDirection: "column",
			gap: "10px",
			padding: "16px",
			fontFamily: "system-ui, sans-serif",
			fontSize: "13px",
			color: "#d6dae2",
			maxWidth: "640px"
		};
		function UsagePanel() {
			const [tick, setTick] = (0, react.useState)(0);
			const [now, setNow] = (0, react.useState)(() => /* @__PURE__ */ new Date());
			const [thresholds, setThresholds] = (0, react.useState)(loadThresholds);
			const [state, setState] = (0, react.useState)({ phase: "loading" });
			(0, react.useEffect)(() => {
				let cancelled = false;
				setState({ phase: "loading" });
				fetch("/dsh-usage/api/balance", { cache: "no-store" }).then(async (res) => {
					if (!res.ok) throw new Error(`用量服务返回 ${res.status}`);
					return await res.json();
				}).then((data) => {
					if (!cancelled) setState({
						phase: "ready",
						data
					});
				}).catch((error) => {
					if (!cancelled) setState({
						phase: "error",
						message: error instanceof Error ? error.message : String(error)
					});
				});
				return () => {
					cancelled = true;
				};
			}, [tick]);
			(0, react.useEffect)(() => {
				const id = window.setInterval(() => setNow(/* @__PURE__ */ new Date()), 1e3);
				return () => window.clearInterval(id);
			}, []);
			const refresh = () => setTick((t) => t + 1);
			const editThreshold = (field, value) => {
				setThresholds((current) => {
					const next = {
						...current,
						[field]: value
					};
					saveThresholds(next);
					return next;
				});
			};
			const readyData = state.phase === "ready" ? state.data : void 0;
			const health = (0, react.useMemo)(() => readyData === void 0 ? {
				level: "unknown",
				currency: "CNY",
				triggeredBy: [],
				updatedAt: Date.now()
			} : computeHealth(readyData, thresholds), [readyData, thresholds]);
			(0, react.useEffect)(() => {
				healthStore.publish(health);
			}, [health]);
			if (state.phase === "loading") return (0, react.createElement)("div", { style: box }, "加载中…");
			if (state.phase === "error") return (0, react.createElement)("div", { style: box }, (0, react.createElement)("div", { style: { fontWeight: 600 } }, "无法连接用量服务"), (0, react.createElement)("div", { style: { color: "#e06c75" } }, state.message), buttonBar(refresh));
			const data = state.data;
			const updated = new Date(data.ts).toLocaleTimeString();
			return (0, react.createElement)("div", { style: box }, (0, react.createElement)("div", { style: {
				display: "flex",
				justifyContent: "space-between",
				alignItems: "center"
			} }, (0, react.createElement)("span", { style: {
				fontWeight: 600,
				fontSize: "14px"
			} }, "DeepSeek 用量"), (0, react.createElement)("a", {
				href: data.platformUsageURL,
				target: "_blank",
				rel: "noopener noreferrer",
				style: linkStyle
			}, "打开平台用量页 →")), data.configured && data.balance !== void 0 ? (0, react.createElement)("div", { style: {
				display: "flex",
				flexDirection: "column",
				gap: "4px"
			} }, row("账户可用", data.balance.is_available ? "是" : "否"), thresholdRow("告警金额", thresholds.alertBalance, "alertBalance", (value) => {
				editThreshold("alertBalance", value);
			}), thresholdRow("告警金额（按百分比）", thresholds.alertBalancePercent, "alertBalancePercent", (value) => {
				editThreshold("alertBalancePercent", value);
			}), pricingRows(data.pricing, now), ...data.balance.balance_infos.map((info) => (0, react.createElement)("div", {
				key: info.currency,
				style: {
					borderTop: "1px solid #2a3040",
					marginTop: "4px",
					paddingTop: "4px"
				}
			}, row(`${info.currency} 总额`, info.total_balance), row("　赠送额度", info.granted_balance), row("　充值额度", info.topped_up_balance)))) : (0, react.createElement)("div", { style: { color: "#e06c75" } }, `查询失败 [${data.error?.code ?? "UNKNOWN"}]: ${data.error?.message ?? "未知错误"}`), (0, react.createElement)("div", { style: {
				color: "#8b93a7",
				fontSize: "12px"
			} }, `${data.keyRef} · ${data.baseURL}${data.source !== void 0 ? ` · 来源 ${data.source}` : ""} · 更新于 ${updated}`), buttonBar(refresh));
		}
		const linkStyle = {
			color: "#7aa2f7",
			textDecoration: "none",
			fontWeight: 600
		};
		const healthDotBaseStyle = {
			width: "8px",
			height: "8px",
			borderRadius: "50%",
			display: "inline-block",
			flex: "0 0 auto"
		};
		const buttonStyle = {
			background: "transparent",
			border: "1px solid #3b4252",
			borderRadius: "6px",
			color: "#d6dae2",
			padding: "6px 14px",
			cursor: "pointer",
			fontFamily: "system-ui, sans-serif",
			fontSize: "13px"
		};
		const thresholdInputStyle = {
			width: "96px",
			boxSizing: "border-box",
			border: "1px solid #343b4d",
			borderRadius: "4px",
			background: "#111318",
			color: "#d6dae2",
			padding: "2px 6px",
			fontFamily: "monospace",
			fontSize: "12px",
			outline: "none"
		};
		const tabLabelStyle = {
			position: "relative",
			display: "inline-block",
			paddingRight: "10px"
		};
		const tabDotStyle = {
			position: "absolute",
			top: "-4px",
			right: "-2px"
		};
		function UsageTabLabel() {
			const health = (0, react.useSyncExternalStore)(healthStore.subscribe, healthStore.getSnapshot);
			const [now, setNow] = (0, react.useState)(() => /* @__PURE__ */ new Date());
			(0, react.useEffect)(() => {
				const id = window.setInterval(() => setNow(/* @__PURE__ */ new Date()), 1e3);
				return () => window.clearInterval(id);
			}, []);
			return (0, react.createElement)("span", { style: tabLabelStyle }, "用量", (0, react.createElement)("span", { style: tabDotStyle }, healthDot(health, now)));
		}
		function healthDot(health, now) {
			const level = health?.level ?? "unknown";
			const color = level === "warning" ? "#f6a04d" : level === "ok" ? "#58c777" : "#596070";
			const elapsed = now.getTime() - (health?.updatedAt ?? 0);
			const visible = !(level === "warning" && elapsed >= 0 && elapsed < 6e4) || Math.floor(elapsed / 3e3) % 2 === 0;
			return (0, react.createElement)("span", {
				"aria-hidden": true,
				title: level === "warning" ? "余额低于告警值" : level === "ok" ? "余额正常" : "余额状态未知",
				style: {
					...healthDotBaseStyle,
					background: color,
					opacity: visible ? 1 : .28,
					boxShadow: level === "unknown" ? "none" : `0 0 7px ${color}`,
					transition: "opacity 180ms ease"
				}
			});
		}
		function thresholdRow(label, value, id, onEdit) {
			return (0, react.createElement)("div", { style: {
				display: "flex",
				justifyContent: "space-between",
				alignItems: "center",
				gap: "12px",
				padding: "3px 0"
			} }, (0, react.createElement)("label", {
				htmlFor: id,
				style: thresholdLabelStyle
			}, label), (0, react.createElement)("input", {
				id,
				type: "text",
				inputMode: "decimal",
				value,
				placeholder: "0",
				style: thresholdInputStyle,
				onChange: (event) => {
					onEdit(event.target.value);
				}
			}));
		}
		function computeHealth(data, thresholds) {
			const base = data.health ?? {
				level: "unknown",
				currency: "CNY",
				triggeredBy: []
			};
			if (!data.configured || data.balance === void 0 || base.amount === void 0) return {
				...base,
				level: "unknown",
				triggeredBy: [],
				updatedAt: data.ts
			};
			const alertBalance = parseOptionalNumber(thresholds.alertBalance);
			const alertBalancePercent = parseOptionalNumber(thresholds.alertBalancePercent);
			const percentBase = base.percentBase ?? DEFAULT_PERCENT_BASE;
			const percent = percentBase > 0 ? base.amount / percentBase * 100 : void 0;
			const triggeredBy = [];
			if (alertBalance !== void 0 && base.amount < alertBalance) triggeredBy.push("amount");
			if (percent !== void 0 && alertBalancePercent !== void 0 && percent < alertBalancePercent) triggeredBy.push("percent");
			return {
				...base,
				percent,
				percentBase,
				level: triggeredBy.length > 0 ? "warning" : "ok",
				triggeredBy,
				updatedAt: data.ts
			};
		}
		function parseOptionalNumber(value) {
			const trimmed = value.trim();
			if (trimmed === "") return void 0;
			const number = Number(trimmed);
			return Number.isFinite(number) && number > 0 ? number : void 0;
		}
		function loadThresholds() {
			try {
				const raw = window.localStorage.getItem(HEALTH_LEVEL_STORAGE_KEY);
				if (raw === null) return DEFAULT_THRESHOLDS;
				const parsed = JSON.parse(raw);
				return {
					alertBalance: typeof parsed.alertBalance === "string" ? parsed.alertBalance : "",
					alertBalancePercent: typeof parsed.alertBalancePercent === "string" ? parsed.alertBalancePercent : ""
				};
			} catch {
				return DEFAULT_THRESHOLDS;
			}
		}
		function saveThresholds(thresholds) {
			try {
				window.localStorage.setItem(HEALTH_LEVEL_STORAGE_KEY, JSON.stringify(thresholds));
			} catch {}
		}
		function pricingRows(pricing, now) {
			if (pricing === void 0) return null;
			const periodColor = pricing.period === "peak" ? "#f6a04d" : "#58c777";
			const transition = nextTransition(now);
			const hint = pricing.period === "peak" ? "长任务建议等空闲时段" : "适合运行长上下文任务";
			return (0, react.createElement)("div", { style: {
				borderTop: "1px solid #2a3040",
				marginTop: "4px",
				paddingTop: "4px"
			} }, (0, react.createElement)("div", { style: statusBarStyle }, (0, react.createElement)("span", { style: {
				color: periodColor,
				fontWeight: 700
			} }, `${pricing.periodLabel}（${pricing.rateLabel}）`), (0, react.createElement)("span", {}, `距${transition.nextLabel} ${transition.countdown}`), (0, react.createElement)("span", {}, hint)), pricing.rows !== void 0 ? priceRows(pricing.rows) : row("官方当前价格", `暂不可用${pricing.error !== void 0 ? `（${pricing.error.code}）` : ""}`), row("价格同步", "官方文档"));
		}
		function priceRows(rows) {
			return (0, react.createElement)("div", { style: priceGridStyle }, (0, react.createElement)("span", { style: priceLabelStyle }, (0, react.createElement)("span", {}, "官方当前价格"), (0, react.createElement)("span", { style: { fontSize: "12px" } }, "（元/百万tokens）")), (0, react.createElement)("span", { style: priceValueStyle }, modelPriceLine("Flash", rows.cacheHitInput.flash, rows.cacheMissInput.flash, rows.output.flash), modelPriceLine("Pro", rows.cacheHitInput.pro, rows.cacheMissInput.pro, rows.output.pro)));
		}
		function modelPriceLine(label, cacheHit, cacheMiss, output) {
			return (0, react.createElement)("span", { style: highlightedPriceLineStyle }, `${label} ${formatPrices(cacheHit, cacheMiss, output)}`);
		}
		const statusBarStyle = {
			display: "flex",
			gap: "14px",
			alignItems: "center",
			flexWrap: "wrap",
			padding: "6px 0 8px",
			color: "#8b93a7"
		};
		const thresholdLabelStyle = {
			...labelStyle,
			flex: "0 0 150px"
		};
		const priceGridStyle = {
			display: "grid",
			gridTemplateColumns: "184px minmax(0, 1fr)",
			gap: "12px",
			padding: "6px 0",
			alignItems: "start"
		};
		const priceLabelStyle = {
			color: "#8b93a7",
			display: "flex",
			flexDirection: "column",
			whiteSpace: "nowrap"
		};
		const priceValueStyle = {
			display: "flex",
			flexDirection: "column",
			gap: "5px",
			alignItems: "flex-start",
			fontFamily: "monospace",
			whiteSpace: "nowrap"
		};
		const highlightedPriceLineStyle = {
			color: "#d6dae2",
			fontWeight: 700
		};
		function formatPrices(cacheHit, cacheMiss, output) {
			return `命中 ${cacheHit} / 未命中 ${cacheMiss} / 输出 ${output}`;
		}
		function nextTransition(now) {
			const seconds = beijingSeconds(now);
			const next = seconds < 9 * 3600 ? {
				label: "高峰",
				at: 9 * 3600
			} : seconds < 12 * 3600 ? {
				label: "空闲",
				at: 12 * 3600
			} : seconds < 14 * 3600 ? {
				label: "高峰",
				at: 14 * 3600
			} : seconds < 18 * 3600 ? {
				label: "空闲",
				at: 18 * 3600
			} : {
				label: "高峰",
				at: 118800
			};
			return {
				nextLabel: next.label,
				countdown: formatDuration(next.at - seconds)
			};
		}
		function beijingSeconds(now) {
			const parts = new Intl.DateTimeFormat("en-GB", {
				timeZone: "Asia/Shanghai",
				hour: "2-digit",
				minute: "2-digit",
				second: "2-digit",
				hour12: false
			}).formatToParts(now);
			const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
			const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
			const second = Number(parts.find((part) => part.type === "second")?.value ?? "0");
			return hour * 3600 + minute * 60 + second;
		}
		function formatDuration(totalSeconds) {
			const seconds = Math.max(0, totalSeconds);
			const hours = Math.floor(seconds / 3600);
			const minutes = Math.floor(seconds % 3600 / 60);
			const rest = seconds % 60;
			return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
		}
		function buttonBar(onRefresh) {
			return (0, react.createElement)("div", { style: {
				display: "flex",
				gap: "8px"
			} }, (0, react.createElement)("button", {
				onClick: onRefresh,
				style: buttonStyle
			}, "刷新"));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map