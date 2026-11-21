export const TYPES = ['Sell', 'Donate', 'Rent', 'Exchange', 'Free Borrowing'];
export const CATEGORIES = ['Books', 'Electronics', 'Study Supplies', 'Sports', 'Clothing', 'Other'];
export const CONDITIONS = ['New', 'Like new', 'Good', 'Fair'];
export const PICKUP_POINTS = ['Library entrance', 'Main gate', 'Student lounge'];
export const DEMO_USERS = [
  { id: 'member', name: 'Toufiqul', role: 'member', status: 'Verified' },
  { id: 'peer', name: 'Nadia', role: 'member', status: 'Verified' },
  { id: 'admin', name: 'Campus admin', role: 'admin', status: 'Verified' },
];

const demoItems = [
  ['Scientific Calculator', 'Electronics', 'Rent', 100, 'Like new', 'Casio scientific calculator with its protective cover.'],
  ['Data Structures & Algorithms', 'Books', 'Sell', 450, 'Good', 'Paperback copy with a few highlighted pages.'],
  ['Drawing & Drafting Set', 'Study Supplies', 'Free Borrowing', 0, 'Good', 'Compass, ruler, and protractor in their original case.'],
  ['Campus Football', 'Sports', 'Exchange', null, 'Good', 'Size five football with light wear.', 'A badminton racket in good condition'],
  ['Intro to Programming Notes', 'Books', 'Donate', 0, 'Good', 'Handwritten lecture notes and worked examples.'],
  ['USB-C Hub', 'Electronics', 'Sell', 850, 'Like new', 'Four ports for a laptop or tablet.'],
];

export function seed() {
  return {
    users: DEMO_USERS,
    listings: demoItems.map(([title, category, type, amount, condition, description, exchange], index) => ({
      id: 'item-' + index, title, category, type, amount, condition, description, exchange, ownerId: index === 4 ? 'member' : 'peer',
      status: 'Available', hidden: false,
    })),
    requests: [],
    reviews: [{ id: 'review-1', userId: 'sample', name: 'Samira Rahman', universityId: 'DEMO-046', status: 'Pending' }],
    audit: [],
  };
}

export function label(item) {
  if (item.type === 'Donate' || item.type === 'Free Borrowing') return 'Free';
  if (item.type === 'Exchange') return 'Swap';
  const amount = Intl.NumberFormat('en-BD', { maximumFractionDigits: 2 }).format(item.amount);
  return '৳' + amount + (item.type === 'Rent' ? ' / day' : '');
}

export function rentalDays(pickup, back) {
  return (Date.parse(back) - Date.parse(pickup)) / 86400000;
}

export function filterListings(listings, query, category, type, free) {
  const search = query.trim().toLowerCase();
  return listings.filter(item => item.status === 'Available' && !item.hidden
    && item.title.toLowerCase().includes(search)
    && (!category || item.category === category)
    && (!type || item.type === type)
    && (!free || ['Donate', 'Free Borrowing'].includes(item.type)));
}

const pending = request => request?.status === 'Pending';
const temporary = type => ['Rent', 'Free Borrowing'].includes(type);
const active = request => ['Pending', 'Accepted', 'Checked Out'].includes(request.status);
const stamp = () => new Date().toISOString();

export function updateMarket(state, person, action, data) {
  if (person?.status !== 'Verified') throw new Error('A verified account is required.');
  const next = structuredClone(state);
  const request = next.requests.find(entry => entry.id === data.requestId);
  const item = next.listings.find(entry => entry.id === (data.itemId ?? request?.itemId));
  const owner = item?.ownerId === person.id;
  const requester = request?.requesterId === person.id;
  const require = (condition, message) => { if (!condition) throw new Error(message); };
  const cancelPending = reason => {
    next.requests.filter(entry => entry.itemId === item.id && pending(entry))
      .forEach(entry => Object.assign(entry, { status: 'Cancelled', reason }));
  };

  switch (action) {
    case 'save': {
      require(!data.itemId || (owner && item.status === 'Available' && !item.hidden), 'This listing cannot be edited.');
      const changes = data.listing;
      if (item) {
        if (['type', 'amount', 'exchange'].some(key => item[key] !== changes[key])) cancelPending('The listing terms changed.');
        Object.assign(item, changes);
      } else {
        next.listings.unshift({ ...changes, id: crypto.randomUUID(), ownerId: person.id, status: 'Available', hidden: false });
      }
      break;
    }
    case 'close':
      require(owner && item.status === 'Available' && !item.hidden, 'This listing cannot be closed.');
      item.status = 'Closed';
      cancelPending('The owner closed the listing.');
      break;
    case 'request': {
      require(item && !owner && item.status === 'Available' && !item.hidden, 'This item is unavailable.');
      require(!next.requests.some(entry => entry.itemId === item.id && entry.requesterId === person.id && active(entry)), 'You already have an active request.');
      const days = temporary(item.type) ? rentalDays(data.pickupDate, data.returnDate) : 0;
      require(!temporary(item.type) || days > 0, 'Return date must be after pickup date.');
      require(item.type !== 'Exchange' || data.offer?.trim(), 'Describe the item you are offering.');
      next.requests.unshift({
        id: crypto.randomUUID(), itemId: item.id, requesterId: person.id, title: item.title, type: item.type,
        amount: item.amount, exchange: item.exchange, status: 'Pending', createdAt: stamp(),
        pickupDate: data.pickupDate, returnDate: data.returnDate, offer: data.offer?.trim(),
        fee: item.type === 'Rent' ? Math.round(item.amount * 100) * days / 100 : null,
      });
      break;
    }
    case 'accept':
      require(owner && pending(request) && item.status === 'Available' && !item.hidden, 'This request is no longer available.');
      require(PICKUP_POINTS.includes(data.point) && data.time, 'Choose a campus pickup point and time.');
      require(!temporary(request.type) || data.time.slice(0, 10) === request.pickupDate, 'Pickup time must be on the proposed date.');
      Object.assign(request, { status: 'Accepted', point: data.point, time: data.time });
      item.status = 'Reserved';
      next.requests.filter(entry => entry.itemId === item.id && pending(entry))
        .forEach(entry => Object.assign(entry, { status: 'Declined', reason: 'Another request was accepted.' }));
      break;
    case 'decline':
      require(owner && pending(request), 'This request cannot be declined.');
      request.status = 'Declined';
      break;
    case 'cancel':
      require((requester && pending(request)) || ((owner || requester) && request?.status === 'Accepted'), 'This request cannot be cancelled.');
      if (request.status === 'Accepted') item.status = 'Available';
      request.status = 'Cancelled';
      break;
    case 'handover':
      require(owner && request?.status === 'Accepted', 'This handover cannot be recorded.');
      request.status = item.status = temporary(request.type) ? 'Checked Out' : 'Completed';
      request.handoverAt = stamp();
      break;
    case 'return':
      require(owner && request?.status === 'Checked Out', 'This return cannot be recorded.');
      request.status = 'Completed';
      request.returnedAt = stamp();
      item.status = item.hidden ? 'Closed' : 'Available';
      break;
    case 'review': {
      const review = next.reviews.find(entry => entry.id === data.reviewId);
      require(person.role === 'admin' && review?.status === 'Pending' && ['Verified', 'Rejected'].includes(data.status), 'This review is unavailable.');
      review.status = data.status;
      const applicant = next.users.find(entry => entry.id === review.userId);
      if (applicant) applicant.status = data.status;
      next.audit.unshift({ id: crypto.randomUUID(), who: person.name, what: data.status + ' ' + review.name, at: stamp() });
      break;
    }
    case 'hide': {
      require(person.role === 'admin' && item && !item.hidden && data.reason?.trim(), 'Enter a reason to hide the listing.');
      item.hidden = true;
      item.hiddenReason = data.reason.trim();
      cancelPending('The listing was hidden.');
      if (item.status === 'Reserved') {
        const accepted = next.requests.find(entry => entry.itemId === item.id && entry.status === 'Accepted');
        if (accepted) Object.assign(accepted, { status: 'Cancelled', reason: 'The listing was hidden.' });
        item.status = 'Closed';
      }
      next.audit.unshift({ id: crypto.randomUUID(), who: person.name, what: 'Hid ' + item.title + ' — ' + item.hiddenReason, at: stamp() });
      break;
    }
    default: throw new Error('Unsupported action.');
  }

  return next;
}
