import { describe, expect, it } from 'vitest';
import { ALL_BUNDLED_PRESETS, BUNDLED_PRESETS, BUNDLED_STYLES, anglesPrompt, stylizePrompt, stylizeWording, visiblePresets } from './presets';

describe('presets', () => {
  it('ships the full camera set with unique ids', () => {
    expect(BUNDLED_PRESETS).toHaveLength(12);
    expect(new Set(ALL_BUNDLED_PRESETS.map((p) => p.id)).size).toBe(ALL_BUNDLED_PRESETS.length);
  });
  it('hides presets a model cannot use', () => {
    const imageOnly = { video: false, image: true, lipSync: false, firstLastFrame: false };
    const visible = visiblePresets(ALL_BUNDLED_PRESETS, imageOnly);
    expect(visible.every((p) => p.kind === 'style')).toBe(true);
    expect(visiblePresets(ALL_BUNDLED_PRESETS, { ...imageOnly, video: true }).some((p) => p.kind === 'camera')).toBe(true);
  });
  it('maps intensity to wording and builds the Angles and Stylize prompts', () => {
    const noir = BUNDLED_STYLES[0]!;
    expect(stylizeWording(noir, 0.1)).toMatch(/^a subtle hint of/);
    expect(stylizeWording(noir, 0.5)).toMatch(/^a clear/);
    expect(stylizeWording(noir, 0.9)).toMatch(/^a strong/);
    expect(stylizePrompt(noir, 0.5)).toContain('Keep the composition');
    expect(anglesPrompt('low angle looking up', 'Ada')).toContain('Only the camera position changes');
  });
});
