import { describe, expect, it } from 'vitest';
import { digestDay, peopleList, weeklyDigestEmail } from '../email/templates.js';
import { isoWeek } from './digest.service.js';

describe('isoWeek', () => {
  it('names the ISO week, which Thursday decides the year of', () => {
    expect(isoWeek(new Date('2026-10-12T03:13:00Z'))).toBe('2026-W42');
    expect(isoWeek(new Date('2026-10-18T23:59:00Z'))).toBe('2026-W42');
    expect(isoWeek(new Date('2026-10-19T00:00:00Z'))).toBe('2026-W43');
    // 1 Jan 2027 is a Friday, so it belongs to the last week of 2026.
    expect(isoWeek(new Date('2027-01-01T12:00:00Z'))).toBe('2026-W53');
    expect(isoWeek(new Date('2027-01-04T12:00:00Z'))).toBe('2027-W01');
  });
});

describe('peopleList', () => {
  it('names up to three, and counts the rest', () => {
    expect(peopleList(['Ada'])).toBe('Ada');
    expect(peopleList(['Ada', 'Grace'])).toBe('Ada and Grace');
    expect(peopleList(['Ada', 'Grace', 'Lin'])).toBe('Ada, Grace and Lin');
    expect(peopleList(['Ada', 'Grace', 'Lin', 'Mo', 'Nia'])).toBe('Ada, Grace and 3 others');
    expect(peopleList([' '])).toBe('Someone');
  });
});

describe('digestDay', () => {
  it('reads a day as a weekday and date', () => {
    expect(digestDay('2026-10-09')).toBe('Friday 9 Oct');
  });
});

describe('weeklyDigestEmail', () => {
  const email = weeklyDigestEmail({
    boards: [
      {
        title: 'Road <map>',
        url: 'https://app.canvasflowapp.com/boards/b1',
        people: ['Ada', 'Grace'],
        lastDay: '2026-10-09',
      },
      {
        title: '',
        url: 'https://app.canvasflowapp.com/boards/b2',
        people: ['Lin'],
        lastDay: '2026-10-07',
      },
    ],
    more: 3,
    openUrl: 'https://canvasflowapp.com/open',
    unsubscribeUrl: 'https://canvasflowapp.com/unsubscribe?u=1&k=weeklyDigest&t=x',
  });

  it('counts every board that changed, listed or not', () => {
    expect(email.subject).toBe('Your week on CanvasFlow: 5 boards changed');
    expect(email.text).toContain('And 3 more boards changed.');
  });

  it('lists each board with who changed it and when, escaped', () => {
    expect(email.html).toContain('Road &lt;map&gt;');
    expect(email.html).not.toContain('<map>');
    expect(email.text).toContain('Ada and Grace made changes · last on Friday 9 Oct');
    expect(email.text).toContain('Untitled board');
    expect(email.html).toContain('https://app.canvasflowapp.com/boards/b1');
  });

  it('says why it came, and how to stop it', () => {
    expect(email.text).toContain('emails about the weekly digest are on');
    expect(email.html).toContain('k=weeklyDigest&amp;t=x');
  });
});
