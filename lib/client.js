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
	// 必须等于包名：client-modules 按包名请求模块，id 不一致会「加载成功但未注册」
	id: 'dsh-remote-panel',
	factory: (require) => {
		const React = require('react')
		const { jsx, jsxs } = require('react/jsx-runtime')
		const { useCallback, useEffect, useRef, useState } = React

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

			useEffect(() => {
				refresh()
			}, [refresh])

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
			const [warning, setWarning] = useState(null)

			const set = (key) => (event) => {
				const value = event?.target?.value ?? event
				setForm((current) => ({ ...current, [key]: value }))
			}

			const generate = async () => {
				setBusy(true)
				setError(null)
				setWarning(null)
				try {
					try {
						const check = await callApi(`/ipcheck?ip=${encodeURIComponent(form.virtualIp)}`)
						if (check.reachable) setWarning(`${check.ip} 已有主机应答（${check.detail}），部署时很可能冲突`)
					} catch {
						// 预检失败不影响主流程，部署脚本自己会校验
					}
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
					warning === null ? null : jsx('p', { style: styles.hint, children: `⚠ ${warning}` }),
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


		function Dot({ ok }) {
			return jsx('span', { style: styles.dot(ok ? 'ok' : 'bad') })
		}

		function DataPlaneCard() {
			const [state, setState] = useState(null)
			const [probe, setProbe] = useState(null)
			const [error, setError] = useState(null)
			const [code, setCode] = useState('')
			const [busy, setBusy] = useState(false)
			const [rejects, setRejects] = useState([])

			const refresh = useCallback(async () => {
				try {
					const current = (await callApi('/state')).state
					setState(current)
					setProbe(current === null ? null : (await callApi('/probe')).probe)
					setRejects(current === null ? [] : (await callApi('/rejects')).entries)
					setError(null)
				} catch (failure) {
					setError(failure.message)
				}
			}, [])

			useEffect(() => {
				refresh()
			}, [refresh])

			const save = async () => {
				setBusy(true)
				setError(null)
				try {
					await callApi('/state', {
						method: 'POST',
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify({ code }),
					})
					setCode('')
					setEditing(false)
					await refresh()
				} catch (failure) {
					setError(failure.message)
				} finally {
					setBusy(false)
				}
			}

			const healthy = probe?.ok === true
			const rows = [
				['EasyTier', probe?.easytier, 'system 单元'],
				['Caddy 反代', probe?.caddy, '用户级单元'],
				['healthz', probe?.healthz ? { ok: probe.healthz.ok, state: String(probe.healthz.status ?? '-'), sub: probe.healthz.reason ?? '' } : null, '本机自测'],
			]

			return jsxs('div', {
				style: styles.card,
				children: [
					jsxs('div', {
						style: styles.row,
						children: [
							jsx(Dot, { ok: healthy }),
							jsx('strong', { style: styles.title, children: '数据面' }),
							jsx('span', {
								style: styles.muted,
								children: state === null ? '未部署' : `${state.ip}:${state.port}`,
							}),
							jsx('button', { type: 'button', style: styles.button, onClick: refresh, children: '重新检测' }),
						],
					}),
					warning === null ? null : jsx('p', { style: styles.hint, children: `⚠ ${warning}` }),
					error === null ? null : jsx('p', { style: styles.error, children: error }),
					state === null
						? jsxs('div', {
								style: { display: 'flex', flexDirection: 'column', gap: 6 },
								children: [
									jsx('p', {
										style: styles.muted,
										children: '跑完向导生成的脚本后，把它最后一行 DSH_REMOTE_OK ... 贴到下面。',
									}),
									jsx('textarea', {
										style: { ...styles.input, minHeight: 60, fontFamily: 'ui-monospace, monospace' },
										value: code,
										onChange: (event) => setCode(event.target.value),
										placeholder: 'DSH_REMOTE_OK eyJ2ZXJzaW9uIjoi...',
									}),
									jsx('div', {
										style: styles.row,
										children: jsx('button', {
											type: 'button',
											style: styles.primary,
											disabled: busy || code.trim() === '',
											onClick: save,
											children: busy ? '校验中…' : '校验并保存',
										}),
									}),
								],
							})
						: jsxs('div', {
								style: { display: 'flex', flexDirection: 'column', gap: 6 },
								children: [
									...rows.map(([label, item, hint]) =>
										jsxs('div', {
											style: styles.row,
											children: [
												jsx(Dot, { ok: item?.ok === true }),
												jsx('span', { style: { minWidth: 76 }, children: label }),
												jsx('span', { style: styles.muted, children: item?.ok ? item.state : `${item?.state ?? 'unknown'}${item?.sub ? ` · ${item.sub}` : ''}` }),
												jsx('span', { style: styles.hint, children: hint }),
											],
										}, label),
									),
									rejects.length === 0
										? null
										: jsx('details', {
												children: [
													jsx('summary', { style: styles.muted, children: `最近拒绝 ${rejects.length} 条` }),
													jsx('div', {
														style: { display: 'flex', flexDirection: 'column', gap: 2, marginTop: 6 },
														children: rejects.map((row, index) =>
															jsx('span', { style: styles.hint, children: `${row.status} ${row.ip || '-'} ${row.uri || ''}` }, index),
														),
													}),
												],
											}),
									jsxs('details', {
										children: [
											jsx('summary', { style: styles.muted, children: '重新回填' }),
											jsx('textarea', {
												style: { ...styles.input, minHeight: 60, fontFamily: 'ui-monospace, monospace', marginTop: 6 },
												value: code,
												onChange: (event) => setCode(event.target.value),
												placeholder: 'DSH_REMOTE_OK ...',
											}),
											jsx('button', {
												type: 'button',
												style: styles.button,
												disabled: busy || code.trim() === '',
												onClick: save,
												children: busy ? '校验中…' : '保存',
											}),
										],
									}),
								],
							}),
				],
			})
		}


		function PairCard() {
			const [state, setState] = useState({ kind: 'idle' })
			const [copied, setCopied] = useState(null)
			const [refreshKey, setRefreshKey] = useState(0)
			const [rotated, setRotated] = useState(false)
			const lastToken = useRef(null)

			useEffect(() => {
				const timer = setInterval(() => setRefreshKey((value) => value + 1), 60000)
				return () => clearInterval(timer)
			}, [])

			useEffect(() => {
				setState({ kind: 'loading' })
				callApi('/pair')
					.then((data) => {
						const next = data.urls?.token ?? null
						if (next !== null && lastToken.current !== null && next !== lastToken.current) {
							setRotated(true)
							setTimeout(() => setRotated(false), 8000)
						}
						lastToken.current = next
						setState({ kind: 'ok', data })
					})
					.catch((error) => setState({ kind: 'error', message: error.message }))
			}, [refreshKey])

			const flash = async (text, label) => {
				await copyText(text)
				setCopied(label)
				setTimeout(() => setCopied(null), 1500)
			}

			const data = state.kind === 'ok' ? state.data : null
			return jsxs('div', {
				style: styles.card,
				children: [
					jsxs('div', {
						style: styles.row,
						children: [
							jsx(Dot, { ok: data?.found === true }),
							jsx('strong', { style: styles.title, children: '配对' }),
							jsx('span', {
								style: styles.muted,
								children:
									state.kind === 'error'
										? '需要先部署'
										: data === null
											? '读取中…'
											: data.found
												? '扫码即可'
												: '未找到启动令牌',
							}),
							jsx('button', {
								type: 'button',
								style: styles.button,
								onClick: () => setRefreshKey((value) => value + 1),
								children: '刷新',
							}),
						],
					}),
					rotated &&
						jsx('p', {
							style: styles.hint,
							children: '⚠ DSH 已重启，令牌已轮换：二维码已更新，已配对的手机无需重扫（Cookie 仍有效）。',
						}),
					state.kind === 'error' && jsx('p', { style: styles.muted, children: state.message }),
					data?.found === false &&
						jsx('p', {
							style: styles.muted,
							children: 'journal 中没有当前端口的 ?token=。确认 DSH 由 systemd 启动，且最近六小时内重启过；否则请直接使用浏览器里已登录的会话。',
						}),
					data?.found === true &&
						jsxs('div', {
							style: { display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' },
							children: [
								jsx('img', {
									alt: '配对二维码',
									width: 200,
									height: 200,
									src: `data:image/svg+xml;utf8,${encodeURIComponent(data.qr)}`,
								}),
								jsxs('div', {
									style: { display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 220 },
									children: [
										jsx('span', { style: styles.hint, children: '① 先扫这张（门禁，一年有效）' }),
										jsx('code', { style: { ...styles.code, maxHeight: 60 }, children: data.urls.gate ?? '（回填码未含口令，可手填）' }),
										jsx('span', { style: styles.hint, children: '② 再扫这张（DSH 令牌，30 天 Cookie）' }),
										jsx('code', { style: { ...styles.code, maxHeight: 60 }, children: data.urls.token }),
										jsxs('div', {
											style: styles.row,
											children: [
												jsx('button', {
													type: 'button',
													style: styles.button,
													onClick: () => flash(data.urls.token, 'token'),
													children: copied === 'token' ? '已复制' : '复制令牌链接',
												}),
												jsx('button', {
													type: 'button',
													style: styles.button,
													onClick: () => flash(data.urls.gate ?? '', 'gate'),
													children: copied === 'gate' ? '已复制' : '复制门禁链接',
												}),
											],
										}),
									],
								}),
							],
						}),
				],
			})
		}


		function AllowlistCard() {
			const [entries, setEntries] = useState(null)
			const [value, setValue] = useState('')
			const [error, setError] = useState(null)
			const [pendingForce, setPendingForce] = useState(null)
			const [busy, setBusy] = useState(false)
			const [audit, setAudit] = useState([])

			const load = useCallback(async () => {
				try {
					setEntries((await callApi('/allowlist')).entries)
					setAudit((await callApi('/audit')).entries)
					setError(null)
				} catch (failure) {
					setEntries([])
					setError(failure.message)
				}
			}, [])

			useEffect(() => {
				load()
			}, [load])

			const mutate = async (action, entry, force = false) => {
				setBusy(true)
				setError(null)
				try {
					const result = await callApi('/allowlist', {
						method: 'POST',
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify({ action, value: entry, force }),
					})
					setEntries(result.entries)
					setAudit((await callApi('/audit')).entries)
					setPendingForce(null)
					if (action === 'add') setValue('')
					if (result.reload?.ok === false) setError(`已写入，但 reload 失败：${result.reload.reason}`)
				} catch (failure) {
					const message = failure.message
					setError(message)
					if (message.includes('二次确认')) setPendingForce(entry)
				} finally {
					setBusy(false)
				}
			}

			return jsxs('div', {
				style: styles.card,
				children: [
					jsxs('div', {
						style: styles.row,
						children: [
							jsx('strong', { style: styles.title, children: '来源白名单' }),
							jsx('span', { style: styles.muted, children: '不在名单内一律 403' }),
						],
					}),
					warning === null ? null : jsx('p', { style: styles.hint, children: `⚠ ${warning}` }),
					error === null ? null : jsx('p', { style: styles.error, children: error }),
					pendingForce === null
						? null
						: jsxs('div', {
								style: styles.row,
								children: [
									jsx('span', { style: styles.error, children: `${pendingForce} 会放行全部来源` }),
									jsx('button', {
										type: 'button',
										style: styles.button,
										onClick: () => mutate('add', pendingForce, true),
										children: '我确认，仍然放行',
									}),
								],
							}),
					jsx('div', {
						style: { display: 'flex', flexDirection: 'column', gap: 4 },
						children: (entries ?? []).map((entry) =>
							jsxs('div', {
								style: { ...styles.row, justifyContent: 'space-between' },
								children: [
									jsx('code', { children: entry }),
									jsx('button', {
										type: 'button',
										style: styles.button,
										disabled: busy,
										onClick: () => mutate('remove', entry),
										children: '移除',
									}),
								],
							}, entry),
						),
					}),
					jsxs('div', {
						style: styles.row,
						children: [
							jsx('input', {
								style: { ...styles.input, flex: 1 },
								value,
								placeholder: '10.140.140.221 或 192.168.1.0/24',
								onChange: (event) => setValue(event.target.value),
								spellCheck: false,
							}),
							jsx('button', {
								type: 'button',
								style: styles.button,
								disabled: busy || value.trim() === '',
								onClick: () => mutate('add', value.trim()),
								children: '添加',
							}),
						],
					}),
					audit.length === 0
						? null
						: jsx('details', {
								children: [
									jsx('summary', { style: styles.muted, children: `变更历史（最近 ${audit.length} 条）` }),
									jsx('div', {
										style: { display: 'flex', flexDirection: 'column', gap: 2, marginTop: 6 },
										children: audit.map((item, index) =>
											jsx('span', { style: styles.hint, children: `${item.at.replace('T', ' ').slice(0, 19)} ${item.action} ${item.entry}` }, index),
										),
									}),
								],
							}),
				],
			})
		}


		function SelfCheckCard() {
			const [checks, setChecks] = useState(null)
			const [note, setNote] = useState(null)

			useEffect(() => {
				let cancelled = false
				async function run() {
					const rows = []
					try {
						const status = await callApi('/status')
						const state = (await callApi('/state')).state
						const layout = document.querySelector('[class*="_frame"]') !== null
						rows.push({ id: 'canary', label: '布局 canary', ok: layout, hint: layout ? '[class*="_frame"] 命中' : '未命中：DSH 可能升级，移动端外壳需复核' })
						const sameVersion = state === null || state.panelVersion === status.version
						rows.push({
							id: 'version',
							label: '版本一致',
							ok: sameVersion,
							hint: sameVersion ? status.version : `面板 ${status.version} / 部署 ${state.panelVersion ?? '未知'}`,
						})
						rows.push({ id: 'upstream', label: '上游 DSH', ok: status.ok === true, hint: '控制面可达' })
					} catch (error) {
						rows.push({ id: 'error', label: '自检失败', ok: false, hint: error.message })
					}
					if (!cancelled) setChecks(rows)
				}
				run()
				return () => {
					cancelled = true
				}
			}, [])

			const exportDiag = async () => {
				try {
					const diag = await callApi('/diag')
					await copyText(JSON.stringify(diag, null, 2))
					setNote('诊断包已复制（不含口令与密钥）')
					setTimeout(() => setNote(null), 2000)
				} catch (error) {
					setNote(error.message)
				}
			}

			return jsxs('div', {
				style: styles.card,
				children: [
					jsxs('div', {
						style: styles.row,
						children: [
							jsx('strong', { style: styles.title, children: '自检' }),
							jsx('button', { type: 'button', style: styles.button, onClick: exportDiag, children: '复制诊断包' }),
							note === null ? null : jsx('span', { style: styles.muted, children: note }),
						],
					}),
					checks === null
						? jsx('p', { style: styles.muted, children: '检测中…' })
						: jsx('div', {
								style: { display: 'flex', flexDirection: 'column', gap: 4 },
								children: checks.map((check) =>
									jsxs('div', {
										style: styles.row,
										children: [
											jsx(Dot, { ok: check.ok }),
											jsx('span', { style: { minWidth: 88 }, children: check.label }),
											jsx('span', { style: styles.hint, children: check.hint }),
										],
									}, check.id),
								),
							}),
				],
			})
		}


		// ---------------------------------------------------------------- 移动端外壳

		const SHELL_CSS = `
@media (max-width: 1023px) {
  /* 三列 grid：隐藏图标栏后空列会压塌正文，必须显式改成单列 */
  [class*="_frame"] { grid-template-columns: minmax(0, 1fr) 0 0 !important; }
  /* 折叠态：整列不占位 */
  [class*="_sidebarCol"]:has([class*="_collapsed"]) { display: none !important; }
  /* 展开态：抽屉浮在内容之上，铺满全高 */
  [class*="_sidebarCol"]:not(:has([class*="_collapsed"])) {
    position: fixed !important;
    inset: 0 auto 0 0;
    height: auto !important;
    z-index: 900;
    padding-bottom: env(safe-area-inset-bottom, 0px);
    box-shadow: 0 0 32px rgba(0,0,0,.32);
  }
  /* 给底栏让出高度 */
  [class*="_centerCol"] { padding-bottom: 56px; box-sizing: border-box; }
  /* 抽屉打开时藏底栏，避免右侧露出半截图标 */
  html.dsh-drawer-open .dsh-mobile-bar { display: none; }
  .dsh-mobile-hamburger { display: inline-flex !important; align-items: center; }
}

/* 桌面端零影响 */
@media (min-width: 1024px) {
  .dsh-mobile-bar { display: none !important; }
  .dsh-mobile-hamburger { display: none !important; }
}
`

		function installShellCss() {
			if (typeof document === 'undefined') return () => {}
			// 样式永远注入（媒体查询已把桌面排除）；canary 只负责「事后告警」，
			// 不能反过来当门禁——apply 往往早于应用布局挂载。
			const style = document.createElement('style')
			style.id = 'dsh-remote-panel-shell'
			style.textContent = SHELL_CSS
			document.head.appendChild(style)

			let frame = 0
			const sync = () => {
				cancelAnimationFrame(frame)
				frame = requestAnimationFrame(() => {
					const column = document.querySelector('[class*="_sidebarCol"]')
					const open = column !== null && column.querySelector('[class*="_collapsed"]') === null
					document.documentElement.classList.toggle('dsh-drawer-open', open)
				})
			}
			const observer = new MutationObserver(sync)
			observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] })
			sync()

			let warned = false
			const canary = setTimeout(() => {
				if (document.querySelector('[class*="_frame"]') === null && !warned) {
					warned = true
					console.warn('[remote-panel] 未匹配到布局容器，移动端外壳样式可能失配（DSH 可能已升级）')
				}
			}, 4000)

			return () => {
				clearTimeout(canary)
				cancelAnimationFrame(frame)
				observer.disconnect()
				style.remove()
				document.documentElement.classList.remove('dsh-drawer-open')
			}
		}

		function MobileBar(props) {
			const layout = props?.layout
			const bar = {
				position: 'fixed',
				left: 0,
				right: 0,
				bottom: 0,
				height: 56,
				display: 'flex',
				alignItems: 'stretch',
				background: 'color-mix(in srgb, Canvas 92%, transparent)',
				borderTop: `1px solid ${stroke}`,
				paddingBottom: 'env(safe-area-inset-bottom, 0px)',
				zIndex: 2147483000,
				pointerEvents: 'auto',
				backdropFilter: 'blur(12px)',
			}
			const item = {
				flex: 1,
				font: 'inherit',
				fontSize: 12,
				border: 0,
				background: 'transparent',
				color: 'CanvasText',
				cursor: 'pointer',
			}
			const act = (fn) => () => {
				try {
					fn?.()
				} catch (error) {
					console.warn('[remote-panel] shell action failed', error)
				}
			}
			return jsxs('div', {
				className: 'dsh-mobile-bar',
				style: bar,
				children: [
					jsx('button', { type: 'button', style: item, onClick: act(() => layout?.toggleSidebar?.()), children: '会话' }),
					jsx('button', { type: 'button', style: item, onClick: act(() => layout?.selectPanel?.('chat')), children: '对话' }),
					jsx('button', { type: 'button', style: item, onClick: act(() => layout?.selectPanel?.('plugins')), children: '插件' }),
				],
			})
		}

		function HeaderHamburger(props) {
			return jsx('button', {
				type: 'button',
				'aria-label': '打开侧栏',
				onClick: () => {
					try {
						props?.layout?.toggleSidebar?.()
					} catch (error) {
						console.warn('[remote-panel] toggle failed', error)
					}
				},
				style: {
					display: 'none',
					font: 'inherit',
					fontSize: 18,
					lineHeight: 1,
					border: 0,
					background: 'transparent',
					color: 'inherit',
					cursor: 'pointer',
					padding: '0 8px',
				},
				className: 'dsh-mobile-hamburger',
				children: '☰',
			})
		}

		function Panel() {
			return jsxs('div', {
				style: styles.wrap,
				children: [jsx(StatusCard, {}), jsx(DataPlaneCard, {}), jsx(PairCard, {}), jsx(AllowlistCard, {}), jsx(SelfCheckCard, {}), jsx(WizardCard, {})],
			})
		}

		function apply(ctx) {
			const cleanup = installShellCss()
			if (typeof ctx.effect === 'function') ctx.effect(() => cleanup, 'remote-panel: mobile shell css')

			ctx.slots.inject('shell.overlay', () =>
				ctx.slots.register(
					{ name: 'shell.overlay', id: 'remote-panel.mobile-bar', order: 100, inject: () => ({ layout: ctx.layout }) },
					MobileBar,
				),
			)

			ctx.slots.inject('conversation.header.leading', () =>
				ctx.slots.register(
					{ name: 'conversation.header.leading', id: 'remote-panel.hamburger', inject: () => ({ layout: ctx.layout }) },
					HeaderHamburger,
				),
			)

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

		// layout 必须在 inject 里声明，否则访问 ctx.layout 会抛
		// "cannot get property without inject"
		return { inject: ['slots', 'layout'], apply }
	},
})
