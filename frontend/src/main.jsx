import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DEMO_USERS, filterListings, label } from './market.js';
import { Account, Admin, ItemDetails, ListingForm, Activity } from './screens.jsx';
import { demoStore } from './demo-store.js';
import { Badge, ItemVisual } from './visuals.jsx';
import { CategoryRail, Footer, HeroCollage } from './marketplace-ui.jsx';
import './style.css';

const listingTypes = [
  { value: 'Sell', label: 'Buy', color: 'mint', icon: 'M5 9h14l1 12H4L5 9Zm4 0V6a3 3 0 0 1 6 0v3' },
  { value: 'Rent', label: 'Rent', color: 'blue', icon: 'M20 7v5h-5M4 17v-5h5m10.3-2A7.5 7.5 0 0 0 6 6.5L4 9m16 6-2 2.5A7.5 7.5 0 0 1 4.7 14' },
  { value: 'Exchange', label: 'Exchange', color: 'amber', icon: 'M4 7h15m-4-4 4 4-4 4M20 17H5m4-4-4 4 4 4' },
  { value: 'Donate', label: 'Donate', color: 'plum', icon: 'M12 20 4.5 12.8A4.6 4.6 0 1 1 12 7.6a4.6 4.6 0 1 1 7.5 5.2L12 20Z' },
  { value: 'Free Borrowing', label: 'Free Borrowing', color: 'teal', icon: 'M12 6c-2.5-2-6-2.5-10-1v13c4-1.5 7.5-1 10 1 2.5-2 6-2.5 10-1V5c-4-1.5-7.5-1-10 1Zm0 0v13' },
  { value: '', label: 'All listings', color: 'slate', icon: 'M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 0h7v7h-7z' },
];

const useHash = () => {
  const [route, setRoute] = useState(() => location.hash.slice(1) || 'marketplace');
  useEffect(() => {
    const update = () => setRoute(location.hash.slice(1) || 'marketplace');
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  return route;
};

function Marketplace({ listings, users }) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [type, setType] = useState('');
  const [free, setFree] = useState(false);
  const items = filterListings(listings, search, category, type, free);
  const clear = () => { setSearch(''); setCategory(''); setType(''); setFree(false); };
  return <>
    <section className="hero editorial-hero">
      <div className="hero-copy">
        <h1>Good finds.<br /><span>On campus.</span></h1>
        <button type="button" className="button hero-button" onClick={() => document.getElementById('listing-search').focus()}>Explore listings</button>
      </div>
      <HeroCollage />
    </section>
    <section className="market-types" aria-labelledby="listing-types">
      <h2 id="listing-types">Browse by type</h2>
      <div className="type-grid" role="group" aria-label="Listing type">
        {listingTypes.map(option => <button type="button" key={option.value}
          className={'type-card type-' + option.color} aria-pressed={type === option.value}
          onClick={() => { setType(option.value); setFree(false); }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={option.icon} /></svg>
          <span>{option.label}</span>
        </button>)}
      </div>
    </section>
    <section aria-labelledby="browse-title" className="browse">
      <div className="browse-heading">
        <h2 id="browse-title">{type ? listingTypes.find(option => option.value === type).label + ' listings' : 'Campus finds'}</h2>
        <label className="market-search"><span className="sr-only">Search listings</span>
          <input id="listing-search" type="search" placeholder="Search books, calculators and more" value={search} onChange={e => setSearch(e.target.value)} />
        </label>
      </div>
      <CategoryRail category={category} onSelect={setCategory} />
      <div className="listing-status">
        <p className="result-count" role="status">{items.length} {items.length === 1 ? 'listing' : 'listings'}</p>
        <div className="listing-filter-actions">
          <label className="check"><input type="checkbox" checked={free} onChange={event => {
            setFree(event.target.checked);
            if (event.target.checked) setType('');
          }} /> Free items only</label>
          {(search || category || type || free) && <button type="button" className="quiet reset-listings" onClick={clear}>Clear filters</button>}
        </div>
      </div>
      {items.length ? <div className="grid">{items.map(item => <article key={item.id} className="card">
        <a className="card-link" href={'#item/' + item.id}>
          <div className="tile-media"><ItemVisual item={item} /><Badge>{item.type === 'Sell' ? 'Buy' : item.type}</Badge></div>
          <div className="card-body"><h3>{item.title}</h3><strong className="price">{label(item)}</strong>
            <p className="muted">{item.condition} · {users.find(user => user.id === item.ownerId)?.name ?? 'Campus member'}</p></div>
        </a>
      </article>)}</div> : <div className="panel">No matching items. Try another search or category.</div>}
    </section>
  </>;
}

function App() {
  const route = useHash();
  const [screen, id] = route.split('/');
  const authPage = screen === 'signin' || screen === 'register';
  const [state, setState] = useState(demoStore.read);
  const [session, setSession] = useState(demoStore.session);
  const user = state.users.find(entry => entry.id === session);
  const verified = user?.status === 'Verified';
  const item = state.listings.find(entry => entry.id === id);
  useEffect(() => { window.scrollTo(0, 0); }, [route]);

  function openSession(account) {
    const userId = account?.id ?? '';
    demoStore.setSession(userId);
    setSession(userId);
    if (account?.status === "Verified" && ["item", "post"].includes(screen)) return;
    location.hash = !account ? 'signin' : account.status === 'Verified' ? 'marketplace' : 'verify';
  }

  function act(action, values) {
    setState(demoStore.action(user, action, values));
  }

  let page;
  if (authPage && !user) {
    page = <Account key={screen} register={screen === 'register'} onSession={openSession} onUpdate={setState} />;
  } else if (!verified) {
    page = <Account key={user?.id ?? 'guest'} user={user} onSession={openSession} onUpdate={setState} />;
  } else {
    switch (screen) {
      case 'post':
        page = <ListingForm onSave={values => { act('save', { listing: values }); location.hash = 'activity'; }} />;
        break;
      case 'edit':
        page = item?.ownerId === user.id && item.status === 'Available' && !item.hidden
          ? <ListingForm key={id} item={item} onSave={values => { act('save', { itemId: id, listing: values }); location.hash = 'activity'; }} />
          : <p className="panel">This listing cannot be edited.</p>;
        break;
      case 'item':
        page = item && !item.hidden && item.status === 'Available'
          ? <ItemDetails key={id} item={item} user={user} owner={state.users.find(entry => entry.id === item.ownerId)} act={act} />
          : <p className="panel">This item is unavailable. <a href="#marketplace">Back to marketplace</a></p>;
        break;
      case 'activity':
        page = <Activity state={state} user={user} act={act} />;
        break;
      case 'admin':
        page = user.role === 'admin' ? <Admin state={state} act={act} /> : <p className="panel">Administrator access is required.</p>;
        break;
      case 'account':
      case 'verify':
      case 'signin':
      case 'register':
        page = <Account key={user.id} user={user} onSession={openSession} onUpdate={setState} />;
        break;
      default:
        page = <Marketplace listings={state.listings} users={state.users} />;
    }
  }

  return <>
    <a className="skip-link" href="#main" onClick={event => {
      event.preventDefault();
      document.getElementById('main').focus();
    }}>Skip to content</a>
    <header className="header"><div className="header-inner">
      <a className="brand" href="#marketplace" aria-label="UniCircle home">
        <span className="brand-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="9" cy="12" r="5" /><circle cx="15" cy="12" r="5" /></svg></span>
        <span className="brand-name">Uni<strong>Circle</strong></span>
      </a>
      {verified && <nav aria-label="Main navigation">
        {[['marketplace', 'Marketplace'], ['post', 'Post Item'], ['activity', 'My Activity'], ...(user.role === 'admin' ? [['admin', 'Admin']] : [])].map(([hash, title]) =>
          <a key={hash} href={'#' + hash} aria-current={screen === hash ? 'page' : undefined}>{title}</a>)}
      </nav>}
      <div className="account-links" aria-label="Account">
        {user ? (
          <a className="account-link" href={verified ? '#account' : '#verify'}
            aria-current={screen === (verified ? 'account' : 'verify') ? 'page' : undefined}>
            {verified ? 'Profile' : 'Verification'}
          </a>
        ) : <>
          <a className="account-link" href="#signin" aria-current={screen === 'signin' ? 'page' : undefined}>Sign in</a>
          <a className="account-link" href="#register" aria-current={screen === 'register' ? 'page' : undefined}>Register</a>
        </>}
      </div>
    </div></header>
    <main id="main" className="shell" tabIndex={-1}>
      {page}
      <aside className="demo-bar" aria-label="Demo accounts"><span>Demo accounts</span>
        {DEMO_USERS.map(account => <button type="button" key={account.id} className="quiet" aria-pressed={user?.id === account.id}
          onClick={() => openSession(account)}>{account.name}</button>)}
      </aside>
    </main>
    <Footer />
  </>;
}

createRoot(document.getElementById('root')).render(<App />);
