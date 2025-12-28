import { auth } from "../../auth";
import Providers from "./providers";
import InstallPrompt from "./components/InstallPrompt";
import "./globals.css";

export const viewport = {
    themeColor: "#000000",
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
};

export default async function RootLayout({ children }) {
    const session = await auth();

    // ✅ Logging session and user details for debugging
    console.log("Session Data:", session);
    if (session?.user) {
        console.log("User Role:", session.user.role);
        console.log("User ID:", session.user.userID);
    } else {
        console.log("No session data or user found");
    }

    return (
        <html lang="en">
            <body>
                <Providers session={session}>
                    {children}
                    <InstallPrompt />
                </Providers>
            </body>
        </html>
    );
}
