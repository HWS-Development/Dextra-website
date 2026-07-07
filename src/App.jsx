import { useEffect, useMemo, useState } from 'react'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom'
import AOS from 'aos'
import 'aos/dist/aos.css'
import './styles.css'

const pages = {
  '/': 'home',
  '/about': 'about',
  '/services': 'services',
  '/portfolio': 'portfolio',
  '/contact': 'contact',
}

const pageTitle = {
  home: 'Home - dextracommunication.com',
  about: 'About - dextracommunication.com',
  services: 'Services - dextracommunication.com',
  portfolio: 'Portfolio - dextracommunication.com',
  contact: 'Contact - dextracommunication.com',
}

const contactFormEndpoint = 'https://formspree.io/f/mwvdzlvq'

function normalizePath(pathname) {
  if (pathname === '/' || pathname === '') return '/'
  return pathname.replace(/\/index\.html$/, '').replace(/\/$/, '')
}

function normalizeUrl(value, page) {
  if (!value) return value
  if (value.startsWith('http') || value.startsWith('mailto:') || value.startsWith('tel:') || value.startsWith('#')) return value

  let next = value.split('?')[0]
  next = next.replace(/^\.\/\.\.\//, '/')
  next = next.replace(/^\.\//, page === 'home' ? '/' : `/${page}/`)
  next = next.replace(/\/\.\//g, '/')
  next = next.replace(/\/[^/]+\/\.\.\//g, '/')
  next = next.replace(/\/index\.html$/, '')
  next = next.replace(/\/index\.html#/, '#')
  next = next.replace(/^\/\//, '/')
  if (next === '') return '/'

  if (next.includes('wp-content') || next.includes('wp-includes') || next.includes('wp-admin')) {
    const marker = next.match(/\/(wp-content|wp-includes|wp-admin)\//)
    return marker ? next.slice(marker.index) : next
  }

  if (next === '/about' || next === '/services' || next === '/portfolio' || next === '/contact' || next === '/') return next
  if (next === '/contact/?simply_static_page=8141') return '/contact'
  return next
}

function normalizeSrcset(value, page) {
  if (!value) return value
  return value
    .split(',')
    .map((item) => {
      const parts = item.trim().split(/\s+/)
      parts[0] = normalizeUrl(parts[0], page)
      return parts.join(' ')
    })
    .join(', ')
}

function cleanDocument(html, page) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')

  doc.querySelectorAll('script, link[rel="EditURI"], link[rel="alternate"][type*="json"], link[rel="https://api.w.org/"]').forEach((node) => node.remove())

  doc.querySelectorAll('[onclick]').forEach((node) => node.removeAttribute('onclick'))

  doc.querySelector('#wpforms-1586-field_4-container')?.remove()

  doc.querySelectorAll('[href]').forEach((node) => {
    const href = node.getAttribute('href')
    const normalized = normalizeUrl(href, page)
    node.setAttribute('href', normalized)
  })

  doc.querySelectorAll('[src]').forEach((node) => {
    const src = node.getAttribute('src')
    node.setAttribute('src', normalizeUrl(src, page))
  })

  doc.querySelectorAll('[srcset]').forEach((node) => {
    node.setAttribute('srcset', normalizeSrcset(node.getAttribute('srcset'), page))
  })

  doc.querySelectorAll('a[href="/contact/?simply_static_page=8141"]').forEach((node) => node.setAttribute('href', '/contact'))

  const bodyClass = doc.body.getAttribute('class') || ''
  const headNodes = Array.from(doc.head.querySelectorAll('link[rel="stylesheet"], style'))
    .map((node) => {
      const clone = node.cloneNode(true)
      if (clone.tagName === 'LINK') {
        clone.setAttribute('href', normalizeUrl(clone.getAttribute('href'), page))
      }
      clone.setAttribute('data-replica-style', page)
      return clone.outerHTML
    })

  return {
    bodyClass,
    title: doc.title || pageTitle[page],
    styles: headNodes,
    body: doc.body.innerHTML,
  }
}

function injectStyles(styleHtml) {
  document.querySelectorAll('[data-replica-runtime-style]').forEach((node) => node.remove())

  const template = document.createElement('template')
  template.innerHTML = styleHtml.join('')
  Array.from(template.content.children).forEach((node) => {
    node.setAttribute('data-replica-runtime-style', 'true')
    document.head.appendChild(node)
  })
}

function wireContactForm(container) {
  const form = container.querySelector('#wpforms-form-1586')
  if (!form) return

  form.setAttribute('action', contactFormEndpoint)
  form.setAttribute('method', 'POST')
  if (form.dataset.replicaFormWired === 'true') return
  form.dataset.replicaFormWired = 'true'

  const submitButton = form.querySelector('[type="submit"]')
  const spinner = form.querySelector('.wpforms-submit-spinner')
  const status = document.createElement('p')
  status.className = 'replica-form-status'
  status.setAttribute('aria-live', 'polite')
  form.querySelector('.wpforms-submit-container')?.appendChild(status)

  form.addEventListener('submit', async (event) => {
    event.preventDefault()

    if (!form.reportValidity()) return

    const spamTrap = form.querySelector('#wpforms-1586-field_4')
    if (spamTrap?.value) {
      form.reset()
      status.className = 'replica-form-status replica-form-status-success'
      status.textContent = 'Merci, votre message a bien ete envoye.'
      return
    }

    const firstName = form.querySelector('#wpforms-1586-field_1')?.value.trim() || ''
    const lastName = form.querySelector('#wpforms-1586-field_1-last')?.value.trim() || ''
    const email = form.querySelector('#wpforms-1586-field_2')?.value.trim() || ''
    const message = form.querySelector('#wpforms-1586-field_3')?.value.trim() || ''
    const fullName = [firstName, lastName].filter(Boolean).join(' ')
    const payload = new FormData()

    payload.append('name', fullName)
    payload.append('first_name', firstName)
    payload.append('last_name', lastName)
    payload.append('email', email)
    payload.append('message', message)
    payload.append('_replyto', email)
    payload.append('_subject', 'New Dextra contact form message')

    submitButton?.setAttribute('disabled', 'disabled')
    spinner?.style.setProperty('display', 'inline-block')
    status.className = 'replica-form-status'
    status.textContent = 'Envoi en cours...'

    try {
      const response = await fetch(contactFormEndpoint, {
        method: 'POST',
        body: payload,
        headers: { Accept: 'application/json' },
      })

      if (!response.ok) throw new Error('Formspree rejected the submission')

      form.reset()
      status.className = 'replica-form-status replica-form-status-success'
      status.textContent = 'Merci, votre message a bien ete envoye.'
    } catch {
      status.className = 'replica-form-status replica-form-status-error'
      status.textContent = 'Le message n\'a pas pu etre envoye. Veuillez reessayer.'
    } finally {
      submitButton?.removeAttribute('disabled')
      spinner?.style.setProperty('display', 'none')
    }
  })
}

function wireRuntimeBehaviors(container) {
  container.querySelectorAll('a[href^="/"]').forEach((link) => {
    const href = link.getAttribute('href')
    const isAsset = href.startsWith('/wp-content') || href.startsWith('/wp-includes') || href.startsWith('/wp-admin') || href.startsWith('/original')
    const isRoute = href === '/' || href === '/about' || href === '/services' || href === '/portfolio' || href === '/contact'

    if (isAsset || !isRoute) return

    link.addEventListener('click', (event) => {
      event.preventDefault()
      if (window.location.pathname !== href) {
        window.history.pushState({}, '', href)
        window.dispatchEvent(new PopStateEvent('popstate'))
        window.scrollTo({ top: 0, behavior: 'instant' })
      }
    })
  })

  const toggles = container.querySelectorAll('.menu-toggle')
  toggles.forEach((toggle) => {
    toggle.addEventListener('click', () => {
      const header = toggle.closest('#ast-mobile-header')
      const content = header?.querySelector('.ast-mobile-header-content')
      const expanded = toggle.getAttribute('aria-expanded') === 'true'
      toggle.setAttribute('aria-expanded', String(!expanded))
      content?.classList.toggle('replica-menu-open', !expanded)
    })
  })

  const counters = container.querySelectorAll('.uagb-counter-block-number')
  const animateCounter = (node) => {
    if (node.dataset.replicaCounterAnimated === 'true') return

    node.dataset.replicaCounterAnimated = 'true'
    const target = Number(node.getAttribute('data-to-value') || node.textContent || 0)
    const duration = Number(node.getAttribute('data-duration') || 1.5) * 1000
    const delimiter = node.getAttribute('data-delimiter') || ''
    const start = performance.now()

    const formatNumber = (value) => {
      const rounded = Math.round(value)
      return delimiter ? rounded.toLocaleString() : String(rounded)
    }

    node.textContent = '0'

    const tick = (now) => {
      const elapsed = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - elapsed, 3)
      node.textContent = formatNumber(target * eased)
      if (elapsed < 1) requestAnimationFrame(tick)
    }

    requestAnimationFrame(tick)
  }

  counters.forEach((node) => {
    node.textContent = '0'
  })

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return
        animateCounter(entry.target)
        observer.unobserve(entry.target)
      })
    }, { threshold: 0.35 })

    counters.forEach((node) => observer.observe(node))
  } else {
    counters.forEach(animateCounter)
  }

  wireContactForm(container)

  container.querySelectorAll('form:not(#wpforms-form-1586)').forEach((form) => {
    form.addEventListener('submit', (event) => event.preventDefault())
  })

  AOS.refreshHard()
}

function ReplicaPage({ page }) {
  const [documentState, setDocumentState] = useState(null)
  const source = useMemo(() => `/original/${page}.html`, [page])

  useEffect(() => {
    let cancelled = false
    fetch(source)
      .then((response) => {
        if (!response.ok) throw new Error(`Failed to load ${source}`)
        return response.text()
      })
      .then((html) => {
        if (!cancelled) setDocumentState(cleanDocument(html, page))
      })
      .catch((error) => {
        if (!cancelled) setDocumentState({ title: 'Load error', bodyClass: '', styles: [], body: `<main class="replica-error">${error.message}</main>` })
      })
    return () => {
      cancelled = true
    }
  }, [page, source])

  useEffect(() => {
    if (!documentState) return undefined
    const previousClass = document.body.className
    document.title = documentState.title
    document.body.className = documentState.bodyClass
    injectStyles(documentState.styles)

    const timer = window.setTimeout(() => {
      const container = document.querySelector('.replica-page')
      if (container) wireRuntimeBehaviors(container)
    }, 0)

    return () => {
      window.clearTimeout(timer)
      document.body.className = previousClass
      document.querySelectorAll('[data-replica-runtime-style]').forEach((node) => node.remove())
    }
  }, [documentState])

  if (!documentState) return <div className="replica-loading">Loading…</div>

  return <div className="replica-page" dangerouslySetInnerHTML={{ __html: documentState.body }} />
}

function RouterPage() {
  const location = useLocation()
  const normalized = normalizePath(location.pathname)
  const page = pages[normalized] || 'home'
  return <ReplicaPage key={page} page={page} />
}

function App() {
  useEffect(() => {
    AOS.init({ once: true })
  }, [])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="*" element={<RouterPage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
