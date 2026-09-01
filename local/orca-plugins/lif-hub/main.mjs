// Worker side of LIF Hub. The panel cannot reach the worker, so all the
// launching happens through `lif-hub` typed into a terminal; this worker only
// turns agent events into desktop notifications so a finished session is seen.
export default function activate(orca) {
  orca.events.on('worktree.created', (payload) => {
    orca.log(`worktree created: ${payload.worktreeId} at ${payload.path}`)
  })

  orca.events.on('agent.status.changed', async (payload) => {
    const state = String(payload.state ?? '')
    if (state !== 'blocked' && state !== 'waiting' && state !== 'done') return
    await orca.host.call('notifications.show', {
      title: `Agent ${state}`,
      body: payload.worktreeId ?? 'unknown worktree'
    })
  })
}
