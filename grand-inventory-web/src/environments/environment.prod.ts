export const environment = {
    production: true,
    // Production build talks to the backend directly (no dev proxy). The backend
    // must allow this origin via CORS, or be served behind the same origin.
    apiUrl: 'http://localhost:3000'
};
