/** Inertial collection lifecycle: one transition finishes before the next begins. */
export class CollectionCoordinator {
  constructor(now = () => Date.now()) {
    this.now = now
    this.sequence = 0
    this.queued = 0
    this.tail = Promise.resolve()
    this.state = { phase: 'idle', active: undefined, last: undefined }
  }

  snapshot() {
    return {
      phase: this.state.phase,
      queued: this.queued,
      ...(this.state.active === undefined ? {} : { active: { ...this.state.active } }),
      ...(this.state.last === undefined ? {} : { last: { ...this.state.last } }),
    }
  }

  run(input, operation) {
    const sequence = ++this.sequence
    const requestedAt = new Date(this.now()).toISOString()
    const id = `collection-${requestedAt.replace(/[-:.TZ]/g, '')}-${sequence}`
    this.queued += 1
    const task = this.tail.catch(() => {}).then(async () => {
      this.queued -= 1
      const startedAt = new Date(this.now()).toISOString()
      this.state = { ...this.state, phase: 'collecting', active: { id, sequence, requestedAt, startedAt, input } }
      try {
        const value = await operation({ id, sequence, requestedAt, startedAt })
        const finishedAt = new Date(this.now()).toISOString()
        this.state = {
          phase: 'idle', active: undefined,
          last: { id, sequence, requestedAt, startedAt, finishedAt, outcome: 'committed', input },
        }
        return { ...value, lifecycle: { ...this.state.last } }
      } catch (error) {
        const finishedAt = new Date(this.now()).toISOString()
        this.state = {
          phase: 'idle', active: undefined,
          last: { id, sequence, requestedAt, startedAt, finishedAt, outcome: 'failed', input, error: error.message },
        }
        throw error
      }
    })
    this.tail = task.catch(() => {})
    return task
  }
}
