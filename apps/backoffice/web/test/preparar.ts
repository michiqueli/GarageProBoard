/** El router llama a `scrollTo` al navegar y jsdom no lo implementa. */
window.scrollTo = (() => {}) as typeof window.scrollTo
