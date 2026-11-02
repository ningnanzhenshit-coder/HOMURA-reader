import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyReaderGesture, readerTapZone } from '../src/services/readerGestures.js';

const gesture = overrides => classifyReaderGesture({ dx: 0, dy: 0, maxDistance: 0, duration: 120, width: 1000, x: 500, ...overrides });

test('左右各占 30%，中间 40% 与方向键对应', () => {
  assert.equal(readerTapZone(299, 1000), 'left');
  assert.equal(readerTapZone(300, 1000), 'center');
  assert.equal(readerTapZone(699, 1000), 'center');
  assert.equal(readerTapZone(700, 1000), 'right');
});

test('长按不移动不翻页，抖动和手指拖回原处不误判点击', () => {
  assert.equal(gesture({ duration: 300 }).type, 'cancel');
  assert.equal(gesture({ maxDistance: 8 }).type, 'cancel');
  assert.equal(gesture({ maxDistance: 100, dx: 0 }).type, 'cancel');
  assert.deepEqual(gesture({ x: 100 }), { type: 'tap', zone: 'left' });
});

test('快速甩动与长按后足量拖动可翻页，纵向移动不误翻', () => {
  assert.deepEqual(gesture({ dx: -60, maxDistance: 60, duration: 100 }), { type: 'swipe', zone: 'right' });
  assert.deepEqual(gesture({ dx: 200, maxDistance: 200, duration: 1000 }), { type: 'swipe', zone: 'left' });
  assert.equal(gesture({ dx: 5, dy: 200, maxDistance: 200 }).type, 'cancel');
  assert.equal(gesture({ dx: 20, maxDistance: 20, duration: 200 }).type, 'cancel');
});
