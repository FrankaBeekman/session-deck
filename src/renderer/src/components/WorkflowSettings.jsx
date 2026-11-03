import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import SkinFrame from './SkinFrame.jsx'

// The same rule main applies before saving.
import { isBranchName as isBranch } from '../../../main/composer-core.js'

const describe = (w) =>
  w.environments ? w.environments.map((e) => e.branch).filter(Boolean).join(' · ') || 'no environments yet' : 'whatever the project repo has checked out'

const newId = () => `custom-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

/**
 * Settings row: the default workflow, and a button to the editor. The editor
 * is its own dialog so Settings stays a list of short rows.
 */
export default function WorkflowSettings() {
  const [settings, setSettings] = useState(null)
  const [draft, setDraft] = useState([])
  const [editing, setEditing] = useState(false)
  const draftRef = useRef(draft)
  draftRef.current = draft

  useEffect(() => {
    window.deck.workflow().then((s) => {
      setSettings(s)
      setDraft(s.custom)
    })
  }, [])

  if (!settings) return null

  /**
   * Custom workflows are edited in a local draft and saved on blur, so a
   * half-typed row is not dropped as invalid while it is being typed. Main
   * drops whatever is still invalid; the draft keeps it to finish.
   */
  const save = async (patch = {}) => {
    const next = { defaultId: settings.defaultId, overrides: settings.overrides, custom: draftRef.current, ...patch }
    setSettings(await window.deck.setWorkflow(next))
  }

  const all = [...settings.workflows.filter((w) => w.preset), ...draft]
  const customCount = draft.length
  const projectCount = Object.keys(settings.overrides).length

  return (
    <div className="approw">
      <div className="applabel">
        Workflow
        <span>
          which branches are a project’s environments
          {customCount + projectCount > 0 &&
            ` · ${[customCount && `${customCount} custom`, projectCount && `${projectCount} project${projectCount === 1 ? '' : 's'} with their own`]
              .filter(Boolean)
              .join(', ')}`}
        </span>
      </div>
      <div className="wfrow">
        <select className="wfselect" value={settings.defaultId} onChange={(e) => save({ defaultId: e.target.value })} aria-label="Default workflow">
          {all.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <button className="closeb" type="button" onClick={() => setEditing(true)}>
          Edit workflows…
        </button>
      </div>
      {editing && (
        <WorkflowsDialog
          settings={settings}
          draft={draft}
          setDraft={(d) => {
            setDraft(d)
            draftRef.current = d
          }}
          save={save}
          onClose={async () => {
            await save()
            setEditing(false)
          }}
        />
      )}
    </div>
  )
}

function WorkflowsDialog({ settings, draft, setDraft, save, onClose }) {
  const presets = settings.workflows.filter((w) => w.preset)
  const all = [...presets, ...draft]
  const firstNew = useRef(null)
  const [focusId, setFocusId] = useState(null)

  // Esc closes this dialog only, not Settings underneath: capture runs before
  // the app's own Esc handler, and stopping it there keeps Settings open.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      e.stopImmediatePropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  useEffect(() => {
    if (focusId) firstNew.current?.focus()
  }, [focusId])

  const update = (id, fn) => setDraft(draft.map((w) => (w.id === id ? fn(w) : w)))
  const setEnv = (id, i, patch) => update(id, (w) => ({ ...w, environments: w.environments.map((e, j) => (j === i ? { ...e, ...patch } : e)) }))

  // Adding or removing saves straight away; typing saves on blur.
  const structural = (custom) => {
    setDraft(custom)
    save({ custom })
  }
  const add = (from) => {
    const id = newId()
    setFocusId(id)
    structural([
      ...draft,
      from
        ? { id, name: `${from.name} (copy)`, environments: (from.environments ?? []).map((e) => ({ ...e })) }
        : { id, name: 'New workflow', environments: [{ label: '', branch: '' }] }
    ])
  }

  // Portalled: inside Settings it would be clipped by that dialog's box.
  return createPortal(
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="picker settings wfdialog" role="dialog" aria-modal="true" aria-labelledby="wf-title">
        <SkinFrame kind="dialog" />
        <div className="fhead">
          <div>
            <div className="sname" id="wf-title">
              Workflows
            </div>
            <div className="pname">which branches are a project’s environments</div>
          </div>
          <button className="closeb" type="button" onClick={onClose}>
            Esc · close
          </button>
        </div>

        <div className="appbody">
          <h3 className="wfhead">Built in</h3>
          <ul className="wflist">
            {presets.map((w) => (
              <li key={w.id} className="wfitem">
                <div className="wfline">
                  <span className="wfname">{w.name}</span>
                  <span className="muted wfdesc">{describe(w)}</span>
                  <button className="closeb" type="button" onClick={() => add(w)} title="Make an editable copy">
                    Copy
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <h3 className="wfhead">
            Your workflows
            <button className="closeb" type="button" onClick={() => add(null)}>
              + New workflow
            </button>
          </h3>
          {draft.length === 0 && <p className="none none--flush">None yet. Start a new one, or copy a built-in one.</p>}
          <ul className="wflist">
            {draft.map((w) => (
              <li key={w.id} className="wfitem wfitem--custom">
                <div className="wfline">
                  <input
                    ref={w.id === focusId ? firstNew : null}
                    className="filter wfinput"
                    aria-label="Workflow name"
                    value={w.name}
                    onChange={(e) => update(w.id, (x) => ({ ...x, name: e.target.value }))}
                    onFocus={(e) => w.id === focusId && e.target.select()}
                    onBlur={() => save()}
                  />
                  <button
                    className="closeb"
                    type="button"
                    onClick={() => structural(draft.filter((x) => x.id !== w.id))}
                    title="Delete this workflow; projects using it go back to the default"
                  >
                    Delete
                  </button>
                </div>
                <div className="wfenvs">
                  {w.environments.length > 0 && (
                    <div className="wfenv wfenvhead" aria-hidden="true">
                      <span>Label</span>
                      <span>Project branch</span>
                    </div>
                  )}
                  {w.environments.map((env, i) => (
                    <div key={i} className="wfenv">
                      <input
                        className="filter wfinput"
                        placeholder="Test"
                        aria-label={`Environment ${i + 1} label`}
                        value={env.label}
                        onChange={(e) => setEnv(w.id, i, { label: e.target.value })}
                        onBlur={() => save()}
                      />
                      <input
                        className="filter wfinput"
                        placeholder="develop"
                        aria-label={`Environment ${i + 1} branch`}
                        aria-invalid={env.branch !== '' && !isBranch(env.branch)}
                        value={env.branch}
                        onChange={(e) => setEnv(w.id, i, { branch: e.target.value.trim() })}
                        onBlur={() => save()}
                      />
                      <button
                        className="closeb"
                        type="button"
                        aria-label={`Remove environment ${env.label || i + 1}`}
                        onClick={() => structural(draft.map((x) => (x.id === w.id ? { ...x, environments: x.environments.filter((_, j) => j !== i) } : x)))}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button
                    className="closeb wfadd"
                    type="button"
                    onClick={() => update(w.id, (x) => ({ ...x, environments: [...x.environments, { label: '', branch: '' }] }))}
                  >
                    + Environment
                  </button>
                </div>
              </li>
            ))}
          </ul>

          {Object.keys(settings.overrides).length > 0 && (
            <>
              <h3 className="wfhead">Projects with their own workflow</h3>
              <ul className="wflist">
                {Object.entries(settings.overrides).map(([key, id]) => {
                  const name = settings.projectNames?.[key] ?? key
                  return (
                    <li key={key} className="wfline wfproject">
                      <span className="wfname">{name}</span>
                      <span className="muted wfdesc">{all.find((w) => w.id === id)?.name ?? id}</span>
                      <button
                        className="closeb"
                        type="button"
                        aria-label={`Use the default workflow for ${name}`}
                        title="Use the default workflow"
                        onClick={() => {
                          const overrides = { ...settings.overrides }
                          delete overrides[key]
                          save({ overrides })
                        }}
                      >
                        ×
                      </button>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
          <p className="panelnote wfnote">A project picks its own workflow from the Composer dialog.</p>
        </div>
      </div>
    </div>,
    document.body
  )
}
