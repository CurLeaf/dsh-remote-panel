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

		// 控制台 chunk 的文件名由 tools/build-console.mjs 写回（带内容哈希，避免缓存旧包）
		const CONSOLE_CHUNK = './client.console.e2da44ec.js' // @console-chunk
		const API = '/remote-panel/api'
		const TOKEN_GLOBAL = '__DSH_REMOTE_PANEL__'
		const TOKEN_HEADER = 'x-dsh-remote-panel'
		// HMR 时新模块实例接手旧实例的内容增强（同一页面只允许一个 Observer）
		const CONTENT_CLEANUP_KEY = '__DSH_REMOTE_PANEL_CONTENT_ENHANCEMENTS__'
		// 同理：横滑手势的监听也只能有一份，否则一次滑动会被两套逻辑各算一次
		const SWIPE_CLEANUP_KEY = '__DSH_REMOTE_PANEL_DRAWER_SWIPE__'
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
													children: check.label ?? check.id,
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
					jsxs('label', {
						style: { ...styles.row, marginTop: 8, fontSize: 12 },
						children: [
							jsx('input', {
								type: 'checkbox',
								checked: form.tls === true,
								onChange: (event) => setForm((current) => ({ ...current, tls: event.target.checked })),
							}),
							jsx('span', {
								style: styles.muted,
								children: '启用 HTTPS（Caddy 内部 CA；手机需先装根证书，见「远程访问 → 手机全屏」里的下载链接）',
							}),
						],
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

		function StatusCard({ state, version, scheme, onRedeploy }) {
			const [probe, setProbe] = useState(null)
			const [rejects, setRejects] = useState([])
			const [busy, setBusy] = useState(false)
			const [shell, setShell] = useState(null)

			const refresh = useCallback(async () => {
				setBusy(true)
				try {
					const [probed, status] = await Promise.all([callApi('/probe'), callApi('/status')])
					setProbe(probed.probe)
					setShell(status.shell ?? null)
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

			const cert = probe?.cert
			const certHours = typeof cert?.hoursLeft === 'number' ? Math.round(cert.hoursLeft * 10) / 10 : null
			const lights = [
				['EasyTier', probe?.easytier],
				['Caddy', probe?.caddy],
				['healthz', probe?.healthz],
				['上游 DSH', probe?.upstream],
				// 内部 CA 的叶子证书只有 12 小时，续签失败时探活照样握手成功（rejectUnauthorized:false），
				// 所以单独看它：剩余不足 2 小时或 SAN 不匹配都算红灯
				[certHours === null ? '证书' : `证书 ${certHours}h`, cert === undefined ? undefined : { ok: cert.ok === true }],
				// 手机外壳依赖 DSH 的 hash 类名：DSH 升级后这里会红，提示需要更新插件
				['外壳适配', shell === null ? undefined : { ok: shell.ok === true }],
			]

			return jsxs(Card, {
				children: [
					jsxs('div', {
						style: styles.head,
						children: [
							jsx(Dot, { ok: probe?.ok }),
							jsx('strong', { style: styles.title, children: '运行状态' }),
							jsx('span', { style: styles.muted, children: `${scheme ?? (window.location?.protocol ?? 'http:').replace(':', '')}://${state.ip}:${state.port}/` }),
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
					cert !== undefined && cert.ok !== true
						? jsx('p', {
								style: { ...styles.hint, color: '#f2b8b5' },
								children: `证书告警：${cert.reason ?? '不可用'}${certHours === null ? '' : `（剩余 ${certHours} 小时）`}`,
							})
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
			const [round, setRound] = useState(0)

			// DSH 每次重启都会换令牌；面板开着时自动刷新，避免扫到过期的码
			useEffect(() => {
				const timer = setInterval(() => setRound((value) => value + 1), 60000)
				return () => clearInterval(timer)
			}, [])

			useEffect(() => {
				callApi('/pair')
					.then((data) => setState({ kind: 'ok', data }))
					.catch((error) => setState({ kind: 'error', message: error.message }))
			}, [round])

			const data = state.kind === 'ok' ? state.data : null
			return jsxs(Card, {
				children: [
					jsxs('div', {
						style: styles.head,
						children: [
							jsx(Dot, { ok: data?.found === true }),
							jsx('strong', { style: styles.title, children: '手机配对' }),
							jsx('span', { style: styles.muted, children: state.kind === 'loading' ? '读取中…' : data?.found ? '扫码即可' : '未找到令牌' }),
							jsx('button', { type: 'button', style: styles.button, onClick: () => setRound((value) => value + 1), children: '刷新' }),
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
										jsx('span', { style: styles.hint, children: '扫这一张即可：先种门禁（一年），再自动跳到令牌' }),
										// 二维码编的就是这条组合链接，显示同一个值，别再换成别的
										jsx('code', {
											style: { ...styles.code, maxHeight: 72 },
											children: data.urls.combo ?? data.urls.token,
										}),
										jsxs('div', {
											style: styles.row,
											children: [
												jsx(CopyButton, { text: data.urls.combo ?? data.urls.token, label: '复制配对链接' }),
											],
										}),
										jsx('details', {
											children: [
												jsx('summary', { style: styles.hint, children: '手动备用（门禁 / 令牌分开用）' }),
												jsxs('div', {
													style: { display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 },
													children: [
														jsx('code', {
															style: { ...styles.code, maxHeight: 56 },
															children: data.urls.gate ?? '（回填码未含口令）',
														}),
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
								: '当前是 http，装不成独立应用；先用下面的按钮进全屏（或按 README 开启 HTTPS 再装）。',
					}),
					standalone || !secure
						? null
						: jsx('p', {
							style: styles.hint,
							children: 'Android：浏览器菜单 → 安装应用 / 添加到主屏幕；iPhone：分享 → 添加到主屏幕。',
						}),
					jsx('p', {
						style: styles.hint,
						children: [
							'第一次装之前要先信任 Caddy 根证书：',
							jsx('a', {
								href: '/remote-panel/app/ca.crt',
								download: 'dsh-caddy-root.crt',
								style: styles.link,
								children: ' 下载根证书 ',
							}),
							'（Android：设置 → 安全 → 加密与凭据 → 安装证书；iOS：下载后到「设置 → 通用 → 关于本机 → 证书信任设置」打开信任）。',
						],
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
			const [scheme, setScheme] = useState(null)
			const [showWizard, setShowWizard] = useState(false)

			const load = useCallback(async () => {
				try {
					const status = await callApi('/status')
					setVersion(status.version)
					setScheme(status.scheme ?? null)
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
							: jsx(StatusCard, { state, version, scheme, onRedeploy: () => setShowWizard(false) }),
						state === null ? null : jsx(PairCard, {}),
					],
				})
			}

			return jsx('div', {
				style: styles.wrap,
				children: [
					jsx(StaleBanner, {}),
					jsx(StatusCard, { state, version, scheme, onRedeploy: () => setShowWizard(true) }),
					jsx(PairCard, {}),
					jsx(AccessCard, {}),
					jsx(AppCard, {}),
				],
			})
		}

		// ---------------------------------------------------------------- 外壳

		const SHELL_CSS = `
/* 手机外壳：结构（主题无关） */
@media (max-width: 1023px) {
  [class*="_frame"] { grid-template-columns: minmax(0, 1fr) 0 0 !important; }
  /* 宿主在抽屉右缘摆了一条 8px 的 resize 手柄（pointer capture + setSidebar），
     手机上它正好压在「往左滑收起」的起手位置，拖它只会把抽屉改成 264~420 的宽度。收掉。 */
  [class*="_handle"][data-side] { display: none !important; }
  [class*="_sidebarCol"]:has([class*="_collapsed"]) { display: none !important; }
  [class*="_sidebarCol"]:not(:has([class*="_collapsed"])) {
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
  /* 抽屉/遮罩打开时顶栏按钮让位 */
  html.dsh-drawer-open .dsh-mobile-newchat { display: none !important; }
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
  /* 监看面板自带导航，宿主的返回栏让开 */
  html.dsh-console-open .dsh-mobile-panelbar { display: none !important; }
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
  .pXSMma_headline { flex-direction: column !important; align-items: center !important; gap: 14px !important; }
  .pXSMma_fish, .pXSMma_fishHitbox { width: 112px !important; height: 82.4px !important; }
  .pXSMma_fish { color: #4d7dfe !important; }
  .pXSMma_titleGroup { justify-content: center !important; }
  .pXSMma_titleGroup,
  .pXSMma_titleGroup > * { font-size: 22px !important; font-weight: 650 !important; letter-spacing: -.02em !important; }
  .pXSMma_previewBadge { display: none !important; }
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
    bottom: max(18px, max(env(safe-area-inset-bottom, 0px), var(--dsh-safe-bottom, 0px)));
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
  .pXSMma_workspace {
    height: 30px !important;
    padding: 0 10px 0 9px !important;
    border-radius: 999px !important;
    gap: 6px !important;
  }
  .pXSMma_workspaceLabel { font-size: 13px !important; font-weight: 600 !important; max-width: 160px; }
  .pXSMma_workspace svg { width: 14px; height: 14px; }

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
  html.dsh-search-open [class*="_sidebarCol"]:not(:has([class*="_collapsed"])) {
    width: 100% !important;
    border-radius: 0 !important;
    box-shadow: none !important;
  }
  html.dsh-search-open .hHd-Xa_panelList,
  html.dsh-search-open .hHd-Xa_footArea { display: none !important; }
  html.dsh-search-open .bhn1Oq_searchExpanded { height: 40px !important; border-radius: 16px !important; }
  html.dsh-search-open .bhn1Oq_searchInput { height: 38px !important; }

  /* 点遮罩关抽屉：原生窄屏没有这层，补一个（抽屉之下、正文之上） */
  /* 遮罩常驻，用透明度过渡：display 切换会瞬变，看着很硬 */
  .dsh-mobile-scrim {
    position: fixed;
    inset: 0;
    z-index: 899;
    display: block;
    opacity: 0;
    pointer-events: none;
    /* 纯黑底上「压暗」看不出层级，这里反过来提亮：抽屉保持纯黑，其余区域变灰 */
    background: rgba(255, 255, 255, .16);
    transition: opacity 160ms cubic-bezier(.2, .8, .2, 1);
  }
  html.dsh-drawer-open .dsh-mobile-scrim {
    opacity: 1;
    pointer-events: auto;
    /* 只在真正要动画时才提成合成层，别让它一直挂着 */
    will-change: opacity;
  }

  /* 抽屉进出：
     - 挂载即滑入（☰ / 新建 这些非手势路径）；
     - 手势路径由 JS 逐帧写内联 transform 跟手，dsh-drawer-follow 先让宿主自己的挂载动画让路；
     - 抬手吸附 / 收起共用关键帧，隐含的 from 就是当前的跟手位移，所以接得上。 */
  [class*="_sidebarCol"]:not(:has([class*="_collapsed"])) {
    animation: dsh-drawer-in 180ms cubic-bezier(.2, .8, .2, 1) both;
  }
  html.dsh-drawer-follow [class*="_sidebarCol"]:not(:has([class*="_collapsed"])) {
    animation: none !important;
  }
  html.dsh-drawer-dragging [class*="_sidebarCol"]:not(:has([class*="_collapsed"])) {
    pointer-events: none;
    will-change: transform;
  }
  /* 跟手还没上第一帧位移（抽屉刚挂载）时先别露脸，避免闪一下全开 */
  html.dsh-drawer-dragging:not(.dsh-drawer-live) [class*="_sidebarCol"]:not(:has([class*="_collapsed"])) {
    visibility: hidden;
  }
  html.dsh-drawer-dragging .dsh-mobile-scrim { pointer-events: none; }
  html.dsh-drawer-snap [class*="_sidebarCol"]:not(:has([class*="_collapsed"])) {
    animation: dsh-drawer-snap 200ms cubic-bezier(.2, .8, .2, 1) both !important;
  }
  html.dsh-drawer-snap .dsh-mobile-scrim { pointer-events: none; }
  html.dsh-drawer-leave [class*="_sidebarCol"]:not(:has([class*="_collapsed"])) {
    animation: dsh-drawer-out 160ms cubic-bezier(.4, 0, .8, .2) both !important;
    pointer-events: none;
  }
  html.dsh-drawer-leave .dsh-mobile-scrim {
    opacity: 0;
    pointer-events: none;
    transition-duration: 160ms;
  }
  @keyframes dsh-drawer-in {
    from { transform: translateX(-100%); }
  }
  @keyframes dsh-drawer-snap {
    to { transform: translateX(0); }
  }
  @keyframes dsh-drawer-out {
    to { transform: translateX(-100%); }
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
    .dsh-mobile-scrim, .dsh-mobile-offline { transition: none; animation: none; }
    [class*="_sidebarCol"]:not(:has([class*="_collapsed"])) { animation: none !important; }
    html.dsh-drawer-leave [class*="_sidebarCol"] { animation: none !important; }
  }

  /* 会话正文的横向留白：原生每侧 = clearance(16) + 16 = 32px，
     390 的屏上等于两边各砍掉一行字；压到 16px，跟输入条卡片同一条基线 */
  .EvIC1a_scroll {
    padding-left: 16px !important;
    padding-right: 16px !important;
  }

  /* 正文滚动区收口到输入条上沿：
     原生把输入条做在滚动容器里（sticky 贴底、上沿渐隐到背景色），所以正文会一直滚到
     输入条背后，滚轴也跟着画到屏幕最底。手机上更希望「正文止于输入条上沿」，
     这里把输入条改成固定定位贴屏幕底、正文用 margin 让出它的高度，
     滚动容器（连同滚轴）自然就停在输入条上方了。
     用 fixed 而不是 absolute：切换「轨迹」页时滚动容器会因为 composer overlay 变成
     position: relative，absolute 会被它缩小后的盒子接住，输入条就浮到屏幕中间。
     高度用原生写在滚动容器上的 --dsh-composer-height（ResizeObserver 跟输入框同步）。 */
  .wSkVaW_body[data-content-phase="active"] .wSkVaW_scrollBody {
    margin-bottom: var(--dsh-composer-height, 152px) !important;
  }
  .wSkVaW_body[data-content-phase="active"] .wSkVaW_composerSeat {
    position: fixed !important;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 7;
    /* 正文已经不往输入条背后滚了，那条「渐隐到纯黑」的灰带也就不需要了 */
    background: var(--dsw-alias-bg-base) !important;
    background-image: none !important;
  }
  body[data-ds-dark-theme] .wSkVaW_body[data-content-phase="active"] .wSkVaW_composerSeat {
    background: #000 !important;
  }
  /* 「回到底部」浮球原先按「输入条压在正文上」算偏移，正文让开后要贴回视口底 */
  [data-conversation-scroll] .EvIC1a_toBottomSlot { bottom: 12px !important; }
  /* 轨迹页也按「输入条浮在内容上」留了 composer + 16 的底部空白，收口后就成了死空白 */
  .wSkVaW_body[data-content-phase="active"] [class*="_ledger"] {
    --dsh-trajectory-bottom-clearance: 16px;
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
  body[data-ds-dark-theme] [class*="_centerCol"],
  body[data-ds-dark-theme] [class*="_scrollBody"],
  body[data-ds-dark-theme] [class*="_sidebarCol"],
  body[data-ds-dark-theme] .hHd-Xa_root,
  body[data-ds-dark-theme] .hHd-Xa_regionArea,
  body[data-ds-dark-theme] .hHd-Xa_panelList {
    background: #000 !important;
  }
  body[data-ds-dark-theme] [class*="_sidebarCol"] {
    border: 0 !important;
    box-shadow: none;
  }
  body[data-ds-dark-theme] .wSkVaW_header { border-bottom: 0 !important; background: transparent !important; }
  body[data-ds-dark-theme] .uV2eYG_card {
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .06) !important;
  }
  body[data-ds-dark-theme] .pXSMma_workspace { background: rgba(255, 255, 255, .07) !important; }
  /* 列表底部的滚动渐隐原本渐到 #1b1b1c，跟统一底色对齐 */
  body[data-ds-dark-theme] .bhn1Oq_fade {
    background-image: linear-gradient(rgba(0, 0, 0, 0), #000) !important;
  }
}

@media (min-width: 1024px) {
  .dsh-mobile-hamburger, .dsh-mobile-newchat, .dsh-mobile-clear-workspace,
  .dsh-mobile-panelbar { display: none !important; }
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
		 * 手机返回键：抽屉打开时先收抽屉，面板打开时先回对话，而不是退出页面。
		 * 做法是打开时 push 一条带标记的历史，关闭时只回退自己那一条。
		 * 面板和抽屉会互相打断（点面板行会先收抽屉），所以抽屉回退要等它的 popstate
		 * 落地后再给面板压栈，否则会把刚压上的面板条目弹掉。
		 */
		function installBackGesture(layout) {
			if (typeof window === 'undefined' || typeof MutationObserver === 'undefined') return () => {}
			const query = window.matchMedia?.('(max-width: 1023px)')
			const isOpen = () => document.documentElement.classList.contains('dsh-drawer-open')
			const isPanel = () => document.documentElement.classList.contains('dsh-panel-open')
			let pushed = false
			let panelPushed = false
			let awaitingDrawerPop = false
			const push = (state) => {
				try {
					history.pushState(state, '')
					return true
				} catch {
					/* 某些 WebView 禁 pushState，忽略 */
					return false
				}
			}
			const onPop = () => {
				if (awaitingDrawerPop) {
					awaitingDrawerPop = false
					// 抽屉那条已经退掉：面板还开着就补一条属于面板的历史
					if (isPanel() && !panelPushed) panelPushed = push({ dshPanel: true })
					return
				}
				if (isOpen()) {
					layout?.toggleSidebar?.()
					return
				}
				if (isPanel()) {
					panelPushed = false
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
			const check = () => {
				if (query && !query.matches) return
				const open = isOpen()
				if (open && !pushed) {
					pushed = push({ dshDrawer: true })
				} else if (!open && pushed) {
					pushed = false
					if (history.state !== null && history.state.dshDrawer === true) {
						awaitingDrawerPop = true
						history.back()
					}
				}
				if (!isPanel() && panelPushed) {
					panelPushed = false
					if (history.state !== null && history.state.dshPanel === true) history.back()
				} else if (isPanel() && !panelPushed && !open && !awaitingDrawerPop) {
					panelPushed = push({ dshPanel: true })
				}
			}
			observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
			window.addEventListener('popstate', onPop)
			return () => {
				observer.disconnect()
				window.removeEventListener('popstate', onPop)
			}
		}

		/**
		 * 清掉跟手留下的内联位移与状态类。
		 *
		 * 抽屉真的收起之后必须清：内联 transform 留着的话，下次挂载会带着上一次的角度出现；
		 * 状态类留着的话，宿主自己的挂载动画会被 `animation: none` 一直顶掉。
		 */
		/** 等宿主真的把抽屉收起来（DOM 里出现折叠标记 / 节点消失）再动跟手的痕迹。 */
		function whenDrawerClosed(onDone) {
			if (typeof document === 'undefined') return
			let tries = 0
			const tick = () => {
				const column = document.querySelector('[class*="_sidebarCol"]')
				const closed = column === null || column.querySelector('[class*="_collapsed"]') !== null
				if (closed || tries > 30) {
					onDone()
					return
				}
				tries += 1
				requestAnimationFrame(tick)
			}
			requestAnimationFrame(tick)
		}

		function resetDrawerFollow() {
			if (typeof document === 'undefined') return
			const rootEl = document.documentElement
			rootEl.classList.remove(
				'dsh-drawer-follow',
				'dsh-drawer-dragging',
				'dsh-drawer-live',
				'dsh-drawer-snap',
				'dsh-drawer-leave',
			)
			for (const el of [document.querySelector('[class*="_sidebarCol"]'), document.querySelector('.dsh-mobile-scrim')]) {
				if (el === null) continue
				el.style.transition = ''
				el.style.transform = ''
				el.style.opacity = ''
				el.style.pointerEvents = ''
			}
		}

		/**
		 * 横滑抽屉：主屏右滑拉出、抽屉上左滑收回，跟手位移 + 抬手吸附。
		 *
		 * 热区（和系统返回手势分家）：
		 *   x < 24            系统的边缘返回区，一律不碰（Android 手势导航就吃这一条）
		 *   24 ~ 72           拉抽屉的起手区（48px），而且起手必须是近乎纯横向的
		 *   更里面            正文自己的横向滚动区，完全不参与
		 * 抽屉开着时任意位置左滑收起；输入框、可编辑区、代码块/表格这类可横滚的元素起手一律让开。
		 *
		 * 跟手为什么要先 mount：收起态的抽屉在 DOM 里根本不存在（React 只渲染折叠轨道）。
		 * 所以判轴成立的那一刻先 toggle 把展开版挂上，接着逐帧写内联 transform；
		 * 从挂载到第一帧位移之间用 dsh-drawer-dragging:not(.dsh-drawer-live) 藏起来，不会闪一下全开。
		 */
		function installDrawerSwipe(layout) {
			if (typeof document === 'undefined' || typeof window === 'undefined') return () => {}
			const narrow = window.matchMedia?.('(max-width: 1023px)')
			if (narrow === undefined || narrow === null) return () => {}
			const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')
			// HMR：新实例先让旧实例自清理，否则两套监听会把一次横滑算成两次，开完立刻关
			try {
				globalThis[SWIPE_CLEANUP_KEY]?.()
			} catch {
				/* 旧实例清理失败不阻塞新实例 */
			}

			const SYS_EDGE = 24 // 系统返回手势的保留带（Android 20dp，留 4px 余量）
			const ARM = 20 // 判轴位移：到这一步才决定这是不是抽屉手势
			const ARC = 14 // 开抽屉时允许的弧高：起手必须几乎就是横向的
			const COMMIT = 0.42 // 划开 42% 就认
			const FLICK = 0.5 // 速度阈值（px/ms）
			const SETTLE_MS = 200 // 抬手吸附
			const LEAVE_MS = 160 // 滑出
			const MOUNT_MS = 320 // 抽屉挂不上的兜底：到点就放弃这次手势

			const root = () => document.documentElement
			const isOpen = () => root().classList.contains('dsh-drawer-open')
			const column = () => document.querySelector('[class*="_sidebarCol"]')
			const scrim = () => document.querySelector('.dsh-mobile-scrim')
			const still = () => reduced?.matches === true
			const toggle = () => {
				try {
					layout?.toggleSidebar?.()
				} catch (error) {
					console.warn('[remote-panel] drawer toggle failed', error)
				}
			}
			// 让开的起手：输入/选字、弹窗层，以及「还能往右滚回去」的横向滚动区。
			// 代码块滚到最左（scrollLeft=0）时右滑本来也没内容可滚，这时让给抽屉。
			const blocked = (target) => {
				if (!(target instanceof Element)) return false
				if (target.closest('input, textarea, [contenteditable=""], [contenteditable="true"]') !== null) return true
				if (!isOpen()) {
					if (target.closest('[role="dialog"], [class*="_dialog"], [class*="_modal"]') !== null) return true
					const box = target.closest('pre, [class*="_tableScroll"], [class*="_attachmentRow"]')
					if (box !== null && box.scrollLeft > 1) return true
				}
				return false
			}

			let drag = null
			let snapTimer = 0

			/** 把抽屉摆到 offset 像素（0 = 收起，width = 全开）。 */
			const paint = (g) => {
				const el = column()
				if (el === null) return false
				const width = Math.round(el.getBoundingClientRect().width)
				// 还没真正显示出来（display:none）时宽度是 0，等下一帧
				if (width <= 0) return false
				g.width = width
				const offset = Math.max(0, Math.min(width, g.pending))
				g.offset = offset
				el.style.transition = 'none'
				el.style.transform = `translateX(${offset - width}px)`
				const s = scrim()
				if (s !== null) {
					s.style.transition = 'none'
					s.style.opacity = String(Math.min(1, offset / width))
					s.style.pointerEvents = 'none'
				}
				root().classList.add('dsh-drawer-live')
				return true
			}

			// 挂载后到第一帧位移之间轮询几帧：手指按住不动也要把第一帧补上
			let pumpFrame = 0
			const pump = () => {
				pumpFrame = 0
				const g = drag
				if (g === null || !g.armed) return
				if (paint(g)) return
				if (performance.now() > g.deadline) {
					// 抽屉迟迟没挂上（宿主状态异常）：放弃这次手势，别留下半开的壳
					drag = null
					resetDrawerFollow()
					return
				}
				pumpFrame = requestAnimationFrame(pump)
			}
			const kick = () => {
				if (pumpFrame !== 0) return
				pumpFrame = requestAnimationFrame(pump)
			}

			const follow = (g, dx) => {
				g.pending = g.mode === 'open' ? dx : (g.width || 280) + dx
				if (!paint(g)) kick()
			}

			const arm = (g) => {
				const rootEl = root()
				rootEl.classList.remove('dsh-drawer-snap', 'dsh-drawer-leave')
				rootEl.classList.add('dsh-drawer-follow', 'dsh-drawer-dragging')
				g.armed = true
				clearTimeout(snapTimer)
				if (g.mode === 'open' && !isOpen()) toggle()
			}

			/** 抬手吸附到全开：从当前位移滑到 0（遮罩同步回到全亮）。 */
			const snapOpen = () => {
				const rootEl = root()
				rootEl.classList.remove('dsh-drawer-dragging')
				const s = scrim()
				if (still()) {
					const el = column()
					if (el !== null) el.style.transform = 'translateX(0px)'
					if (s !== null) {
						s.style.transition = ''
						s.style.opacity = ''
						s.style.pointerEvents = ''
					}
					return
				}
				if (s !== null) {
					// 跟手期遮罩是 inline 的半透明，不清掉会停在半路
					s.style.transition = `opacity ${SETTLE_MS}ms cubic-bezier(.2, .8, .2, 1)`
					s.style.opacity = '1'
				}
				rootEl.classList.add('dsh-drawer-snap')
				clearTimeout(snapTimer)
				snapTimer = window.setTimeout(() => {
					snapTimer = 0
					const el = column()
					if (el !== null) {
						el.style.transition = 'none'
						el.style.transform = 'translateX(0px)'
					}
					if (s !== null) {
						s.style.transition = ''
						s.style.opacity = ''
						s.style.pointerEvents = ''
					}
					rootEl.classList.remove('dsh-drawer-snap')
				}, SETTLE_MS)
			}

			/** 抬手吸附到收起：从当前位移滑出去，再真的 toggle 掉。 */
			const snapClosed = () => {
				const rootEl = root()
				rootEl.classList.remove('dsh-drawer-dragging')
				// 遮罩交回 CSS：dsh-drawer-leave 里带 160ms 的淡出
				const s = scrim()
				if (s !== null) {
					s.style.transition = ''
					s.style.opacity = ''
					s.style.pointerEvents = ''
				}
				if (still()) {
					toggle()
					return
				}
				rootEl.classList.add('dsh-drawer-leave')
				clearTimeout(snapTimer)
				snapTimer = window.setTimeout(() => {
					snapTimer = 0
					toggle()
					whenDrawerClosed(resetDrawerFollow)
				}, LEAVE_MS)
			}

			// 用 touch 而不是 pointer：横滑会被浏览器当成滚动接管，
			// pointer 流在中途直接以 pointercancel 收尾（实测第一条 move 就断）。
			// touch 不会，代价是要自己判轴，判成横滑后再 preventDefault 把这一段滚动抢过来。
			const onStart = (event) => {
				if (!narrow.matches || drag !== null) return
				if (event.touches.length !== 1) return
				const touch = event.touches[0]
				const open = isOpen()
				if (blocked(event.target)) return
				if (!open) {
					// 整屏都能起手，只让开左右两条系统返回带（Android 两侧都能返回）
					if (touch.clientX < SYS_EDGE) return
					if (touch.clientX > window.innerWidth - SYS_EDGE) return
				}
				drag = {
					id: touch.identifier,
					mode: open ? 'close' : 'open',
					x0: touch.clientX,
					y0: touch.clientY,
					x: touch.clientX,
					t: event.timeStamp,
					vx: 0,
					axis: null,
					armed: false,
					width: 0,
					offset: 0,
					pending: 0,
					startTs: event.timeStamp,
					deadline: performance.now() + MOUNT_MS,
				}
			}

			const find = (list, g) => {
				for (const touch of list) if (touch.identifier === g.id) return touch
				return null
			}

			const onMove = (event) => {
				const g = drag
				if (g === null) return
				// 丢掉上一段手势迟到的事件：Touch.identifier 每段都会从 0 重来，
				// 队列里残留的旧 move 会被认成本次手势的运动，直接把判定带偏
				if (event.timeStamp < g.startTs) return
				const touch = find(event.touches, g)
				if (touch === null) return
				const dx = touch.clientX - g.x0
				const dy = touch.clientY - g.y0
				if (g.axis === null) {
					const ax = Math.abs(dx)
					const ay = Math.abs(dy)
					if (ax < ARM && ay < ARM) return
					// 起手必须几乎就是横向的：竖向滚正文时拇指会画一道斜弧，
					// 只看「横比竖多」会把这种滚动判成抽屉手势（实机上就是「自己乱开、抢正文」）。
					// 所以这里卡的是弧高：横向走到 20px 时，纵向最多只能有 14px。
					const forward = g.mode === 'open' ? dx > 0 : dx < 0
					const sideways = g.mode === 'open' ? ay <= Math.max(ARC, ax * 0.4) : ax > ay * 2
					if (!forward || !sideways) {
						drag = null
						return
					}
					g.axis = 'x'
					arm(g)
				}
				// 判成横滑才抢滚动；不抢的话手指划到一半就被浏览器接管了
				if (event.cancelable) event.preventDefault()
				const now = performance.now()
				const dt = now - g.t
				if (dt > 0) g.vx = (touch.clientX - g.x) / dt
				g.x = touch.clientX
				g.t = now
				follow(g, dx)
			}

			const onEnd = (event) => {
				const g = drag
				if (g === null) return
				drag = null
				if (event.timeStamp < g.startTs) return
				const touch = find(event.changedTouches, g)
				if (touch === null) return
				if (g.axis !== 'x' || !g.armed) return
				// 用抬手位置补最后一帧：最后一段 move 常被浏览器合并掉，
				// 不补的话判定用的是过期位移（差一点就开/关）
				follow(g, touch.clientX - g.x0)
				const width = g.width || 280
				const ratio = g.offset / width
				if (g.mode === 'open') {
					// 划开够多、或者甩得够快
					if (ratio >= COMMIT || (g.vx >= FLICK && g.offset > 12)) snapOpen(g)
					else snapClosed()
				} else {
					if (ratio <= 1 - COMMIT || g.vx <= -FLICK) snapClosed()
					else snapOpen(g)
				}
			}

			const onCancel = () => {
				// 被系统抢走 / 来电：按「回到原状态」处理，别把抽屉留在半开
				const g = drag
				drag = null
				if (g === null || !g.armed) return
				if (isOpen()) snapOpen(g)
				else snapClosed()
			}

			const options = { capture: true, passive: false }
			document.addEventListener('touchstart', onStart, options)
			document.addEventListener('touchmove', onMove, options)
			document.addEventListener('touchend', onEnd, options)
			document.addEventListener('touchcancel', onCancel, options)
			let disposed = false
			const cleanup = () => {
				if (disposed) return
				disposed = true
				document.removeEventListener('touchstart', onStart, true)
				document.removeEventListener('touchmove', onMove, true)
				document.removeEventListener('touchend', onEnd, true)
				document.removeEventListener('touchcancel', onCancel, true)
				clearTimeout(snapTimer)
				if (pumpFrame !== 0) cancelAnimationFrame(pumpFrame)
				drag = null
				resetDrawerFollow()
				if (globalThis[SWIPE_CLEANUP_KEY] === cleanup) delete globalThis[SWIPE_CLEANUP_KEY]
			}
			globalThis[SWIPE_CLEANUP_KEY] = cleanup
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
			// 只查「任何页面都该存在」的挂点；抽屉里的 hHd-Xa_ 只在打开时才有，不参与判定
			const markers = ['wSkVaW_', 'uV2eYG_', 'pXSMma_', 'pI_x6G_']
			let timer = window.setTimeout(async () => {
				try {
					const missing = markers.filter((marker) => document.querySelector(`[class*="${marker}"]`) === null)
					if (missing.length > 0) {
						console.warn('[remote-panel] 外壳挂点缺失，手机样式可能失配：', missing.join(', '))
					}
					await callApi('/shell', {
						method: 'POST',
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify({ missing }),
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

			const isComposer = (el) =>
				el instanceof Element &&
				el !== document.body &&
				(el.isContentEditable === true || el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') &&
				(el.closest('.uV2eYG_root') !== null || el.closest('[class*="_composer"]') !== null)

			const release = () => {
				const el = document.activeElement
				if (isComposer(el)) el.blur()
			}
			// 分几拍撤一次，并留一段压制窗口覆盖 DSH 自己的 focus
			const scheduleRelease = (windowMs = 700) => {
				suppressUntil = Math.max(suppressUntil, Date.now() + windowMs)
				for (const delay of [0, 80, 200, 400, 700]) window.setTimeout(release, delay)
			}

			const onFocusIn = (event) => {
				if (Date.now() > suppressUntil) return
				const el = event.target
				if (!isComposer(el)) return
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
			let wasOpen = false
			const sync = () => {
				cancelAnimationFrame(frame)
				frame = requestAnimationFrame(() => {
					const column = document.querySelector('[class*="_sidebarCol"]')
					const open = column !== null && column.querySelector('[class*="_collapsed"]') === null
					// 抽屉真的收起了：把跟手留下的内联位移和状态类清干净
					if (!open && wasOpen) resetDrawerFollow()
					wasOpen = open
					document.documentElement.classList.toggle('dsh-drawer-open', open)
					// 搜索展开时抽屉整屏（原生只是把输入框在 280px 抽屉里拉长）
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
				if (document.querySelector('[class*="_frame"]') === null) {
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
				// 控制台面板自带完整导航；宿主那条黑色返回栏让位，否则会盖住「接管」
				document.documentElement.classList.toggle('dsh-console-open', active === 'pocket-console' && narrow.matches)
			}
			const unsubscribePanel =
				typeof layout?.panelInfo?.subscribe === 'function' ? layout.panelInfo.subscribe(syncPanel) : () => {}
			narrow.addEventListener?.('change', syncPanel)
			syncPanel()

			// 窄屏：点遮罩关抽屉；选中会话 / 面板后也自动收起（桌面保持原样，不参与）
			// 收起统一走滑出关键帧：☰ 打开是滑入的，点遮罩瞬收会像「闪掉」
			let closeTimer = 0
			const closeDrawer = () => {
				if (!narrow.matches) return
				const rootEl = document.documentElement
				if (!rootEl.classList.contains('dsh-drawer-open')) return
				if (rootEl.classList.contains('dsh-drawer-leave')) return
				// follow 把宿主的挂载动画关掉：否则退场类一撤，dsh-drawer-in 会重播一遍（看起来就是闪一下）
				rootEl.classList.add('dsh-drawer-follow', 'dsh-drawer-leave')
				clearTimeout(closeTimer)
				closeTimer = window.setTimeout(() => {
					closeTimer = 0
					if (!rootEl.classList.contains('dsh-drawer-open')) return
					try {
						layout?.toggleSidebar?.()
					} catch (error) {
						console.warn('[remote-panel] close drawer failed', error)
					}
					// 等 DOM 真的收起来再清；toggle 万一没生效，超时后也会清，
					// 至少不会留下「抽屉看不见、遮罩却盖着全屏」的死状态
					whenDrawerClosed(resetDrawerFollow)
				}, 160)
			}

			const scrim = document.createElement('div')
			scrim.className = 'dsh-mobile-scrim'
			scrim.addEventListener('click', () => {
				if (!narrow.matches) return
				closeDrawer()
			})
			document.body.appendChild(scrim)

			const onDocumentClick = (event) => {
				if (!narrow.matches) return
				if (!document.documentElement.classList.contains('dsh-drawer-open')) return
				const target = event.target
				if (!(target instanceof Element)) return
				if (!target.closest('[class*="_sidebarCol"]')) return
				// 行尾的「⋯」是会话菜单的锚点：点它不算「选中会话」，
				// 否则抽屉会先收起、行一卸载菜单就没了
				if (target.closest('[class*="_rowActions"]')) return
				if (!target.closest('[class*="_sessionRow"], [class*="_panelRow"]')) return
				setTimeout(closeDrawer, 0)
			}
			document.addEventListener('click', onDocumentClick, true)

			// 抽屉开着时 ESC 收起（宿主窄屏没有这个键位）
			const onKeyDown = (event) => {
				if (event.key !== 'Escape' || !narrow.matches) return
				if (!document.documentElement.classList.contains('dsh-drawer-open')) return
				event.preventDefault()
				closeDrawer()
			}
			document.addEventListener('keydown', onKeyDown)

			return () => {
				clearTimeout(canary)
				clearTimeout(closeTimer)
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
				scrim.remove()
				style.remove()
				document.documentElement.classList.remove('dsh-drawer-open', 'dsh-search-open', 'dsh-panel-open')
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

		/** 侧栏入口图标：仪表盘，选中时加粗。 */
		function ConsolePanelIcon(props) {
			const size = typeof props.size === 'number' ? props.size : 18
			return jsx('svg', {
				width: size,
				height: size,
				viewBox: '0 0 24 24',
				fill: 'none',
				stroke: 'currentColor',
				strokeWidth: props.active ? 2.1 : 1.8,
				strokeLinecap: 'round',
				strokeLinejoin: 'round',
				'aria-hidden': 'true',
				children: [
					jsx('path', { d: 'M4.7 17.8a8.5 8.5 0 1 1 14.6 0' }),
					jsx('path', { d: 'M12 17.8l3.7-5.4' }),
					jsx('circle', { cx: 12, cy: 17.8, r: 1.15, fill: 'currentColor', stroke: 'none' }),
				],
			})
		}

		/** 监看面板：懒加载 package-local chunk，挂到一个铺满的 div 上。 */
		function ConsolePanelHost(props) {
			const ref = React.useRef(null)
			const onExit = props.onExit
			React.useEffect(() => {
				let cancelled = false
				let dispose = null
				Promise.resolve(require.async(CONSOLE_CHUNK))
					.then((mod) => {
						if (cancelled || ref.current === null) return
						dispose = mod.mountConsole(ref.current, { onExit, sessions: props.sessions })
					})
					.catch((error) => console.warn('[remote-panel] console chunk failed', error))
				return () => {
					cancelled = true
					if (dispose !== null) dispose()
				}
			}, [onExit])
			return jsx('div', { className: 'pc-host', ref })
		}

		function apply(ctx) {
			const cleanup = installShellCss(ctx.layout)
			installAssetCache()
			const cleanupClear = installWorkspaceClear(ctx)
			const cleanupBack = installBackGesture(ctx.layout)
			const cleanupSwipe = installDrawerSwipe(ctx.layout)
			const cleanupAttention = installAttention()
			const cleanupContent = installContentEnhancements()
			const cleanupNet = installConnectivity()
			const cleanupFocus = installComposerFocusGuard()
			const cleanupFps = installFpsMeter()
			const cleanupContract = installShellContractReport()
			const cleanupTray = installStatsTray()
			if (typeof ctx.effect === 'function') ctx.effect(() => cleanupClear, 'remote-panel: workspace clear')
			if (typeof ctx.effect === 'function') ctx.effect(() => cleanupBack, 'remote-panel: back gesture')
			if (typeof ctx.effect === 'function') ctx.effect(() => cleanupSwipe, 'remote-panel: drawer swipe')
			if (typeof ctx.effect === 'function') ctx.effect(() => cleanupAttention, 'remote-panel: attention')
			if (typeof ctx.effect === 'function') ctx.effect(() => cleanupContent, 'remote-panel: content enhancements')
			if (typeof ctx.effect === 'function') ctx.effect(() => cleanupNet, 'remote-panel: connectivity')
			if (typeof ctx.effect === 'function') ctx.effect(() => cleanupFocus, 'remote-panel: composer focus guard')
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

			// 监看：窄屏才有入口，桌面不打扰
			ctx.slots.inject('main', () =>
				ctx.slots.register(
					{
						name: 'main',
						key: 'pocket-console',
						inject: () => ({ onExit: () => ctx.layout.selectPanel(null), sessions: ctx.sessions }),
					},
					ConsolePanelHost,
				),
			)
			const consoleQuery = typeof window === 'undefined' ? undefined : window.matchMedia?.('(max-width: 1023px)')
			if (consoleQuery === undefined || consoleQuery === null || consoleQuery.matches) {
				ctx.slots.inject('sidebar.panellist', () =>
					ctx.slots.register(
						{ name: 'sidebar.panellist', id: 'pocket-console', order: 15, label: () => '监看' },
						ConsolePanelIcon,
					),
				)
			}
		}

		// layout 必须在 inject 里声明，否则访问 ctx.layout 会抛
		return {
			inject: ['slots', 'layout', 'sessions'],
			apply,
			components: { Panel, DeployWizard, StatusCard, PairCard, AccessCard, StaleBanner, AppCard },
		}
	},
})
