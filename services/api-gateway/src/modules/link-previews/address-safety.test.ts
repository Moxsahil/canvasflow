import { describe, expect, it } from 'vitest';
import { isPublicAddress, normalizePreviewUrl } from './address-safety.js';

describe('isPublicAddress', () => {
  it('allows addresses on the public internet', () => {
    for (const address of [
      '93.184.216.34',
      '1.1.1.1',
      '2606:4700:4700::1111',
      '::ffff:93.184.216.34',
    ]) {
      expect(isPublicAddress(address), address).toBe(true);
    }
  });

  it('refuses everything this server can reach that the internet cannot', () => {
    for (const address of [
      '127.0.0.1',
      '10.1.2.3',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
      '169.254.169.254',
      '100.64.0.1',
      '0.0.0.0',
      '224.0.0.1',
      '255.255.255.255',
      '198.18.0.1',
      '::',
      '::1',
      'fc00::1',
      'fd12:3456::1',
      'fe80::1',
      'ff02::1',
      '::ffff:127.0.0.1',
      '::ffff:7f00:1',
      '::ffff:169.254.169.254',
      '64:ff9b::a00:1',
      'not an address',
    ]) {
      expect(isPublicAddress(address), address).toBe(false);
    }
  });
});

describe('normalizePreviewUrl', () => {
  it('reads web links, without their fragment', () => {
    expect(normalizePreviewUrl('https://example.com/post#comments')?.href).toBe(
      'https://example.com/post',
    );
    expect(normalizePreviewUrl(' http://example.com:80/a ')?.href).toBe('http://example.com/a');
  });

  it('refuses links that could reach anywhere but a public site', () => {
    for (const value of [
      'ftp://example.com/file',
      'file:///etc/passwd',
      'javascript:alert(1)',
      'https://user:pass@example.com/',
      'https://example.com:8080/',
      'http://127.0.0.1/',
      'http://[::1]/',
      'http://2130706433/',
      'http://localhost/',
      'http://router/',
      'http://printer.local/',
      'http://metadata.google.internal/',
      `https://example.com/${'a'.repeat(3000)}`,
      'https://exa mple.com/',
      42,
      null,
    ]) {
      expect(normalizePreviewUrl(value), String(value)).toBeNull();
    }
  });
});
