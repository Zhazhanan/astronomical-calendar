;(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) {
    root.AstroEducation = root.AstroEducation || {};
    root.AstroEducation.TimeController = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
  const MAX_TICK_DELTA_MS = 1000;
  const DEFAULT_TIME_ZONE = 'Asia/Shanghai';
  const ALLOWED_SPEEDS = Object.freeze([1, 7, 30]);
  const DEFAULT_LOCATION = Object.freeze({
    name: '北京',
    latitudeDeg: 39.9042,
    longitudeDeg: 116.4074
  });

  function assertFinite(value, name) {
    if (!Number.isFinite(value)) {
      throw new TypeError(`${name} must be finite`);
    }
  }

  function assertTimeZone(value) {
    if (typeof value !== 'string' || value.length === 0) {
      throw new TypeError('timeZone must be a non-empty IANA timezone string');
    }
  }

  function cloneLocation(location) {
    if (!location || typeof location !== 'object' || Array.isArray(location)) {
      throw new TypeError('location must be an object');
    }
    return {
      name: location.name,
      latitudeDeg: location.latitudeDeg,
      longitudeDeg: location.longitudeDeg
    };
  }

  function freezeState(fields) {
    return Object.freeze({
      instantUtc: fields.instantUtc,
      timeZone: fields.timeZone,
      location: Object.freeze(cloneLocation(fields.location)),
      playing: fields.playing,
      daysPerSecond: fields.daysPerSecond
    });
  }

  function assertSpeed(value) {
    if (!ALLOWED_SPEEDS.includes(value)) {
      throw new RangeError('daysPerSecond must be one of 1, 7, or 30');
    }
  }

  function create(options) {
    const initial = options || {};
    const instantUtc = Object.prototype.hasOwnProperty.call(initial, 'instantUtc')
      ? initial.instantUtc
      : Date.now();
    const timeZone = Object.prototype.hasOwnProperty.call(initial, 'timeZone')
      ? initial.timeZone
      : DEFAULT_TIME_ZONE;
    const daysPerSecond = Object.prototype.hasOwnProperty.call(initial, 'daysPerSecond')
      ? initial.daysPerSecond
      : 1;
    const location = Object.prototype.hasOwnProperty.call(initial, 'location')
      ? initial.location
      : DEFAULT_LOCATION;
    const onListenerError = initial.onListenerError == null ? null : initial.onListenerError;
    assertFinite(instantUtc, 'instantUtc');
    assertTimeZone(timeZone);
    assertSpeed(daysPerSecond);
    if (onListenerError !== null && typeof onListenerError !== 'function') {
      throw new TypeError('onListenerError must be a function when provided');
    }

    let state = freezeState({ instantUtc, timeZone, location, playing: false, daysPerSecond });
    const listeners = new Set();
    const notificationQueue = [];
    let isNotifying = false;

    function reportListenerError(error, committedState) {
      if (!onListenerError) return;
      try {
        onListenerError(error, committedState);
      } catch (ignoredError) {
        // Error reporting must not interrupt the committed-state notification queue.
      }
    }

    function notifyQueuedStates() {
      if (isNotifying) return;
      isNotifying = true;
      while (notificationQueue.length > 0) {
        const committedState = notificationQueue.shift();
        const snapshot = Array.from(listeners);
        for (const listener of snapshot) {
          try {
            listener(committedState);
          } catch (error) {
            reportListenerError(error, committedState);
          }
        }
      }
      isNotifying = false;
    }

    function replace(changes) {
      const nextState = Object.assign({}, state, changes);
      assertFinite(nextState.instantUtc, 'instantUtc');
      state = freezeState(nextState);
      notificationQueue.push(state);
      notifyQueuedStates();
      return state;
    }

    return Object.freeze({
      getState: function () {
        return state;
      },
      subscribe: function (listener) {
        if (typeof listener !== 'function') throw new TypeError('listener must be a function');
        listeners.add(listener);
        let subscribed = true;
        return function unsubscribe() {
          if (!subscribed) return;
          subscribed = false;
          listeners.delete(listener);
        };
      },
      setInstant: function (nextInstantUtc) {
        assertFinite(nextInstantUtc, 'instantUtc');
        return replace({ instantUtc: nextInstantUtc });
      },
      setTimeZone: function (nextTimeZone) {
        assertTimeZone(nextTimeZone);
        return replace({ timeZone: nextTimeZone });
      },
      setLocation: function (nextLocation) {
        return replace({ location: cloneLocation(nextLocation) });
      },
      setDaysPerSecond: function (nextDaysPerSecond) {
        assertSpeed(nextDaysPerSecond);
        return replace({ daysPerSecond: nextDaysPerSecond });
      },
      stepDays: function (days) {
        assertFinite(days, 'days');
        return replace({ instantUtc: state.instantUtc + days * MILLISECONDS_PER_DAY });
      },
      play: function () {
        return replace({ playing: true });
      },
      pause: function () {
        return replace({ playing: false });
      },
      tick: function (realDeltaMs) {
        assertFinite(realDeltaMs, 'realDeltaMs');
        const clampedDeltaMs = Math.max(0, Math.min(MAX_TICK_DELTA_MS, realDeltaMs));
        const instantUtc = state.playing
          ? state.instantUtc + clampedDeltaMs * state.daysPerSecond * MILLISECONDS_PER_DAY / 1000
          : state.instantUtc;
        return replace({ instantUtc });
      }
    });
  }

  return Object.freeze({ create });
});
