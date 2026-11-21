import { seed, updateMarket } from './market.js';

const DATA_KEY = 'unicircle.demo.data.v1';
const SESSION_KEY = 'unicircle.demo.session.v1';
const read = () => JSON.parse(localStorage.getItem(DATA_KEY) || 'null') ?? seed();
const persist = state => {
  localStorage.setItem(DATA_KEY, JSON.stringify(state));
  return state;
};

export const demoStore = {
  read,
  session: () => localStorage.getItem(SESSION_KEY) ?? 'member',
  setSession: id => localStorage.setItem(SESSION_KEY, id ?? ''),
  action: (user, action, data) => persist(updateMarket(read(), user, action, data)),
  updateProfile(userId, name) {
    const state = read();
    const user = state.users.find(entry => entry.id === userId && entry.status === 'Verified');
    if (!user) throw new Error('A verified account is required.');
    user.name = name.trim();
    return persist(state);
  },
  register(values) {
    const state = read();
    const email = values.email?.trim().toLowerCase();
    const universityId = values.universityId?.trim();
    if (state.users.some(user => (email && user.email === email) || (universityId && user.universityId === universityId))) {
      throw new Error('That email or university ID is already registered.');
    }
    const user = { id: crypto.randomUUID(), name: values.name.trim(), email, universityId, role: 'member',
      status: email ? 'Email pending' : 'Pending review' };
    state.users.push(user);
    if (universityId) state.reviews.push({ id: crypto.randomUUID(), userId: user.id, name: user.name, universityId, status: 'Pending' });
    return { state: persist(state), user };
  },
  signIn(identifier) {
    const value = identifier.trim().toLowerCase();
    const user = read().users.find(entry => entry.email === value || entry.universityId?.toLowerCase() === value);
    if (!user) throw new Error('Demo account was not found.');
    return user;
  },
  verifyEmail(userId) {
    const state = read();
    const user = state.users.find(entry => entry.id === userId && entry.status === 'Email pending');
    if (!user) throw new Error('This account cannot be verified.');
    user.status = 'Verified';
    return persist(state);
  },
};
