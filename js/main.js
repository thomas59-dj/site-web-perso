/* ==========================================================================
   Pixel & Code — main.js
   Navigation entre "pages" (console app), tiroir mobile, formulaire
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {

  const PAGE_TITLES = {
    dashboard: 'ACCUEIL',
    apropos: 'À PROPOS',
    services: 'SERVICES',
    methode: 'MÉTHODE',
    stack: 'STACK TECHNIQUE',
    projet: 'PROJETS REALISÉS',
    contact: 'CONTACT',
  };

  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  const burgerBtn = document.getElementById('burger-btn');
  const pageTitle = document.getElementById('page-title');
  const navItems = document.querySelectorAll('.nav-item[data-page]');
  const pageTriggers = document.querySelectorAll('[data-page]');
  const pages = document.querySelectorAll('.page');
  const pageContainer = document.querySelector('.page-container');

  /* ---------- Navigation entre pages ---------- */
  function goToPage(pageId) {
    pages.forEach((page) => {
      page.classList.toggle('active', page.id === `page-${pageId}`);
    });
    navItems.forEach((item) => {
      item.classList.toggle('active', item.dataset.page === pageId);
    });
    if (pageTitle && PAGE_TITLES[pageId]) {
      pageTitle.textContent = PAGE_TITLES[pageId];
    }
    if (pageContainer) pageContainer.scrollTop = 0;
    closeSidebar();
  }

  pageTriggers.forEach((el) => {
    el.addEventListener('click', (event) => {
      const pageId = el.dataset.page;
      if (!pageId) return;
      event.preventDefault();
      goToPage(pageId);
    });
  });

  /* ---------- Tiroir sidebar (mobile) ---------- */
  function openSidebar() {
    sidebar.classList.add('open');
    overlay.classList.add('visible');
    burgerBtn.setAttribute('aria-expanded', 'true');
  }
  function closeSidebar() {
    sidebar.classList.remove('open');
    overlay.classList.remove('visible');
    burgerBtn.setAttribute('aria-expanded', 'false');
  }
  burgerBtn.addEventListener('click', () => {
    sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
  });
  overlay.addEventListener('click', closeSidebar);

  /* ---------- Formulaire de contact ----------
     Envoie les données au backend Express (POST /api/contact).
     Le backend valide, sauvegarde et envoie un email si SMTP est configuré. */
  const form = document.getElementById('contact-form');
  const status = document.getElementById('form-status');
  const submitBtn = form ? form.querySelector('button[type="submit"]') : null;

  function setFormStatus(message, tone) {
    status.textContent = message;
    status.classList.remove('hidden', 'form-status-error', 'form-status-ok');
    status.classList.add(tone === 'error' ? 'form-status-error' : 'form-status-ok');
  }

  if (form) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }

      const payload = {
        name: form.name.value.trim(),
        email: form.email.value.trim(),
        'project-type': form['project-type'].value,
        'detail-level': form['detail-level'].value,
        message: form.message.value.trim(),
      };

      const originalLabel = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Envoi en cours…';

      try {
        const response = await fetch('/api/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const result = await response.json();

        if (!response.ok || !result.ok) {
          throw new Error(result.error || "L'envoi a échoué. Merci de réessayer.");
        }

        if (result.warning) {
          setFormStatus(`> ${result.warning}`, 'ok');
        } else {
          setFormStatus('> Message envoyé avec succès. Réponse sous 24h ouvrées.', 'ok');
        }
        form.reset();
      } catch (err) {
        setFormStatus(`> Erreur : ${err.message}`, 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalLabel;
      }
    });
  }

});
