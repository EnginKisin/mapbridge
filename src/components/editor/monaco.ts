import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api'
import 'monaco-editor/esm/vs/editor/contrib/find/browser/findController'
import 'monaco-editor/esm/vs/editor/contrib/folding/browser/folding'
import 'monaco-editor/esm/vs/editor/contrib/clipboard/browser/clipboard'
import 'monaco-editor/esm/vs/editor/contrib/bracketMatching/browser/bracketMatching'
import 'monaco-editor/esm/vs/editor/contrib/hover/browser/hoverContribution'
import 'monaco-editor/esm/vs/editor/contrib/indentation/browser/indentation'
import 'monaco-editor/esm/vs/editor/contrib/contextmenu/browser/contextmenu'
import 'monaco-editor/esm/vs/editor/contrib/wordOperations/browser/wordOperations'
import 'monaco-editor/esm/vs/editor/contrib/linesOperations/browser/linesOperations'
import 'monaco-editor/esm/vs/editor/contrib/multicursor/browser/multicursor'
import 'monaco-editor/esm/vs/basic-languages/xml/xml.contribution'
import 'monaco-editor/esm/vs/basic-languages/sql/sql.contribution'
import 'monaco-editor/esm/vs/language/json/monaco.contribution'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'

self.MonacoEnvironment = { getWorker: (_moduleId, label) => label === 'json' ? new JsonWorker() : new EditorWorker() }
monaco.languages.json.jsonDefaults.setDiagnosticsOptions({ validate: false, enableSchemaRequest: false })
monaco.editor.defineTheme('maptelabridge-dark', {
  base: 'vs-dark', inherit: true, rules: [
    { token: 'string.key.json', foreground: '9AC9F0' }, { token: 'string.value.json', foreground: 'B4D99A' },
    { token: 'number', foreground: 'D5B689' }, { token: 'tag', foreground: '8FB9E0' },
    { token: 'delimiter.xml', foreground: '7E95AA' },
  ],
  colors: { 'editor.background': '#141a22', 'editor.foreground': '#c9d3df', 'editorLineNumber.foreground': '#4f6073', 'editorLineNumber.activeForeground': '#a6b7ca', 'editor.lineHighlightBackground': '#1b2430', 'editor.selectionBackground': '#30435a', 'editorCursor.foreground': '#b8ed78', 'editorIndentGuide.background1': '#25303d', 'editorGutter.background': '#141a22', 'editorWidget.background': '#202a36' },
})
monaco.editor.defineTheme('maptelabridge-light', {
  base: 'vs', inherit: true, rules: [],
  colors: { 'editor.background': '#ffffff', 'editor.lineHighlightBackground': '#f2f5f8', 'editorLineNumber.foreground': '#93a1af', 'editorIndentGuide.background1': '#e5eaf0', 'editorGutter.background': '#ffffff' },
})
loader.config({ monaco })
export { monaco }
