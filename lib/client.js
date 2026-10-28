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

		// ---------------------------------------------------------------- 第一幕

		const PRIMARY_FIELDS = [
			['relay', '中继地址', 'host:port，或 tcp://…;ws://… 多条'],
			['networkName', '网络名', '所有设备必须一致'],
			['networkSecret', '网络密钥', '16 位以上，字母数字-_'],
		]

		const ADVANCED_FIELDS = [
			['virtualIp', '本机虚拟 IP', '网段内且未被占用'],
			['port', '反代端口', '默认 8710'],
			['accessKey', '访问口令', '首次配对用'],
			['upstreamPort', 'DSH 端口', '默认 3080'],
			['lanCidr', '局域网白名单', '家里 Wi-Fi 应急'],
			['user', '运行用户', 'Caddy 以此身份运行'],
			['home', '用户目录', '用户级 systemd 位置'],
			['devName', 'TUN 网卡名', '默认 dshmesh0，避免与 tun0 冲突'],
			['etVersion', 'EasyTier 版本', '固定便于复现'],
		]


		function DoctorLine({ virtualIp, port, devName }) {
			const [data, setData] = useState(null)
			const [busy, setBusy] = useState(false)
			const [error, setError] = useState(null)

			const run = async () => {
				setBusy(true)
				setError(null)
				try {
					const query = new URLSearchParams()
					if (virtualIp) query.set('ip', virtualIp)
					if (port) query.set('port', String(port))
					if (devName) query.set('dev', devName)
					setData(await callApi(`/doctor?${query.toString()}`))
				} catch (failure) {
					setError(failure.message)
				} finally {
					setBusy(false)
				}
			}

			const label =
				data === null ? null : data.summary === 'ready' ? '环境就绪' : data.summary === 'missing' ? '尚未安装' : '部分就绪'

			return jsxs('div', {
				style: { display: 'flex', flexDirection: 'column', gap: 6 },
				children: [
					jsxs('div', {
						style: styles.row,
						children: [
							jsx('button', {
								type: 'button',
								style: styles.button,
								onClick: run,
								disabled: busy,
								children: busy ? '检测中…' : '检测环境',
							}),
							label === null ? null : jsx('span', { style: styles.hint, children: label }),
							error === null ? null : jsx('span', { style: styles.error, children: error }),
						],
					}),
					data === null
						? null
						: jsx('div', {
								style: { display: 'flex', flexDirection: 'column', gap: 2 },
								children: data.checks.map((check) =>
									jsxs(
										'div',
										{
											style: styles.row,
											children: [
												jsx(Dot, { ok: check.state === 'ok' }),
												jsx('span', {
													style: { ...styles.hint, minWidth: 78, opacity: 0.75 },
													children: check.id,
												}),
												jsx('span', { style: styles.hint, children: check.detail }),
											],
										},
										check.id,
									),
								),
							}),
				],
			})
		}

		function DeployWizard({ onDeployed }) {
			const [form, setForm] = useState(null)
			const [result, setResult] = useState(null)
			const [code, setCode] = useState('')
			const [error, setError] = useState(null)
			const [warning, setWarning] = useState(null)
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
				setWarning(null)
				try {
					try {
						const check = await callApi(`/ipcheck?ip=${encodeURIComponent(form.virtualIp)}`)
						if (check.reachable) setWarning(`${check.ip} 已有主机应答，部署时可能冲突`)
					} catch {
						/* 预检失败不影响主流程 */
					}
					const payload = { ...form }
					for (const key of ['port', 'upstreamPort']) payload[key] = Number(payload[key])
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
					onDeployed()
				} catch (failure) {
					setError(failure.message)
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
							'请在当前机器上以 root 执行下面的部署脚本（幂等，可重复执行）。',
							'它只做两件事：装一个用户级 Caddy 反代，装一个 system 级 EasyTier 节点。',
							'执行完请把最后一行 `DSH_REMOTE_OK ...` 原样回贴，不要改动其中任何一个字符。',
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
							jsx('strong', { style: styles.title, children: '① 生成部署脚本' }),
							jsx('span', { style: styles.muted, children: '填三项即可' }),
						],
					}),
					jsx(DoctorLine, { virtualIp: form.virtualIp, port: form.port, devName: form.devName }),
					jsxs('div', {
						style: styles.grid,
						children: PRIMARY_FIELDS.map(([key, label, hint]) =>
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
								children: busy ? '生成中…' : result === null ? '生成脚本' : '重新生成',
							}),
							jsx('button', {
								type: 'button',
								style: styles.button,
								onClick: () =>
									setForm((current) => ({
										...current,
										accessKey: randomToken(24),
										networkSecret: randomToken(32),
									})),
								children: '重掷密钥',
							}),
						],
					}),
					warning === null ? null : jsx('p', { style: styles.hint, children: `⚠ ${warning}` }),
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
										children: `部署后访问 ${result.summary.urls.mesh}；脚本最后一行就是回填码。`,
									}),
									jsx('details', {
										children: [
											jsx('summary', { style: styles.hint, children: '查看脚本内容' }),
											jsx('pre', { style: { ...styles.code, marginTop: 8 }, children: result.install }),
										],
									}),
									jsxs('div', {
										style: { display: 'flex', flexDirection: 'column', gap: 6 },
										children: [
											jsx('strong', { children: '③ 回填' }),
											jsx('textarea', {
												style: {
													...styles.input,
													minHeight: 54,
													fontFamily: 'ui-monospace, monospace',
												},
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
									}),
								],
							}),
				],
			})
		}

		// ---------------------------------------------------------------- 第二幕

		function StatusCard({ state, version, onRedeploy }) {
			const [probe, setProbe] = useState(null)
			const [rejects, setRejects] = useState([])
			const [busy, setBusy] = useState(false)

			const refresh = useCallback(async () => {
				setBusy(true)
				try {
					setProbe((await callApi('/probe')).probe)
					setRejects((await callApi('/rejects')).entries)
				} catch {
					/* 状态探测失败时保留上一帧 */
				} finally {
					setBusy(false)
				}
			}, [])

			useEffect(() => {
				refresh()
			}, [refresh])

			const lights = [
				['EasyTier', probe?.easytier],
				['Caddy', probe?.caddy],
				['healthz', probe?.healthz],
				['上游 DSH', probe?.upstream],
			]

			return jsxs(Card, {
				children: [
					jsxs('div', {
						style: styles.head,
						children: [
							jsx(Dot, { ok: probe?.ok }),
							jsx('strong', { style: styles.title, children: '运行状态' }),
							jsx('span', { style: styles.muted, children: `http://${state.ip}:${state.port}/` }),
							jsx('button', {
								type: 'button',
								style: styles.button,
								onClick: refresh,
								disabled: busy,
								children: busy ? '检测中…' : '检测',
							}),
						],
					}),
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
					rejects.length === 0
						? null
						: jsx('details', {
								children: [
									jsx('summary', { style: styles.hint, children: `最近被拒 ${rejects.length} 条` }),
									jsx('div', {
										style: { display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4 },
										children: rejects.map((row, index) =>
											jsx(
												'span',
												{ style: styles.hint, children: `${row.status} ${row.ip || '-'} ${row.uri || ''}` },
												index,
											),
										),
									}),
								],
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
										children: '重新生成部署脚本',
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
								setNote('已复制（不含口令与密钥）')
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

		function PairCard() {
			const [state, setState] = useState({ kind: 'loading' })

			useEffect(() => {
				callApi('/pair')
					.then((data) => setState({ kind: 'ok', data }))
					.catch((error) => setState({ kind: 'error', message: error.message }))
			}, [])

			const data = state.kind === 'ok' ? state.data : null
			return jsxs(Card, {
				children: [
					jsxs('div', {
						style: styles.head,
						children: [
							jsx(Dot, { ok: data?.found === true }),
							jsx('strong', { style: styles.title, children: '手机配对' }),
							jsx('span', { style: styles.muted, children: state.kind === 'loading' ? '读取中…' : data?.found ? '扫码即可' : '未找到令牌' }),
						],
					}),
					state.kind === 'error' && jsx('p', { style: styles.muted, children: state.message }),
					data?.found === false &&
						jsx('p', { style: styles.muted, children: 'journal 里没有当前端口的令牌，重启 DSH 后再试。' }),
					data?.found === true &&
						jsxs('div', {
							style: { display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' },
							children: [
								jsx('img', {
									alt: '配对二维码',
									width: 180,
									height: 180,
									src: `data:image/svg+xml;utf8,${encodeURIComponent(data.qr)}`,
								}),
								jsxs('div', {
									style: { display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 210 },
									children: [
										jsx('span', { style: styles.hint, children: '① 门禁（一年）' }),
										jsx('code', {
											style: { ...styles.code, maxHeight: 56 },
											children: data.urls.gate ?? '（回填码未含口令）',
										}),
										jsx('span', { style: styles.hint, children: '② 令牌（30 天 Cookie）' }),
										jsx('code', { style: { ...styles.code, maxHeight: 56 }, children: data.urls.token }),
										jsxs('div', {
											style: styles.row,
											children: [
												jsx(CopyButton, { text: data.urls.token, label: '复制令牌链接' }),
												data.urls.gate
													? jsx(CopyButton, { text: data.urls.gate, label: '复制门禁链接' })
													: null,
											],
										}),
									],
								}),
							],
						}),
				],
			})
		}

		function AccessCard() {
			const [entries, setEntries] = useState(null)
			const [value, setValue] = useState('')
			const [error, setError] = useState(null)
			const [audit, setAudit] = useState([])
			const [busy, setBusy] = useState(false)

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

			const mutate = async (action, entry) => {
				setBusy(true)
				setError(null)
				try {
					const result = await callApi('/allowlist', {
						method: 'POST',
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify({ action, value: entry }),
					})
					setEntries(result.entries)
					setAudit((await callApi('/audit')).entries)
					if (action === 'add') setValue('')
					if (result.reload?.ok === false) setError(`已写入，但 reload 失败：${result.reload.reason}`)
				} catch (failure) {
					setError(failure.message)
				} finally {
					setBusy(false)
				}
			}

			return jsxs(Card, {
				children: [
					jsxs('details', {
						children: [
							jsxs('summary', {
								style: styles.head,
								children: [
									jsx('strong', { style: styles.title, children: '来源白名单' }),
									jsx('span', {
										style: styles.muted,
										children: entries === null ? '' : `${entries.length} 条 · 不在名单内一律 403`,
									}),
								],
							}),
							jsxs('div', {
								style: { display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 },
								children: [
									error === null ? null : jsx('p', { style: styles.error, children: error }),
									...(entries ?? []).map((entry) =>
										jsxs(
											'div',
											{
												style: { ...styles.row, justifyContent: 'space-between' },
												children: [
													jsx('code', { style: styles.hint, children: entry }),
													jsx('button', {
														type: 'button',
														style: styles.button,
														disabled: busy,
														onClick: () => mutate('remove', entry),
														children: '移除',
													}),
												],
											},
											entry,
										),
									),
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
													jsx('summary', { style: styles.hint, children: `变更历史 ${audit.length} 条` }),
													jsx('div', {
														style: { display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4 },
														children: audit.map((item, index) =>
															jsx(
																'span',
																{
																	style: styles.hint,
																	children: `${item.at.slice(5, 16).replace('T', ' ')} ${item.action} ${item.entry}`,
																},
																index,
															),
														),
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
						jsx(DeployWizard, {
							onDeployed: () => {
								setShowWizard(false)
								load()
							},
						}),
						state === null
							? null
							: jsx(StatusCard, { state, version, onRedeploy: () => setShowWizard(false) }),
						state === null ? null : jsx(PairCard, {}),
					],
				})
			}

			return jsx('div', {
				style: styles.wrap,
				children: [
					jsx(StaleBanner, {}),
					jsx(StatusCard, { state, version, onRedeploy: () => setShowWizard(true) }),
					jsx(PairCard, {}),
					jsx(AccessCard, {}),
				],
			})
		}

		// ---------------------------------------------------------------- 外壳

		const SHELL_CSS = `
@media (max-width: 1023px) {
  [class*="_frame"] { grid-template-columns: minmax(0, 1fr) 0 0 !important; }
  [class*="_sidebarCol"]:has([class*="_collapsed"]) { display: none !important; }
  [class*="_sidebarCol"]:not(:has([class*="_collapsed"])) {
    position: fixed !important;
    inset: 0 auto 0 0;
    height: auto !important;
    z-index: 900;
    padding-bottom: env(safe-area-inset-bottom, 0px);
    box-shadow: 0 0 32px rgba(0,0,0,.32);
  }
  [class*="_centerCol"] { padding-bottom: 56px; box-sizing: border-box; }
  html.dsh-drawer-open .dsh-mobile-bar { display: none; }
  .dsh-mobile-hamburger { display: inline-flex !important; align-items: center; }
}

@media (min-width: 1024px) {
  .dsh-mobile-bar { display: none !important; }
  .dsh-mobile-hamburger { display: none !important; }
}
`

		function installShellCss() {
			if (typeof document === 'undefined') return () => {}
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

			const canary = setTimeout(() => {
				if (document.querySelector('[class*="_frame"]') === null) {
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
					jsx('button', {
						type: 'button',
						style: item,
						onClick: act(() => layout?.toggleSidebar?.()),
						children: '会话',
					}),
					jsx('button', {
						type: 'button',
						style: item,
						onClick: act(() => layout?.selectPanel?.('chat')),
						children: '对话',
					}),
					jsx('button', {
						type: 'button',
						style: item,
						onClick: act(() => layout?.selectPanel?.('plugins')),
						children: '插件',
					}),
				],
			})
		}

		function HeaderHamburger(props) {
			return jsx('button', {
				type: 'button',
				'aria-label': '打开侧栏',
				className: 'dsh-mobile-hamburger',
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
				children: '☰',
			})
		}

		function apply(ctx) {
			const cleanup = installShellCss()
			if (typeof ctx.effect === 'function') ctx.effect(() => cleanup, 'remote-panel: mobile shell css')

			ctx.slots.inject('shell.overlay', () =>
				ctx.slots.register(
					{
						name: 'shell.overlay',
						id: 'remote-panel.mobile-bar',
						order: 100,
						inject: () => ({ layout: ctx.layout }),
					},
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
				ctx.slots.register({ name: 'settings.section', id: 'remote-panel', order: 40, label: () => '远程访问' }, Panel),
			)
		}

		// layout 必须在 inject 里声明，否则访问 ctx.layout 会抛
		return {
			inject: ['slots', 'layout'],
			apply,
			components: { Panel, DeployWizard, StatusCard, PairCard, AccessCard, StaleBanner },
		}
	},
})
