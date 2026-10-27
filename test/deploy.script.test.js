import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir, userInfo } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { renderDeploy } from '../lib/deploy/render.js'
import { parseBackfill } from '../lib/state.js'

/**
 * 端到端演练：用假的 root/systemctl/ip/ss/curl 在临时目录里真跑一遍部署脚本。
 * 目的不是验证外部命令，而是验证脚本自身的控制流、文件写入与回填码格式。
 */

const USER = userInfo().username

function shim(dir, name, body) {
	const path = join(dir, name)
	writeFileSync(path, `#!/usr/bin/env bash\n${body}\n`)
	chmodSync(path, 0o755)
}

function makeSandbox() {
	const root = mkdtempSync(join(tmpdir(), 'panel-deploy-'))
	const dirs = {
		root,
		bin: join(root, 'shims'),
		etc: join(root, 'etc'),
		units: join(root, 'units'),
		install: join(root, 'install-bin'),
		home: join(root, 'home'),
		calls: join(root, 'calls.log'),
	}
	for (const key of ['bin', 'etc', 'units', 'install', 'home']) mkdirSync(dirs[key], { recursive: true })

	shim(dirs.bin, 'id', `if [ "\${1:-}" = "-u" ]; then
  if [ -n "\${2:-}" ]; then echo 1000; else echo 0; fi
elif [ "\${1:-}" = "-gn" ]; then
  /usr/bin/id -gn
else
  /usr/bin/id "$@"
fi`)

	shim(dirs.bin, 'systemctl', `echo "systemctl $*" >> "${dirs.calls}"\nexit 0`)
	shim(dirs.bin, 'loginctl', `echo "loginctl $*" >> "${dirs.calls}"\nexit 0`)
	shim(dirs.bin, 'runuser', `echo "runuser $*" >> "${dirs.calls}"\nshift 3\nexec "$@"`)
	shim(dirs.bin, 'ip', `echo "2: eth0    inet 10.140.140.223/24 brd 10.140.140.255 scope global eth0"`)
	shim(dirs.bin, 'ss', `echo "LISTEN 0 511 0.0.0.0:8710 0.0.0.0:*"`)
	shim(dirs.bin, 'curl', `printf '200'`)
	shim(dirs.bin, 'caddy', `echo "v2.10.0"`)
	shim(dirs.bin, 'easytier-core', `case "\${1:-}" in
  --version) echo "easytier-core 2.6.4" ;;
  --help) echo "--tcp-whitelist <port>" ;;
esac`)
	shim(dirs.bin, 'apt-get', `echo "apt-get $*" >> "${dirs.calls}"\nexit 0`)

	return dirs
}

function runScript(script, dirs) {
	const path = join(dirs.root, 'deploy.sh')
	writeFileSync(path, script)
	chmodSync(path, 0o755)
	return execFileSync('bash', [path], {
		encoding: 'utf8',
		env: {
			...process.env,
			PATH: `${dirs.bin}:${dirs.install}:${process.env.PATH}`,
			ETC_DIR: dirs.etc,
			UNIT_DIR: dirs.units,
			BIN_DIR: dirs.install,
		},
	})
}

const base = {
	version: '0.1.0',
	user: USER,
	virtualIp: '10.140.140.223',
	port: 8710,
	upstreamPort: 3080,
	accessKey: 'MwcufbMjggfe3b8wYm8Rxykm',
	networkSecret: 'abcdefghijklmnop1234',
	networkName: 'txcloud-easytier',
	relay: '110.40.229.62:14010',
}

test('部署脚本在沙箱里跑通并产出可解析的回填码', () => {
	const dirs = makeSandbox()
	try {
		const { install } = renderDeploy({ ...base, home: dirs.home })
		const stdout = runScript(install, dirs)

		assert.match(stdout, /部署完成/)

		const line = stdout.split('\n').find((row) => row.startsWith('DSH_REMOTE_OK '))
		assert.ok(line, '未打印回填码')
		const parsed = parseBackfill(line)
		assert.equal(parsed.port, 8710)
		assert.equal(parsed.ip, '10.140.140.223')
		assert.equal(parsed.accessKey, 'MwcufbMjggfe3b8wYm8Rxykm')

		const envFile = join(dirs.etc, 'easytier', 'dsh-remote.env')
		assert.ok(existsSync(envFile), '未写 env 文件')
		assert.equal(statSync(envFile).mode & 0o777, 0o600)

		const unit = readFileSync(join(dirs.units, 'easytier-dsh-remote.service'), 'utf8')
		assert.match(unit, /--peers tcp:\/\/110\.40\.229\.62:14010/)
		assert.match(unit, /--tcp-whitelist 8710/, 'TCP_WL 未被 sed 替换')
		assert.doesNotMatch(unit, /@@TCP_WHITELIST@@/)

		const caddy = readFileSync(join(dirs.home, '.config', 'caddy', 'Caddyfile'), 'utf8')
		assert.match(caddy, /reverse_proxy 127\.0\.0\.1:3080/)
		assert.ok(existsSync(join(dirs.home, '.config', 'systemd', 'user', 'dsh-proxy.service')))
	} finally {
		rmSync(dirs.root, { recursive: true, force: true })
	}
})

test('重复执行不报错且文件内容不变（幂等）', () => {
	const dirs = makeSandbox()
	try {
		const { install } = renderDeploy({ ...base, home: dirs.home })
		const first = runScript(install, dirs)
		const unitPath = join(dirs.units, 'easytier-dsh-remote.service')
		const before = readFileSync(unitPath, 'utf8')
		const second = runScript(install, dirs)
		const after = readFileSync(unitPath, 'utf8')

		assert.equal(before, after)
		assert.equal(
			first.split('\n').find((row) => row.startsWith('DSH_REMOTE_OK ')),
			second.split('\n').find((row) => row.startsWith('DSH_REMOTE_OK ')),
		)
	} finally {
		rmSync(dirs.root, { recursive: true, force: true })
	}
})

test('--uninstall 清掉单元与配置', () => {
	const dirs = makeSandbox()
	try {
		const { install } = renderDeploy({ ...base, home: dirs.home })
		runScript(install, dirs)

		const path = join(dirs.root, 'deploy.sh')
		execFileSync('bash', [path, '--uninstall'], {
			encoding: 'utf8',
			env: {
				...process.env,
				PATH: `${dirs.bin}:${dirs.install}:${process.env.PATH}`,
				ETC_DIR: dirs.etc,
				UNIT_DIR: dirs.units,
				BIN_DIR: dirs.install,
			},
		})

		assert.ok(!existsSync(join(dirs.units, 'easytier-dsh-remote.service')))
		assert.ok(!existsSync(join(dirs.etc, 'easytier', 'dsh-remote.env')))
		assert.ok(!existsSync(join(dirs.home, '.config', 'caddy')))
	} finally {
		rmSync(dirs.root, { recursive: true, force: true })
	}
})
