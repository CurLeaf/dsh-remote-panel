/**
 * Browser half of `dsh-remote-panel`.
 *
 * 手写、无构建步骤：遵循 DSH 客户端包的加载契约
 * `window.__ModuleLoader__.load({ id, factory(require) })`，`id` 必须等于包名。
 *
 * 信息架构（两幕）：
 *   未部署 → 只有一张「开始配置」卡（三个字段 → 脚本 → 回填）
 *   已部署 → 运行状态 + 配对；白名单与诊断收进折叠区
 */

window.__ModuleLoader__.load({
	id: 'dsh-remote-panel',
	factory: (require) => {
		const React = require('react')
		const { jsx, jsxs } = require('react/jsx-runtime')
		const { useCallback, useEffect, useState } = React

		const API = '/remote-panel/api'
		const TOKEN_GLOBAL = '__DSH_REMOTE_PANEL__'
		const TOKEN_HEADER = 'x-dsh-remote-panel'
		// HMR 时新模块实例接手旧实例的内容增强（同一页面只允许一个 Observer）
		const CONTENT_CLEANUP_KEY = '__DSH_REMOTE_PANEL_CONTENT_ENHANCEMENTS__'
		// 同理：横滑翻页的监听也只能有一份，否则一次滑动会被两套逻辑各算一次
		const PAGER_CLEANUP_KEY = '__DSH_REMOTE_PANEL_PAGER__'
		// 翻页引擎的对外把手：☰ / 返回对话 / 系统返回都从这里进
		let pagerApi = null
		const stroke = 'var(--dsw-elevation-stroke-color, rgba(128,128,128,.24))'

		const styles = {
			wrap: { display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13, lineHeight: 1.6 },
			card: {
				border: `1px solid ${stroke}`,
				borderRadius: 12,
				padding: '14px 16px',
				display: 'flex',
				flexDirection: 'column',
				gap: 10,
			},
			head: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
			title: { fontSize: 14, fontWeight: 600, margin: 0 },
			muted: { opacity: 0.62, margin: 0 },
			hint: { fontSize: 11, opacity: 0.5 },
			link: { color: '#4d7dfe', textDecoration: 'underline', cursor: 'pointer' },
			row: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
			grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 },
			field: { display: 'flex', flexDirection: 'column', gap: 4 },
			label: { fontSize: 12, opacity: 0.75 },
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
				maxHeight: 220,
				overflow: 'auto',
				margin: 0,
			},
			dot: (ok) => ({
				width: 7,
				height: 7,
				borderRadius: '50%',
				display: 'inline-block',
				background: ok === true ? '#3fb950' : ok === false ? '#d1242f' : 'rgba(128,128,128,.55)',
			}),
			error: { color: '#d1242f', margin: 0 },
			divider: { borderTop: `1px solid ${stroke}`, paddingTop: 8 },
		}

		function token() {
			const value = globalThis[TOKEN_GLOBAL]
			return typeof value === 'string' ? value : undefined
		}

		async function callApi(path, init) {
			const value = token()
			if (value === undefined) throw new Error('页面是旧版本：硬刷新后重试')
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

		// ---------------------------------------------------------------- 基础件

		function Card({ children }) {
			return jsx('div', { style: styles.card, children })
		}

		function Dot({ ok }) {
			return jsx('span', { style: styles.dot(ok) })
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

		function CopyButton({ text, label = '复制', doneLabel = '已复制' }) {
			const [done, setDone] = useState(false)
			return jsx('button', {
				type: 'button',
				style: styles.button,
				onClick: async () => {
					await copyText(text)
					setDone(true)
					setTimeout(() => setDone(false), 1400)
				},
				children: done ? doneLabel : label,
			})
		}

		// ---------------------------------------------------------------- 旧页面

		function StaleBanner() {
			if (typeof globalThis[TOKEN_GLOBAL] === 'string') return null
			return jsxs(Card, {
				children: [
					jsx('strong', { style: { ...styles.title, color: '#d1242f' }, children: '页面是旧版本' }),
					jsx('p', {
						style: styles.muted,
						children: '插件装载前加载的页面拿不到面板令牌。硬刷新一次（Ctrl+Shift+R）即可。',
					}),
					jsx('div', {
						style: styles.row,
						children: jsx('button', {
							type: 'button',
							style: styles.primary,
							onClick: () => location.reload(),
							children: '刷新页面',
						}),
					}),
				],
			})
		}

		// ---------------------------------------------------------------- 第一幕：部署

		const DEPLOY_FIELDS = [
			['relayUrl', '中继地址', 'wss://relay.<域>/agent'],
			['hostname', '对外域名', '手机访问的域名，也是证书签发的名字'],
			['gateKey', '门禁口令', '16 位以上；二维码里只放它'],
		]

		const ADVANCED_FIELDS = [
			['targetPort', 'DSH 端口', '默认 3080'],
			['consoleUrl', '设备控制台', '可空；中继侧的控制台地址'],
			['nodeBin', 'Node 路径', 'agent 用它启动'],
		]

		function DeployCard({ onDeployed }) {
			const [form, setForm] = useState(null)
			const [result, setResult] = useState(null)
			const [error, setError] = useState(null)
			const [busy, setBusy] = useState(false)

			useEffect(() => {
				callApi('/defaults')
					.then((data) => setForm({ ...data }))
					.catch((failure) => setError(failure.message))
			}, [])

			const set = (key) => (event) => {
				const value = event?.target?.value ?? event
				setForm((current) => ({ ...current, [key]: value }))
			}

			const generate = async () => {
				setBusy(true)
				setError(null)
				try {
					const payload = {
						...form,
						targetPort: Number(form.targetPort) || 3080,
					}
					setResult(
						await callApi('/render', {
							method: 'POST',
							headers: { 'content-type': 'application/json' },
							body: JSON.stringify(payload),
						}),
					)
				} catch (failure) {
					setError(failure.message)
					setResult(null)
				} finally {
					setBusy(false)
				}
			}

			if (form === null) {
				return jsxs(Card, {
					children: [
						jsx('strong', { style: styles.title, children: '开始配置' }),
						jsx('p', { style: styles.muted, children: error ?? '读取本机默认值…' }),
					],
				})
			}

			const handoff =
				result === null
					? ''
					: [
							'请在本机执行下面的安装脚本（用户级 systemd，不需要 root；幂等，可重复执行）。',
							'执行完回到面板点「已执行，刷新状态」。',
							'',
							'```bash',
							result.install.trimEnd(),
							'```',
						].join('\n')

			return jsxs(Card, {
				children: [
					jsxs('div', {
						style: styles.head,
						children: [
							jsx('strong', { style: styles.title, children: '开始配置' }),
							jsx('span', { style: styles.muted, children: '一台机器只需要装一次' }),
						],
					}),
					jsxs('div', {
						style: styles.grid,
						children: DEPLOY_FIELDS.map(([key, label, hint]) =>
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
								style: styles.primary,
								disabled: busy,
								onClick: generate,
								children: busy ? '生成中…' : result === null ? '生成安装脚本' : '重新生成',
							}),
							jsx('button', {
								type: 'button',
								style: styles.button,
								onClick: () => setForm((current) => ({ ...current, gateKey: randomToken(32) })),
								children: '重掷口令',
							}),
							jsx('button', {
								type: 'button',
								style: styles.button,
								onClick: onDeployed,
								children: '已部署？刷新状态',
							}),
						],
					}),
					error === null ? null : jsx('p', { style: styles.error, children: error }),
					jsx('details', {
						style: styles.divider,
						children: [
							jsx('summary', { style: styles.muted, children: '高级选项' }),
							jsxs('div', {
								style: { ...styles.grid, marginTop: 8 },
								children: ADVANCED_FIELDS.map(([key, label, hint]) =>
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
					result === null
						? null
						: jsxs('div', {
								style: { display: 'flex', flexDirection: 'column', gap: 8 },
								children: [
									jsxs('div', {
										style: { ...styles.row, ...styles.divider },
										children: [
											jsx('strong', { children: '② 执行' }),
											jsx(CopyButton, { text: handoff, label: '复制任务给 AI' }),
											jsx(CopyButton, { text: result.install, label: '只复制脚本' }),
											jsx('button', {
												type: 'button',
												style: styles.button,
												onClick: () => downloadScript(result.install),
												children: '下载',
											}),
										],
									}),
									jsx('p', {
										style: styles.muted,
										children: `装好后入口是 ${result.summary.urls.public}（未过门禁时应显示口令页）。`,
									}),
									jsx('details', {
										children: [
											jsx('summary', { style: styles.hint, children: '查看脚本内容' }),
											jsx('pre', { style: { ...styles.code, marginTop: 8 }, children: result.install }),
										],
									}),
									jsx('div', {
										style: styles.row,
										children: jsx('button', {
											type: 'button',
											style: styles.primary,
											onClick: onDeployed,
											children: '③ 已执行，刷新状态',
										}),
									}),
								],
							}),
				],
			})
		}

		// ---------------------------------------------------------------- 第二幕：运行状态

		function StatusCard({ state, version, onRedeploy }) {
			const [probe, setProbe] = useState(null)
			const [status, setStatus] = useState(null)
			const [busy, setBusy] = useState(false)

			const refresh = useCallback(async () => {
				setBusy(true)
				try {
					const [probed, info] = await Promise.all([callApi('/probe'), callApi('/status')])
					setProbe(probed.probe)
					setStatus(info)
				} catch {
					/* 状态探测失败时保留上一帧 */
				} finally {
					setBusy(false)
				}
			}, [])

			useEffect(() => {
				refresh()
			}, [refresh])

			const cert = probe?.cert
			const certHours = typeof cert?.hoursLeft === 'number' ? Math.round(cert.hoursLeft) : null
			const apk = probe?.apk
			const shell = status?.shell ?? null
			const shellSource = shell !== null && typeof shell.shell === 'string' ? shell.shell : null
			const url = state?.hostname ? `https://${state.hostname}/` : null
			const lights = [
				['隧道 agent', probe?.agent],
				// 证书单独看：Let's Encrypt 续签失败时链路照样能通，但浏览器会先报错
				[certHours === null ? '证书' : `证书 ${certHours}h`, cert === undefined ? undefined : { ok: cert.ok === true }],
				['门禁', probe?.gate],
				['上游 DSH', probe?.upstream],
				[apk?.ok === true && apk.versionName ? `手机壳 ${apk.versionName}` : '手机壳', apk === undefined ? undefined : { ok: apk.ok === true }],
				// 手机外壳依赖 DSH 的 hash 类名：DSH 升级后这里会红，提示需要更新插件
				['外壳适配', shell === null ? undefined : { ok: shell.ok === true }],
				[
					shellSource === 'class' ? '外壳契约 · 类名兜底' : '外壳契约',
					shellSource === null ? undefined : { ok: shellSource === 'semantic' },
				],
			]

			return jsxs(Card, {
				children: [
					jsxs('div', {
						style: styles.head,
						children: [
							jsx(Dot, { ok: probe?.ok }),
							jsx('strong', { style: styles.title, children: '运行状态' }),
							url === null
								? null
								: jsx('a', { href: url, target: '_blank', rel: 'noreferrer', style: styles.link, children: url }),
							jsx('button', {
								type: 'button',
								style: styles.button,
								onClick: refresh,
								disabled: busy,
								children: busy ? '检测中…' : '检测',
							}),
						],
					}),
					shell !== null && shell.ok !== true
						? jsx('p', {
								style: { ...styles.hint, color: '#f2b8b5' },
								children: `外壳挂点缺失：${(shell.missing ?? []).join(', ') || '未知'} —— DSH 升级后需要更新插件，否则手机样式会错位`,
							})
						: null,
					shell !== null && shell.shell === 'class'
						? jsx('p', {
								style: styles.hint,
								children: '外壳只能靠哈希类名认出来（data-shell-overlay 没找到），DSH 换前缀后手机样式可能失配',
							})
						: null,
					cert !== undefined && cert.ok !== true
						? jsx('p', {
								style: { ...styles.hint, color: '#f2b8b5' },
								children: `证书告警：${cert.reason ?? '不可用'}`,
							})
						: null,
					apk !== undefined && apk.ok !== true
						? jsx('p', { style: styles.hint, children: `手机壳资源缺失：${apk.reason ?? '未知'}` })
						: null,
					jsx('div', {
						style: styles.row,
						children: lights.map(([label, item]) =>
							jsxs(
								'span',
								{
									style: styles.row,
									children: [
										jsx(Dot, { ok: item?.ok }),
										jsx('span', { style: styles.muted, children: label }),
									],
								},
								label,
							),
						),
					}),
					jsxs('details', {
						style: styles.divider,
						children: [
							jsx('summary', { style: styles.hint, children: `诊断 · v${version}` }),
							jsxs('div', {
								style: { ...styles.row, marginTop: 6 },
								children: [
									jsx(DiagButton, {}),
									jsx('button', {
										type: 'button',
										style: styles.button,
										onClick: onRedeploy,
										children: '重新生成安装脚本',
									}),
								],
							}),
						],
					}),
				],
			})
		}

		function DiagButton() {
			const [note, setNote] = useState(null)
			return jsxs('span', {
				style: styles.row,
				children: [
					jsx('button', {
						type: 'button',
						style: styles.button,
						onClick: async () => {
							try {
								const diag = await callApi('/diag')
								await copyText(JSON.stringify(diag, null, 2))
								setNote('已复制（不含口令）')
							} catch (failure) {
								setNote(failure.message)
							}
							setTimeout(() => setNote(null), 2000)
						},
						children: '复制诊断包',
					}),
					note === null ? null : jsx('span', { style: styles.hint, children: note }),
				],
			})
		}

		function PairCard({ state }) {
			const [data, setData] = useState({ kind: 'loading' })
			const [round, setRound] = useState(0)

			useEffect(() => {
				callApi('/pair')
					.then((payload) => setData({ kind: 'ok', data: payload }))
					.catch((error) => setData({ kind: 'error', message: error.message }))
			}, [round])

			const urls = data.kind === 'ok' ? data.data.urls : null
			return jsxs(Card, {
				children: [
					jsxs('div', {
						style: styles.head,
						children: [
							jsx(Dot, { ok: urls !== null && urls.combo !== undefined }),
							jsx('strong', { style: styles.title, children: '手机配对' }),
							jsx('span', {
								style: styles.muted,
								children: data.kind === 'loading' ? '读取中…' : data.kind === 'error' ? data.message : '扫码即可',
							}),
							jsx('button', {
								type: 'button',
								style: styles.button,
								onClick: () => setRound((value) => value + 1),
								children: '刷新',
							}),
						],
					}),
					data.kind === 'error' ? jsx('p', { style: styles.muted, children: data.message }) : null,
					urls === null
						? null
						: jsxs('div', {
								style: { display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' },
								children: [
									jsx('img', {
										alt: '配对二维码',
										width: 180,
										height: 180,
										src: `data:image/svg+xml;utf8,${encodeURIComponent(data.data.qr)}`,
									}),
									jsxs('div', {
										style: { display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minWidth: 210 },
										children: [
											jsx('span', {
												style: styles.hint,
												children: '扫码一次：种一年期门禁 Cookie，再自动跳转换取 DSH 会话',
											}),
											jsx('code', { style: { ...styles.code, maxHeight: 72 }, children: urls.combo }),
											jsxs('div', {
												style: styles.row,
												children: [
													jsx(CopyButton, { text: urls.combo, label: '复制配对链接' }),
													urls.apk === undefined
														? null
														: jsx('a', {
																href: urls.apk,
																style: styles.button,
																children: '下载安卓壳',
															}),
													jsx('a', {
														href: urls.version,
														style: styles.link,
														children: '版本清单',
													}),
												],
											}),
											jsxs('details', {
												children: [
													jsx('summary', { style: styles.hint, children: '手动备用' }),
													jsxs('div', {
														style: { display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 },
														children: [
															jsx('code', { style: { ...styles.code, maxHeight: 72 }, children: urls.gate }),
															jsxs('div', {
																style: styles.row,
																children: [
																	jsx(CopyButton, { text: urls.gate, label: '复制门禁链接' }),
																],
															}),
														],
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

		// ---------------------------------------------------------------- 总装

		/** 手机 App 化：全屏按钮 + 添加到主屏幕的指引（iOS 靠 A2HS，Android 靠 PWA/全屏 API）。 */
		function AppCard() {
			const [full, setFull] = useState(false)
			useEffect(() => {
				const sync = () => setFull(document.fullscreenElement != null)
				document.addEventListener('fullscreenchange', sync)
				sync()
				return () => document.removeEventListener('fullscreenchange', sync)
			}, [])
			const standalone =
				typeof window !== 'undefined' &&
				(window.matchMedia?.('(display-mode: standalone)')?.matches === true || window.navigator?.standalone === true)
			const secure = typeof window !== 'undefined' && window.location?.protocol === 'https:'
			const [ping, setPing] = useState(() => {
				try {
					return localStorage.getItem('dsh-remote-panel:attention') !== 'off'
				} catch {
					return true
				}
			})
			const togglePing = () => {
				const next = !ping
				setPing(next)
				try {
					localStorage.setItem('dsh-remote-panel:attention', next ? 'on' : 'off')
				} catch {
					/* 隐私模式忽略 */
				}
			}
			const supported = typeof document !== 'undefined' && document.fullscreenEnabled === true
			const enter = () => {
				document.documentElement.requestFullscreen?.().catch((error) => {
					console.warn('[remote-panel] fullscreen failed', error)
				})
			}
			return jsxs(Card, {
				children: [
					jsx('div', { style: styles.head, children: jsx('p', { style: styles.title, children: '手机 App' }) }),
					jsx('p', {
						style: styles.muted,
						children: standalone
							? '✓ 已经在独立窗口里运行，没有地址栏。'
							: secure
								? '把它装到主屏幕：装完后从图标打开就是独立窗口，不再有浏览器 UI。'
								: '当前是 http，装不成独立应用；先用下面的按钮进全屏，手机访问请走中继域名。',
					}),
					standalone || !secure
						? null
						: jsx('p', {
							style: styles.hint,
							children: 'Android：浏览器菜单 → 安装应用 / 添加到主屏幕；iPhone：分享 → 添加到主屏幕。',
						}),
					jsx('p', {
						style: styles.hint,
						children: secure
							? '证书由中继自动续（Let\'s Encrypt），手机不用装任何根证书。'
							: '当前直连 3080（明文 http），只适合本机调试；手机请走中继域名。',
					}),
					supported && !standalone && !full
						? jsx('div', {
							style: styles.row,
							children: jsx('button', {
								type: 'button',
								style: styles.primary,
								onClick: enter,
								children: '进入全屏',
							}),
						})
						: null,
					jsxs('label', {
						style: { ...styles.row, marginTop: 10, fontSize: 12 },
						children: [
							jsx('input', { type: 'checkbox', checked: ping, onChange: togglePing }),
							jsx('span', {
								style: styles.muted,
								children: '任务跑完 / 需要确认时震动并闪标题（页面在后台时）',
							}),
						],
					}),
				],
			})
		}


		function Panel() {
			const [stage, setStage] = useState('loading')
			const [state, setState] = useState(null)
			const [version, setVersion] = useState(null)
			const [showWizard, setShowWizard] = useState(false)

			const load = useCallback(async () => {
				try {
					const status = await callApi('/status')
					setVersion(status.version)
					const current = (await callApi('/state')).state
					setState(current)
					setStage(current === null ? 'fresh' : 'running')
				} catch (failure) {
					setVersion(failure.message)
					setStage('error')
				}
			}, [])

			useEffect(() => {
				load()
			}, [load])

			if (stage === 'loading') {
				return jsx('div', {
					style: styles.wrap,
					children: jsx(Card, { children: jsx('p', { style: styles.muted, children: '读取中…' }) }),
				})
			}

			if (stage === 'error') {
				return jsx('div', {
					style: styles.wrap,
					children: [
						jsx(StaleBanner, {}),
						jsx(Card, { children: jsx('p', { style: styles.error, children: version }) }),
					],
				})
			}

			if (stage === 'fresh' || showWizard) {
				return jsx('div', {
					style: styles.wrap,
					children: [
						jsx(StaleBanner, {}),
						jsx(DeployCard, {
							onDeployed: () => {
								setShowWizard(false)
								load()
							},
						}),
						state === null
							? null
							: jsx(StatusCard, {
									state,
									version,
									onRedeploy: () => setShowWizard(false),
								}),
					],
				})
			}

			return jsx('div', {
				style: styles.wrap,
				children: [
					jsx(StaleBanner, {}),
					jsx(StatusCard, { state, version, onRedeploy: () => setShowWizard(true) }),
					jsx(PairCard, { state }),
					jsx(AppCard, {}),
				],
			})
		}

		// ---------------------------------------------------------------- 外壳

		const SHELL_CSS = `
/* 手机外壳：结构（主题无关） */
@media (max-width: 1023px) {
  /* 身份一律优先认「自己打的标」（[data-rp-frame] / [data-rp-page]），哈希类名留作兜底：
     DSH 换了类名前缀，标还在，样式不会整片失效。 */
  /* 停靠形态：侧栏占第一列，对话列吃满剩下的，右栏收成 0 宽的轨道（第三屏自己平移） */
  [class*="_frame"]:not([data-sidebar-drawer]),
  [data-rp-frame]:not([data-sidebar-drawer]) { grid-template-columns: minmax(0, 1fr) 0 0 !important; }
  /* 抽屉形态（DSH 0.2.2 起窄屏默认）：侧栏是 absolute 抽屉、不占网格列，
     第一列必须留 0，把 1fr 让给第二列（对话）。沿用停靠形态那条会让对话列变成 0 宽 ——
     整屏只剩固定在 body 上的输入条和顶栏，看上去就是黑屏。
     layout 侧的依据：dsh-client-ui-layout 里 const drawer = viewport < 768，
     抽屉态 frame 写 data-sidebar-drawer、grid 模板为 0 / minmax(0,1fr) / minmax(0,0)。 */
  [class*="_frame"][data-sidebar-drawer],
  [data-rp-frame][data-sidebar-drawer] { grid-template-columns: 0 minmax(0, 1fr) 0 !important; }
  /* 宿主的抽屉遮罩与「开抽屉」按钮是浮层语言，和三屏翻页重复：
     - 遮罩（z 70）会在会话页展开时把对话压暗；
     - 开抽屉按钮落在左上角 leading 位，和本插件的 ☰ 叠在同一处（28px 那枚压在上面），
       点下去走的是宿主的 toggleSidebar，不是翻页 —— 也就是「按钮顶在页面左上角还点不动」。
     两样都收掉，左上角只留本插件的 ☰（它走 pagerApi.go(PAGER_SESSIONS)）。 */
  [data-sidebar-mask] { display: none !important; }
  html:has(.dsh-mobile-hamburger) [data-shell-leading] { display: none !important; }
  /* 抽屉形态下宿主给侧栏写了 transform 过渡：翻页是逐帧写 transform，
     两套叠在一起会拖影，翻完还会自己飘一下。手机上关掉过渡，位移只由 pager 说了算。 */
  [data-rp-frame][data-sidebar-drawer] [class*="_sidebarCol"],
  [data-rp-frame][data-sidebar-drawer] [data-rp-page="sessions"] { transition: none !important; }
  /* 宿主在侧栏右缘摆了一条 8px 的 resize 手柄（pointer capture + setSidebar），
     手机上它正好压在「往左滑收起」的起手位置，拖它只会把抽屉改成 264~420 的宽度。收掉。 */
  [class*="_handle"][data-side], [data-side] { display: none !important; }
  /* 收起：优先读宿主写在 frame 上的布尔属性，老版本才看侧栏内部的折叠标记 */
  [class*="_sidebarCol"]:has([class*="_collapsed"]),
  [data-rp-frame][data-sidebar-collapsed] [data-rp-page="sessions"] { display: none !important; }
  [class*="_sidebarCol"]:not(:has([class*="_collapsed"])),
  [data-rp-frame]:not([data-sidebar-collapsed]) [data-rp-page="sessions"] {
    position: fixed !important;
    inset: 0 auto 0 0;
    height: auto !important;
    z-index: 900;
    padding-bottom: max(env(safe-area-inset-bottom, 0px), var(--dsh-safe-bottom, 0px));
    border-radius: 0 16px 16px 0 !important;
    box-shadow: 0 0 28px rgba(0, 0, 0, .32) !important;
  }
  /* 独立窗口里别再有下拉刷新 / 橡皮筋 */
  body { overscroll-behavior: none; }

  /* 顶部安全区：默认取 env()；WebView 里由壳把真实切角高度写进 --dsh-safe-top */
  :root {
    --dsh-safe-top: env(safe-area-inset-top, 0px);
    --dsh-safe-bottom: env(safe-area-inset-bottom, 0px);
  }

  /* 顶栏：52px；刘海屏/独立窗口把状态栏让出来 */
  .wSkVaW_header {
    min-height: calc(52px + var(--dsh-safe-top, 0px)) !important;
    padding: calc(12px + var(--dsh-safe-top, 0px)) 60px 0 10px !important;
  }
  .wSkVaW_headerSessionless { padding-top: calc(12px + var(--dsh-safe-top, 0px)) !important; }
  .wSkVaW_headerCorner { display: none !important; }
  /* 手机的「用文件管理器打开」是桌面动作，收掉 */
  .OMoRSG_split { display: none !important; }

  /* 会话内顶栏瘦身（只影响手机）：
     原生在标题右边依次摆「子智能体 / 后台任务」动作条和「更多操作（导出会话日志）」。
     390 下这两组固定件只给标题留下约 104px。这里：
       1) 「更多操作」整组收掉（桌面仍可导出）；
       2) 子智能体只留 spinner + 箭头，后台任务只留数字角标；
       3) 标题允许吃满剩余宽度。
     ☰ 和右下角的 ＋（新建对话）都不动。 */
  .wSkVaW_headerUtilities { display: none !important; }
  .wSkVaW_titleCluster { gap: 4px !important; }
  .wSkVaW_headerActions { gap: 4px !important; }
  .wSkVaW_crumbCurrent { max-width: 100% !important; }
  .ZKlsPq_trigger { padding: 2px !important; gap: 3px !important; }
  /* 子智能体：只留 spinner + 展开箭头（文字收进 aria-label / 弹层） */
  .ZKlsPq_trigger > span:not([class]) { display: none !important; }
  /* 后台任务：数字收成角标（data-rp-jobs 由脚本从原文案里提取） */
  .QsffPG_trigger { gap: 2px !important; padding: 2px !important; }
  .QsffPG_count { display: none !important; }
  .QsffPG_trigger::after {
    content: attr(data-rp-jobs);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    min-width: 16px;
    height: 16px;
    padding: 0 3px;
    border-radius: 999px;
    background: rgba(128, 128, 128, .18);
    font-size: 11px;
    font-weight: 600;
    line-height: 16px;
    font-variant-numeric: tabular-nums;
  }

  /* 工作区 chip 右侧的 ×：回到原生「请选择工作区」空态（不发明新会话状态） */
  .dsh-mobile-clear-workspace {
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    width: 22px;
    height: 22px;
    margin-left: 2px;
    padding: 0;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: rgba(255, 255, 255, .62);
    cursor: pointer;
  }
  .dsh-mobile-clear-workspace:hover { background: rgba(255, 255, 255, .12); color: #fff; }
  .dsh-mobile-hamburger { display: inline-flex !important; align-items: center; justify-content: center; height: 40px; padding: 0 !important; }
  .dsh-mobile-newchat,
  .dsh-mobile-clear-workspace { display: inline-flex !important; }
  /* 已经回到「请选择工作区」空态时没有可清空的对象 */
  .dsh-mobile-clear-workspace[data-none="true"] { display: none !important; }
  /* 「+」是固定定位 + 内联 top:6px；顶栏的 padding-top 是 12 + 安全区，
     这里用同一个 12 才能和标题/汉堡垂直居中对齐（改 6 会高出 6px） */
  .dsh-mobile-newchat {
    top: calc(12px + var(--dsh-safe-top, 0px)) !important;
    height: 40px !important;
  }

  /* 面板页（工作区 Git 等）整屏接管，会话顶栏连同 ☰ 一起消失 —— 手机上「进得去出不来」。
     面板态（layout.panelInfo.activePanelId ≠ null）由 installShellCss 同步成
     html.dsh-panel-open，这里补一条固定顶栏 + 返回键 */
  .dsh-mobile-panelbar {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 70;
    display: none;
    align-items: center;
    box-sizing: border-box;
    height: calc(52px + var(--dsh-safe-top, 0px));
    padding: var(--dsh-safe-top, 0px) 10px 0;
    background: var(--dsw-alias-bg-base, #000);
  }
  body[data-ds-dark-theme] .dsh-mobile-panelbar { background: #000; }
  html.dsh-panel-open .dsh-mobile-panelbar { display: flex; }
  .dsh-mobile-panelback {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    padding: 0;
    border: 0;
    border-radius: 12px;
    background: transparent;
    color: var(--dsw-alias-label-primary);
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition: background-color 120ms ease-out, color 120ms ease-out;
  }
  .dsh-mobile-panelback:hover,
  .dsh-mobile-panelback:active { background: var(--dsw-alias-interactive-bg-hover); }
  /* 面板页把顶部让给那条栏（Git 面板自带 30px 上边距，这里给到 64 留出呼吸） */
  html.dsh-panel-open .gpb-page { padding-top: calc(64px + var(--dsh-safe-top, 0px)) !important; }
  /* 「＋」是固定定位的，会压在面板自己的「刷新」上；面板里也不该新建对话 */
  html.dsh-panel-open .dsh-mobile-newchat { display: none !important; }

  /* 空态：鱼标按原型放大并竖排到标题上方；标题 22/650，收掉「预览版」角标 */
  [class*="_headline"] { flex-direction: column !important; align-items: center !important; gap: 14px !important; }
  [class*="_fish"], [class*="_fishHitbox"] { width: 112px !important; height: 82.4px !important; }
  [class*="_fish"] { color: #4d7dfe !important; }
  [class*="_titleGroup"] { justify-content: center !important; }
  [class*="_titleGroup"],
  [class*="_titleGroup"] > * { font-size: 22px !important; font-weight: 650 !important; letter-spacing: -.02em !important; }
  [class*="_previewBadge"] { display: none !important; }
  /* 原生把「问候语 + 输入条」一起居中；手机按原型拆开：
     问候语留在屏幕中间（原生居中），输入条钉到底部 */
  /* 输入条下方那排统计（轮次/步数、token、缓存）：手机上会撑高输入区，
     按「托盘状态」的思路挪到右上角，做成一行半透明小字，不再占输入条的垂直空间 */
  /* 原生的统计条藏在输入条下方、文案又长，手机上只能挤；这里整体隐藏，
     由 installStatsTray() 读它的文本、精简后放到顶部右上角 */
  .uV2eYG_dock { display: none !important; }

  /* 顶部状态条：左边分支、右边统计，两端对齐（像手机状态栏的左右两组） */
  .dsh-stats-tray {
    position: fixed;
    top: max(2px, calc(var(--dsh-safe-top, 0px) - 24px));
    left: 14px;
    right: 14px;
    z-index: 57;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    font-size: 10px;
    line-height: 16px;
    font-variant-numeric: tabular-nums;
    color: rgba(255, 255, 255, .5);
    pointer-events: none;
    letter-spacing: .01em;
  }
  .dsh-stats-tray > span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }
  .dsh-stats-tray > span:last-child { text-align: right; flex: 0 0 auto; }

  /* 输入条座位顶部有一段渐隐（DSH 原本渐到 #151517），在纯黑底上会显出一条灰带，
     这里把终点色换成纯黑，观感才对得上；底部那行状态（轮次/token/缓存）同理 */
  body[data-ds-dark-theme] .wSkVaW_composerSeat,
  body[data-ds-dark-theme] .wSkVaW_composerHero {
    background-image: linear-gradient(rgba(0, 0, 0, 0) 0, #000 36px) !important;
  }
  body[data-ds-dark-theme] [class*="_bottomRow"] {
    background: #000 !important;
  }

  /* 会话里的输入条座位：像浮岛一样离底边留一段，同时让开手势条
     （WebView 里 env() 常为 0，安全区由壳注入 --dsh-safe-bottom） */
  .wSkVaW_composerSeat {
    padding-bottom: calc(12px + max(env(safe-area-inset-bottom, 0px), var(--dsh-safe-bottom, 0px))) !important;
  }

  .wSkVaW_composerHero .uV2eYG_root {
    position: fixed;
    left: 0;
    right: 0;
    bottom: calc(max(18px, max(env(safe-area-inset-bottom, 0px), var(--dsh-safe-bottom, 0px))) + var(--dsh-kb-inset, 0px));
    z-index: 55;
  }

  /* 工作区 chip：从空态 hero 行提到顶栏中间；只在空态存在，会话里不出现 */
  .wSkVaW_composerHero .wSkVaW_heroWorkspaceRow {
    position: fixed;
    left: 0;
    right: 0;
    z-index: 60;
    /* 与顶栏里那颗汉堡同一个纵向基线：顶栏 padding-top = 12 + safe-top，行高 40 */
    top: calc(12px + var(--dsh-safe-top, 0px));
    height: 40px;
    margin: 0;
    padding: 0 64px;
    align-items: center;
    justify-content: center;
    pointer-events: none;
  }
  .wSkVaW_heroWorkspaceRow > * { pointer-events: auto; }
  .wSkVaW_heroWorkspaceRow > :not([class*="_workspace"]):not(.dsh-mobile-clear-workspace) { display: none !important; }
  [class*="_workspace"] {
    height: 30px !important;
    padding: 0 10px 0 9px !important;
    border-radius: 999px !important;
    gap: 6px !important;
  }
  [class*="_workspaceLabel"] { font-size: 13px !important; font-weight: 600 !important; max-width: 160px; }
  [class*="_workspace"] svg { width: 14px; height: 14px; }

  /* 输入条：一整块圆角卡片。按钮行保留原生全套（+ / 权限 / GenUI / 模型 / 发送） */
  .uV2eYG_card { border: 0 !important; border-radius: 24px !important; padding-top: 4px !important; }
  .uV2eYG_scroll { padding: 6px 12px 0 !important; }
  .uV2eYG_input, .uV2eYG_placeholder { font-size: 15px !important; }
  /* 长草稿别把输入框撑到天花板：最多 6 行，超出在框内滚动 */
  .uV2eYG_input {
    padding: 2px 6px 0 12px !important;
    max-height: min(154px, 34vh);
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  .uV2eYG_row { padding: 2px 8px 8px !important; }

  /* 抽屉：工作区列表置顶，面板入口退到列表下面，删掉品牌行与「新会话」行 */
  /* 顶部按刘海高度留白，但那块就是页面自己的底色，看起来只是「留白」不是「切角」 */
  .hHd-Xa_root {
    display: flex;
    flex-direction: column;
    padding-top: calc(12px + var(--dsh-safe-top, 0px)) !important;
  }
  .hHd-Xa_logoRow, .hHd-Xa_newSession { display: none !important; }
  .hHd-Xa_regionArea { order: 1; }
  /* 手机上的 DSH = 对话 + 改动 + 余额：只留「工作区 Git」，其余面板入口全收 */
  .hHd-Xa_panelList { order: 2; margin: 0 8px 4px !important; }
  .hHd-Xa_panelRow[aria-label="插件"],
  .hHd-Xa_panelRow[aria-label="自动化任务"],
  .hHd-Xa_panelRow[aria-label="命令面板"],
  .hHd-Xa_panelRow[aria-label="MCP连接器"],
  .hHd-Xa_panelRow[aria-label="更多"] { display: none !important; }
  /* 与「左栏折叠」（dsh-shell-ui）打架的兜底：折叠器按 id 白名单把其余面板行收进「更多」，
     手机壳又把「更多」收掉，两边一叠加「工作区 Git」就没入口了（2026-11-02 实测）。
     第三屏是面板页，但这行入口仍然留在侧栏里，桌面/手机都能从这里开面板。 */
  html body nav > button[aria-label="工作区 Git"] { display: flex !important; }
  .hHd-Xa_footArea { order: 3; border-top: 0 !important; }
  .bhn1Oq_sectionHeader { height: 32px !important; }
  .bhn1Oq_sectionLabel { font-size: 13px !important; }
  .YDXeBa_projectRow { height: 35px !important; border-radius: 12px !important; margin: 1px 10px !important; }
  .YDXeBa_sessionRow { height: 42px !important; border-radius: 12px !important; margin: 1px 10px !important; padding: 0 6px 0 10px !important; }
  .YDXeBa_sessionRow .YDXeBa_title { font-size: 13px !important; }

  /* 选中的会话：蓝底 + 蓝字（原生选中只是灰底，黑底上看不出「当前在哪」）。
     色彩全走主题令牌：深色 = deepseek-800 底 + deepseek-400 字，浅色自动换另一套 */
  .YDXeBa_sessionRow.YDXeBa_selected {
    background: var(--dsw-alias-state-business-tertiary, rgba(77, 125, 254, .18)) !important;
    color: var(--dsw-alias-state-business-primary, #4d7dfe) !important;
  }
  .YDXeBa_sessionRow.YDXeBa_selected .YDXeBa_title {
    color: var(--dsw-alias-state-business-primary, #4d7dfe) !important;
  }
  /* 选中行行尾常驻「⋯」：原生只在 hover / 菜单打开时显形，触屏永远 hover 不到，
     等于手机上根本打不开会话菜单。这里改成「选中即显示」，并让时间/置顶针让位 */
  .YDXeBa_sessionRow.YDXeBa_selected .YDXeBa_time,
  .YDXeBa_sessionRow.YDXeBa_selected .YDXeBa_pinIndicator { display: none !important; }
  .YDXeBa_sessionRow.YDXeBa_selected .YDXeBa_rowActions {
    display: inline-flex !important;
    align-items: center;
    gap: 0 !important;
  }
  /* 行内只留「⋯」：归档/置顶这些 hover 按钮已经在菜单里，手机不摆重复图标。
     行的第一个子节点是 Menu 的锚点（原生 Menu 渲染成 <span> 包住按钮） */
  .YDXeBa_rowActions > :not(:first-child) { display: none !important; }
  /* 触摸目标 16 → 28px（行高 42，不会把行撑开） */
  .YDXeBa_sessionRow.YDXeBa_selected .YDXeBa_rowActions .YDXeBa_iconButton {
    width: 28px;
    height: 28px;
    border-radius: 8px;
    color: var(--dsw-alias-state-business-primary, #4d7dfe);
  }
  .YDXeBa_sessionRow.YDXeBa_selected .YDXeBa_rowActions .YDXeBa_iconButton svg {
    width: 18px;
    height: 18px;
  }
  .YDXeBa_sessionRow.YDXeBa_selected .YDXeBa_rowActions .YDXeBa_iconButton:hover,
  .YDXeBa_sessionRow.YDXeBa_selected .YDXeBa_rowActions .YDXeBa_iconButton:active {
    background: var(--dsw-alias-state-business-tertiary, rgba(77, 125, 254, .18));
  }

  /* 搜索展开：抽屉整屏、盖掉面板入口与账号区（原型里搜索是一整页） */
  html.dsh-search-open [class*="_sidebarCol"]:not(:has([class*="_collapsed"])),
  html.dsh-search-open [data-rp-page="sessions"] {
    width: 100% !important;
    border-radius: 0 !important;
    box-shadow: none !important;
  }
  html.dsh-search-open .hHd-Xa_panelList,
  html.dsh-search-open .hHd-Xa_footArea { display: none !important; }
  html.dsh-search-open .bhn1Oq_searchExpanded { height: 40px !important; border-radius: 16px !important; }
  html.dsh-search-open .bhn1Oq_searchInput { height: 38px !important; }

  /* ── 三屏横滑：非对话 / 对话 / 会话列表 ────────────────────────────────
     三页都是整屏，轨道由 installPager 逐帧写 transform，这里只给形态。
     没有遮罩、没有圆角、没有投影 —— 那是抽屉的语言，不是翻屏的语言。 */

  /* 第三屏的落地页（面板目录）：自己一层，平时停在右边一屏之外。
     面板打开时这一层让位（html.dsh-panels-open），屏幕归宿主的右栏面板。 */
  .dsh-page-panels {
    position: fixed;
    inset: 0;
    z-index: 880;
    display: block;
    background: #000;
    overflow: hidden;
    transform: translateX(100vw);
  }
  html.dsh-panels-open .dsh-page-panels { visibility: hidden; pointer-events: none; }

  /* 面板页：整屏面板的标签条要和对话顶栏那排控件同高。
     对话顶栏是「52 + 安全区」，控件占 12..52（中心 32）；面板标签按钮天然在
     10..38（中心 24），所以面板整体从「安全区 + 8px」开始 —— 中心正好落到 32。
     刘海屏上这一条同时把标签条从状态栏底下拉出来。停靠形态（768~1023）不动，
     那条是桌面语义，宿主自己按顶栏排。 */
  [data-rp-page="panels"] [data-sidebar-right-panel="fullscreen"] {
    top: calc(8px + var(--dsh-safe-top, 0px)) !important;
  }

  /* 面板落地页：一列卡片，语气和 iOS 设置页一致 */
  .dsh-panels {
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    height: 100%;
    overflow-y: auto;
    padding: calc(26px + env(safe-area-inset-top, 0px)) 16px
      calc(26px + max(env(safe-area-inset-bottom, 0px), var(--dsh-safe-bottom, 0px)));
  }
  .dsh-panels-head { padding: 2px 4px 18px; }
  .dsh-panels-head h1 {
    margin: 0;
    font-size: 32px;
    line-height: 1.12;
    font-weight: 700;
    letter-spacing: -.024em;
    color: var(--dsw-alias-label-primary, #fff);
  }
  .dsh-panels-head p { margin: 6px 0 0; font-size: 14px; color: rgba(235, 235, 245, .55); }
  .dsh-panels-list {
    display: flex;
    flex-direction: column;
    border-radius: 14px;
    overflow: hidden;
    background: #1c1c1e;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .06);
  }
  .dsh-panels-row {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    min-height: 58px;
    padding: 12px 14px;
    border: 0;
    background: transparent;
    color: inherit;
    text-align: left;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition: background-color 120ms ease-out;
  }
  .dsh-panels-row + .dsh-panels-row { box-shadow: inset 0 .5px 0 rgba(84, 84, 88, .55); }
  .dsh-panels-row:active { background: rgba(120, 120, 128, .18); }
  .dsh-panels-icon {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    color: #0a84ff;
  }
  .dsh-panels-icon > * { width: 20px; height: 20px; }
  .dsh-panels-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .dsh-panels-main b { font-size: 16px; font-weight: 500; }
  .dsh-panels-main small {
    font-size: 12.5px;
    color: rgba(235, 235, 245, .55);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .dsh-panels-chevron { flex: none; color: rgba(235, 235, 245, .3); }
  .dsh-panels-empty { margin: 18px 4px; font-size: 13px; line-height: 1.5; color: rgba(235, 235, 245, .5); }
  .dsh-panels-foot { margin: 18px 4px 0; font-size: 12px; line-height: 1.5; color: rgba(235, 235, 245, .35); }

  /* 侧栏内部还是按 280px 画的（.hHd-Xa_root 自带固定宽度）：整页化之后让它跟着铺满，
     否则外面那层撑到 100vw，工作区/会话列表仍旧只有 280 宽，右边一大片空黑。 */
  [class*="_sidebarCol"] .hHd-Xa_root,
  [data-rp-page="sessions"] .hHd-Xa_root {
    width: 100% !important;
    max-width: none !important;
  }

  /* 会话列表页：展开态一律铺满整屏（宿主给的是 280px 抽屉宽），并且先停在右边一屏之外 */
  html.dsh-pager-side [class*="_sidebarCol"]:not(:has([class*="_collapsed"])),
  html.dsh-pager-side [data-rp-page="sessions"] {
    width: 100vw !important;
    border-radius: 0 !important;
    box-shadow: none !important;
    animation: none !important;
    transition: none !important;
    transform: translateX(100vw);
  }

  /* 轨道在动的时候才升合成层：常驻 will-change 要显存，还会拖慢正文滚动 */
  html.dsh-pager-moving [class*="_centerCol"],
  html.dsh-pager-moving [data-rp-page="chat"],
  html.dsh-pager-moving .dsh-page-panels,
  html.dsh-pager-moving [class*="_sidebarCol"],
  html.dsh-pager-moving [data-rp-page="sessions"],
  html.dsh-pager-moving .dsh-mobile-newchat,
  html.dsh-pager-moving .dsh-mobile-panelbar,
  html.dsh-pager-moving .dsh-stats-tray {
    will-change: transform;
  }

  /* 接缝：页与页之间一条很窄的暗边。只有两页真的错开时才亮，
     全黑界面上它负责把「两屏」和「一屏被切了一刀」区分开。 */
  .dsh-pager-seam {
    position: fixed;
    top: 0;
    bottom: 0;
    left: 0;
    width: 18px;
    z-index: 950;
    pointer-events: none;
    opacity: 0;
    background: linear-gradient(to right, rgba(0, 0, 0, 0), rgba(0, 0, 0, .38));
  }

  /* 微交互：按压/悬停给 120ms 过渡，别让反馈是瞬变 */
  .dsh-mobile-hamburger, .dsh-mobile-newchat, .dsh-mobile-clear-workspace,
  .dsh-code-copy, .dsh-mobile-offline {
    transition: background-color 120ms ease-out, color 120ms ease-out,
      opacity 120ms ease-out, transform 120ms ease-out;
    -webkit-tap-highlight-color: transparent;
  }
  .dsh-mobile-hamburger:active, .dsh-mobile-newchat:active,
  .dsh-mobile-clear-workspace:active, .dsh-code-copy:active {
    transform: scale(.94);
  }
  @keyframes dsh-pill-in {
    from { opacity: 0; transform: translate(-50%, -4px); }
    to { opacity: 1; transform: translate(-50%, 0); }
  }
  .dsh-mobile-offline { animation: dsh-pill-in 160ms cubic-bezier(.2, .8, .2, 1); }
  @media (prefers-reduced-motion: reduce) {
    .dsh-mobile-offline { transition: none; animation: none; }
    /* 翻页的吸附动效由 JS 判 reduced：这里只需要保证宿主的侧栏挂载不闪 */
    [class*="_sidebarCol"]:not(:has([class*="_collapsed"])),
    [data-rp-page="sessions"] { animation: none !important; }
  }

  /* 会话正文的横向留白：原生每侧 = clearance(16) + 16 = 32px，
     390 的屏上等于两边各砍掉一行字；压到 16px，跟输入条卡片同一条基线 */
  .EvIC1a_scroll {
    padding-left: 16px !important;
    padding-right: 16px !important;
  }

  /* 输入条浮在正文上方（原生形态）：DSH 把座位做成滚动容器里的 sticky 贴底元素 +
     一段「透明 → 底色」的渐隐，正文从它下面穿过去；滚到底时座位本身占位，
     最后一条消息自然停在卡片上方。外壳不要再用 fixed + 正文 margin 把输入条「切」下来——
     那会在卡片上沿留一道硬边，看着像上下两层。
     键盘态只做一件事：滚动容器让开键盘高度（--dsh-kb-inset，installKeyboardDock 按
     visualViewport 算），sticky 的座位随手贴到键盘上沿，正文仍然从卡片下面走。 */
  .wSkVaW_scrollBody {
    margin-bottom: var(--dsh-kb-inset, 0px);
  }
  /* 键盘开着时手势条已经被键盘盖住，座位再留 safe-bottom 就是一条白缝 */
  html[data-dsh-keyboard] .wSkVaW_composerSeat {
    padding-bottom: 12px !important;
  }

  /* 滚轴细一点：原生 5px，390 屏上太抢眼。
     主题把变量挂在 body 上（不是 :root），所以得盖在同一层 */
  body { --dsh-scrollbar-width: 3px !important; }

  /* 思考过程展开：原生给步骤组一个 max-height:400px 的内部滚动框，
     展开后就是「页面一根滚轴 + 框里一根滚轴」，手指极易滚错。
     手机上一律展开到底（只留页面一根滚轴），改用一条左侧竖线 + 轻微缩进，
     表示「这一段是过程的旁注」；不再额外加内边距。 */
  .O_Ebla_body {
    max-height: none !important;
    overflow: visible !important;
    overscroll-behavior: none !important;
    scrollbar-gutter: auto !important;
    border-left: 2px solid var(--dsw-alias-border-l3);
    padding-left: 10px;
  }
  .O_Ebla_fadeTop, .O_Ebla_fadeBottom {
    mask-image: none !important;
    -webkit-mask-image: none !important;
  }

  /* 会话内容：代码块 / 表格 / 图片 / 附件在手机上不撑破页面 */
  .md-code-block { max-width: 100%; }
  .md-code-block pre,
  ._markdown_1ypvv_5 pre {
    box-sizing: border-box;
    max-width: 100%;
    overflow-x: auto !important;
    -webkit-overflow-scrolling: touch;
    /* 原生 11px 在手机上太小；长 token 不再从中间断词，改为块内横向滚动 */
    font-size: 13px !important;
    line-height: 20px !important;
    word-break: normal;
  }
  .md-code-block pre code,
  ._markdown_1ypvv_5 pre code,
  .md-code-block pre .line {
    font-size: 13px !important;
    line-height: 20px !important;
  }
  /* 原生 11px 的「复制」太小，手机上换成脚本注入的 28px 按钮 */
  .md-code-block [class*="_copyButton_"] { display: none !important; }
  .dsh-code-copy {
    box-sizing: border-box;
    min-width: 48px;
    min-height: 28px;
    padding: 2px 10px;
    border: 1px solid rgba(128, 128, 128, .28);
    border-radius: 8px;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 12px;
    line-height: 20px;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .dsh-code-copy[data-done="true"] { opacity: .6; }
  .dsh-code-copy--float {
    position: absolute;
    top: calc(6px + var(--dsh-safe-top, 0px));
    right: 6px;
    z-index: 2;
    background: var(--dsw-alias-bg-base, rgba(0, 0, 0, .4));
  }
  ._tableScroll_1ypvv_192 {
    max-width: 100%;
    overflow-x: auto !important;
    -webkit-overflow-scrolling: touch;
  }
  ._markdown_1ypvv_5 img { max-width: 100% !important; height: auto !important; }
  /* 附件行：文件卡片 / 图片缩略图都不横向溢出 */
  .Sixlwa_attachmentRow {
    max-width: 100%;
    min-width: 0;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
  .Sixlwa_fileCard { flex: 0 1 240px; max-width: 100%; min-width: 0; }
  .R_Yw7q_gallery { max-width: 100%; min-width: 0; }

}

/* 手机外壳：深色配色（浅色主题保持原生配色，只换骨架） */
@media (max-width: 1023px) {
  /* 纯黑底：连 DSH 自己的深色面（.wSkVaW_root / emptyTabHost / 抽屉）一起刷，
     否则空白页黑、会话页 #151517，开关抽屉会看到底色跳变。
     抽屉保持纯黑，靠遮罩提亮来区分层级。 */
  body[data-ds-dark-theme],
  body[data-ds-dark-theme] .wSkVaW_root,
  body[data-ds-dark-theme] [class*="_emptyTabHost"],
  body[data-ds-dark-theme] [class*="_frame"],
  body[data-ds-dark-theme] [data-rp-frame],
  body[data-ds-dark-theme] [class*="_centerCol"],
  body[data-ds-dark-theme] [data-rp-page="chat"],
  body[data-ds-dark-theme] [class*="_scrollBody"],
  body[data-ds-dark-theme] [class*="_sidebarCol"],
  body[data-ds-dark-theme] [data-rp-page="sessions"],
  body[data-ds-dark-theme] .hHd-Xa_root,
  body[data-ds-dark-theme] .hHd-Xa_regionArea,
  body[data-ds-dark-theme] .hHd-Xa_panelList {
    background: #000 !important;
  }
  body[data-ds-dark-theme] [class*="_sidebarCol"],
  body[data-ds-dark-theme] [data-rp-page="sessions"] {
    border: 0 !important;
    box-shadow: none;
  }
  body[data-ds-dark-theme] .wSkVaW_header { border-bottom: 0 !important; background: transparent !important; }
  body[data-ds-dark-theme] .uV2eYG_card {
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .06) !important;
  }
  body[data-ds-dark-theme] [class*="_workspace"] { background: rgba(255, 255, 255, .07) !important; }
  /* 列表底部的滚动渐隐原本渐到 #1b1b1c，跟统一底色对齐 */
  body[data-ds-dark-theme] .bhn1Oq_fade {
    background-image: linear-gradient(rgba(0, 0, 0, 0), #000) !important;
  }
}

@media (min-width: 1024px) {
  .dsh-mobile-hamburger, .dsh-mobile-newchat, .dsh-mobile-clear-workspace,
  .dsh-mobile-panelbar { display: none !important; }
  /* 窄屏才有的整屏页：桌面上它没有定位，必须整层收掉（否则会变成一个浮在最上面的 div） */
  .dsh-page-panels { display: none !important; }
}
  /* 断线胶囊：连续两次探活失败才出现，恢复即消失（任何宽度都显示） */
  .dsh-mobile-offline {
    position: fixed;
    top: calc(6px + var(--dsh-safe-top, 0px));
    left: 50%;
    transform: translateX(-50%);
    z-index: 80;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 999px;
    font-size: 12px;
    line-height: 1.2;
    color: #f2b8b5;
    background: rgba(40, 40, 44, .94);
    border: 1px solid rgba(242, 184, 181, .25);
    pointer-events: none;
  }
  .dsh-mobile-offline::before {
    content: '';
    width: 6px;
    height: 6px;
    border-radius: 999px;
    background: #f2b8b5;
  }


  /* 只对手机宽度生效：桌面端必须保持「左导航 188 + 右内容」。
     之前这组规则写在了 @media 外面，桌面端打开设置也会被改成顶部标签条。 */
  @media (max-width: 1023px) {
    /* 设置弹窗：原生是「左导航 188 + 右内容」，到 390 内容列只剩 154。
       这里把导航改成顶部一条可横滑的标签条，内容占满宽度；只匹配「有导航列的 dialog」。 */
    [role="dialog"]:has(> [class*="_nav"]) {
      flex-direction: column !important;
      width: calc(100vw - 16px) !important;
      max-width: none !important;
      max-height: calc(100dvh - 24px);
    }
    [role="dialog"] > [class*="_nav"] {
      flex: 0 0 auto !important;
      width: 100% !important;
      height: auto !important;
      padding: 4px 8px 0 !important;
      border-right: 0 !important;
      border-bottom: 1px solid rgba(255, 255, 255, .08);
    }
    [role="dialog"] > [class*="_nav"] > [class*="_navTitle"] { display: none !important; }
    [role="dialog"] > [class*="_nav"] [class*="_navList"] {
      flex-direction: row !important;
      height: auto !important;
      overflow-x: auto;
      overflow-y: hidden;
      gap: 2px;
      padding-bottom: 4px;
      scrollbar-width: none;
    }
    [role="dialog"] > [class*="_nav"] [class*="_navList"]::-webkit-scrollbar { height: 0; }
    [role="dialog"] > [class*="_nav"] [class*="_navCell"] {
      flex: 0 0 auto !important;
      width: auto !important;
      height: 34px !important;
      padding: 0 10px !important;
      white-space: nowrap;
    }
    [role="dialog"] > [class*="_content"] {
      flex: 1 1 auto !important;
      width: 100% !important;
      min-width: 0 !important;
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
      overscroll-behavior: contain;
      padding-bottom: max(env(safe-area-inset-bottom, 0px), var(--dsh-safe-bottom, 0px)) !important;
    }
  }

  /* 长会话滚动：只在窄屏做滚动容器层面的优化，桌面保持原样 */
  @media (max-width: 1023px) {
    /* 曾经给 markdown 块加 content-visibility:auto 想省渲染，
       但 4x CPU 节流实测滚动会卡出 155ms 的长帧（块进入视口时要重新布局），
       手机上的「卡顿」就是它。这里去掉，只保留滚动容器本身的优化。 */
    [class*="_scrollBody"] {
      overscroll-behavior: contain;
      -webkit-overflow-scrolling: touch;
    }
    /* 点按不要留系统高亮块（各 ROM 的 WebView 默认会给一层灰/蓝色块） */
    * { -webkit-tap-highlight-color: transparent; }
    *:focus:not(:focus-visible) { outline: none; }
  }

`
		/**
		 * 工作区 chip 右侧的 ×。
		 * 宿主没有「无工作区草稿」——所以这里只做一件原生已有的事：
		 * 取消当前选中（uiWorkspace.clearMain），回到「请选择工作区」的空态。
		 */
		function installWorkspaceClear(ctx) {
			if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return () => {}
			const tag = `rp-${Math.random().toString(36).slice(2, 8)}`
			// 没有选中会话（原生「请选择工作区」空态）时不该出现 ×
			const isEmpty = () => ctx.get('uiWorkspace')?.mainReference === undefined
			const ensure = () => {
				const row = document.querySelector('.wSkVaW_heroWorkspaceRow')
				if (!row) return
				const existing = row.querySelector('.dsh-mobile-clear-workspace')
				if (existing && existing.dataset.rp === tag) {
					existing.dataset.none = String(isEmpty())
					return
				}
				if (existing) existing.remove()
				const clear = document.createElement('button')
				clear.type = 'button'
				clear.className = 'dsh-mobile-clear-workspace'
				clear.title = '重新选择工作区'
				clear.setAttribute('aria-label', '重新选择工作区')
				clear.dataset.rp = tag
				clear.innerHTML = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>'
				clear.addEventListener('click', (event) => {
					event.preventDefault()
					event.stopPropagation()
					try {
						ctx.get('uiWorkspace')?.clearMain?.()
					} catch (error) {
						console.warn('[remote-panel] clear selection failed', error)
					}
				})
				clear.dataset.none = String(isEmpty())
				row.appendChild(clear)
			}
			// 流式回答时 DOM 每秒要变很多次，ensure 里是一次全量 querySelector，
			// 必须合并到每帧最多一次，否则主线程全被它占了（手机上就是掉帧）
			let frame = 0
			const schedule = () => {
				if (frame !== 0) return
				frame = requestAnimationFrame(() => {
					frame = 0
					ensure()
				})
			}
			const observer = new MutationObserver(schedule)
			observer.observe(document.body, { subtree: true, childList: true })
			ensure()
			return () => {
				observer.disconnect()
				if (frame !== 0) cancelAnimationFrame(frame)
				document.querySelector('.dsh-mobile-clear-workspace')?.remove()
			}
		}

		/**
		 * 手机返回键：翻到别的屏先翻回来，面板打开时先回对话，而不是退出页面。
		 * 做法是进入时 push 一条带标记的历史，离开时只回退自己那一条。
		 * 翻页和面板会互相打断（点面板行会先翻回对话），所以翻页回退要等它的 popstate
		 * 落地后再给面板压栈，否则会把刚压上的面板条目弹掉。
		 */
		function installBackGesture(layout) {
			if (typeof window === 'undefined' || typeof MutationObserver === 'undefined') return () => {}
			const query = window.matchMedia?.('(max-width: 1023px)')
			// 翻页态直接读 pager 写在 <html> 上的页码：1 就是对话（中屏）
			const page = () => {
				const value = Number(document.documentElement.dataset.dshPage)
				return Number.isFinite(value) && value >= 0 ? value : PAGER_CHAT
			}
			const isPaged = () => page() !== PAGER_CHAT
			const isPanel = () => document.documentElement.classList.contains('dsh-panel-open')
			const top = () => history.state ?? {}
			// 只在「我们自己发起了一次 history.back()、还没落地」时挂起，
			// 不记「压过几条」这类布尔量：那种状态一旦和真实历史错开就再也回不来
			let popping = false
			const push = (state) => {
				try {
					history.pushState(state, '')
					return true
				} catch {
					/* 某些 WebView 禁 pushState，忽略 */
					return false
				}
			}
			const onPop = (event) => {
				popping = false
				const state = event?.state ?? top()
				// 退回来时还停在别的屏：说明用户按的是系统返回，翻回对话
				if (isPaged()) {
					pagerApi?.go(PAGER_CHAT)
					return
				}
				if (isPanel() && state?.dshPage !== true) {
					try {
						layout?.selectPanel?.(null)
					} catch (error) {
						console.warn('[remote-panel] back to conversation failed', error)
					}
				}
			}
			let frame = 0
			const observer = new MutationObserver(() => {
				if (frame !== 0) return
				frame = requestAnimationFrame(() => {
					frame = 0
					check()
				})
			})
			/**
			 * 守卫条目完全由「当前状态 × 栈顶状态」推出来，不累积布尔量：
			 *   - 在别的屏 / 开着面板 → 栈顶必须是我们的守卫，否则压一条；
			 *   - 回到对话 / 面板关了 → 栈顶还留着我们的守卫就弹掉。
			 * 这样即便中途被手势、点选、程序化跳转搅乱，下一步也会自己收敛回来。
			 */
			const check = () => {
				if (query && !query.matches) return
				if (popping) return
				const state = top()
				const paged = isPaged()
				const panel = isPanel()
				if (paged && state.dshPage !== true) {
					push({ dshPage: true })
					return
				}
				if (!paged && state.dshPage === true) {
					popping = true
					history.back()
					return
				}
				if (panel && state.dshPanel !== true && state.dshPage !== true) {
					push({ dshPanel: true })
					return
				}
				if (!panel && state.dshPanel === true) {
					popping = true
					history.back()
				}
			}
			const onChange = () => check()
			observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-dsh-page'] })
			window.addEventListener('popstate', onPop)
			window.addEventListener('dsh-pager:change', onChange)
			return () => {
				observer.disconnect()
				window.removeEventListener('popstate', onPop)
				window.removeEventListener('dsh-pager:change', onChange)
			}
		}

		/**
		 * 手机三屏横滑：会话侧栏 · 对话 · 面板（宿主右栏）。
		 *
		 * 和旧抽屉的分界线（旧实现已整体删掉）：
		 *   - 抽屉是一张 280px 的卡片从左边缘浮出来，还要压一层遮罩 —— 那是浮层，不是翻屏；
		 *   - 翻屏是三张等宽的整屏并排成一条轨道，手指走多少、屏就走多少，抬手按惯性落到某一页。
		 *     没有遮罩、没有圆角、没有投影，只有页与页之间一道很窄的接缝。
		 *
		 * 三条轨道（每页连同它自己的顶栏一起动，这才是「手机滑动屏」）：
		 *   非对话   translateX((0 - t) × 宽)
		 *   对话     translateX((1 - t) × 宽)
		 *   会话列表 translateX((2 - t) × 宽)
		 * t 是连续的「当前停在第几页」；跟手时它等于手指位置，抬手后由弹簧补完。
		 *
		 * 为什么不用 CSS transition / 关键帧：
		 *   - 抬手那一下要接着手指的速度走，还要能中途被下一次触摸抓住（苹果的翻页都这样）；
		 *     CSS 过渡既没有速度交接，也要读 computedStyle 才能打断，手感会顿一下；
		 *   - 越界橡皮筋是位移的非线性映射，同样只能逐帧写。
		 */

		/** iOS 橡皮筋：越界 over 像素，视觉上只走这么多（渐近于整屏宽）。 */
		function pagerRubber(over, size) {
			if (!(over > 0) || !(size > 0)) return 0
			return (1 - 1 / ((over * 0.55) / size + 1)) * size
		}

		/** 橡皮筋的逆：视觉位移 → 真正被手指拉出去的位移。 */
		function pagerUnrubber(visual, size) {
			if (!(visual > 0) || !(size > 0)) return 0
			if (visual >= size) return visual
			return (size * visual) / (size - visual) / 0.55
		}

		/** 轨道位置 → 视觉位置（两端带橡皮筋）。 */
		function pagerClamp(pos, size, pages) {
			const max = (pages - 1) * size
			if (pos < 0) return -pagerRubber(-pos, size)
			if (pos > max) return max + pagerRubber(pos - max, size)
			return pos
		}

		/** 视觉位置 → 轨道位置（pagerClamp 的逆）。 */
		function pagerUnclamp(visual, size, pages) {
			const max = (pages - 1) * size
			if (visual < 0) return -pagerUnrubber(-visual, size)
			if (visual > max) return max + pagerUnrubber(visual - max, size)
			return visual
		}

		/**
		 * 抬手落在哪一页：先按 0.35s 的惯性投影算一个位置，再取最近的整页，
		 * 并且只允许挪到相邻页（一次手势最多翻一页，和 UIScrollView 的分页一致）。
		 * 这比「过了一半就翻」更跟手：轻甩能翻过去，慢慢拖到 49% 会弹回来。
		 */
		function pagerSettle(raw, velocity, size, pages, from) {
			if (!(size > 0)) return from
			const projected = raw + velocity * 0.35
			let target = Math.round(projected / size)
			if (target > from + 1) target = from + 1
			if (target < from - 1) target = from - 1
			if (target < 0) target = 0
			if (target > pages - 1) target = pages - 1
			return target
		}

		/**
		 * 外壳里「不是三屏页面」的固定件。
		 *
		 * 三屏按 frame 直接子元素的先后顺序认（侧栏 → 对话），所以这里必须把
		 * 所有不参与翻页的子元素列全，漏一个就会整体错位：
		 *   - `[data-rightbar-col]`  第三屏本体（右栏轨道），自己平移；
		 *   - `[data-shell-bottom]`  底部行；
		 *   - `[data-shell-overlay]` 浮层（面板落地页、离线胶囊等）；
		 *   - `[data-sidebar-mask]`  0.2.2 起窄屏抽屉的遮罩，排在 sidebarCol 前面；
		 *   - `[data-shell-leading]` 0.2.2 起左上角那枚开抽屉的座位，排在最后。
		 * 后两项是宿主改版新增的：不排除时 side 会认成遮罩、chat 认成侧栏，
		 * 翻页翻的全是不该动的节点（实测：对话列被留在 0 宽，整屏黑）。
		 */
		const SHELL_EXTRA =
			'[data-rightbar-col], [data-shell-bottom], [data-shell-overlay], [data-sidebar-mask], [data-shell-leading]'

		/** 从 frame 的直接子元素里挑出「会话页 / 对话页」：固定件全部跳过。 */
		function pickShellPages(children) {
			const rest = children.filter((el) => !el.matches(SHELL_EXTRA))
			if (rest.length < 2) return null
			return { side: rest[0], chat: rest[1] }
		}

		/**
		 * 把宿主外壳的三个关键节点认出来，并打上我们自己的标：
		 *
		 *   [data-shell-overlay] 的父节点  = 外壳 frame（宿主自己就在用这个钩子）
		 *   frame 的第 1 个非附属子节点    = 侧栏（右侧栏带 data-rightbar-col、底部行带 data-shell-bottom、
		 *                                    浮层带 data-shell-overlay，都能排除掉）
		 *   frame 的第 2 个                = 正文列
		 *
		 * 认出来之后写 `data-rp-frame` / `data-rp-page="sessions"|"chat"`，CSS 与手势只认这两个属性，
		 * 宿主换哈希前缀也不会碎；认不出来才退回 `_frame` / `_sidebarCol` 这类哈希类名（老版本 DSH 还能跑），
		 * 并把来源记在 frame 的 `data-rp-source` 上，供「外壳适配」自检读。
		 *
		 * 侧栏折叠也改认宿主的 `data-sidebar-collapsed`（frame 上的布尔属性），不再去侧栏内部
		 * 找 `_collapsed` 那个哈希类名；只有宿主没给这个属性时才回退。
		 */
		function markShell() {
			if (typeof document === 'undefined') return null
			const overlay = document.querySelector('[data-shell-overlay]')
			let frame = overlay?.parentElement ?? null
			let source = 'semantic'
			if (frame === null) {
				frame = document.querySelector('[class*="_frame"]')
				source = 'class'
			}
			if (frame === null) return null
			let side = null
			let chat = null
			if (source === 'semantic') {
				const picked = pickShellPages([...frame.children])
				if (picked !== null) {
					side = picked.side
					chat = picked.chat
				}
			}
			if (side === null || chat === null) {
				source = 'class'
				side = frame.querySelector('[class*="_sidebarCol"]')
				chat = frame.querySelector('[class*="_centerCol"]')
			}
			if (side === null || chat === null) return null
			// 只在没写过的时候写：这个函数会被逐帧调用，反复写属性会白白抖动 DOM
			if (!frame.hasAttribute('data-rp-frame')) frame.setAttribute('data-rp-frame', '')
			if (side.getAttribute('data-rp-page') !== 'sessions') side.setAttribute('data-rp-page', 'sessions')
			if (chat.getAttribute('data-rp-page') !== 'chat') chat.setAttribute('data-rp-page', 'chat')
			// 第三屏就是宿主的右栏：它平时是 0 宽的轨道，面板以绝对定位挂在里面，
			// 整列跟着翻页轨道走就等于「面板是第三屏」。
			const panels = frame.querySelector('[data-rightbar-col]')
			if (panels !== null && panels.getAttribute('data-rp-page') !== 'panels') panels.setAttribute('data-rp-page', 'panels')
			// 清掉上一轮留在别的节点上的页面标记（HMR 换实例、宿主改版换结构都会留下）：
			// 标记一旦挂在遮罩/顶栏上，CSS 那套整屏规则就会作用到错误的元素。
			for (const node of frame.querySelectorAll('[data-rp-page]')) {
				if (node !== side && node !== chat && node !== panels) node.removeAttribute('data-rp-page')
			}
			if (frame.getAttribute('data-rp-source') !== source) frame.setAttribute('data-rp-source', source)
			return {
				frame,
				side,
				chat,
				panels,
				source,
				/** 侧栏是不是展开着：优先读宿主自己的状态属性，老版本才退回折叠标记。 */
				expanded: () => {
					if (frame.hasAttribute('data-sidebar-collapsed')) return false
					return side.querySelector('[class*="_collapsed"]') === null
				},
			}
		}

		const PAGER_PAGES = 3
		/**
		 * 三个页面的水平顺序：会话侧栏(0) → 对话(1) → 面板(2)。
		 *
		 * 第三屏不是自绘页面，就是宿主自己的右栏（`[data-rightbar-col]`）：
		 * 桌面端它贴在右边缘，手机上它整屏呈现；翻页时整列跟着轨道走，
		 * 面板打开 = 这一屏从右边滑进来。
		 * 没打开任何面板时那一屏是空的，由 shell.overlay 里的落地页（PanelsPage）顶上。
		 *
		 * 位移必须同时改三处，否则会黑屏：
		 *   1) 这三个常量
		 *   2) paint()  —— 拖动过程中的位移
		 *   3) rest()   —— 弹簧停稳后的位移
		 * 只改 paint 不改 rest 时，拖动看着对、一停稳就被摆回屏幕外（实测整屏黑）。
		 */
		const PAGER_SESSIONS = 0
		const PAGER_CHAT = 1
		const PAGER_PANELS = 2
		/** 弹簧：响应时间 / 阻尼比（接近 SwiftUI 的 .spring(response: 0.34, dampingFraction: 0.9)）。 */
		const PAGER_SPRING = { response: 0.34, damping: 0.9 }

		function installPager(layout) {
			if (typeof document === 'undefined' || typeof window === 'undefined') return () => {}
			const narrow = window.matchMedia?.('(max-width: 1023px)')
			if (narrow === undefined || narrow === null) return () => {}
			const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')
			// HMR：新实例先让旧实例自清理，否则一次横滑会被两套监听各算一次
			try {
				globalThis[PAGER_CLEANUP_KEY]?.()
			} catch {
				/* 旧实例清理失败不阻塞新实例 */
			}

			const SYS_EDGE = 24 // 左右各让给系统返回手势（Android 两侧都能返回）
			const ARM = 10 // 判轴位移：到这一步才决定这是不是翻页
			const FLICK_GAP_MS = 90 // 抬手前这么久没动，就不算甩

			const rootEl = () => document.documentElement
			// 每次翻页都重认外壳会被 MutationObserver 吵疯：缓存一份，frame 被换掉（React 重挂布局）再重认
			let refs = null
			const shell = () => {
				if (refs !== null && refs.frame.isConnected === true) return refs
				refs = markShell()
				return refs
			}
			const chatEl = () => shell()?.chat ?? null
			const sessionsEl = () => shell()?.side ?? null
			/**
			 * 第三屏：宿主的右栏整列。面板（文件/终端/浏览器/工作区 Git）挂在里面，
			 * 靠绝对定位铺满一屏；翻页时整列平移，就是「面板从右边滑进来」。
			 */
			let panelsRef = null
			const panelsEl = () => {
				// 右栏这一列会被 React 重挂（开合面板时换子树），缓存节点会指到已卸载的那棵：
				// 每帧一次 querySelector 便宜得多，指错了整屏就不跟着滑。
				const frame = shell()?.frame ?? null
				if (frame === null) return null
				if (panelsRef !== null && panelsRef.isConnected === true && frame.contains(panelsRef)) return panelsRef
				panelsRef = frame.querySelector('[data-rightbar-col]')
				if (panelsRef !== null && panelsRef.getAttribute('data-rp-page') !== 'panels') {
					panelsRef.setAttribute('data-rp-page', 'panels')
				}
				return panelsRef
			}
			/** 第三屏的落地页（面板没开时顶上来的一层）——和右栏用同一条位移。 */
			const panelsPageEl = () => document.querySelector('.dsh-page-panels')
			/**
			 * 前台那一块面板（背景会话的面板也带同样的属性，但 display 掉了，没有 rect）。
			 * 只认宿主写的语义属性，不认 `P3OORG_*` 这类哈希类名。
			 */
			const panelEl = () => {
				const nodes = document.querySelectorAll('[data-sidebar-right-open]')
				for (const node of nodes) {
					if (node.getAttribute('data-sidebar-right-open') === 'false') continue
					if (node.getClientRects().length === 0) continue
					return node
				}
				return null
			}
			const panelOpen = () => panelEl() !== null
			/**
			 * 面板是不是「整屏」。窄窗口（<768px）宿主会自动全屏，768~1023 则是停靠 300px：
			 * 后者不是这一屏的东西，翻页时不能平移它，否则停在屏幕外的面板会挡在对话上。
			 */
			const panelFullscreen = () => panelEl()?.getAttribute('data-sidebar-right-panel') === 'fullscreen'
			/**
			 * 宿主外壳的固定件挂在 body 上、不在对话列里，翻页时必须手动带上，
			 * 否则它们会浮在新翻出来的那一页上面（顶栏统计、右下角 ＋、面板返回条）。
			 */
			const chromeEls = () =>
				[
					document.querySelector('.dsh-mobile-newchat'),
					document.querySelector('.dsh-mobile-panelbar'),
					document.querySelector('.dsh-stats-tray'),
				].filter((el) => el !== null)

			// 页与页之间的接缝：一条很窄的暗边，只有真的在动的时候才亮
			const seamLeft = document.createElement('div')
			seamLeft.className = 'dsh-pager-seam'
			const seamRight = document.createElement('div')
			seamRight.className = 'dsh-pager-seam'
			document.body.append(seamLeft, seamRight)

			let size = Math.max(1, rootEl().clientWidth || window.innerWidth)
			let page = PAGER_CHAT
			let pos = size
			let vel = 0
			let rafId = 0
			let springTarget = size
			let drag = null
			let sessionsOn = false
			let sidePump = 0
			let sidePumpUntil = 0
			let disposed = false

			/** 把轨道摆到 track 像素处。三种元素各自一屏宽，所以只需要一个位移。 */
			const paint = (track) => {
				const chat = chatEl()
				if (chat !== null) chat.style.transform = `translate3d(${size - track}px, 0, 0)`
				// 页0 会话侧栏用 -track；页2 面板（宿主右栏）在最右用 2*size-track
				const panels = panelsEl()
				if (panels !== null) {
					panels.style.transform = panelFullscreen() ? `translate3d(${2 * size - track}px, 0, 0)` : ''
				}
				const panelsPage = panelsPageEl()
				if (panelsPage !== null) panelsPage.style.transform = `translate3d(${2 * size - track}px, 0, 0)`
				const side = sessionsEl()
				if (side !== null) side.style.transform = `translate3d(${-track}px, 0, 0)`
				for (const el of chromeEls()) el.style.transform = `translate3d(${size - track}px, 0, 0)`
				const t = track / size
				const left = Math.max(0, Math.min(1, 4 * t * (1 - t)))
				const right = Math.max(0, Math.min(1, 4 * (t - 1) * (2 - t)))
				seamLeft.style.opacity = String(left * 0.85)
				seamLeft.style.transform = `translate3d(${(1 - t) * size - 18}px, 0, 0)`
				seamRight.style.opacity = String(right * 0.85)
				seamRight.style.transform = `translate3d(${(2 - t) * size - 18}px, 0, 0)`
			}

			const stopSpring = () => {
				if (rafId !== 0) cancelAnimationFrame(rafId)
				rafId = 0
			}
			const springing = () => rafId !== 0

			/** 停稳：写死到整页，并且把当前页的内联位移清掉（常驻合成层要显存）。 */
			const rest = (value) => {
				stopSpring()
				vel = 0
				page = Math.max(0, Math.min(PAGER_PAGES - 1, Math.round(value)))
				pos = page * size
				rootEl().classList.remove('dsh-pager-dragging', 'dsh-pager-moving')
				rootEl().dataset.dshPage = String(page)
				const offset = (1 - page) * size
				const chat = chatEl()
				if (chat !== null) chat.style.transform = page === PAGER_CHAT ? '' : `translate3d(${offset}px, 0, 0)`
				const panels = panelsEl()
				if (panels !== null) {
					panels.style.transform = panelFullscreen() ? `translate3d(${(2 - page) * size}px, 0, 0)` : ''
				}
				const panelsPage = panelsPageEl()
				if (panelsPage !== null) panelsPage.style.transform = `translate3d(${(2 - page) * size}px, 0, 0)`
				const side = sessionsEl()
				if (side !== null) side.style.transform = `translate3d(${-page * size}px, 0, 0)`
				for (const el of chromeEls()) {
					el.style.transform = page === PAGER_CHAT ? '' : `translate3d(${offset}px, 0, 0)`
				}
				seamLeft.style.opacity = '0'
				seamRight.style.opacity = '0'
				if (page === PAGER_SESSIONS) ensureSessions()
				else releaseSessions()
				rootEl().classList.toggle('dsh-pager-panels', page === PAGER_PANELS)
				if (page === PAGER_PANELS) ensurePanels()
				watchPanels()
				try {
					window.dispatchEvent(new CustomEvent('dsh-pager:change', { detail: { page } }))
				} catch {
					/* 老 WebView 没有 CustomEvent 构造器 */
				}
			}

			/** 弹簧补完：接着抬手速度走，可被下一次触摸打断。 */
			const springTo = (target) => {
				springTarget = target
				if (reduced?.matches === true) {
					rest(target / size)
					return
				}
				stopSpring()
				rootEl().classList.add('dsh-pager-moving')
				const w0 = (2 * Math.PI) / PAGER_SPRING.response
				const stiffness = w0 * w0
				const damping = 2 * PAGER_SPRING.damping * w0
				let prev = performance.now()
				const tick = (now) => {
					rafId = 0
					if (disposed) return
					const dt = Math.min(0.064, Math.max(0.001, (now - prev) / 1000))
					prev = now
					// 定步长积分：60Hz 与 120Hz 屏走同一条曲线
					const steps = Math.max(1, Math.ceil(dt / (1 / 240)))
					const h = dt / steps
					for (let i = 0; i < steps; i += 1) {
						vel += (-stiffness * (pos - springTarget) - damping * vel) * h
						pos += vel * h
					}
					paint(pos)
					if (Math.abs(pos - springTarget) < 0.6 && Math.abs(vel) < 30) {
						rest(springTarget / size)
						return
					}
					rafId = requestAnimationFrame(tick)
				}
				rafId = requestAnimationFrame(tick)
			}

			const sessionsOpen = () => {
				const resolved = shell()
				return resolved !== null && resolved.expanded()
			}

			/** 侧栏是宿主 React 渲染的：收起态在 DOM 里根本没有，得先 toggle 再等它挂上。 */
			const ensureSessions = () => {
				if (sessionsOn) return
				sessionsOn = true
				rootEl().classList.add('dsh-pager-side')
				if (!sessionsOpen()) {
					try {
						layout?.toggleSidebar?.()
					} catch (error) {
						console.warn('[remote-panel] open sessions failed', error)
					}
				}
				pumpSide()
			}

			const releaseSessions = () => {
				if (!sessionsOn) return
				sessionsOn = false
				rootEl().classList.remove('dsh-pager-side')
				if (sessionsOpen()) {
					try {
						layout?.toggleSidebar?.()
					} catch (error) {
						console.warn('[remote-panel] close sessions failed', error)
					}
				}
				// 收起后擦掉上一轮留下的内联位移（此刻已经 display:none，不会闪）
				window.setTimeout(() => {
					if (disposed || sessionsOn || sessionsOpen()) return
					const el = sessionsEl()
					if (el !== null) el.style.transform = ''
				}, 260)
			}

			/** 侧栏挂载要跨一两帧，这段时间里一直补位移，免得它先在左边闪一下。 */
			const pumpSide = () => {
				if (sidePump !== 0) return
				sidePumpUntil = performance.now() + 500
				const tick = () => {
					sidePump = 0
					if (disposed) return
					paint(pos)
					if (sessionsOpen() || performance.now() > sidePumpUntil) return
					sidePump = requestAnimationFrame(tick)
				}
				sidePump = requestAnimationFrame(tick)
			}

			/**
			 * 第三屏的落地页（没开面板时的「面板列表」）是懒挂载的 React 层：
			 * 翻过去之前先叫它挂上，否则那一屏第一眼是黑的。
			 */
			const ensurePanels = () => {
				try {
					window.dispatchEvent(new Event('dsh-pager:panels'))
				} catch {
					/* 忽略 */
				}
			}

			/** 程序化翻页（☰ / 返回对话 / 系统返回都走这里）。 */
			const go = (target) => {
				if (!narrow.matches) return
				const next = Math.max(0, Math.min(PAGER_PAGES - 1, Math.round(target)))
				if (next === PAGER_SESSIONS) ensureSessions()
				if (next === PAGER_PANELS) ensurePanels()
				if (next === page && !springing()) {
					rest(page)
					return
				}
				vel = 0
				springTo(next * size)
			}

			const findTouch = (list, id) => {
				for (const touch of list ?? []) if (touch.identifier === id) return touch
				return null
			}
			const pushSample = (d, x) => {
				d.samples.push({ x, t: performance.now() })
				while (d.samples.length > 2 && performance.now() - d.samples[0].t > 120) d.samples.shift()
			}
			/** 手指速度（px/s）。抬手前停住超过 90ms 就不算甩。 */
			const fingerVelocity = (d) => {
				const samples = d.samples
				if (samples.length < 2) return 0
				const first = samples[0]
				const last = samples[samples.length - 1]
				if (performance.now() - last.t > FLICK_GAP_MS) return 0
				const dt = last.t - first.t
				if (dt <= 0) return 0
				return ((last.x - first.x) / dt) * 1000
			}

			/** 起手就让开的：输入 / 可编辑、弹层、宿主的侧栏拖拽手柄。 */
			const blockedStart = (target) => {
				if (!(target instanceof Element)) return false
				if (target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]') !== null) return true
				/**
				 * 会话页就是宿主的窄屏侧栏，0.2.2 起它自带 role="dialog" + aria-modal
				 * （宿主把抽屉当浮层做了可访问性声明）。这一页本身必须还能横滑回对话，
				 * 否则滑进会话页就出不来（实测：从会话页左滑永远不翻页）。
				 * 侧栏里真正的菜单/弹层仍然让开。
				 */
				if (target.closest('[data-rp-page="sessions"], [class*="_sidebarCol"]') !== null) {
					return target.closest('[role="menu"], [class*="_menu"], [class*="_modal"]') !== null
				}
				if (target.closest('[role="dialog"], [role="menu"], [class*="_dialog"], [class*="_modal"]') !== null) return true
				if (target.closest('[class*="_handle"][data-side]') !== null) return true
				return false
			}

			/** 起手落在「还能朝这个方向横滚」的容器上（代码块、表格、时间轴）就让开。 */
			const blockedScroll = (target, dx) => {
				let el = target instanceof Element ? target : null
				while (el !== null && el !== document.body) {
					if (el.scrollWidth > el.clientWidth + 2) {
						const style = window.getComputedStyle(el)
						if (style.overflowX === 'auto' || style.overflowX === 'scroll') {
							const max = el.scrollWidth - el.clientWidth
							if (dx > 0 && el.scrollLeft > 1) return true
							if (dx < 0 && el.scrollLeft < max - 1) return true
						}
					}
					el = el.parentElement
				}
				return false
			}

			/** 手势没成立（判成竖滑 / 起手在横滚区 / 只是点了一下）：回到当前页并清干净。 */
			const idle = (d, settle) => {
				if (d !== null && d.interrupted && d.resumeAt !== null) {
					springTo(d.resumeAt)
					return
				}
				// 走 rest 而不是 paint：rest 会把当前页的内联位移擦掉，
				// 否则一次竖滑也会给正文留一个常驻合成层
				rest(settle)
			}

			const onStart = (event) => {
				if (!narrow.matches || drag !== null) return
				if (event.touches.length !== 1) return
				const touch = event.touches[0]
				if (touch.clientX < SYS_EDGE || touch.clientX > window.innerWidth - SYS_EDGE) return
				if (blockedStart(event.target)) return
				// 正吸附到一半被按住：就地抓住轨道，别让它自己跑完
				const interrupted = springing()
				const resumeAt = interrupted ? springTarget : null
				if (interrupted) stopSpring()
				vel = 0
				drag = {
					id: touch.identifier,
					startTs: event.timeStamp,
					x0: touch.clientX,
					y0: touch.clientY,
					base: pagerUnclamp(pos, size, PAGER_PAGES),
					axis: null,
					armed: false,
					from: page,
					interrupted,
					resumeAt,
					samples: [{ x: touch.clientX, t: performance.now() }],
				}
			}

			const onMove = (event) => {
				const d = drag
				if (d === null) return
				if (event.timeStamp < d.startTs) return
				const touch = findTouch(event.touches, d.id)
				if (touch === null) return
				const dx = touch.clientX - d.x0
				const dy = touch.clientY - d.y0
				if (d.axis === null) {
					const ax = Math.abs(dx)
					const ay = Math.abs(dy)
					if (ax < ARM && ay < ARM) return
					// 竖向优先：斜着划正文时不要被拽成翻页
					if (ax <= ay * 1.2) {
						idle(d, page)
						drag = null
						return
					}
					if (blockedScroll(event.target, dx)) {
						idle(d, page)
						drag = null
						return
					}
					d.axis = 'x'
					d.armed = true
					rootEl().classList.add('dsh-pager-dragging', 'dsh-pager-moving')
					// 往哪边划，就把那一页先备好：
					// 页0=会话侧栏(左)、页1=对话、页2=面板(右)，
					// 手指右滑→页号变小→会话列表，左滑→页号变大→面板。
					if (dx > 0) ensureSessions()
					else ensurePanels()
				}
				// 判成横滑之后再抢滚动；不抢的话手指划到一半会被浏览器接管
				if (event.cancelable) event.preventDefault()
				pushSample(d, touch.clientX)
				pos = pagerClamp(d.base - dx, size, PAGER_PAGES)
				// 中途反向也要把另一页备好，不然会露出黑底。
				if (pos < size) ensureSessions()
				else if (pos > size) ensurePanels()
				paint(pos)
			}

			const onEnd = (event) => {
				const d = drag
				if (d === null) return
				drag = null
				if (!d.armed) {
					idle(d, page)
					return
				}
				rootEl().classList.remove('dsh-pager-dragging')
				const touch = findTouch(event.changedTouches, d.id)
				if (touch !== null && event.timeStamp >= d.startTs) {
					// 用抬手位置补最后一帧：最后一段 move 常被浏览器合并掉，
					// 不补的话判定用的是过期位移（差一点就翻/不翻）
					pushSample(d, touch.clientX)
					pos = pagerClamp(d.base - (touch.clientX - d.x0), size, PAGER_PAGES)
					paint(pos)
				}
				const trackVel = -fingerVelocity(d)
				vel = trackVel
				const target = pagerSettle(pagerUnclamp(pos, size, PAGER_PAGES), trackVel, size, PAGER_PAGES, d.from)
				springTo(target * size)
			}

			const onCancel = () => {
				const d = drag
				if (d === null) return
				drag = null
				if (!d.armed) {
					idle(d, page)
					return
				}
				vel = 0
				springTo(Math.round(pagerUnclamp(pos, size, PAGER_PAGES) / size) * size)
			}

			/**
			 * 面板与翻页的关系：面板就是第三屏。
			 *
			 * - 面板一打开（对话里点文件、顶栏的展开按钮、或者落地页里点一个入口），
			 *   轨道立即滑到第三页 —— 否则面板挂在屏幕外，点了像没反应；
			 * - 面板收起时回到打开它的那一页：从落地页开的回落地页，从对话开的回对话。
			 *
			 * 认的是宿主写在面板上的 `data-sidebar-right-open`，不认哈希类名。
			 */
			/**
			 * 把右栏摆回它该在的像素位。面板节点的出现/消失不会自动带上轨道位移：
			 * 节点是新插进来的时候，列上的 transform 还是上一次的（甚至空）。
			 */
			const placePanels = () => {
				if (drag !== null) return
				const panels = panelsEl()
				const layer = panelsPageEl()
				// 桌面端（>1023）这块不是翻页的一屏：右栏是宿主的列，任何位移都会把
				// 全屏面板整体推出屏幕 —— 表现就是一片灰底（2026-11-07 实测：
				// 1400 宽点「全屏」后列被写成 translate3d(1400px)，面板跑到 x=1400）。
				if (!narrow.matches) {
					if (panels !== null && panels.style.transform !== '') panels.style.transform = ''
					if (layer !== null && layer.style.transform !== '') layer.style.transform = ''
					return
				}
				if (panels !== null) {
					panels.style.transform = panelFullscreen() ? `translate3d(${(2 - page) * size}px, 0, 0)` : ''
				}
				if (layer !== null) layer.style.transform = `translate3d(${(2 - page) * size}px, 0, 0)`
			}

			let panelWasOpen = panelOpen()
			let panelWasFull = panelFullscreen()
			let panelOrigin = PAGER_CHAT
			const syncPanels = () => {
				watchPanels()
				const open = panelOpen()
				const full = open && panelFullscreen()
				// 只有「整屏面板」才让落地页让位；停靠态（768~1023）那一屏仍然是面板目录
				rootEl().classList.toggle('dsh-panels-open', full)
				placePanels()
				if (open === panelWasOpen && full === panelWasFull) return
				const justOpened = open && !panelWasOpen
				const changedMode = open && full !== panelWasFull
				panelWasOpen = open
				panelWasFull = full
				if (!narrow.matches) return
				if (open && (justOpened || changedMode)) {
					// 停靠态只在 768~1023 存在（窄窗口宿主自动全屏）。
					// 手机上偶尔会先看到「开了但还没标 fullscreen」的中间态，
					// 那一下不能当成停靠态，否则会先弹回对话再翻回来，闪一下。
					const docked = !full && window.innerWidth >= 768
					if (docked) {
						// 停靠态：面板就贴在对话右侧，翻到别的页反而看不见它
						if (page === PAGER_PANELS) go(PAGER_CHAT)
						return
					}
					if (!full) return
					// 记住「从哪一页开的」：从对话开就回对话，从面板页开就回面板页
					panelOrigin = page
					if (page !== PAGER_PANELS) go(PAGER_PANELS)
					return
				}
				if (!open && page === PAGER_PANELS) go(panelOrigin)
			}
			/**
			 * 面板子树是第一现场：第一次打开面板时，节点是**带着属性插入**的，
			 * 只 observe attributes 收不到（插入只报 childList）。所以盯右栏这一列，
			 * 而且只盯它 —— 盯整棵树的话正文流式输出每一个 token 都会叫醒回调。
			 * 右栏被 React 重挂时 watchPanels() 会重新挂观察器。
			 */
			let panelObserver = null
			let panelGlobal = null
			let observedCol = null
			let syncQueued = 0
			const queueSync = () => {
				if (syncQueued !== 0) return
				syncQueued = requestAnimationFrame(() => {
					syncQueued = 0
					syncPanels()
				})
			}
			const watchPanels = () => {
				if (typeof MutationObserver !== 'function') return
				const col = panelsEl()
				if (col !== null && col !== observedCol) {
					if (panelObserver === null) panelObserver = new MutationObserver(queueSync)
					panelObserver.disconnect()
					observedCol = col
					panelObserver.observe(col, {
						childList: true,
						subtree: true,
						attributes: true,
						attributeFilter: ['data-sidebar-right-open', 'data-sidebar-right-panel', 'hidden'],
					})
				}
				// 右栏整列被 React 重挂时上面那台观察器也跟着作废：属性这一层挂在
				// documentElement 上兜底，换节点也照样能收到开合。
				if (panelGlobal === null) {
					panelGlobal = new MutationObserver(queueSync)
					panelGlobal.observe(document.documentElement, {
						subtree: true,
						attributes: true,
						attributeFilter: ['data-sidebar-right-open', 'data-sidebar-right-panel'],
					})
				}
			}
			watchPanels()
			syncPanels()
			// 开机那几下：插件的 apply 可能早于面板树提交，几帧内补认几次，
			// 避免「已经开着的面板」被当成没开（那一屏就会盖在对话上）。
			for (const delay of [120, 480, 1200, 2800]) {
				window.setTimeout(() => {
					if (disposed) return
					watchPanels()
					syncPanels()
				}, delay)
			}

			const clearInline = () => {
				for (const el of [chatEl(), panelsEl(), panelsPageEl(), sessionsEl(), ...chromeEls()]) {
					if (el !== null) el.style.transform = ''
				}
				seamLeft.style.opacity = '0'
				seamRight.style.opacity = '0'
			}

			const onResize = () => {
				const next = Math.max(1, rootEl().clientWidth || window.innerWidth)
				if (next === size) return
				size = next
				if (narrow.matches) rest(page)
			}

			const onNarrow = () => {
				rootEl().classList.toggle('dsh-pager', narrow.matches)
				rootEl().classList.toggle('dsh-pager-panels', false)
				if (narrow.matches) {
					size = Math.max(1, rootEl().clientWidth || window.innerWidth)
					rest(page)
					return
				}
				stopSpring()
				sessionsOn = false
				rootEl().classList.remove('dsh-pager-dragging', 'dsh-pager-moving', 'dsh-pager-side')
				delete rootEl().dataset.dshPage
				clearInline()
			}

			const options = { capture: true, passive: false }
			document.addEventListener('touchstart', onStart, options)
			document.addEventListener('touchmove', onMove, options)
			document.addEventListener('touchend', onEnd, options)
			document.addEventListener('touchcancel', onCancel, options)
			/* 面板入口不再拦截：面板自己就在第三屏里，点了由宿主展开，观察器负责翻页 */
			window.addEventListener('resize', onResize)
			window.addEventListener('orientationchange', onResize)
			narrow.addEventListener?.('change', onNarrow)

			requestAnimationFrame(() => {
				if (disposed) return
				rootEl().classList.toggle('dsh-pager', narrow.matches)
				if (narrow.matches) rest(page)
			})

			pagerApi = { go, page: () => page, sessionsOpen, panelsOpen: panelOpen }

			const cleanup = () => {
				if (disposed) return
				disposed = true
				document.removeEventListener('touchstart', onStart, true)
				document.removeEventListener('touchmove', onMove, true)
				document.removeEventListener('touchend', onEnd, true)
				document.removeEventListener('touchcancel', onCancel, true)
				/* onPanelEntry 已移除 */
				window.removeEventListener('resize', onResize)
				window.removeEventListener('orientationchange', onResize)
				narrow.removeEventListener?.('change', onNarrow)
				try {
					panelObserver?.disconnect()
					panelGlobal?.disconnect()
					if (syncQueued !== 0) cancelAnimationFrame(syncQueued)
				} catch {
					/* 订阅已失效 */
				}
				rootEl().classList.remove('dsh-panels-open')
				stopSpring()
				if (sidePump !== 0) cancelAnimationFrame(sidePump)
				drag = null
				seamLeft.remove()
				seamRight.remove()
				clearInline()
				rootEl().classList.remove('dsh-pager-dragging', 'dsh-pager-moving', 'dsh-pager-side', 'dsh-pager')
				pagerApi = null
				if (globalThis[PAGER_CLEANUP_KEY] === cleanup) delete globalThis[PAGER_CLEANUP_KEY]
			}
			globalThis[PAGER_CLEANUP_KEY] = cleanup
			return cleanup
		}

		/**
		 * 静态资源缓存：给 `/plugins/*`、`/assets/*` 装一层 Service Worker。
		 *
		 * 为什么需要：DSH 的插件合并包 gzip 后 5.7MB，本来靠 `Cache-Control: immutable` 缓存；
		 * 但部分 ROM / 清理工具会清掉 WebView 的 HTTP 缓存，清一次就要重下 30 秒。
		 * SW 的 CacheStorage 与 HTTP 缓存分开，清「缓存」不会带走它。
		 *
		 * 只缓存这两类 URL：它们都带版本（combo 的 rev / 构建产物的 hash），
		 * 换版本自然换 key，所以不存在「缓存旧代码」的问题。
		 *
		 * 逃生：页面 URL 带 `?nosw=1` 时注销并清空缓存。
		 */
		function installAssetCache() {
			if (typeof window === 'undefined' || typeof navigator === 'undefined') return
			if (!('serviceWorker' in navigator)) return
			if (globalThis.__DSH_ASSET_CACHE_INSTALLED__ === true) return
			globalThis.__DSH_ASSET_CACHE_INSTALLED__ = true

			if (/[?&]nosw=1(&|$)/.test(window.location.search)) {
				try {
					navigator.serviceWorker.getRegistrations().then((list) => {
						for (const registration of list) void registration.unregister()
					}, () => {})
				} catch {
					/* 非安全上下文 */
				}
				try {
					void caches.keys().then((names) => {
						for (const name of names) if (name.startsWith('dsh-static-')) void caches.delete(name)
					}, () => {})
				} catch {
					/* 没有 CacheStorage */
				}
				return
			}
			// 非 https / 证书未受信任时浏览器不给装 SW：静默降级
			if (window.isSecureContext !== true) return

			navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(
				async (registration) => {
					try {
						await navigator.serviceWorker.ready
						const urls = []
						const seen = new Set()
						for (const entry of performance.getEntriesByType('resource')) {
							const url = entry.name
							if (seen.has(url) || !/\/(plugins|assets)\//.test(url)) continue
							seen.add(url)
							urls.push(url)
						}
						// 首屏用到的资源已经在 HTTP 缓存里，预取不产生额外流量；
						// 回填后「第一次访问」也能直接进 SW 缓存
						registration.active?.postMessage({ type: 'precache', urls: urls.slice(0, 64) })
					} catch {
						/* ready 失败：下次启动再回填 */
					}
				},
				() => {
					/* 注册被拒（不安全上下文 / 内核不支持）：不影响页面 */
				},
			)
		}

		/**
		 * 真机性能探针：URL 带 `?dsh-fps=1` 时在左下角显示帧率 / 最慢帧 / 长任务数。
		 *
		 * 只是为了在手机上定位「哪一步卡」，平时不加载任何逻辑（默认直接 return）。
		 */
		function installFpsMeter() {
			if (typeof window === 'undefined' || typeof document === 'undefined') return () => {}
			let enabled = /[?&]dsh-fps=1(&|$)/.test(window.location.search)
			if (!enabled) {
				try {
					enabled = window.sessionStorage.getItem('dsh-fps') === '1'
				} catch {
					/* 隐私模式禁 storage，忽略 */
				}
			}
			if (!enabled) return () => {}

			const box = document.createElement('div')
			box.style.cssText =
				'position:fixed;left:8px;bottom:8px;z-index:99999;padding:4px 8px;border-radius:8px;' +
				'background:rgba(0,0,0,.72);color:#7ef29b;font:11px/1.5 ui-monospace,monospace;' +
				'pointer-events:none;white-space:pre;'
			document.body.appendChild(box)

			let frames = 0
			let since = performance.now()
			let worst = 0
			let longTasks = 0
			let fps = 0
			let observer = null
			try {
				observer = new PerformanceObserver((list) => {
					for (const entry of list.getEntries()) if (entry.duration > 50) longTasks += 1
				})
				observer.observe({ entryTypes: ['longtask'] })
			} catch {
				/* 老内核没有 longtask，忽略 */
			}

			const paint = () => {
				box.textContent = `${fps}fps  worst ${Math.round(worst)}ms  long ${longTasks}`
				worst = 0
			}
			let raf = 0
			const tick = (now) => {
				frames += 1
				worst = Math.max(worst, now - since)
				const elapsed = now - since
				if (elapsed >= 500) {
					fps = Math.round((frames * 1000) / elapsed)
					frames = 0
					since = now
					paint()
				}
				raf = requestAnimationFrame(tick)
			}
			raf = requestAnimationFrame(tick)
			window.setInterval(paint, 1000)
			return () => {
				cancelAnimationFrame(raf)
				observer?.disconnect()
				box.remove()
			}
		}


		/**
		 * 顶部统计托盘：DSH 的统计条文案太长（「2 轮 8 步 · 211 tok/s」「1.7M tok · 缓存命中 99%」），
		 * 手机上一行放不下。这里读它的文本、精简成 `2 轮 · 211 tok/s · 缓存 99%` 放到右上角，
		 * 原条隐藏，既省高度又不挤。
		 */
		function installStatsTray() {
			if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return () => {}
			const tray = document.createElement('div')
			tray.className = 'dsh-stats-tray'
			tray.setAttribute('aria-hidden', 'true')
			const left = document.createElement('span')
			const right = document.createElement('span')
			tray.append(left, right)
			document.body.appendChild(tray)

			// 只在手机宽度下出现：桌面端这套样式本来就没注入，元素留着会变成一个裸 div 掉到页面底部
			const narrow = window.matchMedia?.('(max-width: 1023px)')
			let frame = 0
			let shown = ''
			const format = (text) => {
				const rounds = text.match(/(\d+)\s*轮/)
				const speed = text.match(/([\d.]+)\s*tok\/s/i)
				const cache = text.match(/(\d+(?:\.\d+)?)\s*%/)
				const parts = []
				if (rounds !== null) parts.push(`${rounds[1]} 轮`)
				if (speed !== null) parts.push(`${speed[1]} tok/s`)
				if (cache !== null) parts.push(`缓存 ${cache[1]}%`)
				return parts.join(' · ')
			}
			const sync = () => {
				frame = 0
				if (narrow !== undefined && !narrow.matches) {
					tray.style.display = 'none'
					shown = ''
					return
				}
				const dock = document.querySelector('.uV2eYG_dock')
				const raw = dock?.textContent ?? ''
				const branch = dock?.querySelector('[data-composer-stat="git-branch"]')?.textContent?.trim() ?? ''
				const stats = raw.trim() === '' ? '' : format(raw)
				const next = `${branch}|${stats}`
				if (next === shown) return
				shown = next
				left.textContent = branch
				right.textContent = stats
				tray.style.display = branch === '' && stats === '' ? 'none' : 'flex'
			}
			const schedule = () => {
				if (frame !== 0) return
				frame = requestAnimationFrame(sync)
			}
			const observer = new MutationObserver(schedule)
			observer.observe(document.body, { subtree: true, childList: true, characterData: true })
			const onViewport = () => schedule()
			narrow?.addEventListener?.('change', onViewport)
			sync()
			return () => {
				observer.disconnect()
				narrow?.removeEventListener?.('change', onViewport)
				if (frame !== 0) cancelAnimationFrame(frame)
				tray.remove()
			}
		}

		/**
		 * 外壳挂点自检：DSH 升级后这些 hash 类名可能全变，样式就整体失配。
		 * 启动后检查一遍 DOM，把结果报给宿主，面板里能直接看到「外壳适配」这盏灯。
		 */
		function installShellContractReport() {
			if (typeof document === 'undefined' || typeof window === 'undefined') return () => {}
			// 只查「任何页面都该存在」的挂点；侧栏里的 hHd-Xa_ 只在打开时才有，不参与判定
			const markers = ['wSkVaW_', 'uV2eYG_', 'pI_x6G_']
			let timer = window.setTimeout(async () => {
				try {
					const missing = markers.filter((marker) => document.querySelector(`[class*="${marker}"]`) === null)
					// 外壳三根柱子是靠语义钩子认出来的，还是退回了哈希类名 —— 这决定下次 DSH 升级会不会碎
					const resolved = markShell()
					const shell = resolved === null ? 'missing' : resolved.source
					if (missing.length > 0) {
						console.warn('[remote-panel] 外壳挂点缺失，手机样式可能失配：', missing.join(', '))
					}
					if (shell === 'class') {
						console.warn('[remote-panel] 外壳只能靠哈希类名认出来（data-shell-overlay 变了？），升级后可能失配')
					}
					await callApi('/shell', {
						method: 'POST',
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify({ missing, shell }),
					})
				} catch {
					/* 上报失败不影响使用 */
				}
			}, 1500)
			return () => window.clearTimeout(timer)
		}

		/**
		 * 本机反馈：任务跑完 / 等你确认时，如果页面在后台，闪一下标题 + 震动。
		 * 不依赖推送服务（v1 不做推送），也不需要服务端配合。
		 */
		function installAttention() {
			if (typeof window === 'undefined' || typeof document === 'undefined') return () => {}
			const KEY = 'dsh-remote-panel:attention'
			let timer = 0
			let flashTimer = 0
			let flashing = false
			let wasRunning = false
			let wasWaiting = false

			const enabled = () => {
				try {
					return localStorage.getItem(KEY) !== 'off'
				} catch {
					return true
				}
			}
			const stopFlash = () => {
				if (flashTimer !== 0) {
					clearInterval(flashTimer)
					flashTimer = 0
				}
				if (flashing) {
					flashing = false
					document.title = baseTitle
				}
			}
			let baseTitle = document.title
			const flash = (label) => {
				if (typeof document.hidden === 'boolean' && !document.hidden && document.hasFocus?.()) return
				baseTitle = document.title
				if (flashing) return
				flashing = true
				let on = false
				flashTimer = setInterval(() => {
					on = !on
					document.title = on ? label : baseTitle
				}, 900)
				notifyVibrate()
				window.setTimeout(stopFlash, 20000)
			}
			const notifyVibrate = () => {
				try {
					navigator.vibrate?.([120, 60, 120])
				} catch {
					/* 不支持震动就算了 */
				}
			}
			const isRunning = () => {
				const button = document.querySelector('.uV2eYG_primary')
				const aria = button?.getAttribute('aria-label') ?? ''
				// 空闲时是「发送消息」，生成中会换成「停止…」
				return aria !== '' && !aria.includes('发送')
			}
			const isWaiting = () => {
				const dialog = document.querySelector('[role="dialog"], [class*="_dialog"], [class*="_modal"]')
				if (dialog === null) return false
				return /允许|批准|拒绝|确认执行/.test(dialog.innerText ?? '')
			}
			const tick = () => {
				if (!enabled()) return
				const running = isRunning()
				const waiting = isWaiting()
				if (wasRunning && !running) flash('✔ 已完成 · DSH')
				if (!wasWaiting && waiting) flash('● 待确认 · DSH')
				wasRunning = running
				wasWaiting = waiting
			}
			const onVisible = () => {
				if (!document.hidden) {
					stopFlash()
					tick()
				}
			}
			timer = window.setInterval(tick, 1500)
			document.addEventListener('visibilitychange', onVisible)
			window.addEventListener('focus', stopFlash)
			return () => {
				if (timer !== 0) clearInterval(timer)
				document.removeEventListener('visibilitychange', onVisible)
				window.removeEventListener('focus', stopFlash)
				stopFlash()
			}
		}

		/**
		 * 会话内容增强（只在 ≤1023px 生效）：
		 *  - 代码块：注入 28px 的「复制」按钮；原生 11px 的复制按钮由 CSS 隐藏；
		 *  - 后台任务 chip：把「N 个后台任务」收成数字角标（data-rp-jobs + CSS ::after）；
		 *  - markdown 图片：原生已有点击看原图时让给原生，其余兜底新标签打开原图。
		 * 所有注入幂等（Observer 反复执行不叠加），返回 cleanup；HMR / 切换会话都安全。
		 */
		function installContentEnhancements() {
			if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return () => {}
			if (document.body === null) return () => {}
			// HMR：上一个模块实例如果还活着，先让它自清理，避免 Observer / 按钮叠加
			try {
				globalThis[CONTENT_CLEANUP_KEY]?.()
			} catch {
				/* 旧实例清理失败不阻塞新实例 */
			}
			const query = window.matchMedia?.('(max-width: 1023px)')
			const tag = `rp-${Math.random().toString(36).slice(2, 8)}`
			const copyTimers = new Set()
			const zoomImages = new Map()

			const isNarrow = () => (query === undefined ? window.innerWidth < 1024 : query.matches)

			const writeClipboard = (text) => {
				// 失败静默：不弹窗、不 alert
				try {
					if (navigator.clipboard?.writeText) {
						return navigator.clipboard.writeText(text).then(
							() => true,
							() => false,
						)
					}
				} catch {
					/* 非安全上下文 / 旧 WebView：静默 */
				}
				return Promise.resolve(false)
			}

			const makeCopyButton = (pre, block) => {
				const button = document.createElement('button')
				button.type = 'button'
				button.className = 'dsh-code-copy'
				button.dataset.rp = tag
				button.textContent = '复制'
				button.setAttribute('aria-label', '复制代码')
				button.addEventListener('click', (event) => {
					event.preventDefault()
					event.stopPropagation()
					// 流式输出时 React 可能换掉 pre：点击时重新解析当前节点
					const target = pre.isConnected ? pre : block?.querySelector('pre')
					if (!target) return
					// 用 textContent：折叠在「思考」里的代码块 innerText 会是空串
					const text = target.textContent ?? ''
					writeClipboard(text).then((ok) => {
						if (!ok) return
						button.dataset.done = 'true'
						button.textContent = '已复制'
						const timer = window.setTimeout(() => {
							copyTimers.delete(timer)
							button.dataset.done = 'false'
							button.textContent = '复制'
						}, 1200)
						copyTimers.add(timer)
					})
				})
				return button
			}

			const enhanceCodeBlocks = () => {
				for (const block of document.querySelectorAll('.md-code-block')) {
					const action = block.querySelector('[data-code-block-banner] [class*="_action_"]')
					const pre = block.querySelector('pre')
					if (!action || !pre) continue
					if (action.querySelector('.dsh-code-copy') !== null) continue
					action.appendChild(makeCopyButton(pre, block))
				}
				// 没有 banner 的 pre（少见）：浮在右上角，父节点临时 position: relative
				for (const pre of document.querySelectorAll('pre')) {
					if (pre.closest('.md-code-block') !== null) continue
					const parent = pre.parentElement
					if (!parent || parent.querySelector('.dsh-code-copy') !== null) continue
					if (getComputedStyle(parent).position === 'static') {
						parent.dataset.rpPosition = tag
						parent.dataset.rpPrevPosition = parent.style.position
						parent.style.position = 'relative'
					}
					const button = makeCopyButton(pre, null)
					button.classList.add('dsh-code-copy--float')
					parent.appendChild(button)
				}
			}

			const enhanceJobsBadge = () => {
				for (const trigger of document.querySelectorAll('[class*="QsffPG_trigger"]')) {
					const label = trigger.getAttribute('aria-label') ?? trigger.textContent ?? ''
					const value = label.match(/\d+/)?.[0]
					if (value !== undefined && trigger.dataset.rpJobs !== value) trigger.dataset.rpJobs = value
				}
			}

			const enhanceImages = () => {
				for (const img of document.querySelectorAll('._markdown_1ypvv_5 img')) {
					if (zoomImages.has(img)) continue
					// 原生 markdown 图片已经包在 button 里（点击打开内置大图查看），不重复接管
					if (img.closest('button, a') !== null) continue
					const handler = () => {
						const src = img.currentSrc || img.src
						if (!src || src.startsWith('data:')) return
						window.open(src, '_blank', 'noopener,noreferrer')
					}
					img.addEventListener('click', handler)
					img.dataset.rpZoom = tag
					zoomImages.set(img, handler)
				}
			}

			const removeOwned = () => {
				for (const button of document.querySelectorAll(`.dsh-code-copy[data-rp="${tag}"]`)) button.remove()
				for (const timer of copyTimers) clearTimeout(timer)
				copyTimers.clear()
				for (const [img, handler] of zoomImages) {
					img.removeEventListener('click', handler)
					delete img.dataset.rpZoom
				}
				zoomImages.clear()
				for (const parent of document.querySelectorAll(`[data-rp-position="${tag}"]`)) {
					parent.style.position = parent.dataset.rpPrevPosition ?? ''
					delete parent.dataset.rpPosition
					delete parent.dataset.rpPrevPosition
				}
				for (const trigger of document.querySelectorAll('[data-rp-jobs]')) delete trigger.dataset.rpJobs
			}

			let scheduled = 0
			const enhance = () => {
				if (!isNarrow()) {
					removeOwned()
					return
				}
				enhanceCodeBlocks()
				enhanceJobsBadge()
				enhanceImages()
			}
			const RELEVANT = 'pre, img, table, [class*="job"], [class*="Job"], [class*="attach"]'
			const isRelevant = (records) => {
				for (const record of records) {
					const target = record.target
					if (target instanceof Element && target.closest(RELEVANT) !== null) return true
					for (const node of record.addedNodes) {
						if (node.nodeType !== 1) continue
						if (node.matches?.(RELEVANT) === true || node.querySelector?.(RELEVANT) !== null) return true
					}
				}
				return false
			}
			const observer = new MutationObserver((records) => {
				if (scheduled !== 0) return
				// 流式回答每帧都往消息里塞文本节点，全量扫描会把帧吃光；只有出现
				// 代码块/图片/表格/任务卡/附件这类节点时才真的需要补按钮
				if (!isRelevant(records)) return
				scheduled = requestAnimationFrame(() => {
					scheduled = 0
					enhance()
				})
			})
			observer.observe(document.body, { subtree: true, childList: true })
			const onQueryChange = () => enhance()
			query?.addEventListener?.('change', onQueryChange)
			enhance()

			let disposed = false
			const cleanup = () => {
				if (disposed) return
				disposed = true
				if (scheduled !== 0) cancelAnimationFrame(scheduled)
				observer.disconnect()
				query?.removeEventListener?.('change', onQueryChange)
				removeOwned()
				if (globalThis[CONTENT_CLEANUP_KEY] === cleanup) delete globalThis[CONTENT_CLEANUP_KEY]
			}
			globalThis[CONTENT_CLEANUP_KEY] = cleanup
			return cleanup
		}

		/**
		 * 断线重连提示：DSH 前端没有「连接断开」的可见反馈，网络一抖页面只是不动了。
		 * 每 10s 打一次面板自己的 /status，连续两次失败才显示，恢复后自动消失。
		 */
		/**
		 * 点输入条上的「+」（添加文件或调用指令）时，别让输入框自动聚焦。
		 * 手机上一聚焦就弹键盘，把刚打开的面板顶走。
		 *
		 * 做法：在 pointerdown 阶段记一个短窗口（900ms），窗口内如果输入框收到 focus 就立刻 blur 回去；
		 * 点别的地方会立刻清掉窗口，不会影响正常输入。
		 */
		/** 输入条里的可编辑区：contenteditable / textarea / input，且落在输入条根节点里 */
		function isComposerEditor(el) {
			return (
				el instanceof Element &&
				el !== document.body &&
				(el.isContentEditable === true || el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') &&
				isComposerNode(el)
			)
		}

		/** 节点是否落在输入条（含底部 dock 那一圈）里 */
		function isComposerNode(el) {
			return el instanceof Element && (el.closest('.uV2eYG_root') !== null || el.closest('[class*="_composer"]') !== null)
		}

		/**
		 * 输入条焦点守卫：这几种操作都不该把键盘顶起来——
		 * 切工作区、切会话、打开面板、点「+」菜单。
		 *
		 * DSH 会在操作之后把焦点塞回输入条，且时机在我们之后，
		 * 所以除了撤焦点，还要开一个短暂的压制窗口（focusin 里再撤一次）。
		 * 只针对输入条里的可编辑区，不拦用户自己点输入条。
		 */
		function installComposerFocusGuard() {
			if (typeof document === 'undefined') return () => {}
			let suppressUntil = 0
			let labelObserver = null
			let observedLabel = null
			let lastLabel = ''
			let labelTimer = 0

			const release = () => {
				const el = document.activeElement
				if (isComposerEditor(el)) el.blur()
			}
			// 分几拍撤一次，并留一段压制窗口覆盖 DSH 自己的 focus
			const scheduleRelease = (windowMs = 700) => {
				suppressUntil = Math.max(suppressUntil, Date.now() + windowMs)
				for (const delay of [0, 80, 200, 400, 700]) window.setTimeout(release, delay)
			}

			const onFocusIn = (event) => {
				if (Date.now() > suppressUntil) return
				const el = event.target
				if (!isComposerEditor(el)) return
				const drop = () => {
					if (Date.now() <= suppressUntil && document.activeElement === el) el.blur?.()
				}
				drop()
				// 有的实现会在下一帧再 focus 一次，补一刀
				requestAnimationFrame(drop)
			}

			// 「+」按钮弹菜单，别顺手把焦点交给输入条
			const onPointerDown = (event) => {
				const target = event.target
				if (target instanceof Element && target.closest('.uV2eYG_add') !== null) suppressUntil = Date.now() + 900
			}

			// 抽屉里选会话 / 打开面板：切完别把键盘顶起来
			const onClick = (event) => {
				const target = event.target
				if (!(target instanceof Element)) return
				if (target.closest('[class*="_sessionRow"], [class*="_panelRow"]') !== null) scheduleRelease(900)
			}

			// 工作区选择器关闭 = 里面那个搜索框失焦
			const onFocusOut = (event) => {
				const target = event.target
				if (target instanceof Element && target.closest('[class*="wsc-"]') !== null) scheduleRelease()
			}

			const watchLabel = () => {
				const label = document.querySelector('[class*="_workspaceLabel"]')
				if (label === null || label === observedLabel) return
				labelObserver?.disconnect()
				observedLabel = label
				lastLabel = label.textContent ?? ''
				labelObserver = new MutationObserver(() => {
					const now = label.textContent ?? ''
					if (now === lastLabel) return
					lastLabel = now
					scheduleRelease()
				})
				labelObserver.observe(label, { childList: true, characterData: true, subtree: true })
			}

			document.addEventListener('pointerdown', onPointerDown, true)
			document.addEventListener('focusin', onFocusIn, true)
			document.addEventListener('click', onClick, true)
			document.addEventListener('focusout', onFocusOut, true)
			labelTimer = window.setInterval(watchLabel, 800)
			watchLabel()
			return () => {
				document.removeEventListener('pointerdown', onPointerDown, true)
				document.removeEventListener('focusin', onFocusIn, true)
				document.removeEventListener('click', onClick, true)
				document.removeEventListener('focusout', onFocusOut, true)
				window.clearInterval(labelTimer)
				labelObserver?.disconnect()
			}
		}

		/**
		 * 手机软键盘：Android Chrome 108 起键盘默认只缩「视觉视口」（visual viewport），
		 * 布局视口不动 —— 贴底的输入条（sticky / fixed 都一样）原地不动，被键盘盖住。
		 * 这里把键盘占掉的高度算出来写成 `--dsh-kb-inset`，SHELL_CSS 让滚动容器收在键盘上沿，
		 * sticky 的输入条座位跟着贴上去；键盘收起归零，占的高度自然释放。
		 *
		 * 捏合放大时 visualViewport.height 也会变小，那不是键盘：缩放 ≠ 1 时一律按 0 处理。
		 */
		function installKeyboardDock() {
			if (typeof window === 'undefined' || typeof document === 'undefined') return () => {}
			const root = document.documentElement
			const viewport = window.visualViewport ?? null
			const raf = (fn) => (typeof window.requestAnimationFrame === 'function' ? window.requestAnimationFrame(fn) : (fn(), 0))
			let frame = 0
			let applied = -1
			let timers = []

			const write = () => {
				frame = 0
				const layout = window.innerHeight || 0
				const view = viewport === null ? layout : viewport.height + (viewport.offsetTop || 0)
				const zoomed = (viewport?.scale ?? 1) > 1.01
				const inset = zoomed ? 0 : Math.max(0, Math.round(layout - view))
				if (inset === applied) return
				applied = inset
				root.style.setProperty('--dsh-kb-inset', `${inset}px`)
				// 收起内边距里的 safe-bottom 只在键盘真的盖住手势条之后（> 40px）才做：
				// 键盘动画的第一帧 inset 只有几像素，那时撤掉会白跳 30px
				if (inset > 40) root.setAttribute('data-dsh-keyboard', '')
				else root.removeAttribute('data-dsh-keyboard')
			}
			const schedule = () => {
				if (frame !== 0) return
				frame = raf(write)
			}
			// iOS 的键盘动画不在 resize 里逐帧报，落定后再补量一次
			const settle = () => {
				for (const timer of timers) window.clearTimeout(timer)
				timers = [120, 320].map((delay) => window.setTimeout(write, delay))
			}

			viewport?.addEventListener?.('resize', schedule)
			viewport?.addEventListener?.('scroll', schedule)
			window.addEventListener('resize', schedule)
			window.addEventListener('orientationchange', settle)
			document.addEventListener('focusin', settle, true)
			document.addEventListener('focusout', settle, true)
			schedule()
			return () => {
				if (frame !== 0) window.cancelAnimationFrame?.(frame)
				for (const timer of timers) window.clearTimeout(timer)
				viewport?.removeEventListener?.('resize', schedule)
				viewport?.removeEventListener?.('scroll', schedule)
				window.removeEventListener('resize', schedule)
				window.removeEventListener('orientationchange', settle)
				document.removeEventListener('focusin', settle, true)
				document.removeEventListener('focusout', settle, true)
				root.style.setProperty('--dsh-kb-inset', '0px')
				root.removeAttribute('data-dsh-keyboard')
			}
		}

		/**
		 * 手指落在输入条以外就该收键盘：手机浏览器不会因为「开始滚页面」自己撤焦点，
		 * 键盘会一直占掉半屏，输入条也回不到单行高度。这里在触摸起手时补一刀 blur
		 * （用户主动点输入条不受影响；输入条自己的弹层 —— 指令、@ 文件、模型选择 —— 不算外面）。
		 * 只接管触摸设备，桌面滚轮/点选保持原生。
		 */
		function installComposerDismiss() {
			if (typeof document === 'undefined' || typeof window === 'undefined') return () => {}
			const coarse = window.matchMedia?.('(pointer: coarse)')
			if (coarse !== undefined && coarse !== null && coarse.matches === false) return () => {}

			// 输入条自己的浮层：点它们不算「点外面」，否则选一半就被收键盘
			const LAYER =
				'[role="dialog"], [role="menu"], [role="listbox"], [role="tooltip"], [class*="_popover"], [class*="_dropdown"], [class*="_selectMenu"], [class*="_picker"]'

			const dismiss = () => {
				const active = document.activeElement
				if (isComposerEditor(active)) active.blur?.()
			}

			const onPointerDown = (event) => {
				const target = event.target
				if (!(target instanceof Element)) return
				if (isComposerNode(target) || target.closest(LAYER) !== null) return
				dismiss()
			}

			document.addEventListener('pointerdown', onPointerDown, true)
			return () => document.removeEventListener('pointerdown', onPointerDown, true)
		}

		function installConnectivity() {
			if (typeof window === 'undefined' || typeof fetch !== 'function') return () => {}
			let failures = 0
			let timer = 0
			let banner = null
			const show = () => {
				if (banner !== null) return
				banner = document.createElement('div')
				banner.className = 'dsh-mobile-offline'
				banner.setAttribute('role', 'status')
				banner.textContent = '连接已断开，正在重连…'
				document.body.appendChild(banner)
			}
			const hide = () => {
				banner?.remove()
				banner = null
			}
			const probe = async () => {
				try {
					await callApi('/status')
					failures = 0
					hide()
				} catch {
					failures += 1
					if (failures >= 2) show()
				}
			}
			const onOnline = () => {
				failures = 0
				probe()
			}
			timer = window.setInterval(() => {
				if (!document.hidden) probe()
			}, 10000)
			window.addEventListener('online', onOnline)
			window.addEventListener('offline', show)
			probe()
			return () => {
				if (timer !== 0) clearInterval(timer)
				window.removeEventListener('online', onOnline)
				window.removeEventListener('offline', show)
				hide()
			}
		}

		function installShellCss(layout) {
			if (typeof document === 'undefined') return () => {}
			const style = document.createElement('style')
			style.id = 'dsh-remote-panel-shell'
			style.textContent = SHELL_CSS
			document.head.appendChild(style)

			// 窄屏判定：抽屉/面板/遮罩都只在 ≤1023px 生效，桌面不参与
			const narrow = window.matchMedia('(max-width: 1023px)')

			let frame = 0
			const sync = () => {
				cancelAnimationFrame(frame)
				frame = requestAnimationFrame(() => {
					const shell = markShell()
					const open = shell !== null && shell.expanded()
					// 搜索展开时侧栏整屏（原生只是把输入框在 280px 里拉长）
					document.documentElement.classList.toggle(
						'dsh-search-open',
						open && document.querySelector('[class*="_searchExpanded"]') !== null,
					)
				})
			}
			const observer = new MutationObserver(sync)
			observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] })
			sync()

			const canary = setTimeout(() => {
				if (markShell() === null) {
					console.warn('[remote-panel] 未匹配到布局容器，移动端外壳样式可能失配（DSH 可能已升级）')
				}
			}, 4000)

			// 面板页（工作区 Git 等）整屏接管，会话顶栏连同 ☰ 一起消失，手机上「进得去出不来」。
			// 面板态直接订阅 layout 的 panelInfo：activePanelId ≠ null 就是面板页，
			// 比在 DOM 里找「主区域不是会话」稳，也不用加重 Observer。
			const panelbar = document.createElement('div')
			panelbar.className = 'dsh-mobile-panelbar'
			const panelback = document.createElement('button')
			panelback.type = 'button'
			panelback.className = 'dsh-mobile-panelback'
			panelback.setAttribute('aria-label', '返回对话')
			panelback.title = '返回对话'
			panelback.innerHTML =
				'<svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">' +
				'<path d="M9.75 3.5 5.25 8l4.5 4.5" stroke="currentColor" stroke-width="1.8" ' +
				'stroke-linecap="round" stroke-linejoin="round"/></svg>'
			panelback.addEventListener('click', () => {
				try {
					// null = 回到 Conversation（面板 id 由宿主注册，不能写死）
					layout?.selectPanel?.(null)
				} catch (error) {
					console.warn('[remote-panel] back to conversation failed', error)
				}
			})
			panelbar.appendChild(panelback)
			document.body.appendChild(panelbar)

			const syncPanel = () => {
				let active = null
				try {
					active = layout?.panelInfo?.getSnapshot?.()?.activePanelId ?? null
				} catch {
					active = null
				}
				document.documentElement.classList.toggle('dsh-panel-open', active !== null && narrow.matches)
			}
			const unsubscribePanel =
				typeof layout?.panelInfo?.subscribe === 'function' ? layout.panelInfo.subscribe(syncPanel) : () => {}
			narrow.addEventListener?.('change', syncPanel)
			syncPanel()

			// 窄屏：选中会话 / 面板后翻回对话页（桌面保持原样，不参与）
			const backToChat = () => {
				if (!narrow.matches) return
				if (pagerApi === null) return
				pagerApi.go(PAGER_CHAT)
			}

			const onDocumentClick = (event) => {
				if (!narrow.matches) return
				if (pagerApi === null || pagerApi.page() !== PAGER_SESSIONS) return
				const target = event.target
				if (!(target instanceof Element)) return
				if (!target.closest('[data-rp-page="sessions"], [class*="_sidebarCol"]')) return
				// 行尾的「⋯」是会话菜单的锚点：点它不算「选中会话」，
				// 否则页会先翻走、行一卸载菜单就没了
				if (target.closest('[class*="_rowActions"]')) return
				if (!target.closest('[class*="_sessionRow"], [class*="_panelRow"]')) return
				// 让宿主先把选中态处理完再翻页，否则新会话还没挂上就看不见了
				setTimeout(backToChat, 0)
			}
			document.addEventListener('click', onDocumentClick, true)

			// 翻到别的页时 ESC 回对话（宿主窄屏没有这个键位）
			const onKeyDown = (event) => {
				if (event.key !== 'Escape' || !narrow.matches) return
				if (pagerApi === null || pagerApi.page() === PAGER_CHAT) return
				event.preventDefault()
				backToChat()
			}
			document.addEventListener('keydown', onKeyDown)

			return () => {
				clearTimeout(canary)
				cancelAnimationFrame(frame)
				observer.disconnect()
				document.removeEventListener('click', onDocumentClick, true)
				document.removeEventListener('keydown', onKeyDown)
				try {
					unsubscribePanel()
				} catch {
					/* 卸载时订阅已失效也无所谓 */
				}
				narrow.removeEventListener?.('change', syncPanel)
				panelbar.remove()
				style.remove()
				document.documentElement.classList.remove('dsh-search-open', 'dsh-panel-open')
			}
		}

		function NewChatButton(props) {
			// 宿主没有顶栏「新建」；这里复用 uiWorkspace 的落点规则：
			// 当前会话所在工作区 → 最近工作区；都没有就回到空态（由工作区 chip 接手）。
			const run = () => {
				try {
					const ui = props?.uiWorkspace
					if (ui && typeof ui.startSession === 'function') {
						ui.startSession()
						return
					}
					props?.layout?.selectPanel?.('chat')
				} catch (error) {
					console.warn('[remote-panel] new chat failed', error)
				}
			}
			return jsx('button', {
				type: 'button',
				'aria-label': '新建对话',
				title: '新建对话',
				className: 'dsh-mobile-newchat',
				onClick: run,
				style: {
					display: 'none',
					position: 'fixed',
					top: 6,
					right: 10,
					zIndex: 70,
					alignItems: 'center',
					justifyContent: 'center',
					width: 40,
					height: 40,
					padding: 0,
					border: 0,
					borderRadius: 12,
					background: 'transparent',
					color: 'inherit',
					cursor: 'pointer',
					font: 'inherit',
				},
				children: jsx('svg', {
					width: 18,
					height: 18,
					viewBox: '0 0 16 16',
					fill: 'none',
					'aria-hidden': 'true',
					children: [
						jsx('path', {
							d: 'M2.37091 11.2501C1.58745 9.89288 1.32067 8.29835 1.61969 6.76006C1.91872 5.22177 2.76342 3.8433 3.99826 2.87846C5.2331 1.91362 6.77494 1.42737 8.33988 1.50925C9.90482 1.59113 11.3875 2.23562 12.5149 3.32406C13.6425 4.41269 14.3387 5.87206 14.4754 7.4334C14.612 8.99474 14.18 10.5529 13.2587 11.8209C12.3375 13.0888 10.9891 13.9813 9.46194 14.3337C8.18691 14.628 6.85895 14.5294 5.64989 14.0605C5.1712 13.8748 4.76962 13.4932 4.26534 13.3967C3.67413 13.2835 2.95257 13.5598 2.03794 14.3337',
							stroke: 'currentColor',
						}),
						jsx('path', { d: 'M8 5V11', stroke: 'currentColor' }),
						jsx('path', { d: 'M5 8H11', stroke: 'currentColor' }),
					],
				}),
			})
		}

		function HeaderHamburger(props) {
			return jsx('button', {
				type: 'button',
				'aria-label': '打开侧栏',
				className: 'dsh-mobile-hamburger',
				onClick: () => {
					try {
						// 手机：☰ 是「右滑到会话列表那一页」，不再从左边弹抽屉
						if (window.matchMedia?.('(max-width: 1023px)').matches === true && pagerApi !== null) {
							pagerApi.go(PAGER_SESSIONS)
							return
						}
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
					width: 40,
					height: 40,
					padding: '0 8px',
				},
				children: jsx('svg', {
					width: 18,
					height: 12,
					viewBox: '0 0 18 12',
					fill: 'none',
					'aria-hidden': 'true',
					children: [
						jsx('path', { d: 'M1 1h16', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' }),
						jsx('path', { d: 'M1 9h11', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' }),
					],
				}),
			})
		}

		/**
		 * 第三屏的落地页：没打开任何面板时的「面板」目录。
		 *
		 * 第三屏本体是宿主的右栏（分页器把 `[data-rightbar-col]` 整列当第三页平移），
		 * 面板没开时那一屏是空的，这一层就顶在同样的位置：把宿主注册的面板入口
		 * （`sidebarRightTabs.guide()`，和桌面右栏引导页同一份数据）列出来，
		 * 点一个就把那个面板开进第三屏。
		 *
		 * 面板一开，这一层由 `html.dsh-panels-open` 让位，屏幕归真面板。
		 * 右栏服务没挂上时不硬凑，直接把原因写在页面上。
		 */
		function PanelsPage(props) {
			const readTabs = () => {
				if (typeof props.getTabs === 'function') return props.getTabs()
				return props.tabs ?? null
			}
			const readRight = () => {
				if (typeof props.getRight === 'function') return props.getRight()
				return props.right ?? null
			}
			const [entries, setEntries] = useState([])
			const [notice, setNotice] = useState('')

			useEffect(() => {
				const tabs = readTabs()
				if (tabs === null || typeof tabs.guide !== 'function') {
					setNotice('这一版的宿主还没提供右栏面板服务')
					return undefined
				}
				const sync = () => {
					let list = []
					try {
						list = tabs.guide() ?? []
					} catch (error) {
						console.warn('[remote-panel] read sidebar guide failed', error)
						list = []
					}
					setEntries(
						list.map((entry) => ({
							id: entry.id,
							kind: entry.kind,
							icon: entry.icon ?? null,
							title: readText(entry.title),
							description: readText(entry.description),
						})),
					)
				}
				sync()
				return typeof tabs.subscribe === 'function' ? tabs.subscribe(sync) : undefined
			}, [])

			const open = (kind) => {
				const right = readRight()
				if (right === null || typeof right.openTab !== 'function') {
					setNotice('这一版的宿主还没提供右栏面板服务')
					return
				}
				try {
					right.openTab(kind)
					setNotice('')
				} catch (error) {
					console.warn('[remote-panel] open sidebar tab failed', error)
					setNotice('这个面板现在打不开：' + String(error?.message ?? error))
				}
			}

			return jsxs('div', {
				className: 'dsh-panels',
				children: [
					jsx('header', {
						className: 'dsh-panels-head',
						children: jsxs('div', {
							children: [
								jsx('h1', { children: '面板' }),
								jsx('p', { children: '桌面右栏的同一批面板，在手机上就是这一屏' }),
							],
						}),
					}),
					entries.length === 0
						? jsx('p', { className: 'dsh-panels-empty', children: notice === '' ? '宿主还没注册任何面板' : notice })
						: jsx('div', {
							className: 'dsh-panels-list',
							children: entries.map((entry) =>
								jsxs(
									'button',
									{
										type: 'button',
										className: 'dsh-panels-row',
										onClick: () => open(entry.kind),
										children: [
											jsx('span', {
												className: 'dsh-panels-icon',
												children: entry.icon === null ? null : jsx(entry.icon, { size: 20 }),
											}),
											jsxs('span', {
												className: 'dsh-panels-main',
												children: [
													jsx('b', { children: entry.title === '' ? '面板' : entry.title }),
													entry.description === '' ? null : jsx('small', { children: entry.description }),
												],
											}),
											jsx('span', {
												className: 'dsh-panels-chevron',
												children: jsx('svg', {
													width: 8,
													height: 13,
													viewBox: '0 0 8 13',
													fill: 'none',
													'aria-hidden': 'true',
													children: jsx('path', {
														d: 'M1.5 1.5 6 6.5 1.5 11.5',
														stroke: 'currentColor',
														strokeWidth: 2,
														strokeLinecap: 'round',
														strokeLinejoin: 'round',
													}),
												}),
											}),
										],
									},
								),
							),
						}),
					notice !== '' && entries.length > 0 ? jsx('p', { className: 'dsh-panels-empty', children: notice }) : null,
					jsx('p', { className: 'dsh-panels-foot', children: '面板与桌面右栏共用同一份状态，关掉只是滑回对话' }),
				],
			})
		}

		/** 语言函数或纯字符串都认：宿主的面板标题是 `() => t('…')`。 */
		function readText(value) {
			if (typeof value === 'function') {
				try {
					const text = value()
					return typeof text === 'string' ? text : ''
				} catch {
					return ''
				}
			}
			return typeof value === 'string' ? value : ''
		}

		/**
		 * 第三屏的外壳：整屏一层，和宿主的三列布局解耦。
		 *
		 * 为什么自己拿一层而不是用宿主的面板槽位：`main` 槽位的面板会顶掉中间列的正文，
		 * 那一屏就只剩「当前页」，翻页时另一页根本不存在，只能黑着滑进来。
		 * 第三屏要的是「面板和对话同时存在、手指走多少屏走多少」，所以它是一层轨道。
		 *
		 * 挂载时机：翻到这一页之前由 pager 派事件；空闲时也预挂一次，省得第一次翻页空白。
		 */
		function PagerPanels(props) {
			const [mounted, setMounted] = useState(false)
			useEffect(() => {
				// 桌面没有这一页
				const query = window.matchMedia?.('(max-width: 1023px)')
				const need = () => {
					if (query !== undefined && query !== null && !query.matches) return
					setMounted(true)
				}
				window.addEventListener('dsh-pager:panels', need)
				const hasIdle = typeof window.requestIdleCallback === 'function'
				const idle = hasIdle ? window.requestIdleCallback(need, { timeout: 3000 }) : window.setTimeout(need, 2000)
				return () => {
					window.removeEventListener('dsh-pager:panels', need)
					if (hasIdle) window.cancelIdleCallback(idle)
					else window.clearTimeout(idle)
				}
			}, [])
			return jsx('div', {
				className: 'dsh-page-panels',
				children: mounted
					? jsx(PanelsPage, { getRight: props.getRight, getTabs: props.getTabs })
					: null,
			})
		}

		function apply(ctx) {
			const cleanup = installShellCss(ctx.layout)
			installAssetCache()
			const cleanupClear = installWorkspaceClear(ctx)
			const cleanupBack = installBackGesture(ctx.layout)
			const cleanupPager = installPager(ctx.layout)
			const cleanupAttention = installAttention()
			const cleanupContent = installContentEnhancements()
			const cleanupNet = installConnectivity()
			const cleanupFocus = installComposerFocusGuard()
			const cleanupDock = installKeyboardDock()
			const cleanupDismiss = installComposerDismiss()
			const cleanupFps = installFpsMeter()
			const cleanupContract = installShellContractReport()
			const cleanupTray = installStatsTray()
			if (typeof ctx.effect === 'function') ctx.effect(() => cleanupClear, 'remote-panel: workspace clear')
			if (typeof ctx.effect === 'function') ctx.effect(() => cleanupBack, 'remote-panel: back gesture')
			if (typeof ctx.effect === 'function') ctx.effect(() => cleanupPager, 'remote-panel: pager')
			if (typeof ctx.effect === 'function') ctx.effect(() => cleanupAttention, 'remote-panel: attention')
			if (typeof ctx.effect === 'function') ctx.effect(() => cleanupContent, 'remote-panel: content enhancements')
			if (typeof ctx.effect === 'function') ctx.effect(() => cleanupNet, 'remote-panel: connectivity')
			if (typeof ctx.effect === 'function') ctx.effect(() => cleanupFocus, 'remote-panel: composer focus guard')
			if (typeof ctx.effect === 'function') ctx.effect(() => cleanupDock, 'remote-panel: keyboard dock')
			if (typeof ctx.effect === 'function') ctx.effect(() => cleanupDismiss, 'remote-panel: composer dismiss')
			if (typeof ctx.effect === 'function') ctx.effect(() => cleanupFps, 'remote-panel: fps meter')
			if (typeof ctx.effect === 'function') ctx.effect(() => cleanupContract, 'remote-panel: shell contract report')
			if (typeof ctx.effect === 'function') ctx.effect(() => cleanupTray, 'remote-panel: stats tray')
			if (typeof ctx.effect === 'function') ctx.effect(() => cleanup, 'remote-panel: mobile shell css')

			ctx.slots.inject('shell.overlay', () =>
				ctx.slots.register(
					{
						name: 'shell.overlay',
						id: 'remote-panel.new-chat',
						order: 100,
						// uiWorkspace 只在 web 端由 dsh-client-ui-workspace 提供；拿不到时退回切面板
						inject: () => ({ layout: ctx.layout, uiWorkspace: ctx.get('uiWorkspace') }),
					},
					NewChatButton,
				),
			)

			ctx.slots.inject('conversation.header.leading', () =>
				ctx.slots.register(
					{ name: 'conversation.header.leading', id: 'remote-panel.hamburger', inject: () => ({ layout: ctx.layout }) },
					HeaderHamburger,
				),
			)

			ctx.slots.inject('settings.section', () =>
				ctx.slots.register({ name: 'settings.section', id: 'remote-panel', order: 40, label: () => '远程访问' }, Panel),
			)

			// 第三屏的落地页：面板目录。右栏服务在 apply 时可能还没挂上，
			// 所以只传「怎么取」，由页面在自己渲染时去拿（桌面不挂，窄屏才挂）。
			ctx.slots.inject('shell.overlay', () =>
				ctx.slots.register(
					{
						name: 'shell.overlay',
						id: 'remote-panel.panels',
						order: 90,
						inject: () => ({
							getRight: () => (typeof ctx.get === 'function' ? (ctx.get('sidebarRight') ?? null) : null),
							getTabs: () => (typeof ctx.get === 'function' ? (ctx.get('sidebarRightTabs') ?? null) : null),
						}),
					},
					PagerPanels,
				),
			)
		}

		// layout 必须在 inject 里声明，否则访问 ctx.layout 会抛
		return {
			inject: ['slots', 'layout', 'sessions', 'uiSession'],
			apply,
			components: { Panel, DeployCard, StatusCard, PairCard, StaleBanner, AppCard, PanelsPage, PagerPanels },
			// 翻页的纯函数单独露出来：橡皮筋和落点是手感的核心，必须能脱离浏览器验证
			pager: {
				rubber: pagerRubber,
				unrubber: pagerUnrubber,
				clamp: pagerClamp,
				unclamp: pagerUnclamp,
				settle: pagerSettle,
				pages: PAGER_PAGES,
			},
			// 三屏的「哪个子元素是会话页/对话页」也单独露出来：宿主加一个装饰性子元素
			// 就能让整套翻页认错节点，这条必须有脱离浏览器的回归测试
			shell: {
				extra: SHELL_EXTRA,
				pick: pickShellPages,
			},
		}
	},
})
