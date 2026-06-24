export const eventImages: Record<number, string> = {
  1: 'https://images.pexels.com/photos/12074000/pexels-photo-12074000.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940',
  2: 'https://images.pexels.com/photos/8811238/pexels-photo-8811238.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940',
  3: 'https://images.pexels.com/photos/12618113/pexels-photo-12618113.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940',
  4: 'https://images.unsplash.com/photo-1619537903549-0981d6bca911?crop=entropy&cs=srgb&fm=jpg&q=85&w=940',
  5: 'https://images.pexels.com/photos/34611896/pexels-photo-34611896.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940',
  6: 'https://images.pexels.com/photos/31573145/pexels-photo-31573145.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940',
}

const CAMP = eventImages[1]
const YOUTH = eventImages[2]
const CHURCH = eventImages[3]
const YOUTH_MEET = eventImages[4]
const WORSHIP = eventImages[5]
const KIDS = eventImages[6]

export const breadImage =
  'https://images.unsplash.com/photo-1549413468-cd78edb7e75c?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200'

export function eventImage(id: number): string {
  return eventImages[id] || eventImages[3]
}

// Pick a contextual image for a DB event by its type/category, with poster override.
export function imageForEvent(
  ev: { poster_url?: string | null; event_type?: string | null; category?: string | null },
  idx = 0
): string {
  if (ev.poster_url && ev.poster_url.startsWith('http')) return ev.poster_url
  const k = `${ev.event_type || ''} ${ev.category || ''}`.toLowerCase()
  if (/cop|kid/.test(k)) return KIDS
  if (/tab|camp/.test(k)) return CAMP
  if (/famil/.test(k)) return WORSHIP
  if (/tiner|youth/.test(k)) return idx % 2 === 0 ? YOUTH : YOUTH_MEET
  if (/conf/.test(k)) return WORSHIP
  if (/serv|service|dumin/.test(k)) return CHURCH
  const pool = [CHURCH, YOUTH, CAMP, WORSHIP, YOUTH_MEET, KIDS]
  return pool[idx % pool.length]
}

export function formatPrice(price: number | null | undefined): string {
  return !price || Number(price) === 0 ? 'Gratuit' : `${Number(price)} RON`
}
