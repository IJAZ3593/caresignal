import test from 'node:test';
import assert from 'node:assert/strict';
import {
  base64Int16ToFloat32,
  computeRmsLevel,
  float32ToInt16Base64,
} from './liveAudio';

test('float32ToInt16Base64 and base64Int16ToFloat32 round-trip PCM samples accurately', () => {
  const input = new Float32Array([-1.0, -0.5, 0, 0.5, 1.0]);
  const encoded = float32ToInt16Base64(input);
  assert.equal(typeof encoded, 'string');
  assert.ok(encoded.length > 0);

  const decoded = base64Int16ToFloat32(encoded);
  assert.equal(decoded.length, input.length);
  for (let i = 0; i < input.length; i += 1) {
    assert.ok(Math.abs(decoded[i] - input[i]) < 0.001, `Sample ${i} mismatch`);
  }
});

test('computeRmsLevel returns bounded RMS amplitude', () => {
  assert.equal(computeRmsLevel(new Float32Array([])), 0);
  assert.equal(computeRmsLevel(new Float32Array([0, 0, 0])), 0);
  const full = computeRmsLevel(new Float32Array([1, -1, 1, -1]));
  assert.equal(full, 1);
  const half = computeRmsLevel(new Float32Array([0.5, -0.5, 0.5, -0.5]));
  assert.ok(Math.abs(half - 0.5) < 0.0001);
});
