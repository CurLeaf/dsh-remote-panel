/**
 * Browser half of `dsh-remote-panel`.
 *
 * 手写、无构建步骤：遵循 DSH 客户端包的加载契约
 * `window.__ModuleLoader__.load({ id, factory(require) })`，从 factory 返回
 * `{ inject, apply }` 即可。`require` 可解析的外置模块由宿主固定提供：
 * react、react/jsx-runtime、react-dom、@deepseek-ai/dsh-client-ui-slots 等。
 *
 * 面板挂在 `settings.section` 插槽，即「设置」里的一个分区。
 */

window.__ModuleLoader__.load({
	id: 'remote-panel',
	factory: (require) => {
		const React = require('react')
		const { jsx, jsxs } = require('react/jsx-runtime')
		const { useCallback, useEffect, useState } = React

		const API = '/remote-panel/api'
		const TOKEN_GLOBAL = '__DSH_REMOTE_PANEL__'
		const TOKEN_HEADER = 'x-dsh-remote-panel'

		const stroke = 'var(--dsw-elevation-stroke-color, rgba(128,128,128,.24))'

		const styles = {
			wrap: { display: 'flex', flexDirection: 'column', gap: 16, fontSize: 13, lineHeight: 1.6 },
			card: { border: `1px solid ${stroke}`, borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 },
			title: { fontSize: 14, fontWeight: 600, margin: 0 },
			muted: { opacity: 0.65, margin: 0 },
			row: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
			grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 },
			field: { display: 'flex', flexDirection: 'column', gap: 4 },
			label: { fontSize: 12, opacity: 0.75 },
			hint: { fontSize: 11, opacity: 0.5 },
			input: {
				font: 'inherit',
				padding: '6px 8px',
				borderRadius: 8,
				border: `1px solid ${stroke}`,
				background: 'transparent',
				color: 'inherit',
				minWidth: 0,
			},
			button: {
				font: 'inherit',
				cursor: 'pointer',
				border: `1px solid ${stroke}`,
				borderRadius: 8,
				padding: '4px 10px',
				background: 'transparent',
				color: 'inherit',
			},
			primary: {
				font: 'inherit',
				cursor: 'pointer',
				border: '1px solid transparent',
				borderRadius: 8,
				padding: '6px 14px',
				background: 'var(--dsh-boot-brand, #4d6bfe)',
				color: '#fff',
			},
			code: {
				fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
				fontSize: 12,
				background: 'rgba(128,128,128,.08)',
				borderRadius: 8,
				padding: '8px 10px',
				whiteSpace: 'pre-wrap',
				wordBreak: 'break-all',
				maxHeight: 260,
				overflow: 'auto',
				margin: 0,
			},
			dot: (state) => ({
				width: 8,
				height: 8,
				borderRadius: '50%',
				display: 'inline-block',
				background: state === 'ok' ? '#3fb950' : state === 'bad' ? '#d1242f' : 'rgba(128,128,128,.6)',
			}),
			error: { color: '#d1242f', margin: 0 },
		}

		function token() {
			const value = globalThis[TOKEN_GLOBAL]
			return typeof value === 'string' ? value : undefined
		}

		async function callApi(path, init) {
			const value = token()
			if (value === undefined) throw new Error('面板令牌未注入：请刷新页面')
			const response = await fetch(API + path, {
				...init,
				headers: { ...(init?.headers ?? {}), [TOKEN_HEADER]: value },
				credentials: 'same-origin',
			})
			const body = await response.json().catch(() => ({}))
			if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`)
			return body
		}

		function randomToken(length) {
			const bytes = new Uint8Array(48)
			crypto.getRandomValues(bytes)
			return btoa(String.fromCharCode(...bytes))
				.replace(/\+/g, '-')
				.replace(/\//g, '_')
				.replace(/=+$/, '')
				.slice(0, length)
		}

		function downloadScript(text) {
			const blob = new Blob([text], { type: 'text/x-shellscript;charset=utf-8' })
			const url = URL.createObjectURL(blob)
			const anchor = document.createElement('a')
			anchor.href = url
			anchor.download = 'dsh-remote-panel.sh'
			document.body.appendChild(anchor)
			anchor.click()
			anchor.remove()
			setTimeout(() => URL.revokeObjectURL(url), 1000)
		}

		async function copyText(text) {
			try {
				await navigator.clipboard.writeText(text)
				return true
			} catch {
				const area = document.createElement('textarea')
				area.value = text
				area.style.position = 'fixed'
				area.style.opacity = '0'
				document.body.appendChild(area)
				area.select()
				const ok = document.execCommand?.('copy') ?? false
				area.remove()
				return ok
			}
		}

		function Field({ label, hint, children }) {
			return jsxs('label', {
				style: styles.field,
				children: [
					jsx('span', { style: styles.label, children: label }),
					children,
					hint === undefined ? null : jsx('span', { style: styles.hint, children: hint }),
				],
			})
		}

		function StatusCard() {
			const [state, setState] = useState({ kind: 'loading' })

			const refresh = useCallback(() => {
				setState({ kind: 'loading' })
				callApi('/status')
					.then((data) => setState({ kind: 'ok', data }))
					.catch((error) => setState({ kind: 'error', message: error.message }))
			}, [])

			useEffect(refresh, [refresh])

			const ok = state.kind === 'ok'
			return jsxs('div', {
				style: styles.card,
				children: [
					jsxs('div', {
						style: styles.row,
						children: [
							jsx('span', { style: styles.dot(ok ? 'ok' : state.kind === 'error' ? 'bad' : 'idle') }),
							jsx('strong', { style: styles.title, children: '控制面' }),
							jsx('span', {
								style: styles.muted,
								children: ok ? `v${state.data.version}` : state.kind === 'error' ? '不可用' : '检测中…',
							}),
							jsx('button', { type: 'button', style: styles.button, onClick: refresh, children: '刷新' }),
						],
					}),
					state.kind === 'error' && jsx('p', { style: styles.error, children: state.message }),
					ok && jsx('p', { style: styles.muted, children: `运行 ${state.data.uptimeSeconds}s` }),
				],
			})
		}

		const FIELDS = [
			['relay', '中继地址', 'host:port，或 tcp://…;ws://… 多条'],
			['networkName', '网络名', '所有设备必须一致'],
			['networkSecret', '网络密钥', '16 位以上，仅字母数字-_'],
			['virtualIp', '本机虚拟 IP', '需要在网段内且未被占用'],
			['port', '反代端口', '手机访问用，默认 8710'],
			['accessKey', '访问口令', '首次配对用，可随时更换'],
		]

		const ADVANCED = [
			['upstreamPort', 'DSH 端口', '默认 3080'],
			['lanCidr', '局域网白名单', '家里 Wi-Fi 应急入口'],
			['user', '运行用户', 'Caddy 以该用户身份运行'],
			['home', '用户目录', '用户级 systemd 单元位置'],
			['etVersion', 'EasyTier 版本', '固定版本便于复现'],
		]

		function WizardCard() {
			const [defaults, setDefaults] = useState(null)
			const [loadError, setLoadError] = useState(null)

			useEffect(() => {
				callApi('/defaults')
					.then(setDefaults)
					.catch((error) => setLoadError(error.message))
			}, [])

			if (loadError !== null) {
				return jsxs('div', {
					style: styles.card,
					children: [
						jsx('strong', { style: styles.title, children: '部署向导' }),
						jsx('p', { style: styles.error, children: loadError }),
					],
				})
			}
			if (defaults === null) {
				return jsx('div', { style: styles.card, children: jsx('p', { style: styles.muted, children: '读取本机默认值…' }) })
			}
			return jsx(Wizard, { defaults })
		}

		function Wizard({ defaults }) {
			const [form, setForm] = useState(() => ({ ...defaults }))
			const [result, setResult] = useState(null)
			const [error, setError] = useState(null)
			const [busy, setBusy] = useState(false)
			const [copied, setCopied] = useState(null)

			const set = (key) => (event) => {
				const value = event?.target?.value ?? event
				setForm((current) => ({ ...current, [key]: value }))
			}

			const generate = async () => {
				setBusy(true)
				setError(null)
				try {
					const payload = { ...form }
					for (const key of ['port', 'upstreamPort']) payload[key] = Number(payload[key])
					setResult(await callApi('/render', {
						method: 'POST',
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify(payload),
					}))
				} catch (failure) {
					setError(failure.message)
					setResult(null)
				} finally {
					setBusy(false)
				}
			}

			const flash = async (text, label) => {
				await copyText(text)
				setCopied(label)
				setTimeout(() => setCopied(null), 1500)
			}

			const handoff = result === null ? '' : HANDOFF(result)

			return jsxs('div', {
				style: styles.card,
				children: [
					jsxs('div', {
						style: styles.row,
						children: [
							jsx('strong', { style: styles.title, children: '部署向导' }),
							jsx('span', { style: styles.muted, children: '填三项就能生成脚本' }),
						],
					}),
					jsxs('div', {
						style: styles.grid,
						children: FIELDS.map(([key, label, hint]) =>
							jsx(
								Field,
								{
									label,
									hint,
									children: jsx('input', {
										style: styles.input,
										value: form[key] ?? '',
										onChange: set(key),
										spellCheck: false,
									}),
								},
								key,
							),
						),
					}),
					jsxs('div', {
						style: styles.row,
						children: [
							jsx('button', {
								type: 'button',
								style: styles.button,
								onClick: () => setForm((c) => ({ ...c, accessKey: randomToken(24) })),
								children: '换口令',
							}),
							jsx('button', {
								type: 'button',
								style: styles.button,
								onClick: () => setForm((c) => ({ ...c, networkSecret: randomToken(32) })),
								children: '换网络密钥',
							}),
							jsx('button', {
								type: 'button',
								style: styles.primary,
								disabled: busy,
								onClick: generate,
								children: busy ? '生成中…' : '生成部署脚本',
							}),
						],
					}),
					jsx('details', {
						children: [
							jsx('summary', { style: styles.muted, children: '高级选项' }),
							jsxs('div', {
								style: { ...styles.grid, marginTop: 8 },
								children: ADVANCED.map(([key, label, hint]) =>
									jsx(
										Field,
										{
											label,
											hint,
											children: jsx('input', {
												style: styles.input,
												value: form[key] ?? '',
												onChange: set(key),
												spellCheck: false,
											}),
										},
										key,
									),
								),
							}),
						],
					}),
					error === null ? null : jsx('p', { style: styles.error, children: error }),
					result === null
						? null
						: jsxs('div', {
								style: { display: 'flex', flexDirection: 'column', gap: 8 },
								children: [
									jsx('hr', { style: { border: 0, borderTop: `1px solid ${stroke}`, width: '100%' } }),
									jsxs('div', {
										style: styles.row,
										children: [
											jsx('strong', { children: '交给目标机器的 AI' }),
											jsx('button', {
												type: 'button',
												style: styles.button,
												onClick: () => flash(handoff, 'handoff'),
												children: copied === 'handoff' ? '已复制' : '复制任务',
											}),
											jsx('button', {
												type: 'button',
												style: styles.button,
												onClick: () => flash(result.install, 'script'),
												children: copied === 'script' ? '已复制' : '只复制脚本',
											}),
											jsx('button', {
												type: 'button',
												style: styles.button,
												onClick: () => downloadScript(result.install),
												children: '下载 .sh',
											}),
										],
									}),
									jsx('pre', { style: styles.code, children: result.install }),
									jsxs('div', {
										style: styles.row,
										children: [
											jsx('span', { style: styles.muted, children: '部署后访问：' }),
											jsx('code', { children: result.summary.urls.mesh }),
										],
									}),
								],
							}),
				],
			})
		}

		function HANDOFF(result) {
			const lines = [
				'请在当前机器上以 root 执行下面的部署脚本（幂等，可重复执行）。',
				'它只做两件事：装一个用户级 Caddy 反代，装一个 system 级 EasyTier 节点。',
				'执行完请把最后一行 `DSH_REMOTE_OK ...` 原样回贴给我，不要改动其中任何一个字符。',
				'',
				'```bash',
				result.install.trimEnd(),
				'```',
			]
			return lines.join('\n')
		}

		function Panel() {
			return jsxs('div', {
				style: styles.wrap,
				children: [jsx(StatusCard, {}), jsx(WizardCard, {})],
			})
		}

		function apply(ctx) {
			ctx.slots.inject('settings.section', () =>
				ctx.slots.register(
					{
						name: 'settings.section',
						id: 'remote-panel',
						order: 40,
						label: () => '远程访问',
					},
					Panel,
				),
			)
		}

		return { inject: ['slots'], apply }
	},
})
