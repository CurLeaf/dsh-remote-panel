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

		const styles = {
			wrap: { display: 'flex', flexDirection: 'column', gap: 16, fontSize: 13, lineHeight: 1.6 },
			card: {
				border: '1px solid var(--dsw-elevation-stroke-color, rgba(128,128,128,.24))',
				borderRadius: 12,
				padding: '14px 16px',
				display: 'flex',
				flexDirection: 'column',
				gap: 10,
			},
			title: { fontSize: 14, fontWeight: 600, margin: 0 },
			muted: { opacity: 0.65, margin: 0 },
			row: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
			dot: (state) => ({
				width: 8,
				height: 8,
				borderRadius: '50%',
				display: 'inline-block',
				background: state === 'ok' ? '#3fb950' : state === 'bad' ? '#d1242f' : 'rgba(128,128,128,.6)',
			}),
			button: {
				font: 'inherit',
				cursor: 'pointer',
				border: '1px solid var(--dsw-elevation-stroke-color, rgba(128,128,128,.32))',
				borderRadius: 8,
				padding: '4px 10px',
				background: 'transparent',
				color: 'inherit',
			},
			code: {
				fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
				fontSize: 12,
				background: 'rgba(128,128,128,.08)',
				borderRadius: 8,
				padding: '8px 10px',
				whiteSpace: 'pre-wrap',
				wordBreak: 'break-all',
			},
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
					state.kind === 'error' && jsx('p', { style: styles.muted, children: state.message }),
					ok &&
						jsx('p', {
							style: styles.muted,
							children: `运行 ${state.data.uptimeSeconds}s · 版本 ${state.data.version}`,
						}),
				],
			})
		}

		function DeployCard() {
			return jsxs('div', {
				style: styles.card,
				children: [
					jsx('strong', { style: styles.title, children: '远程访问' }),
					jsx('p', {
						style: styles.muted,
						children: '尚未部署数据面（Caddy + EasyTier）。向导将生成一段幂等脚本，交给目标机器的 AI 执行。',
					}),
					jsx('div', {
						style: styles.code,
						children: 'dsh-remote-panel · 部署向导（下一步实现）',
					}),
				],
			})
		}

		function Panel() {
			return jsxs('div', {
				style: styles.wrap,
				children: [jsx(StatusCard, {}), jsx(DeployCard, {})],
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

		const exports = { inject: ['slots'], apply }
		return exports
	},
})
