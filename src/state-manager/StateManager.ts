import Conf from 'conf';
import type { DatabaseState, State } from './StateManagerTypes.js';
import { DatabaseStateSchema, StateSchema } from './StateManagerSchemas.js';

export class StateManager {
  private config: Conf<State>;

  constructor() {
    this.config = new Conf<State>({
      projectName: 'mcp-db-adapter',
      defaults: {
        dbs: {}
      },
      serialize: (value) => {
        try {
          StateSchema.parse(value);
        } catch (error) {
          console.error('State validation failed:', error);
          throw new Error(`Invalid state structure: ${error}`);
        }
        return JSON.stringify(value, null, '\t');
      }
    });
  }

  setDatabase(key: string, value: DatabaseState) {
    const validatedValue = DatabaseStateSchema.parse(value);
    this.config.set(`dbs.${key}`, validatedValue);
  }

  getDatabase(key: string): DatabaseState | undefined {
    return this.config.get(`dbs.${key}`);
  }

  removeState(key: string) {
    this.config.delete(`dbs.${key}`);
  }

  getDatabaseNames(): string[] {
    const dbs = this.config.get('dbs', {});
    return Object.keys(dbs);
  }

  get state(): State {
    return this.config.store;
  }

  clearAll() {
    this.config.clear();
  }

  get configPath(): string {
    return this.config.path;
  }
}