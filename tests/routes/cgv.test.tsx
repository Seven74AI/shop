/**
 * @vitest-environment jsdom
 *
 * Unit test for the CGV (Conditions Générales de Vente / Terms of Sale) route.
 * Verifies the page renders all 10 CGV sections.
 */
import { render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { describe, expect, test } from 'vitest'
import CgvRoute from '#app/routes/_marketing+/cgv.tsx'

describe('CGV route (/cgv)', () => {
	test('renders the CGV page title', () => {
		render(createElement(CgvRoute))
		expect(
			screen.getByRole('heading', { level: 1 }),
		).toBeTruthy()
	})

	test('renders all 10 CGV sections', () => {
		render(createElement(CgvRoute))

		// Each section is rendered as an <h2> with "N. section_title" format
		const headings = screen.getAllByRole('heading', { level: 2 })
		expect(headings).toHaveLength(10)

		// Verify each section heading is present
		headings.forEach((heading, index) => {
			expect(heading.textContent).toBe(
				`${index + 1}. marketing.cgv.section${index + 1}.title`,
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

	test('each section has a body paragraph', () => {
		render(createElement(CgvRoute))
		const sections = document.querySelectorAll('article section')
		expect(sections).toHaveLength(10)

		sections.forEach((section) => {
			const body = section.querySelector('p')
			expect(body).toBeTruthy()
		})
	})
})
