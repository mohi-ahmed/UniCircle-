import React, { useState } from 'react';
import { CATEGORIES, CONDITIONS, PICKUP_POINTS, label, rentalDays } from './market.js';
import { Badge, ItemVisual } from './visuals.jsx';
import { DEMO_EMAIL, DEMO_PASSWORD, demoStore } from './demo-store.js';

const fieldError = (message, field) => Object.assign(new Error(message), { field });
const temporary = type => ['Rent', 'Free Borrowing'].includes(type);
const fmt = value => '৳' + Number(value).toLocaleString('en-BD');
const dateLabel = value => value?.replace('T', ' ');
const valuesOf = form => Object.fromEntries(new FormData(form));
const campusToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date());
const MAX_PHOTO_BYTES = 1024 * 1024;

function useFeedback() {
  const [error, setError] = useState(null);
  const [message, setMessage] = useState('');
  async function run(operation, success = '') {
    setError(null);
    setMessage('');
    try {
      await operation();
      setMessage(success);
    } catch (failure) {
      setError(failure);
    }
  }
  const feedback = <>
    {error && !error.field && <p className="error" role="alert">{error.message}</p>}
    {message && <p className="success" role="status">{message}</p>}
  </>;
  return { error, run, feedback };
}

function Field({ name, label: title, error, children, ...props }) {
  const bad = error?.field === name;
  const attributes = { name, id: name, 'aria-invalid': bad || undefined, 'aria-describedby': bad ? name + '-error' : undefined, ...props };
  return <div className="field">
    <label htmlFor={name}>{title}</label>
    {children ? React.cloneElement(children, attributes) : <input {...attributes} />}
    {bad && <p id={name + '-error'} className="error field-error" role="alert">{error.message}</p>}
  </div>;
}

function FormCard({ title, description, children }) {
  return <section className="panel form-card"><h1>{title}</h1>{description && <p className="muted">{description}</p>}{children}</section>;
}

export function Account({ user, register = false, onSession, onUpdate }) {
  const [manual, setManual] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { error, run, feedback } = useFeedback();
  if (user) {
    return <FormCard title={user.status === 'Verified' ? user.name : 'Verify your university account'} description={user.status === 'Verified' ? 'University account' : user.name}>
      <p><Badge>{user.status}</Badge></p>
      {user.status === 'Email pending' && <>
        <p>In the live app, open the verification link sent to your university email.</p>
        <div className="actions">
          <button onClick={() => run(() => {}, 'Demo verification link resent.')}>Resend verification link</button>
          <button className="secondary" onClick={() => run(() => onUpdate(demoStore.verifyEmail(user.id)), 'Email verified in demo.')}>Simulate opening the link</button>
        </div>
      </>}
      {user.status === 'Pending review' && <p>Campus administration is reviewing your university ID.</p>}
      {user.status === 'Rejected' && <p>Your university verification was rejected.</p>}
      {user.status === 'Verified' && <form onSubmit={event => {
        event.preventDefault();
        const { displayName } = valuesOf(event.currentTarget);
        run(() => {
          if (!displayName.trim()) throw fieldError('Enter a display name.', 'displayName');
          onUpdate(demoStore.updateProfile(user.id, displayName));
        }, 'Profile updated.');
      }}>
        <Field name="displayName" label="Display name" defaultValue={user.name} required maxLength={60} error={error} />
        <button>Save profile</button>
      </form>}
      {feedback}
      <div className="actions account-actions">
        {user.status === 'Verified' && <a className="button" href="#marketplace">Marketplace</a>}
        <button className="secondary" onClick={() => onSession(null)}>Sign out</button>
      </div>
    </FormCard>;
  }
  return <section className="auth-layout" aria-labelledby="auth-title">
    <aside className="auth-intro">
      <span className="auth-campus">SEU Campus Marketplace</span>
      <h2>{register ? 'Join your campus community.' : 'Your campus, one marketplace.'}</h2>
      <p>Find, share and pass on everyday essentials with other students.</p>
      <a href="#marketplace">Browse marketplace</a>
    </aside>
    <div className="auth-main">
    <nav className="auth-tabs" aria-label="Account access">
      <a href="#signin" aria-current={!register ? 'page' : undefined}>Sign in</a>
      <a href="#register" aria-current={register ? 'page' : undefined}>Register</a>
    </nav>
    <h1 id="auth-title">{register ? 'Create your account' : 'Welcome back'}</h1>
    <p className="muted">{register ? 'Register with a university email or student ID.' : 'Sign in to request an item or post a listing.'}</p>
    <form onSubmit={e => {
      e.preventDefault();
      const data = valuesOf(e.currentTarget);
      run(() => {
        if (!register) return onSession(demoStore.signIn(data.identifier, data.password));
        if (!data.name?.trim()) throw fieldError('Enter your display name.', 'name');
        if (data.password !== DEMO_PASSWORD) throw fieldError('Use the sample password shown below.', 'password');
        const { user: newUser, state } = demoStore.register(data);
        onUpdate(state);
        onSession(newUser);
      });
    }}>
      {register && <>
        <Field name="name" label="Display name" autoComplete="nickname" required error={error} />
        <label className="check"><input type="checkbox" checked={manual} onChange={e => setManual(e.target.checked)} /> Verify with a university ID instead</label>
      </>}
      {register ? manual
        ? <Field name="universityId" label="University ID number" key="id" required error={error} />
        : <Field name="email" label="University email" key="email" type="email" autoComplete="email" required error={error} />
        : <Field name="identifier" label="University email or ID" autoComplete="username" defaultValue={DEMO_EMAIL} required error={error} />}
      <div className="password-field"><Field name="password" label="Demo password" type={showPassword ? 'text' : 'password'} autoComplete="off"
        aria-describedby={error?.field === 'password' ? 'password-error demo-password' : 'demo-password'} required error={error} />
      <button type="button" className="quiet" aria-controls="password" onClick={() => setShowPassword(!showPassword)}>{showPassword ? 'Hide' : 'Show'}</button></div>
      <p className="demo-note" id="demo-password">
        {register ? 'Use fictional details for demo registration. To sign in again, use the demo password ' : 'Demo password '}
        <code>{DEMO_PASSWORD}</code>
      </p>
      {feedback}
      <button className="auth-submit">{register ? 'Create account' : 'Sign in'}</button>
    </form>
    {!register && <button className="secondary auth-demo" type="button" onClick={() => run(() => onSession(demoStore.signIn(DEMO_EMAIL, DEMO_PASSWORD)))}>Try demo account</button>}
    </div>
  </section>;
}

const postTypes = [
  ['Sell', 'Sell', 'Set a price'],
  ['Rent', 'Rent', 'Charge by the day'],
  ['Exchange', 'Exchange', 'Swap for another item'],
  ['Donate', 'Donate', 'Give it away for free'],
  ['Free Borrowing', 'Free Borrowing', 'Lend it at no cost'],
];
const fileUrl = file => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(fieldError('Could not read this photo. Retry or remove it.', 'photo'));
  reader.readAsDataURL(file);
});

export function ListingForm({ item, onSave }) {
  const [type, setType] = useState(item?.type ?? 'Sell');
  const [amount, setAmount] = useState(item?.amount > 0 ? String(item.amount) : '');
  const [exchange, setExchange] = useState(item?.exchange ?? '');
  const [removePhoto, setRemovePhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  const { error, run, feedback } = useFeedback();
  const paid = type === 'Sell' || type === 'Rent';

  return <section className="post-page" aria-labelledby="post-title">
    <div className="post-heading">
      <a className="back-link" href={item ? '#activity' : '#marketplace'}>{item ? 'My listings' : 'Marketplace'}</a>
      <h1 id="post-title">{item ? 'Edit listing' : 'Post an item'}</h1>
      <p className="muted">Share an item with students on campus.</p>
    </div>
    <form onSubmit={e => {
      e.preventDefault();
      const data = valuesOf(e.currentTarget);
      setSaving(true);
      run(async () => {
        if (!data.title.trim()) throw fieldError('Enter a title.', 'title');
        if (!data.description.trim()) throw fieldError('Enter a description.', 'description');
        if (paid && (!/^\d+(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0 || !Number.isFinite(Number(amount)))) {
          throw fieldError('Enter a positive BDT amount with up to two decimal places.', 'amount');
        }
        if (type === 'Exchange' && !exchange.trim()) throw fieldError('Describe what you would accept in exchange.', 'exchange');
        const file = data.photo;
        let photo = removePhoto ? null : item?.photo ?? null;
        if (file.size) {
          if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > MAX_PHOTO_BYTES) {
            throw fieldError('Choose a JPG, PNG, or WebP under 1 MB, or remove the photo.', 'photo');
          }
          photo = await fileUrl(file);
        }
        onSave({
          title: data.title.trim(), description: data.description.trim(), category: data.category, condition: data.condition, type,
          amount: paid ? Number(amount) : type === 'Exchange' ? null : 0,
          exchange: type === 'Exchange' ? exchange.trim() : null, photo,
        });
      }).finally(() => setSaving(false));
    }}>
      <fieldset className="post-block">
        <legend>Listing type</legend>
        <div className="post-types">{postTypes.map(([value, title, description]) =>
          <label className="post-type" key={value}>
            <input type="radio" name="listingType" value={value} checked={type === value}
              onChange={() => { setType(value); setAmount(''); setExchange(''); }} />
            <span><strong>{title}</strong><small>{description}</small></span>
          </label>
        )}</div>
        {paid && <Field name="amount" label={type === 'Rent' ? 'Daily rate (BDT)' : 'Sale price (BDT)'} inputMode="decimal" value={amount}
          onChange={e => setAmount(e.target.value)} required error={error} />}
        {type === 'Exchange' && <Field name="exchange" label="What would you accept in exchange?" value={exchange}
          onChange={e => setExchange(e.target.value)} required error={error}><textarea rows="2" /></Field>}
      </fieldset>
      <fieldset className="post-block">
      <legend>Item details</legend>
      <Field name="title" label="Item title" placeholder="e.g. Scientific calculator" defaultValue={item?.title} required maxLength={100} error={error} />
      <div className="post-detail-row">
      <Field name="category" label="Category" defaultValue={item?.category ?? ''} required error={error}>
        <select><option value="" disabled>Select category</option>{CATEGORIES.map(value => <option key={value}>{value}</option>)}</select>
      </Field>
      <Field name="condition" label="Condition" defaultValue={item?.condition ?? ''} required error={error}>
        <select><option value="" disabled>Select condition</option>{CONDITIONS.map(value => <option key={value}>{value}</option>)}</select>
      </Field>
      </div>
      <Field name="description" label="Description" defaultValue={item?.description} required maxLength={2000} error={error}><textarea rows="4" /></Field>
      </fieldset>
      <fieldset className="post-block post-photo">
      <legend>Photo</legend>
      <p className="muted" id="photo-hint">Optional · JPG, PNG or WebP · Up to 1 MB</p>
      <Field name="photo" label="Upload a photo" type="file" aria-describedby={error?.field === 'photo' ? 'photo-error photo-hint' : 'photo-hint'} accept="image/jpeg,image/png,image/webp" error={error} />
      {item?.photo && <label className="check"><input type="checkbox" checked={removePhoto} onChange={e => setRemovePhoto(e.target.checked)} /> Remove current photo</label>}
      </fieldset>
      {feedback}
      <div className="actions"><button disabled={saving}>{item ? 'Save changes' : 'Post item'}</button>
        <a href={item ? '#activity' : '#marketplace'}>Cancel</a></div>
    </form>
  </section>;
}

export function ItemDetails({ item, user, owner, act }) {
  const [open, setOpen] = useState(false);
  const [pickup, setPickup] = useState('');
  const [back, setBack] = useState('');
  const days = rentalDays(pickup, back);
  const { error, run, feedback } = useFeedback();
  return <>
    <a className="back-link" href="#marketplace">Marketplace</a>
    <section className="panel detail">
      <ItemVisual item={item} />
      <div><Badge>{item.type}</Badge><h1>{item.title}</h1>
        <strong className="price">{label(item)}</strong><p>{item.description}</p>
        <dl><dt>Condition</dt><dd>{item.condition}</dd><dt>Listed by</dt><dd>{owner?.name ?? 'Campus member'}</dd>
          {item.exchange && <><dt>Accepts</dt><dd>{item.exchange}</dd></>}</dl>
        {item.ownerId === user.id ? <a className="button" href={'#edit/' + item.id}>Edit listing</a>
          : !open && <button onClick={() => setOpen(true)}>Request item</button>}
        {open && <form onSubmit={e => {
          e.preventDefault();
          const data = valuesOf(e.currentTarget);
          run(() => {
            if (temporary(item.type) && !(days > 0)) throw fieldError('Return date must be after pickup date.', 'returnDate');
            if (item.type === 'Exchange' && !data.offer.trim()) throw fieldError('Describe the item you are offering.', 'offer');
            act('request', { itemId: item.id, ...data });
            location.hash = 'activity/sent';
          });
        }}>
          {temporary(item.type) && <>
            <Field name="pickupDate" label="Proposed pickup date" type="date" min={campusToday()} value={pickup} onChange={e => setPickup(e.target.value)} required error={error} />
            <Field name="returnDate" label="Proposed return date" type="date" min={pickup || campusToday()} value={back} onChange={e => setBack(e.target.value)} required error={error} />
            {item.type === 'Rent' && days > 0 && <p><strong>Total {fmt(Math.round(item.amount * 100) * days / 100)}</strong> for {days} {days === 1 ? 'day' : 'days'}</p>}
          </>}
          {item.type === 'Exchange' && <Field name="offer" label="What are you offering in return?" required error={error}><textarea rows="3" /></Field>}
          {feedback}
          <div className="actions"><button>Send request</button><button type="button" className="secondary" onClick={() => setOpen(false)}>Back</button></div>
        </form>}
      </div>
    </section>
  </>;
}

function RequestCard({ request, received, act, users, item }) {
  const [accepting, setAccepting] = useState(false);
  const { error, run, feedback } = useFeedback();
  const action = name => run(() => act(name, { requestId: request.id }));
  const other = users.find(user => user.id === (received ? request.requesterId : item?.ownerId));
  return <article className="panel activity-card">
    <div className="row-title"><h2>{request.title}</h2><Badge>{request.status}</Badge></div>
    <p className="muted">{request.type}{other && ' · ' + other.name}{request.type === 'Sell' && ' · ' + fmt(request.amount)}</p>
    {request.exchange && <p>Owner wants {request.exchange}. Offered {request.offer}.</p>}
    {request.pickupDate && <p>Proposed dates {request.pickupDate} to {request.returnDate}{request.fee !== null && ' · ' + fmt(request.fee)}</p>}
    {request.point && <p>Pickup at {request.point} · {dateLabel(request.time)}</p>}
    {request.status === 'Checked Out' && request.returnDate < campusToday() && <p className="error">Return overdue</p>}
    {request.handoverAt && <p>Handover recorded {new Date(request.handoverAt).toLocaleString('en-BD', { timeZone: 'Asia/Dhaka' })}</p>}
    {request.returnedAt && <p>Return recorded {new Date(request.returnedAt).toLocaleString('en-BD', { timeZone: 'Asia/Dhaka' })}</p>}
    {request.reason && <p>{request.reason}</p>}
    <div className="actions">
      {received && request.status === 'Pending' && !accepting && <button onClick={() => setAccepting(true)}>Accept</button>}
      {received && request.status === 'Pending' && <button className="secondary" onClick={() => action('decline')}>Decline</button>}
      {(!received && request.status === 'Pending' || request.status === 'Accepted') && <button className="secondary" onClick={() => action('cancel')}>Cancel request</button>}
      {received && request.status === 'Accepted' && <button onClick={() => action('handover')}>{request.type === 'Exchange' ? 'Confirm both handovers' : 'Record handover'}</button>}
      {received && request.status === 'Checked Out' && <button onClick={() => action('return')}>Confirm return</button>}
    </div>
    {accepting && request.status === 'Pending' && <form onSubmit={e => {
      e.preventDefault();
      const data = valuesOf(e.currentTarget);
      run(() => { act('accept', { requestId: request.id, ...data }); setAccepting(false); });
    }}>
      <label>Campus pickup point<select name="point" required><option value="">Select a pickup point</option>{PICKUP_POINTS.map(point => <option key={point}>{point}</option>)}</select></label>
      <label>Pickup time (campus local time)<input name="time" type="datetime-local" min={request.pickupDate && request.pickupDate + 'T00:00'}
        max={request.pickupDate && request.pickupDate + 'T23:59'} required /></label>
      <div className="actions"><button>Confirm pickup</button><button type="button" className="secondary" onClick={() => setAccepting(false)}>Back</button></div>
    </form>}
    {error && feedback}
  </article>;
}

export function Activity({ state, user, act }) {
  const section = location.hash.split('/')[1] || 'listings';
  const mine = state.listings.filter(item => item.ownerId === user.id);
  const received = section === 'received';
  const requests = state.requests.filter(request => received ? mine.some(item => item.id === request.itemId) : request.requesterId === user.id);
  const { run, feedback } = useFeedback();
  return <section>
    <h1>My Activity</h1>
    <nav className="tabs" aria-label="Activity">
      {[['listings', 'My Listings'], ['sent', 'Requests Sent'], ['received', 'Requests Received']].map(([id, title]) =>
        <a href={'#activity/' + id} key={id} aria-current={section === id ? 'page' : undefined}>{title}</a>)}
    </nav>
    {feedback}
    <div className="stack">{section === 'listings'
      ? mine.length ? mine.map(item => <article className="panel activity-card" key={item.id}>
        <div className="row-title"><h2>{item.title}</h2><Badge>{item.hidden ? 'Hidden · ' : ''}{item.status}</Badge></div>
        <p className="muted">{item.type} · {label(item)}</p>
        {item.status === 'Available' && !item.hidden && <div className="actions">
          <a className="button secondary" href={'#edit/' + item.id}>Edit</a>
          <button className="secondary" onClick={() => run(() => act('close', { itemId: item.id }), 'Listing closed.')}>Close listing</button>
        </div>}
      </article>) : <p className="panel">No listings yet. <a href="#post">Post an item</a>.</p>
      : requests.length ? requests.map(request => <RequestCard key={request.id} request={request} received={received} act={act}
        users={state.users} item={state.listings.find(item => item.id === request.itemId)} />) : <p className="panel">No requests here yet.</p>}
    </div>
  </section>;
}

export function Admin({ state, act }) {
  const [moderating, setModerating] = useState(null);
  const { error, run, feedback } = useFeedback();
  const reviews = state.reviews.filter(review => review.status === 'Pending');
  return <section><h1>Admin</h1>{feedback}
    <h2>Verification queue</h2><div className="stack">{reviews.length ? reviews.map(review => <article key={review.id} className="panel">
      <strong>{review.name}</strong><p>University ID {review.universityId}</p>
      <div className="actions">{[['Verified', 'Approve'], ['Rejected', 'Reject']].map(([status, title]) =>
        <button key={status} className={status === 'Rejected' ? 'secondary' : undefined}
          onClick={() => run(() => act('review', { reviewId: review.id, status }), 'Verification decision recorded.')}>{title}</button>)}</div>
    </article>) : <p className="panel">No pending verifications.</p>}</div>
    <h2>Listing moderation</h2><div className="stack">{state.listings.filter(item => !item.hidden).map(item => <article key={item.id} className="panel">
      <div className="row-title"><strong>{item.title}</strong><Badge>{item.status}</Badge></div>
      {moderating === item.id ? <form onSubmit={e => {
        e.preventDefault();
        const { reason } = valuesOf(e.currentTarget);
        run(() => {
          if (!reason.trim()) throw fieldError('Enter a reason to hide the listing.', 'reason');
          act('hide', { itemId: item.id, reason });
          setModerating(null);
        }, 'Listing hidden.');
      }}>
        <Field name="reason" label="Reason" required error={error} />
        <div className="actions"><button>Confirm hide</button><button type="button" className="secondary" onClick={() => setModerating(null)}>Cancel</button></div>
      </form> : <button className="secondary" onClick={() => setModerating(item.id)}>Hide listing</button>}
    </article>)}</div>
    <h2>Audit history</h2><ul className="panel audit">{state.audit.length ? state.audit.map(entry => <li key={entry.id}>{entry.what} · {entry.who} · {new Date(entry.at).toLocaleString('en-BD', { timeZone: 'Asia/Dhaka' })}</li>) : <li>No actions recorded.</li>}</ul>
  </section>;
}
