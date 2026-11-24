export const CAMPUS_TIME_ZONE = 'Asia/Dhaka' as const;

export const CATEGORY_SEED = [
  { code: 'books_notes', name: 'Books & Notes' },
  { code: 'electronics', name: 'Electronics' },
  { code: 'stationery', name: 'Stationery' },
  { code: 'lab_equipment', name: 'Lab Equipment' },
  { code: 'furniture', name: 'Furniture' },
  { code: 'clothing', name: 'Clothing' },
  { code: 'sports', name: 'Sports' },
  { code: 'other', name: 'Other' },
] as const;

export const INITIAL_APPROVED_DOMAIN = 'seu.edu.bd' as const;

export const LISTING_TYPES = ['sell', 'donate', 'rent', 'exchange', 'free_borrowing'] as const;
export const LISTING_STATUSES = ['available', 'reserved', 'checked_out', 'completed', 'closed'] as const;
export const REQUEST_STATUSES = ['pending', 'accepted', 'declined', 'cancelled', 'checked_out', 'completed'] as const;
export const CONDITIONS = ['new', 'like_new', 'good', 'fair', 'poor'] as const;
export const USER_ROLES = ['member', 'admin'] as const;
export const VERIFICATION_STATUSES = ['unverified', 'verified'] as const;
