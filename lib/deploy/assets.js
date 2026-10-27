/**
 * EasyTier 发布包的 sha256 清单。
 *
 * 官方 release 没有提供校验文件，这份清单是首次发布时逐个下载、本地计算后钉死的。
 * 升级版本时：下载新的两个架构的包 → sha256sum → 更新这里 → 跑一遍渲染测试。
 */

/** @type {Record<string, Record<string, string>>} */
export const EASYTIER_ASSETS = {
	'2.6.4': {
		x86_64: '61b659eaedba658fa66fe47d17e1426cdd77e5d02fa15fed447bb4357c09dfd6',
		aarch64: 'f533ec25a7ea714e09f645615012200278058525795cc3bb690ff011aec1a70f',
	},
}

/**
 * @param {string} version
 * @param {'x86_64'|'aarch64'} arch
 * @returns {string} 空串表示尚未收录
 */
export function shaFor(version, arch) {
	return EASYTIER_ASSETS[version]?.[arch] ?? ''
}

/** 已知版本列表，供向导提示。 */
export function knownVersions() {
	return Object.keys(EASYTIER_ASSETS)
}
