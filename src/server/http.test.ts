// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { clientIdentity, isCrossSitePost } from './http.js'

describe('clientIdentity', () => {
  it('uses a non-loopback peer, ignoring any forwarded header', () => {
    expect(clientIdentity('203.0.113.9', '10.0.0.1, 10.0.0.2')).toBe('203.0.113.9')
  })

  it.each([
    ['127.0.0.1'],
    ['127.1.2.3'],
    ['::1'],
    ['::ffff:127.0.0.1'],
  ])('falls back to the last forwarded hop, trimmed, for loopback peer %s', (peer) => {
    expect(clientIdentity(peer, 'spoofed, 198.51.100.7 ')).toBe('198.51.100.7')
  })

  it('falls back to the peer string when the header is missing', () => {
    expect(clientIdentity('127.0.0.1', undefined)).toBe('127.0.0.1')
  })

  it('falls back to the peer string when the header is empty', () => {
    expect(clientIdentity('127.0.0.1', '')).toBe('127.0.0.1')
  })

  it('falls back to the peer string when the header is all blank', () => {
    expect(clientIdentity('127.0.0.1', '  ')).toBe('127.0.0.1')
  })

  it('falls back to the peer string when the last hop trims to empty', () => {
    expect(clientIdentity('127.0.0.1', 'a, ')).toBe('127.0.0.1')
    expect(clientIdentity('127.0.0.1', ' , ')).toBe('127.0.0.1')
  })
})

describe('isCrossSitePost', () => {
  it('is never cross-site for a non-POST method', () => {
    const headers = { 'sec-fetch-site': 'cross-site', 'content-type': 'text/plain' }
    expect(isCrossSitePost('GET', headers)).toBe(false)
    expect(isCrossSitePost('OPTIONS', headers)).toBe(false)
  })

  it.each([['same-origin'], ['same-site']])('allows a Sec-Fetch-Site of %s', (site) => {
    expect(
      isCrossSitePost('POST', { 'sec-fetch-site': site, 'content-type': 'application/json' })
    ).toBe(false)
  })

  it('refuses a cross-site Sec-Fetch-Site', () => {
    expect(
      isCrossSitePost('POST', {
        'sec-fetch-site': 'cross-site',
        'content-type': 'application/json',
      })
    ).toBe(true)
  })

  it('refuses an empty Sec-Fetch-Site', () => {
    expect(
      isCrossSitePost('POST', { 'sec-fetch-site': '', 'content-type': 'application/json' })
    ).toBe(true)
  })

  it('allows an absent Sec-Fetch-Site', () => {
    expect(isCrossSitePost('POST', { 'content-type': 'application/json' })).toBe(false)
  })

  it('allows a declared application/json Content-Type', () => {
    expect(isCrossSitePost('POST', { 'content-type': 'application/json' })).toBe(false)
  })

  it('allows application/json with a charset parameter', () => {
    expect(isCrossSitePost('POST', { 'content-type': 'application/json; charset=utf-8' })).toBe(
      false
    )
  })

  it('allows application/json regardless of case', () => {
    expect(isCrossSitePost('POST', { 'content-type': 'Application/JSON' })).toBe(false)
  })

  it('refuses any other declared Content-Type', () => {
    expect(isCrossSitePost('POST', { 'content-type': 'text/plain' })).toBe(true)
  })

  it('refuses a Transfer-Encoding header when no Content-Type is declared', () => {
    expect(isCrossSitePost('POST', { 'transfer-encoding': 'chunked' })).toBe(true)
  })

  it('refuses a non-zero Content-Length when no Content-Type is declared', () => {
    expect(isCrossSitePost('POST', { 'content-length': '42' })).toBe(true)
  })

  it('allows a zero Content-Length when no Content-Type is declared', () => {
    expect(isCrossSitePost('POST', { 'content-length': '0' })).toBe(false)
  })

  it('allows a blank Content-Length when no Content-Type is declared', () => {
    expect(isCrossSitePost('POST', { 'content-length': ' ' })).toBe(false)
  })

  it('allows no Content-Length at all when no Content-Type is declared', () => {
    expect(isCrossSitePost('POST', {})).toBe(false)
  })
})
