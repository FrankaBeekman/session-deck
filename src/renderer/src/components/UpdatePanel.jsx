import LightMarkdown from './LightMarkdown.jsx'
import SkinFrame from './SkinFrame.jsx'

const mb = (bytes) => `${Math.round(bytes / 1e6)} MB`

/**
 * Check, download and install a release from GitHub. The main process owns the
 * state; this only shows it and forwards the one next step.
 */
export default function UpdatePanel({ state, running, onClose }) {
  const { status, current, latest, notes, pageUrl, size, blocker, error, progress } = state
  const openPage = () => window.deck.openExternal(pageUrl)

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="picker updatepanel" role="dialog" aria-modal="true" aria-labelledby="update-title">
        <SkinFrame kind="dialog" />
        <div className="fhead">
          <div>
            <div className="sname" id="update-title">
              {latest && status !== 'none' ? `Session Deck ${latest}` : 'Updates'}
            </div>
            <div className="pname">you have {current}</div>
          </div>
          <button className="closeb" type="button" onClick={onClose}>
            Esc · close
          </button>
        </div>

        <div className="updatebody" aria-live="polite">
          {(status === 'idle' || status === 'checking') && <p>Checking for updates…</p>}

          {status === 'none' && <p>You have the latest version.</p>}

          {status === 'error' && (
            <>
              <p className="formerror">Could not check for updates: {error}</p>
              <p>
                <button className="newbtn" type="button" onClick={() => window.deck.checkForUpdate()}>
                  Try again
                </button>
              </p>
            </>
          )}

          {status === 'available' && (
            <>
              {blocker ? (
                <p>
                  {blocker} You can still download it from the release page.
                </p>
              ) : (
                <p>A new version is available.</p>
              )}
              {error && <p className="formerror">{error}</p>}
              <p className="updateactions">
                {!blocker && (
                  <button className="newbtn" type="button" onClick={() => window.deck.downloadUpdate()}>
                    {error ? 'Try again' : 'Download'}
                    {size ? ` (${mb(size)})` : ''}
                  </button>
                )}
                <button className="closeb" type="button" onClick={openPage}>
                  Release page ↗
                </button>
              </p>
            </>
          )}

          {status === 'downloading' && (
            <>
              <p>Downloading… {Math.round((progress ?? 0) * 100)}%</p>
              <progress className="updateprogress" max="1" value={progress ?? 0} aria-label="Download progress" />
            </>
          )}

          {status === 'ready' && (
            <>
              <p>
                Downloaded and checked. Session Deck quits, installs the update and opens
                again.
                {running > 0 &&
                  ` ${running} running session${running === 1 ? '' : 's'} will end — ${running === 1 ? 'it comes' : 'they come'} back ready to resume.`}
              </p>
              <p className="updateactions">
                <button className="newbtn" type="button" onClick={() => window.deck.installUpdate()}>
                  Restart and update
                </button>
              </p>
            </>
          )}

          {notes && status !== 'none' && latest && (
            <>
              <h4 className="listlabel">What’s new</h4>
              <LightMarkdown text={notes} className="updatenotes" />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
