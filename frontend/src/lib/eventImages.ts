export const eventImages: Record<number, string> = {
  1: 'https://images.pexels.com/photos/12074000/pexels-photo-12074000.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940',
  2: 'https://images.pexels.com/photos/8811238/pexels-photo-8811238.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940',
  3: 'https://images.pexels.com/photos/12618113/pexels-photo-12618113.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940',
  4: 'https://images.unsplash.com/photo-1619537903549-0981d6bca911?crop=entropy&cs=srgb&fm=jpg&q=85&w=940',
  5: 'https://images.pexels.com/photos/34611896/pexels-photo-34611896.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940',
  6: 'https://images.pexels.com/photos/31573145/pexels-photo-31573145.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940',
}

export const breadImage =
  'https://images.unsplash.com/photo-1549413468-cd78edb7e75c?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200'

export const bibleImage =
  'https://images.pexels.com/photos/8275630/pexels-photo-8275630.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940'

export function eventImage(id: number): string {
  return eventImages[id] || eventImages[3]
}
