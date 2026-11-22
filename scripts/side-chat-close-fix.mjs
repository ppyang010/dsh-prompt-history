import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// 针对上游 1.2.2；仅删除挂载/切换会话时强制展开的 effect。
// HeaderAction、openSide 和 Sidebar 自身的标签页状态管理保持原样。
const automaticReopen = `  React.useEffect(() => {
    if (integrated && ownsSide) openBetterSidebarTab(props.sessionId)
  }, [integrated, ownsSide, props.sessionId])

`
export function fixSideChatAutoReopen(source) {
  if (source.split(automaticReopen).length !== 2) {
    throw new Error('Side Chat 自动展开代码与已验证的 1.2.2 不一致，停止打补丁')
  }
  return source.replace(automaticReopen, '')
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = process.argv[2]
  if (!root) throw new Error('用法：node scripts/side-chat-close-fix.mjs <干净的上游源码目录>')
  const manifestPath = resolve(root, 'package.json')
  const sourcePath = resolve(root, 'src/client.js')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  if (manifest.name !== 'dsh-side-chat' || manifest.version !== '1.2.2') throw new Error('只支持 Side Chat 1.2.2')
  const fixed = fixSideChatAutoReopen(await readFile(sourcePath, 'utf8'))
  await writeFile(sourcePath, fixed)
  manifest.version = '1.2.2-ph.1'
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
  console.log('已移除切换会话时强制展开；包版本为 1.2.2-ph.1，请继续测试、构建、打包。')
}
