const BASE = 'https://images.igdb.com/igdb/image/upload';

export const coverUrl = (id) => `${BASE}/t_cover_big/${id}.jpg`;
export const screenshotUrl = (id) => `${BASE}/t_screenshot_big/${id}.jpg`;
export const heroUrl = (id) => `${BASE}/t_1080p/${id}.jpg`;
