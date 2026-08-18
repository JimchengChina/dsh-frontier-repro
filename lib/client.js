window.__ModuleLoader__.load({
	id: "dsh-frontier-repro",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/index.jsx
		const SETTINGS_NS = "frontier-repro";
		const LOCALE_NS = "frontier-repro.settings";
		const DEFAULT_REF = "X_BEARER_TOKEN";
		const en = {
			title: "Frontier Repro",
			description: "Optional X API access for verified frontier-AI person sources.",
			expand: "Show settings",
			collapse: "Hide settings",
			optional: "Optional",
			configured: "Configured",
			disabled: "Not configured · X sources are off",
			explanation: "Without an X API token, X sources are skipped by default. arXiv, official lab blogs, GitHub, and Hugging Face continue to work.",
			token: "X API bearer token",
			tokenHint: "Write-only credential. The value is never returned to this page, plugin output, or the corpus.",
			placeholder: "Paste a new bearer token",
			save: "Save X API token",
			saving: "Saving…",
			saved: "The X credential is configured. X sources will be included in default collection.",
			required: "Enter a non-empty bearer token.",
			readOnly: "This credential is supplied by a read-only environment layer. Change it outside DSH and restart.",
			loadFailed: "Could not read the credential state. You can still try saving a token."
		};
		const zh = {
			title: "Frontier Repro",
			description: "为经过身份核验的前沿 AI 人物信源配置可选的 X API。",
			expand: "展开设置",
			collapse: "收起设置",
			optional: "可选",
			configured: "已配置",
			disabled: "未配置 · X 信源已关闭",
			explanation: "不配置 X API 时，默认采集会跳过 X 信源；arXiv、实验室官网、GitHub 和 Hugging Face 等其他信源照常工作。",
			token: "X API Bearer Token",
			tokenHint: "密钥只写不回显，不会进入页面响应、插件输出或本地语料库。",
			placeholder: "粘贴新的 Bearer Token",
			save: "保存 X API Token",
			saving: "保存中…",
			saved: "X 凭证已配置；后续默认采集会启用 X 信源。",
			required: "请输入非空的 Bearer Token。",
			readOnly: "该凭证来自只读环境变量，请在 DSH 外部修改后重启。",
			loadFailed: "无法读取凭证状态，但仍可尝试保存 Token。"
		};
		const styles = {
			card: {
				listStyle: "none",
				border: "1px solid var(--dsw-alias-border-l2)",
				borderRadius: 12,
				background: "var(--dsw-alias-bg-layer-3)",
				overflow: "hidden"
			},
			header: {
				width: "100%",
				border: 0,
				background: "none",
				color: "inherit",
				cursor: "pointer",
				display: "flex",
				alignItems: "center",
				gap: 12,
				padding: "14px 16px",
				textAlign: "left",
				font: "inherit"
			},
			headText: {
				flex: 1,
				minWidth: 0,
				display: "flex",
				flexDirection: "column",
				gap: 4
			},
			name: {
				fontSize: 15,
				fontWeight: 600,
				lineHeight: 1.4,
				color: "var(--dsw-alias-label-primary)"
			},
			description: {
				fontSize: 13,
				lineHeight: 1.5,
				color: "var(--dsw-alias-label-tertiary)"
			},
			badge: {
				borderRadius: 999,
				padding: "1px 8px",
				fontSize: 11,
				lineHeight: "17px",
				whiteSpace: "nowrap",
				background: "var(--dsw-alias-bg-module-platform)",
				color: "var(--dsw-alias-label-secondary)"
			},
			body: {
				borderTop: "1px solid var(--dsw-alias-border-l2)",
				margin: "0 16px",
				padding: "14px 0 12px"
			},
			explanation: {
				margin: "0 0 14px",
				fontSize: 13,
				lineHeight: 1.6,
				color: "var(--dsw-alias-label-secondary)"
			},
			labelRow: {
				display: "flex",
				alignItems: "center",
				gap: 8,
				marginBottom: 6
			},
			label: {
				flex: 1,
				fontSize: 13,
				fontWeight: 500,
				color: "var(--dsw-alias-label-primary)"
			},
			input: {
				width: "100%",
				boxSizing: "border-box",
				height: 36,
				padding: "0 12px",
				border: "1px solid var(--dsw-alias-border-l2)",
				borderRadius: 8,
				background: "var(--dsw-alias-bg-layer-3)",
				color: "var(--dsw-alias-label-primary)",
				font: "inherit",
				fontSize: 13
			},
			hint: {
				margin: "6px 0 0",
				fontSize: 12,
				lineHeight: 1.5,
				color: "var(--dsw-alias-label-tertiary)"
			},
			error: {
				margin: "8px 0 0",
				fontSize: 12,
				lineHeight: 1.5,
				color: "var(--dsw-alias-label-error)"
			},
			success: {
				margin: "8px 0 0",
				fontSize: 12,
				lineHeight: 1.5,
				color: "var(--dsw-alias-label-secondary)"
			},
			footer: {
				display: "flex",
				justifyContent: "flex-end",
				marginTop: 14,
				paddingTop: 12,
				borderTop: "1px solid var(--dsw-alias-border-l2)"
			},
			save: {
				appearance: "none",
				border: 0,
				borderRadius: 8,
				padding: "6px 14px",
				background: "var(--dsw-alias-label-primary)",
				color: "var(--dsw-alias-bg-layer-3)",
				font: "inherit",
				fontSize: 13,
				cursor: "pointer"
			}
		};
		function messageOf(response, fallback) {
			return response?.result?.ok === false ? response.result.error.message : fallback;
		}
		async function describe(api) {
			let ref = DEFAULT_REF;
			const settings = await api.settings.describe({});
			if (settings.result.ok) {
				const configuredRef = settings.result.value.namespaces.find((item) => item.ns === SETTINGS_NS)?.value?.xBearerTokenEnv;
				if (typeof configuredRef === "string" && configuredRef.length > 0) ref = configuredRef;
			}
			const response = await api.credentials.describe({ refs: [ref] });
			if (!response.result.ok) throw new Error(response.result.error.message);
			const view = response.result.value.credentials[ref];
			return {
				ref,
				configured: view?.configured ?? false,
				writable: view?.writable ?? true
			};
		}
		function FrontierReproCard({ api, t }) {
			const text = (key) => t?.(key) ?? en[key];
			const [open, setOpen] = (0, react.useState)(false);
			const [ref, setRef] = (0, react.useState)(DEFAULT_REF);
			const [configured, setConfigured] = (0, react.useState)(false);
			const [writable, setWritable] = (0, react.useState)(true);
			const [draft, setDraft] = (0, react.useState)("");
			const [busy, setBusy] = (0, react.useState)(false);
			const [notice, setNotice] = (0, react.useState)(void 0);
			const [failed, setFailed] = (0, react.useState)(void 0);
			const refresh = (0, react.useCallback)(async () => {
				try {
					const state = await describe(api);
					setRef(state.ref);
					setConfigured(state.configured);
					setWritable(state.writable);
					setFailed(void 0);
				} catch {
					setFailed(text("loadFailed"));
				}
			}, [api]);
			(0, react.useEffect)(() => {
				refresh();
			}, [refresh]);
			const save = async () => {
				const value = draft.trim();
				setNotice(void 0);
				if (value.length === 0) {
					setFailed(text("required"));
					return;
				}
				setBusy(true);
				setFailed(void 0);
				try {
					const response = await api.credentials.set({
						ref,
						value
					});
					if (!response.result.ok) {
						setFailed(messageOf(response, text("loadFailed")));
						return;
					}
					setDraft("");
					await refresh();
					setNotice(text("saved"));
				} catch (error) {
					setFailed(error instanceof Error ? error.message : text("loadFailed"));
				} finally {
					setBusy(false);
				}
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
				style: styles.card,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					style: styles.header,
					"aria-expanded": open,
					"aria-label": `${text(open ? "collapse" : "expand")}: ${text("title")}`,
					onClick: () => setOpen(!open),
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							style: styles.headText,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: styles.name,
								children: text("title")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: styles.description,
								children: text("description")
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: styles.badge,
							children: configured ? text("configured") : text("optional")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							"aria-hidden": "true",
							style: {
								transform: open ? "rotate(180deg)" : "none",
								transition: "transform .16s"
							},
							children: "⌄"
						})
					]
				}), open ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: styles.body,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							style: styles.explanation,
							children: text("explanation")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: styles.labelRow,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
								htmlFor: "frontier-repro-x-token",
								style: styles.label,
								children: text("token")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: styles.badge,
								children: configured ? text("configured") : text("disabled")
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							id: "frontier-repro-x-token",
							type: "password",
							autoComplete: "new-password",
							value: draft,
							placeholder: text("placeholder"),
							disabled: !writable || busy,
							style: styles.input,
							onChange: (event) => setDraft(event.target.value)
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
							style: styles.hint,
							children: [
								text("tokenHint"),
								" (",
								ref,
								")"
							]
						}),
						!writable ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							role: "status",
							style: styles.error,
							children: text("readOnly")
						}) : null,
						failed !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							role: "alert",
							style: styles.error,
							children: failed
						}) : null,
						notice !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							role: "status",
							style: styles.success,
							children: notice
						}) : null,
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: styles.footer,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								style: {
									...styles.save,
									opacity: !writable || busy ? .4 : 1
								},
								disabled: !writable || busy,
								onClick: () => {
									save();
								},
								children: text(busy ? "saving" : "save")
							})
						})
					]
				}) : null]
			});
		}
		const inject = [
			"slots",
			"locale",
			"connection"
		];
		function apply(ctx) {
			const { api } = ctx.get("connection");
			ctx.effect(() => ctx.locale.register(LOCALE_NS, {
				zh,
				en
			}), "frontier-repro: settings dictionaries");
			ctx.slots.inject("settings.plugin.item", () => ctx.slots.register({
				name: "settings.plugin.item",
				key: SETTINGS_NS,
				locale: LOCALE_NS,
				inject: () => ({ api })
			}, FrontierReproCard));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map