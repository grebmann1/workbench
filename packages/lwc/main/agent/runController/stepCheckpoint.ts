import type { ModelMessage } from 'ai';

/** The SDK supplies cumulative response snapshots, not messages unique to each step. */
export class StepCheckpoint {
    private committedCount = 0;
    takeNewMessages(snapshot: ModelMessage[]): ModelMessage[] {
        const delta = snapshot.slice(this.committedCount);
        this.committedCount = snapshot.length;
        return delta;
    }
}
