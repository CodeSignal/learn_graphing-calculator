import { beforeEach, describe, expect, it } from 'vitest';

import EventBus from '../../../client/core/event-bus.js';
import StateManager from '../../../client/core/state-manager.js';

function createStateManager(state) {
  return {
    get(path) {
      if (!path) return state;

      const keys = path.split('.');
      let current = state;

      for (const key of keys) {
        if (current === null || current === undefined) return undefined;
        current = current[key];
      }

      return current;
    }
  };
}

describe('EventBus parent path bubbling', () => {
  beforeEach(() => {
    EventBus.clear();
    EventBus.setDebug(false);
    EventBus.setStateManager(null);
  });

  it('publishes parent events with the current parent value', () => {
    const state = {
      parameters: {
        m: { value: 2, min: 0, max: 10, step: 1 }
      }
    };
    EventBus.setStateManager(createStateManager(state));

    const received = [];
    EventBus.subscribe('state:changed:parameters', (data) => {
      received.push(data);
    });
    EventBus.subscribe('state:changed:parameters.m', (data) => {
      received.push(data);
    });

    EventBus.publish('state:changed:parameters.m.value', {
      path: 'parameters.m.value',
      value: 2,
      oldValue: 1
    });

    expect(received).toHaveLength(2);

    const byPath = Object.fromEntries(received.map((data) => [data.path, data]));
    expect(byPath.parameters.value).toBe(state.parameters);
    expect(byPath.parameters.oldValue).toBeUndefined();
    expect(byPath['parameters.m'].value).toBe(state.parameters.m);
    expect(byPath['parameters.m'].oldValue).toBeUndefined();
  });

  it('does not bubble parent events without StateManager injection', () => {
    const received = [];
    EventBus.subscribe('state:changed:parameters', (data) => {
      received.push(data);
    });

    EventBus.publish('state:changed:parameters.m.value', {
      path: 'parameters.m.value',
      value: 2,
      oldValue: 1
    });

    expect(received).toHaveLength(0);
  });
});

describe('Single canonical signal for function edits', () => {
  beforeEach(() => {
    EventBus.clear();
    EventBus.setDebug(false);
    EventBus.setStateManager(StateManager);
    StateManager.initialize({ functions: [], graph: {} });
  });

  it('StateManager.set("functions", ...) fires state:changed:functions exactly once', () => {
    const calls = [];
    EventBus.subscribe('state:changed:functions', (data) => {
      calls.push(data);
    });

    const funcs = [{ id: '1', expression: 'x^2' }];
    StateManager.set('functions', funcs);

    expect(calls).toHaveLength(1);
    expect(calls[0].path).toBe('functions');
    expect(calls[0].value).toBe(funcs);
  });

  it('no expression:updated event exists after cleanup', () => {
    const calls = [];
    EventBus.subscribe('expression:updated', (data) => {
      calls.push(data);
    });

    StateManager.set('functions', [{ id: '1', expression: 'x+1' }]);

    expect(calls).toHaveLength(0);
  });
});

