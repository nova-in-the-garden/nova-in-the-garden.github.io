// Site-wide settings for the outside services Nova's Garden talks to.
// GoatCounter (visitor counts) is the owner's account; the dashboard has to allow
// "visitor counts on your website" for the public counter JSON to answer.
export const GOATCOUNTER = 'https://novasgarden.goatcounter.com';
// The Visitor Wall's Cloudflare Worker (see /wall-worker in Nova's workspace). Empty = the wall says "Opening soon".
export const WALL_API_URL = '';
// Cloudflare Turnstile site key for the wall's "are you human?" check (public; the secret lives in the Worker).
export const TURNSTILE_SITEKEY = '';
