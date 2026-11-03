import { describe, expect, it } from 'vitest';
import { BREAKPOINT, BREAKPOINT_WIDTHS, getBreakpoint, isPhoneCanvas } from './breakpoints';

describe('getBreakpoint', () => {
  it('puts a width on the rung whose upper threshold it is under', () => {
    expect(getBreakpoint(380)).toBe(BREAKPOINT.ZERO);
    expect(getBreakpoint(400)).toBe(BREAKPOINT.MOBILE_XXS);
    expect(getBreakpoint(450)).toBe(BREAKPOINT.MOBILE_XS);
    expect(getBreakpoint(500)).toBe(BREAKPOINT.MOBILE_SM);
    expect(getBreakpoint(600)).toBe(BREAKPOINT.MOBILE);
    expect(getBreakpoint(700)).toBe(BREAKPOINT.TABLET_SM);
    expect(getBreakpoint(900)).toBe(BREAKPOINT.TABLET);
    expect(getBreakpoint(1400)).toBe(BREAKPOINT.DESKTOP);
  });

  it('reads each threshold as the top of its own rung, not the bottom of the next', () => {
    // Off by one here and every panel changes shape a pixel early.
    BREAKPOINT_WIDTHS.slice(1).forEach((threshold, index) => {
      expect(getBreakpoint(threshold)).toBe(index);
      expect(getBreakpoint(threshold + 1)).toBe(index + 1);
    });
  });

  it('assumes the widest until the canvas has been measured', () => {
    expect(getBreakpoint(0)).toBe(BREAKPOINT.DESKTOP);
  });
});

describe('isPhoneCanvas', () => {
  it('lays out phones held upright as phones', () => {
    expect(isPhoneCanvas(375, 667)).toBe(true);
    expect(isPhoneCanvas(393, 716)).toBe(true);
    expect(isPhoneCanvas(599, 900)).toBe(true);
  });

  it('lays out a phone on its side as a phone', () => {
    expect(isPhoneCanvas(852, 353)).toBe(true);
    expect(isPhoneCanvas(932, 390)).toBe(true);
  });

  it('leaves tablets and computers alone', () => {
    expect(isPhoneCanvas(600, 900)).toBe(false);
    expect(isPhoneCanvas(834, 1120)).toBe(false);
    expect(isPhoneCanvas(1194, 760)).toBe(false);
    expect(isPhoneCanvas(1440, 820)).toBe(false);
    // A short but wide desktop window is still a desktop.
    expect(isPhoneCanvas(1200, 480)).toBe(false);
  });

  it('is not a phone until the canvas has been measured', () => {
    expect(isPhoneCanvas(0, 0)).toBe(false);
  });
});
