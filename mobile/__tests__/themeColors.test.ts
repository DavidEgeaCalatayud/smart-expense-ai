import { themedColor } from '../src/preferences/themeColors';

describe('mobile dark theme color resolver', () => {
  it('keeps the light palette unchanged when dark mode is disabled', () => {
    expect(themedColor('#f6f8f7', false, 'background')).toBe('#f6f8f7');
    expect(themedColor('#111827', false, 'foreground')).toBe('#111827');
  });

  it('darkens light application surfaces without darkening white foreground content', () => {
    expect(themedColor('#f6f8f7', true, 'background')).toBe('#0d1713');
    expect(themedColor('#ffffff', true, 'background')).toBe('#16231d');
    expect(themedColor('#ffffff', true, 'foreground')).toBe('#ffffff');
  });

  it('raises contrast for muted labels and semantic text colours', () => {
    expect(themedColor('#65716b', true, 'foreground')).toBe('#b7c5be');
    expect(themedColor('#125c47', true, 'foreground')).toBe('#82d9b4');
    expect(themedColor('#b42318', true, 'foreground')).toBe('#ff9b94');
    expect(themedColor('#8b6a24', true, 'foreground')).toBe('#e8c878');
  });

  it('maps light borders independently from text colours', () => {
    expect(themedColor('#e3eae6', true, 'border')).toBe('#31483d');
    expect(themedColor('#9ecbb9', true, 'border')).toBe('#4f8f78');
  });

  it('supports the old boolean background argument', () => {
    expect(themedColor('#fff', true, true)).toBe('#16231d');
    expect(themedColor('#111827', true, false)).toBe('#f4f7f5');
  });

  it('protects newly introduced near-white surfaces and very dark labels', () => {
    expect(themedColor('#fafcfa', true, 'background')).toBe('#16231d');
    expect(themedColor('#020a07', true, 'foreground')).toBe('#f4f7f5');
  });
});
