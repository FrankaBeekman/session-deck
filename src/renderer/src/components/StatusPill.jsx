const LABELS = {
  starting: 'Starting',
  ready: 'Ready',
  working: 'Working',
  'needs-you': 'Needs you',
  done: 'Done',
  closed: 'Closed',
  resumable: 'Interrupted'
}

const CLASSES = {
  starting: 'p-idle',
  ready: 'p-idle',
  working: 'p-work',
  'needs-you': 'p-need',
  done: 'p-done',
  closed: 'p-idle',
  resumable: 'p-resume'
}

export default function StatusPill({ status }) {
  return <span className={`pill ${CLASSES[status] ?? 'p-idle'}`}>{LABELS[status] ?? status}</span>
}
