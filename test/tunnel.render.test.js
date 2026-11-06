import assert from 'node:assert/strict'
import test from 'node:test'

import { AGENT_PATH, normalizeTunnelInput, renderTunnel, UNIT_NAME } from '../lib/deploy/tunnel.js'

const base = {
	relayUrl: 'wss://relay.43-155-239-141.sslip.io/agent',
	hostname: 'home.43-155-239-141.sslip.io',
	gateKey: 'K7mQ2vT9pLxR4nW8sZbY3cHd',
	nodeBin: '/usr/local/bin/node',
	targetPort: 3080,
}

test('正常渲染：单元指名新单元，ExecStart 指向插件内的 agent', () => {
	const out = renderTunnel(base)
	const key = `~/.config/systemd/user/${UNIT_NAME}`
	const unit = out.files[key]
	assert.ok(unit, '应生成单元文件')
	assert.match(unit, /^Environment=RELAY_URL=wss:\/\/relay/m)
	assert.match(unit, /Environment=TUNNEL_HOSTNAMES=home\.43-155-239-141\.sslip\.io/)
	assert.match(unit, new RegExp(`ExecStart=/usr/local/bin/node ${AGENT_PATH.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))
	assert.match(unit, /CERT_SYNC_HOST=home\.43-155-239-141\.sslip\.io/)
	assert.equal(out.summary.provider, 'dsh-tunnel')
	assert.equal(out.summary.urls.gate, `https://home.43-155-239-141.sslip.io/?k=${base.gateKey}`)
	assert.doesNotMatch(unit, /@@[A-Z0-9_]+@@/, '不应残留占位符')
})

test('安装脚本内嵌单元正文，且写的是同一个单元名', () => {
	const out = renderTunnel(base)
	assert.match(out.install, new RegExp(`UNIT="\\$UNIT_DIR/${UNIT_NAME.replace(/\./g, '\\.')}"`))
	assert.match(out.install, /cat > "\$UNIT" <<'UNIT_EOF'/)
	assert.match(out.install, /systemctl --user enable --now/)
	assert.doesNotMatch(out.install, /@@[A-Z0-9_]+@@/)
})

test('单元名与旧链路不同：杜绝两台 agent 同时连中继', () => {
	assert.notEqual(UNIT_NAME, 'dsh-tunnel-agent.service')
})

test('拒绝缺失或非法的参数', () => {
	assert.throws(() => normalizeTunnelInput({ ...base, relayUrl: undefined }), /缺少.*RELAY_URL/)
	assert.throws(() => normalizeTunnelInput({ ...base, relayUrl: 'https://x/y' }), /协议必须是 ws\/wss/)
	assert.throws(() => normalizeTunnelInput({ ...base, hostname: 'not a domain' }), /不是合法域名/)
	assert.throws(() => normalizeTunnelInput({ ...base, gateKey: 'short' }), /长度 16~128/)
	assert.throws(() => normalizeTunnelInput({ ...base, nodeBin: 'node' }), /必须是绝对路径/)
	assert.throws(() => normalizeTunnelInput({ ...base, targetPort: 0 }), /不是合法端口/)
	assert.throws(() => normalizeTunnelInput({ ...base, consoleUrl: 'ftp://x' }), /必须是 http\(s\) 地址/)
})

test('默认值：端口 3080、certSyncHost 跟随 hostname', () => {
	const out = normalizeTunnelInput({ ...base, targetPort: undefined, certSyncHost: undefined })
	assert.equal(out.targetPort, 3080)
	assert.equal(out.certSyncHost, base.hostname)
})
