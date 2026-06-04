export const authConfig = {
    pages: {
        signIn: '/auth/signin',
    },
    session: {
        strategy: 'jwt',
        maxAge: 30 * 24 * 60 * 60, // 30 days
        updateAge: 24 * 60 * 60, // Update session every 24 hours
    },
    providers: [],
    secret: process.env.AUTH_SECRET,
    callbacks: {
        authorized({ auth, request: nextUrl }) {
            const isLoggedIn = !!auth?.user;
            const isOnDashboard = nextUrl.pathname.startsWith('/dashboard');
            if (isOnDashboard) {
                if (isLoggedIn) return true;
                return false; // Redirect unauthenticated users to login page
            } else if (isLoggedIn) {
                // Optional: Redirect authenticated users to dashboard if they visit login page
                // return Response.redirect(new URL('/dashboard', nextUrl));
            }
            return true;
        },
    },
};
