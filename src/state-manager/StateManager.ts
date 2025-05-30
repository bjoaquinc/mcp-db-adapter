import type { DatabaseState, State } from './StateManagerTypes.js';
import { DatabaseStateSchema } from './StateManagerSchemas.js';

export class StateManager {
  private state: State = {
    dbs: {},
  };

  setDatabase(key: string, value: DatabaseState) {
    this.state.dbs[key] = DatabaseStateSchema.parse(value);
  }

  getDatabase(key: string) {
    return this.state.dbs[key];
  }

  removeState(key: string) {
    delete this.state.dbs[key];
  }

  getDatabaseNames(): string[] {
    return Object.keys(this.state.dbs);
  }
}