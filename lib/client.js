window.__ModuleLoader__.load({
	// Must equal the package name in package.json: the module system keys the
	// row it serves by package name, so a mismatch leaves the browser half
	// silently unloaded rather than failing loudly.
	id: "@blackthunder2191026/dsh-deepseek-usage",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		const React = require("react");

		//#region styles
		const CSS = `
.dsu-root { display: flex; align-items: center; min-width: 0; font-size: 12px; line-height: 1.4; }
.dsu-rail { display: flex; align-items: center; justify-content: center; width: 100%; height: 32px;
	font-variant-numeric: tabular-nums; font-size: 11px; font-weight: 600; color: var(--dsh-text-secondary, #8b8b8b); }
.dsu-button { display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 8px;
	background: transparent; border: 1px solid transparent; border-radius: 8px; color: inherit;
	font: inherit; text-align: left; cursor: pointer; }
.dsu-button:hover, .dsu-button:focus-visible { background: var(--dsh-surface-hover, rgba(127,127,127,.12));
	border-color: var(--dsh-border-subtle, rgba(127,127,127,.25)); outline: none; }
.dsu-dot { flex: none; width: 8px; height: 8px; border-radius: 50%; background: currentColor; opacity: .55; }
.dsu-dot-ok { background: #2ea043; opacity: 1; }
.dsu-dot-low { background: #d29922; opacity: 1; }
.dsu-dot-bad { background: #f85149; opacity: 1; }
.dsu-grow { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsu-amount { font-variant-numeric: tabular-nums; font-weight: 600; color: var(--dsh-text-primary, inherit); }
.dsu-muted { color: var(--dsh-text-secondary, #8b8b8b); }
.dsu-panel { position: fixed; z-index: 60; width: 300px; padding: 12px 14px; border-radius: 12px;
	background: var(--dsh-surface-raised, #202020); color: var(--dsh-text-primary, #eee);
	border: 1px solid var(--dsh-border-subtle, rgba(127,127,127,.3));
	box-shadow: 0 12px 32px rgba(0,0,0,.35); font-size: 12px; }
.dsu-panel-title { display: flex; align-items: center; justify-content: space-between; gap: 8px;
	font-size: 12px; font-weight: 600; margin-bottom: 8px; }
.dsu-rows { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; }
.dsu-rows > dt { color: var(--dsh-text-secondary, #8b8b8b); }
.dsu-rows > dd { margin: 0; text-align: right; font-variant-numeric: tabular-nums; }
.dsu-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 10px; }
.dsu-action { padding: 3px 8px; border-radius: 6px; cursor: pointer; font: inherit;
	background: transparent; color: inherit; border: 1px solid var(--dsh-border-subtle, rgba(127,127,127,.35)); }
.dsu-action:hover { background: var(--dsh-surface-hover, rgba(127,127,127,.15)); }
.dsu-error { color: #f85149; margin-top: 6px; word-break: break-word; }
.dsu-turn { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 2px 0 4px;
	font-size: 12px; }
.dsu-pill { display: inline-flex; align-items: center; gap: 4px; padding: 1px 7px; border-radius: 999px;
	border: 1px solid var(--dsh-border-subtle, rgba(127,127,127,.3)); white-space: nowrap;
	font-variant-numeric: tabular-nums; }
.dsu-pill-button { cursor: pointer; font: inherit; font-size: 12px; background: transparent; color: inherit; }
.dsu-pill-button:hover { background: var(--dsh-surface-hover, rgba(127,127,127,.15)); }
.dsu-cost { font-weight: 600; }
.dsu-breakdown { flex-basis: 100%; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 3px 10px;
	margin: 6px 0 2px; padding: 8px 10px; border-radius: 8px; min-width: 0;
	background: var(--dsh-surface-sunken, rgba(127,127,127,.08));
	border: 1px solid var(--dsh-border-subtle, rgba(127,127,127,.2)); font-size: 12px; }
.dsu-breakdown > .dsu-k { color: var(--dsh-text-secondary, #8b8b8b); white-space: nowrap; }
.dsu-breakdown > .dsu-v { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.dsu-breakdown > .dsu-rate { text-align: right; color: var(--dsh-text-secondary, #8b8b8b); white-space: nowrap; }
.dsu-breakdown > .dsu-head { color: var(--dsh-text-secondary, #8b8b8b); font-size: 11px; font-weight: 600;
	letter-spacing: .02em; padding-bottom: 4px; border-bottom: 1px solid var(--dsh-border-subtle, rgba(127,127,127,.28)); }
`;
		//#endregion

		/**
		 * Insert this package's stylesheet once.
		 *
		 * A packaged client bundle owns its CSS: the class names are hashed per
		 * package by the build, so the tag carries `data-plugin-css` (the module
		 * system's eviction key) and `data-plugin` (this package).
		 *
		 * @returns disposer removing the tag this call created.
		 */
		function insertStyles() {
			const tagId = "dsh-deepseek-usage/client.css";
			if (typeof document === "undefined") return () => {};
			const existing = document.querySelector(`style[data-plugin-css=${JSON.stringify(tagId)}]`);
			if (existing) return () => {};
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-deepseek-usage";
			tag.dataset.pluginCss = tagId;
			tag.textContent = CSS;
			document.head.appendChild(tag);
			return () => tag.remove();
		}

		//#region helpers
		/** Shared label constants; the plugin stays locale-neutral (zh-CN copy). */
		const TEXT = {
			balance: "DeepSeek 余额",
			available: "可用",
			unavailable: "不可用",
			toppedUp: "充值余额",
			granted: "赠送余额",
			updated: "更新于",
			refresh: "刷新",
			close: "关闭",
			loading: "读取中…",
			cost: "本轮花费",
			tokens: "tokens",
			peak: "高峰价",
			offPeak: "低谷价",
			colItem: "项目",
			colTokens: "tokens",
			colUnitPrice: "单价 / 百万",
			uncachedInput: "未命中输入",
			cacheHit: "缓存命中输入",
			cacheWrite: "缓存写入",
			output: "输出",
			reasoning: "其中思考",
			model: "模型",
			steps: "步数",
		};

		/** Number formatting with thousands separators. */
		function formatTokens(value) {
			if (typeof value !== "number" || !Number.isFinite(value)) return "0";
			return value.toLocaleString("en-US");
		}

		/** Adaptive money text: more decimals for amounts below one unit. */
		function formatMoney(value, symbol) {
			if (typeof value !== "number" || !Number.isFinite(value)) return "—";
			const abs = Math.abs(value);
			const digits = abs >= 100 ? 2 : abs >= 1 ? 3 : 4;
			return `${symbol ?? ""}${value.toFixed(digits)}`;
		}

		/** Four decimals, trimmed of trailing zeros: 1.065 -> "1.065", 0.15 -> "0.15". */
		function round4(value) {
			if (typeof value !== "number" || !Number.isFinite(value)) return "—";
			return String(Math.round(value * 10000) / 10000);
		}

		/** Same-origin GET with JSON decoding and no caching. */
		async function getJson(path, options) {
			const response = await fetch(path, { cache: "no-store", credentials: "same-origin", ...options });
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			return response.json();
		}

		/**
		 * Poll the plugin's summary route.
		 *
		 * The route gives no push channel, so the browser half refreshes on a
		 * timer that runs only while the page is visible, plus on focus and on
		 * tab visibility changes. The previous unforced read stays on screen
		 * while a refresh is in flight, so polling never blanks the UI.
		 *
		 * @param sessionId - current Session id, or null before one is bound.
		 * @param intervalMs - polling period in milliseconds.
		 * @returns current data, refresh action, and force-refresh action.
		 */
		function useUsageSummary(sessionId, intervalMs) {
			const [state, setState] = React.useState({ data: null, error: null });
			const [nonce, setNonce] = React.useState(0);
			const latest = React.useRef(null);

			React.useEffect(() => {
				let alive = true;
				const load = async (refresh) => {
					const params = new URLSearchParams();
					if (sessionId) params.set("sessionId", sessionId);
					if (refresh) params.set("refresh", "1");
					const query = params.toString();
					try {
						const next = await getJson(`/deepseek-usage/summary${query ? `?${query}` : ""}`);
						if (!alive) return;
						const previous = latest.current;
						latest.current = next;
						const changed =
							!previous ||
							previous.balance?.at !== next.balance?.at ||
							previous.balance?.ok !== next.balance?.ok ||
							previous.balance?.error !== next.balance?.error ||
							JSON.stringify(previous.turns) !== JSON.stringify(next.turns);
						if (changed) setState({ data: next, error: null });
						else setState((current) => (current.error === null ? current : { ...current, error: null }));
					} catch (failure) {
						if (!alive) return;
						const message = failure instanceof Error ? failure.message : String(failure);
						setState((current) => (current.error === message ? current : { ...current, error: message }));
					}
				};
				load(nonce > 0);
				const timer = window.setInterval(() => {
					if (document.visibilityState === "visible") load(false);
				}, intervalMs);
				const onVisible = () => {
					if (document.visibilityState === "visible") load(false);
				};
				document.addEventListener("visibilitychange", onVisible);
				window.addEventListener("focus", onVisible);
				return () => {
					alive = false;
					window.clearInterval(timer);
					document.removeEventListener("visibilitychange", onVisible);
					window.removeEventListener("focus", onVisible);
				};
			}, [sessionId, intervalMs, nonce]);

			const refresh = React.useCallback(() => setNonce((value) => value + 1), []);
			return { data: state.data, error: state.error, refresh };
		}
		//#endregion

		//#region sidebar balance
		/** Balance colour class by remaining ratio against the topped-up amount. */
		function balanceTone(balance) {
			if (!balance || balance.ok !== true) return "dsu-dot-bad";
			if (balance.isAvailable === false) return "dsu-dot-low";
			if (balance.totalBalance <= 0) return "dsu-dot-bad";
			if (balance.totalBalance < 1) return "dsu-dot-low";
			return "dsu-dot-ok";
		}

		/** Anchored details panel placed next to the sidebar trigger. */
		function BalancePanel({ data, error, refresh, onClose, anchor }) {
			const balance = data?.balance;
			const symbol = data?.symbol ?? "";
			const rows = [];
			if (balance && balance.ok === true) {
				rows.push([TEXT.available, balance.isAvailable === false ? TEXT.unavailable : TEXT.available]);
				rows.push([TEXT.toppedUp, formatMoney(balance.toppedUpBalance, symbol)]);
				rows.push([TEXT.granted, formatMoney(balance.grantedBalance, symbol)]);
			}
			const style = anchor
				? { left: `${Math.round(anchor.left)}px`, bottom: `${Math.round(anchor.bottom)}px` }
				: { left: "16px", bottom: "16px" };
			return React.createElement(
				"div",
				{ className: "dsu-panel", style, role: "dialog", "aria-label": TEXT.balance },
				React.createElement(
					"div",
					{ className: "dsu-panel-title" },
					React.createElement("span", null, TEXT.balance),
					React.createElement(
						"button",
						{ type: "button", className: "dsu-action", onClick: onClose, "aria-label": TEXT.close },
						TEXT.close,
					),
				),
				rows.length > 0
					? React.createElement(
							"dl",
							{ className: "dsu-rows" },
							rows.flatMap(([key, value]) => [
								React.createElement("dt", { key: `${key}-k` }, key),
								React.createElement("dd", { key: `${key}-v` }, value),
							]),
						)
					: React.createElement("div", { className: "dsu-muted" }, balance?.error ?? TEXT.loading),
				balance?.at
					? React.createElement(
							"div",
							{ className: "dsu-muted", style: { marginTop: "8px" } },
							`${TEXT.updated} ${new Date(balance.at).toLocaleTimeString()}`,
						)
					: null,
				error ? React.createElement("div", { className: "dsu-error" }, error) : null,
				React.createElement(
					"div",
					{ className: "dsu-actions" },
					React.createElement("button", { type: "button", className: "dsu-action", onClick: refresh }, TEXT.refresh),
				),
			);
		}

		/**
		 * Sidebar-foot balance display.
		 * @param props - the sidebar footer action's `{ wide }` owner share.
		 */
		function BalanceAction({ wide }) {
			const { data, error, refresh } = useUsageSummary(null, 60000);
			const [open, setOpen] = React.useState(false);
			const [anchor, setAnchor] = React.useState(null);
			const trigger = React.useRef(null);

			const toggle = React.useCallback(() => {
				const node = trigger.current;
				if (node && typeof node.getBoundingClientRect === "function") {
					const rect = node.getBoundingClientRect();
					setAnchor({ left: rect.left, bottom: Math.max(8, window.innerHeight - rect.top + 8) });
				}
				setOpen((value) => !value);
			}, []);

			React.useEffect(() => {
				if (!open) return undefined;
				const onKey = (event) => {
					if (event.key === "Escape") setOpen(false);
				};
				document.addEventListener("keydown", onKey);
				return () => document.removeEventListener("keydown", onKey);
			}, [open]);

			const balance = data?.balance;
			const symbol = data?.symbol ?? "";
			const tone = balanceTone(balance);
			const text =
				balance && balance.ok === true
					? formatMoney(balance.totalBalance, symbol)
					: balance
						? "!"
						: "…";

			if (!wide) {
				return React.createElement(
					"div",
					{ className: "dsu-root" },
					React.createElement(
						"button",
						{
							ref: trigger,
							type: "button",
							className: "dsu-rail",
							onClick: toggle,
							title: `${TEXT.balance} ${text}`,
							"aria-label": `${TEXT.balance} ${text}`,
						},
						React.createElement("span", { className: `dsu-dot ${tone}` }),
					),
					open ? React.createElement(BalancePanel, { data, error, refresh, anchor, onClose: () => setOpen(false) }) : null,
				);
			}

			return React.createElement(
				"div",
				{ className: "dsu-root" },
				React.createElement(
					"button",
					{
						ref: trigger,
						type: "button",
						className: "dsu-button",
						onClick: toggle,
						"aria-expanded": open,
						title: TEXT.balance,
					},
					React.createElement("span", { className: `dsu-dot ${tone}` }),
					React.createElement("span", { className: "dsu-grow" }, TEXT.balance),
					React.createElement("span", { className: "dsu-amount" }, text),
				),
				open ? React.createElement(BalancePanel, { data, error, refresh, anchor, onClose: () => setOpen(false) }) : null,
			);
		}
		//#endregion

		//#region per-turn cost
		/** One token bucket row of the breakdown grid. */
		function BucketRows({ rows }) {
			return rows.flatMap(([label, tokens, rate]) => [
				React.createElement("div", { className: "dsu-k", key: `${label}-k` }, label),
				React.createElement("div", { className: "dsu-v", key: `${label}-v` }, formatTokens(tokens)),
				React.createElement("div", { className: "dsu-rate", key: `${label}-r` }, rate),
			]);
		}

		/**
		 * The breakdown's column headers.
		 *
		 * Returns its three cells as a flat array rather than wrapping them in a
		 * fragment, so the grid receives the header cells as direct children and
		 * no `Symbol`-keyed type is needed at runtime.
		 *
		 * @param props - the three header labels.
		 */
		function BreakdownHeader({ columns }) {
			const [first, second, third] = columns;
			return [
				React.createElement("div", { className: "dsu-head dsu-k", key: "head-1" }, first),
				React.createElement("div", { className: "dsu-head dsu-v", key: "head-2" }, second),
				React.createElement("div", { className: "dsu-head dsu-rate", key: "head-3" }, third),
			];
		}

		/**
		 * Expanded per-Turn accounting, in the balance's own currency.
		 *
		 * The host prices in that same currency, so every figure here is printed
		 * as served — there is no exchange rate anywhere in this plugin. No row
		 * ever renders an empty cell: a missing price shows an explicit dash. A
		 * three-cell header row names the columns; there is no trailing
		 * full-width note, because that is what pushed the price column out of
		 * view.
		 *
		 * @param props - the Turn's token buckets, the priced unit rates, model,
		 *   pricing window, step count, and the balance symbol.
		 */
		function TurnBreakdown({ tokens, rates, model, rate, steps, symbol }) {
			const buckets = tokens ?? {};
			const prices = rates ?? {};
			/**
			 * One unit price. The host prices in the balance's currency, so this
			 * prints the rate as served — there is no exchange rate to apply.
			 * @param value - the rate in the balance currency per million tokens.
			 * @returns `¥1`, or `—` when the host served no rate for it.
			 */
			const perMillion = (value) =>
				typeof value === "number" && Number.isFinite(value) ? `${symbol ?? ""}${round4(value)}` : "—";
			return React.createElement(
				"div",
				{ className: "dsu-breakdown" },
				React.createElement(BreakdownHeader, { columns: [TEXT.colItem, TEXT.colTokens, TEXT.colUnitPrice] }),
				React.createElement(BucketRows, {
					rows: [
						[TEXT.uncachedInput, buckets.uncachedInput ?? 0, perMillion(prices.miss)],
						[TEXT.cacheHit, buckets.cacheHit ?? 0, perMillion(prices.hit)],
						[TEXT.cacheWrite, buckets.cacheWrite ?? 0, perMillion(prices.miss)],
						[TEXT.output, buckets.output ?? 0, perMillion(prices.output)],
					],
				}),
				React.createElement("div", { className: "dsu-k" }, TEXT.reasoning),
				React.createElement("div", { className: "dsu-v" }, formatTokens(buckets.reasoning ?? 0)),
				React.createElement("div", { className: "dsu-rate" }, ""),
				React.createElement("div", { className: "dsu-k" }, TEXT.model),
				React.createElement("div", { className: "dsu-v" }, model ?? "—"),
				React.createElement("div", { className: "dsu-rate" }, rate === "peak" ? TEXT.peak : TEXT.offPeak),
				React.createElement("div", { className: "dsu-k" }, TEXT.steps),
				React.createElement("div", { className: "dsu-v" }, String(steps ?? 0)),
				React.createElement("div", { className: "dsu-rate" }, ""),
			);
		}

		/**
		 * Resolve the Turn number a contribution was rendered for.
		 *
		 * The declared owner currency types `turn` as a number, but the shipped
		 * Turn-tail renderer forwards whatever its own node carries, and in this
		 * assembly that is a `TurnLocation` object. Both shapes are accepted: a
		 * raw number, or an object exposing the number as `turn` (with the
		 * `turn/start` event payload as a last resort). Reading the object as a
		 * number is what made every Turn look unpriced, so resolution is explicit.
		 *
		 * @param value - the owner's `turn` prop.
		 * @returns the Turn number, or undefined when neither shape answers.
		 */
		function turnNumberOf(value) {
			if (typeof value === "number" && Number.isFinite(value)) return value;
			if (value && typeof value === "object") {
				if (typeof value.turn === "number" && Number.isFinite(value.turn)) return value.turn;
				const started = value.start?.data?.turn;
				if (typeof started === "number" && Number.isFinite(started)) return started;
			}
			return undefined;
		}

		/**
		 * Turn-tail cost contribution: the amount this Turn cost, with an
		 * expandable token breakdown.
		 * @param props - the slot's `{ turn, seq }` owner share plus the seat's
		 *   injected session id (a bare string, or an object on assemblies that
		 *   wrap the inject result).
		 */
		function TurnCostTail(props) {
			const raw = props.sessionId ?? props.session;
			const sessionId = typeof raw === "string" ? raw : raw && typeof raw === "object" ? raw.sessionId : undefined;
			const turn = turnNumberOf(props.turn);
			const { data, error, refresh } = useUsageSummary(sessionId, 5000);
			const [open, setOpen] = React.useState(false);
			const entry = data?.turns && turn !== undefined ? data.turns[String(turn)] : undefined;
			const symbol = data?.symbol ?? "";

			if (!entry) {
				// Distinct causes, each with its own copy — plus the raw facts, so
				// a wrong-looking row can be diagnosed without opening a console:
				//   no data        → the request has not answered yet, or failed;
				//   no session id  → the seat never received the Session identity;
				//   no Turn number → the owner currency carried no usable number;
				//   unknown Turn   → the host priced other Turns but not this
				//                    number (a real mismatch, not just timing);
				//   newest Turn    → nothing newer is priced, so it is still open.
				const priced = Object.keys(data?.turns ?? {}).sort((a, b) => Number(a) - Number(b));
				const newest = priced.length > 0 ? Number(priced[priced.length - 1]) : undefined;
				const detail = `本轮${turn === undefined ? "号不可用" : ` ${turn}`} · 已计价 [${priced.join(",") || "无"}] · 会话尾部 ${String(data?.sessionId ?? sessionId ?? "(未回传)").slice(-8)}`;
				const note = !data
					? error
						? `花费明细不可用（${error}）`
						: "花费统计中…"
					: !sessionId
						? `会话标识不可用 · ${detail}`
						: turn === undefined
							? `轮次号解析失败（请反馈此条）· ${detail}`
							: newest !== undefined && turn < newest
								? `本轮未计价（宿主已算到第 ${newest} 轮，请反馈此条）· ${detail}`
								: `本轮进行中，结束后计价 · ${detail}`;
				return React.createElement(
					"div",
					{ className: "dsu-turn" },
					React.createElement("span", { className: "dsu-muted" }, note),
				);
			}

			const tokens = entry.tokens ?? {};
			return React.createElement(
				"div",
				{ className: "dsu-turn" },
				React.createElement(
					"button",
					{
						type: "button",
						className: "dsu-pill dsu-pill-button",
						onClick: () => {
							setOpen((value) => !value);
							refresh();
						},
						"aria-expanded": open,
						title: `${TEXT.cost} ${formatMoney(entry.amount, symbol)} · ${TEXT.tokens} ${formatTokens(tokens.total ?? 0)} · ${entry.model ?? ""}`,
					},
					React.createElement("span", null, `${TEXT.cost} `),
					React.createElement("span", { className: "dsu-cost" }, formatMoney(entry.amount, symbol)),
				),
				open
					? React.createElement(TurnBreakdown, {
							tokens,
							rates: entry.rates,
							model: entry.model,
							rate: entry.rate,
							steps: entry.steps,
							symbol,
						})
					: null,
			);
		}
		//#endregion

		/**
		 * Install the browser half.
		 * @param ctx - the client cordis context.
		 */
		function apply(ctx) {
			ctx.effect(() => insertStyles(), "deepseek-usage: styles");

			ctx.slots.inject("sidebar.footer.action", () =>
				ctx.slots.register(
					{
						name: "sidebar.footer.action",
						id: "deepseek-usage-balance",
						order: 30,
					},
					BalanceAction,
				),
			);

			ctx.slots.inject("conversation.chat.turnTail", () =>
				ctx.slots.register(
					{
						name: "conversation.chat.turnTail",
						id: "deepseek-usage-turn-cost",
						order: 20,
						inject: (sessionId) => ({ sessionId }),
					},
					TurnCostTail,
				),
			);
		}

		exports.apply = apply;
		exports.inject = ["slots"];
		// Exported for the offline render checks: the expanded accounting reads no
		// hooks, and the Turn-number resolver is pure, so a suite can exercise
		// both with a priced Turn and each owner currency shape.
		exports.TurnBreakdown = TurnBreakdown;
		exports.turnNumberOf = turnNumberOf;
		return module.exports;
	},
});
