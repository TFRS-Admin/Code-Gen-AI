// Conversation entity — self-hosted stub replacing Base44 SDK
// Persists conversations in localStorage until the Blair server DB is wired.

const STORE_KEY = 'blair_conversations';

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
  } catch {
    return [];
  }
}

function save(items) {
  localStorage.setItem(STORE_KEY, JSON.stringify(items));
}

export const Conversation = {
  async list(filters = {}) {
    let items = load();
    if (filters.created_by) {
      items = items.filter(i => i.created_by === filters.created_by);
    }
    return items.sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
  },

  async create(data) {
    const items = load();
    const item = {
      id: crypto.randomUUID(),
      created_date: new Date().toISOString(),
      ...data,
    };
    items.unshift(item);
    save(items);
    return item;
  },

  async update(id, data) {
    const items = load();
    const idx = items.findIndex(i => i.id === id);
    if (idx === -1) throw new Error('Conversation not found');
    items[idx] = { ...items[idx], ...data };
    save(items);
    return items[idx];
  },

  async delete(id) {
    const items = load().filter(i => i.id !== id);
    save(items);
  },
};

export default Conversation;
