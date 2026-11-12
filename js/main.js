(function () {
  'use strict';

  /* =========================================================
     Config
     ========================================================= */
  var CONFIG = {
    // Emails are delivered directly to this inbox via FormSubmit (no backend needed).
    // NOTE: the very first submission triggers a one-time activation email to this address.
    recipient: 'info@platform.events',
    endpoint: 'https://formsubmit.co/ajax/info@platform.events',
    requestTimeout: 15000,
    languages: ['uk', 'es', 'en'],
    defaultLang: 'uk',
    langCodes: { uk: 'UA', es: 'ES', en: 'EN' },
    storageKey: 'vf-lang'
  };

  var dict = window.I18N || {};
  var currentLang = CONFIG.defaultLang;

  function t(key) {
    var table = dict[currentLang] || {};
    if (Object.prototype.hasOwnProperty.call(table, key)) return table[key];
    var fallback = dict[CONFIG.defaultLang] || {};
    return Object.prototype.hasOwnProperty.call(fallback, key) ? fallback[key] : key;
  }

  function safeStorage(method, key, value) {
    try {
      return method === 'get' ? window.localStorage.getItem(key) : window.localStorage.setItem(key, value);
    } catch (e) {
      return null;
    }
  }

  /* =========================================================
     i18n
     ========================================================= */
  function detectLang() {
    var fromUrl = new URLSearchParams(window.location.search).get('lang');
    if (fromUrl && CONFIG.languages.indexOf(fromUrl) !== -1) return fromUrl;

    var saved = safeStorage('get', CONFIG.storageKey);
    if (saved && CONFIG.languages.indexOf(saved) !== -1) return saved;

    var browser = (navigator.languages || [navigator.language || '']);
    for (var i = 0; i < browser.length; i++) {
      var code = String(browser[i]).toLowerCase().slice(0, 2);
      if (code === 'ua') code = 'uk';
      if (CONFIG.languages.indexOf(code) !== -1) return code;
    }
    return CONFIG.defaultLang;
  }

  function applyLang(lang) {
    if (CONFIG.languages.indexOf(lang) === -1) lang = CONFIG.defaultLang;
    currentLang = lang;

    document.documentElement.lang = lang;
    document.title = t('meta.title');
    var metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute('content', t('meta.description'));

    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    document.querySelectorAll('[data-i18n-html]').forEach(function (el) {
      el.innerHTML = t(el.getAttribute('data-i18n-html')); // trusted strings from i18n.js only
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
      el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
    });
    document.querySelectorAll('[data-i18n-aria]').forEach(function (el) {
      el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria')));
    });

    var current = document.querySelector('[data-lang-current]');
    if (current) current.textContent = CONFIG.langCodes[lang];
    document.querySelectorAll('[data-lang]').forEach(function (btn) {
      btn.setAttribute('aria-selected', String(btn.getAttribute('data-lang') === lang));
    });

    safeStorage('set', CONFIG.storageKey, lang);

    // re-translate visible validation errors
    if (formApi) formApi.refreshErrors();
  }

  function initLangSwitcher() {
    var root = document.querySelector('[data-lang-switcher]');
    if (!root) return;
    var toggle = root.querySelector('[data-lang-toggle]');
    var list = root.querySelector('[data-lang-list]');

    function open() {
      list.hidden = false;
      toggle.setAttribute('aria-expanded', 'true');
      var active = list.querySelector('[aria-selected="true"]') || list.querySelector('[data-lang]');
      if (active) active.focus();
    }
    function close(focusToggle) {
      list.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
      if (focusToggle) toggle.focus();
    }

    toggle.addEventListener('click', function () {
      list.hidden ? open() : close();
    });

    list.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-lang]');
      if (!btn) return;
      applyLang(btn.getAttribute('data-lang'));
      close(true);
    });

    list.addEventListener('keydown', function (e) {
      var items = Array.prototype.slice.call(list.querySelectorAll('[data-lang]'));
      var idx = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); items[(idx + 1) % items.length].focus(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); items[(idx - 1 + items.length) % items.length].focus(); }
    });

    document.addEventListener('click', function (e) {
      if (!root.contains(e.target)) close();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !list.hidden) close(true);
    });
  }

  /* =========================================================
     Mobile menu
     ========================================================= */
  function initMenu() {
    var burger = document.querySelector('[data-burger]');
    var nav = document.getElementById('nav');
    if (!burger || !nav) return;

    function setOpen(state) {
      burger.setAttribute('aria-expanded', String(state));
      nav.classList.toggle('is-open', state);
    }

    burger.addEventListener('click', function () {
      setOpen(burger.getAttribute('aria-expanded') !== 'true');
    });
    nav.addEventListener('click', function (e) {
      if (e.target.closest('a')) setOpen(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('is-open')) { setOpen(false); burger.focus(); }
    });
    window.matchMedia('(min-width: 1024px)').addEventListener('change', function (mq) {
      if (mq.matches) setOpen(false);
    });
  }

  /* =========================================================
     Popups
     ========================================================= */
  var popups = (function () {
    var active = null;
    var lastFocus = null;
    var FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    function trap(e) {
      if (!active) return;
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key !== 'Tab') return;
      var items = Array.prototype.filter.call(active.querySelectorAll(FOCUSABLE), function (el) {
        return el.offsetParent !== null;
      });
      if (!items.length) return;
      var first = items[0];
      var last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }

    function open(id) {
      var popup = document.getElementById(id);
      if (!popup) return;
      if (active) close(true);
      lastFocus = document.activeElement;
      active = popup;
      popup.hidden = false;
      document.body.classList.add('is-locked');
      document.addEventListener('keydown', trap);
      var target = popup.querySelector('.popup__actions .btn') || popup.querySelector('.popup__window');
      window.requestAnimationFrame(function () { target.focus(); });
    }

    function close(silent) {
      if (!active) return;
      active.hidden = true;
      active = null;
      document.body.classList.remove('is-locked');
      document.removeEventListener('keydown', trap);
      if (!silent && lastFocus && document.contains(lastFocus)) lastFocus.focus();
    }

    document.addEventListener('click', function (e) {
      if (!active) return;
      if (e.target.closest('[data-popup-close]')) { close(); return; }
      var home = e.target.closest('[data-popup-home]');
      if (home) {
        e.preventDefault();
        close(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        history.replaceState(null, '', window.location.pathname + window.location.search);
        var logo = document.querySelector('.header__logo');
        if (logo) logo.focus({ preventScroll: true });
      }
    });

    return { open: open, close: close };
  })();

  /* =========================================================
     Form
     ========================================================= */
  var formApi = null;

  function initForm() {
    var form = document.querySelector('[data-form]');
    if (!form) return;

    var submitBtn = form.querySelector('[data-submit]');
    var submitLabel = submitBtn.querySelector('.btn__label');
    var retryBtn = document.querySelector('[data-popup-retry]');
    var EMAIL_RE = /^[^\s@"'<>(),;:\\[\]]+@[^\s@"'<>(),;:\\[\]]+\.[a-z¡-￿]{2,}$/i;
    var isSending = false;
    var submitted = false;
    var errors = {}; // fieldName -> i18n key

    var fields = {
      name: form.elements.name,
      email: form.elements.email,
      message: form.elements.message
    };

    function clean(value) {
      return String(value || '').replace(/\s+/g, ' ').trim();
    }

    function validateField(name) {
      var value = name === 'message' ? String(fields.message.value || '').trim() : clean(fields[name].value);
      var key = '';

      if (name === 'name') {
        if (!value) key = 'validation.name.required';
        else if (value.length < 2) key = 'validation.name.short';
        else if (value.length > 100) key = 'validation.name.long';
      }
      if (name === 'email') {
        if (!value) key = 'validation.email.required';
        else if (value.length > 254 || !EMAIL_RE.test(value) || value.indexOf('..') !== -1) key = 'validation.email.invalid';
      }
      if (name === 'message') {
        if (value.length > 2000) key = 'validation.message.long';
      }

      setError(name, key);
      return !key;
    }

    function setError(name, key) {
      var input = fields[name];
      var wrap = input.closest('.field');
      var errorEl = wrap.querySelector('.field__error');
      if (key) {
        errors[name] = key;
        wrap.classList.add('field--invalid');
        input.setAttribute('aria-invalid', 'true');
        errorEl.textContent = t(key);
      } else {
        delete errors[name];
        wrap.classList.remove('field--invalid');
        input.removeAttribute('aria-invalid');
        errorEl.textContent = '';
      }
    }

    function validateAll() {
      var ok = true;
      var firstInvalid = null;
      ['name', 'email', 'message'].forEach(function (name) {
        if (!validateField(name)) {
          ok = false;
          if (!firstInvalid) firstInvalid = fields[name];
        }
      });
      if (firstInvalid) firstInvalid.focus();
      return ok;
    }

    // live validation: on blur once touched, on input after first submit / when field already invalid
    Object.keys(fields).forEach(function (name) {
      var input = fields[name];
      input.addEventListener('blur', function () {
        if (input.value.trim() || submitted) validateField(name);
      });
      input.addEventListener('input', function () {
        if (submitted || errors[name]) validateField(name);
      });
    });

    function setLoading(state) {
      isSending = state;
      submitBtn.disabled = state;
      submitBtn.classList.toggle('is-loading', state);
      submitBtn.setAttribute('aria-busy', String(state));
      submitLabel.textContent = t(state ? 'form.sending' : 'form.submit');
      submitLabel.setAttribute('data-i18n', state ? 'form.sending' : 'form.submit');
    }

    function collectPayload() {
      var participation = form.querySelector('input[name="participation"]:checked');
      var participationLabel = participation
        ? clean(participation.parentNode.querySelector('.chip__label').textContent)
        : '';
      var email = clean(fields.email.value);

      return {
        name: clean(fields.name.value),
        email: email,
        participation: participationLabel,
        message: String(fields.message.value || '').trim() || '—',
        language: CONFIG.langCodes[currentLang],
        page: window.location.href,
        _replyto: email,
        _subject: t('mail.subject') + ' — ' + clean(fields.name.value),
        _template: 'table',
        _captcha: 'false',
        _honey: form.elements._honey.value
      };
    }

    function send(payload) {
      var controller = 'AbortController' in window ? new AbortController() : null;
      var timer = setTimeout(function () { if (controller) controller.abort(); }, CONFIG.requestTimeout);

      return fetch(CONFIG.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
        signal: controller ? controller.signal : undefined
      })
        .then(function (res) {
          return res.json().catch(function () { return {}; }).then(function (data) {
            var ok = res.ok && (data.success === true || data.success === 'true');
            if (!ok) throw new Error((data && data.message) || ('HTTP ' + res.status));
            return data;
          });
        })
        .finally(function () { clearTimeout(timer); });
    }

    function onSuccess() {
      form.reset();
      submitted = false;
      Object.keys(fields).forEach(function (name) { setError(name, ''); });
      popups.open('popup-success');
    }

    function onError(err) {
      if (window.console) console.warn('[form] send failed:', err && err.message ? err.message : err);
      popups.open('popup-error');
    }

    function submit() {
      if (isSending) return;
      submitted = true;
      if (!validateAll()) return;

      var payload = collectPayload();

      // honeypot filled → bot; pretend success, send nothing
      if (payload._honey) { onSuccess(); return; }

      if (navigator.onLine === false) { onError(new Error('offline')); return; }

      setLoading(true);
      send(payload)
        .then(onSuccess)
        .catch(onError)
        .finally(function () { setLoading(false); });
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      submit();
    });

    if (retryBtn) {
      retryBtn.addEventListener('click', function () {
        popups.close(true);
        submit();
      });
    }

    formApi = {
      refreshErrors: function () {
        Object.keys(errors).forEach(function (name) { setError(name, errors[name]); });
        submitLabel.textContent = t(isSending ? 'form.sending' : 'form.submit');
      }
    };
  }

  /* =========================================================
     Reveal on scroll
     ========================================================= */
  function initReveal() {
    var items = document.querySelectorAll('[data-reveal]');
    if (!items.length) return;

    // auto-stagger direct reveal children of [data-reveal-stagger]
    document.querySelectorAll('[data-reveal-stagger]').forEach(function (group) {
      var step = parseInt(group.getAttribute('data-reveal-stagger'), 10) || 120;
      var i = 0;
      Array.prototype.forEach.call(group.children, function (child) {
        if (child.hasAttribute('data-reveal')) {
          child.style.setProperty('--reveal-delay', (i++ * step) + 'ms');
        }
      });
    });

    function reveal(el) {
      el.classList.add('is-revealed');
    }

    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || !('IntersectionObserver' in window)) {
      items.forEach(reveal);
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        reveal(entry.target);
        observer.unobserve(entry.target); // animate once, then stop tracking
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });

    items.forEach(function (el) { observer.observe(el); });
  }

  /* =========================================================
     Init
     ========================================================= */
  document.addEventListener('DOMContentLoaded', function () {
    initReveal();
    initForm();
    initMenu();
    initLangSwitcher();
    applyLang(detectLang());
  });
})();
