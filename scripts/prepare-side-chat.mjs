import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fixSideChatAutoReopen } from './side-chat-close-fix.mjs'
import { addSideChatClientApi } from './side-chat-client-api.mjs'

const root = process.argv[2]
if (!root) throw new Error('用法：node scripts/prepare-side-chat.mjs <干净的上游 1.2.2 源码目录>')
const manifestPath = resolve(root, 'package.json')
const sourcePath = resolve(root, 'src/client.js')
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
if (manifest.name !== 'dsh-side-chat' || manifest.version !== '1.2.2') throw new Error('只支持干净的 Side Chat 1.2.2')
const fixed = addSideChatClientApi(fixSideChatAutoReopen(await readFile(sourcePath, 'utf8')))
await writeFile(sourcePath, fixed)
manifest.version = '1.2.2-ph.2'
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
console.log('已应用关闭状态修复和客户端接口，版本 1.2.2-ph.2；请继续测试、构建、打包。')
