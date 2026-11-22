import React, { useLayoutEffect, useRef, useState } from 'react';
import { CATEGORIES } from './market.js';
import { ItemVisual } from './visuals.jsx';

const heroItems = [
  { id: 'item-1', category: 'Books' },
  { id: 'item-0', category: 'Electronics' },
  { id: 'item-2', category: 'Study Supplies' },
];

export function HeroCollage() {
  const art = useRef(null);
  const running = useRef([]);

  function stop() {
    running.current.forEach(animation => animation.cancel());
    running.current = [];
  }

  function play() {
    stop();
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const [book, calculator, tools] = art.current.children;
    const center = card => [
      card.offsetLeft + card.offsetWidth / 2,
      card.offsetTop + card.offsetHeight / 2,
    ];
    const [bookX, bookY] = center(book);
    const easing = 'cubic-bezier(.23,.8,.25,1)';

    function fan(card, angle, delay, duration) {
      const [x, y] = center(card);
      return card.animate([
        { translate: (bookX - x) + 'px ' + (bookY - y) + 'px', rotate: angle + 'deg', scale: .8 },
        { translate: '0 0', rotate: '0deg', scale: 1 },
      ], { delay, duration, easing, fill: 'backwards' });
    }

    running.current = [
      book.animate([
        { translate: '0 7px', rotate: '5deg', scale: .985 },
        { translate: '0 0', rotate: '0deg', scale: 1 },
      ], { duration: 680, easing }),
      fan(calculator, -14, 115, 790),
      fan(tools, -10, 240, 830),
    ];
  }

  useLayoutEffect(() => {
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const onPreference = event => { if (event.matches) stop(); };
    preference.addEventListener('change', onPreference);
    play();
    return () => {
      preference.removeEventListener('change', onPreference);
      stop();
    };
  }, []);

  return <>
    <div className="hero-visual" aria-hidden="true" ref={art}>
      {heroItems.map((item, index) => <div key={item.id} className={'hero-image hero-image-' + 'abc'[index]}>
        <ItemVisual item={item} />
      </div>)}
    </div>
    <button type="button" className="hero-replay" aria-label="Replay collage animation" title="Replay animation" onClick={play}>
      <span aria-hidden="true">↻</span>
    </button>
  </>;
}

export function CategoryRail({ category, onSelect }) {
  const rail = useRef(null);
  const indicator = useRef(null);
  const [limits, setLimits] = useState({ overflow: false, start: true, end: true });

  function updateLimits() {
    const node = rail.current;
    const max = node.scrollWidth - node.clientWidth;
    const next = { overflow: max > 2, start: node.scrollLeft < 2, end: node.scrollLeft >= max - 2 };
    setLimits(current => (
      current.overflow === next.overflow && current.start === next.start && current.end === next.end ? current : next
    ));
  }

  function placeIndicator() {
    const node = rail.current;
    const selected = node.querySelector('button[aria-pressed="true"]');
    if (!selected) return;
    const style = indicator.current.style;
    style.translate = selected.offsetLeft + 'px ' + selected.offsetTop + 'px';
    style.width = selected.offsetWidth + 'px';
    style.height = selected.offsetHeight + 'px';
    node.dataset.ready = '';
  }

  useLayoutEffect(() => {
    const node = rail.current;
    const frame = requestAnimationFrame(() => { node.dataset.motion = ''; });
    const observer = new ResizeObserver(() => {
      placeIndicator();
      updateLimits();
    });
    observer.observe(node);
    node.querySelectorAll('button').forEach(button => observer.observe(button));
    updateLimits();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  useLayoutEffect(placeIndicator, [category, limits.overflow]);

  function scrollRail(direction) {
    const node = rail.current;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    node.scrollBy({ left: direction * Math.max(130, node.clientWidth * .72), behavior: reduced ? 'instant' : 'smooth' });
  }

  return <div className="category-wrap">
    <button type="button" className="rail-arrow" hidden={!limits.overflow} disabled={limits.start}
      aria-label="Scroll categories left" onClick={() => scrollRail(-1)}>‹</button>
    <div className="category-rail" role="group" aria-label="Campus categories" ref={rail} onScroll={updateLimits}>
      <span className="category-indicator" aria-hidden="true" ref={indicator} />
      {['', ...CATEGORIES].map(option => <button type="button" key={option} aria-pressed={category === option}
        onClick={() => onSelect(option)}>{option || 'All categories'}</button>)}
    </div>
    <button type="button" className="rail-arrow" hidden={!limits.overflow} disabled={limits.end}
      aria-label="Scroll categories right" onClick={() => scrollRail(1)}>›</button>
  </div>;
}

const pointfex = 'https://pointfex.com/';

export function Footer() {
  const help = useRef(null);
  const about = useRef(null);

  function scrollCurrentPage(event) {
    if (location.hash === event.currentTarget.hash) window.scrollTo(0, 0);
  }

  return <>
    <footer className="site-footer">
      <div className="footer-inner">
        <span className="footer-brand">UniCircle · <a className="company-link" href={pointfex} target="_blank" rel="noopener noreferrer">
          by Pointfex <span aria-hidden="true">↗</span>
        </a></span>
        <nav className="footer-links" aria-label="Footer">
          <a href="#marketplace" onClick={scrollCurrentPage}>Marketplace</a>
          <a href="#post" onClick={scrollCurrentPage}>Post an item</a>
          <a href="#activity" onClick={scrollCurrentPage}>My Activity</a>
          <button type="button" className="footer-link" onClick={() => help.current.showModal()}>Help</button>
          <button type="button" className="footer-link" onClick={() => about.current.showModal()}>About</button>
        </nav>
      </div>
    </footer>
    <dialog className="footer-dialog" ref={help} aria-labelledby="footer-help-title">
      <h2 id="footer-help-title">How it works</h2>
      <p>Request an item and check pickup details in My Activity once the owner accepts.</p>
      <a href="#marketplace" onClick={event => { help.current.close(); scrollCurrentPage(event); }}>Browse listings</a>
      <form method="dialog"><button>Close</button></form>
    </dialog>
    <dialog className="footer-dialog" ref={about} aria-labelledby="footer-about-title">
      <h2 id="footer-about-title">About UniCircle</h2>
      <p>A campus marketplace demo. Activity is saved in this browser.</p>
      <a href={pointfex} target="_blank" rel="noopener noreferrer">Visit Pointfex</a>
      <form method="dialog"><button>Close</button></form>
    </dialog>
  </>;
}
