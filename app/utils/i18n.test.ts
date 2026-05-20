/**
 * @vitest-environment jsdom
 */
import { describe, expect, test } from 'vitest'

describe('i18n interpolation (t function)', () => {
  // Replicate the interpolate function from i18n.tsx for unit testing
  function interpolate(template: string, vars: Record<string, unknown>): string {
    return template.replace(/\{(\w+)\}/g, (_, key: string) => {
      return vars[key] !== undefined ? String(vars[key]) : `{${key}}`
    })
  }

  function createT(translations: Record<string, string>) {
    return (key: string, vars?: Record<string, unknown>): string => {
      const template = translations[key]
      if (!template) return key
      if (vars) return interpolate(template, vars)
      return template
    }
  }

  const translations: Record<string, string> = {
    welcome: 'Welcome, {name}!',
    cartCount: 'You have {count} items in your cart',
    noVars: 'This has no variables',
    greeting: 'Bonjour {name}',
    multivar: '{greeting}, {name}. You are {age} years old.',
  }

  const t = createT(translations)

  test('returns the translation key itself when no vars', () => {
    expect(t('noVars')).toBe('This has no variables')
  })

  test('interpolates a single variable', () => {
    expect(t('welcome', { name: 'Marie' })).toBe('Welcome, Marie!')
  })

  test('interpolates multiple variables', () => {
    expect(
      t('multivar', { greeting: 'Hello', name: 'Alice', age: 30 }),
    ).toBe('Hello, Alice. You are 30 years old.')
  })

  test('interpolates French greeting', () => {
    expect(t('greeting', { name: 'Marie' })).toBe('Bonjour Marie')
  })

  test('interpolates integer variable', () => {
    expect(t('cartCount', { count: 3 })).toBe('You have 3 items in your cart')
  })

  test('returns key as fallback when translation not found', () => {
    expect(t('nonexistent.key')).toBe('nonexistent.key')
  })

  test('returns key as fallback for missing translation with vars', () => {
    expect(t('nonexistent.key', { foo: 'bar' })).toBe('nonexistent.key')
  })

  test('leaves placeholder intact when variable is missing', () => {
    expect(t('welcome', {})).toBe('Welcome, {name}!')
  })

  test('handles undefined variable values', () => {
    expect(t('welcome', { name: undefined })).toBe('Welcome, {name}!')
  })

  test('handles multiple placeholders with some missing variables', () => {
    expect(t('multivar', { greeting: 'Hi' })).toBe('Hi, {name}. You are {age} years old.')
  })
})
