export default function manifest() {
  return {
    name: 'The Lab',
    short_name: 'The Lab',
    description: 'The Lab Community App',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#000000',
    theme_color: '#000000',
    icons: [
      {
        src: '/logos/icon.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/logos/icon.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  }
}
