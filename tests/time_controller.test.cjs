const test = require('node:test');
const assert = require('node:assert/strict');
const TimeController = require('../js/time-controller.js');

test('playback advances by configured simulated days per real second', () => {
  const clock = TimeController.create({ instantUtc: 0, daysPerSecond: 7 });
  clock.play();
  clock.tick(500);
  assert.equal(clock.getState().instantUtc, 3.5 * 86400000);
});

test('pause prevents tick movement and stepDays remains explicit', () => {
  const clock = TimeController.create({ instantUtc: 0 });
  clock.tick(1000);
  assert.equal(clock.getState().instantUtc, 0);
  clock.stepDays(-1);
  assert.equal(clock.getState().instantUtc, -86400000);
});

test('timezone change does not alter the absolute instant or location', () => {
  const clock = TimeController.create({ instantUtc: 1234, timeZone: 'Asia/Shanghai' });
  const before = clock.getState().location;
  clock.setTimeZone('America/Los_Angeles');
  assert.equal(clock.getState().instantUtc, 1234);
  assert.deepEqual(clock.getState().location, before);
});

test('location change does not alter the selected timezone', () => {
  const clock = TimeController.create({ instantUtc: 0, timeZone: 'Asia/Shanghai' });
  clock.setLocation({ name: '纽约', latitudeDeg: 40.7128, longitudeDeg: -74.006 });
  assert.equal(clock.getState().timeZone, 'Asia/Shanghai');
});

test('speed is limited to the three product choices', () => {
  const clock = TimeController.create({ instantUtc: 0 });
  assert.throws(() => clock.setDaysPerSecond(5), /1, 7, or 30/);
});

test('instant, day step, and tick delta must be finite', () => {
  const clock = TimeController.create({ instantUtc: 0 });
  assert.throws(() => TimeController.create({ instantUtc: Infinity }), /finite/);
  assert.throws(() => clock.setInstant(NaN), /finite/);
  assert.throws(() => clock.stepDays(Infinity), /finite/);
  assert.throws(() => clock.tick(NaN), /finite/);
});

test('tick clamps a backgrounded tab delta to one real second', () => {
  const clock = TimeController.create({ instantUtc: 0, daysPerSecond: 30 });
  clock.play();
  clock.tick(5000);
  assert.equal(clock.getState().instantUtc, 30 * 86400000);
  clock.tick(-1);
  assert.equal(clock.getState().instantUtc, 30 * 86400000);
});

test('state is replaced and frozen, including a cloned location', () => {
  const location = { name: '测试点', latitudeDeg: 1, longitudeDeg: 2 };
  const clock = TimeController.create({ instantUtc: 0, location });
  const first = clock.getState();
  location.latitudeDeg = 99;
  assert.equal(first.location.latitudeDeg, 1);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.location));
  clock.play();
  assert.notEqual(clock.getState(), first);
});

test('notification uses a listener snapshot and unsubscribe is idempotent', () => {
  const clock = TimeController.create({ instantUtc: 0 });
  const calls = [];
  let unsubscribeSecond;
  const unsubscribeFirst = clock.subscribe(() => {
    calls.push('first');
    unsubscribeSecond();
    clock.subscribe(() => calls.push('third'));
  });
  unsubscribeSecond = clock.subscribe(() => calls.push('second'));

  clock.play();
  assert.deepEqual(calls, ['first', 'second']);
  calls.length = 0;
  clock.pause();
  assert.deepEqual(calls, ['first', 'third']);
  unsubscribeFirst();
  unsubscribeFirst();
});

test('reentrant mutations are delivered in FIFO state order without recursive notification', () => {
  const clock = TimeController.create({ instantUtc: 0 });
  const firstListenerStates = [];
  const secondListenerStates = [];
  let changed = false;
  clock.subscribe((state) => {
    firstListenerStates.push([state.playing, state.instantUtc]);
    if (!changed) {
      changed = true;
      clock.setInstant(42);
    }
  });
  clock.subscribe((state) => secondListenerStates.push([state.playing, state.instantUtc]));

  clock.play();
  assert.deepEqual(firstListenerStates, [[true, 0], [true, 42]]);
  assert.deepEqual(secondListenerStates, [[true, 0], [true, 42]]);
  assert.equal(clock.getState().instantUtc, 42);
});

test('listener errors are reported without making a committed mutator fail', () => {
  const reported = [];
  const clock = TimeController.create({
    instantUtc: 0,
    onListenerError(error, committedState) {
      reported.push([error.message, committedState]);
    }
  });
  const calls = [];
  clock.subscribe(() => { throw new Error('listener failed'); });
  clock.subscribe((state) => calls.push(state.playing));

  assert.doesNotThrow(() => clock.play());
  assert.deepEqual(calls, [true]);
  assert.equal(reported.length, 1);
  assert.equal(reported[0][0], 'listener failed');
  assert.equal(reported[0][1].playing, true);
  assert.equal(clock.getState().playing, true);
});

test('errors thrown by the error reporter cannot break later queued notifications', () => {
  const clock = TimeController.create({
    instantUtc: 0,
    onListenerError() { throw new Error('reporting failed'); }
  });
  const states = [];
  let changed = false;
  clock.subscribe((state) => {
    if (!changed) {
      changed = true;
      clock.setInstant(42);
    }
    throw new Error('listener failed');
  });
  clock.subscribe((state) => states.push(state.instantUtc));

  assert.doesNotThrow(() => clock.play());
  assert.deepEqual(states, [0, 42]);
  assert.equal(clock.getState().playing, true);
});
