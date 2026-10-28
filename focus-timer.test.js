import test from "node:test";
import assert from "node:assert/strict";
import { createFocusTimer } from "./focus-timer.js";

function clock() {
  let time = 100000;
  return {
    timer: createFocusTimer(25 * 60 * 1000, () => time),
    advance: (ms) => {
      time += ms;
    },
  };
}

test("delayed callbacks catch up to elapsed time rather than counting ticks", () => {
  const { timer, advance } = clock();
  assert.deepEqual(timer.read(), {
    seconds: 1500,
    running: false,
    completed: false,
  });
  timer.start();
  advance(5 * 60 * 1000 + 250);
  assert.deepEqual(timer.read(), {
    seconds: 1200,
    running: true,
    completed: false,
  });
  advance(750);
  assert.equal(timer.read().seconds, 1199);
});

test("pause retains fractional seconds and excludes paused time on resume", () => {
  const { timer, advance } = clock();
  timer.start();
  advance(400);
  assert.equal(timer.pause().seconds, 1500);
  advance(3600000);
  assert.equal(timer.read().seconds, 1500);
  timer.start();
  advance(600);
  assert.equal(timer.read().seconds, 1499);
  timer.start(); // Repeated start must not reset an active deadline.
  advance(1000);
  assert.equal(timer.read().seconds, 1498);
});

test("completion after background suspension fires once and remains at zero", () => {
  const { timer, advance } = clock();
  timer.start();
  advance(3600000);
  assert.deepEqual(timer.read(), {
    seconds: 0,
    running: false,
    completed: true,
  });
  assert.deepEqual(timer.read(), {
    seconds: 0,
    running: false,
    completed: false,
  });
  advance(1000);
  assert.equal(timer.pause().completed, false);
  assert.deepEqual(timer.start(), {
    seconds: 1500,
    running: true,
    completed: false,
  });
});

test("reset stops running and paused sessions without producing a completion", () => {
  const { timer, advance } = clock();
  for (const pause of [false, true]) {
    timer.start();
    advance(5000);
    if (pause) timer.pause();
    assert.deepEqual(timer.reset(), {
      seconds: 1500,
      running: false,
      completed: false,
    });
    advance(3600000);
    assert.deepEqual(timer.read(), {
      seconds: 1500,
      running: false,
      completed: false,
    });
  }
});

test("pausing at the deadline reports completion exactly once", () => {
  const { timer, advance } = clock();
  timer.start();
  advance(1500000);
  assert.deepEqual(timer.pause(), {
    seconds: 0,
    running: false,
    completed: true,
  });
  assert.equal(timer.read().completed, false);
});
