export default function robots() {
    return {
      rules: {
        userAgent: '*',
        allow: '/',
        disallow: '/dashboard/', // Don't index the private dashboard
      },
      sitemap: 'https://thelab.critter.codes/sitemap.xml', // Replace with actual domain
    }
  }
