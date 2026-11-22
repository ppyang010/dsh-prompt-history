import { registerHooks } from 'node:module'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

// 仅供本地测试加载源码；不启动宿主、不改变发布构建。
registerHooks({
  load(url, context, nextLoad) {
    if (url.startsWith('file:') && /\.tsx?(?:\?|$)/u.test(url) && !url.includes('/node_modules/')) {
      const source = readFileSync(new URL(url), 'utf8')
      return {
        format: 'module', shortCircuit: true,
        source: ts.transpileModule(source, { compilerOptions: {
          target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
          jsx: ts.JsxEmit.ReactJSX,
        } }).outputText,
      }
    }
    return nextLoad(url, context)
  },
})
