// 一个够用的行级 diff：LCS + 上下文行压缩。
// 只服务「与上次尝试的差」这种两版补丁之间的比较，不追求 git 级别的完备。

/** @param {string[]} a @param {string[]} b */
export function diffLines(a, b) {
  const n = a.length
  const m = b.length
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const out = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ type: 'ctx', text: a[i] })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ type: 'del', text: a[i] })
      i++
    } else {
      out.push({ type: 'add', text: b[j] })
      j++
    }
  }
  while (i < n) out.push({ type: 'del', text: a[i++] })
  while (j < m) out.push({ type: 'add', text: b[j++] })
  return out
}

/** 把 diff 结果折叠成「只保留变更前后 2 行」的显示行，便于手机阅读。 */
export function compact(lines, context = 2) {
  const keep = new Array(lines.length).fill(false)
  lines.forEach((l, i) => {
    if (l.type === 'ctx') return
    for (let k = Math.max(0, i - context); k <= Math.min(lines.length - 1, i + context); k++) keep[k] = true
  })
  const out = []
  let gap = 0
  lines.forEach((l, i) => {
    if (keep[i]) {
      if (gap) out.push({ type: 'gap', text: `… 折叠 ${gap} 行未变 …` })
      gap = 0
      out.push(l)
    } else {
      gap++
    }
  })
  if (gap) out.push({ type: 'gap', text: `… 折叠 ${gap} 行未变 …` })
  return out
}

export function countChanges(lines) {
  let add = 0
  let del = 0
  for (const l of lines) {
    if (l.type === 'add') add++
    else if (l.type === 'del') del++
  }
  return { add, del }
}

/** 生成原始 unified patch 文本，供「现场」页展示。 */
export function toPatchText(file, hunk) {
  const head = `--- a/${file}\n+++ b/${file}\n`
  return head + hunk.header + '\n' + hunk.lines.map((l) => {
    if (l.type === 'add') return '+' + l.text
    if (l.type === 'del') return '-' + l.text
    return ' ' + l.text
  }).join('\n')
}
