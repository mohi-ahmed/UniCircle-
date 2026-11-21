import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CATEGORIES, DEMO_USERS, TYPES, filterListings, label } from './market.js';
import { Account, Admin, ItemDetails, ListingForm, Activity } from './screens.jsx';
import { demoStore } from './demo-store.js';
import { Badge, ItemVisual } from './visuals.jsx';
import './style.css';

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
  return <>
    <section className="hero">
      <div><p className="eyebrow">THE CAMPUS MARKETPLACE</p><h1>Find it on campus.</h1>
        <p>Buy, sell, borrow, and share with your university community.</p></div>
      <a className="button hero-button" href="#post">＋ Post an item</a>
    </section>
    <section aria-labelledby="browse-title" className="browse">
      <h2 id="browse-title">Browse listings</h2>
      <div className="filters">
        <label>Search by title<input type="search" placeholder="Try calculator or books" value={search} onChange={e => setSearch(e.target.value)} /></label>
        <label>Category<select value={category} onChange={e => setCategory(e.target.value)}>
          <option value="">All categories</option>{CATEGORIES.map(option => <option key={option}>{option}</option>)}
        </select></label>
        <label>Listing type<select value={type} onChange={e => setType(e.target.value)}>
          <option value="">All types</option>{TYPES.map(option => <option key={option}>{option}</option>)}
        </select></label>
        <label className="check"><input type="checkbox" checked={free} onChange={e => setFree(e.target.checked)} /> Free items</label>
      </div>
      <p className="result-count" role="status">{items.length} {items.length === 1 ? 'listing' : 'listings'} available</p>
      {items.length ? <div className="grid">{items.map(item => <article key={item.id} className="card">
        <a className="card-link" href={'#item/' + item.id}>
          <ItemVisual item={item} />
          <div className="card-body"><Badge>{item.type}</Badge><h3>{item.title}</h3>
            <p className="muted">{item.condition} · {users.find(user => user.id === item.ownerId)?.name ?? 'Campus member'}</p>
            <strong className="price">{label(item)}</strong></div>
        </a>
      </article>)}</div> : <p className="panel">No matching items. Try a different title or filter.</p>}
    </section>
  </>;
}

function App() {
  const route = useHash();
  const [screen, id] = route.split('/');
  const [state, setState] = useState(demoStore.read);
  const [session, setSession] = useState(demoStore.session);
  const user = state.users.find(entry => entry.id === session);
  const verified = user?.status === 'Verified';
  const item = state.listings.find(entry => entry.id === id);
  useEffect(() => { window.scrollTo(0, 0); }, [route]);

  function openSession(userId) {
    demoStore.setSession(userId);
    setSession(userId);
    location.hash = userId ? 'marketplace' : 'account';
  }

  function act(action, values) {
    setState(demoStore.action(user, action, values));
  }

  let page;
  if (!verified) {
    page = <Account user={user} onSession={openSession} onUpdate={setState} />;
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
        page = <Account user={user} onSession={openSession} onUpdate={setState} />;
        break;
      default:
        page = <Marketplace listings={state.listings} users={state.users} />;
    }
  }

  return <>
    <header className="header"><div className="header-inner">
      <a className="brand" href="#marketplace"><span className="brand-mark" aria-hidden="true">U</span> UniCircle</a>
      {verified && <nav aria-label="Main navigation">
        {[['marketplace', 'Marketplace'], ['post', 'Post Item'], ['activity', 'My Activity'], ...(user.role === 'admin' ? [['admin', 'Admin']] : [])].map(([hash, title]) =>
          <a key={hash} href={'#' + hash} aria-current={screen === hash ? 'page' : undefined}>{title}</a>)}
      </nav>}
      <a className="account-link" href="#account">{user?.name ?? 'Sign in'}</a>
    </div></header>
    <main id="main" className="shell">
      {page}
      <aside className="demo-bar" aria-label="Demo accounts"><span>Demo mode · browser data</span>
        {DEMO_USERS.map(account => <button type="button" key={account.id} className="quiet" aria-pressed={user?.id === account.id}
          onClick={() => openSession(account.id)}>{account.name}</button>)}
      </aside>
    </main>
  </>;
}

createRoot(document.getElementById('root')).render(<App />);
