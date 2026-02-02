import { beforeEach, describe, expect, it } from 'vitest';

import EventBus from '../../../client/core/event-bus.js';

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

