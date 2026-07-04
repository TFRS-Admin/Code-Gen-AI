// User entity — self-hosted stub replacing Base44 SDK
// In production this will call the Blair server auth endpoints.

const USER_KEY = 'blair_user';

function getStoredUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export const User = {
  // Returns the current user or null
  me() {
    return getStoredUser();
  },

  // Stub login — in production this triggers GitHub OAuth
  login() {
    const mockUser = {
      id: 'local-user',
      email: 'dev@blair.local',
      full_name: 'Blair Dev',
      role: 'admin',
    };
    localStorage.setItem(USER_KEY, JSON.stringify(mockUser));
    window.location.reload();
  },

  logout() {
    localStorage.removeItem(USER_KEY);
    window.location.reload();
  },

  // List stub — returns empty array until server is wired
  async list() {
    return [];
  },
};

export default User;
