(() => {
  'use strict';
  const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
  const menuToggle = document.querySelector('.menu-toggle');
  const mobileNav = document.getElementById('mobile-nav');
  function closeMenu() {
    mobileNav.hidden = true;
    menuToggle.setAttribute('aria-expanded', 'false');
    menuToggle.setAttribute('aria-label', 'Abrir menu');
  }
  menuToggle.addEventListener('click', () => {
    const opening = mobileNav.hidden;
    mobileNav.hidden = !opening;
    menuToggle.setAttribute('aria-expanded', String(opening));
    menuToggle.setAttribute('aria-label', opening ? 'Fechar menu' : 'Abrir menu');
  });
  mobileNav.addEventListener('click', (event) => { if (event.target.closest('a')) closeMenu(); });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !mobileNav.hidden) { closeMenu(); menuToggle.focus(); }
  });
  const messages = document.getElementById('chat-messages');
  const choices = document.getElementById('chat-choices');
  const hint = document.getElementById('demo-hint');
  const initialMessages = messages.innerHTML;
  const initialChoices = choices.innerHTML;
  const flows = {
    atendimento: {
      label: 'Quero melhorar meu atendimento.',
      reply: 'Entendi! Um agente pode responder dúvidas frequentes e orientar seus clientes, mesmo fora do horário da equipe. Qual é o seu maior desafio?',
      options: [['horario', 'Mensagens fora do horário'], ['repeticao', 'Muitas perguntas repetidas']]
    },
    vendas: {
      label: 'Quero apoiar minhas vendas.',
      reply: 'Vamos começar entendendo o interesse de cada contato. Assim, sua equipe recebe o contexto da conversa e pode conduzir a proposta. O que você vende?',
      options: [['servicos', 'Serviços'], ['produtos', 'Produtos']]
    },
    horario: {
      label: 'Recebo mensagens fora do horário.',
      reply: 'Nesse caso, podemos preparar um fluxo para acolher o cliente, responder às dúvidas previstas e reunir informações para sua equipe continuar depois.',
      options: [['projeto', 'Como seria no meu negócio?']]
    },
    repeticao: {
      label: 'Recebo muitas perguntas repetidas.',
      reply: 'O agente pode consultar as informações aprovadas sobre seu negócio. Quando uma dúvida fugir dessas orientações, o fluxo pode encaminhar para sua equipe.',
      options: [['projeto', 'Como seria no meu negócio?']]
    },
    servicos: {
      label: 'Minha empresa oferece serviços.',
      reply: 'Podemos criar perguntas para entender a necessidade, o prazo e o tipo de serviço buscado. A equipe entra na conversa com essas informações em mãos.',
      options: [['projeto', 'Como seria no meu negócio?']]
    },
    produtos: {
      label: 'Minha empresa vende produtos.',
      reply: 'O agente pode orientar sobre os produtos incluídos na sua base de informações e identificar o interesse do cliente. Consultas de estoque dependem das integrações do projeto.',
      options: [['projeto', 'Como seria no meu negócio?']]
    }
  };
  function bubble(text, sender) {
    const element = document.createElement('div');
    element.className = 'bubble bubble-' + sender + ' bubble-new';
    element.textContent = text;
    const meta = document.createElement('span');
    meta.className = 'message-meta';
    meta.textContent = '14:33';
    element.append(meta);
    messages.append(element);
  }
  choices.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-demo]');
    if (!button) return;
    const key = button.dataset.demo;
    if (key === 'projeto') {
      document.getElementById('contato').scrollIntoView({ behavior: motionPreference.matches ? 'instant' : 'smooth' });
      const contactHeading = document.querySelector('#contato h2');
      contactHeading.setAttribute('tabindex', '-1');
      contactHeading.focus({ preventScroll: true });
      return;
    }
    const flow = flows[key];
    if (!flow) return;
    bubble(flow.label, 'user');
    bubble(flow.reply, 'agent');
    choices.replaceChildren();
    flow.options.forEach(([value, label]) => {
      const choice = document.createElement('button');
      choice.type = 'button';
      choice.dataset.demo = value;
      choice.textContent = label;
      choices.append(choice);
    });
    messages.scrollTop = messages.scrollHeight;
    hint.textContent = 'Exemplo de fluxo · sem envio de mensagens';
    choices.querySelector('button')?.focus({ preventScroll: true });
  });
  document.getElementById('reset-demo').addEventListener('click', () => {
    messages.innerHTML = initialMessages;
    choices.innerHTML = initialChoices;
    messages.scrollTop = 0;
    hint.textContent = 'Escolha uma opção para explorar';
    choices.querySelector('button')?.focus({ preventScroll: true });
  });
  const config = window.SMARTDEV_CONFIG || {};
  const phone = String(config.whatsappNumber || '').replace(/\D/g, '');
  if (/^\d{10,15}$/.test(phone)) {
    const contact = document.getElementById('whatsapp-contact');
    const whatsappUrl = 'https://wa.me/' + phone + '?text=' + encodeURIComponent(config.whatsappMessage || 'Olá! Quero conhecer os agentes de IA da SmartDev AI.');
    document.querySelectorAll('[data-whatsapp-link]').forEach((link) => {
      link.href = whatsappUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    });
    contact.removeAttribute('aria-disabled');
    contact.removeAttribute('tabindex');
    contact.querySelector('span').textContent = 'Conversar no WhatsApp';
    document.getElementById('contact-note').textContent = 'Uma conversa para entender seu negócio. Sem compromisso.';
  }
  document.getElementById('year').textContent = String(new Date().getFullYear());

  // Progressive enhancement: content is visible even when motion is unavailable.
  if (!motionPreference.matches && 'IntersectionObserver' in window && 'animate' in Element.prototype) {
    const activeAnimations = new Set();
    const revealObserver = new IntersectionObserver((entries) => {
      entries.filter((entry) => entry.isIntersecting).forEach((entry, index) => {
        revealObserver.unobserve(entry.target);
        if (motionPreference.matches || entry.target.contains(document.activeElement)) return;
        const animation = entry.target.animate(
          [{ opacity: .55, transform: 'translateY(16px)' }, { opacity: 1, transform: 'translateY(0)' }],
          { duration: 620, delay: Math.min(index, 3) * 60, easing: 'cubic-bezier(.2,.7,.25,1)' }
        );
        activeAnimations.add(animation);
        const cleanUp = () => activeAnimations.delete(animation);
        animation.onfinish = cleanUp;
        animation.oncancel = cleanUp;
      });
    }, { threshold: .1 });

    document.querySelectorAll(
      '.hero-copy > *, .hero-visual, .strip-inner > *, .section-heading, .solution-card, .process-intro, .steps li, .faq-layout > div:first-child, .faq-list, .contact-panel'
    ).forEach((element) => revealObserver.observe(element));

    motionPreference.addEventListener('change', (event) => {
      if (!event.matches) return;
      revealObserver.disconnect();
      activeAnimations.forEach((animation) => animation.cancel());
      activeAnimations.clear();
    });
  }
})();
