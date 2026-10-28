import assert from 'node:assert/strict'
import { test } from 'node:test'

import { fill, normalizeInput, normalizeRelay, renderDeploy } from '../lib/deploy/render.js'

const base = {
	version: '0.1.0',
	user: 'yxw',
	home: '/home/yxw',
	virtualIp: '10.140.140.223',
	port: 8710,
	upstreamPort: 3080,
	accessKey: 'MwcufbMjggfe3b8wYm8Rxykm',
	networkSecret: 'abcdefghijklmnop1234',
	networkName: 'txcloud-easytier',
	relay: '110.40.229.62:14010',
}

test('fill 拒绝缺失的占位符', () => {
	assert.throws(() => fill('a @@X@@ b', {}), /未提供值/)
})

test('fill 拒绝残留占位符', () => {
	assert.throws(() => fill('a @@X@@', { X: '@@Y@@' }), /仍有未替换/)
})

test('fill 支持放行残留', () => {
	assert.equal(fill('a @@KEEP@@', {}, { allowLeftover: ['KEEP'] }), 'a @@KEEP@@')
})

test('host:port 中继展开为 tcp + udp', () => {
	assert.deepEqual(normalizeRelay('1.2.3.4:14010'), ['tcp://1.2.3.4:14010', 'udp://1.2.3.4:14010'])
})

test('显式 URL 列表原样保留', () => {
	assert.deepEqual(normalizeRelay('tcp://h:1;ws://h:2'), ['tcp://h:1', 'ws://h:2'])
})

test('非法虚拟 IP 被拒', () => {
	assert.throws(() => normalizeInput({ ...base, virtualIp: '10.0.0.999' }), /虚拟 IP/)
})

test('非法口令字符被拒', () => {
	assert.throws(() => normalizeInput({ ...base, accessKey: "a'b\"c1234567890123" }), /访问口令/)
})

test('端口越界被拒', () => {
	assert.throws(() => normalizeInput({ ...base, port: 70000 }), /反代端口/)
})

test('渲染产物不含未替换占位符', () => {
	const { files, install } = renderDeploy(base)
	for (const [path, content] of Object.entries(files)) {
		const leftovers = [...content.matchAll(/@@([A-Z0-9_]+)@@/g)].map((m) => m[1])
		assert.deepEqual(leftovers.filter((key) => key !== 'TCP_WHITELIST'), [], `${path} 残留占位符`)
	}
	assert.match(install, /DSH_REMOTE_OK/)
	assert.doesNotMatch(install, /@@USER@@/)
})

test('Caddyfile 含白名单、门禁与 healthz', () => {
	const { files } = renderDeploy(base)
	const caddy = files['~/.config/caddy/Caddyfile']
	assert.match(caddy, /remote_ip 127\.0\.0\.1 ::1 192\.168\.1\.0\/24 10\.140\.140\.223/)
	assert.match(caddy, /handle \/healthz/)
	assert.match(caddy, /query k=MwcufbMjggfe3b8wYm8Rxykm/)
	assert.match(caddy, /reverse_proxy 127\.0\.0\.1:3080/)
})

test('env 文件不含 unit 级密钥泄漏路径', () => {
	const { files } = renderDeploy(base)
	const env = files['/etc/easytier/dsh-remote.env']
	assert.match(env, /ET_SECRET='abcdefghijklmnop1234'/)
	const install = renderDeploy(base).install
	assert.match(install, /ENV_FILE="\$ETC_DIR\/easytier\/dsh-remote\.env"/)
	assert.match(install, /chmod 600 "\$ENV_FILE"/)
})

test('unit 只引用环境变量，不内联密钥', () => {
	const { files } = renderDeploy(base)
	const unit = files['/etc/systemd/system/easytier-dsh-remote.service']
	assert.doesNotMatch(unit, /abcdefghijklmnop1234/)
	assert.match(unit, /--network-secret "\$\{ET_SECRET\}"/)
	assert.match(unit, /--peers tcp:\/\/110\.40\.229\.62:14010/)
	assert.match(unit, /@@TCP_WHITELIST@@/)
})

test('summary 给出可直接点的两条 URL', () => {
	const { summary } = renderDeploy(base)
	assert.equal(summary.urls.mesh, 'http://10.140.140.223:8710/')
	assert.match(summary.gate, /\?k=MwcufbMjggfe3b8wYm8Rxykm$/)
})

test('脚本钉住 EasyTier 发布包的 sha256', () => {
	const { install } = renderDeploy(base)
	assert.match(install, /ET_SHA_X86_64='61b659ea/)
	assert.match(install, /ET_SHA_AARCH64='f533ec25/)
	assert.match(install, /sha256sum -c -/)
})

test('未收录的版本只跳过校验，不阻断部署', () => {
	const { install } = renderDeploy({ ...base, etVersion: '9.9.9' })
	assert.match(install, /ET_SHA_X86_64=''/)
	assert.match(install, /跳过校验/)
})

test('unit 显式指定 --dev-name，且写入 env 文件', () => {
	const { install, files } = renderDeploy(base)
	assert.match(install, /--dev-name "\$\{ET_DEV_NAME\}"/)
	assert.match(files['/etc/easytier/dsh-remote.env'], /ET_DEV_NAME='dshmesh0'/)
})

test('可自定义网卡名', () => {
	const { install } = renderDeploy({ ...base, devName: 'dshnet1' })
	assert.match(install, /ET_DEV_NAME='dshnet1'/)
})

test('非法网卡名被拒', () => {
	assert.throws(() => renderDeploy({ ...base, devName: 'Tun0' }), /TUN 网卡名/)
	assert.throws(() => renderDeploy({ ...base, devName: 't' }), /TUN 网卡名/)
})
