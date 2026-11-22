/**
 * The settings-page section for dsh-prompt-history: grouped toggles for the two
 * composer completion sources, the clipboard behaviors and the session
 * navigation helpers, plus a bridge status line so a broken host link is
 * visible without opening the console.
 */
import { useEffect, useState, useSyncExternalStore } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { getPrefs, setPref, subscribePrefs, type CopyMode } from './prefs.ts'
import { SESSION_CAP_MAX, SESSION_CAP_MIN } from './historyRing.ts'
import type { PromptHistoryKey } from './locales.ts'
import { PLUGIN_VERSION } from './i18n.ts'
import { getActiveBridge, subscribeBridge } from './suggest.ts'
import { openSideChat } from './sideChat.tsx'

/** Copy-mode options in display order (keys resolve through the locale seat). */
const COPY_MODES: ReadonlyArray<{ value: CopyMode; label: PromptHistoryKey }> = [
  { value: 'toolbar', label: 'copyMode.toolbar' },
  { value: 'auto', label: 'copyMode.auto' },
]

/** Section entry: grouped preferences plus the prediction-bridge status. */
export function SettingsSection({ t }: PropsLocale<'dsh-prompt-history'>): JSX.Element {
  const prefs = useSyncExternalStore(subscribePrefs, getPrefs)
  const bridgeReady = useSyncExternalStore(subscribeBridge, () => getActiveBridge() !== null)
  const [capDraft, setCapDraft] = useState(String(prefs.sessionHistoryCap))
  useEffect(() => { setCapDraft(String(prefs.sessionHistoryCap)) }, [prefs.sessionHistoryCap])
  const commitCap = (): void => {
    setPref('sessionHistoryCap', Number(capDraft))
    setCapDraft(String(getPrefs().sessionHistoryCap))
  }
  return (
    <div className="dsh-ph-settings">
      <h4 className="dsh-ph-title">{t('settings.title')}（dsh-prompt-history v{PLUGIN_VERSION}）</h4>

      <p className="dsh-ph-group">{t('settings.groupInput')}</p>
      <label className="dsh-ph-row">
        <input
          type="checkbox"
          checked={prefs.contextSuggest}
          onChange={(e) => { setPref('contextSuggest', e.target.checked) }}
        />
        <span>{t('suggest.toggle')}</span>
      </label>
      <label className="dsh-ph-row">
        <input
          type="checkbox"
          checked={prefs.promptCompletion}
          onChange={(e) => { setPref('promptCompletion', e.target.checked) }}
        />
        <span>{t('completion.toggle')}</span>
      </label>
      <label className="dsh-ph-row">
        <input
          type="checkbox"
          checked={prefs.quoteComment}
          onChange={(e) => { setPref('quoteComment', e.target.checked) }}
        />
        <span>{t('quote.toggle')}</span>
      </label>
      <label className="dsh-ph-row">
        <input
          type="checkbox"
          checked={prefs.quoteYield}
          onChange={(e) => { setPref('quoteYield', e.target.checked) }}
        />
        <span>{t('quote.yieldToggle')}</span>
      </label>
      <label className="dsh-ph-row">
        <input
          type="checkbox"
          checked={prefs.promptEnhance}
          onChange={(e) => { setPref('promptEnhance', e.target.checked) }}
        />
        <span>{t('enhance.toggle')}</span>
      </label>
      <label className="dsh-ph-row">
        <input
          type="checkbox"
          checked={prefs.promptTemplates}
          onChange={(e) => { setPref('promptTemplates', e.target.checked) }}
        />
        <span>{t('tpl.toggle')}</span>
      </label>
      <label className="dsh-ph-row">
        <input
          type="checkbox"
          checked={prefs.aiCompletion}
          onChange={(e) => { setPref('aiCompletion', e.target.checked) }}
        />
        <span>{t('completion.aiToggle')}</span>
      </label>

      <p className="dsh-ph-group">{t('settings.groupClipboard')}</p>
      <label className="dsh-ph-row">
        <input
          type="checkbox"
          checked={prefs.nativeSelection}
          onChange={(e) => { setPref('nativeSelection', e.target.checked) }}
        />
        <span>{t('selection.native')}</span>
      </label>
      <p className="dsh-ph-note">{t('selection.note')}</p>
      <label className="dsh-ph-row">
        <input type="checkbox" checked={prefs.sideChatDomCompat}
          onChange={(e) => { setPref('sideChatDomCompat', e.target.checked) }} />
        <span>{t('selection.sideChatCompat')}</span>
      </label>
      {COPY_MODES.map((mode) => (
        <label className="dsh-ph-row" key={mode.value}>
          <input
            type="radio"
            name="dsh-ph-copy-mode"
            checked={prefs.copyMode === mode.value}
            onChange={() => { setPref('copyMode', mode.value) }}
          />
          <span>{t(mode.label)}</span>
        </label>
      ))}
      <label className="dsh-ph-row">
        <input
          type="checkbox"
          checked={prefs.rightClickPaste}
          onChange={(e) => { setPref('rightClickPaste', e.target.checked) }}
        />
        <span>{t('paste.toggle')}</span>
      </label>

      <p className="dsh-ph-group">{t('settings.groupNav')}</p>
      <label className="dsh-ph-row">
        <input
          type="checkbox"
          checked={prefs.globalHistory}
          onChange={(e) => { setPref('globalHistory', e.target.checked) }}
        />
        <span>{t('history.global')}</span>
      </label>
      <label className="dsh-ph-row">
        <span>{t('history.sessionCap')}</span>
        <input
          type="number"
          min={SESSION_CAP_MIN}
          max={SESSION_CAP_MAX}
          step={1}
          value={capDraft}
          onChange={(e) => { setCapDraft(e.target.value) }}
          onBlur={commitCap}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur() } }}
        />
      </label>

      <p className="dsh-ph-group">{t('sideChat.group')}</p>
      <label className="dsh-ph-row">
        <input
          type="checkbox"
          checked={prefs.sideChat}
          onChange={(e) => { setPref('sideChat', e.target.checked) }}
        />
        <span>{t('sideChat.toggle')}</span>
      </label>
      {prefs.sideChat && (
        <div className="dsh-ph-row">
          <button type="button" className="dsh-ph-button" onClick={() => { openSideChat() }}>
            {t('sideChat.open')}
          </button>
        </div>
      )}
      {prefs.sideChat && (
        <label className="dsh-ph-row">
          <input
            type="checkbox"
            checked={prefs.writeGuard}
            onChange={(e) => { setPref('writeGuard', e.target.checked) }}
          />
          <span>{t('sideChat.guardToggle')}</span>
        </label>
      )}
      <p className="dsh-ph-note">{t('sideChat.note')}</p>

      <p className="dsh-ph-note">{t('bridge.label')}：{bridgeReady ? t('bridge.on') : t('bridge.off')}</p>

      <p className="dsh-ph-note">{t('suggest.keys')}</p>
      <p className="dsh-ph-note">{t('settings.note')}</p>
    </div>
  )
}
