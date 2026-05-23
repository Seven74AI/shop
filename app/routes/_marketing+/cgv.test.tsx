/**
 * @vitest-environment jsdom
 *
 * Unit test for the CGV (Conditions Générales de Vente / Terms of Sale) route.
 * Verifies the page renders all 10 CGV sections in both English and French.
 */
import { render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { describe, expect, test } from 'vitest'
import { TranslationProvider } from '#app/utils/i18n.tsx'
import CgvRoute from './cgv.tsx'

describe('CGV route (/cgv)', () => {
	test('renders the CGV page title (no TranslationProvider — key fallback)', () => {
		// Without TranslationProvider, useTranslation() returns key as-is
		render(createElement(CgvRoute))
		expect(
			screen.getByRole('heading', { level: 1 }),
		).toHaveTextContent('marketing.cgv.title')
	})

	test('renders all 10 CGV sections as level-2 headings', () => {
		render(createElement(CgvRoute))
		const headings = screen.getAllByRole('heading', { level: 2 })
		expect(headings).toHaveLength(10)

		headings.forEach((heading, index) => {
			const sectionNum = index + 1
			expect(heading.textContent).toBe(
				`${sectionNum}. marketing.cgv.section${sectionNum}.title`,
			)
		})
	})

	test('renders the last-updated note', () => {
		render(createElement(CgvRoute))
		expect(
			screen.getByText('marketing.cgv.lastUpdated'),
		).toBeTruthy()
	})

	test('renders CGV sections in an article element', () => {
		render(createElement(CgvRoute))
		const article = document.querySelector('article')
		expect(article).toBeTruthy()
	})

	test('each of the 10 sections has a body paragraph', () => {
		render(createElement(CgvRoute))
		const sections = document.querySelectorAll('article section')
		expect(sections).toHaveLength(10)

		sections.forEach((section) => {
			const body = section.querySelector('p')
			expect(body).toBeTruthy()
		})
	})
})

describe('CGV route with TranslationProvider (English)', () => {
	const enTranslations: Record<string, string> = {}
	for (let i = 1; i <= 10; i++) {
		enTranslations[`marketing.cgv.section${i}.title`] = `Section ${i} Title`
		enTranslations[`marketing.cgv.section${i}.body`] = `Section ${i} body text.`
	}
	enTranslations['marketing.cgv.title'] = 'Terms of Sale (CGV)'
	enTranslations['marketing.cgv.lastUpdated'] = 'Last updated: January 2026'

	test('renders translated title and sections', () => {
		render(
			createElement(TranslationProvider, {
				locale: 'en',
				translations: enTranslations,
				children: createElement(CgvRoute),
			}),
		)
		expect(
			screen.getByRole('heading', { level: 1 }),
		).toHaveTextContent('Terms of Sale (CGV)')

		const headings = screen.getAllByRole('heading', { level: 2 })
		expect(headings).toHaveLength(10)
		expect(headings[0]!.textContent).toBe('1. Section 1 Title')
		expect(headings[9]!.textContent).toBe('10. Section 10 Title')
	})

	test('renders last-updated text from translations', () => {
		render(
			createElement(TranslationProvider, {
				locale: 'en',
				translations: enTranslations,
				children: createElement(CgvRoute),
			}),
		)
		expect(
			screen.getByText('Last updated: January 2026'),
		).toBeTruthy()
	})
})

describe('CGV route with TranslationProvider (French)', () => {
	const frTranslations: Record<string, string> = {}
	for (let i = 1; i <= 10; i++) {
		frTranslations[`marketing.cgv.section${i}.title`] = `Titre de la section ${i}`
		frTranslations[`marketing.cgv.section${i}.body`] = `Texte de la section ${i}.`
	}
	frTranslations['marketing.cgv.title'] = 'Conditions Générales de Vente (CGV)'
	frTranslations['marketing.cgv.lastUpdated'] = 'Dernière mise à jour : Janvier 2026'

	test('renders French title and sections', () => {
		render(
			createElement(TranslationProvider, {
				locale: 'fr',
				translations: frTranslations,
				children: createElement(CgvRoute),
			}),
		)
		expect(
			screen.getByRole('heading', { level: 1 }),
		).toHaveTextContent('Conditions Générales de Vente (CGV)')

		const headings = screen.getAllByRole('heading', { level: 2 })
		expect(headings).toHaveLength(10)
		expect(headings[0]!.textContent).toBe('1. Titre de la section 1')
	})

	test('renders French last-updated text', () => {
		render(
			createElement(TranslationProvider, {
				locale: 'fr',
				translations: frTranslations,
				children: createElement(CgvRoute),
			}),
		)
		expect(
			screen.getByText('Dernière mise à jour : Janvier 2026'),
		).toBeTruthy()
	})
})
