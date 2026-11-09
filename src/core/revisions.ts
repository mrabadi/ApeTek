/** Keeps preview commits and export readers on the same completed source revision. */
export class RevisionRenderer<T> {
  private revision = 0;
  private pending: Promise<T> | null = null;
  constructor(private commit: (value: T) => void) {}
  update(render: () => Promise<T>): Promise<T> {
    const revision = ++this.revision;
    const task = render();
    this.pending = task;
    task.then(value => { if (revision === this.revision) this.commit(value); }).catch(() => {});
    return task;
  }
  async current(): Promise<T> {
    for (;;) {
      const pending = this.pending;
      if (!pending) throw new Error('No document has been rendered');
      try {
        const value = await pending;
        if (pending === this.pending) return value;
      } catch (error) {
        if (pending === this.pending) throw error;
      }
    }
  }
}
